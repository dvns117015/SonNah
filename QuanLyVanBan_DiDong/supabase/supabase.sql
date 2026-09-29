-- QUẢN LÝ VĂN BẢN: tạo bảng, phân quyền và kho ảnh trong Supabase.
-- Cách chạy: Supabase > SQL Editor > New query > dán toàn bộ file này > Run. Chạy lại nhiều lần không sao.
-- Sau đó thêm người dùng: insert into public.nhanvien (email) values ('email@cua-can-bo.com');
-- và tạo tài khoản cùng email đó ở Authentication > Users.

-- 1) Bảng văn bản
create table if not exists public.vanban (
  id text primary key default gen_random_uuid()::text,
  so_van_ban text not null default '',
  ngay_van_ban text not null default '',
  ngay_nhan text not null default '',
  trich_yeu text not null default '',
  noi_dung text not null default '',
  y_kien_chi_dao text not null default '',
  can_bo text not null default '',
  han text not null default '',
  ket_qua text not null default 'chua',
  ghi_chu_ket_qua text not null default '',
  loai text not null default 'vb',
  ky_sau text not null default '',
  anh jsonb not null default '[]'::jsonb,
  bc jsonb not null default '[]'::jsonb,
  tao_luc timestamptz not null default now(),
  sua_luc timestamptz not null default now()
);
create index if not exists vanban_han_idx on public.vanban (han);

-- 2) Bảng cấu hình (danh sách loại công việc, danh sách cán bộ)
create table if not exists public.cauhinh (
  key text primary key,
  value jsonb not null default '[]'::jsonb
);

-- 3) Danh sách người được phép dùng. Chỉ email nằm trong bảng này mới đọc và ghi được dữ liệu,
--    nên dù ai đó tự đăng ký tài khoản bằng link trang web cũng không xem được gì.
create table if not exists public.nhanvien (
  email text primary key
);
alter table public.nhanvien enable row level security;  -- không có chính sách nào: chỉ quản trị sửa được (qua SQL Editor)

create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.la_nhan_vien()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.nhanvien
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$fn$;
revoke all on function private.la_nhan_vien() from public, anon;
grant execute on function private.la_nhan_vien() to authenticated;

drop policy if exists "khong ai xem danh sach" on public.nhanvien;
create policy "khong ai xem danh sach" on public.nhanvien
  for all to authenticated using (false) with check (false);
drop function if exists public.la_nhan_vien();

alter table public.vanban enable row level security;
alter table public.cauhinh enable row level security;

drop policy if exists "nhan vien doc ghi vanban" on public.vanban;
create policy "nhan vien doc ghi vanban" on public.vanban
  for all to authenticated using (private.la_nhan_vien()) with check (private.la_nhan_vien());

drop policy if exists "nhan vien doc ghi cauhinh" on public.cauhinh;
create policy "nhan vien doc ghi cauhinh" on public.cauhinh
  for all to authenticated using (private.la_nhan_vien()) with check (private.la_nhan_vien());

-- 4) Kho lưu ảnh và file PDF (riêng tư, mỗi file tối đa 15 MB)
insert into storage.buckets (id, name, public, file_size_limit)
values ('tep', 'tep', false, 15728640)
on conflict (id) do update set public = false, file_size_limit = 15728640;

drop policy if exists "nhan vien doc ghi tep" on storage.objects;
create policy "nhan vien doc ghi tep" on storage.objects
  for all to authenticated
  using (bucket_id = 'tep' and private.la_nhan_vien()) with check (bucket_id = 'tep' and private.la_nhan_vien());

-- 5) Cập nhật trực tiếp: máy này thêm văn bản thì máy khác tự thấy
do $$
begin
  alter publication supabase_realtime add table public.vanban;
exception when duplicate_object then null;
end $$;
