import { NextResponse, type NextRequest } from "next/server";
import { getPayment, validSignature } from "@/lib/mercadopago";
import { confirmPayment } from "@/lib/orders";
import { emailTickets } from "@/lib/notify";
import { db } from "@/lib/supabase";

// Aviso de pagamento do Mercado Pago. Nunca confia no conteúdo do aviso:
// confere a assinatura e busca o pagamento direto na API antes de confirmar.
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  let body: { type?: string; action?: string; data?: { id?: string | number } } = {};
  try { body = await req.json(); } catch { /* corpo vazio */ }
  const dataId = String(url.searchParams.get("data.id") ?? body.data?.id ?? "");
  const type = url.searchParams.get("type") ?? body.type ?? "";
  if (!dataId || (type && type !== "payment")) return NextResponse.json({ ok: true });

  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET ?? "";
  if (!validSignature(req.headers.get("x-signature"), req.headers.get("x-request-id"), dataId, secret)) {
    return NextResponse.json({ error: "assinatura inválida" }, { status: 401 });
  }
  try {
    const p = await getPayment(dataId);
    if (p.status === "approved" && p.external_reference) {
      const outcome = await confirmPayment(p.external_reference, String(p.id), Math.round(p.transaction_amount * 100));
      if (outcome === "confirmed") {
        const { data } = await db().from("orders").select("id").eq("code", p.external_reference).maybeSingle();
        if (data) await emailTickets(data.id).catch((e) => console.error("Falha ao enviar ingressos:", e));
      } else if (outcome !== "already") console.error(`Pagamento ${p.id} não confirmado: ${outcome}`);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Webhook Mercado Pago:", e);
    return NextResponse.json({ error: "falha temporária" }, { status: 500 }); // o Mercado Pago tenta de novo
  }
}
