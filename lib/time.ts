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
