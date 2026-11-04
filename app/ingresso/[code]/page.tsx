import { notFound } from "next/navigation";
import { sb, unwrap } from "@/lib/supabase";
import { expireStale, findByCode, getEventById } from "@/lib/registration";
import { qrDataUrl } from "@/lib/mail";
import { formatBRL, formatDateTime, formatTime } from "@/lib/time";
import { simulatePayment } from "./actions";

export const dynamic = "force-dynamic";

export default async function TicketPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  await expireStale();
  const reg = await findByCode(code);
  if (!reg) notFound();
  const event = await getEventById(reg.event_id);
  if (!event) notFound();
  const session = reg.session_id
    ? ((unwrap(await sb().from("event_sessions").select("name, starts_at").eq("id", reg.session_id).maybeSingle()) as { name: string; starts_at: string } | null) ?? undefined)
    : undefined;

  const canSimulate = process.env.NODE_ENV !== "production" && !process.env.MERCADOPAGO_ACCESS_TOKEN;

  return (
    <div style={{ maxWidth: 480 }} className="ticket">
      <h1>{event.name}</h1>
      <p className="muted">
        {formatDateTime(event.starts_at)} · {event.location}
        {session && (
          <>
            <br />
            Sessão: {session.name} ({formatDateTime(session.starts_at)})
          </>
        )}
      </p>
      <p><strong>{reg.name}</strong></p>

      {reg.status === "confirmed" && (
        <>
          <span className="badge ok">Inscrição confirmada</span>
          <p>
            <img src={await qrDataUrl(reg.code)} alt="QR code do seu ingresso" />
          </p>
          <p className="muted">Apresente este QR code na entrada. Também enviamos uma cópia para {reg.email}.</p>
          {reg.checked_in_at && <p className="badge">Presença registrada</p>}
        </>
      )}

      {reg.status === "pending" && reg.expires_at && (
        <>
          <span className="badge warn">Aguardando pagamento</span>
          <p>
            Sua vaga está reservada até <strong>{formatTime(reg.expires_at)}</strong>. Valor: <strong>{formatBRL(reg.price_cents)}</strong>.
          </p>
          {canSimulate ? (
            <form action={simulatePayment}>
              <input type="hidden" name="code" value={reg.code} />
              <button type="submit">Simular pagamento aprovado (modo de desenvolvimento)</button>
            </form>
          ) : (
            <p className="muted">O pagamento pelo Mercado Pago será liberado na próxima etapa do sistema.</p>
          )}
        </>
      )}

      {reg.status === "waitlist" && (
        <>
          <span className="badge warn">Na fila de espera</span>
          <p className="muted">Se uma vaga abrir, avisamos você por email em {reg.email}.</p>
        </>
      )}

      {reg.status === "expired" && (
        <>
          <span className="badge bad">Reserva expirada</span>
          <p className="muted">O prazo para pagar passou e a vaga foi liberada. Você pode fazer a inscrição de novo.</p>
        </>
      )}

      {reg.status === "cancelled" && <span className="badge bad">Inscrição cancelada</span>}
    </div>
  );
}
