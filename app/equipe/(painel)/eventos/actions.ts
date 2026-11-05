"use server";

import { randomUUID } from "node:crypto";
import { redirect, unstable_rethrow } from "next/navigation";
import { getEvent } from "@/lib/events";
import { sendStaffAddedEmail, publicUrl } from "@/lib/mail";
import { findApprovedPayment, mpEnabled, refundPayment } from "@/lib/mercadopago";
import { canManage, requireAdmin, requireManager, requireStaff, type Staff } from "@/lib/staff";
import { db, unwrap } from "@/lib/supabase";
import { localInputToIso } from "@/lib/time";
import { isEmail, parseMoneyToCents, slugify } from "@/lib/validation";
import { friendlyError } from "@/lib/errors";

const txt = (d: FormData, k: string) => String(d.get(k) ?? "").trim();
const int = (d: FormData, k: string) => Number.parseInt(txt(d, k), 10);
const back = (id: number, aba: string, r: { ok?: string; erro?: string }) => {
  const q = new URLSearchParams({ aba, ...(r.ok ? { ok: r.ok } : {}), ...(r.erro ? { erro: r.erro } : {}) });
  redirect(`/equipe/eventos/${id}?${q}`);
};
async function manager(d: FormData): Promise<{ s: Staff; id: number }> {
  const id = int(d, "eventId");
  return { s: await requireManager(id), id };
}

export async function createEventAction(d: FormData): Promise<void> {
  await requireAdmin();
  const name = txt(d, "name"), kind = txt(d, "kind"), cap = int(d, "capacity");
  const start = localInputToIso(txt(d, "startsAt")), end = txt(d, "endsAt") ? localInputToIso(txt(d, "endsAt")) : null;
  const err = (m: string) => redirect(`/equipe/eventos/novo?erro=${encodeURIComponent(m)}`);
  if (name.length < 3) err("Informe o nome do evento.");
  if (kind !== "paid" && kind !== "free") err("Escolha se o evento é pago ou gratuito.");
  if (!start) err("Informe a data e a hora de início.");
  if (new Date(start!).getTime() <= Date.now()) err("O início precisa estar no futuro.");
  if (txt(d, "endsAt") && (!end || end < start!)) err("O término precisa ser depois do início.");
  if (!(cap >= 1 && cap <= 100_000)) err("Informe a quantidade de vagas.");
  const base = slugify(name) || "evento";
  const used = new Set((unwrap(await db().from("events").select("slug").like("slug", `${base}%`)) as { slug: string }[]).map((r) => r.slug));
  let slug = base;
  for (let i = 2; used.has(slug); i++) slug = `${base}-${i}`;
  const row = unwrap(await db().from("events").insert({ slug, name, kind, capacity: cap, starts_at: start, ends_at: end, summary: txt(d, "summary").slice(0, 160), place_name: "A definir", status: "draft" }).select("id").single()) as { id: number };
  back(row.id, "editar", { ok: "Evento criado como rascunho. Complete os dados e publique." });
}

export async function updateEventAction(d: FormData): Promise<void> {
  const { s, id } = await manager(d);
  const start = localInputToIso(txt(d, "startsAt")), end = txt(d, "endsAt") ? localInputToIso(txt(d, "endsAt")) : null;
  if (!start) back(id, "editar", { erro: "Informe a data e a hora de início." });
  if (txt(d, "endsAt") && (!end || end < start!)) back(id, "editar", { erro: "O término precisa ser depois do início." });
  const placeName = txt(d, "placeName");
  if (placeName.length < 2) back(id, "editar", { erro: "Informe o nome do local." });
  const lat = txt(d, "lat") ? Number(txt(d, "lat")) : null, lng = txt(d, "lng") ? Number(txt(d, "lng")) : null;
  if ((lat !== null && !(lat >= -90 && lat <= 90)) || (lng !== null && !(lng >= -180 && lng <= 180))) back(id, "editar", { erro: "Coordenadas do mapa inválidas." });
  const patch: Record<string, unknown> = {
    summary: txt(d, "summary").slice(0, 160), description: txt(d, "description").slice(0, 8000), starts_at: start, ends_at: end,
    place_name: placeName.slice(0, 200), place_address: txt(d, "placeAddress").slice(0, 300), place_lat: lat, place_lng: lng,
  };
  if (s.isAdmin) {
    const name = txt(d, "name"), cap = int(d, "capacity"), kind = txt(d, "kind");
    if (name.length < 3) back(id, "editar", { erro: "Informe o nome do evento." });
    if (!(cap >= 1 && cap <= 100_000)) back(id, "editar", { erro: "Informe a quantidade de vagas." });
    const taken = Number(unwrap(await db().rpc("seats_taken", { p_event: id })));
    if (cap < taken) back(id, "editar", { erro: `Já existem ${taken} vagas ocupadas; não dá para reduzir abaixo disso.` });
    Object.assign(patch, { name, capacity: cap, ...(kind === "paid" || kind === "free" ? { kind } : {}) });
  }
  const { error } = await db().from("events").update(patch).eq("id", id);
  if (error) back(id, "editar", { erro: "Não foi possível salvar. Confira os dados." });
  await db().rpc("promote_waitlist", { p_event: id });
  back(id, "editar", { ok: "Alterações salvas." });
}

export async function uploadBannerAction(d: FormData): Promise<void> {
  const { id } = await manager(d);
  const file = d.get("banner");
  if (!(file instanceof File) || !file.size) back(id, "editar", { erro: "Escolha uma imagem." });
  const f = file as File;
  const ext = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as Record<string, string>)[f.type];
  if (!ext) back(id, "editar", { erro: "Envie uma imagem JPG, PNG ou WebP." });
  if (f.size > 5 * 1024 * 1024) back(id, "editar", { erro: "A imagem passa de 5 MB. Diminua e envie de novo." });
  const path = `eventos/${id}/${randomUUID()}.${ext}`;
  const up = await db().storage.from("banners").upload(path, Buffer.from(await f.arrayBuffer()), { contentType: f.type, upsert: false });
  if (up.error) back(id, "editar", { erro: "Não foi possível enviar a imagem." });
  const old = unwrap(await db().from("events").select("banner_path").eq("id", id).single()) as { banner_path: string | null };
  await db().from("events").update({ banner_path: path }).eq("id", id);
  if (old.banner_path) await db().storage.from("banners").remove([old.banner_path]);
  back(id, "editar", { ok: "Banner atualizado." });
}

export async function clearBannerAction(d: FormData): Promise<void> {
  const { id } = await manager(d);
  const old = unwrap(await db().from("events").select("banner_path").eq("id", id).single()) as { banner_path: string | null };
  await db().from("events").update({ banner_path: null }).eq("id", id);
  if (old.banner_path) await db().storage.from("banners").remove([old.banner_path]);
  back(id, "editar", { ok: "Banner automático em uso." });
}

export async function setStatusAction(d: FormData): Promise<void> {
  await requireAdmin();
  const id = int(d, "eventId"), status = txt(d, "status");
  if (!["draft", "published", "closed"].includes(status)) back(id, "editar", { erro: "Status inválido." });
  const e = await getEvent(id);
  if (!e) redirect("/equipe");
  if (status === "published" && e!.kind === "paid" && !e!.lots.length) back(id, "precos", { erro: "Crie pelo menos um lote antes de publicar um evento pago." });
  await db().from("events").update({ status }).eq("id", id);
  back(id, "editar", { ok: status === "published" ? "Inscrições abertas. O evento já aparece na vitrine." : "Inscrições encerradas." });
}

/**
 * Apaga um evento (só administrador). Regras de segurança:
 * - o nome do evento precisa ser digitado para confirmar;
 * - não apaga se houver compra confirmada (primeiro reembolse/cancele) ou aguardando pagamento (expira em até 10 minutos);
 * - o resto (fila, canceladas, expiradas, lotes, perguntas, equipe, cupons) é apagado junto, e o banner sai do armazenamento.
 */
export async function deleteEventAction(d: FormData): Promise<void> {
  await requireAdmin();
  const id = int(d, "eventId");
  const e = await getEvent(id);
  if (!e) redirect("/equipe");
  if (txt(d, "confirm").toLowerCase() !== e!.name.trim().toLowerCase()) back(id, "editar", { erro: "Para apagar, digite o nome do evento exatamente como ele aparece." });
  await db().rpc("expire_stale");
  const orders = unwrap(await db().from("orders").select("id, status").eq("event_id", id)) as { id: number; status: string }[];
  const confirmed = orders.filter((o) => o.status === "confirmed").length;
  if (confirmed) back(id, "editar", { erro: `Há ${confirmed} compra(s) confirmada(s). Reembolse ou cancele cada uma na aba "Painel e inscritos" antes de apagar. Se não quiser mais vender, use "Encerrar inscrições".` });
  const pending = orders.filter((o) => o.status === "pending").length;
  if (pending) back(id, "editar", { erro: `Há ${pending} compra(s) aguardando pagamento. Elas expiram em até 10 minutos; tente apagar depois disso.` });
  try {
    const ids = orders.map((o) => o.id);
    if (ids.length) {
      for (const t of ["refunds", "payments"] as const) { const r = await db().from(t).delete().in("order_id", ids); if (r.error) throw r.error; }
      const r = await db().from("orders").delete().in("id", ids);
      if (r.error) throw r.error;
    }
    const r = await db().from("events").delete().eq("id", id);
    if (r.error) throw r.error;
    if (e!.banner_path) await db().storage.from("banners").remove([e!.banner_path]);
  } catch (err) {
    console.error("Apagar evento:", err);
    back(id, "editar", { erro: "Não foi possível apagar o evento agora. Nada de importante foi perdido; tente de novo ou me avise." });
  }
  redirect(`/equipe?ok=${encodeURIComponent(`Evento "${e!.name}" apagado.`)}`);
}

export async function addLotAction(d: FormData): Promise<void> {
  const { id } = await manager(d);
  const price = parseMoneyToCents(txt(d, "price")), qty = int(d, "qty");
  const ls = txt(d, "startsAt") ? localInputToIso(txt(d, "startsAt")) : null, le = txt(d, "endsAt") ? localInputToIso(txt(d, "endsAt")) : null;
  if (txt(d, "name").length < 2) back(id, "precos", { erro: "Informe o nome do lote." });
  if (!price) back(id, "precos", { erro: "Informe um preço válido, por exemplo 90,00." });
  if (!(qty >= 1)) back(id, "precos", { erro: "Informe a quantidade do lote." });
  if ((txt(d, "startsAt") && !ls) || (txt(d, "endsAt") && !le) || (ls && le && le <= ls)) back(id, "precos", { erro: "Confira as datas do lote: o fim precisa ser depois do início." });
  const e = await getEvent(id);
  if (e!.kind !== "paid") back(id, "precos", { erro: "Lotes só existem em eventos pagos." });
  const pos = (e!.lots.at(-1)?.position ?? 0) + 1;
  await db().from("lots").insert({ event_id: id, name: txt(d, "name").slice(0, 80), price_cents: price, quantity: qty, starts_at: ls, ends_at: le, position: pos });
  await db().rpc("promote_waitlist", { p_event: id });
  back(id, "precos", { ok: "Lote adicionado." });
}

export async function removeLotAction(d: FormData): Promise<void> {
  const { id } = await manager(d);
  const lotId = int(d, "lotId");
  const { count } = await db().from("tickets").select("id", { count: "exact", head: true }).eq("lot_id", lotId);
  if (count) back(id, "precos", { erro: "Este lote já tem ingressos vendidos e não pode ser removido." });
  await db().from("lots").delete().eq("id", lotId).eq("event_id", id);
  back(id, "precos", { ok: "Lote removido." });
}

export async function setAgeRefAction(d: FormData): Promise<void> {
  await requireAdmin();
  const id = int(d, "eventId"), ref = txt(d, "ref");
  if (ref && !/^\d{4}-\d{2}-\d{2}$/.test(ref)) back(id, "precos", { erro: "Data inválida." });
  await db().from("events").update({ age_ref_date: ref || null }).eq("id", id);
  back(id, "precos", { ok: "Data de referência salva." });
}

export async function addBandAction(d: FormData): Promise<void> {
  await requireAdmin();
  const id = int(d, "eventId"), min = int(d, "min"), max = int(d, "max"), type = txt(d, "type");
  const value = type === "free" ? 0 : type === "percent" ? int(d, "value") : parseMoneyToCents(txt(d, "value"));
  if (!(min >= 0 && max >= min && max <= 120)) back(id, "precos", { erro: "Confira as idades da faixa." });
  if (!["free", "percent", "amount"].includes(type) || (type !== "free" && !(Number(value) > 0)) || (type === "percent" && Number(value) > 100)) back(id, "precos", { erro: "Informe um desconto válido." });
  const e = await getEvent(id);
  if (e!.age_bands.some((b) => min <= b.max_age && max >= b.min_age)) back(id, "precos", { erro: "Essa faixa se sobrepõe a outra. Ajuste as idades." });
  await db().from("age_bands").insert({ event_id: id, min_age: min, max_age: max, discount_type: type, discount_value: value });
  back(id, "precos", { ok: "Faixa de idade adicionada." });
}

export async function removeBandAction(d: FormData): Promise<void> {
  await requireAdmin();
  const id = int(d, "eventId");
  await db().from("age_bands").delete().eq("id", int(d, "bandId")).eq("event_id", id);
  back(id, "precos", { ok: "Faixa removida." });
}

export async function addComboAction(d: FormData): Promise<void> {
  await requireAdmin();
  const id = int(d, "eventId"), count = int(d, "count"), price = parseMoneyToCents(txt(d, "price"));
  if (txt(d, "name").length < 2) back(id, "precos", { erro: "Informe o nome do combo." });
  if (!(count >= 2 && count <= 20)) back(id, "precos", { erro: "O combo precisa ter de 2 a 20 ingressos." });
  if (!price) back(id, "precos", { erro: "Informe o preço do pacote." });
  await db().from("combos").insert({ event_id: id, name: txt(d, "name").slice(0, 80), ticket_count: count, price_cents: price });
  back(id, "precos", { ok: "Combo criado." });
}

export async function toggleComboAction(d: FormData): Promise<void> {
  await requireAdmin();
  const id = int(d, "eventId"), comboId = int(d, "comboId");
  const c = unwrap(await db().from("combos").select("active").eq("id", comboId).eq("event_id", id).single()) as { active: boolean };
  await db().from("combos").update({ active: !c.active }).eq("id", comboId);
  back(id, "precos", { ok: c.active ? "Combo desativado." : "Combo ativado." });
}

const QTYPES = ["short_text", "long_text", "yes_no", "single_choice", "multi_choice", "number", "date"];
export async function addQuestionAction(d: FormData): Promise<void> {
  const { id } = await manager(d);
  const label = txt(d, "label"), type = txt(d, "type");
  const options = txt(d, "options").split("\n").map((o) => o.trim()).filter(Boolean).slice(0, 30).map((o) => o.slice(0, 80));
  if (label.length < 2) back(id, "form", { erro: "Escreva a pergunta." });
  if (!QTYPES.includes(type)) back(id, "form", { erro: "Escolha o tipo de resposta." });
  const choice = type === "single_choice" || type === "multi_choice";
  if (choice && options.length < 2) back(id, "form", { erro: "Informe pelo menos duas opções, uma por linha." });
  const e = await getEvent(id);
  await db().from("questions").insert({ event_id: id, label: label.slice(0, 200), type, required: d.get("required") === "on", options: choice ? options : [], position: (e!.questions.at(-1)?.position ?? 0) + 1 });
  back(id, "form", { ok: "Pergunta adicionada ao formulário." });
}

export async function removeQuestionAction(d: FormData): Promise<void> {
  const { id } = await manager(d);
  await db().from("questions").delete().eq("id", int(d, "questionId")).eq("event_id", id);
  back(id, "form", { ok: "Pergunta removida. As respostas antigas dela também foram apagadas." });
}

export async function moveQuestionAction(d: FormData): Promise<void> {
  const { id } = await manager(d);
  const e = await getEvent(id);
  const qs = e!.questions, i = qs.findIndex((q) => q.id === int(d, "questionId"));
  if (i > 0) {
    const order = qs.map((q) => q.id); [order[i - 1], order[i]] = [order[i]!, order[i - 1]!];
    await Promise.all(order.map((qid, pos) => db().from("questions").update({ position: pos + 1 }).eq("id", qid)));
  }
  back(id, "form", {});
}

export async function inviteStaffAction(d: FormData): Promise<void> {
  const s = await requireStaff();
  const id = int(d, "eventId"), role = txt(d, "role") as "manager" | "credential", email = txt(d, "email").toLowerCase();
  if (!(await canManage(s, id))) redirect("/equipe");
  if (role === "manager" && !s.isAdmin) back(id, "equipe", { erro: "Só o administrador define gerentes." });
  if (role !== "manager" && role !== "credential") back(id, "equipe", { erro: "Papel inválido." });
  if (!isEmail(email)) back(id, "equipe", { erro: "Informe um email válido." });
  const { error } = await db().from("event_staff").insert({ event_id: id, email, role, invited_by: s.id });
  if (error) back(id, "equipe", { erro: error.code === "23505" ? "Esse email já está na equipe deste evento." : "Não foi possível adicionar." });
  const e = await getEvent(id);
  const { data: profile } = await db().from("profiles").select("id").eq("email", email).maybeSingle();
  try {
    if (!profile) {
      const r = await db().auth.admin.inviteUserByEmail(email, { redirectTo: publicUrl("/auth/confirm") });
      if (r.error) throw r.error;
    } else await sendStaffAddedEmail({ email, eventName: e!.name, role });
  } catch (err) {
    console.error("Convite:", err);
    back(id, "equipe", { erro: `${email} foi adicionado, mas o email de convite falhou. A pessoa pode usar "Esqueci a senha" na área da equipe.` });
  }
  back(id, "equipe", { ok: role === "manager" ? `${email} agora é gerente deste evento.` : `Convite de credenciamento enviado para ${email}.` });
}

export async function removeStaffAction(d: FormData): Promise<void> {
  const s = await requireStaff();
  const id = int(d, "eventId"), staffId = int(d, "staffId");
  if (!(await canManage(s, id))) redirect("/equipe");
  const row = unwrap(await db().from("event_staff").select("role, email").eq("id", staffId).eq("event_id", id).maybeSingle()) as { role: string; email: string } | null;
  if (!row) back(id, "equipe", {});
  if (row!.role === "manager" && !s.isAdmin) back(id, "equipe", { erro: "Só o administrador remove gerentes." });
  await db().from("event_staff").delete().eq("id", staffId);
  back(id, "equipe", { ok: `${row!.email} não tem mais acesso a este evento.` });
}

/** Reembolso total de uma compra (só administrador), pela API do Mercado Pago. */
export async function refundAction(d: FormData): Promise<void> {
  const s = await requireAdmin();
  const id = int(d, "eventId"), code = txt(d, "orderCode");
  const o = unwrap(await db().from("orders").select("id, status, total_cents").eq("code", code).eq("event_id", id).maybeSingle()) as { id: number; status: string; total_cents: number } | null;
  if (!o || o.status !== "confirmed") back(id, "painel", { erro: "Só compras confirmadas podem ser reembolsadas." });
  if (o!.total_cents > 0) {
    if (!mpEnabled()) back(id, "painel", { erro: "O Mercado Pago ainda não está configurado." });
    try {
      const p = await findApprovedPayment(code);
      if (!p) back(id, "painel", { erro: "Pagamento aprovado não encontrado no Mercado Pago." });
      const rf = await refundPayment(String(p!.id));
      const pay = unwrap(await db().from("payments").select("id").eq("mp_payment_id", String(p!.id)).maybeSingle()) as { id: number } | null;
      await db().from("refunds").insert({ order_id: o!.id, payment_id: pay?.id ?? null, mp_refund_id: String(rf.id), amount_cents: o!.total_cents, requested_by: s.id });
    } catch (err) {
      unstable_rethrow(err);
      console.error("Reembolso:", err);
      back(id, "painel", { erro: `O Mercado Pago recusou o reembolso. ${friendlyError(String(err))}` });
    }
  }
  await db().from("orders").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", o!.id);
  await db().rpc("promote_waitlist", { p_event: id });
  back(id, "painel", { ok: o!.total_cents ? "Reembolso total enviado ao Mercado Pago e compra cancelada." : "Compra cancelada." });
}
