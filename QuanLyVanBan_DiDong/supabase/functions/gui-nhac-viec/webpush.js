// Gửi Web Push (RFC 8030, mã hóa aes128gcm theo RFC 8291, VAPID theo RFC 8292) chỉ bằng WebCrypto và fetch.
// Chạy được trong Deno (Supabase Edge Functions) và Node 20+.
const enc = new TextEncoder();

export function b64uToBytes(s) {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export function bytesToB64u(b) {
  let s = '';
  b = new Uint8Array(b);
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function concat(...arrs) {
  const n = arrs.reduce((a, x) => a + x.length, 0), out = new Uint8Array(n);
  let o = 0;
  for (const x of arrs) { out.set(x, o); o += x.length; }
  return out;
}
async function hkdf(salt, ikm, info, len) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, len * 8));
}

// Sinh cặp khóa VAPID: { publicKey: base64url (65 byte), privateJwk }
export async function generateVapidKeys() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  return { publicKey: bytesToB64u(pub), privateJwk: jwk };
}

async function vapidHeader(endpoint, vapid) {
  const aud = new URL(endpoint).origin;
  const head = bytesToB64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = bytesToB64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: vapid.subject || 'mailto:admin@example.com' })));
  const key = await crypto.subtle.importKey('jwk', vapid.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(head + '.' + claims)));
  return 'vapid t=' + head + '.' + claims + '.' + bytesToB64u(sig) + ', k=' + vapid.publicKey;
}

// Mã hóa nội dung theo aes128gcm (một bản ghi)
export async function encryptPayload(sub, payloadBytes) {
  const uaPublic = b64uToBytes(sub.p256dh), authSecret = b64uToBytes(sub.auth);
  const eph = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, eph.privateKey, 256));
  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, shared, keyInfo, 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const padded = concat(payloadBytes, new Uint8Array([2]));  // 0x02 = bản ghi cuối
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, padded));
  const rs = new Uint8Array([0, 0, 16, 0]);  // 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

// Gửi một thông báo. Trả về { ok, status, gone } (gone = đăng ký không còn hiệu lực, nên xóa)
export async function sendPush(sub, payload, vapid, opts = {}) {
  const body = await encryptPayload(sub, enc.encode(typeof payload === 'string' ? payload : JSON.stringify(payload)));
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(opts.ttl ?? 43200),
      Urgency: opts.urgency || 'normal',
      Authorization: await vapidHeader(sub.endpoint, vapid),
    },
    body,
  });
  return { ok: res.ok, status: res.status, gone: res.status === 404 || res.status === 410, text: res.ok ? '' : (await res.text()).slice(0, 200) };
}
