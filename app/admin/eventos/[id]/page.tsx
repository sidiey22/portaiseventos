import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { sb, unwrap } from "@/lib/supabase";
import { expireStale, getAvailability, getEventById, getLots, seatsTaken, type RegistrationRow } from "@/lib/registration";
import { formatCpf } from "@/lib/cpf";
import { formatBRL, formatDateTime } from "@/lib/time";
import { addLotAction, addSessionAction, removeLotAction, removeSessionAction, setCapacityAction, setStatusAction } from "../../actions";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { draft: "Rascunho", published: "Publicado", closed: "Encerrado" };
const REG_STATUS: Record<string, string> = {
  confirmed: "Confirmada", pending: "Aguardando pagamento", waitlist: "Fila de espera", cancelled: "Cancelada", expired: "Expirada",
};

export default async function AdminEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  await requireRole("admin");
  const { id } = await params;
  const { erro } = await searchParams;
  await expireStale();

  const event = Number.isInteger(Number(id)) ? await getEventById(Number(id)) : null;
  if (!event) notFound();

  const lots = await getLots(event.id);
  const sessions = unwrap(await sb().from("event_sessions").select("id, name, starts_at").eq("event_id", event.id).order("starts_at")) as {
    id: number; name: string; starts_at: string;
  }[];
  const regs = (
    unwrap(
      await sb().from("registrations").select("*, event_sessions(name)").eq("event_id", event.id).order("created_at", { ascending: false }),
    ) as (RegistrationRow & { event_sessions: { name: string } | null })[]
  ).map((r) => ({ ...r, session_name: r.event_sessions?.name ?? null }));

  const a = await getAvailability(event);
  const taken = await seatsTaken(event.id);
  const confirmed = regs.filter((r) => r.status === "confirmed");
  const revenue = confirmed.reduce((sum, r) => sum + r.price_cents, 0);
  const waitlist = regs.filter((r) => r.status === "waitlist").length;
  const publicLink = `/eventos/${event.slug}`;

  return (
    <>
      <p><Link href="/admin">← Eventos</Link></p>
      <h1>{event.name}</h1>
      <p className="muted">{formatDateTime(event.starts_at)} · {event.location} · {event.kind === "paid" ? "Pago" : "Gratuito"}</p>
      {erro && <div className="alert" role="alert">{erro}</div>}

      <div className="stats">
        <div><strong>{confirmed.length}</strong><span className="muted">confirmados</span></div>
        <div><strong>{taken} / {event.capacity}</strong><span className="muted">vagas ocupadas</span></div>
        <div><strong>{waitlist}</strong><span className="muted">na fila</span></div>
        {event.kind === "paid" && <div><strong>{formatBRL(revenue)}</strong><span className="muted">arrecadado</span></div>}
      </div>

      <div className="card" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <span className="badge">{STATUS[event.status]}</span>
        {event.status !== "published" && (
          <form action={setStatusAction}>
            <input type="hidden" name="eventId" value={event.id} />
            <input type="hidden" name="status" value="published" />
            <button type="submit">Publicar inscrições</button>
          </form>
        )}
        {event.status === "published" && (
          <>
            <form action={setStatusAction}>
              <input type="hidden" name="eventId" value={event.id} />
              <input type="hidden" name="status" value="closed" />
              <button type="submit" className="secondary">Encerrar inscrições</button>
            </form>
            <Link href={publicLink}>Ver página pública</Link>
          </>
        )}
        {!a.open && event.status === "published" && <span className="badge warn">Esgotado: novas inscrições vão para a fila</span>}
      </div>

      <h2>Vagas</h2>
      <form action={setCapacityAction} style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
        <input type="hidden" name="eventId" value={event.id} />
        <label style={{ maxWidth: 200 }}>
          Total de vagas
          <input name="capacity" type="number" min={1} defaultValue={event.capacity} required />
        </label>
        <button type="submit" className="secondary">Salvar</button>
      </form>

      {event.kind === "paid" && (
        <>
          <h2>Lotes de preço</h2>
          <p className="muted">O lote vigente é o primeiro da lista que ainda tem vagas e não passou da data. Quem já pagou mantém o preço pago.</p>
          {lots.length > 0 && (
            <div className="card table-scroll">
              <table>
                <thead><tr><th>#</th><th>Lote</th><th>Preço</th><th>Vagas</th><th>Até</th><th /></tr></thead>
                <tbody>
                  {lots.map((l) => (
                    <tr key={l.id}>
                      <td>{l.position}</td>
                      <td>{l.name} {a.lot?.id === l.id && <span className="badge ok">vigente</span>}</td>
                      <td>{formatBRL(l.price_cents)}</td>
                      <td>{l.quantity}</td>
                      <td>{l.ends_at ? formatDateTime(l.ends_at) : "—"}</td>
                      <td>
                        <form action={removeLotAction}>
                          <input type="hidden" name="eventId" value={event.id} />
                          <input type="hidden" name="lotId" value={l.id} />
                          <button type="submit" className="secondary">Remover</button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <form action={addLotAction} className="stack card" style={{ marginTop: 12 }}>
            <input type="hidden" name="eventId" value={event.id} />
            <div className="row">
              <label>Nome do lote<input name="name" placeholder="1º lote" required /></label>
              <label>Preço (R$)<input name="price" inputMode="decimal" placeholder="50,00" required /></label>
            </div>
            <div className="row">
              <label>Vagas no lote<input name="quantity" type="number" min={1} required /></label>
              <label>Vale até (opcional)<input name="endsAt" type="datetime-local" /></label>
            </div>
            <button type="submit">Adicionar lote</button>
          </form>
        </>
      )}

      <h2>Sessões</h2>
      <p className="muted">Use quando o evento tem mais de um horário ou dia. A pessoa escolhe a sessão ao se inscrever.</p>
      {sessions.length > 0 && (
        <div className="card table-scroll">
          <table>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{formatDateTime(s.starts_at)}</td>
                  <td>
                    <form action={removeSessionAction}>
                      <input type="hidden" name="eventId" value={event.id} />
                      <input type="hidden" name="sessionId" value={s.id} />
                      <button type="submit" className="secondary">Remover</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form action={addSessionAction} className="stack card" style={{ marginTop: 12 }}>
        <input type="hidden" name="eventId" value={event.id} />
        <div className="row">
          <label>Nome da sessão<input name="name" placeholder="Sábado à noite" required /></label>
          <label>Data e hora<input name="startsAt" type="datetime-local" required /></label>
        </div>
        <button type="submit">Adicionar sessão</button>
      </form>

      <h2>Inscritos ({regs.length})</h2>
      {regs.length === 0 ? (
        <p className="muted">Ninguém se inscreveu ainda.</p>
      ) : (
        <div className="card table-scroll">
          <table>
            <thead>
              <tr><th>Nome</th><th>Contato</th><th>CPF</th><th>Situação</th><th>Sessão</th><th>Valor</th></tr>
            </thead>
            <tbody>
              {regs.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>
                    {r.email}
                    <br />
                    {r.phone}
                    {r.guardian_phone && <><br /><span className="muted">Responsável: {r.guardian_phone}</span></>}
                  </td>
                  <td>{formatCpf(r.cpf)}</td>
                  <td>{REG_STATUS[r.status]}</td>
                  <td>{r.session_name ?? "—"}</td>
                  <td>{event.kind === "paid" ? formatBRL(r.price_cents) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
