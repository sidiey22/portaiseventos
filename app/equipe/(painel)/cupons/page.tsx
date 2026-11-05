import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/staff";
import { db, unwrap } from "@/lib/supabase";
import { formatBRL, formatDateTime, localInputToIso } from "@/lib/time";
import type { Coupon } from "@/lib/types";

async function addCoupon(d: FormData): Promise<void> {
  "use server";
  const s = await requireAdmin();
  const code = String(d.get("code") ?? "").trim().toUpperCase(), type = String(d.get("type")), raw = String(d.get("value") ?? "").trim();
  const value = type === "percent" ? Number.parseInt(raw, 10) : Math.round(Number(raw.replace(/\./g, "").replace(",", ".")) * 100);
  const until = String(d.get("until") ?? "") ? localInputToIso(String(d.get("until"))) : null;
  const max = String(d.get("maxUses") ?? "") ? Number.parseInt(String(d.get("maxUses")), 10) : null;
  const err = (m: string) => redirect(`/equipe/cupons?erro=${encodeURIComponent(m)}`);
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) err("O código usa de 3 a 30 letras, números, hífen ou sublinhado.");
  if (!(value > 0) || (type === "percent" && value > 100) || !["percent", "amount"].includes(type)) err("Informe um valor de desconto válido.");
  if (String(d.get("until") ?? "") && !until) err("Confira a validade.");
  if (max !== null && !(max >= 1)) err("O limite de usos precisa ser 1 ou mais.");
  const eventId = String(d.get("eventId") ?? "") ? Number(d.get("eventId")) : null;
  const { error } = await db().from("coupons").insert({ code, discount_type: type, discount_value: value, valid_until: until, max_uses: max, event_id: eventId, created_by: s.id });
  if (error) err(error.code === "23505" ? "Já existe um cupom com esse código." : "Não foi possível criar o cupom.");
  redirect(`/equipe/cupons?ok=${encodeURIComponent(`Cupom ${code} criado.`)}`);
}

async function toggleCoupon(d: FormData): Promise<void> {
  "use server";
  await requireAdmin();
  const id = Number(d.get("id"));
  const c = unwrap(await db().from("coupons").select("active").eq("id", id).single()) as { active: boolean };
  await db().from("coupons").update({ active: !c.active }).eq("id", id);
  redirect("/equipe/cupons");
}

export default async function CouponsPage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const coupons = unwrap(await db().from("coupons").select("*").order("created_at", { ascending: false })) as Coupon[];
  const events = unwrap(await db().from("events").select("id, name").eq("kind", "paid").order("starts_at", { ascending: false })) as { id: number; name: string }[];
  const uses = unwrap(await db().from("orders").select("coupon_id, status, expires_at").not("coupon_id", "is", null)) as { coupon_id: number; status: string; expires_at: string | null }[];
  const now = Date.now();
  const used = (id: number) => uses.filter((u) => u.coupon_id === id && (u.status === "confirmed" || (u.status === "pending" && u.expires_at && new Date(u.expires_at).getTime() > now))).length;
  return (
    <>
      <h1>Cupons de desconto</h1>
      <p className="muted">O cupom é aplicado por último, sobre o total da compra.</p>
      {sp.ok && <div className="okbox flash" role="status">{sp.ok}</div>}
      {sp.erro && <div className="alert flash" role="alert">{sp.erro}</div>}
      {coupons.length > 0 && (
        <div className="card table-scroll"><table>
          <thead><tr><th>Código</th><th>Desconto</th><th>Validade</th><th>Usos</th><th>Evento</th><th>Situação</th><th /></tr></thead>
          <tbody>{coupons.map((c) => { const exp = c.valid_until && new Date(c.valid_until).getTime() <= now; return (
            <tr key={c.id}><td><strong className="mono-inline">{c.code}</strong></td><td>{c.discount_type === "percent" ? `${c.discount_value}%` : formatBRL(c.discount_value)}</td>
              <td>{c.valid_until ? formatDateTime(c.valid_until) : "Sem validade"}</td><td className="num">{used(c.id)}{c.max_uses ? ` / ${c.max_uses}` : ""}</td>
              <td>{c.event_id ? events.find((e) => e.id === c.event_id)?.name ?? "—" : "Todos"}</td>
              <td><span className={`badge ${c.active && !exp ? "ok" : ""}`}>{!c.active ? "Inativo" : exp ? "Vencido" : "Ativo"}</span></td>
              <td><form action={toggleCoupon}><input type="hidden" name="id" value={c.id} /><button className="btn sec sm" type="submit">{c.active ? "Desativar" : "Ativar"}</button></form></td></tr>); })}</tbody>
        </table></div>
      )}
      <form className="card stack" action={addCoupon} style={{ marginTop: 14 }}>
        <h2 style={{ margin: 0 }}>Novo cupom</h2>
        <div className="row">
          <label htmlFor="cp-code">Código<input id="cp-code" name="code" placeholder="NATAL20" autoComplete="off" required /></label>
          <label htmlFor="cp-event">Evento<select id="cp-event" name="eventId"><option value="">Todos os eventos</option>{events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
        </div>
        <div className="row">
          <label htmlFor="cp-type">Tipo<select id="cp-type" name="type"><option value="percent">Percentual</option><option value="amount">Valor fixo em R$</option></select></label>
          <label htmlFor="cp-val">Valor<input id="cp-val" name="value" inputMode="decimal" placeholder="10" required /></label>
        </div>
        <div className="row">
          <label htmlFor="cp-until">Válido até<input id="cp-until" name="until" type="datetime-local" /></label>
          <label htmlFor="cp-max">Limite de usos (vazio = sem limite)<input id="cp-max" name="maxUses" type="number" min={1} /></label>
        </div>
        <div><button className="btn" type="submit">Criar cupom</button></div>
      </form>
    </>
  );
}
