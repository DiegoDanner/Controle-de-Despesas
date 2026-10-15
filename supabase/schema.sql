-- Execute no SQL Editor do seu projeto Supabase.
create extension if not exists pgcrypto;

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null default current_date,
  description text not null,
  details text,
  total_amount numeric(12,2) not null check (total_amount >= 0),
  paid_amount numeric(12,2) not null default 0 check (paid_amount >= 0 and paid_amount <= total_amount),
  is_paid boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  payment_date date not null default current_date,
  total_amount numeric(12,2) not null check (total_amount > 0),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expense_id uuid not null references public.expenses(id) on delete cascade,
  payment_batch_id uuid references public.payment_batches(id) on delete cascade,
  payment_date date not null default current_date,
  amount numeric(12,2) not null check (amount > 0),
  notes text,
  created_at timestamptz not null default now()
);

alter table public.payments
  add column if not exists payment_batch_id uuid references public.payment_batches(id) on delete cascade;

create index if not exists expenses_user_date_idx on public.expenses(user_id, date desc);
create index if not exists payments_user_date_idx on public.payments(user_id, payment_date desc);
create index if not exists payments_batch_idx on public.payments(payment_batch_id);
create index if not exists payment_batches_user_date_idx on public.payment_batches(user_id, payment_date desc);

alter table public.expenses enable row level security;
alter table public.payments enable row level security;
alter table public.payment_batches enable row level security;

drop policy if exists "Users manage own expenses" on public.expenses;
create policy "Users manage own expenses" on public.expenses
for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage own payments" on public.payments;
create policy "Users manage own payments" on public.payments
for all to authenticated using (auth.uid() = user_id) with check (
  auth.uid() = user_id and exists (
    select 1 from public.expenses e
    where e.id = expense_id and e.user_id = auth.uid()
  )
);

drop policy if exists "Users manage own payment batches" on public.payment_batches;
create policy "Users manage own payment batches" on public.payment_batches
for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, delete on public.payment_batches to authenticated;

create or replace function public.create_payment_receipt(
  p_amount numeric,
  p_payment_date date,
  p_notes text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_receipt_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado.';
  end if;
  if p_amount is null or round(p_amount, 2) <= 0 then
    raise exception 'Informe um valor recebido maior que zero.';
  end if;

  insert into public.payment_batches (user_id, payment_date, total_amount, notes)
  values (auth.uid(), p_payment_date, round(p_amount, 2), nullif(trim(p_notes), ''))
  returning id into v_receipt_id;

  return v_receipt_id;
end;
$function$;

drop function if exists public.create_payment_batch(uuid[], numeric, date, text);

create or replace function public.delete_payment_batch(p_batch_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_batch public.payment_batches%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado.';
  end if;

  select * into v_batch
  from public.payment_batches
  where id = p_batch_id and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Recebimento não encontrado.';
  end if;

  delete from public.payment_batches
  where id = p_batch_id and user_id = auth.uid();
end;
$function$;

grant execute on function public.create_payment_receipt(numeric, date, text) to authenticated;
grant execute on function public.delete_payment_batch(uuid) to authenticated;

create or replace function public.delete_all_financial_data()
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
begin
  if auth.uid() is null then
    raise exception 'Não autenticado.';
  end if;

  delete from public.payments where user_id = auth.uid();
  delete from public.payment_batches where user_id = auth.uid();
  delete from public.expenses where user_id = auth.uid();
end;
$function$;

grant execute on function public.delete_all_financial_data() to authenticated;

-- Optional: sample rows should be inserted only after creating a user.
-- Replace USER_UUID with the id from Authentication > Users.
-- insert into public.expenses (user_id, date, description, details, total_amount, paid_amount, is_paid)
-- values ('USER_UUID', '2026-04-01', 'Tirzepatida (Tirzec)', 'em 3 x de 200 (3 pagas - quitado)', 600, 600, true);
