-- THÔNG BÁO ĐẨY: bảng đăng ký, khóa bí mật và lịch gửi mỗi sáng 7h30 (giờ Việt Nam).
-- Dự án hiện tại ĐÃ chạy sẵn file này. Chỉ cần dùng khi cài lại từ đầu trên một dự án Supabase khác:
--   1) Chạy supabase.sql trước.
--   2) Tạo khóa VAPID:  node supabase/functions/gui-nhac-viec/tao_khoa_vapid.mjs   (in ra 3 giá trị)
--   3) Thay 3 chỗ <...> bên dưới bằng giá trị vừa in ra rồi chạy file này trong SQL Editor.
--   4) Triển khai hàm gui-nhac-viec (thư mục supabase/functions/gui-nhac-viec), tắt "Verify JWT".
--   5) Thay <MA-DU-AN> trong lịch gửi bằng mã dự án (phần đầu địa chỉ Project URL), đặt vapidPublicKey trong config.js.

create table if not exists public.bi_mat (key text primary key, value text not null);
alter table public.bi_mat enable row level security;
revoke all on public.bi_mat from anon, authenticated;
insert into public.bi_mat (key, value) values
  ('vapid_public', '<KHOA-CONG-KHAI>'),
  ('vapid_private', '<KHOA-BI-MAT-JSON>'),
  ('cron_key', '<MA-LICH>')
on conflict (key) do nothing;

create table if not exists public.dang_ky_push (
  endpoint text primary key,
  p256dh text not null,
  auth text not null,
  email text not null default '',
  ua text not null default '',
  tao_luc timestamptz not null default now()
);
alter table public.dang_ky_push enable row level security;

create or replace function private.gan_email_push() returns trigger
language plpgsql set search_path = public as $fn$
begin
  new.email := lower(coalesce(auth.jwt() ->> 'email', ''));
  return new;
end
$fn$;
drop trigger if exists dang_ky_push_email on public.dang_ky_push;
create trigger dang_ky_push_email before insert or update on public.dang_ky_push
  for each row execute function private.gan_email_push();

drop policy if exists "push xem" on public.dang_ky_push;
drop policy if exists "push them" on public.dang_ky_push;
drop policy if exists "push sua" on public.dang_ky_push;
drop policy if exists "push xoa" on public.dang_ky_push;
create policy "push xem" on public.dang_ky_push for select to authenticated
  using (private.la_nhan_vien() and email = lower(coalesce(auth.jwt() ->> 'email', '')));
create policy "push them" on public.dang_ky_push for insert to authenticated with check (private.la_nhan_vien());
create policy "push sua" on public.dang_ky_push for update to authenticated
  using (private.la_nhan_vien() and email = lower(coalesce(auth.jwt() ->> 'email', '')))
  with check (private.la_nhan_vien());
create policy "push xoa" on public.dang_ky_push for delete to authenticated
  using (private.la_nhan_vien() and email = lower(coalesce(auth.jwt() ->> 'email', '')));

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- 00:30 UTC = 07:30 giờ Việt Nam, mỗi ngày
select cron.schedule(
  'nhac-viec-hang-ngay',
  '30 0 * * *',
  $cmd$select net.http_post(
    url := 'https://<MA-DU-AN>.supabase.co/functions/v1/gui-nhac-viec',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', (select value from public.bi_mat where key = 'cron_key')),
    body := '{}'::jsonb
  )$cmd$
);
