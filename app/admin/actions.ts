"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";
import { addLot, addSession, createEvent, removeLot, removeSession, setCapacity, setStatus } from "@/lib/events";
import { localInputToIso } from "@/lib/time";

export type EventFormState = { error?: string; values?: Record<string, string> };

const text = (data: FormData, key: string) => String(data.get(key) ?? "");
const int = (data: FormData, key: string) => Number.parseInt(text(data, key), 10);

export async function createEventAction(_prev: EventFormState, data: FormData): Promise<EventFormState> {
  await requireRole("admin");
  const values = {
    name: text(data, "name"), description: text(data, "description"), location: text(data, "location"),
    startsAt: text(data, "startsAt"), kind: text(data, "kind"), capacity: text(data, "capacity"),
  };
  const result = await createEvent({
    name: values.name, description: values.description, location: values.location,
    startsAtIso: localInputToIso(values.startsAt), kind: values.kind, capacity: int(data, "capacity"),
  });
  if (!result.ok) return { error: result.error, values };
  redirect(`/admin/eventos/${result.id}`);
}

/** Roda uma alteração do evento e volta para a página dele, com a mensagem de erro se houver. */
async function mutate(eventId: number, run: () => Promise<{ ok: true } | { ok: false; error: string }>): Promise<never> {
  const result = await run();
  revalidatePath(`/admin/eventos/${eventId}`);
  redirect(`/admin/eventos/${eventId}${result.ok ? "" : `?erro=${encodeURIComponent(result.error)}`}`);
}

export async function setStatusAction(data: FormData): Promise<void> {
  await requireRole("admin");
  const id = int(data, "eventId");
  await mutate(id, () => setStatus(id, text(data, "status")));
}

export async function setCapacityAction(data: FormData): Promise<void> {
  await requireRole("admin");
  const id = int(data, "eventId");
  await mutate(id, () => setCapacity(id, int(data, "capacity")));
}

export async function addSessionAction(data: FormData): Promise<void> {
  await requireRole("admin");
  const id = int(data, "eventId");
  await mutate(id, () => addSession(id, text(data, "name"), localInputToIso(text(data, "startsAt"))));
}

export async function addLotAction(data: FormData): Promise<void> {
  await requireRole("admin");
  const id = int(data, "eventId");
  const endsAt = text(data, "endsAt");
  await mutate(id, () =>
    addLot(id, {
      name: text(data, "name"), price: text(data, "price"), quantity: int(data, "quantity"),
      endsAtIso: endsAt ? localInputToIso(endsAt) : null,
    }),
  );
}

export async function removeLotAction(data: FormData): Promise<void> {
  await requireRole("admin");
  const id = int(data, "eventId");
  await mutate(id, () => removeLot(int(data, "lotId")));
}

export async function removeSessionAction(data: FormData): Promise<void> {
  await requireRole("admin");
  const id = int(data, "eventId");
  await mutate(id, () => removeSession(int(data, "sessionId")));
}
