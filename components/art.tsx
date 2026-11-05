import { bannerUrl } from "@/lib/events";
import { dayKey, formatDate } from "@/lib/time";
import type { EventRow } from "@/lib/types";

const PALETTES = [["#17120a", "#3b2c08", "#ffee8c"], ["#1a0c09", "#5b1d10", "#ffb877"], ["#0c0b14", "#2a2346", "#d6c9ff"], ["#0d1322", "#2f4170", "#ffe2a8"], ["#0f140c", "#33421f", "#eef3a2"]];
const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function wrapTitle(name: string): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const w of name.toUpperCase().split(/\s+/)) {
    if ((cur + " " + w).trim().length > 12 && cur) { lines.push(cur); cur = w; } else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

/** Banner automático (16:9) com os arcos do portal, usado quando o evento ainda não tem arte enviada. */
function bannerSvg(e: EventRow): string {
  const p = PALETTES[e.id % PALETTES.length]!, gid = `g${e.id}`, lines = wrapTitle(e.name);
  const longest = Math.max(...lines.map((l) => l.length), 1);
  const fs = Math.round(Math.min(lines.length > 2 ? 110 : 132, 800 / (longest * 0.74))), y0 = 470 - (lines.length - 1) * fs * 0.5;
  let arches = "";
  for (let i = 0; i < 5; i++) {
    const r = (280 + i * 100) / 2, cx = 1240, top = 150 + i * 6;
    arches += `<path d="M${cx - r} 900 V${top + r} A${r} ${r} 0 0 1 ${cx + r} ${top + r} V900" fill="none" stroke="${p[2]}" stroke-width="${i ? 3 : 6}" opacity="${(0.85 - i * 0.16).toFixed(2)}"/>`;
  }
  const multi = e.ends_at && dayKey(e.ends_at) !== dayKey(e.starts_at);
  const date = formatDate(e.starts_at).slice(0, 5) + (multi ? ` A ${formatDate(e.ends_at!).slice(0, 5)}` : "");
  return `<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Banner do evento ${esc(e.name)}"><defs><linearGradient id="${gid}b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p[0]}"/><stop offset="1" stop-color="${p[1]}"/></linearGradient><radialGradient id="${gid}r" cx="1240" cy="520" r="520" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${p[2]}" stop-opacity=".55"/><stop offset="1" stop-color="${p[2]}" stop-opacity="0"/></radialGradient></defs><rect width="1600" height="900" fill="url(#${gid}b)"/><rect width="1600" height="900" fill="url(#${gid}r)"/>${arches}<text x="110" y="${y0 - fs * 0.95}" fill="${p[2]}" font-family="Montserrat, sans-serif" font-weight="700" font-size="40" letter-spacing="8">${esc(date)} · ${e.kind === "free" ? "ENTRADA GRATUITA" : "INSCRIÇÕES ABERTAS"}</text>${lines.map((l, i) => `<text x="104" y="${y0 + i * fs}" fill="#fbfaf4" font-family="Montserrat, sans-serif" font-weight="800" font-size="${fs}" letter-spacing="2">${esc(l)}</text>`).join("")}<text x="110" y="800" fill="#fbfaf4" opacity=".8" font-family="Montserrat, sans-serif" font-weight="700" font-size="34" letter-spacing="10">PORTAIS ETERNOS</text></svg>`;
}

export function Art({ event }: { event: EventRow }) {
  const url = bannerUrl(event.banner_path);
  if (url) return <div className="art">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={url} alt={`Banner do evento ${event.name}`} /></div>;
  return <div className="art" dangerouslySetInnerHTML={{ __html: bannerSvg(event) }} />;
}
