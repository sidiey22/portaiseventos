/**
 * Leitura de coordenadas coladas pelo administrador. Roda no navegador e no servidor (mesma regra nos dois).
 * Aceita: "-19.916681, -43.934493", "-19,916681 -43,934493", graus (19°55'00.0"S 43°56'04.2"W, também com L/O)
 * e links do Google Maps. Links encurtados (maps.app.goo.gl) não são resolvidos aqui: veja `resolveShortLink`.
 */

export type PairResult = { ok: true; lat: number; lng: number } | { ok: false; error: string; short?: string };
export type SingleResult = { ok: true; value: number } | { ok: false; error: string };

export const LAT_ERROR = "A latitude precisa estar entre -90 e 90.";
export const LNG_ERROR = "A longitude precisa estar entre -180 e 180.";
const NOT_UNDERSTOOD = "Não consegui entender essas coordenadas. Exemplo: -19.916681, -43.934493";

type Axis = "lat" | "lng";
const axisOf = (d: string): Axis => ("NS".includes(d) ? "lat" : "lng");
const isNegativeDir = (d: string) => "SWO".includes(d);
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** Troca sinais e aspas "bonitos" (copiados de sites e do Word) pelos comuns e junta os espaços. */
function clean(t: unknown): string {
  return String(t ?? "")
    .replace(/[−‒–—]/g, "-")
    .replace(/[º˚]/g, "°")
    .replace(/[′’‘´`]/g, "'")
    .replace(/[″”“]/g, '"')
    .replace(/''/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}
const num = (s: string) => Number(s.replace(",", "."));

/** Confere os limites e devolve o par arredondado (6 casas, cerca de 10 cm). */
export function checkPair(lat: number, lng: number): PairResult {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false, error: NOT_UNDERSTOOD };
  if (Math.abs(lat) > 90) {
    const swapped = Math.abs(lng) <= 90 && Math.abs(lat) <= 180;
    return { ok: false, error: swapped ? `${LAT_ERROR} Parece que a ordem está invertida: a latitude vem primeiro.` : LAT_ERROR };
  }
  if (Math.abs(lng) > 180) return { ok: false, error: LNG_ERROR };
  return { ok: true, lat: round6(lat), lng: round6(lng) };
}

type Tok = { value: number; axis?: Axis };

function assign(toks: Tok[]): PairResult {
  if (toks.length !== 2) return { ok: false, error: NOT_UNDERSTOOD };
  const [a, b] = toks as [Tok, Tok];
  let lat: number, lng: number;
  if (a.axis && b.axis) {
    if (a.axis === b.axis) return { ok: false, error: "Informe uma latitude e uma longitude (N/S e L/O ou E/W)." };
    [lat, lng] = a.axis === "lat" ? [a.value, b.value] : [b.value, a.value];
  } else if (a.axis || b.axis) {
    if ((a.axis ?? (b.axis === "lat" ? "lng" : "lat")) === "lat") [lat, lng] = [a.value, b.value]; else [lat, lng] = [b.value, a.value];
  } else [lat, lng] = [a.value, b.value];
  return checkPair(lat, lng);
}

const DMS = /(-)?\s*([NSEWLO])?\s*(\d{1,3}(?:[.,]\d+)?)\s*°\s*(?:(\d{1,2}(?:[.,]\d+)?)\s*'\s*)?(?:(\d{1,2}(?:[.,]\d+)?)\s*"\s*)?([NSEWLO])?(?![A-Za-z])/gi;

function parseDegrees(t: string): PairResult {
  const toks: Tok[] = [];
  for (const m of t.matchAll(DMS)) {
    const [, minus, pre, deg, min, sec, post] = m;
    const dir = (post || pre || "").toUpperCase();
    const mm = min ? num(min) : 0, ss = sec ? num(sec) : 0;
    if (mm >= 60 || ss >= 60) return { ok: false, error: "Minutos e segundos precisam ser menores que 60." };
    let v = num(deg!) + mm / 60 + ss / 3600;
    if (minus || (dir && isNegativeDir(dir))) v = -v;
    toks.push({ value: v, axis: dir ? axisOf(dir) : undefined });
  }
  return assign(toks);
}

function parseDecimals(t: string): PairResult {
  const toks: Tok[] = [];
  for (const m of t.matchAll(/[-+]?\d+(?:[.,]\d+)?/g)) {
    const before = t.slice(0, m.index), after = t.slice(m.index! + m[0].length);
    const dir = (/^\s*°?\s*([NSEWLO])(?![A-Za-z])/i.exec(after)?.[1] ?? /(?:^|[^A-Za-z])([NSEWLO])\s*$/i.exec(before)?.[1] ?? "").toUpperCase();
    let v = num(m[0]);
    if (dir && isNegativeDir(dir) && v > 0) v = -v;
    toks.push({ value: v, axis: dir ? axisOf(dir) : undefined });
  }
  return assign(toks);
}

const SHORT = /^(?:https?:\/\/)?(?:maps\.app\.goo\.gl\/|goo\.gl\/maps\/)[\w-]+/i;
export const isShortMapsLink = (text: string) => SHORT.test(clean(text));

const GMAPS_HOST = /^(?:[\w-]+\.)*(?:google\.[a-z]{2,3}(?:\.[a-z]{2})?|goo\.gl)$/i;
const NUM = "-?\\d{1,3}(?:\\.\\d+)?";

function parseUrl(raw: string): PairResult {
  let url: URL;
  try { url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`); } catch { return { ok: false, error: NOT_UNDERSTOOD }; }
  if (!GMAPS_HOST.test(url.hostname) || !/maps/i.test(url.hostname + url.pathname)) return { ok: false, error: "Esse link não parece ser do Google Maps." };
  let full = url.pathname + url.search + url.hash;
  try { full = decodeURIComponent(full); } catch { /* mantém o texto como veio */ }
  // 1) o PIN exato (!3d lat !4d lng) vale mais que o centro da tela (@lat,lng)
  const pin = new RegExp(`!3d(${NUM})!4d(${NUM})`).exec(full);
  if (pin) return checkPair(Number(pin[1]), Number(pin[2]));
  // 2) parâmetros ?q= ?ll= ?query= ?destination= ...
  for (const k of ["q", "ll", "query", "destination", "daddr", "center", "sll"]) {
    const v = url.searchParams.get(k);
    const m = v && new RegExp(`^\\s*(?:loc:)?\\s*(${NUM})\\s*[,\\s]\\s*(${NUM})\\s*$`).exec(v);
    if (m) return checkPair(Number(m[1]), Number(m[2]));
  }
  // 3) /place/lat,lng  /search/lat,lng  /dir//lat,lng
  const seg = new RegExp(`/(${NUM}),\\s*\\+?(${NUM})(?:[/?#]|$)`).exec(full);
  if (seg) return checkPair(Number(seg[1]), Number(seg[2]));
  // 4) @lat,lng,zoom (centro do mapa)
  const at = new RegExp(`@(${NUM}),(${NUM})`).exec(full);
  if (at) return checkPair(Number(at[1]), Number(at[2]));
  // 5) endereço em graus dentro do caminho: /place/19°55'00.0"S+43°56'04.2"W
  if (full.includes("°")) { const r = parseDegrees(clean(full.replace(/\+/g, " "))); if (r.ok) return r; }
  return { ok: false, error: "Esse link não traz as coordenadas. No Google Maps, clique com o botão direito no local e copie os números que aparecem no topo do menu." };
}

/** Lê "lat, lng" em qualquer um dos formatos aceitos, ou um link do Google Maps. */
export function parseCoordinateText(text: unknown): PairResult {
  const t = clean(text);
  if (!t) return { ok: false, error: "Cole as coordenadas ou o link do Google Maps." };
  if (SHORT.test(t)) return { ok: false, error: "Link encurtado: buscando as coordenadas.", short: t };
  if (/^(?:https?:\/\/|www\.)/i.test(t) || /(?:google\.[a-z.]+\/maps|maps\.google\.)/i.test(t)) return parseUrl(t);
  return t.includes("°") ? parseDegrees(t) : parseDecimals(t);
}

/** Lê um valor só (um campo): decimal com ponto ou vírgula, ou graus. `axis` define o limite (90 ou 180). */
export function parseSingleCoordinate(text: unknown, axis: Axis): SingleResult {
  const t = clean(text);
  const limit = axis === "lat" ? 90 : 180, err = axis === "lat" ? LAT_ERROR : LNG_ERROR;
  if (!t) return { ok: false, error: axis === "lat" ? "Informe a latitude." : "Informe a longitude." };
  let v: number | null = null;
  if (t.includes("°")) {
    const m = new RegExp(DMS.source, "i").exec(t);
    if (m && m[0].trim().length === t.length) {
      const [, minus, pre, deg, min, sec, post] = m;
      const dir = (post || pre || "").toUpperCase();
      if (dir && axisOf(dir) !== axis) return { ok: false, error: axis === "lat" ? "A latitude usa N ou S." : "A longitude usa L, O, E ou W." };
      const mm = min ? num(min) : 0, ss = sec ? num(sec) : 0;
      if (mm >= 60 || ss >= 60) return { ok: false, error: "Minutos e segundos precisam ser menores que 60." };
      v = num(deg!) + mm / 60 + ss / 3600;
      if (minus || (dir && isNegativeDir(dir))) v = -v;
    }
  } else {
    const m = /^([NSEWLO])?\s*([-+]?\d+(?:[.,]\d+)?)\s*([NSEWLO])?$/i.exec(t);
    if (m) {
      const dir = (m[3] || m[1] || "").toUpperCase();
      if (dir && axisOf(dir) !== axis) return { ok: false, error: axis === "lat" ? "A latitude usa N ou S." : "A longitude usa L, O, E ou W." };
      v = num(m[2]!);
      if (dir && isNegativeDir(dir) && v > 0) v = -v;
    }
  }
  if (v === null || !Number.isFinite(v)) return { ok: false, error: "Número inválido. Exemplo: -19.916681" };
  if (Math.abs(v) > limit) return { ok: false, error: err };
  return { ok: true, value: round6(v) };
}

export type FieldsResult = { ok: true; lat: number | null; lng: number | null } | { ok: false; error: string };

/**
 * Valida os dois campos como chegam do formulário (usado no servidor). Ambos vazios = sem mapa.
 * Se a pessoa colou "lat, lng" inteiro num campo só e o outro está vazio, também vale.
 */
export function parseCoordinateFields(latRaw: unknown, lngRaw: unknown): FieldsResult {
  const la = clean(latRaw), ln = clean(lngRaw);
  if (!la && !ln) return { ok: true, lat: null, lng: null };
  if (la && !ln || !la && ln) {
    const p = parseCoordinateText(la || ln);
    if (p.ok) return { ok: true, lat: p.lat, lng: p.lng };
    return { ok: false, error: "Informe a latitude e a longitude juntas, ou deixe as duas vazias." };
  }
  const a = parseSingleCoordinate(la, "lat");
  if (!a.ok) return a;
  const b = parseSingleCoordinate(ln, "lng");
  if (!b.ok) return b;
  return { ok: true, lat: a.value, lng: b.value };
}

/** Hosts que o servidor pode consultar para abrir um link encurtado do Google Maps, e só eles. */
const SHORT_HOSTS = new Set(["maps.app.goo.gl", "goo.gl", "www.google.com", "google.com", "www.google.com.br", "google.com.br", "maps.google.com"]);

/**
 * Segue (no máximo 4 vezes) o redirecionamento de um link encurtado do Google Maps e lê as coordenadas do endereço final.
 * Segurança: só https, só hosts do Google da lista acima em cada passo, sem enviar cookies, com tempo limite;
 * nunca segue para outro endereço. `fetchImpl` existe para teste.
 */
export async function resolveShortLink(text: string, fetchImpl: typeof fetch = fetch): Promise<PairResult> {
  const t = clean(text);
  if (!SHORT.test(t)) return { ok: false, error: "Esse não é um link encurtado do Google Maps." };
  let url = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
  for (let hop = 0; hop < 4; hop++) {
    if (url.protocol !== "https:" || !SHORT_HOSTS.has(url.hostname)) break;
    const r = await fetchImpl(url.toString(), { method: "GET", redirect: "manual", credentials: "omit", signal: AbortSignal.timeout(5000), headers: { "user-agent": "Mozilla/5.0 (compatible; PortaisEventos)" } }).catch(() => null);
    const loc = r?.headers.get("location");
    if (!r || !loc || r.status < 300 || r.status > 399) break;
    let next: URL;
    try { next = new URL(loc, url); } catch { break; }
    const found = parseCoordinateText(next.toString());
    if (found.ok) return found;
    url = next;
  }
  return { ok: false, error: "Não consegui abrir esse link encurtado. Abra o link no Google Maps, copie o endereço completo da barra do navegador (ou as coordenadas) e cole aqui." };
}
