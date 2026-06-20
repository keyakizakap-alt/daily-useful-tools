-- ===========================================================================
-- ポチパス 初期スキーマ + Row Level Security
-- Supabase SQL Editor もしくは `supabase db push` で適用する。
-- Prisma の schema.prisma と整合させること。
-- ===========================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- users_profile
-- ---------------------------------------------------------------------------
create table if not exists public.users_profile (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null unique references auth.users(id) on delete cascade,
  display_name       text,
  stripe_customer_id text unique,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- subscriptions
-- ---------------------------------------------------------------------------
create table if not exists public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id     text,
  stripe_subscription_id text unique,
  stripe_price_id        text,
  plan                   text not null default 'free',
  status                 text not null default 'active',
  current_period_start   timestamptz,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists idx_subscriptions_user on public.subscriptions(user_id);

-- ---------------------------------------------------------------------------
-- certifications (公開マスタ)
-- ---------------------------------------------------------------------------
create table if not exists public.certifications (
  id           uuid primary key default gen_random_uuid(),
  vendor       text not null,
  code         text not null unique,
  name         text not null,
  level        text,
  category     text not null,
  description  text,
  official_url text,
  is_active    boolean not null default true
);

-- ---------------------------------------------------------------------------
-- user_certification_goals
-- ---------------------------------------------------------------------------
create table if not exists public.user_certification_goals (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users(id) on delete cascade,
  certification_id        uuid not null references public.certifications(id),
  exam_date               date,
  target_score            int,
  current_level           int not null default 0,
  daily_available_minutes int not null default 30,
  status                  text not null default 'active',
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index if not exists idx_goals_user on public.user_certification_goals(user_id);

-- ---------------------------------------------------------------------------
-- study_plans
-- ---------------------------------------------------------------------------
create table if not exists public.study_plans (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  goal_id         uuid not null references public.user_certification_goals(id) on delete cascade,
  title           text not null,
  start_date      date not null,
  end_date        date not null,
  generated_by_ai boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_plans_user on public.study_plans(user_id);

-- ---------------------------------------------------------------------------
-- study_tasks
-- ---------------------------------------------------------------------------
create table if not exists public.study_tasks (
  id                uuid primary key default gen_random_uuid(),
  study_plan_id     uuid not null references public.study_plans(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  goal_id           uuid not null references public.user_certification_goals(id) on delete cascade,
  task_date         date not null,
  title             text not null,
  description       text,
  estimated_minutes int not null default 30,
  domain            text,
  status            text not null default 'todo',
  completed_at      timestamptz
);
create index if not exists idx_tasks_user on public.study_tasks(user_id);
create index if not exists idx_tasks_date on public.study_tasks(task_date);

-- ---------------------------------------------------------------------------
-- study_logs
-- ---------------------------------------------------------------------------
create table if not exists public.study_logs (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  goal_id             uuid not null references public.user_certification_goals(id) on delete cascade,
  studied_at          date not null,
  minutes             int not null,
  content             text,
  understanding_level int,
  memo                text,
  domain              text
);
create index if not exists idx_logs_user on public.study_logs(user_id);

-- ---------------------------------------------------------------------------
-- mock_exam_results
-- ---------------------------------------------------------------------------
create table if not exists public.mock_exam_results (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  goal_id              uuid not null references public.user_certification_goals(id) on delete cascade,
  taken_at             date not null,
  score                int not null,
  max_score            int not null,
  correct_rate         double precision not null,
  domain_breakdown_json jsonb,
  weak_domains_json    jsonb,
  memo                 text
);
create index if not exists idx_mock_user on public.mock_exam_results(user_id);

-- ---------------------------------------------------------------------------
-- ai_reviews
-- ---------------------------------------------------------------------------
create table if not exists public.ai_reviews (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  goal_id           uuid not null references public.user_certification_goals(id) on delete cascade,
  review_type       text not null default 'weekly',
  content           text not null,
  pass_probability  double precision,
  weak_domains_json jsonb,
  next_actions_json jsonb,
  created_at        timestamptz not null default now()
);
create index if not exists idx_reviews_user on public.ai_reviews(user_id);

-- ---------------------------------------------------------------------------
-- usage_limits (月次)
-- ---------------------------------------------------------------------------
create table if not exists public.usage_limits (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  period_start          date not null,
  period_end            date not null,
  ai_review_count       int not null default 0,
  plan_generation_count int not null default 0,
  mock_exam_count       int not null default 0,
  unique(user_id, period_start)
);
create index if not exists idx_usage_user on public.usage_limits(user_id);

-- ---------------------------------------------------------------------------
-- webhook_events (冪等性)
-- ---------------------------------------------------------------------------
create table if not exists public.webhook_events (
  id              uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  type            text not null,
  processed_at    timestamptz not null default now(),
  payload_json    jsonb
);

-- ===========================================================================
-- updated_at 自動更新トリガ
-- ===========================================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['users_profile','subscriptions','user_certification_goals','study_plans']
  loop
    execute format('drop trigger if exists trg_updated_at on public.%I', t);
    execute format('create trigger trg_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end$$;

-- ===========================================================================
-- Row Level Security
-- ===========================================================================
alter table public.users_profile            enable row level security;
alter table public.subscriptions            enable row level security;
alter table public.certifications           enable row level security;
alter table public.user_certification_goals enable row level security;
alter table public.study_plans              enable row level security;
alter table public.study_tasks              enable row level security;
alter table public.study_logs               enable row level security;
alter table public.mock_exam_results        enable row level security;
alter table public.ai_reviews               enable row level security;
alter table public.usage_limits             enable row level security;
alter table public.webhook_events           enable row level security;

-- certifications: 全認証ユーザーが閲覧可。書き込みは service_role のみ。
drop policy if exists cert_select on public.certifications;
create policy cert_select on public.certifications
  for select using (is_active = true);

-- 所有者のみ全操作可能な汎用ポリシーを各テーブルに付与。
-- (service_role はRLSをバイパスするためWebhook/管理処理はそのまま動く)
do $$
declare t text;
begin
  foreach t in array array[
    'users_profile','subscriptions','user_certification_goals','study_plans',
    'study_tasks','study_logs','mock_exam_results','ai_reviews','usage_limits'
  ]
  loop
    execute format('drop policy if exists owner_select on public.%I', t);
    execute format('drop policy if exists owner_insert on public.%I', t);
    execute format('drop policy if exists owner_update on public.%I', t);
    execute format('drop policy if exists owner_delete on public.%I', t);

    execute format('create policy owner_select on public.%I for select using (auth.uid() = user_id)', t);
    execute format('create policy owner_insert on public.%I for insert with check (auth.uid() = user_id)', t);
    execute format('create policy owner_update on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    execute format('create policy owner_delete on public.%I for delete using (auth.uid() = user_id)', t);
  end loop;
end$$;

-- subscriptions / usage_limits は「ユーザーは閲覧のみ」。書き込みはサーバー(service_role)経由。
drop policy if exists owner_insert on public.subscriptions;
drop policy if exists owner_update on public.subscriptions;
drop policy if exists owner_delete on public.subscriptions;
drop policy if exists owner_insert on public.usage_limits;
drop policy if exists owner_update on public.usage_limits;
drop policy if exists owner_delete on public.usage_limits;

-- webhook_events は service_role のみ (ポリシー無し = 一般ユーザーは不可)
