import Link from "next/link";
import { notFound } from "next/navigation";
import { Art } from "@/components/art";
import { Icon } from "@/components/icons";
import { availability, bandLabel, getEvent, lotSold, refDate, type EventFull } from "@/lib/events";
import { applyFilters, answerText, loadRows, type Filters, type Row } from "@/lib/report";
import { requireManager, type Staff } from "@/lib/staff";
import { db, unwrap } from "@/lib/supabase";
import { dayKey, dayLabel, eventDays, formatBRL, formatDate, formatDateTime, formatRange, isoToLocalInput } from "@/lib/time";
import { ORDER_STATUS, QUESTION_TYPES, type OrderStatus } from "@/lib/types";
import * as A from "../actions";
import { PlacePicker } from "./place-picker";

export const dynamic = "force-dynamic";
const STATUS: Record<string, string> = { draft: "Rascunho", published: "Publicado", closed: "Encerrado" };
const TABS = [["painel", "Painel e inscritos"], ["editar", "Dados do evento"], ["precos", "Lotes e preços"], ["form", "Formulário"], ["equipe", "Equipe"]] as const;
type SP = Filters & { aba?: string; ok?: string; erro?: string; export?: string };

export default async function ManageEvent({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const id = Number((await params).id);
  const sp = await searchParams;
  const s = await requireManager(id);
  await db().rpc("expire_stale");
  const e = await getEvent(id);
  if (!e) notFound();
  const tab = TABS.some(([k]) => k === sp.aba) ? sp.aba! : "painel";
  const Hidden = () => <input type="hidden" name="eventId" value={e.id} />;
  return (
    <>
      <p className="nav2"><Link href="/equipe">← {s.isAdmin ? "Visão geral" : "Meus eventos"}</Link></p>
      <div className="actions" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div><p className="eyebrow">{STATUS[e.status]} · {e.kind === "paid" ? "Pago" : "Gratuito"}</p><h1 style={{ margin: 0 }}>{e.name}</h1><p className="muted" style={{ margin: "4px 0 0" }}>{formatRange(e.starts_at, e.ends_at)}</p></div>
        <div className="actions">
          {e.status === "published" && <Link className="btn sec sm" href={`/eventos/${e.slug}`} target="_blank">Ver página pública</Link>}
          <Link className="btn sec sm" href={`/equipe/checkin?evento=${e.id}`}><Icon name="scan" /> Check-in</Link>
        </div>
      </div>
      {sp.ok && <div className="okbox flash" role="status" style={{ marginTop: 14 }}>{sp.ok}</div>}
      {sp.erro && <div className="alert flash" role="alert" style={{ marginTop: 14 }}>{sp.erro}</div>}
      <nav className="tabs" aria-label="Seções do evento">{TABS.map(([k, l]) => <Link key={k} href={`/equipe/eventos/${e.id}?aba=${k}`} role="tab" aria-selected={tab === k} className="tab">{l}</Link>)}</nav>
      {tab === "painel" && <Panel e={e} s={s} sp={sp} />}
      {tab === "editar" && <Edit e={e} s={s} Hidden={Hidden} />}
      {tab === "precos" && <Prices e={e} s={s} Hidden={Hidden} />}
      {tab === "form" && <FormTab e={e} Hidden={Hidden} />}
      {tab === "equipe" && <Team e={e} s={s} Hidden={Hidden} />}
    </>
  );
}

/* ---------- painel ---------- */
function Bars({ data, label }: { data: { l: string; v: number }[]; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.v)), w = 560, h = 160, pad = 26, bw = (w - pad) / Math.max(1, data.length);
  const ticks = [0, Math.ceil(max / 2), max];
  return (
    <svg viewBox={`0 0 ${w} ${h + 24}`} className="chart" role="img" aria-label={label}>
      {ticks.map((t) => { const y = h - (t / max) * (h - 14); return <g key={t}><line x1={pad} x2={w} y1={y} y2={y} className="c-grid" /><text x={pad - 6} y={y + 4} className="c-lab" textAnchor="end">{t}</text></g>; })}
      {data.map((d, i) => { const bh = (d.v / max) * (h - 14), x = pad + i * bw + bw * 0.18; return (
        <g key={i}><rect x={x} y={h - bh} width={bw * 0.64} height={bh} rx={3} className="c-bar"><title>{`${d.l}: ${d.v}`}</title></rect>
          {(data.length <= 16 || i % 2 === 0) && <text x={x + bw * 0.32} y={h + 16} className="c-lab" textAnchor="middle">{d.l}</text>}</g>); })}
    </svg>
  );
}

async function Panel({ e, s, sp }: { e: EventFull; s: Staff; sp: SP }) {
  const all = await loadRows(e);
  const f: Filters = { gender: sp.gender, lot: sp.lot, status: sp.status, band: sp.band, ck: sp.ck, q: sp.q, qv: sp.qv };
  const rows = applyFilters(all, f);
  const filtered = Object.values(f).some(Boolean);
  const conf = rows.filter((r) => r.status === "confirmed");
  const revenue = conf.reduce((a, r) => a + r.price - r.couponShare, 0);
  const a = await availability(e);
  const q = e.questions.find((x) => String(x.id) === sp.q);
  const first = all.length ? all.reduce((m, r) => (r.createdAt < m ? r.createdAt : m), all[0]!.createdAt) : new Date().toISOString();
  const days: string[] = [];
  for (let t = Math.max(new Date(first).getTime(), Date.now() - 30 * 86_400_000); dayKey(new Date(t)) <= dayKey(new Date()); t += 86_400_000) days.push(dayKey(new Date(t)));
  const inscr = days.map((d) => ({ l: dayLabel(d), v: rows.filter((r) => dayKey(r.createdAt) === d && r.status !== "expired").length }));
  const ckd = eventDays(e.starts_at, e.ends_at).map((d) => ({ l: dayLabel(d), v: rows.filter((r) => r.checkins.includes(d)).length }));
  const exportQs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]);
  const opt = (v: string, l: string) => <option key={v} value={v}>{l}</option>;
  return (
    <>
      <div className="kpis">
        <div className="kpi"><span className="muted small">Arrecadado</span><strong>{e.kind === "paid" ? formatBRL(Math.round(revenue)) : "Gratuito"}</strong><span className="muted small">{filtered ? "com os filtros" : "compras confirmadas"}</span></div>
        <div className="kpi"><span className="muted small">Inscritos</span><strong>{conf.length}</strong><span className="muted small">confirmados</span></div>
        <div className="kpi"><span className="muted small">Check-ins</span><strong>{conf.filter((r) => r.checkins.length).length}</strong><span className="muted small">pessoas que entraram</span></div>
        <div className="kpi"><span className="muted small">Vagas restantes</span><strong>{a.seatsLeft} de {e.capacity}</strong></div>
        <div className="kpi"><span className="muted small">Fila de espera</span><strong>{rows.filter((r) => r.status === "waitlist").length}</strong><span className="muted small">pessoas</span></div>
      </div>
      <form className="filters" method="get" aria-label="Filtros">
        <input type="hidden" name="aba" value="painel" />
        <label htmlFor="fl-gender">Gênero<select id="fl-gender" name="gender" defaultValue={f.gender ?? ""}>{opt("", "Todos")}{opt("F", "Feminino")}{opt("M", "Masculino")}</select></label>
        {e.lots.length > 0 && <label htmlFor="fl-lot">Lote<select id="fl-lot" name="lot" defaultValue={f.lot ?? ""}>{opt("", "Todos")}{e.lots.map((l) => opt(String(l.id), l.name))}</select></label>}
        <label htmlFor="fl-status">Pagamento<select id="fl-status" name="status" defaultValue={f.status ?? ""}>{opt("", "Todos")}{(Object.keys(ORDER_STATUS) as OrderStatus[]).map((k) => opt(k, ORDER_STATUS[k]))}</select></label>
        {e.age_bands.length > 0 && <label htmlFor="fl-band">Faixa de idade<select id="fl-band" name="band" defaultValue={f.band ?? ""}>{opt("", "Todas")}{e.age_bands.map((b) => opt(String(b.id), `${b.min_age} a ${b.max_age} anos`))}{opt("none", "Sem desconto")}</select></label>}
        <label htmlFor="fl-ck">Check-in<select id="fl-ck" name="ck" defaultValue={f.ck ?? ""}>{opt("", "Todos")}{opt("yes", "Com check-in")}{opt("no", "Sem check-in")}</select></label>
        {e.questions.length > 0 && <label htmlFor="fl-q">Pergunta<select id="fl-q" name="q" defaultValue={f.q ?? ""}>{opt("", "Nenhuma")}{e.questions.map((x) => opt(String(x.id), x.label))}</select></label>}
        {q && (q.type === "yes_no" || q.type === "single_choice" || q.type === "multi_choice"
          ? <label htmlFor="fl-qv">Resposta<select id="fl-qv" name="qv" defaultValue={f.qv ?? ""}>{opt("", "Qualquer")}{(q.type === "yes_no" ? ["sim", "não"] : q.options).map((o) => opt(o, o))}</select></label>
          : <label htmlFor="fl-qv">Resposta contém<input id="fl-qv" name="qv" defaultValue={f.qv ?? ""} /></label>)}
        <div className="actions" style={{ alignSelf: "end" }}><button className="btn sm" type="submit">Filtrar</button>{filtered && <Link className="btn sec sm" href={`/equipe/eventos/${e.id}?aba=painel`}>Limpar</Link>}</div>
      </form>
      <div className="charts">
        <figure className="card"><figcaption><Icon name="chart" /> Inscrições por dia</figcaption><Bars data={inscr} label="Inscrições por dia" /></figure>
        <figure className="card"><figcaption><Icon name="scan" /> Check-ins por dia do evento</figcaption><Bars data={ckd} label="Check-ins por dia do evento" /></figure>
      </div>
      <div className="sec-head" style={{ marginTop: 28 }}>
        <h2>Inscritos ({rows.length})</h2>
        <div className="actions">
          <a className="btn sec sm" href={`/equipe/eventos/${e.id}/exportar?formato=csv&${exportQs}`}>Exportar CSV</a>
          <a className="btn sec sm" href={`/equipe/eventos/${e.id}/exportar?formato=xlsx&${exportQs}`}>Exportar Excel</a>
        </div>
      </div>
      {rows.length ? <RowsTable e={e} rows={rows} admin={s.isAdmin} /> : <p className="card muted">Nenhum inscrito com esses filtros.</p>}
      {!s.isAdmin && <p className="small muted">Reembolsos são feitos só pelo administrador.</p>}
    </>
  );
}

function RowsTable({ e, rows, admin }: { e: EventFull; rows: Row[]; admin: boolean }) {
  return (
    <div className="card table-scroll"><table>
      <thead><tr><th>Participante</th><th>Gênero</th><th>Idade</th><th>Lote</th><th>Situação</th><th>Check-in</th>{e.questions.map((q) => <th key={q.id}>{q.label}</th>)}<th>Comprador</th><th>Valor</th>{admin && <th />}</tr></thead>
      <tbody>{rows.map((r) => (
        <tr key={r.ticketCode}>
          <td>{r.name}</td><td>{r.gender === "F" ? "Feminino" : "Masculino"}</td><td className="num">{r.age ?? "—"}</td><td>{r.comboName || r.lotName || "—"}</td>
          <td><span className={`badge ${r.status === "confirmed" ? "ok" : r.status === "cancelled" || r.status === "expired" ? "bad" : "warn"}`}>{ORDER_STATUS[r.status]}</span></td>
          <td>{r.checkins.map(dayLabel).join(", ") || <span className="muted">—</span>}</td>
          {e.questions.map((q) => <td key={q.id}>{answerText(r.answers[String(q.id)])}</td>)}
          <td className="small">{r.buyer.name}<br /><span className="muted">{r.buyer.email}<br />{r.buyer.phone}</span></td>
          <td className="num">{e.kind === "paid" ? formatBRL(Math.round(r.price - r.couponShare)) : "—"}</td>
          {admin && <td>{r.position === 0 && r.status === "confirmed" && (
            <form action={A.refundAction}><input type="hidden" name="eventId" value={e.id} /><input type="hidden" name="orderCode" value={r.orderCode} />
              <button className="btn danger sm" type="submit">{r.orderTotal > 0 ? "Reembolsar compra" : "Cancelar compra"}</button></form>)}</td>}
        </tr>
      ))}</tbody>
    </table></div>
  );
}

/* ---------- dados do evento ---------- */
function Edit({ e, s, Hidden }: { e: EventFull; s: Staff; Hidden: () => React.ReactElement }) {
  const a = s.isAdmin;
  return (
    <>
      <form className="stack" action={A.updateEventAction}>
        <Hidden />
        <div className="card stack"><h2 style={{ margin: 0 }}>Informações</h2>
          <label htmlFor="e-name">Nome do evento<input id="e-name" name="name" defaultValue={e.name} disabled={!a} /></label>
          <label htmlFor="e-sum">Descrição curta (cartão da vitrine)<input id="e-sum" name="summary" maxLength={160} defaultValue={e.summary} /></label>
          <label htmlFor="e-desc">Sobre o evento<textarea id="e-desc" name="description" rows={5} defaultValue={e.description} /></label>
          <div className="row">
            <label htmlFor="e-kind">Tipo<select id="e-kind" name="kind" defaultValue={e.kind} disabled={!a}><option value="paid">Pago</option><option value="free">Gratuito</option></select></label>
            <label htmlFor="e-cap">Vagas<input id="e-cap" name="capacity" type="number" min={1} defaultValue={e.capacity} disabled={!a} /></label>
          </div>
          {!a && <p className="small muted" style={{ margin: 0 }}>Nome, tipo, vagas e publicação são alterados só pelo administrador.</p>}
        </div>
        <div className="card stack"><h2 style={{ margin: 0 }}>Datas</h2>
          <div className="row">
            <label htmlFor="e-start">Início<input id="e-start" name="startsAt" type="datetime-local" defaultValue={isoToLocalInput(e.starts_at)} required /></label>
            <label htmlFor="e-end">Término (opcional)<input id="e-end" name="endsAt" type="datetime-local" defaultValue={isoToLocalInput(e.ends_at)} /></label>
          </div>
          <p className="small muted" style={{ margin: 0 }}>Horário de Brasília. Com término em outro dia, o check-in passa a ser feito uma vez por dia.</p>
        </div>
        <div className="card stack"><h2 style={{ margin: 0 }}>Local</h2>
          <PlacePicker mapsKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY} initial={{ name: e.place_name, address: e.place_address, lat: e.place_lat, lng: e.place_lng }} />
        </div>
        <div><button className="btn" type="submit">Salvar alterações</button></div>
      </form>
      <div className="card stack" style={{ marginTop: 16 }}><h2 style={{ margin: 0 }}>Banner</h2>
        <div className="banner-prev"><Art event={e} /></div>
        <form className="actions" action={A.uploadBannerAction} style={{ alignItems: "end" }}>
          <Hidden />
          <label htmlFor="e-banner" style={{ flex: 1, minWidth: 220 }}>Enviar banner (JPG, PNG ou WebP até 5 MB, ideal 1600 × 900 px)<input id="e-banner" name="banner" type="file" accept="image/jpeg,image/png,image/webp" required /></label>
          <button className="btn sec" type="submit">Enviar</button>
        </form>
        {e.banner_path && <form action={A.clearBannerAction}><Hidden /><button className="btn sec sm" type="submit">Usar o banner automático</button></form>}
      </div>
      {a && (
        <div className="card actions" style={{ marginTop: 16 }}>
          <span className="badge">{STATUS[e.status]}</span>
          {e.status !== "published"
            ? <form action={A.setStatusAction}><Hidden /><input type="hidden" name="status" value="published" /><button className="btn" type="submit">Publicar inscrições</button></form>
            : <form action={A.setStatusAction}><Hidden /><input type="hidden" name="status" value="closed" /><button className="btn sec" type="submit">Encerrar inscrições</button></form>}
        </div>
      )}
    </>
  );
}

/* ---------- lotes, idade e combos ---------- */
async function Prices({ e, s, Hidden }: { e: EventFull; s: Staff; Hidden: () => React.ReactElement }) {
  if (e.kind !== "paid") return <p className="card muted">Evento gratuito: não tem lotes nem preços.</p>;
  const a = s.isAdmin, now = Date.now();
  const sold = await Promise.all(e.lots.map((l) => lotSold(l.id)));
  const av = await availability(e);
  const usedCombo = unwrap(await db().from("order_combos").select("combo_id, orders!inner(status)").eq("orders.status", "confirmed").in("combo_id", e.combos.map((c) => c.id).concat(0))) as { combo_id: number }[];
  return (
    <>
      <h2>Lotes</h2>
      <p className="muted small">O lote vigente muda sozinho pela data e quando esgota. Vigente agora: <strong>{av.lot ? `${av.lot.name} · ${formatBRL(av.lot.price_cents)}` : "nenhum (vendas fechadas)"}</strong>.</p>
      {e.lots.length > 0 && (
        <div className="card table-scroll"><table>
          <thead><tr><th>Lote</th><th>Preço</th><th>Vendidos</th><th>Início</th><th>Fim</th><th>Situação</th><th /></tr></thead>
          <tbody>{e.lots.map((l, i) => {
            const st = l.ends_at && new Date(l.ends_at).getTime() <= now ? ["Encerrado", ""] : l.starts_at && new Date(l.starts_at).getTime() > now ? [`Começa ${formatDate(l.starts_at)}`, ""] : sold[i]! >= l.quantity ? ["Esgotado", ""] : av.lot?.id === l.id ? ["Vigente", "ok"] : ["Aguardando", ""];
            return (<tr key={l.id}><td>{l.name}</td><td className="num">{formatBRL(l.price_cents)}</td><td className="num">{sold[i]} / {l.quantity}</td><td>{l.starts_at ? formatDateTime(l.starts_at) : "—"}</td><td>{l.ends_at ? formatDateTime(l.ends_at) : "—"}</td>
              <td><span className={`badge ${st[1]}`}>{st[0]}</span></td>
              <td><form action={A.removeLotAction}><Hidden /><input type="hidden" name="lotId" value={l.id} /><button className="btn sec sm" type="submit">Remover</button></form></td></tr>);
          })}</tbody>
        </table></div>
      )}
      <form className="card stack" action={A.addLotAction} style={{ marginTop: 12 }}>
        <Hidden />
        <div className="row"><label htmlFor="l-name">Nome<input id="l-name" name="name" placeholder="2º lote" required /></label><label htmlFor="l-price">Preço (R$)<input id="l-price" name="price" inputMode="decimal" placeholder="90,00" required /></label></div>
        <div className="row"><label htmlFor="l-qty">Quantidade<input id="l-qty" name="qty" type="number" min={1} required /></label><span /></div>
        <div className="row"><label htmlFor="l-start">Começa em<input id="l-start" name="startsAt" type="datetime-local" /></label><label htmlFor="l-end">Termina em<input id="l-end" name="endsAt" type="datetime-local" /></label></div>
        <div><button className="btn" type="submit">Adicionar lote</button></div>
      </form>

      <h2>Desconto por idade</h2>
      {!a && <p className="small muted">Só o administrador cria e altera descontos.</p>}
      <div className="card stack">
        <form className="actions" action={A.setAgeRefAction} style={{ alignItems: "end" }}><Hidden />
          <label htmlFor="a-ref">Idade calculada na data<input id="a-ref" name="ref" type="date" defaultValue={refDate(e)} disabled={!a} /></label>
          {a && <button className="btn sec" type="submit">Salvar data</button>}
        </form>
        {e.age_bands.length ? <ul className="plain">{e.age_bands.map((b) => <li key={b.id}><span>{bandLabel(b)}</span>{a && <form action={A.removeBandAction}><Hidden /><input type="hidden" name="bandId" value={b.id} /><button className="btn sec sm" type="submit">Remover</button></form>}</li>)}</ul>
          : <p className="muted small" style={{ margin: 0 }}>Nenhuma faixa: todos pagam o preço do lote.</p>}
        {a && (
          <form className="row4" action={A.addBandAction}><Hidden />
            <label htmlFor="b-min">De (anos)<input id="b-min" name="min" type="number" min={0} defaultValue={0} required /></label>
            <label htmlFor="b-max">Até (anos)<input id="b-max" name="max" type="number" min={0} required /></label>
            <label htmlFor="b-type">Desconto<select id="b-type" name="type"><option value="percent">Percentual</option><option value="amount">Valor em R$</option><option value="free">Grátis</option></select></label>
            <label htmlFor="b-val">Valor<input id="b-val" name="value" inputMode="decimal" placeholder="50" /></label>
            <button className="btn" type="submit" style={{ alignSelf: "end" }}>Adicionar faixa</button>
          </form>
        )}
      </div>

      <h2>Combos</h2>
      {!a && <p className="small muted">Só o administrador cria combos.</p>}
      <div className="card stack">
        {e.combos.length ? <ul className="plain">{e.combos.map((c) => (
          <li key={c.id}><span><strong>{c.name}</strong> · {c.ticket_count} ingressos por {formatBRL(c.price_cents)}{!c.active && <> <span className="badge">Inativo</span></>} · usado em {usedCombo.filter((u) => u.combo_id === c.id).length} compras</span>
            {a && <form action={A.toggleComboAction}><Hidden /><input type="hidden" name="comboId" value={c.id} /><button className="btn sec sm" type="submit">{c.active ? "Desativar" : "Ativar"}</button></form>}</li>
        ))}</ul> : <p className="muted small" style={{ margin: 0 }}>Nenhum combo.</p>}
        {a && (
          <form className="row4" action={A.addComboAction}><Hidden />
            <label htmlFor="c-name">Nome<input id="c-name" name="name" placeholder="Combo família" required /></label>
            <label htmlFor="c-count">Ingressos<input id="c-count" name="count" type="number" min={2} max={20} defaultValue={4} required /></label>
            <label htmlFor="c-price">Preço do pacote (R$)<input id="c-price" name="price" inputMode="decimal" required /></label>
            <button className="btn" type="submit" style={{ alignSelf: "end" }}>Criar combo</button>
          </form>
        )}
      </div>
    </>
  );
}

/* ---------- formulário ---------- */
function FormTab({ e, Hidden }: { e: EventFull; Hidden: () => React.ReactElement }) {
  return (
    <>
      <h2>Campos fixos</h2>
      <div className="card"><p style={{ margin: 0 }}>Comprador: nome, email, telefone e CPF. Cada participante: nome, gênero (Feminino ou Masculino) e data de nascimento.</p></div>
      <h2>Perguntas deste evento</h2>
      <p className="muted small">Respondidas por participante. Aparecem na lista, nos filtros e na exportação.</p>
      {e.questions.length ? (
        <div className="card"><ol className="qlist">{e.questions.map((q, i) => (
          <li key={q.id}><span><strong>{q.label}</strong><br /><span className="muted small">{QUESTION_TYPES[q.type]}{q.options.length ? `: ${q.options.join(", ")}` : ""} · {q.required ? "obrigatória" : "opcional"}</span></span>
            <span className="actions">
              {i > 0 && <form action={A.moveQuestionAction}><Hidden /><input type="hidden" name="questionId" value={q.id} /><button className="btn sec sm" type="submit" aria-label="Subir">↑</button></form>}
              <form action={A.removeQuestionAction}><Hidden /><input type="hidden" name="questionId" value={q.id} /><button className="btn sec sm" type="submit">Remover</button></form>
            </span></li>
        ))}</ol></div>
      ) : <p className="card muted">Nenhuma pergunta extra.</p>}
      <form className="card stack" action={A.addQuestionAction} style={{ marginTop: 12 }}>
        <Hidden />
        <label htmlFor="q-label">Pergunta<input id="q-label" name="label" placeholder="Ex.: É batizado(a)?" required /></label>
        <div className="row">
          <label htmlFor="q-type">Tipo de resposta<select id="q-type" name="type">{Object.entries(QUESTION_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label className="check" style={{ alignSelf: "end" }}><input type="checkbox" name="required" /> Obrigatória</label>
        </div>
        <label htmlFor="q-opts">Opções (para escolha única ou múltipla, uma por linha)<textarea id="q-opts" name="options" rows={3} /></label>
        <div><button className="btn" type="submit">Adicionar pergunta</button></div>
      </form>
    </>
  );
}

/* ---------- equipe ---------- */
async function Team({ e, s, Hidden }: { e: EventFull; s: Staff; Hidden: () => React.ReactElement }) {
  const staff = unwrap(await db().from("event_staff").select("id, email, role, created_at, profiles:invited_by(name, email)").eq("event_id", e.id).order("created_at")) as unknown as
    { id: number; email: string; role: "manager" | "credential"; created_at: string; profiles: { name: string; email: string } | null }[];
  const list = (role: "manager" | "credential") => {
    const arr = staff.filter((x) => x.role === role);
    if (!arr.length) return <p className="muted small" style={{ margin: 0 }}>Ninguém ainda.</p>;
    return <ul className="plain">{arr.map((x) => (
      <li key={x.id}><span>{x.email}<br /><span className="muted small">Adicionado{x.profiles ? ` por ${x.profiles.name || x.profiles.email}` : ""} em {formatDate(x.created_at)}</span></span>
        {(role === "credential" || s.isAdmin) && <form action={A.removeStaffAction}><Hidden /><input type="hidden" name="staffId" value={x.id} /><button className="btn sec sm" type="submit">Remover</button></form>}</li>
    ))}</ul>;
  };
  return (
    <>
      <h2>Gerentes do evento</h2>
      <p className="muted small">Veem inscritos, dashboards e valores deste evento, exportam a lista, editam o evento e convidam credenciadores. Não fazem reembolso nem criam cupons ou combos.</p>
      <div className="card stack">{list("manager")}
        {s.isAdmin ? <form className="actions" action={A.inviteStaffAction} style={{ alignItems: "end" }}><Hidden /><input type="hidden" name="role" value="manager" />
          <label htmlFor="i-mgr" style={{ flex: 1, minWidth: 220 }}>Email do gerente<input id="i-mgr" name="email" type="email" required /></label><button className="btn" type="submit">Definir como gerente</button></form>
          : <p className="small muted" style={{ margin: 0 }}>Só o administrador define gerentes.</p>}
      </div>
      <h2>Credenciamento</h2>
      <p className="muted small">Acessam só o check-in deste evento: QR code pelo celular e busca por nome. Não veem contatos nem valores.</p>
      <div className="card stack">{list("credential")}
        <form className="actions" action={A.inviteStaffAction} style={{ alignItems: "end" }}><Hidden /><input type="hidden" name="role" value="credential" />
          <label htmlFor="i-cr" style={{ flex: 1, minWidth: 220 }}>Email de quem vai credenciar<input id="i-cr" name="email" type="email" required /></label><button className="btn" type="submit">Enviar convite</button></form>
      </div>
      <p className="small muted">Quem ainda não tem acesso recebe um email com um link para criar a própria senha.</p>
    </>
  );
}
