"use client";

import { useActionState } from "react";
import { createEventAction, type EventFormState } from "../../actions";

export function EventForm() {
  const [state, action, pending] = useActionState<EventFormState, FormData>(createEventAction, {});
  const v = state.values ?? {};
  return (
    <form action={action} className="stack">
      {state.error && <div className="alert" role="alert">{state.error}</div>}
      <label>Nome do evento<input name="name" defaultValue={v.name} required /></label>
      <label>Descrição<textarea name="description" rows={4} defaultValue={v.description} /></label>
      <label>Local<input name="location" defaultValue={v.location} required /></label>
      <div className="row">
        <label>Data e hora<input name="startsAt" type="datetime-local" defaultValue={v.startsAt} required /></label>
        <label>Vagas<input name="capacity" type="number" min={1} defaultValue={v.capacity} required /></label>
      </div>
      <label>
        Tipo
        <select name="kind" defaultValue={v.kind ?? "free"}>
          <option value="free">Gratuito (com inscrição)</option>
          <option value="paid">Pago</option>
        </select>
      </label>
      <button type="submit" disabled={pending}>{pending ? "Criando..." : "Criar evento"}</button>
      <p className="muted">O evento nasce como rascunho. Depois de criar, adicione sessões e lotes e publique.</p>
    </form>
  );
}
