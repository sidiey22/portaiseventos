"use client";

import { useActionState, useState } from "react";
import { submitRegistration, type FormState } from "./actions";

type Props = {
  eventId: number;
  sessions: { id: number; name: string; when: string }[];
  waitlist: boolean;
};

function isMinor(birthDate: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!match) return false;
  const today = new Date();
  let age = today.getFullYear() - Number(match[1]);
  const before = today.getMonth() + 1 < Number(match[2]) || (today.getMonth() + 1 === Number(match[2]) && today.getDate() < Number(match[3]));
  if (before) age--;
  return age < 18;
}

export function RegistrationForm({ eventId, sessions, waitlist }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(submitRegistration, {});
  const v = state.values ?? {};
  const e = state.errors ?? {};
  const [birth, setBirth] = useState(v.birthDate ?? "");

  return (
    <form action={action} className="stack" noValidate>
      <input type="hidden" name="eventId" value={eventId} />
      {state.message && <div className="alert" role="alert">{state.message}</div>}

      <label>
        Nome completo
        <input name="name" autoComplete="name" defaultValue={v.name} required />
        {e.name && <span className="err">{e.name}</span>}
      </label>
      <label>
        Email
        <input name="email" type="email" autoComplete="email" defaultValue={v.email} required />
        {e.email && <span className="err">{e.email}</span>}
      </label>
      <div className="row">
        <label>
          Telefone (com DDD)
          <input name="phone" type="tel" autoComplete="tel" inputMode="tel" defaultValue={v.phone} required />
          {e.phone && <span className="err">{e.phone}</span>}
        </label>
        <label>
          CPF
          <input name="cpf" inputMode="numeric" defaultValue={v.cpf} required />
          {e.cpf && <span className="err">{e.cpf}</span>}
        </label>
      </div>
      <label>
        Data de nascimento
        <input
          name="birthDate"
          type="date"
          defaultValue={v.birthDate}
          onChange={(event) => setBirth(event.target.value)}
          required
        />
        {e.birthDate && <span className="err">{e.birthDate}</span>}
      </label>

      {(isMinor(birth) || e.guardianPhone) && (
        <label>
          Telefone do responsável (obrigatório para menores de 18 anos)
          <input name="guardianPhone" type="tel" inputMode="tel" defaultValue={v.guardianPhone} />
          {e.guardianPhone && <span className="err">{e.guardianPhone}</span>}
        </label>
      )}

      {sessions.length > 0 && (
        <label>
          Sessão
          <select name="sessionId" defaultValue={v.sessionId ?? ""} required>
            <option value="" disabled>Escolha uma sessão</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>{s.name} · {s.when}</option>
            ))}
          </select>
          {e.sessionId && <span className="err">{e.sessionId}</span>}
        </label>
      )}

      <button type="submit" disabled={pending}>
        {pending ? "Enviando..." : waitlist ? "Entrar na fila de espera" : "Fazer inscrição"}
      </button>
    </form>
  );
}
