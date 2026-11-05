import Link from "next/link";
import { requireAdmin } from "@/lib/staff";
import { createEventAction } from "../actions";

export default async function NewEventPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  await requireAdmin();
  const { erro } = await searchParams;
  return (
    <div style={{ maxWidth: 620 }}>
      <p className="nav2"><Link href="/equipe">← Visão geral</Link></p>
      <h1>Novo evento</h1>
      {erro && <div className="alert" role="alert">{erro}</div>}
      <form className="stack" action={createEventAction}>
        <label htmlFor="n-name">Nome do evento<input id="n-name" name="name" required /></label>
        <label htmlFor="n-sum">Descrição curta<input id="n-sum" name="summary" maxLength={160} /></label>
        <div className="row">
          <label htmlFor="n-kind">Tipo<select id="n-kind" name="kind"><option value="paid">Pago</option><option value="free">Gratuito (com inscrição)</option></select></label>
          <label htmlFor="n-cap">Vagas<input id="n-cap" name="capacity" type="number" min={1} required /></label>
        </div>
        <div className="row">
          <label htmlFor="n-start">Início<input id="n-start" name="startsAt" type="datetime-local" required /></label>
          <label htmlFor="n-end">Término (opcional)<input id="n-end" name="endsAt" type="datetime-local" /></label>
        </div>
        <div><button className="btn" type="submit">Criar evento</button></div>
        <p className="small muted">O evento nasce como rascunho. Depois você completa local, banner, lotes, descontos, formulário e equipe.</p>
      </form>
    </div>
  );
}
