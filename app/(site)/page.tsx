import Link from "next/link";
import { Art } from "@/components/art";
import { Icon } from "@/components/icons";
import { availability, expireStale } from "@/lib/events";
import { db, unwrap } from "@/lib/supabase";
import { formatBRL, formatLong, formatRange } from "@/lib/time";
import type { EventFull } from "@/lib/events";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await expireStale();
  const nowIso = new Date().toISOString();
  const rows = unwrap(await db().from("events").select("*, lots(*), age_bands(*), combos(*), questions(*), sessions:event_sessions(*)")
    .eq("status", "published").order("starts_at")) as EventFull[];
  const list = rows.filter((e) => (e.ends_at ?? e.starts_at) > nowIso);
  const avs = await Promise.all(list.map((e) => availability(e)));

  if (!list.length) return <><p className="card">Nenhum evento com inscrições abertas no momento. Volte em breve.</p><About /></>;
  const [f, ...rest] = list;
  const fa = avs[0]!;
  return (
    <>
      <section className="hero" aria-label="Próximo evento">
        <Link className="ev-card" href={`/eventos/${f!.slug}`} aria-label={`Abrir ${f!.name}`}><Art event={f!} /></Link>
        <div>
          <p className="eyebrow">Próximo evento</p>
          <h1>{f!.name}</h1>
          <ul className="meta">
            <li><Icon name="cal" /><span>{formatRange(f!.starts_at, f!.ends_at)}</span></li>
            <li><Icon name="pin" /><span>{f!.place_name}</span></li>
          </ul>
          <p className="lead">{f!.summary}</p>
          <div className="cta">
            <Link className="btn" href={`/eventos/${f!.slug}`}>Garantir minha vaga</Link>
            <span className="price-tag"><small>{f!.kind === "free" ? "Entrada" : fa.lot ? fa.lot.name : "Ingressos"}</small>{f!.kind === "free" ? "Gratuito" : fa.lot ? formatBRL(fa.lot.price_cents) : "Vendas fechadas"}</span>
          </div>
        </div>
      </section>
      {rest.length > 0 && (
        <>
          <div className="sec-head"><h2>Próximos eventos</h2><span className="muted small">{list.length} eventos com inscrições abertas</span></div>
          <div className="rail">
            {rest.map((e, i) => {
              const a = avs[i + 1]!;
              return (
                <Link key={e.id} className="ev-card" href={`/eventos/${e.slug}`} style={{ textDecoration: "none" }}>
                  <Art event={e} />
                  <div>
                    <h3>{e.name}</h3>
                    <p className="place">{e.place_name}</p>
                    <p className="when">{formatLong(e.starts_at)}</p>
                    <p className="sum">{e.summary}</p>
                    <div className="chips">
                      <span className={`chip${e.kind === "free" ? "" : " hot"}`}>{e.kind === "free" ? "Gratuito" : a.lot ? `A partir de ${formatBRL(minPrice(e, a.lot.price_cents))}` : "Vendas fechadas"}</span>
                      {a.seatsLeft <= 0 ? <span className="chip off">Esgotado · fila de espera</span> : a.seatsLeft <= 5 ? <span className="chip hot">{a.seatsLeft === 1 ? "Última vaga" : `Últimas ${a.seatsLeft} vagas`}</span> : null}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
      <About />
    </>
  );
}

function minPrice(e: EventFull, price: number): number {
  let m = price;
  for (const b of e.age_bands) if (b.discount_type !== "free") m = Math.min(m, b.discount_type === "percent" ? Math.round(price * (100 - b.discount_value) / 100) : Math.max(0, price - b.discount_value));
  return m;
}

function About() {
  return (
    <>
      <section className="about" aria-label="Sobre a igreja">
        <blockquote>“Levantai, ó portas, as vossas cabeças; levantai-vos, ó portais eternos, para que entre o Rei da Glória.”<cite>Salmos 24:7</cite></blockquote>
        <div>
          <p className="eyebrow">Igreja Missionária Portais Eternos</p>
          <p>Aqui ficam os cultos especiais, retiros e encontros da igreja. Escolha o evento, compre para você e para a sua família, e receba os QR codes de entrada no seu email.</p>
          <p className="muted small" style={{ margin: 0 }}>Na entrada, cada pessoa mostra o próprio QR code.</p>
        </div>
      </section>
      <footer className="site-foot"><span><strong>Portais Eternos</strong> · Contagem, MG</span><span><Link href="/equipe/entrar">Área da equipe</Link></span></footer>
    </>
  );
}
