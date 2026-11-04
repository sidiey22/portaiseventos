"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authenticate, clearLoginFailures, loginAllowed, recordLoginFailure } from "@/lib/auth";
import { endSession, ensureSeeded, startSession } from "@/lib/session";

export type LoginState = { error?: string; login?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const loginName = String(formData.get("login") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const key = `${ip}|${loginName}`;

  if (!loginAllowed(key)) return { error: "Muitas tentativas. Aguarde alguns minutos e tente de novo.", login: loginName };

  await ensureSeeded();
  const user = await authenticate(loginName, password);
  if (!user) {
    recordLoginFailure(key);
    return { error: "Login ou senha incorretos.", login: loginName };
  }
  clearLoginFailures(key);
  await startSession(user);
  redirect(user.role === "admin" ? "/admin" : "/voluntario");
}

export async function logout(): Promise<void> {
  await endSession();
  redirect("/");
}
