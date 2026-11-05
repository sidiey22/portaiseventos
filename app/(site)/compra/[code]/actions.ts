"use server";

import { redirect } from "next/navigation";
import { getEvent } from "@/lib/events";
import { cancelSelf, confirmPayment, getOrder, startOffered } from "@/lib/orders";
import { createCheckout, mpEnabled } from "@/lib/mercadopago";
import { emailTickets } from "@/lib/notify";
import { allow, clientIp } from "@/lib/rate-limit";

const back = (code: string, msg?: string) => redirect(`/compra/${code}${msg ? `?aviso=${encodeURIComponent(msg)}` : ""}`);

/** Abre o checkout do Mercado Pago (ou, só em desenvolvimento sem token, aprova na hora). */
export async function payAction(data: FormData): Promise<void> {
  const code = String(data.get("code") ?? "");
  if (!allow(`pay:${await clientIp()}`, 20, 10 * 60_000)) back(code, "Muitas tentativas seguidas. Aguarde alguns minutos.");
  const r = await getOrder(code);
  if (!r || r.order.status !== "pending") back(code);
  const o = r!.order;
  if (mpEnabled()) {
    const e = await getEvent(o.event_id);
    const url = await createCheckout({ code: o.code, eventName: e!.name, ticketCount: o.ticket_count, totalCents: o.total_cents, buyerEmail: o.buyer_email, buyerName: o.buyer_name, expiresAt: o.expires_at! })
      .catch((err) => { console.error("Mercado Pago:", err); return null; });
    if (!url) back(code, "Não foi possível abrir o pagamento agora. Tente de novo em instantes.");
    redirect(url!);
  }
  if (process.env.NODE_ENV === "production") back(code, "O pagamento ainda não está configurado. Fale com a igreja.");
  // Desenvolvimento: aprova sem Mercado Pago.
  const outcome = await confirmPayment(o.code, `simulado-${o.code}`, o.total_cents);
  if (outcome === "confirmed") await emailTickets(o.id).catch((err) => console.error(err));
  back(code);
}

export async function cancelAction(data: FormData): Promise<void> {
  const code = String(data.get("code") ?? "");
  const res = await cancelSelf(code);
  back(code, res === "ok" ? "Compra cancelada. A igreja fará o reembolso total." : "Esta compra não pode mais ser cancelada por aqui. Fale com o líder responsável.");
}

export async function startOfferedAction(data: FormData): Promise<void> {
  const code = String(data.get("code") ?? "");
  const r = await startOffered(code);
  if (!r.ok) back(code, r.error);
  const o = await getOrder(code);
  if (o?.order.status === "confirmed") await emailTickets(o.order.id).catch((err) => console.error(err));
  back(code);
}
