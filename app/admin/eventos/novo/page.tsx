import { requireRole } from "@/lib/session";
import { EventForm } from "./event-form";

export const dynamic = "force-dynamic";

export default async function NewEventPage() {
  await requireRole("admin");
  return (
    <div style={{ maxWidth: 560 }}>
      <h1>Novo evento</h1>
      <EventForm />
    </div>
  );
}
