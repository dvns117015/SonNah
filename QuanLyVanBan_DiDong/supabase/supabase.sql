-- QUẢN LÝ VĂN BẢN: bảng dữ liệu, vai trò người dùng, phân quyền, nhật ký người sửa, kho ảnh.
-- Cách chạy: Supabase > SQL Editor > New query > dán toàn bộ file này > Run. Chạy lại nhiều lần không sao, không mất dữ liệu.
-- Thêm người dùng: tạo tài khoản ở Authentication > Users, rồi chạy (đổi email, tên, vai trò):
--   insert into public.nhanvien (email, ten, vai_tro) values ('a@gmail.com', 'Nguyễn Văn An', 'can_bo');
-- Vai trò: quan_tri và van_thu = thêm, sửa, xóa tất cả; lanh_dao = chỉ xem; can_bo = xem tất cả,
--          chỉ cập nhật kết quả và đính kèm cho việc được giao (tên trong cột ten khớp thẻ cán bộ).

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
alter table public.vanban add column if not exists nguoi_tao text not null default '';
alter table public.vanban add column if not exists nguoi_sua text not null default '';
alter table public.vanban add column if not exists da_xoa timestamptz;   -- có giá trị = đang ở thùng rác
alter table public.vanban add column if not exists xong_luc timestamptz;  -- giờ chuyển sang Đã xong (để biết hoàn thành trễ hạn)
create index if not exists vanban_han_idx on public.vanban (han);

-- 2) Bảng cấu hình (danh sách loại công việc, danh sách cán bộ)
create table if not exists public.cauhinh (
  key text primary key,
  value jsonb not null default '[]'::jsonb
);

-- 3) Danh sách người được phép dùng, kèm vai trò
create table if not exists public.nhanvien (
  email text primary key
);
alter table public.nhanvien add column if not exists ten text not null default '';
alter table public.nhanvien add column if not exists vai_tro text not null default 'van_thu';
do $$
begin
  alter table public.nhanvien add constraint nhanvien_vai_tro_check
    check (vai_tro in ('quan_tri', 'van_thu', 'lanh_dao', 'can_bo'));
exception when duplicate_object then null;
end $$;

-- 4) Hàm kiểm tra quyền (đặt trong schema private nên không bị gọi từ bên ngoài)
create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.vai_tro() returns text
language sql stable security definer set search_path = public as $fn$
  select vai_tro from public.nhanvien where lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')) limit 1;
$fn$;
create or replace function private.ten_can_bo() returns text
language sql stable security definer set search_path = public as $fn$
  select ten from public.nhanvien where lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')) limit 1;
$fn$;
create or replace function private.la_nhan_vien() returns boolean
language sql stable security definer set search_path = public as $fn$
  select private.vai_tro() is not null;
$fn$;
create or replace function private.duoc_sua() returns boolean
language sql stable security definer set search_path = public as $fn$
  select coalesce(private.vai_tro() in ('quan_tri', 'van_thu'), false);
$fn$;
create or replace function private.duoc_cap_nhat(cb text) returns boolean
language sql stable security definer set search_path = public as $fn$
  select private.duoc_sua() or (
    private.vai_tro() = 'can_bo'
    and length(coalesce(private.ten_can_bo(), '')) > 0
    and position(lower(private.ten_can_bo()) in lower(coalesce(cb, ''))) > 0
  );
$fn$;
create or replace function private.tai_tep_duoc() returns boolean
language sql stable security definer set search_path = public as $fn$
  select coalesce(private.vai_tro() in ('quan_tri', 'van_thu', 'can_bo'), false);
$fn$;
revoke all on function private.vai_tro(), private.ten_can_bo(), private.la_nhan_vien(), private.duoc_sua(),
  private.duoc_cap_nhat(text), private.tai_tep_duoc() from public, anon;
grant execute on function private.vai_tro(), private.ten_can_bo(), private.la_nhan_vien(), private.duoc_sua(),
  private.duoc_cap_nhat(text), private.tai_tep_duoc() to authenticated;

-- 5) Phân quyền theo hàng
alter table public.vanban enable row level security;
alter table public.cauhinh enable row level security;
alter table public.nhanvien enable row level security;

drop policy if exists "nhan vien doc ghi vanban" on public.vanban;
drop policy if exists "vanban xem" on public.vanban;
drop policy if exists "vanban them" on public.vanban;
drop policy if exists "vanban sua" on public.vanban;
drop policy if exists "vanban xoa" on public.vanban;
create policy "vanban xem" on public.vanban for select to authenticated using (private.la_nhan_vien());
create policy "vanban them" on public.vanban for insert to authenticated with check (private.duoc_sua());
create policy "vanban sua" on public.vanban for update to authenticated
  using (private.duoc_cap_nhat(can_bo)) with check (private.duoc_cap_nhat(can_bo));
create policy "vanban xoa" on public.vanban for delete to authenticated using (private.duoc_sua());

drop policy if exists "nhan vien doc ghi cauhinh" on public.cauhinh;
drop policy if exists "cauhinh xem" on public.cauhinh;
drop policy if exists "cauhinh them" on public.cauhinh;
drop policy if exists "cauhinh sua" on public.cauhinh;
drop policy if exists "cauhinh xoa" on public.cauhinh;
create policy "cauhinh xem" on public.cauhinh for select to authenticated using (private.la_nhan_vien());
create policy "cauhinh them" on public.cauhinh for insert to authenticated with check (private.duoc_sua());
create policy "cauhinh sua" on public.cauhinh for update to authenticated using (private.duoc_sua()) with check (private.duoc_sua());
create policy "cauhinh xoa" on public.cauhinh for delete to authenticated using (private.duoc_sua());

-- mỗi người chỉ xem được dòng của chính mình trong danh sách (để biết vai trò); không ai sửa được từ ứng dụng
drop policy if exists "khong ai xem danh sach" on public.nhanvien;
drop policy if exists "nhanvien xem minh" on public.nhanvien;
create policy "nhanvien xem minh" on public.nhanvien for select to authenticated
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

-- 6) Nhật ký: ghi người tạo, người sửa, giờ sửa; cán bộ chỉ được đổi kết quả và đính kèm
create or replace function private.ghi_vet() returns trigger
language plpgsql set search_path = public as $fn$
declare
  e text := coalesce(auth.jwt() ->> 'email', '');
  giu text[] := array['ket_qua', 'ghi_chu_ket_qua', 'bc', 'sua_luc', 'nguoi_sua', 'xong_luc'];
begin
  if tg_op = 'INSERT' then
    new.nguoi_tao := e; new.nguoi_sua := e;
    if new.ket_qua = 'xong' and new.xong_luc is null then new.xong_luc := now(); end if;
  else
    if private.vai_tro() = 'can_bo' and (to_jsonb(new) - giu) is distinct from (to_jsonb(old) - giu) then
      raise exception 'Cán bộ chỉ được cập nhật kết quả và đính kèm cho việc được giao';
    end if;
    new.tao_luc := old.tao_luc; new.nguoi_tao := old.nguoi_tao;
    new.nguoi_sua := e; new.sua_luc := now();
    if new.ket_qua = 'xong' then
      if old.ket_qua is distinct from 'xong' then new.xong_luc := now(); else new.xong_luc := old.xong_luc; end if;
    else
      new.xong_luc := null;
    end if;
  end if;
  return new;
end
$fn$;
drop trigger if exists vanban_ghi_vet on public.vanban;
create trigger vanban_ghi_vet before insert or update on public.vanban
  for each row execute function private.ghi_vet();

-- 7) Kho lưu ảnh và file PDF (riêng tư, mỗi file tối đa 15 MB)
insert into storage.buckets (id, name, public, file_size_limit)
values ('tep', 'tep', false, 15728640)
on conflict (id) do update set public = false, file_size_limit = 15728640;

drop policy if exists "nhan vien doc ghi tep" on storage.objects;
drop policy if exists "tep xem" on storage.objects;
drop policy if exists "tep them" on storage.objects;
drop policy if exists "tep sua" on storage.objects;
drop policy if exists "tep xoa" on storage.objects;
create policy "tep xem" on storage.objects for select to authenticated
  using (bucket_id = 'tep' and private.la_nhan_vien());
create policy "tep them" on storage.objects for insert to authenticated
  with check (bucket_id = 'tep' and private.tai_tep_duoc());
create policy "tep sua" on storage.objects for update to authenticated
  using (bucket_id = 'tep' and private.tai_tep_duoc()) with check (bucket_id = 'tep' and private.tai_tep_duoc());
create policy "tep xoa" on storage.objects for delete to authenticated
  using (bucket_id = 'tep' and private.tai_tep_duoc());

-- 8) Cập nhật trực tiếp: máy này thêm văn bản thì máy khác tự thấy
do $$
begin
  alter publication supabase_realtime add table public.vanban;
exception when duplicate_object then null;
end $$;

-- Người dùng đầu tiên (quản trị): đổi email cho đúng rồi bỏ dấu -- ở đầu dòng nếu cài mới
-- insert into public.nhanvien (email, ten, vai_tro) values ('email-quan-tri@gmail.com', '', 'quan_tri') on conflict (email) do update set vai_tro = 'quan_tri';
