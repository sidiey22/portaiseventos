import Link from "next/link";
import { cookies } from "next/headers";
import { db, unwrap } from "@/lib/supabase";
import { formatLong } from "@/lib/time";
import { ORDER_STATUS, type Order } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function MinePage() {
  const store = await cookies();
  const codes = (store.get("pe_compras")?.value ?? "").split(".").filter((c) => /^[A-Za-z0-9_-]{10,40}$/.test(c)).slice(0, 20);
  const orders = codes.length ? unwrap(await db().from("orders").select("code, status, ticket_count, buyer_name, created_at, events(name, starts_at)").in("code", codes).order("created_at", { ascending: false })) as unknown as (Pick<Order, "code" | "status" | "ticket_count" | "buyer_name"> & { events: { name: string; starts_at: string } })[] : [];
  return (
    <>
      <h1>Meus ingressos</h1>
      <p className="muted">Compras feitas neste navegador. Os QR codes também estão no email de quem comprou.</p>
      {orders.length ? (
        <div className="grid">
          {orders.map((o) => (
            <Link key={o.code} className="card click" href={`/compra/${o.code}`} style={{ textDecoration: "none" }}>
              <h3>{o.events.name}</h3>
              <p className="muted small" style={{ margin: 0 }}>{o.ticket_count} {o.ticket_count === 1 ? "ingresso" : "ingressos"} · {o.buyer_name}<br />{formatLong(o.events.starts_at)}</p>
              <div className="badges"><span className="badge">{ORDER_STATUS[o.status]}</span></div>
            </Link>
          ))}
        </div>
      ) : <p className="card">Nenhuma compra neste navegador. Se você comprou em outro aparelho, abra o email com os ingressos.</p>}
    </>
  );
}
