import Link from "next/link";
import { sb, unwrap } from "@/lib/supabase";
import { expireStale, getAvailability, type EventRow } from "@/lib/registration";
import { formatBRL, formatDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await expireStale();
  const events = unwrap(
    await sb().from("events").select("*").eq("status", "published").gt("starts_at", new Date().toISOString()).order("starts_at"),
  ) as EventRow[];
  const availability = await Promise.all(events.map((event) => getAvailability(event)));

  return (
    <>
      <h1>Eventos</h1>
      <p className="muted">Escolha um evento para se inscrever.</p>
      {events.length === 0 ? (
        <p className="card">Nenhum evento com inscrições abertas no momento.</p>
      ) : (
        <div className="grid">
          {events.map((event, i) => {
            const a = availability[i]!;
            return (
              <Link key={event.id} href={`/eventos/${event.slug}`} style={{ textDecoration: "none", color: "inherit" }}>
                <article className="card">
                  <h3>{event.name}</h3>
                  <p className="muted" style={{ margin: "0 0 12px" }}>
                    {formatDateTime(event.starts_at)}
                    <br />
                    {event.location}
                  </p>
                  <span className="badge">
                    {event.kind === "free" ? "Gratuito" : a.lot ? formatBRL(a.lot.price_cents) : "Pago"}
                  </span>{" "}
                  {a.open ? (
                    <span className="badge ok">{a.seatsLeft} vagas</span>
                  ) : (
                    <span className="badge warn">Fila de espera</span>
                  )}
                </article>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
