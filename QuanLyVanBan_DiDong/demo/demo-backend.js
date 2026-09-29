/* Giả lập máy chủ Google Apps Script để xem thử giao diện. Dữ liệu lưu trong localStorage của trình duyệt. */
(function () {
  var KEY = 'qlvb-mobile-demo-v1', db = null, photos = {};
  function iso(off) { var d = new Date(); d.setDate(d.getDate() + off); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function sample(title, n) {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#fff"/><rect x="0" y="0" width="600" height="800" fill="none" stroke="#ccc"/>' +
      '<text x="300" y="70" font-size="20" text-anchor="middle" font-family="serif" font-weight="bold">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</text><text x="300" y="98" font-size="16" text-anchor="middle" font-family="serif">Độc lập - Tự do - Hạnh phúc</text>' +
      '<text x="300" y="180" font-size="22" text-anchor="middle" font-family="serif" font-weight="bold">' + title + '</text>' +
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(function (i) { return '<rect x="70" y="' + (240 + i * 34) + '" width="' + (460 - (i % 4) * 40) + '" height="9" fill="#bbb"/>'; }).join('') +
      '<text x="300" y="770" font-size="14" text-anchor="middle" fill="#888" font-family="sans-serif">Ảnh mẫu - trang ' + n + '</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  function seed() {
    photos['s1'] = sample('CÔNG VĂN 125/UBND-VP', 1); photos['s2'] = sample('CÔNG VĂN 125/UBND-VP', 2); photos['s3'] = sample('KẾ HOẠCH 48/KH-SNV', 1);
    function D(id, o) { o.id = id; o.tao_luc = '2026-01-01 08:00:00'; o.sua_luc = o.tao_luc; o.anh = o.anh || []; return o; }
    return [
      D('v1', { so_van_ban: '125/UBND-VP', ngay_van_ban: iso(-12), ngay_nhan: iso(-10), trich_yeu: 'V/v báo cáo kết quả thực hiện nhiệm vụ quý III', noi_dung: 'Tổng hợp số liệu 3 phòng, gửi trước hạn', y_kien_chi_dao: 'Đ/c Hùng: giao Văn phòng chủ trì, báo cáo trước ngày hạn.', can_bo: 'Nguyễn Văn An', han: iso(-2), ket_qua: 'dang', ghi_chu_ket_qua: 'Đã có số liệu 2/3 phòng', anh: [{ id: 's1', name: 'a' }, { id: 's2', name: 'b' }] }),
      D('v2', { so_van_ban: '48/KH-SNV', ngay_van_ban: iso(-6), ngay_nhan: iso(-5), trich_yeu: 'Kế hoạch tổ chức tập huấn công tác văn thư, lưu trữ', noi_dung: 'Chuẩn bị danh sách đại biểu và hội trường', y_kien_chi_dao: 'Giao Phòng Hành chính phối hợp, báo cáo lãnh đạo trước 1 tuần.', can_bo: 'Trần Thị Bình', han: iso(0), ket_qua: 'chua', ghi_chu_ket_qua: '', anh: [{ id: 's3', name: 'c' }] }),
      D('v3', { so_van_ban: '210/CV-STC', ngay_van_ban: iso(-4), ngay_nhan: iso(-3), trich_yeu: 'Đề nghị cung cấp số liệu dự toán ngân sách năm sau', noi_dung: '', y_kien_chi_dao: 'Kế toán tổng hợp, gửi Sở Tài chính đúng hạn.', can_bo: 'Lê Minh Cường, Trần Thị Bình', han: iso(2), ket_qua: 'chua', ghi_chu_ket_qua: '' }),
      D('v4', { so_van_ban: '07/TB-VP', ngay_van_ban: iso(-3), ngay_nhan: iso(-3), trich_yeu: 'Thông báo lịch họp giao ban tháng', noi_dung: 'Chuẩn bị nội dung báo cáo phòng mình', y_kien_chi_dao: 'Các phòng cử người dự họp.', can_bo: 'Nguyễn Văn An', han: iso(9), ket_qua: 'chua', ghi_chu_ket_qua: '' }),
      D('v6', { loai: 'bctuan', so_van_ban: '', ngay_van_ban: '', ngay_nhan: iso(-4), trich_yeu: 'Báo cáo công tác tuần gửi lãnh đạo', noi_dung: 'Tổng hợp kết quả tuần của 3 phòng', y_kien_chi_dao: 'Gửi trước 16h thứ Sáu.', can_bo: 'Trần Thị Bình', han: iso(1), ket_qua: 'chua', ghi_chu_ket_qua: '' }),
      D('v7', { loai: 'bcquy', so_van_ban: '', ngay_van_ban: '', ngay_nhan: iso(-15), trich_yeu: 'Báo cáo kết quả thực hiện nhiệm vụ quý III/2026', noi_dung: 'Thu thập số liệu, viết báo cáo', y_kien_chi_dao: 'Văn phòng tổng hợp, trình duyệt trước khi gửi Sở.', can_bo: 'Nguyễn Văn An', han: iso(6), ket_qua: 'dang', ghi_chu_ket_qua: 'Đã có dàn ý' }),
      D('v5', { so_van_ban: '33/QĐ-UBND', ngay_van_ban: iso(-20), ngay_nhan: iso(-18), trich_yeu: 'Quyết định kiện toàn Ban chỉ đạo chuyển đổi số', noi_dung: 'Phổ biến trong cơ quan', y_kien_chi_dao: 'Lưu hồ sơ, phổ biến đến toàn thể cán bộ.', can_bo: 'Lê Minh Cường', han: iso(-10), ket_qua: 'xong', ghi_chu_ket_qua: 'Đã phổ biến ngày họp giao ban' })
    ];
  }
  try { var s = localStorage.getItem(KEY); if (s) { db = JSON.parse(s); photos['s1'] = sample('CÔNG VĂN 125/UBND-VP', 1); photos['s2'] = sample('CÔNG VĂN 125/UBND-VP', 2); photos['s3'] = sample('KẾ HOẠCH 48/KH-SNV', 1); } } catch (e) { }
  if (!db) db = seed();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { } }
  function find(id) { for (var i = 0; i < db.length; i++) if (db[i].id === id) return db[i]; throw new Error('Không tìm thấy văn bản'); }
  var F = {
    ping: function () { return true; },
    getAll: function () { return JSON.parse(JSON.stringify(db)); },
    getInfo: function () { return { sheetUrl: '', email: 'ban@example.com', gio: 7, soNgay: 3 }; },
    createAuto: function (d) {
      if (db.some(function (x) { return x.id === d.newId; })) return { id: d.newId, created: false };
      var o = { id: d.newId, anh: [], tao_luc: new Date().toISOString(), sua_luc: new Date().toISOString(), ky_sau: '', ket_qua: 'chua' };
      ['so_van_ban', 'ngay_van_ban', 'ngay_nhan', 'trich_yeu', 'noi_dung', 'y_kien_chi_dao', 'can_bo', 'han', 'ghi_chu_ket_qua', 'loai'].forEach(function (k) { o[k] = String(d[k] || ''); });
      db.push(o); save(); return { id: o.id, created: true };
    },
    getLoai: function () { try { var l = JSON.parse(localStorage.getItem(KEY + '-loai')); if (l && l.length) return l; } catch (e) { } return [{ id: 'vb', name: 'Văn bản thường', ky: '' }, { id: 'bctuan', name: 'Báo cáo tuần', ky: 'tuan', ngay: 5, auto: true, truoc: 10, can_bo: 'Trần Thị Bình' }, { id: 'bcthang', name: 'Báo cáo tháng', ky: 'thang', ngay: 0 }, { id: 'bcquy', name: 'Báo cáo quý', ky: 'quy', thang: 3, ngay: 20 }, { id: 'bc6thang', name: 'Báo cáo 6 tháng', ky: '6thang', thang: 6, ngay: 0 }, { id: 'bcnam', name: 'Báo cáo năm', ky: 'nam', thang: 12, ngay: 0 }]; },
    saveLoai: function (list) { try { localStorage.setItem(KEY + '-loai', JSON.stringify(list)); } catch (e) { } return true; },
    saveDoc: function (d) {
      if (!d.id && !String(d.trich_yeu || '').trim() && !String(d.so_van_ban || '').trim()) throw new Error('Nhập ít nhất số văn bản hoặc trích yếu');
      var o;
      if (d.id) o = find(d.id); else { o = { id: 'v' + Date.now(), anh: [], tao_luc: new Date().toISOString(), loai: 'vb', ket_qua: 'chua' }; db.push(o); }
      ['so_van_ban', 'ngay_van_ban', 'ngay_nhan', 'trich_yeu', 'noi_dung', 'y_kien_chi_dao', 'can_bo', 'han', 'ket_qua', 'ghi_chu_ket_qua', 'loai', 'ky_sau'].forEach(function (k) { if (d[k] !== undefined) o[k] = String(d[k]).trim(); });
      o.sua_luc = new Date().toISOString(); save(); return { id: o.id };
    },
    setStatus: function (id, k) { find(id).ket_qua = k; save(); return true; },
    deleteDoc: function (id) { var o = find(id); db.splice(db.indexOf(o), 1); save(); return true; },
    addPhoto: function (id, name, url) { var o = find(id), a = { id: 'p' + Date.now() + Math.random().toString(36).slice(2, 6), name: name }; photos[a.id] = url; o.anh.push(a); save(); return a; },
    removePhoto: function (id, fid) { var o = find(id); o.anh = o.anh.filter(function (a) { return a.id !== fid; }); delete photos[fid]; save(); return true; },
    getPhoto: function (fid) { return photos[fid] || sample('ẢNH MẪU (đã hết phiên xem thử)', 1); },
    htmlToPdf: function () { throw new Error('Bản xem thử không tạo được file PDF. Bản thật tạo PDF trong Google Drive.'); },
    guiThuNhacViec: function () { return 'Bản thật sẽ gửi email nhắc việc. Bản xem thử không gửi email.'; }
  };
  window.DEMO_API = function (name, args) {
    return new Promise(function (resolve) {
      setTimeout(function () {
        try { resolve({ ok: true, data: F[name].apply(null, args) }); } catch (e) { resolve({ ok: false, error: e.message }); }
      }, 120);
    });
  };
})();
