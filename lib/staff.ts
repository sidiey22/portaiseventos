import { redirect } from "next/navigation";
import { authClient, db, unwrap } from "./supabase.ts";

export type Staff = { id: string; email: string; name: string; isAdmin: boolean };

/** Pessoa da equipe logada (Supabase Auth) ou null. Confere o usuário no servidor do Supabase a cada pedido. */
export async function getStaff(): Promise<Staff | null> {
  const auth = await authClient();
  const { data } = await auth.auth.getUser();
  const user = data.user;
  if (!user?.email) return null;
  const email = user.email.toLowerCase();
  let profile = unwrap(await db().from("profiles").select("id, email, name, is_admin").eq("id", user.id).maybeSingle()) as
    | { id: string; email: string; name: string; is_admin: boolean } | null;
  if (!profile) {
    profile = unwrap(await db().from("profiles").insert({ id: user.id, email }).select("id, email, name, is_admin").single());
  }
  // Primeiro administrador: o email definido em ADMIN_EMAIL vira admin enquanto não houver nenhum.
  if (!profile!.is_admin && process.env.ADMIN_EMAIL && email === process.env.ADMIN_EMAIL.trim().toLowerCase()) {
    const { count } = await db().from("profiles").select("id", { count: "exact", head: true }).eq("is_admin", true);
    if (!count) {
      await db().from("profiles").update({ is_admin: true }).eq("id", user.id);
      profile!.is_admin = true;
    }
  }
  return { id: profile!.id, email, name: profile!.name || email.split("@")[0]!, isAdmin: profile!.is_admin };
}

export async function requireStaff(): Promise<Staff> {
  const s = await getStaff();
  if (!s) redirect("/equipe/entrar");
  return s;
}

export async function requireAdmin(): Promise<Staff> {
  const s = await requireStaff();
  if (!s.isAdmin) redirect("/equipe");
  return s;
}

export async function canManage(s: Staff, eventId: number): Promise<boolean> {
  if (s.isAdmin) return true;
  return Boolean(unwrap(await db().rpc("can_manage_event", { p_user: s.id, p_event: eventId })));
}

export async function canCheckin(s: Staff, eventId: number): Promise<boolean> {
  if (s.isAdmin) return true;
  return Boolean(unwrap(await db().rpc("can_checkin", { p_user: s.id, p_event: eventId })));
}

/** Exige permissão de gerente (ou admin) no evento; senão volta para a área da equipe. */
export async function requireManager(eventId: number): Promise<Staff> {
  const s = await requireStaff();
  if (!Number.isInteger(eventId) || !(await canManage(s, eventId))) redirect("/equipe");
  return s;
}

/** IDs dos eventos em que a pessoa é gerente (admin: todos). */
export async function managedEventIds(s: Staff): Promise<number[] | "all"> {
  if (s.isAdmin) return "all";
  const rows = unwrap(await db().from("event_staff").select("event_id").eq("email", s.email).eq("role", "manager")) as { event_id: number }[];
  return rows.map((r) => r.event_id);
}

/** IDs dos eventos em que a pessoa pode fazer check-in. */
export async function checkinEventIds(s: Staff): Promise<number[] | "all"> {
  if (s.isAdmin) return "all";
  const rows = unwrap(await db().from("event_staff").select("event_id").eq("email", s.email)) as { event_id: number }[];
  return [...new Set(rows.map((r) => r.event_id))];
}
