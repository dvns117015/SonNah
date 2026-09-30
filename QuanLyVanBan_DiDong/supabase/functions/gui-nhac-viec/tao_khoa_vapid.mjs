// Tạo khóa VAPID và mã lịch cho thông báo đẩy. Chạy: node tao_khoa_vapid.mjs
import { generateVapidKeys } from './webpush.js';
import { randomBytes } from 'node:crypto';
const k = await generateVapidKeys();
const j = k.privateJwk;
console.log('<KHOA-CONG-KHAI>   =', k.publicKey);
console.log('<KHOA-BI-MAT-JSON> =', JSON.stringify({ kty: j.kty, crv: j.crv, x: j.x, y: j.y, d: j.d }));
console.log('<MA-LICH>          =', randomBytes(24).toString('hex'));
console.log('\nĐặt khóa công khai vào docs/config.js (vapidPublicKey). KHÔNG đưa khóa bí mật lên GitHub.');
