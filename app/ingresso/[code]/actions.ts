"use server";

import { revalidatePath } from "next/cache";
import { sb } from "@/lib/supabase";
import { confirmPayment, findByCode } from "@/lib/registration";
import { sendTicketEmail } from "@/lib/mail";

/**
 * Só para desenvolvimento: aprova um pagamento sem o Mercado Pago.
 * Nunca roda em produção nem quando há credenciais reais configuradas.
 */
export async function simulatePayment(formData: FormData): Promise<void> {
  if (process.env.NODE_ENV === "production" || process.env.MERCADOPAGO_ACCESS_TOKEN) return;
  const code = String(formData.get("code") ?? "");
  const registration = await findByCode(code);
  if (!registration || registration.status === "confirmed") return;
  const outcome = await confirmPayment(code, `simulado-${code}`, registration.price_cents);
  if (outcome === "confirmed") {
    const { data: event } = await sb().from("events").select("name, starts_at, location").eq("id", registration.event_id).maybeSingle();
    if (event) {
      await sendTicketEmail({
        name: registration.name, email: registration.email, code: registration.code,
        eventName: event.name, startsAt: event.starts_at, location: event.location,
      }).catch((error) => console.error("Falha ao enviar email do ingresso:", error));
    }
  }
  revalidatePath(`/ingresso/${code}`);
}
