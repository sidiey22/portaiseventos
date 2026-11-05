import Link from "next/link";
import { checkinEventIds, requireStaff } from "@/lib/staff";
import { db, unwrap } from "@/lib/supabase";
import { dayKey, dayLabel, eventDays, formatTime } from "@/lib/time";
import { checkInAction } from "./actions";
import { Scanner } from "./scanner";

export const dynamic = "force-dynamic";

async function manualCheckin(d: FormData): Promise<void> {
  "use server";
  await checkInAction(Number(d.get("eventId")), String(d.get("code") ?? ""));
  const { redirect } = await import("next/navigation");
  redirect(`/equipe/checkin?evento=${Number(d.get("eventId"))}&busca=${encodeURIComponent(String(d.get("busca") ?? ""))}`);
}

export default async function CheckinPage({ searchParams }: { searchParams: Promise<{ evento?: string; busca?: string }> }) {
  const s = await requireStaff();
  const sp = await searchParams;
  const ids = await checkinEventIds(s);
  let q = db().from("events").select("id, name, starts_at, ends_at").neq("status", "draft").order("starts_at");
  if (ids !== "all") q = q.in("id", ids.length ? ids : [0]);
  const events = unwrap(await q) as { id: number; name: string; starts_at: string; ends_at: string | null }[];
  if (!events.length) return <><p className="eyebrow">Credenciamento</p><h1>Check-in</h1><p className="card">Você ainda não foi convidado(a) para o check-in de nenhum evento.</p></>;
  const e = events.find((x) => x.id === Number(sp.evento)) ?? events.find((x) => (x.ends_at ?? x.starts_at) >= new Date().toISOString()) ?? events.at(-1)!;
  const days = eventDays(e.starts_at, e.ends_at), today = dayKey(new Date()), isDay = days.includes(today);
  const list = unwrap(await db().rpc("checkin_list", { p_user: s.id, p_event: e.id, p_day: today })) as { ticket_code: string; name: string; checked_at: string | null }[];
  const busca = (sp.busca ?? "").trim();
  const norm = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const shown = busca ? list.filter((t) => norm(t.name).includes(norm(busca))) : list;
  const inn = list.filter((t) => t.checked_at).length, pct = list.length ? Math.round((inn / list.length) * 100) : 0;
  return (
    <>
      <p className="eyebrow">Credenciamento</p><h1>Check-in</h1>
      <form className="card actions" method="get" style={{ margin: "14px 0", alignItems: "end" }}>
        <label htmlFor="ck-ev" style={{ flex: 1, minWidth: 220 }}>Evento<select id="ck-ev" name="evento" defaultValue={e.id}>{events.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <button className="btn sec" type="submit">Trocar</button>
      </form>
      {!isDay && <div className="notice">Hoje não é dia deste evento ({days.map(dayLabel).join(", ")}). O check-in só funciona nos dias do evento.</div>}
      <p style={{ margin: 0 }}><strong>{inn} de {list.length}</strong> entraram hoje{days.length > 1 ? ` (dia ${days.indexOf(today) + 1} de ${days.length})` : ""}</p>
      <div className="progress" aria-hidden="true"><i style={{ width: `${pct}%` }} /></div>
      <h2>Ler QR code</h2>
      <Scanner eventId={e.id} />
      <h2>Buscar por nome</h2>
      <form method="get" className="actions" style={{ alignItems: "end" }}>
        <input type="hidden" name="evento" value={e.id} />
        <label htmlFor="ck-q" style={{ flex: 1, maxWidth: 360 }}>Nome do participante<input id="ck-q" name="busca" type="search" defaultValue={busca} /></label>
        <button className="btn sec" type="submit">Buscar</button>{busca && <Link className="btn sec" href={`/equipe/checkin?evento=${e.id}`}>Limpar</Link>}
      </form>
      <div style={{ marginTop: 12 }}>
        {shown.length ? (
          <div className="card table-scroll"><table><thead><tr><th>Participante</th><th /></tr></thead><tbody>
            {shown.slice(0, 200).map((t) => (
              <tr key={t.ticket_code}><td>{t.name}</td><td>{t.checked_at ? <span className="badge ok">Entrou às {formatTime(t.checked_at)}</span> : isDay ? (
                <form action={manualCheckin}><input type="hidden" name="eventId" value={e.id} /><input type="hidden" name="code" value={t.ticket_code} /><input type="hidden" name="busca" value={busca} /><button className="btn sm" type="submit">Confirmar entrada</button></form>
              ) : <span className="muted small">—</span>}</td></tr>
            ))}
          </tbody></table></div>
        ) : <p className="card muted">Ninguém encontrado.</p>}
      </div>
      <p className="small muted">O credenciamento vê só o nome e a entrada de cada participante. Sem telefone, email, CPF ou valores.</p>
    </>
  );
}
