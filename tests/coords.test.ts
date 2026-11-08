// Colagem de coordenadas: regras puras (cliente e servidor usam o mesmo arquivo, lib/coords.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { isShortMapsLink, parseCoordinateFields, parseCoordinateText, parseSingleCoordinate, resolveShortLink } from "../lib/coords.ts";

const ok = (t: string) => { const r = parseCoordinateText(t); assert.ok(r.ok, `${t} -> ${JSON.stringify(r)}`); return r as { ok: true; lat: number; lng: number }; };
const BH = { lat: -19.916681, lng: -43.934493 };

test("decimal: os três exemplos do pedido e variações de separador", () => {
  for (const t of ["-19.916681, -43.934493", "-19,916681 -43,934493", "-19.916681,-43.934493", " -19,916681,  -43,934493 ", "-19.916681\n-43.934493", "-19.916681;-43.934493", "−19.916681, −43.934493", "lat: -19.916681 lng: -43.934493", "(-19.916681, -43.934493)"])
    assert.deepEqual({ lat: ok(t).lat, lng: ok(t).lng }, BH, t);
});

test("graus: N/S/L/O/E/W, com e sem segundos", () => {
  const a = ok(`19°55'00.0"S 43°56'04.2"W`);
  assert.ok(Math.abs(a.lat - -19.916667) < 1e-6 && Math.abs(a.lng - -43.934500) < 1e-6);
  assert.deepEqual({ lat: ok(`19°55'00.0"S 43°56'04.2"O`).lat, lng: ok(`19°55'00.0"S 43°56'04.2"O`).lng }, { lat: a.lat, lng: a.lng });
  assert.equal(ok("43°56'W 19°55'S").lat, ok("19°55'S 43°56'W").lat); // ordem invertida pelas letras
  assert.equal(ok("19.9167° S, 43.9345° W").lat, -19.9167);
  assert.equal(ok("19.916681 S, 43.934493 W").lng, -43.934493);
});

test("links do Google Maps: PIN exato, ?q=, @centro, /place/lat,lng", () => {
  const place = "https://www.google.com/maps/place/Igreja+Portais/@-19.9170,-43.9350,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d-19.916681!4d-43.934493!16s%2Fg%2F1";
  assert.deepEqual({ lat: ok(place).lat, lng: ok(place).lng }, BH); // !3d/!4d ganha do @
  assert.deepEqual({ lat: ok("https://maps.google.com/?q=-19.916681,-43.934493").lat, lng: ok("https://maps.google.com/?q=-19.916681,-43.934493").lng }, BH);
  assert.equal(ok("https://www.google.com/maps?q=loc:-19.916681+-43.934493").lng, -43.934493);
  assert.equal(ok("https://www.google.com/maps/@-19.916681,-43.934493,15z").lat, -19.916681);
  assert.equal(ok("https://www.google.com/maps/place/-19.916681,-43.934493").lng, -43.934493);
  assert.equal(ok("https://www.google.com/maps/dir//-19.916681,-43.934493/").lat, -19.916681);
  assert.equal(ok("www.google.com.br/maps/@-19.916681,-43.934493,15z").lat, -19.916681);
  assert.equal(ok(`https://www.google.com/maps/place/19°55'00.0"S+43°56'04.2"W`).lat, -19.916667);
});

test("erros claros em português", () => {
  const e = (t: string) => { const r = parseCoordinateText(t); assert.equal(r.ok, false); return (r as { error: string }).error; };
  assert.match(e("-95, -43"), /latitude precisa estar entre -90 e 90/);
  assert.match(e("-19, -190"), /longitude precisa estar entre -180 e 180/);
  assert.match(e("-43.93, -19.91".replace("-43.93", "-143.93")), /invertida|entre -90 e 90/);
  assert.match(e("abc"), /Não consegui entender/);
  assert.match(e("-19.9"), /Não consegui entender/);
  assert.match(e("https://example.com/maps/@-19.9,-43.9,15z"), /não parece ser do Google Maps/);
  assert.match(e("https://www.google.com/maps/place/Igreja+Portais"), /não traz as coordenadas/);
  assert.match(e(`19°75'00"S 43°56'04"W`), /menores que 60/);
});

test("campo único: ponto ou vírgula, espaços, graus, limites", () => {
  const v = (t: string, a: "lat" | "lng") => { const r = parseSingleCoordinate(t, a); assert.ok(r.ok, t); return (r as { value: number }).value; };
  assert.equal(v(" -19,916681 ", "lat"), -19.916681);
  assert.equal(v("-43.934493", "lng"), -43.934493);
  assert.equal(v("19.916681S", "lat"), -19.916681);
  assert.equal(v(`43°56'04.2"W`, "lng") < -43.93, true);
  for (const [t, a] of [["91", "lat"], ["-181", "lng"], ["", "lat"], ["-", "lat"], ["19.9N", "lng"], ["NaN", "lat"]] as const) assert.equal(parseSingleCoordinate(t, a).ok, false, `${t} ${a}`);
  assert.match((parseSingleCoordinate("91", "lat") as { error: string }).error, /entre -90 e 90/);
});

test("campos do formulário no servidor", () => {
  assert.deepEqual(parseCoordinateFields("", ""), { ok: true, lat: null, lng: null });
  assert.deepEqual(parseCoordinateFields("-19,916681", "-43,934493"), { ok: true, lat: -19.916681, lng: -43.934493 });
  assert.deepEqual(parseCoordinateFields("-19.916681, -43.934493", ""), { ok: true, lat: -19.916681, lng: -43.934493 }); // colou tudo num campo
  assert.equal(parseCoordinateFields("-19.9", "").ok, false);
  assert.equal(parseCoordinateFields("NaN", "-43").ok, false);
  assert.equal(parseCoordinateFields("95", "-43").ok, false);
});

test("link encurtado: só segue o Google, em https, e para se sair da lista", async () => {
  assert.equal(isShortMapsLink("https://maps.app.goo.gl/AbC123"), true);
  assert.equal(parseCoordinateText("https://maps.app.goo.gl/AbC123").ok, false);
  const calls: string[] = [];
  const good = (async (u: string) => { calls.push(u); return new Response(null, u.includes("goo.gl") ? { status: 302, headers: { location: "https://www.google.com/maps/place/X/@-19.9,-43.9,17z/data=!3d-19.916681!4d-43.934493" } } : { status: 200 }); }) as unknown as typeof fetch;
  const r = await resolveShortLink("https://maps.app.goo.gl/AbC123", good);
  assert.ok(r.ok && r.lat === -19.916681 && r.lng === -43.934493);
  const evil = (async (u: string) => { calls.push(u); return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } }); }) as unknown as typeof fetch;
  calls.length = 0;
  const r2 = await resolveShortLink("https://maps.app.goo.gl/AbC123", evil);
  assert.equal(r2.ok, false);
  assert.deepEqual(calls, ["https://maps.app.goo.gl/AbC123"]); // não consultou o endereço de fora
  assert.equal((await resolveShortLink("https://evil.example/x", good)).ok, false);
});
