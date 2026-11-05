import { notFound } from "next/navigation";
import { Art } from "@/components/art";
import { Icon } from "@/components/icons";
import { PlaceMap } from "@/components/map";
import { availability, bandLabel, expireStale, getPublishedBySlug, refDate } from "@/lib/events";
import { formatBRL, formatDate, formatDateTime, formatRange } from "@/lib/time";
import { Checkout } from "./checkout";

export const dynamic = "force-dynamic";

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await expireStale();
  const e = await getPublishedBySlug(slug);
  if (!e) notFound();
  const a = await availability(e);
  const over = new Date(e.ends_at ?? e.starts_at).getTime() <= Date.now();
  const combos = e.combos.filter((c) => c.active);

  return (
    <>
      <p className="nav2"><a href="/">← Todos os eventos</a></p>
      <div className="ev-top">
        <Art event={e} />
        <div className="ev-main">
          <p className="eyebrow">{e.kind === "free" ? "Entrada gratuita" : "Evento pago"}</p>
          <h1>{e.name}</h1>
          <ul className="meta">
            <li><Icon name="cal" /><span>{formatRange(e.starts_at, e.ends_at)}</span></li>
            <li><Icon name="pin" /><span>{e.place_name}{e.place_address && <><br /><span className="muted">{e.place_address}</span></>}</span></li>
          </ul>
        </div>
      </div>
      <div className="ev-layout">
        <div className="ev-main">
          {e.description && <><h2>Sobre o evento</h2><p className="ev-desc">{e.description}</p></>}
          {(e.place_lat != null || e.place_address) && <><h2>Local</h2><PlaceMap lat={e.place_lat} lng={e.place_lng} name={e.place_name} /></>}
          {over ? <p className="notice">Este evento já aconteceu.</p> : a.salesOpen ? (
            <div className="reg-box" id="inscricao">
              <Checkout
                event={{ id: e.id, kind: e.kind, questions: e.questions, sessions: e.sessions.map((s) => ({ id: s.id, label: `${s.name} · ${formatDateTime(s.starts_at)}` })),
                  combos: combos.map((c) => ({ id: c.id, name: c.name, count: c.ticket_count, price: c.price_cents })) }}
                lotLabel={a.lot ? `${a.lot.name} · ${formatBRL(a.lot.price_cents)}` : e.kind === "free" ? "Gratuito" : ""}
                seatsLeft={a.seatsLeft}
              />
            </div>
          ) : <p className="notice">As vendas estão fechadas no momento.{a.nextLot?.starts_at ? ` O ${a.nextLot.name} abre em ${formatDateTime(a.nextLot.starts_at)}.` : ""}</p>}
        </div>
        <aside className="buy" aria-label="Ingressos">
          <p className="eyebrow" style={{ margin: 0 }}><Icon name="ticket" /> Ingressos</p>
          <div className="price">{e.kind === "free" ? "Gratuito" : a.lot ? formatBRL(a.lot.price_cents) : "—"}</div>
          {e.kind === "paid" && (a.lot
            ? <p className="fine"><strong>{a.lot.name}</strong>{a.lot.ends_at ? ` até ${formatDateTime(a.lot.ends_at)}` : ""}. Quem compra mantém o preço.</p>
            : <p className="fine">{a.nextLot?.starts_at ? `Vendas fechadas no momento. O ${a.nextLot.name} abre em ${formatDateTime(a.nextLot.starts_at)}.` : "Ingressos esgotados."}</p>)}
          {e.age_bands.length > 0 && <><ul className="fine-list">{e.age_bands.map((b) => <li key={b.id}>{bandLabel(b)}</li>)}</ul><p className="fine">Idade calculada em {formatDate(`${refDate(e)}T12:00:00-03:00`)}.</p></>}
          {combos.length > 0 && <div className="combo-hint">{combos.map((c) => <span key={c.id} className="chip hot">{c.name}: {c.ticket_count} ingressos por {formatBRL(c.price_cents)}</span>)}</div>}
          <p className="fine">{a.seatsLeft > 0 ? <><Icon name="users" /> {a.seatsLeft} {a.seatsLeft === 1 ? "vaga disponível" : "vagas disponíveis"}</> : "Esgotado. Você pode entrar na fila de espera."}</p>
          {!over && a.salesOpen && <a className="btn" href="#inscricao">{a.seatsLeft <= 0 ? "Entrar na fila de espera" : e.kind === "free" ? "Inscrever-se" : "Comprar ingressos"}</a>}
          <p className="fine">{e.kind === "free" ? "Os QR codes de entrada chegam no seu email." : "Pix ou cartão pelo Mercado Pago. Os ingressos ficam reservados por 10 minutos enquanto você paga."}</p>
        </aside>
      </div>
    </>
  );
}
