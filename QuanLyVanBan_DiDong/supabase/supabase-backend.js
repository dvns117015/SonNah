/* Kho dữ liệu cho bản chạy trên web riêng (GitHub Pages) dùng Supabase:
   dữ liệu trong bảng vanban/cauhinh, ảnh và PDF trong kho "tep", đăng nhập bằng email + mật khẩu do quản trị tạo. */
(function () {
  var T = 'vanban', C = 'cauhinh', BUCKET = 'tep';
  var sb = null, initP = null, rtTimer = null;
  window.PROOF_MAX_BYTES = 10 * 1024 * 1024;
  window.FEATURES = { trash: true, audit: true, backup: true, push: true };

  function cfg() {
    var c = window.SUPABASE_CONFIG || {};
    if (c.url && c.anonKey) return c;
    try { var l = JSON.parse(localStorage.getItem('sb-config') || 'null'); if (l && l.url && l.anonKey) return l; } catch (e) { }
    return null;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function overlay(html) {
    var m = document.createElement('div'); m.className = 'modal'; m.id = 'authModal';
    m.innerHTML = '<div class="box">' + html + '</div>'; document.body.appendChild(m); return m;
  }
  function setupUI() {
    return new Promise(function (resolve) {
      var m = overlay('<p><b>Kết nối Supabase</b></p><p class="tip">Dán Project URL và anon key (Supabase, mục Project Settings, API). Chỉ làm một lần trên mỗi điện thoại.</p>' +
        '<input class="field" id="sbUrl" placeholder="https://abcd.supabase.co" autocapitalize="off" autocomplete="off">' +
        '<input class="field" id="sbKey" placeholder="anon public key" autocapitalize="off" autocomplete="off">' +
        '<p class="tip" id="sbErr" style="color:var(--red)" hidden></p><div class="acts"><button class="btn primary" id="sbSave">Lưu</button></div>');
      m.querySelector('#sbSave').onclick = function () {
        var u = m.querySelector('#sbUrl').value.trim().replace(/\/+$/, ''), k = m.querySelector('#sbKey').value.trim();
        if (!/^https:\/\/[^\s]+$/.test(u) || k.length < 20) { var e = m.querySelector('#sbErr'); e.hidden = false; e.textContent = 'URL phải bắt đầu bằng https:// và cần dán đủ anon key.'; return; }
        try { localStorage.setItem('sb-config', JSON.stringify({ url: u, anonKey: k })); } catch (x) { }
        document.body.removeChild(m); resolve({ url: u, anonKey: k });
      };
    });
  }
  function loginUI(msg) {
    return new Promise(function (resolve) {
      var m = overlay('<p><b>Đăng nhập</b></p><p class="tip">Dùng email và mật khẩu do người quản trị cấp.</p>' +
        '<input class="field" id="lgEmail" type="email" placeholder="Email" autocapitalize="off" autocomplete="username">' +
        '<input class="field" id="lgPass" type="password" placeholder="Mật khẩu" autocomplete="current-password">' +
        '<p class="tip" id="lgErr" style="color:var(--red)" ' + (msg ? '' : 'hidden') + '>' + esc(msg || '') + '</p>' +
        '<div class="acts"><button class="btn primary" id="lgGo">Vào</button></div>');
      var go = function () {
        var b = m.querySelector('#lgGo'), err = m.querySelector('#lgErr');
        b.disabled = true; b.textContent = 'Đang vào...';
        sb.auth.signInWithPassword({ email: m.querySelector('#lgEmail').value.trim(), password: m.querySelector('#lgPass').value }).then(function (r) {
          if (r.error) { err.hidden = false; err.textContent = /invalid/i.test(r.error.message) ? 'Sai email hoặc mật khẩu.' : r.error.message; b.disabled = false; b.textContent = 'Vào'; return; }
          document.body.removeChild(m); resolve();
        }, function (e) { err.hidden = false; err.textContent = 'Không kết nối được. Kiểm tra mạng.'; b.disabled = false; b.textContent = 'Vào'; });
      };
      m.querySelector('#lgGo').onclick = go;
      m.querySelector('#lgPass').onkeydown = function (e) { if (e.key === 'Enter') go(); };
    });
  }
  function subscribe() {
    try {
      sb.channel('vb-changes').on('postgres_changes', { event: '*', schema: 'public', table: T }, function () {
        clearTimeout(rtTimer); rtTimer = setTimeout(function () { if (window.__reload) window.__reload(); }, 500);
      }).subscribe();
    } catch (e) { }
  }
  function init() {
    if (initP) return initP;
    initP = (async function () {
      var c = cfg(); if (!c) c = await setupUI();
      if (!window.supabase) throw new Error('Không tải được thư viện Supabase. Kiểm tra mạng rồi mở lại trang.');
      if (!sb) {
        sb = window.supabase.createClient(c.url, c.anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
        subscribe();
      }
      var s = await sb.auth.getSession();
      if (!(s.data && s.data.session)) await loginUI();
    })().catch(function (e) { initP = null; throw e; });
    return initP;
  }
  function nice(e) {
    var m = (e && e.message) || String(e);
    if (/row-level security|permission denied/i.test(m)) return 'Tài khoản chưa có quyền. Kiểm tra đã chạy file supabase.sql chưa.';
    if (/relation .* does not exist|schema cache/i.test(m)) return 'Chưa tạo bảng dữ liệu. Hãy chạy file supabase.sql trong Supabase.';
    if (/Bucket not found/i.test(m)) return 'Chưa tạo kho ảnh. Hãy chạy file supabase.sql trong Supabase.';
    if (/Failed to fetch|NetworkError/i.test(m)) return 'Không kết nối được. Kiểm tra mạng.';
    return m;
  }
  // Chạy một truy vấn; nếu phiên đăng nhập hết hạn thì đăng nhập lại rồi chạy tiếp
  async function run(fn) {
    await init();
    var r = await fn();
    if (r && r.error && (r.error.status === 401 || /JWT|expired/i.test(r.error.message || ''))) {
      await sb.auth.signOut(); initP = null; await init(); r = await fn();
    }
    if (r && r.error) throw new Error(nice(r.error));
    return r.data;
  }
  function now() { return new Date().toISOString(); }
  function rid() { return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
  function toBlob(dataUrl) {
    var m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl || '');
    if (!m) throw new Error('Tệp không hợp lệ');
    var bin = atob(m[2]), arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: m[1] });
  }
  function fromBlob(blob) {
    return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = function () { rej(new Error('Không đọc được tệp')); }; r.readAsDataURL(blob); });
  }
  function norm(o) { o = JSON.parse(JSON.stringify(o)); o.anh = o.anh || []; o.bc = o.bc || []; o.tao_luc = String(o.tao_luc || ''); o.sua_luc = String(o.sua_luc || ''); return o; }
  var TEXT = ['so_van_ban', 'ngay_van_ban', 'ngay_nhan', 'trich_yeu', 'noi_dung', 'y_kien_chi_dao', 'can_bo', 'han', 'ket_qua', 'ghi_chu_ket_qua', 'loai', 'ky_sau'];
  var KQ = { chua: 1, dang: 1, xong: 1, huy: 1 };
  async function upd(id, patch) {
    var rows = await run(function () { return sb.from(T).update(patch).eq('id', id).select('id'); });
    if (!rows || !rows.length) throw new Error('Bạn không có quyền sửa văn bản này, hoặc văn bản không còn tồn tại.');
  }
  function getRow(id, cols) { return run(function () { return sb.from(T).select(cols).eq('id', id).maybeSingle(); }); }
  async function upload(id, name, blob, ext) {
    var path = id + '/' + rid() + '.' + ext;
    await run(function () { return sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, upsert: false }); });
    return path;
  }
  async function addTo(col, id, entry) {
    var row = await getRow(id, col);
    if (!row) throw new Error('Không tìm thấy văn bản');
    var list = (row[col] || []).concat([entry]), patch = { sua_luc: now() }; patch[col] = list;
    await upd(id, patch);
    return entry;
  }
  async function removeFrom(col, id, path) {
    var row = await getRow(id, col), patch = { sua_luc: now() };
    patch[col] = ((row && row[col]) || []).filter(function (a) { return a.id !== path; });
    await upd(id, patch);
    await run(function () { return sb.storage.from(BUCKET).remove([path]); });
    return true;
  }
  function cleanLoai(list) {
    var ok = { '': 1, tuan: 1, thang: 1, quy: 1, '6thang': 1, nam: 1 };
    if (!list || !list.length || list.length > 60) throw new Error('Danh sách loại không hợp lệ');
    var clean = list.map(function (x) {
      var name = String(x.name || '').trim().slice(0, 60), id = String(x.id || '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 30);
      if (!name || !id) throw new Error('Tên loại không hợp lệ');
      var ky = ok[x.ky || ''] ? (x.ky || '') : '', o = { id: id, name: name, ky: ky };
      var num = function (v, lo, hi, def) { v = parseInt(v, 10); return isNaN(v) ? def : Math.max(lo, Math.min(hi, v)); };
      if (ky) {
        o.ngay = num(x.ngay, 0, ky === 'tuan' ? 6 : 31, ky === 'tuan' ? 5 : 0);
        if (ky !== 'tuan' && ky !== 'thang') o.thang = num(x.thang, 1, { quy: 3, '6thang': 6, nam: 12 }[ky], 1);
        o.auto = !!x.auto; o.truoc = num(x.truoc, 0, 60, 7); o.can_bo = String(x.can_bo || '').trim().slice(0, 100);
      }
      return o;
    });
    if (!clean.some(function (x) { return x.id === 'vb'; })) throw new Error('Phải giữ loại "Văn bản thường"');
    return clean;
  }
  async function getCfg(key) {
    var row = await run(function () { return sb.from(C).select('value').eq('key', key).maybeSingle(); });
    var l = row && row.value; return (l && l.length) ? l : null;
  }
  function setCfg(key, value) { return run(function () { return sb.from(C).upsert({ key: key, value: value }); }).then(function () { return true; }); }

  var F = {
    getAll: async function () { var rows = await run(function () { return sb.from(T).select('*').is('da_xoa', null); }); return (rows || []).map(norm); },
    getTrash: async function () { var rows = await run(function () { return sb.from(T).select('*').not('da_xoa', 'is', null); }); return (rows || []).map(norm).sort(function (a, b) { return String(b.da_xoa) < String(a.da_xoa) ? -1 : 1; }); },
    getInfo: async function () {
      var row = await run(function () { return sb.from('nhanvien').select('ten,vai_tro').maybeSingle(); });
      var u = await sb.auth.getUser();
      return { sheetUrl: '', email: '', gio: 0, soNgay: 3, pass: true, note: '', role: (row && row.vai_tro) || '', ten: (row && row.ten) || '', account: (u.data && u.data.user && u.data.user.email) || '' };
    },
    saveDoc: async function (d) {
      var o = {};
      TEXT.forEach(function (k) { if (d[k] !== undefined) o[k] = String(d[k] == null ? '' : d[k]).trim(); });
      if ('ket_qua' in o && !KQ[o.ket_qua]) o.ket_qua = 'chua';
      if ('loai' in o && !o.loai) o.loai = 'vb';
      if (d.id) {
        if ('trich_yeu' in o && !o.trich_yeu) throw new Error('Nhập trích yếu của văn bản');
        o.sua_luc = now();
        await upd(d.id, o);
        return { id: d.id };
      }
      TEXT.forEach(function (k) { if (!(k in o)) o[k] = ''; });
      if (!o.ket_qua) o.ket_qua = 'chua';
      if (!o.loai) o.loai = 'vb';
      if (!o.trich_yeu) throw new Error('Nhập trích yếu của văn bản');
      o.id = rid();
      await run(function () { return sb.from(T).insert(o); });
      return { id: o.id };
    },
    setStatus: async function (id, k) {
      if (!KQ[k]) throw new Error('Kết quả không hợp lệ');
      await upd(id, { ket_qua: k, sua_luc: now() });
      return true;
    },
    pushInfo: async function () { return { publicKey: (window.SUPABASE_CONFIG || {}).vapidPublicKey || '' }; },
    pushSave: async function (sub) {
      if (!sub || !sub.endpoint || !sub.keys) throw new Error('Đăng ký thông báo không hợp lệ');
      var row = { endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, ua: String(navigator.userAgent || '').slice(0, 200) };
      await run(function () { return sb.from('dang_ky_push').upsert(row, { onConflict: 'endpoint' }); });
      return true;
    },
    pushRemove: async function (endpoint) {
      await run(function () { return sb.from('dang_ky_push').delete().eq('endpoint', endpoint); });
      return true;
    },
    pushTest: async function () {
      await init();
      var c = cfg(), ses = await sb.auth.getSession();
      if (!ses.data || !ses.data.session) throw new Error('Chưa đăng nhập');
      var res = await fetch(c.url + '/functions/v1/gui-nhac-viec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: c.anonKey, Authorization: 'Bearer ' + ses.data.session.access_token },
        body: JSON.stringify({ test: true })
      });
      var j = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(j.error || ('Lỗi ' + res.status));
      return j;
    },
    exportAll: async function (withFiles) {
      var rows = await run(function () { return sb.from(T).select('*'); });
      var cfgs = await run(function () { return sb.from(C).select('*'); });
      var out = { app: 'quan-ly-van-ban', version: 1, at: now(), vanban: (rows || []).map(norm), cauhinh: cfgs || [], files: {} };
      if (withFiles) {
        var paths = [];
        out.vanban.forEach(function (d) { d.anh.concat(d.bc).forEach(function (a) { if (paths.indexOf(a.id) < 0) paths.push(a.id); }); });
        for (var i = 0; i < paths.length; i++) {
          try { out.files[paths[i]] = await F.getPhoto(paths[i]); } catch (e) { }
        }
      }
      return out;
    },
    importAll: async function (obj) {
      if (!obj || obj.app !== 'quan-ly-van-ban' || !obj.vanban) throw new Error('Không phải file sao lưu của ứng dụng này');
      var cols = ['id', 'so_van_ban', 'ngay_van_ban', 'ngay_nhan', 'trich_yeu', 'noi_dung', 'y_kien_chi_dao', 'can_bo', 'han', 'ket_qua', 'ghi_chu_ket_qua', 'loai', 'ky_sau', 'anh', 'bc', 'da_xoa', 'tao_luc'];
      var rows = obj.vanban.map(function (d) { var o = {}; cols.forEach(function (k) { if (d[k] !== undefined) o[k] = d[k]; }); return o; });
      for (var i = 0; i < rows.length; i += 50) {
        var part = rows.slice(i, i + 50);
        await run(function () { return sb.from(T).upsert(part, { onConflict: 'id' }); });
      }
      var cf = (obj.cauhinh || []).filter(function (c) { return c && (c.key === 'loai' || c.key === 'canbo'); });
      if (cf.length) await run(function () { return sb.from(C).upsert(cf.map(function (c) { return { key: c.key, value: c.value }; })); });
      var n = 0, files = obj.files || {};
      for (var p in files) {
        var blob = toBlob(files[p]);
        await run(function () { return sb.storage.from(BUCKET).upload(p, blob, { contentType: blob.type, upsert: true }); });
        n++;
      }
      return { vanban: rows.length, files: n };
    },
    deleteDoc: async function (id) { await upd(id, { da_xoa: now() }); return true; },
    restoreDoc: async function (id) { await upd(id, { da_xoa: null }); return true; },
    purgeDoc: async function (id) {
      var row = await getRow(id, 'anh,bc');
      var paths = ((row && row.anh) || []).concat((row && row.bc) || []).map(function (a) { return a.id; });
      if (paths.length) await run(function () { return sb.storage.from(BUCKET).remove(paths); });
      var gone = await run(function () { return sb.from(T).delete().eq('id', id).select('id'); });
      if (!gone || !gone.length) throw new Error('Bạn không có quyền xóa văn bản này.');
      return true;
    },
    createAuto: async function (d) {
      if (!/^auto-[A-Za-z0-9_]+-\d{4}-\d{2}-\d{2}$/.test(String(d.newId || ''))) throw new Error('Mã tự tạo không hợp lệ');
      var o = { id: d.newId };
      TEXT.forEach(function (k) { o[k] = String(d[k] == null ? '' : d[k]).trim(); });
      o.ket_qua = 'chua'; o.ky_sau = ''; if (!o.loai) o.loai = 'vb';
      await run(function () { return sb.from(T).upsert(o, { onConflict: 'id', ignoreDuplicates: true }); });
      return { id: d.newId };
    },
    getLoai: function () { return getCfg('loai'); },
    saveLoai: async function (list) { return setCfg('loai', cleanLoai(list)); },
    getCanBo: function () { return getCfg('canbo'); },
    saveCanBo: async function (list) {
      if (!list || list.length > 300) throw new Error('Danh sách cán bộ không hợp lệ');
      var seen = {}, clean = [];
      list.forEach(function (n) { n = String(n || '').trim().slice(0, 60); if (n && !seen[n.toLowerCase()]) { seen[n.toLowerCase()] = 1; clean.push(n); } });
      return setCfg('canbo', clean);
    },
    addPhoto: async function (id, name, dataUrl) {
      var path = await upload(id, name, toBlob(dataUrl), 'jpg');
      return addTo('anh', id, { id: path, name: name });
    },
    removePhoto: function (id, path) { return removeFrom('anh', id, path); },
    addProof: async function (id, name, type, dataUrl) {
      var blob = toBlob(dataUrl), pdf = /pdf/i.test(blob.type);
      var path = await upload(id, name, blob, pdf ? 'pdf' : 'jpg');
      return addTo('bc', id, { id: path, name: pdf ? String(name || 'ket-qua.pdf') : String(name || 'ket-qua.jpg'), type: pdf ? 'application/pdf' : 'image/jpeg' });
    },
    removeProof: function (id, path) { return removeFrom('bc', id, path); },
    getPhoto: async function (path) {
      var blob = await run(function () { return sb.storage.from(BUCKET).download(path); });
      return fromBlob(blob);
    },
    htmlToPdf: async function (html, title) {
      var doc = '<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(title || 'Danh sách ký nhận') + '</title>' +
        '<style>@page{size:A4 landscape;margin:12mm}body{margin:12px;font-family:"Times New Roman",serif}.bar{margin-bottom:10px}@media print{.bar{display:none}}</style></head><body>' +
        '<div class="bar"><button style="font-size:16px;padding:10px 16px" onclick="window.print()">In danh sách</button></div>' + html + '</body></html>';
      window.OPEN_BLOB(new Blob([doc], { type: 'text/html;charset=utf-8' }));
      return { name: 'danh-sach-ky-nhan (đã mở ở tab mới)', url: '' };
    },
    guiThuNhacViec: async function () { throw new Error('Bản này chưa gửi email nhắc việc'); }
  };
  window.OPEN_BLOB = function (blob) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.target = '_blank'; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };
  window.SAVE_FILE = function (filename, data) {
    var ext = (/\.([A-Za-z0-9]+)$/.exec(filename) || [])[1], mime = { csv: 'text/csv;charset=utf-8', pdf: 'application/pdf', html: 'text/html;charset=utf-8' }[ext] || 'application/octet-stream';
    var blob = data instanceof Blob ? data : new Blob([data], { type: mime });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    return Promise.resolve({ status: 'saved' });
  };
  window.APP_LOGOUT = function () { return sb ? sb.auth.signOut() : Promise.resolve(); };
  window.APP_API = function (name, args) {
    return Promise.resolve().then(function () { return F[name].apply(null, args || []); }).then(
      function (data) { return { ok: true, data: data }; },
      function (e) { return { ok: false, error: nice(e) }; });
  };
})();
