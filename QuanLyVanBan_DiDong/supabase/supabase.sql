-- QUẢN LÝ VĂN BẢN: tạo bảng, phân quyền và kho ảnh trong Supabase.
-- Cách chạy: Supabase > SQL Editor > New query > dán toàn bộ file này > Run. Chạy lại nhiều lần không sao.

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

-- 3) Chỉ tài khoản đã đăng nhập mới đọc và ghi được (người lạ có link trang cũng không xem được dữ liệu)
alter table public.vanban enable row level security;
alter table public.cauhinh enable row level security;

drop policy if exists "nhan vien doc ghi vanban" on public.vanban;
create policy "nhan vien doc ghi vanban" on public.vanban
  for all to authenticated using (true) with check (true);

drop policy if exists "nhan vien doc ghi cauhinh" on public.cauhinh;
create policy "nhan vien doc ghi cauhinh" on public.cauhinh
  for all to authenticated using (true) with check (true);

-- 4) Kho lưu ảnh và file PDF (riêng tư, mỗi file tối đa 15 MB)
insert into storage.buckets (id, name, public, file_size_limit)
values ('tep', 'tep', false, 15728640)
on conflict (id) do update set public = false, file_size_limit = 15728640;

drop policy if exists "nhan vien doc ghi tep" on storage.objects;
create policy "nhan vien doc ghi tep" on storage.objects
  for all to authenticated using (bucket_id = 'tep') with check (bucket_id = 'tep');

-- 5) Cập nhật trực tiếp: máy này thêm văn bản thì máy khác tự thấy
do $$
begin
  alter publication supabase_realtime add table public.vanban;
exception when duplicate_object then null;
end $$;
