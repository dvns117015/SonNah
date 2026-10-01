/* Kho dữ liệu cho bản chạy trong Claude: dùng năng lực `db` (dữ liệu dùng chung, cập nhật trực tiếp)
   và `downloads` (lưu file). Ảnh chụp lưu dạng ảnh JPEG nén trong tài liệu photos/<id>. */
(function () {
  var NOTE_RO = 'Bạn đang ở chế độ chỉ xem. Nhờ chủ trang cấp quyền "Cộng tác viên" để thêm và sửa văn bản.';
  var dbP = window.claude && window.claude.use ? window.claude.use('db') : Promise.resolve(null);
  var dlP = window.claude && window.claude.use ? window.claude.use('downloads') : Promise.resolve(null);
  var userP = window.claude && window.claude.use ? window.claude.use('user') : Promise.resolve(null);
  var docs = [], readOnly = false, DB = null, firstSnap, snapErr = null;
  window.PHOTO_MAX_CHARS = 235000;  // mỗi tài liệu tối đa 256 KiB
  window.PROOF_MAX_BYTES = 2 * 1024 * 1024;  // file PDF kết quả được cắt thành nhiều tài liệu nhỏ
  var CHUNK = 200000;

  function nice(e) {
    var c = e && e.code;
    if (c === 'invalid_argument') return 'Bạn chưa có quyền ghi dữ liệu. Nhờ chủ trang cấp quyền "Cộng tác viên".';
    if (c === 'quota_exceeded') return 'Kho dữ liệu đã đầy. Hãy xóa bớt văn bản cũ.';
    if (c === 'resource_exhausted') return 'Thao tác quá nhanh, thử lại sau vài giây.';
    return (e && e.message) || 'Lỗi không rõ';
  }
  var ready = new Promise(function (resolve) { firstSnap = resolve; });
  dbP.then(function (db) {
    DB = db;
    if (!db) { snapErr = 'Không kết nối được kho dữ liệu. Hãy mở trang này trong ứng dụng Claude và đăng nhập.'; firstSnap(); return; }
    db.collection('docs').onSnapshot(function (snap) {
      // data() trả về đối tượng đóng băng: phải sao chép trước khi thêm id, nếu không id bị mất
      docs = snap.docs.map(function (d) { var o = JSON.parse(JSON.stringify(d.data() || {})); o.id = d.id; if (!o.anh) o.anh = []; if (!o.bc) o.bc = []; return o; });
      firstSnap();
      if (window.__reload && !snap.metadata.hasPendingWrites) window.__reload();
    }, function (e) { snapErr = nice(e); firstSnap(); });
  });
  userP.then(function (u) { if (u) u.can('data.write').then(function (v) { if (v === false) readOnly = true; }); });

  function need() { if (!DB) throw new Error(snapErr || 'Không kết nối được kho dữ liệu'); return DB; }
  function delParts(db, a) {
    var out = [], n = a.n || 1;
    for (var k = 0; k < n; k++) out.push(db.doc('photos/' + (k === 0 ? a.id : a.id + '-' + k)).delete().catch(function () { }));
    return out;
  }
  var TEXT = ['so_van_ban', 'ngay_van_ban', 'ngay_nhan', 'trich_yeu', 'noi_dung', 'y_kien_chi_dao', 'can_bo', 'han', 'ket_qua', 'ghi_chu_ket_qua', 'loai', 'ky_sau'];
  var KQ = { chua: 1, dang: 1, xong: 1, huy: 1 };
  function now() { return new Date().toISOString(); }

  var F = {
    getAll: function () { if (snapErr && !DB) throw new Error(snapErr); return JSON.parse(JSON.stringify(docs)); },
    getInfo: function () { return { sheetUrl: '', email: '', gio: 0, soNgay: 3, pass: false, note: readOnly ? NOTE_RO : (snapErr || '') }; },
    saveDoc: function (d) {
      var db = need(), o = {};
      TEXT.forEach(function (k) { if (d[k] !== undefined) o[k] = String(d[k] == null ? '' : d[k]).trim(); });
      if ('ket_qua' in o && !KQ[o.ket_qua]) o.ket_qua = 'chua';
      if ('loai' in o && !o.loai) o.loai = 'vb';
      if (d.id) {
        if ('so_van_ban' in o && 'trich_yeu' in o && !o.so_van_ban && !o.trich_yeu) throw new Error('Nhập ít nhất số văn bản hoặc trích yếu');
        o.sua_luc = now();
        return db.doc('docs/' + d.id).update(o).then(function () { return { id: d.id }; });
      }
      TEXT.forEach(function (k) { if (!(k in o)) o[k] = ''; });
      if (!o.ket_qua) o.ket_qua = 'chua';
      if (!o.loai) o.loai = 'vb';
      if (!o.trich_yeu && !o.so_van_ban) throw new Error('Nhập ít nhất số văn bản hoặc trích yếu');
      o.sua_luc = now(); o.anh = []; o.bc = []; o.tao_luc = o.sua_luc;
      var ref = db.collection('docs').doc();
      return ref.set(o).then(function () { return { id: ref.id }; });
    },
    createAuto: function (d) {
      if (!/^auto-[A-Za-z0-9_]+-\d{4}-\d{2}-\d{2}$/.test(String(d.newId || ''))) throw new Error('Mã tự tạo không hợp lệ');
      var ref = need().doc('docs/' + d.newId);
      return ref.get().then(function (s) {
        if (s.exists) return { id: d.newId, created: false };
        var o = {};
        TEXT.forEach(function (k) { o[k] = String(d[k] == null ? '' : d[k]).trim(); });
        o.ket_qua = 'chua'; o.ky_sau = ''; if (!o.loai) o.loai = 'vb';
        o.sua_luc = now(); o.tao_luc = o.sua_luc; o.anh = []; o.bc = [];
        return ref.set(o).then(function () { return { id: d.newId, created: true }; });
      });
    },
    getLoai: function () {
      return need().doc('config/loai').get().then(function (s) { var l = s.exists && s.data().list; return (l && l.length) ? JSON.parse(JSON.stringify(l)) : null; });
    },
    getCoQuan: function () {
      return need().doc('config/coquan').get().then(function (s) { return (s.exists && s.data().name) || ''; });
    },
    saveCoQuan: function (name) { return need().doc('config/coquan').set({ name: String(name || '').trim().slice(0, 120) }).then(function () { return true; }); },
    getCanBo: function () {
      return need().doc('config/canbo').get().then(function (s) { var l = s.exists && s.data().list; return (l && l.length) ? JSON.parse(JSON.stringify(l)) : null; });
    },
    saveCanBo: function (list) {
      if (!list || list.length > 300) throw new Error('Danh sách cán bộ không hợp lệ');
      var seen = {}, clean = [];
      list.forEach(function (n) {
        n = String(n || '').trim().slice(0, 60);
        if (n && !seen[n.toLowerCase()]) { seen[n.toLowerCase()] = 1; clean.push(n); }
      });
      return need().doc('config/canbo').set({ list: clean }).then(function () { return true; });
    },
    saveLoai: function (list) {
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
      return need().doc('config/loai').set({ list: clean }).then(function () { return true; });
    },
    setStatus: function (id, k) { if (!KQ[k]) throw new Error('Kết quả không hợp lệ'); return need().doc('docs/' + id).update({ ket_qua: k, sua_luc: now() }).then(function () { return true; }); },
    deleteDoc: function (id) {
      var db = need(), cur = docs.filter(function (d) { return d.id === id; })[0];
      var ps = [];
      (cur ? cur.anh : []).forEach(function (a) { ps.push(db.doc('photos/' + a.id).delete().catch(function () { })); });
      (cur ? cur.bc : []).forEach(function (a) { ps = ps.concat(delParts(db, a)); });
      return Promise.all(ps).then(function () { return db.doc('docs/' + id).delete(); }).then(function () { return true; });
    },
    addPhoto: function (id, name, dataUrl) {
      var db = need(), ref = db.collection('photos').doc(), dref = db.doc('docs/' + id);
      return ref.set({ docId: id, name: name, data: dataUrl, at: now() }).then(function () { return dref.get(); }).then(function (s) {
        if (!s.exists) throw new Error('Không tìm thấy văn bản');
        var anh = (s.data().anh || []).concat([{ id: ref.id, name: name }]);
        return dref.update({ anh: anh, sua_luc: now() }).then(function () { return { id: ref.id, name: name }; });
      });
    },
    addProof: function (id, name, type, dataUrl) {
      var db = need(), dref = db.doc('docs/' + id), fid = db.collection('photos').doc().id;
      var parts = [], i;
      for (i = 0; i < dataUrl.length; i += CHUNK) parts.push(dataUrl.slice(i, i + CHUNK));
      var entry = { id: fid, name: name, type: type, n: parts.length };
      var writes = parts.map(function (part, k) {
        return db.doc('photos/' + (k === 0 ? fid : fid + '-' + k)).set(k === 0 ? { docId: id, name: name, type: type, n: parts.length, data: part, at: now() } : { docId: id, data: part });
      });
      return Promise.all(writes).then(function () { return dref.get(); }).then(function (s) {
        if (!s.exists) throw new Error('Không tìm thấy văn bản');
        return dref.update({ bc: (s.data().bc || []).concat([entry]), sua_luc: now() });
      }).then(function () { return { id: fid, name: name, type: type, n: parts.length }; });
    },
    removeProof: function (id, fid) {
      var db = need(), dref = db.doc('docs/' + id), entry = null;
      return dref.get().then(function (s) {
        var bc = (s.exists && s.data().bc) || [];
        entry = bc.filter(function (a) { return a.id === fid; })[0];
        return dref.update({ bc: bc.filter(function (a) { return a.id !== fid; }), sua_luc: now() });
      }).then(function () { return Promise.all(delParts(db, entry || { id: fid, n: 1 })); }).then(function () { return true; });
    },
    removePhoto: function (id, fid) {
      var db = need(), dref = db.doc('docs/' + id);
      return dref.get().then(function (s) {
        var anh = ((s.exists && s.data().anh) || []).filter(function (a) { return a.id !== fid; });
        return dref.update({ anh: anh, sua_luc: now() });
      }).then(function () { return db.doc('photos/' + fid).delete(); }).then(function () { return true; });
    },
    getPhoto: function (fid) {
      var db = need();
      return db.doc('photos/' + fid).get().then(function (s) {
        if (!s.exists) throw new Error('Không tìm thấy ảnh');
        var d = s.data(), n = d.n || 1, out = d.data, reads = [];
        for (var k = 1; k < n; k++) reads.push(db.doc('photos/' + fid + '-' + k).get());
        return Promise.all(reads).then(function (ps) { ps.forEach(function (p) { out += p.exists ? p.data().data : ''; }); return out; });
      });
    },
    htmlToPdf: function (html, title) {
      var doc = '<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + String(title || 'Danh sách ký nhận').replace(/[<>&]/g, '') + '</title>' +
        '<style>@page{size:A4 landscape;margin:12mm}body{margin:12px;font-family:"Times New Roman",serif}.bar{margin-bottom:10px}@media print{.bar{display:none}}</style></head><body>' +
        '<div class="bar"><button style="font-size:16px;padding:10px 16px" onclick="window.print()">In danh sách</button></div>' + html + '</body></html>';
      return window.SAVE_FILE('danh-sach-ky-nhan.html', doc).then(function () { return { name: 'danh-sach-ky-nhan.html', url: '' }; });
    }
  };
  window.SAVE_FILE = function (filename, data) {
    return dlP.then(function (dl) { if (!dl) throw new Error('Trình duyệt này không cho lưu file'); return dl.save({ filename: filename, data: data }); });
  };
  window.APP_API = function (name, args) {
    return ready.then(function () { return F[name].apply(null, args); }).then(
      function (data) { return { ok: true, data: data }; },
      function (e) { return { ok: false, error: nice(e) }; });
  };
})();
