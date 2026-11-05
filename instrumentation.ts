// Ao iniciar o servidor (Hostinger), roda a cada minuto: envia ingressos pendentes e avisa quem saiu da fila.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.SUPABASE_URL || process.env.NEXT_PHASE === "phase-production-build") return;
  const { runJobs } = await import("./lib/notify");
  const tick = () => runJobs().catch((e) => console.error("Rotina de emails:", e));
  setTimeout(tick, 15_000);
  setInterval(tick, 60_000);
}
