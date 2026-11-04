import Link from "next/link";
import { requireRole } from "@/lib/session";
import { sb, unwrap } from "@/lib/supabase";
import { formatBRL, formatDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";

type Row = {
  id: number; name: string; starts_at: string; kind: string; status: string; capacity: number;
  confirmed: number; waitlist: number; revenue: number;
};

const STATUS: Record<string, string> = { draft: "Rascunho", published: "Publicado", closed: "Encerrado" };

export default async function AdminPage() {
  await requireRole("admin");
  const rows = (unwrap(await sb().rpc("admin_event_stats")) as Row[]).map((r) => ({
    ...r, confirmed: Number(r.confirmed), waitlist: Number(r.waitlist), revenue: Number(r.revenue),
  }));

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h1>Eventos</h1>
        <Link className="btn" href="/admin/eventos/novo">Novo evento</Link>
      </div>
      {rows.length === 0 ? (
        <p className="card">Nenhum evento ainda. Crie o primeiro.</p>
      ) : (
        <div className="card table-scroll">
          <table>
            <thead>
              <tr><th>Evento</th><th>Data</th><th>Status</th><th>Inscritos</th><th>Fila</th><th>Arrecadado</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/admin/eventos/${r.id}`}>{r.name}</Link></td>
                  <td>{formatDateTime(r.starts_at)}</td>
                  <td><span className="badge">{STATUS[r.status]}</span></td>
                  <td>{r.confirmed} / {r.capacity}</td>
                  <td>{r.waitlist}</td>
                  <td>{r.kind === "paid" ? formatBRL(r.revenue) : "Gratuito"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
