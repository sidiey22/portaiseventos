// Datas são guardadas em ISO UTC. A igreja está em Belo Horizonte (America/Sao_Paulo, UTC-3, sem horário de verão).

export const TIME_ZONE = "America/Sao_Paulo";
const OFFSET = "-03:00";

/** Converte o valor de <input type="datetime-local"> ("2026-11-20T19:00") para ISO UTC. */
export function localInputToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00${OFFSET}`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Idade completa em anos na data `today`, a partir de "YYYY-MM-DD". Retorna null se inválida. */
export function ageOn(birthDate: string, today: Date): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const birth = new Date(Date.UTC(y, m - 1, d));
  if (birth.getUTCFullYear() !== y || birth.getUTCMonth() !== m - 1 || birth.getUTCDate() !== d) {
    return null;
  }
  // Data de "hoje" no fuso da igreja
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(today).split("-");
  const [ty, tm, td] = [Number(parts[0]), Number(parts[1]), Number(parts[2])];
  let age = ty - y;
  if (tm < m || (tm === m && td < d)) age--;
  return age < 0 ? null : age;
}

/** "2026-11-27" no fuso da igreja. */
export function dayKey(iso: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date(iso));
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
}

/** "Sexta, 27 de nov às 19:00" */
export function formatLong(iso: string): string {
  const parts = new Intl.DateTimeFormat("pt-BR", { timeZone: TIME_ZONE, weekday: "long", day: "numeric", month: "short" }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  let w = get("weekday");
  w = w.charAt(0).toUpperCase() + w.slice(1).replace("-feira", "");
  return `${w}, ${get("day")} de ${get("month").replace(".", "")} às ${formatTime(iso)}`;
}

export function formatRange(startsAt: string, endsAt: string | null): string {
  if (!endsAt) return formatLong(startsAt);
  if (dayKey(startsAt) === dayKey(endsAt)) return `${formatLong(startsAt)} até ${formatTime(endsAt)}`;
  return `${formatLong(startsAt)} até ${formatLong(endsAt).replace(" às ", ", ")}`;
}

/** ISO -> valor de <input type="datetime-local"> no horário de Brasília. */
export function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  return new Date(new Date(iso).getTime() - 3 * 3600_000).toISOString().slice(0, 16);
}

/** Dias do evento (no máximo 15), do início ao término. */
export function eventDays(startsAt: string, endsAt: string | null): string[] {
  const out: string[] = [];
  const end = dayKey(endsAt ?? startsAt);
  let t = new Date(`${dayKey(startsAt)}T12:00:00-03:00`).getTime();
  while (dayKey(new Date(t)) <= end && out.length < 15) {
    out.push(dayKey(new Date(t)));
    t += 86_400_000;
  }
  return out;
}

export function dayLabel(key: string): string {
  const [, m, d] = key.split("-");
  return `${d}/${m}`;
}

export function ageAt(birthDate: string, refKey: string): number | null {
  return ageOn(birthDate, new Date(`${refKey}T12:00:00-03:00`));
}
