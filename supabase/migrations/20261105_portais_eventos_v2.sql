-- =====================================================================
-- Portais Eventos — migração da versão 2 (pedido de 2026-11-04)
-- Aprovada pelo Gabriel em 2026-11-04 (lote: todos os ingressos da compra pagam o preço do lote vigente).
--
-- O que muda:
--   * Compras com vários ingressos (orders + tickets) no lugar de registrations.
--   * Lotes com início e fim; desconto por idade; combos; cupons.
--   * Perguntas personalizadas por evento e respostas por participante.
--   * Papéis: Administrador, Gerente do evento e Credenciamento, com login
--     individual pelo Supabase Auth (tabela profiles). Some o login compartilhado.
--   * Local com nome, endereço, latitude e longitude; datas de início e fim.
--   * Check-in uma vez por dia (tabela checkins).
--   * Banners num bucket público só de imagens.
--
-- Dados apagados: as 2 inscrições de teste da v1 (tabela registrations) e os
-- usuários do login antigo (admin e voluntario). Pagamentos e reembolsos estão vazios.
-- Eventos, lotes e sessões existentes são mantidos.
--
-- Segurança: todas as tabelas com RLS ligado e nenhuma política. Só o servidor,
-- com a chave secreta (service_role), lê e escreve. As funções conferem de novo
-- a permissão de quem está agindo (p_user_id).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. Objetos criados daqui pra frente já nascem fechados para as chaves públicas
-- ---------------------------------------------------------------------
alter default privileges for role postgres in schema public revoke all on tables    from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 1. Remove o que a v2 substitui
-- ---------------------------------------------------------------------
drop function if exists public.register_attendee(bigint, bigint, text, text, text, text, date, text);
drop function if exists public.start_offered(text);
drop function if exists public.confirm_payment(text, text, integer);
drop function if exists public.cancel_self(text);
drop function if exists public.check_in(bigint, text);
drop function if exists public.volunteer_list(bigint);
drop function if exists public.promote_waitlist(bigint);
drop function if exists public.current_lot(bigint);
drop function if exists public.seats_taken(bigint);
drop function if exists public.expire_stale();
drop function if exists public.run_maintenance();
drop function if exists public.admin_event_stats();
drop function if exists public.holds_seat(text, timestamptz, timestamptz);

drop table if exists public.refunds;
drop table if exists public.payments;
drop table if exists public.registrations;
drop trigger if exists trg_max_admins on public.users;
drop table if exists public.users;
drop function if exists public.enforce_max_admins();

-- ---------------------------------------------------------------------
-- 2. Pessoas da equipe (login individual pelo Supabase Auth)
-- ---------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null unique check (email = lower(email)),
  name       text not null default '',
  is_admin   boolean not null default false,
  created_at timestamptz not null default now()
);

-- Máximo de 5 administradores.
create function public.enforce_max_admins() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.is_admin and (select count(*) from public.profiles where is_admin and id <> new.id) >= 5 then
    raise exception 'max_admins' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger trg_max_admins before insert or update of is_admin on public.profiles
  for each row execute function public.enforce_max_admins();

-- Cada usuário criado no Auth (convite aceito) ganha um perfil.
create function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email) values (new.id, lower(new.email))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger trg_auth_user_profile after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------
-- 3. Eventos: datas, local com mapa, banner, idade de referência
-- ---------------------------------------------------------------------
alter table public.events rename column location to place_name;
alter table public.events
  add column summary       text not null default '' check (char_length(summary) <= 160),
  add column ends_at       timestamptz,
  add column place_address text not null default '',
  add column place_lat     double precision check (place_lat between -90 and 90),
  add column place_lng     double precision check (place_lng between -180 and 180),
  add column banner_path   text,
  add column age_ref_date  date,
  add constraint events_ends_after_start check (ends_at is null or ends_at >= starts_at);

-- Lotes com início e fim
alter table public.lots
  add column starts_at timestamptz,
  add constraint lots_ends_after_start check (starts_at is null or ends_at is null or ends_at > starts_at);

-- Equipe por evento: gerentes (definidos pelo admin) e credenciadores (convidados pelo gerente ou admin).
-- O vínculo é pelo email: vale assim que a pessoa aceita o convite com esse email.
create table public.event_staff (
  id         bigint generated always as identity primary key,
  event_id   bigint not null references public.events(id) on delete cascade,
  email      text not null check (email = lower(email) and email like '%_@_%._%'),
  role       text not null check (role in ('manager', 'credential')),
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (event_id, email, role)
);
create index ix_event_staff_email on public.event_staff (email);
create index ix_event_staff_invited_by on public.event_staff (invited_by) where invited_by is not null;

-- Desconto por idade (faixas por evento)
create table public.age_bands (
  id             bigint generated always as identity primary key,
  event_id       bigint not null references public.events(id) on delete cascade,
  label          text not null default '',
  min_age        integer not null check (min_age between 0 and 120),
  max_age        integer not null check (max_age between 0 and 120),
  discount_type  text not null check (discount_type in ('percent', 'amount', 'free')),
  discount_value integer not null default 0 check (discount_value >= 0),
  check (max_age >= min_age),
  check (discount_type <> 'percent' or discount_value <= 100)
);
create index ix_age_bands_event on public.age_bands (event_id, min_age);

-- Combos (só o admin cria)
create table public.combos (
  id           bigint generated always as identity primary key,
  event_id     bigint not null references public.events(id) on delete cascade,
  name         text not null,
  ticket_count integer not null check (ticket_count between 2 and 20),
  price_cents  integer not null check (price_cents > 0),
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);
create index ix_combos_event on public.combos (event_id);

-- Cupons (só o admin cria). event_id nulo = vale para todos os eventos.
create table public.coupons (
  id             bigint generated always as identity primary key,
  code           text not null check (code = upper(code) and code ~ '^[A-Z0-9_-]{3,30}$'),
  discount_type  text not null check (discount_type in ('percent', 'amount')),
  discount_value integer not null check (discount_value > 0),
  valid_until    timestamptz,
  max_uses       integer check (max_uses is null or max_uses > 0),
  event_id       bigint references public.events(id) on delete cascade,
  active         boolean not null default true,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  check (discount_type <> 'percent' or discount_value <= 100)
);
create unique index ux_coupons_code on public.coupons (code);
create index ix_coupons_event on public.coupons (event_id) where event_id is not null;
create index ix_coupons_created_by on public.coupons (created_by) where created_by is not null;

-- Perguntas personalizadas por evento
create table public.questions (
  id       bigint generated always as identity primary key,
  event_id bigint not null references public.events(id) on delete cascade,
  label    text not null check (char_length(label) between 2 and 200),
  type     text not null check (type in ('short_text', 'long_text', 'yes_no', 'single_choice', 'multi_choice', 'number', 'date')),
  required boolean not null default false,
  options  jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  position integer not null default 0
);
create index ix_questions_event on public.questions (event_id, position);

-- ---------------------------------------------------------------------
-- 4. Compras e ingressos
-- ---------------------------------------------------------------------
create table public.orders (
  id                    bigint generated always as identity primary key,
  code                  text not null unique default translate(encode(extensions.gen_random_bytes(16), 'base64'), '+/=', '-_'),
  event_id              bigint not null references public.events(id),
  session_id            bigint references public.event_sessions(id),
  buyer_name            text not null,
  buyer_email           text not null check (buyer_email = lower(buyer_email)),
  buyer_phone           text not null check (buyer_phone ~ '^\d{10,13}$'),
  buyer_cpf             text not null check (buyer_cpf ~ '^\d{11}$'),
  status                text not null check (status in ('pending', 'confirmed', 'waitlist', 'cancelled', 'expired')),
  ticket_count          integer not null check (ticket_count between 1 and 20),
  requested_combos      jsonb not null default '[]'::jsonb,
  requested_coupon      text,
  subtotal_cents        integer not null default 0 check (subtotal_cents >= 0),
  age_discount_cents    integer not null default 0,
  combo_discount_cents  integer not null default 0,
  coupon_id             bigint references public.coupons(id),
  coupon_discount_cents integer not null default 0 check (coupon_discount_cents >= 0),
  total_cents           integer not null default 0 check (total_cents >= 0),
  expires_at            timestamptz,
  offered_until         timestamptz,
  offer_notified_at     timestamptz,
  tickets_emailed_at    timestamptz,
  created_at            timestamptz not null default now(),
  confirmed_at          timestamptz,
  cancelled_at          timestamptz
);
-- Um CPF de comprador só pode ter uma compra ativa por evento.
create unique index ux_orders_active_cpf on public.orders (event_id, buyer_cpf)
  where status in ('pending', 'confirmed', 'waitlist');
create index ix_orders_event_status on public.orders (event_id, status);
create index ix_orders_coupon on public.orders (coupon_id) where coupon_id is not null;
create index ix_orders_session on public.orders (session_id) where session_id is not null;

create table public.order_combos (
  order_id    bigint not null references public.orders(id) on delete cascade,
  combo_id    bigint not null references public.combos(id),
  quantity    integer not null check (quantity between 1 and 10),
  price_cents integer not null check (price_cents >= 0),
  primary key (order_id, combo_id)
);
create index ix_order_combos_combo on public.order_combos (combo_id);

create table public.tickets (
  id                 bigint generated always as identity primary key,
  code               text not null unique default translate(encode(extensions.gen_random_bytes(16), 'base64'), '+/=', '-_'),
  order_id           bigint not null references public.orders(id) on delete cascade,
  event_id           bigint not null references public.events(id),
  position           integer not null,
  name               text not null check (char_length(name) between 3 and 120),
  gender             text not null check (gender in ('F', 'M')),
  birth_date         date not null,
  lot_id             bigint references public.lots(id),
  combo_id           bigint references public.combos(id),
  base_price_cents   integer not null default 0 check (base_price_cents >= 0),
  age_discount_cents integer not null default 0 check (age_discount_cents >= 0),
  price_cents        integer not null default 0 check (price_cents >= 0),
  unique (order_id, position)
);
create index ix_tickets_event on public.tickets (event_id);
create index ix_tickets_lot on public.tickets (lot_id) where lot_id is not null;
create index ix_tickets_combo on public.tickets (combo_id) where combo_id is not null;

create table public.ticket_answers (
  ticket_id   bigint not null references public.tickets(id) on delete cascade,
  question_id bigint not null references public.questions(id) on delete cascade,
  value       jsonb not null,
  primary key (ticket_id, question_id)
);
create index ix_ticket_answers_question on public.ticket_answers (question_id);

-- Check-in: uma linha por participante por dia
create table public.checkins (
  ticket_id  bigint not null references public.tickets(id) on delete cascade,
  day        date not null,
  checked_at timestamptz not null default now(),
  checked_by uuid references public.profiles(id) on delete set null,
  primary key (ticket_id, day)
);
create index ix_checkins_checked_by on public.checkins (checked_by) where checked_by is not null;

-- Pagamentos e reembolsos (Mercado Pago), agora por compra
create table public.payments (
  id            bigint generated always as identity primary key,
  order_id      bigint not null references public.orders(id),
  mp_payment_id text not null unique,
  status        text not null,
  amount_cents  integer not null,
  created_at    timestamptz not null default now()
);
create index ix_payments_order on public.payments (order_id);

create table public.refunds (
  id           bigint generated always as identity primary key,
  order_id     bigint not null references public.orders(id),
  payment_id   bigint references public.payments(id),
  mp_refund_id text unique,
  amount_cents integer not null check (amount_cents > 0),
  requested_by uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index ix_refunds_order on public.refunds (order_id);
create index ix_refunds_payment on public.refunds (payment_id) where payment_id is not null;
create index ix_refunds_requested_by on public.refunds (requested_by) where requested_by is not null;

-- ---------------------------------------------------------------------
-- 5. RLS ligado em tudo, sem políticas: as chaves públicas não acessam nada
-- ---------------------------------------------------------------------
alter table public.profiles       enable row level security;
alter table public.event_staff    enable row level security;
alter table public.age_bands      enable row level security;
alter table public.combos         enable row level security;
alter table public.coupons        enable row level security;
alter table public.questions      enable row level security;
alter table public.orders         enable row level security;
alter table public.order_combos   enable row level security;
alter table public.tickets        enable row level security;
alter table public.ticket_answers enable row level security;
alter table public.checkins       enable row level security;
alter table public.payments       enable row level security;
alter table public.refunds        enable row level security;
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. Bucket dos banners: leitura pública, só imagens, até 5 MB.
--    O envio é feito pelo servidor (chave secreta); ninguém envia direto do navegador.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('banners', 'banners', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 7. Permissões (conferidas de novo dentro das funções)
-- ---------------------------------------------------------------------
create function public.is_admin(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select is_admin from public.profiles where id = p_user), false)
$$;

create function public.can_manage_event(p_user uuid, p_event bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin(p_user) or exists (
    select 1 from public.event_staff s join public.profiles p on p.email = s.email
     where p.id = p_user and s.event_id = p_event and s.role = 'manager')
$$;

create function public.can_checkin(p_user uuid, p_event bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.can_manage_event(p_user, p_event) or exists (
    select 1 from public.event_staff s join public.profiles p on p.email = s.email
     where p.id = p_user and s.event_id = p_event and s.role = 'credential')
$$;

-- ---------------------------------------------------------------------
-- 8. Vagas, lotes e preço
-- ---------------------------------------------------------------------
create function public.holds_seat(s text, e timestamptz, o timestamptz) returns boolean
language sql stable set search_path = '' as $$
  select s = 'confirmed'
      or (s = 'pending'  and e > now())
      or (s = 'waitlist' and o is not null and o > now())
$$;

-- Vagas ocupadas = participantes das compras que seguram vaga.
create function public.seats_taken(p_event bigint) returns integer
language sql stable set search_path = '' as $$
  select coalesce(sum(ticket_count), 0)::int from public.orders
   where event_id = p_event and public.holds_seat(status, expires_at, offered_until)
$$;

create function public.lot_sold(p_lot bigint) returns integer
language sql stable set search_path = '' as $$
  select count(*)::int from public.tickets t join public.orders o on o.id = t.order_id
   where t.lot_id = p_lot and public.holds_seat(o.status, o.expires_at, o.offered_until)
$$;

-- Lote vigente: o primeiro (em ordem) que já começou, não terminou e tem ingressos.
create function public.current_lot(p_event bigint) returns public.lots
language sql stable set search_path = '' as $$
  select l.* from public.lots l
   where l.event_id = p_event
     and (l.starts_at is null or l.starts_at <= now())
     and (l.ends_at   is null or l.ends_at   >  now())
     and l.quantity > public.lot_sold(l.id)
   order by l.position
   limit 1
$$;

-- Idade completa numa data de referência
create function public.age_on(p_birth date, p_ref date) returns integer
language sql immutable set search_path = '' as $$
  select extract(year from age(p_ref, p_birth))::int
$$;

-- Calcula o preço de uma compra. Não grava nada.
-- p_people:  [{"birth_date":"2015-03-01"}, ...]  (um item por participante, na ordem)
-- p_combos:  [{"combo_id":1,"quantity":1}, ...]
-- p_coupon:  código ou nulo
-- Ordem: lote por ingresso -> desconto por idade -> combo -> cupom sobre o total.
create function public.price_quote(p_event bigint, p_people jsonb, p_combos jsonb, p_coupon text)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  ev public.events;
  n integer := jsonb_array_length(p_people);
  ref date;
  t jsonb := '[]'::jsonb;          -- ingressos calculados
  cur public.lots; i integer := 0;
  base integer; disc integer; age integer; band public.age_bands;
  covered integer := 0; combo record; k integer; share integer; idx integer;
  order_idx integer[];
  subtotal integer := 0; age_disc integer := 0; combo_disc integer := 0; combo_total integer := 0;
  after_combo integer; cp public.coupons; cp_disc integer := 0; uses integer;
begin
  select * into ev from public.events where id = p_event;
  if not found then raise exception 'event_not_found' using errcode = 'P0001'; end if;
  if n < 1 or n > 20 then raise exception 'bad_quantity' using errcode = 'P0001'; end if;
  ref := coalesce(ev.age_ref_date, (ev.starts_at at time zone 'America/Sao_Paulo')::date);

  -- 1. Lote: todos os ingressos da compra pagam o preço do lote vigente (decidido em 2026-11-04).
  --    Se a compra passar da quantidade que resta no lote, o lote passa um pouco; o próximo começa depois.
  if ev.kind = 'paid' then
    cur := public.current_lot(p_event);
    if cur.id is null then raise exception 'no_lot' using errcode = 'P0001'; end if;
    for i in 0 .. n - 1 loop
      t := t || jsonb_build_object('position', i, 'lot_id', cur.id, 'base', cur.price_cents);
    end loop;
  else
    for i in 0 .. n - 1 loop
      t := t || jsonb_build_object('position', i, 'lot_id', null, 'base', 0);
    end loop;
  end if;

  -- 2. Desconto por idade
  for i in 0 .. n - 1 loop
    base := (t -> i ->> 'base')::int;
    age := public.age_on((p_people -> i ->> 'birth_date')::date, ref);
    if age is null or age < 0 then raise exception 'bad_birth_date' using errcode = 'P0001'; end if;
    select * into band from public.age_bands
     where event_id = p_event and age between min_age and max_age
     order by min_age limit 1;
    disc := case when band.id is null then 0
                 when band.discount_type = 'free' then base
                 when band.discount_type = 'percent' then round(base * band.discount_value / 100.0)::int
                 else least(band.discount_value, base) end;
    t := jsonb_set(t, array[i::text], (t -> i) || jsonb_build_object('age', age, 'age_band_id', band.id, 'age_discount', disc, 'price', base - disc, 'combo_id', null));
    subtotal := subtotal + base;
  end loop;

  -- 3. Combos: entram no combo os participantes que sairiam mais caros avulsos
  if ev.kind = 'paid' and jsonb_array_length(coalesce(p_combos, '[]'::jsonb)) > 0 then
    select array_agg(pos order by price desc, pos) into order_idx
      from (select (x ->> 'position')::int pos, (x ->> 'price')::int price from jsonb_array_elements(t) x) s;
    for combo in
      select c.*, (r ->> 'quantity')::int as qty
        from jsonb_array_elements(p_combos) r
        join public.combos c on c.id = (r ->> 'combo_id')::bigint
       where (r ->> 'quantity')::int > 0
    loop
      if combo.event_id <> p_event or not combo.active then raise exception 'combo_invalid' using errcode = 'P0001'; end if;
      for k in 1 .. combo.qty loop
        if covered + combo.ticket_count > n then raise exception 'combo_too_big' using errcode = 'P0001'; end if;
        for j in 0 .. combo.ticket_count - 1 loop
          idx := order_idx[covered + j + 1];
          share := combo.price_cents / combo.ticket_count + case when j = 0 then combo.price_cents % combo.ticket_count else 0 end;
          combo_disc := combo_disc + (t -> idx ->> 'base')::int - share;
          t := jsonb_set(t, array[idx::text], (t -> idx) || jsonb_build_object('combo_id', combo.id, 'age_discount', 0, 'price', share));
        end loop;
        covered := covered + combo.ticket_count;
        combo_total := combo_total + combo.price_cents;
      end loop;
    end loop;
  end if;

  select coalesce(sum((x ->> 'age_discount')::int), 0) into age_disc from jsonb_array_elements(t) x;
  select coalesce(sum((x ->> 'price')::int), 0) into after_combo from jsonb_array_elements(t) x;
  combo_disc := subtotal - age_disc - after_combo;

  -- 4. Cupom sobre o total
  if coalesce(p_coupon, '') <> '' then
    select * into cp from public.coupons where code = upper(trim(p_coupon));
    if not found or not cp.active or (cp.valid_until is not null and cp.valid_until <= now())
       or (cp.event_id is not null and cp.event_id <> p_event) then
      raise exception 'coupon_invalid' using errcode = 'P0001';
    end if;
    select count(*) into uses from public.orders
     where coupon_id = cp.id and (status = 'confirmed' or public.holds_seat(status, expires_at, offered_until));
    if cp.max_uses is not null and uses >= cp.max_uses then raise exception 'coupon_exhausted' using errcode = 'P0001'; end if;
    cp_disc := case when cp.discount_type = 'percent' then round(after_combo * cp.discount_value / 100.0)::int
                    else least(cp.discount_value, after_combo) end;
  end if;

  return jsonb_build_object(
    'tickets', t, 'subtotal', subtotal, 'age_discount', age_disc, 'combo_discount', combo_disc,
    'combo_total', combo_total, 'coupon_id', cp.id, 'coupon_discount', cp_disc,
    'total', greatest(after_combo - cp_disc, 0));
end $$;

-- ---------------------------------------------------------------------
-- 9. Compra
-- p_buyer:  {"name","email","phone","cpf"} já validados no servidor
-- p_people: [{"name","gender","birth_date","answers":{"<question_id>": valor}}]
-- Retorna a compra com os códigos dos ingressos.
-- ---------------------------------------------------------------------
create function public.place_order(p_event bigint, p_session bigint, p_buyer jsonb, p_people jsonb, p_combos jsonb, p_coupon text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  ev public.events; n integer := jsonb_array_length(p_people); seats_left integer;
  q jsonb; o public.orders; st text; i integer; tk public.tickets; tq jsonb; qrow public.questions; ans jsonb;
  has_sessions boolean;
begin
  select * into ev from public.events where id = p_event for update;
  if not found then raise exception 'event_not_found' using errcode = 'P0001'; end if;
  if ev.status <> 'published' then raise exception 'event_closed' using errcode = 'P0001'; end if;
  if n < 1 or n > 20 then raise exception 'bad_quantity' using errcode = 'P0001'; end if;

  select exists(select 1 from public.event_sessions where event_id = p_event) into has_sessions;
  if has_sessions and p_session is null then raise exception 'session_required' using errcode = 'P0001'; end if;
  if p_session is not null and not exists(select 1 from public.event_sessions where id = p_session and event_id = p_event) then
    raise exception 'session_invalid' using errcode = 'P0001';
  end if;

  -- Respostas obrigatórias e perguntas do próprio evento
  for i in 0 .. n - 1 loop
    if coalesce(p_people -> i ->> 'gender', '') not in ('F', 'M') then raise exception 'bad_gender' using errcode = 'P0001'; end if;
    for qrow in select * from public.questions where event_id = p_event and required loop
      ans := p_people -> i -> 'answers' -> qrow.id::text;
      if ans is null or ans = 'null'::jsonb or ans = '""'::jsonb or ans = '[]'::jsonb then
        raise exception 'answer_required' using errcode = 'P0001';
      end if;
    end loop;
    if exists (select 1 from jsonb_object_keys(coalesce(p_people -> i -> 'answers', '{}'::jsonb)) k
                where not exists (select 1 from public.questions where id = k::bigint and event_id = p_event)) then
      raise exception 'answer_invalid' using errcode = 'P0001';
    end if;
  end loop;

  perform public.expire_stale();

  if exists (select 1 from public.orders where event_id = p_event and buyer_cpf = p_buyer ->> 'cpf'
              and status in ('pending', 'confirmed', 'waitlist')) then
    raise exception 'duplicate' using errcode = 'P0001';
  end if;

  -- Trava o cupom para o limite de usos não estourar em compras simultâneas
  if coalesce(p_coupon, '') <> '' then
    perform 1 from public.coupons where code = upper(trim(p_coupon)) for update;
  end if;

  seats_left := ev.capacity - public.seats_taken(p_event);
  if seats_left <= 0 then
    st := 'waitlist';                          -- evento esgotado: a compra inteira entra na fila
  elsif n > seats_left then
    raise exception 'not_enough_seats:%', seats_left using errcode = 'P0001';
  else
    q := public.price_quote(p_event, p_people, p_combos, p_coupon);
    st := case when (q ->> 'total')::int = 0 then 'confirmed' else 'pending' end;
  end if;

  insert into public.orders (event_id, session_id, buyer_name, buyer_email, buyer_phone, buyer_cpf, status, ticket_count,
                             requested_combos, requested_coupon, subtotal_cents, age_discount_cents, combo_discount_cents,
                             coupon_id, coupon_discount_cents, total_cents, expires_at, confirmed_at)
  values (p_event, p_session, p_buyer ->> 'name', lower(p_buyer ->> 'email'), p_buyer ->> 'phone', p_buyer ->> 'cpf', st, n,
          coalesce(p_combos, '[]'::jsonb), nullif(upper(trim(coalesce(p_coupon, ''))), ''),
          coalesce((q ->> 'subtotal')::int, 0), coalesce((q ->> 'age_discount')::int, 0), coalesce((q ->> 'combo_discount')::int, 0),
          (q ->> 'coupon_id')::bigint, coalesce((q ->> 'coupon_discount')::int, 0), coalesce((q ->> 'total')::int, 0),
          case when st = 'pending' then now() + interval '10 minutes' end,
          case when st = 'confirmed' then now() end)
  returning * into o;

  for i in 0 .. n - 1 loop
    tq := case when q is null then '{}'::jsonb else q -> 'tickets' -> i end;
    insert into public.tickets (order_id, event_id, position, name, gender, birth_date, lot_id, combo_id,
                                base_price_cents, age_discount_cents, price_cents)
    values (o.id, p_event, i, trim(p_people -> i ->> 'name'), p_people -> i ->> 'gender', (p_people -> i ->> 'birth_date')::date,
            (tq ->> 'lot_id')::bigint, (tq ->> 'combo_id')::bigint,
            coalesce((tq ->> 'base')::int, 0), coalesce((tq ->> 'age_discount')::int, 0), coalesce((tq ->> 'price')::int, 0))
    returning * into tk;
    insert into public.ticket_answers (ticket_id, question_id, value)
    select tk.id, k::bigint, v from jsonb_each(coalesce(p_people -> i -> 'answers', '{}'::jsonb)) as a(k, v)
     where v is not null and v <> 'null'::jsonb;
  end loop;

  insert into public.order_combos (order_id, combo_id, quantity, price_cents)
  select o.id, c.id, (r ->> 'quantity')::int, c.price_cents * (r ->> 'quantity')::int
    from jsonb_array_elements(coalesce(p_combos, '[]'::jsonb)) r join public.combos c on c.id = (r ->> 'combo_id')::bigint
   where st <> 'waitlist' and (r ->> 'quantity')::int > 0;

  return jsonb_build_object('order', to_jsonb(o),
    'tickets', (select jsonb_agg(jsonb_build_object('code', code, 'name', name) order by position) from public.tickets where order_id = o.id));
end $$;

-- Quem foi chamado da fila inicia o pagamento: o preço é calculado agora (lote vigente de hoje).
create function public.start_offered(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare o public.orders; people jsonb; q jsonb; st text; t record;
begin
  select * into o from public.orders where code = p_code for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  perform 1 from public.events where id = o.event_id for update;
  if o.status <> 'waitlist' or o.offered_until is null or o.offered_until <= now() then
    raise exception 'offer_invalid' using errcode = 'P0001';
  end if;
  select jsonb_agg(jsonb_build_object('birth_date', birth_date) order by position) into people from public.tickets where order_id = o.id;
  -- a própria oferta segura as vagas; o cálculo ignora a reserva dela nos lotes
  update public.orders set status = 'expired' where id = o.id;
  q := public.price_quote(o.event_id, people, o.requested_combos, o.requested_coupon);
  st := case when (q ->> 'total')::int = 0 then 'confirmed' else 'pending' end;
  update public.orders set status = st, offered_until = null,
         expires_at = case when st = 'pending' then now() + interval '10 minutes' end,
         confirmed_at = case when st = 'confirmed' then now() end,
         subtotal_cents = (q ->> 'subtotal')::int, age_discount_cents = (q ->> 'age_discount')::int,
         combo_discount_cents = (q ->> 'combo_discount')::int, coupon_id = (q ->> 'coupon_id')::bigint,
         coupon_discount_cents = (q ->> 'coupon_discount')::int, total_cents = (q ->> 'total')::int
   where id = o.id returning * into o;
  for t in select value as x from jsonb_array_elements(q -> 'tickets') loop
    update public.tickets set lot_id = (t.x ->> 'lot_id')::bigint, combo_id = (t.x ->> 'combo_id')::bigint,
           base_price_cents = (t.x ->> 'base')::int, age_discount_cents = (t.x ->> 'age_discount')::int, price_cents = (t.x ->> 'price')::int
     where order_id = o.id and position = (t.x ->> 'position')::int;
  end loop;
  insert into public.order_combos (order_id, combo_id, quantity, price_cents)
  select o.id, c.id, (r ->> 'quantity')::int, c.price_cents * (r ->> 'quantity')::int
    from jsonb_array_elements(o.requested_combos) r join public.combos c on c.id = (r ->> 'combo_id')::bigint
   where (r ->> 'quantity')::int > 0
  on conflict do nothing;
  return to_jsonb(o);
end $$;

-- ---------------------------------------------------------------------
-- 10. Pagamento, cancelamento, fila e manutenção
-- ---------------------------------------------------------------------
-- Retorna: confirmed | already | no_seat | amount_mismatch | not_found | invalid_state
create function public.confirm_payment(p_code text, p_mp_payment_id text, p_amount_cents integer) returns text
language plpgsql security definer set search_path = '' as $$
declare o public.orders; ev public.events;
begin
  select * into o from public.orders where code = p_code for update;
  if not found then return 'not_found'; end if;
  if o.status = 'confirmed' then return 'already'; end if;
  if o.status not in ('pending', 'expired') then return 'invalid_state'; end if;
  if p_amount_cents is distinct from o.total_cents then return 'amount_mismatch'; end if;
  select * into ev from public.events where id = o.event_id for update;
  -- Pagamento aprovado depois do prazo: só confirma se ainda couberem todos os participantes.
  if o.status = 'expired' and ev.capacity - public.seats_taken(o.event_id) < o.ticket_count then return 'no_seat'; end if;
  update public.orders set status = 'confirmed', confirmed_at = now(), expires_at = null where id = o.id;
  insert into public.payments (order_id, mp_payment_id, status, amount_cents)
  values (o.id, p_mp_payment_id, 'approved', p_amount_cents) on conflict (mp_payment_id) do nothing;
  return 'confirmed';
end $$;

-- Cancelamento pelo comprador: compra inteira, até 7 dias após confirmar, antes do evento, sem check-in.
-- Retorna: ok | not_allowed | not_found
create function public.cancel_self(p_code text) returns text
language plpgsql security definer set search_path = '' as $$
declare o public.orders; ev public.events;
begin
  select * into o from public.orders where code = p_code for update;
  if not found then return 'not_found'; end if;
  select * into ev from public.events where id = o.event_id;
  if o.status <> 'confirmed' or o.confirmed_at is null or ev.starts_at <= now()
     or now() > o.confirmed_at + interval '7 days'
     or exists (select 1 from public.checkins c join public.tickets t on t.id = c.ticket_id where t.order_id = o.id) then
    return 'not_allowed';
  end if;
  update public.orders set status = 'cancelled', cancelled_at = now() where id = o.id;
  perform public.promote_waitlist(o.event_id);
  return 'ok';
end $$;

create function public.expire_stale() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.orders set status = 'expired'
   where (status = 'pending' and expires_at <= now())
      or (status = 'waitlist' and offered_until is not null and offered_until <= now());
  get diagnostics n = row_count;
  return n;
end $$;

-- Fila: chama a primeira compra da fila que cabe nas vagas abertas (12 horas para pagar).
create function public.promote_waitlist(p_event bigint) returns integer
language plpgsql security definer set search_path = '' as $$
declare ev public.events; left_seats integer; oid bigint; n integer := 0;
begin
  select * into ev from public.events where id = p_event for update;
  if not found or ev.status <> 'published' then return 0; end if;
  loop
    left_seats := ev.capacity - public.seats_taken(p_event);
    exit when left_seats <= 0;
    if ev.kind = 'paid' and (public.current_lot(p_event)).id is null then exit; end if;
    select id into oid from public.orders
     where event_id = p_event and status = 'waitlist' and offered_until is null and ticket_count <= left_seats
     order by created_at, id limit 1 for update skip locked;
    exit when not found;
    update public.orders set offered_until = now() + interval '12 hours' where id = oid;
    n := n + 1;
  end loop;
  return n;
end $$;

create function public.run_maintenance() returns void
language plpgsql security definer set search_path = '' as $$
declare e record;
begin
  perform public.expire_stale();
  for e in select id from public.events where status = 'published' loop
    perform public.promote_waitlist(e.id);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 11. Check-in (Credenciamento) — uma vez por dia por participante
-- Retorna: ok | already | not_confirmed | wrong_event | wrong_day | not_found | forbidden
-- ---------------------------------------------------------------------
create function public.check_in(p_user uuid, p_event bigint, p_ticket_code text, p_day date) returns text
language plpgsql security definer set search_path = '' as $$
declare t public.tickets; o public.orders; ev public.events; d0 date; d1 date;
begin
  if not public.can_checkin(p_user, p_event) then return 'forbidden'; end if;
  select * into t from public.tickets where code = p_ticket_code;
  if not found then return 'not_found'; end if;
  if t.event_id <> p_event then return 'wrong_event'; end if;
  select * into o from public.orders where id = t.order_id;
  if o.status <> 'confirmed' then return 'not_confirmed'; end if;
  select * into ev from public.events where id = p_event;
  d0 := (ev.starts_at at time zone 'America/Sao_Paulo')::date;
  d1 := (coalesce(ev.ends_at, ev.starts_at) at time zone 'America/Sao_Paulo')::date;
  if p_day < d0 or p_day > d1 then return 'wrong_day'; end if;
  insert into public.checkins (ticket_id, day, checked_by) values (t.id, p_day, p_user) on conflict do nothing;
  if not found then return 'already'; end if;
  return 'ok';
end $$;

-- Lista do Credenciamento: só nome do participante e check-in do dia. Sem contatos nem valores.
create function public.checkin_list(p_user uuid, p_event bigint, p_day date)
returns table (ticket_code text, name text, checked_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_checkin(p_user, p_event) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  return query
    select t.code, t.name, c.checked_at
      from public.tickets t
      join public.orders o on o.id = t.order_id and o.status = 'confirmed'
      left join public.checkins c on c.ticket_id = t.id and c.day = p_day
     where t.event_id = p_event
     order by t.name;
end $$;

-- Visão geral do admin
create function public.admin_event_stats(p_user uuid)
returns table (id bigint, name text, starts_at timestamptz, ends_at timestamptz, kind text, status text, capacity integer,
               tickets bigint, waitlist bigint, revenue bigint, checkins bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_admin(p_user) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  return query
    select e.id, e.name, e.starts_at, e.ends_at, e.kind, e.status, e.capacity,
           coalesce((select sum(ticket_count) from public.orders where event_id = e.id and status = 'confirmed'), 0)::bigint,
           coalesce((select sum(ticket_count) from public.orders where event_id = e.id and status = 'waitlist'), 0)::bigint,
           coalesce((select sum(total_cents) from public.orders where event_id = e.id and status = 'confirmed'), 0)::bigint,
           (select count(*) from public.checkins c join public.tickets t on t.id = c.ticket_id where t.event_id = e.id)
      from public.events e
     order by e.starts_at desc;
end $$;

-- ---------------------------------------------------------------------
-- 12. Só o servidor chama as funções
-- ---------------------------------------------------------------------
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

commit;
