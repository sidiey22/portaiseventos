import Link from "next/link";
import { redirect } from "next/navigation";
import { checkinEventIds, managedEventIds, requireStaff } from "@/lib/staff";
import { db, unwrap } from "@/lib/supabase";
import { dayKey, formatBRL, formatDate } from "@/lib/time";

type Stat = { id: number; name: string; starts_at: string; ends_at: string | null; kind: string; status: string; capacity: number; tickets: number; waitlist: number; revenue: number; checkins: number };
const STATUS: Record<string, string> = { draft: "Rascunho", published: "Publicado", closed: "Encerrado" };

export default async function StaffHome({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const { ok } = await searchParams;
  const s = await requireStaff();
  const managed = await managedEventIds(s);
  if (managed !== "all" && !managed.length) {
    const ck = await checkinEventIds(s);
    if (ck === "all" || ck.length) redirect("/equipe/checkin");
    return <><h1>Olá, {s.name}</h1><p className="card">Você ainda não foi convidado(a) para nenhum evento. Quando um administrador ou gerente te adicionar pelo email {s.email}, o acesso aparece aqui.</p></>;
  }
  let stats: Stat[];
  if (s.isAdmin) stats = (unwrap(await db().rpc("admin_event_stats", { p_user: s.id })) as Stat[]).map((r) => ({ ...r, tickets: Number(r.tickets), waitlist: Number(r.waitlist), revenue: Number(r.revenue), checkins: Number(r.checkins) }));
  else stats = await managerStats(managed as number[]);
  const staff = unwrap(await db().from("event_staff").select("event_id, email").eq("role", "manager")) as { event_id: number; email: string }[];
  const tot = stats.reduce((a, r) => ({ t: a.t + r.tickets, r: a.r + r.revenue, c: a.c + r.checkins, w: a.w + r.waitlist }), { t: 0, r: 0, c: 0, w: 0 });

  return (
    <>
      <div className="actions" style={{ justifyContent: "space-between" }}>
        <div><p className="eyebrow">{s.isAdmin ? "Administrador" : "Gerente de evento"}</p><h1 style={{ margin: 0 }}>{s.isAdmin ? "Visão geral" : "Meus eventos"}</h1></div>
        {s.isAdmin && <Link className="btn" href="/equipe/eventos/novo">Novo evento</Link>}
      </div>
      {ok && <div className="okbox flash" role="status" style={{ marginTop: 14 }}>{ok}</div>}
      <div className="kpis">
        <div className="kpi"><span className="muted small">Arrecadado</span><strong>{formatBRL(tot.r)}</strong></div>
        <div className="kpi"><span className="muted small">Inscritos</span><strong>{tot.t}</strong></div>
        <div className="kpi"><span className="muted small">Check-ins</span><strong>{tot.c}</strong></div>
        <div className="kpi"><span className="muted small">Na fila</span><strong>{tot.w}</strong></div>
      </div>
      {stats.length ? (
        <div className="card table-scroll"><table>
          <thead><tr><th>Evento</th><th>Datas</th><th>Status</th><th>Inscritos</th><th>Check-ins</th><th>Fila</th><th>Arrecadado</th><th>Gerentes</th><th /></tr></thead>
          <tbody>{stats.map((r) => (
            <tr key={r.id}>
              <td><Link href={`/equipe/eventos/${r.id}`}>{r.name}</Link></td>
              <td>{formatDate(r.starts_at)}{r.ends_at && dayKey(r.ends_at) !== dayKey(r.starts_at) ? ` a ${formatDate(r.ends_at)}` : ""}</td>
              <td><span className="badge">{STATUS[r.status]}</span></td>
              <td className="num">{r.tickets} / {r.capacity}</td><td className="num">{r.checkins}</td><td className="num">{r.waitlist}</td>
              <td className="num">{r.kind === "paid" ? formatBRL(r.revenue) : "Gratuito"}</td>
              <td className="small">{staff.filter((x) => x.event_id === r.id).map((x) => <div key={x.email}>{x.email}</div>)}</td>
              <td><Link className="btn sec sm" href={`/equipe/eventos/${r.id}?aba=editar`}>Editar</Link></td>
            </tr>
          ))}</tbody>
        </table></div>
      ) : <p className="card">Nenhum evento ainda. {s.isAdmin && <Link href="/equipe/eventos/novo">Crie o primeiro.</Link>}</p>}
    </>
  );
}

async function managerStats(ids: number[]): Promise<Stat[]> {
  const events = unwrap(await db().from("events").select("id, name, starts_at, ends_at, kind, status, capacity").in("id", ids).order("starts_at", { ascending: false })) as Omit<Stat, "tickets" | "waitlist" | "revenue" | "checkins">[];
  return Promise.all(events.map(async (e) => {
    const orders = unwrap(await db().from("orders").select("status, ticket_count, total_cents").eq("event_id", e.id)) as { status: string; ticket_count: number; total_cents: number }[];
    const { count } = await db().from("checkins").select("ticket_id, tickets!inner(event_id)", { count: "exact", head: true }).eq("tickets.event_id", e.id);
    return { ...e, tickets: orders.filter((o) => o.status === "confirmed").reduce((a, o) => a + o.ticket_count, 0), waitlist: orders.filter((o) => o.status === "waitlist").reduce((a, o) => a + o.ticket_count, 0),
      revenue: orders.filter((o) => o.status === "confirmed").reduce((a, o) => a + o.total_cents, 0), checkins: count ?? 0 };
  }));
}
