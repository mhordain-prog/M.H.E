-- M.H.E GOLD referral storage
-- Run this script once in the Supabase SQL Editor for the project used by M.H.E.
create table if not exists public.mhe_referrals (
  code text primary key check (code ~ '^[A-F0-9]{10}$'),
  visits bigint not null default 0 check (visits >= 0),
  validated_referrals integer not null default 0 check (validated_referrals >= 0),
  created_at timestamptz not null default now()
);

alter table public.mhe_referrals enable row level security;
revoke all on table public.mhe_referrals from anon, authenticated;
grant all on table public.mhe_referrals to service_role;

create or replace function public.mhe_record_referral_visit(p_code text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.mhe_referrals
  set visits = visits + 1
  where code = upper(p_code);
$$;

revoke all on function public.mhe_record_referral_visit(text) from public, anon, authenticated;
grant execute on function public.mhe_record_referral_visit(text) to service_role;
