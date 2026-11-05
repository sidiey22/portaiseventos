"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { Question, Quote } from "@/lib/types";
import { placeOrderAction, quoteAction } from "./actions";

type Ev = { id: number; kind: "paid" | "free"; questions: Question[]; sessions: { id: number; label: string }[]; combos: { id: number; name: string; count: number; price: number }[] };
type P = { name: string; gender: string; birth_date: string; answers: Record<string, unknown> };
const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const emptyPerson = (): P => ({ name: "", gender: "", birth_date: "", answers: {} });

export function Checkout({ event, lotLabel, seatsLeft }: { event: Ev; lotLabel: string; seatsLeft: number }) {
  const wait = seatsLeft <= 0;
  const [avulsos, setAvulsos] = useState(1);
  const [combos, setCombos] = useState<Record<number, number>>({});
  const n = avulsos + (wait ? 0 : event.combos.reduce((a, c) => a + (combos[c.id] ?? 0) * c.count, 0));
  const [people, setPeople] = useState<P[]>([emptyPerson()]);
  const [buyer, setBuyer] = useState({ name: "", email: "", phone: "", cpf: "", adult: false });
  const [session, setSession] = useState("");
  const [coupon, setCoupon] = useState("");
  const [couponApplied, setCouponApplied] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [q, setQ] = useState<Quote | null>(null);
  const [qErr, setQErr] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    setPeople((list) => { const next = list.slice(0, n); while (next.length < n) next.push(emptyPerson()); return next; });
  }, [n]);

  const comboPicks = useMemo(() => wait ? [] : event.combos.filter((c) => (combos[c.id] ?? 0) > 0).map((c) => ({ combo_id: c.id, quantity: combos[c.id]! })), [combos, event.combos, wait]);
  const births = people.map((p) => p.birth_date).join("|");
  useEffect(() => {
    if (wait || event.kind === "free" || n < 1 || n > 20) { setQ(null); return; }
    const t = setTimeout(async () => {
      const r = await quoteAction(event.id, births.split("|"), comboPicks, couponApplied);
      if (r.ok) { setQ(r.quote); setQErr(""); } else { setQ(null); setQErr(r.error); }
    }, 350);
    return () => clearTimeout(t);
  }, [births, comboPicks, couponApplied, event.id, event.kind, n, wait]);

  const setP = (i: number, patch: Partial<P>) => setPeople((l) => l.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const setA = (i: number, qid: number, v: unknown) => setPeople((l) => l.map((p, j) => (j === i ? { ...p, answers: { ...p.answers, [qid]: v } } : p)));
  const err = (k: string) => errors[k] ? <span className="err">{errors[k]}</span> : null;

  const applyCoupon = () => start(async () => {
    const code = coupon.trim();
    if (!code) { setCouponApplied(""); setErrors((e) => { const x = { ...e }; delete x.coupon; return x; }); return; }
    const r = await quoteAction(event.id, people.map((p) => p.birth_date), comboPicks, code);
    if (r.ok) { setCouponApplied(code); setQ(r.quote); setErrors((e) => { const x = { ...e }; delete x.coupon; return x; }); }
    else setErrors((e) => ({ ...e, coupon: r.error }));
  });

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (coupon.trim() && coupon.trim().toUpperCase() !== couponApplied.toUpperCase()) { setErrors((e) => ({ ...e, coupon: 'Clique em "Aplicar" para usar o cupom, ou apague o código.' })); return; }
    start(async () => {
      const r = await placeOrderAction({ eventId: event.id, sessionId: session ? Number(session) : null, people, buyer, combos: comboPicks, coupon: couponApplied });
      if (r && !r.ok) { setErrors(r.errors ?? {}); setMessage(r.message); requestAnimationFrame(() => document.querySelector(".err, .alert")?.scrollIntoView({ block: "center" })); }
    });
  };

  const step = (label: string, sub: string, val: number, set: (v: number) => void, max: number) => (
    <div className="stepper">
      <div><strong>{label}</strong><span className="muted small">{sub}</span></div>
      <div className="step-ctl">
        <button type="button" className="btn sec sm" aria-label={`Menos ${label}`} onClick={() => set(Math.max(0, val - 1))}>−</button>
        <output aria-live="polite">{val}</output>
        <button type="button" className="btn sec sm" aria-label={`Mais ${label}`} onClick={() => set(Math.min(max, val + 1))}>+</button>
      </div>
    </div>
  );

  return (
    <form onSubmit={submit} noValidate>
      {message && <div className="alert" role="alert">{message}</div>}
      <h2 style={{ marginTop: 0 }}>{wait ? "Fila de espera" : "1. Ingressos"}</h2>
      {wait && <p className="notice">O evento esgotou. Sua compra entra na fila com todos os participantes. Quando abrirem vagas suficientes, avisamos por email e você tem 12 horas para pagar.</p>}
      <div className="steppers">
        {step("Ingresso avulso", lotLabel, avulsos, (v) => setAvulsos(n - avulsos + v === 0 ? 1 : v), 20)}
        {!wait && event.combos.map((c) => step(c.name, `${c.count} ingressos por ${brl(c.price)}`, combos[c.id] ?? 0, (v) => setCombos((m) => ({ ...m, [c.id]: v })), 5))}
      </div>
      {n > 20 && <p className="err">O máximo é de 20 ingressos por compra.</p>}
      {!wait && n > seatsLeft && <p className="err" role="alert">Restam só {seatsLeft} {seatsLeft === 1 ? "vaga" : "vagas"}. Diminua a quantidade para continuar.</p>}
      {event.sessions.length > 0 && (
        <label htmlFor="f-session" style={{ marginTop: 14 }}>Sessão
          <select id="f-session" value={session} onChange={(e) => setSession(e.target.value)}>
            <option value="">Escolha uma sessão</option>
            {event.sessions.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>{err("session")}
        </label>
      )}

      <h2>2. Participantes</h2>
      <p className="muted small">Um QR code para cada pessoa. Todos são enviados para o email de quem está comprando.</p>
      {people.map((p, i) => (
        <fieldset className="person" key={i}>
          <legend>Participante {i + 1}</legend>
          <label htmlFor={`p${i}-name`}>Nome completo<input id={`p${i}-name`} autoComplete="off" value={p.name} onChange={(e) => setP(i, { name: e.target.value })} />{err(`p${i}-name`)}</label>
          <div className="row">
            <fieldset className="radio-row"><legend>Gênero</legend>
              <label><input type="radio" name={`p${i}-g`} checked={p.gender === "F"} onChange={() => setP(i, { gender: "F" })} /> Feminino</label>
              <label><input type="radio" name={`p${i}-g`} checked={p.gender === "M"} onChange={() => setP(i, { gender: "M" })} /> Masculino</label>
              {err(`p${i}-gender`)}
            </fieldset>
            <label htmlFor={`p${i}-birth`}>Data de nascimento<input id={`p${i}-birth`} type="date" value={p.birth_date} onChange={(e) => setP(i, { birth_date: e.target.value })} />{err(`p${i}-birth`)}</label>
          </div>
          {event.questions.map((q) => <QuestionField key={q.id} q={q} i={i} value={p.answers[q.id]} onChange={(v) => setA(i, q.id, v)} error={errors[`p${i}-q${q.id}`]} />)}
        </fieldset>
      ))}

      <h2>3. Quem está comprando</h2>
      <div className="stack">
        <label htmlFor="b-name">Nome completo<input id="b-name" autoComplete="name" value={buyer.name} onChange={(e) => setBuyer({ ...buyer, name: e.target.value })} />{err("b-name")}</label>
        <label htmlFor="b-email">Email (os QR codes chegam aqui)<input id="b-email" type="email" autoComplete="email" value={buyer.email} onChange={(e) => setBuyer({ ...buyer, email: e.target.value })} />{err("b-email")}</label>
        <div className="row">
          <label htmlFor="b-phone">Telefone com DDD<input id="b-phone" type="tel" autoComplete="tel" value={buyer.phone} onChange={(e) => setBuyer({ ...buyer, phone: e.target.value })} />{err("b-phone")}</label>
          <label htmlFor="b-cpf">CPF<input id="b-cpf" inputMode="numeric" autoComplete="off" value={buyer.cpf} onChange={(e) => setBuyer({ ...buyer, cpf: e.target.value })} />{err("b-cpf")}</label>
        </div>
        <label className="check"><input type="checkbox" checked={buyer.adult} onChange={(e) => setBuyer({ ...buyer, adult: e.target.checked })} /> Tenho 18 anos ou mais e sou responsável pelos menores desta compra.</label>
        {err("b-adult")}
      </div>

      {event.kind === "paid" && !wait && (
        <>
          <h2>4. Cupom de desconto</h2>
          <div className="coupon-row">
            <label htmlFor="coupon" style={{ flex: 1 }}>Código do cupom<input id="coupon" autoComplete="off" value={coupon} onChange={(e) => setCoupon(e.target.value)} /></label>
            <button type="button" className="btn sec" onClick={applyCoupon} disabled={pending}>Aplicar</button>
          </div>
          {err("coupon")}
          {couponApplied && <p className="small" style={{ color: "var(--ok)", marginTop: 6 }}>Cupom {couponApplied.toUpperCase()} aplicado.</p>}
        </>
      )}

      <div className="sum-box" aria-live="polite">
        {wait ? <div className="sum-line"><span>{n} {n === 1 ? "participante" : "participantes"} na fila</span><span>Valor calculado quando você for chamado</span></div>
          : event.kind === "free" ? <div className="sum-line total"><span>{n} {n === 1 ? "inscrição" : "inscrições"}</span><span>Gratuito</span></div>
          : q ? <>
              <p className="eyebrow" style={{ margin: "0 0 8px" }}>Resumo</p>
              <div className="sum-line"><span>{n} {n === 1 ? "ingresso" : "ingressos"} · {lotLabel}</span><span>{brl(q.subtotal)}</span></div>
              {q.age_discount > 0 && <div className="sum-line disc"><span>Desconto por idade</span><span>− {brl(q.age_discount)}</span></div>}
              {q.combo_total > 0 && <div className="sum-line disc"><span>Combo</span><span>{q.combo_discount >= 0 ? `− ${brl(q.combo_discount)}` : `+ ${brl(-q.combo_discount)}`}</span></div>}
              {q.coupon_discount > 0 && <div className="sum-line disc"><span>Cupom</span><span>− {brl(q.coupon_discount)}</span></div>}
              <div className="sum-line total"><span>Total</span><span>{brl(q.total)}</span></div>
            </> : <p className="muted small" style={{ margin: 0 }}>{qErr || "Calculando…"}</p>}
      </div>
      <button className="btn" type="submit" style={{ width: "100%", marginTop: 14 }} disabled={pending || n < 1 || n > 20 || (!wait && n > seatsLeft)}>
        {pending ? "Enviando…" : wait ? "Entrar na fila de espera" : event.kind === "free" ? "Confirmar inscrição" : "Ir para o pagamento"}
      </button>
    </form>
  );
}

function QuestionField({ q, i, value, onChange, error }: { q: Question; i: number; value: unknown; onChange: (v: unknown) => void; error?: string }) {
  const id = `p${i}-q${q.id}`;
  const label = <>{q.label}{!q.required && <span className="muted"> (opcional)</span>}</>;
  const err = error ? <span className="err">{error}</span> : null;
  if (q.type === "yes_no") return (
    <fieldset className="radio-row"><legend>{label}</legend>
      <label><input type="radio" name={id} checked={value === "sim"} onChange={() => onChange("sim")} /> Sim</label>
      <label><input type="radio" name={id} checked={value === "não"} onChange={() => onChange("não")} /> Não</label>{err}
    </fieldset>
  );
  if (q.type === "single_choice") return (
    <label htmlFor={id}>{label}<select id={id} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}><option value="">Escolha</option>{q.options.map((o) => <option key={o}>{o}</option>)}</select>{err}</label>
  );
  if (q.type === "multi_choice") {
    const list = Array.isArray(value) ? (value as string[]) : [];
    return (
      <fieldset className="radio-row"><legend>{label}</legend>
        {q.options.map((o) => <label key={o}><input type="checkbox" checked={list.includes(o)} onChange={(e) => onChange(e.target.checked ? [...list, o] : list.filter((x) => x !== o))} /> {o}</label>)}{err}
      </fieldset>
    );
  }
  if (q.type === "long_text") return <label htmlFor={id}>{label}<textarea id={id} rows={2} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />{err}</label>;
  return <label htmlFor={id}>{label}<input id={id} type={q.type === "number" ? "number" : q.type === "date" ? "date" : "text"} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />{err}</label>;
}
