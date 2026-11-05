import { db, unwrap } from "./supabase.ts";
import { sendOfferEmail, sendTicketsEmail } from "./mail.ts";
import type { EventRow, Order } from "./types.ts";

/** Envia os QR codes de uma compra confirmada, uma vez só. */
export async function emailTickets(orderId: number): Promise<void> {
  const o = unwrap(await db().from("orders").select("*").eq("id", orderId).maybeSingle()) as Order | null;
  if (!o || o.status !== "confirmed" || o.tickets_emailed_at) return;
  // Marca antes de enviar para não duplicar se dois processos tentarem ao mesmo tempo.
  const { data: claimed } = await db().from("orders").update({ tickets_emailed_at: new Date().toISOString() }).eq("id", o.id).is("tickets_emailed_at", null).select("id");
  if (!claimed?.length) return;
  try {
    const e = unwrap(await db().from("events").select("*").eq("id", o.event_id).single()) as EventRow;
    const tickets = unwrap(await db().from("tickets").select("code, name").eq("order_id", o.id).order("position")) as { code: string; name: string }[];
    let banner: { content: Buffer; contentType: string } | null = null;
    if (e.banner_path) {
      const dl = await db().storage.from("banners").download(e.banner_path); // sem banner, o email usa a arte automática
      if (dl.data) banner = { content: Buffer.from(await dl.data.arrayBuffer()), contentType: dl.data.type || "image/jpeg" };
    }
    await sendTicketsEmail({ buyerName: o.buyer_name, buyerEmail: o.buyer_email, orderCode: o.code, eventId: e.id, eventName: e.name, kind: e.kind, startsAt: e.starts_at, endsAt: e.ends_at,
      place: [e.place_name, e.place_address].filter(Boolean).join(" · "), tickets, banner });
  } catch (error) {
    await db().from("orders").update({ tickets_emailed_at: null }).eq("id", o.id); // tenta de novo na próxima rodada
    throw error;
  }
}

/** Rodada periódica: emails pendentes de ingressos e avisos da fila de espera. */
export async function runJobs(): Promise<void> {
  await db().rpc("run_maintenance");
  const pendingTickets = unwrap(await db().from("orders").select("id").eq("status", "confirmed").is("tickets_emailed_at", null).limit(20)) as { id: number }[];
  for (const o of pendingTickets) await emailTickets(o.id).catch((e) => console.error("Falha ao enviar ingressos:", e));
  const offers = unwrap(await db().from("orders").select("*").eq("status", "waitlist").not("offered_until", "is", null).is("offer_notified_at", null).limit(20)) as Order[];
  for (const o of offers) {
    const e = unwrap(await db().from("events").select("name").eq("id", o.event_id).single()) as { name: string };
    try {
      await sendOfferEmail({ buyerName: o.buyer_name, buyerEmail: o.buyer_email, orderCode: o.code, eventName: e.name, until: o.offered_until!, count: o.ticket_count });
      await db().from("orders").update({ offer_notified_at: new Date().toISOString() }).eq("id", o.id);
    } catch (err) { console.error("Falha ao avisar a fila:", err); }
  }
}
