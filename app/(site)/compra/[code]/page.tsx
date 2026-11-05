import { notFound } from "next/navigation";
import { Icon } from "@/components/icons";
import { getEvent } from "@/lib/events";
import { qrDataUrl } from "@/lib/mail";
import { getOrder, maskEmail, waitlistPosition } from "@/lib/orders";
import { mpEnabled } from "@/lib/mercadopago";
import { db } from "@/lib/supabase";
import { dayLabel, formatBRL, formatDateTime, formatRange, formatTime } from "@/lib/time";
import { ORDER_STATUS } from "@/lib/types";
import { cancelAction, payAction, startOfferedAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

export default async function OrderPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ aviso?: string }> }) {
  const { code } = await params;
  const { aviso } = await searchParams;
  await db().rpc("expire_stale");
  const r = await getOrder(code);
  if (!r) notFound();
  const { order: o, tickets } = r;
  const e = (await getEvent(o.event_id))!;
  const qrs = o.status === "confirmed" ? await Promise.all(tickets.map((t) => qrDataUrl(t.code))) : [];
  const now = Date.now();
  const canCancel = o.status === "confirmed" && o.confirmed_at && new Date(o.confirmed_at).getTime() + 7 * 86_400_000 > now
    && new Date(e.starts_at).getTime() > now && !tickets.some((t) => t.checkins.length);
  const badge = o.status === "confirmed" ? "ok" : o.status === "cancelled" || o.status === "expired" ? "bad" : "warn";
  const canSimulate = !mpEnabled() && process.env.NODE_ENV !== "production";

  return (
    <div className="order">
      <p className="nav2"><a href="/meus-ingressos">← Meus ingressos</a></p>
      <p className="eyebrow">{e.name}</p>
      <h1>{o.status === "confirmed" ? "Seus ingressos" : "Sua compra"}</h1>
      <p className="muted">{formatRange(e.starts_at, e.ends_at)} · {e.place_name}</p>
      <span className={`badge ${badge}`}>{o.status === "waitlist" && o.offered_until ? "Vaga liberada" : ORDER_STATUS[o.status]}</span>
      {aviso && <div className="notice flash" role="status" style={{ marginTop: 14 }}>{aviso}</div>}

      {o.status === "confirmed" && (
        <>
          <div className="okbox" style={{ marginTop: 14 }}><Icon name="mail" /> Os QR codes foram enviados para <strong>{maskEmail(o.buyer_email)}</strong>.</div>
          <div className="qr-grid">
            {tickets.map((t, i) => (
              <figure className="qr-card" key={t.id}>
                <div className="qr">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={qrs[i]} alt={`QR code de ${t.name}`} width={170} height={170} /></div>
                <figcaption><strong>{t.name}</strong><span className="muted small">Ingresso {i + 1} de {tickets.length}{t.checkins.map((c) => ` · entrou em ${dayLabel(c.day)}`).join("")}</span></figcaption>
              </figure>
            ))}
          </div>
          <p className="muted small">Cada QR code vale só para a pessoa indicada. Em eventos de vários dias, ele é usado uma vez por dia.</p>
          <div className="proto-box">
            {canCancel ? (
              <form action={cancelAction}>
                <input type="hidden" name="code" value={o.code} />
                <p className="small" style={{ margin: "0 0 8px" }}>Você pode cancelar a compra inteira em até 7 dias{o.total_cents ? `, com reembolso total de ${formatBRL(o.total_cents)}` : ""}.</p>
                <button className="btn danger sm" type="submit">Cancelar compra</button>
              </form>
            ) : <p className="small" style={{ margin: 0 }}>Para cancelar ou pedir reembolso, fale com o líder responsável.</p>}
          </div>
        </>
      )}

      {o.status === "pending" && o.expires_at && (
        <>
          <p style={{ marginTop: 14 }}>Seus {o.ticket_count} ingressos estão reservados até <strong>{formatTime(o.expires_at)}</strong>.</p>
          <Breakdown o={o} />
          <form action={payAction} style={{ marginTop: 14 }}>
            <input type="hidden" name="code" value={o.code} />
            <button className="btn" type="submit" style={{ width: "100%" }}>{canSimulate ? "Aprovar pagamento (modo de desenvolvimento)" : `Pagar ${formatBRL(o.total_cents)} com Pix ou cartão`}</button>
          </form>
          <p className="muted small">O pagamento é feito no Mercado Pago. Depois de aprovado, os QR codes chegam no seu email.</p>
        </>
      )}

      {o.status === "waitlist" && (o.offered_until ? (
        <form action={startOfferedAction}>
          <input type="hidden" name="code" value={o.code} />
          <div className="okbox" style={{ marginTop: 14 }}>Abriram vagas para os seus {o.ticket_count} ingressos. Continue até {formatDateTime(o.offered_until)}.</div>
          <button className="btn" type="submit">Continuar para o pagamento</button>
        </form>
      ) : <p style={{ marginTop: 14 }}>Sua compra de {o.ticket_count} {o.ticket_count === 1 ? "ingresso" : "ingressos"} é a <strong>{await waitlistPosition(o)}ª</strong> da fila. Quando abrirem vagas, avisamos em {maskEmail(o.buyer_email)}.</p>)}

      {o.status === "expired" && <><p className="muted" style={{ marginTop: 14 }}>O prazo passou e os ingressos foram liberados. Você pode comprar de novo.</p><a className="btn" href={`/eventos/${e.slug}`}>Voltar ao evento</a></>}
      {o.status === "cancelled" && <p className="muted" style={{ marginTop: 14 }}>Compra cancelada.{o.total_cents ? ` O reembolso total de ${formatBRL(o.total_cents)} é feito pela igreja.` : ""}</p>}
    </div>
  );
}

function Breakdown({ o }: { o: { ticket_count: number; subtotal_cents: number; age_discount_cents: number; combo_discount_cents: number; coupon_discount_cents: number; total_cents: number } }) {
  return (
    <div className="sum-box">
      <div className="sum-line"><span>{o.ticket_count} {o.ticket_count === 1 ? "ingresso" : "ingressos"}</span><span>{formatBRL(o.subtotal_cents)}</span></div>
      {o.age_discount_cents > 0 && <div className="sum-line disc"><span>Desconto por idade</span><span>− {formatBRL(o.age_discount_cents)}</span></div>}
      {o.combo_discount_cents !== 0 && <div className="sum-line disc"><span>Combo</span><span>{o.combo_discount_cents > 0 ? `− ${formatBRL(o.combo_discount_cents)}` : `+ ${formatBRL(-o.combo_discount_cents)}`}</span></div>}
      {o.coupon_discount_cents > 0 && <div className="sum-line disc"><span>Cupom</span><span>− {formatBRL(o.coupon_discount_cents)}</span></div>}
      <div className="sum-line total"><span>Total</span><span>{formatBRL(o.total_cents)}</span></div>
    </div>
  );
}
