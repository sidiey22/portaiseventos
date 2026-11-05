import { redirect } from "next/navigation";
import { publicUrl } from "@/lib/mail";
import { requireAdmin } from "@/lib/staff";
import { db, unwrap } from "@/lib/supabase";
import { isEmail } from "@/lib/validation";

async function addAdmin(d: FormData): Promise<void> {
  "use server";
  await requireAdmin();
  const email = String(d.get("email") ?? "").trim().toLowerCase();
  const back = (k: "ok" | "erro", m: string) => redirect(`/equipe/administradores?${k}=${encodeURIComponent(m)}`);
  if (!isEmail(email)) back("erro", "Informe um email válido.");
  const { count } = await db().from("profiles").select("id", { count: "exact", head: true }).eq("is_admin", true);
  if ((count ?? 0) >= 5) back("erro", "O limite é de 5 administradores.");
  let { data: p } = await db().from("profiles").select("id").eq("email", email).maybeSingle();
  if (!p) {
    const r = await db().auth.admin.inviteUserByEmail(email, { redirectTo: publicUrl("/auth/confirm") });
    if (r.error || !r.data.user) back("erro", "Não foi possível enviar o convite.");
    p = { id: r.data.user!.id };
    await db().from("profiles").upsert({ id: p.id, email });
  }
  const { error } = await db().from("profiles").update({ is_admin: true }).eq("id", p!.id);
  if (error) back("erro", error.message.includes("max_admins") ? "O limite é de 5 administradores." : "Não foi possível salvar.");
  back("ok", `${email} agora é administrador.`);
}

async function removeAdmin(d: FormData): Promise<void> {
  "use server";
  const s = await requireAdmin();
  const id = String(d.get("id"));
  if (id === s.id) redirect(`/equipe/administradores?erro=${encodeURIComponent("Você não pode remover o próprio acesso de administrador.")}`);
  await db().from("profiles").update({ is_admin: false }).eq("id", id);
  redirect("/equipe/administradores?ok=Administrador%20removido.");
}

export default async function AdminsPage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const s = await requireAdmin();
  const sp = await searchParams;
  const admins = unwrap(await db().from("profiles").select("id, email, name").eq("is_admin", true).order("created_at")) as { id: string; email: string; name: string }[];
  return (
    <div style={{ maxWidth: 640 }}>
      <h1>Administradores</h1>
      <p className="muted">Veem e fazem tudo, inclusive reembolsos, cupons e combos. Máximo de 5.</p>
      {sp.ok && <div className="okbox flash" role="status">{sp.ok}</div>}
      {sp.erro && <div className="alert flash" role="alert">{sp.erro}</div>}
      <div className="card stack">
        <ul className="plain">{admins.map((a) => (
          <li key={a.id}><span>{a.email}{a.id === s.id && <span className="muted"> (você)</span>}</span>
            {a.id !== s.id && <form action={removeAdmin}><input type="hidden" name="id" value={a.id} /><button className="btn sec sm" type="submit">Remover</button></form>}</li>
        ))}</ul>
        {admins.length < 5 && (
          <form className="actions" action={addAdmin} style={{ alignItems: "end" }}>
            <label htmlFor="adm" style={{ flex: 1, minWidth: 220 }}>Email do novo administrador<input id="adm" name="email" type="email" required /></label>
            <button className="btn" type="submit">Adicionar</button>
          </form>
        )}
      </div>
    </div>
  );
}
