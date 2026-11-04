import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function VolunteerPage() {
  await requireRole("volunteer");
  return (
    <div style={{ maxWidth: 560 }}>
      <h1>Check-in</h1>
      <p className="card">
        O check-in por QR code e a lista do dia chegam na próxima etapa do sistema (Fase 6 do plano).
      </p>
    </div>
  );
}
