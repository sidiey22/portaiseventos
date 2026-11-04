import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSessionToken, findUser, readSessionToken, seedUsers, type Role, type User } from "./auth.ts";

const COOKIE = "pe_session";
const g = globalThis as unknown as { __portaisSeeded?: Promise<void> };

/** Cria os usuários iniciais (a partir das variáveis de ambiente) na primeira chamada. */
export function ensureSeeded(): Promise<void> {
  if (!g.__portaisSeeded) {
    g.__portaisSeeded = seedUsers().catch((error) => {
      g.__portaisSeeded = undefined; // tenta de novo na próxima chamada
      throw error;
    });
  }
  return g.__portaisSeeded;
}

export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies();
  const uid = readSessionToken(store.get(COOKIE)?.value);
  return uid === null ? null : findUser(uid);
}

/** Exige um papel. Chame no início de toda página e de toda action protegida. */
export async function requireRole(role: Role): Promise<User> {
  const user = await getCurrentUser();
  if (!user || user.role !== role) redirect("/entrar");
  return user;
}

export async function startSession(user: User): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, createSessionToken(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 12 * 60 * 60,
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}
