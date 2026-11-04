import { notFound } from "next/navigation";
import { sb, unwrap } from "@/lib/supabase";
import { expireStale, getAvailability, getEventBySlug, RESERVATION_MINUTES } from "@/lib/registration";
import { formatBRL, formatDateTime } from "@/lib/time";
import { RegistrationForm } from "./registration-form";

export const dynamic = "force-dynamic";

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await expireStale();
  const event = await getEventBySlug(slug);
  if (!event) notFound();

  const now = new Date();
  const a = await getAvailability(event);
  const sessions = (unwrap(await sb().from("event_sessions").select("id, name, starts_at").eq("event_id", event.id).order("starts_at")) as {
    id: number; name: string; starts_at: string;
  }[]).map((s) => ({ id: s.id, name: s.name, when: formatDateTime(s.starts_at) }));
  const over = new Date(event.starts_at).getTime() <= now.getTime();

  return (
    <div style={{ maxWidth: 560 }}>
      <h1>{event.name}</h1>
      <p className="muted">
        {formatDateTime(event.starts_at)} · {event.location}
      </p>
      {event.description && <p style={{ whiteSpace: "pre-line" }}>{event.description}</p>}

      <p>
        <span className="badge">{event.kind === "free" ? "Gratuito" : a.lot ? `${a.lot.name}: ${formatBRL(a.lot.price_cents)}` : "Pago"}</span>{" "}
        {a.open ? <span className="badge ok">{a.seatsLeft} vagas</span> : <span className="badge warn">Esgotado</span>}
      </p>

      {over ? (
        <p className="notice">Este evento já aconteceu.</p>
      ) : (
        <>
          {!a.open && (
            <p className="notice">
              As vagas acabaram. Entre na fila de espera: se uma vaga abrir, avisamos você por email.
            </p>
          )}
          {event.kind === "paid" && a.open && (
            <p className="muted">
              Ao se inscrever, sua vaga fica reservada por {RESERVATION_MINUTES} minutos para você concluir o pagamento.
            </p>
          )}
          <h2>Inscrição</h2>
          <RegistrationForm eventId={event.id} sessions={sessions} waitlist={!a.open} />
        </>
      )}
    </div>
  );
}
