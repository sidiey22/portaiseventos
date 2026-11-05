"use client";

import Link from "next/link";
import { useActionState } from "react";
import { forgotAction, setPasswordAction, signInAction, type AuthState } from "./actions";

export function SignInForm({ initialError }: { initialError?: string }) {
  const [s, act, pending] = useActionState<AuthState, FormData>(signInAction, { error: initialError });
  return (
    <form action={act} className="stack">
      {s.error && <div className="alert" role="alert">{s.error}</div>}
      <label htmlFor="email">Email<input id="email" name="email" type="email" autoComplete="username" defaultValue={s.email} required /></label>
      <label htmlFor="password">Senha<input id="password" name="password" type="password" autoComplete="current-password" required /></label>
      <button className="btn" type="submit" disabled={pending}>{pending ? "Entrando…" : "Entrar"}</button>
      <p className="small muted"><Link href="/equipe/esqueci">Esqueci a senha ou é meu primeiro acesso</Link></p>
    </form>
  );
}

export function ForgotForm() {
  const [s, act, pending] = useActionState<AuthState, FormData>(forgotAction, {});
  return (
    <form action={act} className="stack">
      {s.error && <div className="alert" role="alert">{s.error}</div>}
      {s.ok && <div className="okbox" role="status">{s.ok}</div>}
      <label htmlFor="email">Seu email<input id="email" name="email" type="email" autoComplete="username" defaultValue={s.email} required /></label>
      <button className="btn" type="submit" disabled={pending}>{pending ? "Enviando…" : "Enviar link"}</button>
      <p className="small muted"><Link href="/equipe/entrar">Voltar para o login</Link></p>
    </form>
  );
}

export function SetPasswordForm() {
  const [s, act, pending] = useActionState<AuthState, FormData>(setPasswordAction, {});
  return (
    <form action={act} className="stack">
      {s.error && <div className="alert" role="alert">{s.error}</div>}
      <label htmlFor="password">Nova senha (mínimo de 10 caracteres)<input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required /></label>
      <label htmlFor="confirm">Repita a senha<input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required /></label>
      <button className="btn" type="submit" disabled={pending}>{pending ? "Salvando…" : "Salvar senha e entrar"}</button>
    </form>
  );
}
