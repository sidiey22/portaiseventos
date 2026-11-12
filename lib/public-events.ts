// Vitrine pública dos eventos, lida pelo site da igreja (portaiseternos.com.br).
// Só sai daqui o que já é público na página do evento. Os campos são escolhidos um a um:
// nada de inscritos, CPF, emails, pagamentos, valores arrecadados ou dados da equipe.

import type { AgeBand, EventKind } from "./types.ts";

export const PUBLIC_ORIGINS = ["https://portaiseternos.com.br", "https://www.portaiseternos.com.br"];

export type PublicEvent = {
  nome: string;
  resumo: string;
  local: string;
  inicio: string;
  fim: string | null;
  gratuito: boolean;
  preco_a_partir_centavos: number | null;
  vendas_abertas: boolean;
  esgotado: boolean;
  imagem: string | null;
  link: string;
};

export type PublicSource = {
  slug: string; name: string; summary: string; place_name: string;
  starts_at: string; ends_at: string | null; kind: EventKind; age_bands: AgeBand[];
};

/** Menor preço possível com os descontos por idade (sem contar faixas gratuitas). */
export function minPrice(price: number, bands: AgeBand[]): number {
  let m = price;
  for (const b of bands) {
    if (b.discount_type === "free") continue;
    m = Math.min(m, b.discount_type === "percent" ? Math.round(price * (100 - b.discount_value) / 100) : Math.max(0, price - b.discount_value));
  }
  return m;
}

export function toPublic(e: PublicSource, a: { seatsLeft: number; lotPrice: number | null; salesOpen: boolean }, baseUrl: string, image: string | null): PublicEvent {
  const free = e.kind === "free";
  return {
    nome: e.name,
    resumo: e.summary,
    local: e.place_name,
    inicio: e.starts_at,
    fim: e.ends_at,
    gratuito: free,
    preco_a_partir_centavos: free || a.lotPrice == null ? null : minPrice(a.lotPrice, e.age_bands),
    vendas_abertas: a.salesOpen,
    esgotado: a.seatsLeft <= 0,
    imagem: image,
    link: `${baseUrl.replace(/\/$/, "")}/eventos/${encodeURIComponent(e.slug)}`,
  };
}

/** Devolve a origem liberada para o CORS, ou null se não for uma das permitidas. */
export function allowedOrigin(origin: string | null): string | null {
  return origin && PUBLIC_ORIGINS.includes(origin) ? origin : null;
}
