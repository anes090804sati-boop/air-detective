-- Supabase SQL Editor에서 한 번 실행하세요.
create table if not exists public.reports (
  id uuid primary key,
  location text not null,
  type text not null,
  description text not null,
  lat numeric not null,
  lon numeric not null,
  created_at timestamptz not null default now()
);
create index if not exists reports_created_at_idx on public.reports (created_at desc);
alter table public.reports enable row level security;
-- 별도 RLS 정책을 만들지 않습니다. 클라이언트 직접 접근은 막고,
-- 서버가 SUPABASE_SERVICE_ROLE_KEY로 검증된 제보만 저장/조회합니다.
