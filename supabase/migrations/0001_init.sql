-- ============================================================
-- スクショ・ナレッジベース: 初期スキーマ + RLS ポリシー
-- Supabase ダッシュボードの SQL Editor に貼り付けて実行するか、
-- `supabase db push` で適用してください。
-- ============================================================

-- 高速な部分一致検索（日本語キーワード検索）用
create extension if not exists pg_trgm;

-- ------------------------------------------------------------
-- screenshots テーブル
-- ------------------------------------------------------------
create table if not exists public.screenshots (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid()
               references auth.users (id) on delete cascade,
  storage_path text not null,            -- 例: {user_id}/{uuid}.png
  mime_type    text not null default 'image/png',
  status       text not null default 'pending'
               check (status in ('pending', 'analyzed', 'failed')),
  -- Gemini 解析結果
  ocr_text     text,                     -- 画像内テキスト (OCR)
  summary      text,                     -- 内容の要約
  category     text,                     -- 例: Web記事 / SNS / 店舗情報 ...
  tags         text[] not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- 検索用インデックス
create index if not exists screenshots_user_id_idx
  on public.screenshots (user_id, created_at desc);
create index if not exists screenshots_tags_idx
  on public.screenshots using gin (tags);
create index if not exists screenshots_ocr_trgm_idx
  on public.screenshots using gin (ocr_text gin_trgm_ops);
create index if not exists screenshots_summary_trgm_idx
  on public.screenshots using gin (summary gin_trgm_ops);

-- updated_at 自動更新
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists screenshots_set_updated_at on public.screenshots;
create trigger screenshots_set_updated_at
  before update on public.screenshots
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- RLS: 自分の行しか参照・作成・変更・削除できない
-- ------------------------------------------------------------
alter table public.screenshots enable row level security;

drop policy if exists "screenshots_select_own" on public.screenshots;
create policy "screenshots_select_own"
  on public.screenshots for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "screenshots_insert_own" on public.screenshots;
create policy "screenshots_insert_own"
  on public.screenshots for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "screenshots_update_own" on public.screenshots;
create policy "screenshots_update_own"
  on public.screenshots for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "screenshots_delete_own" on public.screenshots;
create policy "screenshots_delete_own"
  on public.screenshots for delete
  to authenticated
  using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- Storage: プライベートバケット "screenshots"
-- パス規約: {user_id}/{filename} — 先頭フォルダ名と auth.uid() の
-- 一致を強制することで、他人のファイルへのアクセスを遮断する
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'screenshots',
  'screenshots',
  false,                                   -- 非公開（署名付きURLでのみ閲覧）
  10485760,                                -- 10MB 上限
  array['image/png', 'image/jpeg', 'image/webp', 'image/heic']
)
on conflict (id) do nothing;

drop policy if exists "screenshots_storage_select_own" on storage.objects;
create policy "screenshots_storage_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'screenshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "screenshots_storage_insert_own" on storage.objects;
create policy "screenshots_storage_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'screenshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "screenshots_storage_update_own" on storage.objects;
create policy "screenshots_storage_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'screenshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "screenshots_storage_delete_own" on storage.objects;
create policy "screenshots_storage_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'screenshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
