import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { sb, unwrap } from "./supabase.ts";

export type Role = "admin" | "volunteer";
export const MAX_ADMINS = 5;

// ---------- Senhas ----------

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

// ---------- Usuários ----------

export type User = { id: number; role: Role; login: string; name: string };

export async function countAdmins(): Promise<number> {
  const { count } = await sb().from("users").select("id", { count: "exact", head: true }).eq("role", "admin");
  return count ?? 0;
}

export async function createUser(
  input: { role: Role; login: string; name: string; password: string },
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  if (input.password.length < 8) return { ok: false, error: "A senha precisa ter pelo menos 8 caracteres." };
  if (input.role === "admin" && (await countAdmins()) >= MAX_ADMINS) {
    return { ok: false, error: `O limite é de ${MAX_ADMINS} administradores.` };
  }
  const { data, error } = await sb()
    .from("users")
    .insert({ role: input.role, login: input.login.trim().toLowerCase(), name: input.name, password_hash: hashPassword(input.password) })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { ok: false, error: "Já existe um usuário com esse login." };
    if (error.message.includes("max_admins")) return { ok: false, error: `O limite é de ${MAX_ADMINS} administradores.` };
    throw new Error(error.message);
  }
  return { ok: true, id: Number(data.id) };
}

export async function changePassword(userId: number, newPassword: string): Promise<boolean> {
  if (newPassword.length < 8) return false;
  unwrap(await sb().from("users").update({ password_hash: hashPassword(newPassword) }).eq("id", userId));
  return true;
}

/** Cria o admin e o login compartilhado dos voluntários na primeira execução, a partir do ambiente. */
export async function seedUsers(): Promise<void> {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminPassword && (await countAdmins()) === 0) {
    await createUser({ role: "admin", login: process.env.ADMIN_LOGIN ?? "admin", name: "Administrador", password: adminPassword });
  }
  const volunteerPassword = process.env.VOLUNTEER_PASSWORD;
  if (volunteerPassword) {
    const { count } = await sb().from("users").select("id", { count: "exact", head: true }).eq("role", "volunteer");
    if (!count) {
      await createUser({ role: "volunteer", login: process.env.VOLUNTEER_LOGIN ?? "voluntario", name: "Voluntários", password: volunteerPassword });
    }
  }
}

export async function authenticate(login: string, password: string): Promise<User | null> {
  const row = unwrap(
    await sb().from("users").select("id, role, login, name, password_hash").eq("login", login.trim().toLowerCase()).maybeSingle(),
  ) as { id: number; role: Role; login: string; name: string; password_hash: string } | null;
  // Roda o hash mesmo quando o usuário não existe, para não revelar quais logins existem pelo tempo de resposta.
  const ok = row ? verifyPassword(password, row.password_hash) : (verifyPassword(password, hashPassword("x")), false);
  if (!row || !ok) return null;
  return { id: row.id, role: row.role, login: row.login, name: row.name };
}

// ---------- Limite de tentativas de login ----------

const attempts = new Map<string, { count: number; first: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

export function loginAllowed(key: string, now = Date.now()): boolean {
  const entry = attempts.get(key);
  if (!entry || now - entry.first > WINDOW_MS) return true;
  return entry.count < MAX_ATTEMPTS;
}

export function recordLoginFailure(key: string, now = Date.now()): void {
  const entry = attempts.get(key);
  if (!entry || now - entry.first > WINDOW_MS) attempts.set(key, { count: 1, first: now });
  else entry.count++;
}

export function clearLoginFailures(key: string): void {
  attempts.delete(key);
}

// ---------- Sessão (cookie assinado) ----------

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 16) {
    if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET não configurado.");
    return "dev-only-secret-change-me";
  }
  return value;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSessionToken(user: User, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ uid: user.id, exp: now + SESSION_TTL_MS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readSessionToken(token: string | undefined, now = Date.now()): number | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { uid: number; exp: number };
    return data.exp > now ? data.uid : null;
  } catch {
    return null;
  }
}

export async function findUser(id: number): Promise<User | null> {
  return (unwrap(await sb().from("users").select("id, role, login, name").eq("id", id).maybeSingle()) as User | null) ?? null;
}
