"use server";

import { redirect } from "next/navigation";
import { sb } from "@/lib/supabase";
import { register } from "@/lib/registration";
import { sendTicketEmail } from "@/lib/mail";
import type { FieldErrors } from "@/lib/validation";

export type FormState = {
  errors?: FieldErrors;
  message?: string;
  values?: Record<string, string>;
};

export async function submitRegistration(_prev: FormState, formData: FormData): Promise<FormState> {
  const text = (key: string) => String(formData.get(key) ?? "");
  const values = {
    name: text("name"), email: text("email"), phone: text("phone"), cpf: text("cpf"),
    birthDate: text("birthDate"), guardianPhone: text("guardianPhone"), sessionId: text("sessionId"),
  };
  const eventId = Number(text("eventId"));
  if (!Number.isInteger(eventId)) return { message: "Evento inválido.", values };

  const sessionId = values.sessionId ? Number(values.sessionId) : null;
  const result = await register(eventId, {
    ...values,
    sessionId: sessionId !== null && Number.isInteger(sessionId) ? sessionId : null,
  });

  if (!result.ok) {
    if (result.code === "validation") return { errors: result.errors, values };
    return { message: result.message, values };
  }

  const { registration } = result;
  if (result.outcome === "confirmed") {
    const { data: event } = await sb().from("events").select("name, starts_at, location").eq("id", eventId).maybeSingle();
    if (event) {
      // Falha no envio não pode derrubar a inscrição: o ingresso continua disponível na página.
      await sendTicketEmail({
        name: registration.name, email: registration.email, code: registration.code,
        eventName: event.name, startsAt: event.starts_at, location: event.location,
      }).catch((error) => console.error("Falha ao enviar email do ingresso:", error));
    }
  }
  redirect(`/ingresso/${registration.code}`);
}
