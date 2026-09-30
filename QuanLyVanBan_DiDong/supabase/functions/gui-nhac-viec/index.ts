// Edge Function: gửi thông báo đẩy nhắc việc. Chạy mỗi sáng theo lịch (pg_cron) hoặc khi người dùng bấm "Gửi thử".
import { sendPush } from './webpush.js';

const SB = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY') || SERVICE;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-cron-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
// Chỉ gửi tới máy chủ thông báo của trình duyệt (chặn địa chỉ lạ do người dùng tự nhập)
const PUSH_HOST = /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com|push\.services\.mozilla\.com)$/;

function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(SB + '/rest/v1/' + path, {
    ...init,
    headers: { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (!r.ok) throw new Error(path.split('?')[0] + ' ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return r.status === 204 ? null : await r.json();
}
function todayVN() { return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10); }
function addDays(iso: string, n: number) { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
const vn = (s: string) => s.split('-').reverse().join('/');
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const secrets: Record<string, string> = Object.fromEntries((await rest('bi_mat?select=key,value')).map((r: any) => [r.key, r.value]));
    const body = await req.json().catch(() => ({}));
    let onlyEmail: string | null = null, test = false;

    if (req.headers.get('x-cron-key') && req.headers.get('x-cron-key') === secrets.cron_key) {
      // gọi theo lịch
    } else {
      // người dùng đã đăng nhập bấm "Gửi thử": chỉ gửi cho chính họ
      const auth = req.headers.get('authorization') || '';
      const u = await fetch(SB + '/auth/v1/user', { headers: { apikey: ANON, Authorization: auth } });
      if (!u.ok) return json({ error: 'Chưa đăng nhập' }, 401);
      onlyEmail = String((await u.json()).email || '').toLowerCase();
      const nv = await rest('nhanvien?select=email,ten,vai_tro');
      if (!nv.some((x: any) => String(x.email).toLowerCase() === onlyEmail)) return json({ error: 'Tài khoản không có trong danh sách' }, 403);
      test = !!body.test;
    }

    const today = todayVN(), limit = addDays(today, 3);
    const docs = ((await rest('vanban?select=id,so_van_ban,trich_yeu,can_bo,han,ket_qua&da_xoa=is.null&ket_qua=in.(chua,dang)&han=lte.' + limit + '&order=han.asc')) as any[]).filter((d) => d.han);
    const staff = new Map<string, any>((await rest('nhanvien?select=email,ten,vai_tro') as any[]).map((x) => [String(x.email).toLowerCase(), x]));
    let subs = (await rest('dang_ky_push?select=endpoint,p256dh,auth,email' + (onlyEmail ? '&email=eq.' + encodeURIComponent(onlyEmail) : ''))) as any[];

    const vapid = { publicKey: secrets.vapid_public, privateJwk: JSON.parse(secrets.vapid_private), subject: 'https://dvns117015.github.io/SonNah/' };
    const result = { sent: 0, skipped: 0, removed: 0, failed: 0, errors: [] as string[] };

    for (const s of subs) {
      const who = staff.get(String(s.email).toLowerCase());
      let host = ''; try { host = new URL(s.endpoint).hostname; } catch { /* bỏ qua */ }
      if (!who || !PUSH_HOST.test(host)) {   // người đã bị gỡ quyền hoặc địa chỉ lạ: xóa đăng ký
        await rest('dang_ky_push?endpoint=eq.' + encodeURIComponent(s.endpoint), { method: 'DELETE' }).catch(() => {});
        result.removed++; continue;
      }
      const mine = who.vai_tro === 'can_bo'
        ? docs.filter((d) => who.ten && String(d.can_bo).toLowerCase().includes(String(who.ten).toLowerCase()))
        : docs;
      let payload: Record<string, string>;
      if (!mine.length) {
        if (!test) { result.skipped++; continue; }
        payload = { title: 'Thông báo đẩy đã hoạt động', body: 'Hiện không có việc nào quá hạn hoặc sắp đến hạn.', url: './', tag: 'thu' };
      } else {
        const late = mine.filter((d) => d.han < today).length, first = mine[0];
        payload = {
          title: 'Nhắc việc văn bản',
          body: mine.length + ' việc cần xử lý' + (late ? ', ' + late + ' quá hạn' : '') + '. ' + cut((first.so_van_ban ? first.so_van_ban + ' ' : '') + first.trich_yeu, 60) + ' (hạn ' + vn(first.han) + ')',
          url: './', tag: 'nhac-viec',
        };
      }
      const r = await sendPush({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth }, payload, vapid);
      if (r.ok) result.sent++;
      else if (r.gone) { await rest('dang_ky_push?endpoint=eq.' + encodeURIComponent(s.endpoint), { method: 'DELETE' }).catch(() => {}); result.removed++; }
      else { result.failed++; result.errors.push(host + ' ' + r.status + ' ' + r.text); }
    }
    return json(result);
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
