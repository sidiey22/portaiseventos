"use server";

import { redirect } from "next/navigation";
import { authClient, db } from "@/lib/supabase";
import { allow, clientIp } from "@/lib/rate-limit";
import { isEmail } from "@/lib/validation";
import { publicUrl } from "@/lib/mail";

export type AuthState = { error?: string; ok?: string; email?: string };

export async function signInAction(_: AuthState, data: FormData): Promise<AuthState> {
  const email = String(data.get("email") ?? "").trim().toLowerCase();
  const password = String(data.get("password") ?? "");
  const ip = await clientIp();
  if (!allow(`login:${ip}`, 10, 15 * 60_000) || !allow(`login:${email}`, 8, 15 * 60_000)) return { error: "Muitas tentativas. Aguarde alguns minutos e tente de novo.", email };
  if (!isEmail(email) || !password) return { error: "Informe email e senha.", email };
  const auth = await authClient();
  const { error } = await auth.auth.signInWithPassword({ email, password });
  if (error) return { error: "Email ou senha incorretos.", email };
  redirect("/equipe");
}

/** Primeiro acesso do administrador ou troca de senha. A resposta é sempre a mesma, para não revelar quais emails existem. */
export async function forgotAction(_: AuthState, data: FormData): Promise<AuthState> {
  const email = String(data.get("email") ?? "").trim().toLowerCase();
  if (!allow(`forgot:${await clientIp()}`, 5, 15 * 60_000)) return { error: "Muitas tentativas. Aguarde alguns minutos." };
  if (!isEmail(email)) return { error: "Informe um email válido.", email };
  const redirectTo = publicUrl("/auth/confirm");
  const { data: profile } = await db().from("profiles").select("id").eq("email", email).maybeSingle();
  const firstAdmin = process.env.ADMIN_EMAIL && email === process.env.ADMIN_EMAIL.trim().toLowerCase();
  try {
    if (profile) await (await authClient()).auth.resetPasswordForEmail(email, { redirectTo });
    else if (firstAdmin) await db().auth.admin.inviteUserByEmail(email, { redirectTo });
  } catch (e) { console.error("Falha ao enviar link de acesso:", e); }
  return { ok: "Se este email faz parte da equipe, você vai receber um link para criar a senha. Confira também o spam." };
}

export async function setPasswordAction(_: AuthState, data: FormData): Promise<AuthState> {
  const password = String(data.get("password") ?? ""), confirm = String(data.get("confirm") ?? "");
  if (password.length < 10) return { error: "A senha precisa ter pelo menos 10 caracteres." };
  if (password !== confirm) return { error: "As duas senhas não são iguais." };
  const auth = await authClient();
  const { data: u } = await auth.auth.getUser();
  if (!u.user) return { error: "O link expirou. Peça um novo em \"Esqueci a senha\"." };
  const { error } = await auth.auth.updateUser({ password });
  if (error) return { error: "Não foi possível salvar a senha. Use uma senha diferente e mais longa." };
  redirect("/equipe");
}

export async function signOutAction(): Promise<void> {
  await (await authClient()).auth.signOut();
  redirect("/equipe/entrar");
}
