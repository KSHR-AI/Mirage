create table if not exists public.mirage_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status text check (
    status is null
    or status in (
      'active',
      'canceled',
      'incomplete',
      'incomplete_expired',
      'past_due',
      'paused',
      'trialing',
      'unpaid'
    )
  ),
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.mirage_subscriptions enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'mirage_subscriptions'
      and policyname = 'Users can read their own subscription'
  ) then
    create policy "Users can read their own subscription"
    on public.mirage_subscriptions
    for select
    to authenticated
    using ((select auth.uid()) = user_id);
  end if;
end $$;

grant select on public.mirage_subscriptions to authenticated;
