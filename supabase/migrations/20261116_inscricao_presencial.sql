-- =====================================================================
-- Inscrição presencial (2026-11-16)
-- Pagamento recebido pela equipe: dinheiro, Pix direto para a igreja ou maquininha.
-- O preço continua calculado pelo banco (mesma conta da compra online).
-- Quem pagou presencialmente não cancela pelo site: só o administrador cancela.
-- =====================================================================

-- 1. Forma de pagamento e quem registrou
alter table public.orders
  add column payment_method text not null default 'online'
    check (payment_method in ('online', 'cash', 'pix_direct', 'card_machine')),
  add column recorded_by uuid references public.profiles(id) on delete set null;
create index ix_orders_recorded_by on public.orders (recorded_by) where recorded_by is not null;

-- 2. Inscrição presencial: só administrador ou gerente do evento, só evento pago e com vaga (sem fila de espera).
--    Reaproveita place_order (validações, trava de CPF, vagas, lote vigente, combos e cupom) e confirma na hora.
--    Qualquer erro desfaz tudo, porque a função inteira roda numa única transação.
create function public.place_order_onsite(p_user uuid, p_event bigint, p_session bigint, p_buyer jsonb, p_people jsonb,
                                          p_combos jsonb, p_coupon text, p_method text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb; o public.orders;
begin
  if not public.can_manage_event(p_user, p_event) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if coalesce(p_method, '') not in ('cash', 'pix_direct', 'card_machine') then raise exception 'bad_method' using errcode = 'P0001'; end if;
  if (select kind from public.events where id = p_event) is distinct from 'paid' then
    raise exception 'onsite_paid_only' using errcode = 'P0001';
  end if;

  r := public.place_order(p_event, p_session, p_buyer, p_people, p_combos, p_coupon);
  select * into o from public.orders where id = (r -> 'order' ->> 'id')::bigint for update;
  if o.status = 'waitlist' then raise exception 'sold_out' using errcode = 'P0001'; end if;

  update public.orders
     set status = 'confirmed', confirmed_at = coalesce(confirmed_at, now()), expires_at = null,
         payment_method = p_method, recorded_by = p_user
   where id = o.id
  returning * into o;
  return jsonb_build_object('order', to_jsonb(o), 'tickets', r -> 'tickets');
end $$;
revoke all on function public.place_order_onsite(uuid, bigint, bigint, jsonb, jsonb, jsonb, text, text) from public, anon, authenticated;

-- 3. Cancelamento pelo comprador: igual ao de antes, mas não vale para pagamento presencial.
create or replace function public.cancel_self(p_code text) returns text
language plpgsql security definer set search_path = '' as $$
declare o public.orders; ev public.events;
begin
  select * into o from public.orders where code = p_code for update;
  if not found then return 'not_found'; end if;
  select * into ev from public.events where id = o.event_id;
  if o.status <> 'confirmed' or o.confirmed_at is null or ev.starts_at <= now()
     or o.payment_method <> 'online'
     or now() > o.confirmed_at + interval '7 days'
     or exists (select 1 from public.checkins c join public.tickets t on t.id = c.ticket_id where t.order_id = o.id) then
    return 'not_allowed';
  end if;
  update public.orders set status = 'cancelled', cancelled_at = now() where id = o.id;
  perform public.promote_waitlist(o.event_id);
  return 'ok';
end $$;
revoke all on function public.cancel_self(text) from public, anon, authenticated;
