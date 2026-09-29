/**
 * QUẢN LÝ VĂN BẢN (điện thoại) - Google Apps Script
 * Dữ liệu: Google Sheet (tab "VanBan"). Ảnh chụp: thư mục Google Drive "QuanLyVanBan - Anh".
 * Xem HUONG_DAN.txt để cài đặt (làm 1 lần, khoảng 10 phút).
 */

// ====== CẤU HÌNH: sửa trước khi chạy caiDat() ======
var CAU_HINH = {
  MA_TRUY_CAP: '',        // Mã truy cập vào ứng dụng (để trống = không hỏi). Nên đặt, ví dụ '2468'.
  EMAIL_NHAC: '',         // Email nhận thư nhắc việc mỗi sáng, nhiều email cách nhau dấu phẩy. Trống = email chủ tài khoản.
  SO_NGAY_NHAC: 3,        // Nhắc trước hạn bao nhiêu ngày
  GIO_GUI: 7              // Giờ gửi thư nhắc việc mỗi sáng (0-23)
};

var TEN_TAB = 'VanBan';
var COLS = ['id', 'so_van_ban', 'ngay_van_ban', 'ngay_nhan', 'trich_yeu', 'noi_dung', 'y_kien_chi_dao',
  'can_bo', 'han', 'ket_qua', 'ghi_chu_ket_qua', 'anh', 'tao_luc', 'sua_luc', 'loai', 'ky_sau'];
var TIEU_DE = ['ID', 'Số văn bản', 'Ngày văn bản', 'Ngày nhận', 'Trích yếu', 'Nội dung công việc', 'Ý kiến chỉ đạo',
  'Cán bộ thực hiện', 'Hạn', 'Kết quả', 'Ghi chú kết quả', 'Ảnh (mã file Drive)', 'Tạo lúc', 'Sửa lúc', 'Phân loại (mã)', 'Công việc kỳ sau (mã)'];
var KET_QUA = { chua: 'Chưa xong', dang: 'Đang thực hiện', xong: 'Đã xong', huy: 'Không thực hiện' };
var TU_KHOA_EDIT = ['so_van_ban', 'ngay_van_ban', 'ngay_nhan', 'trich_yeu', 'noi_dung', 'y_kien_chi_dao',
  'can_bo', 'han', 'ket_qua', 'ghi_chu_ket_qua', 'loai', 'ky_sau'];

// ====== Chạy 1 lần từ trình soạn thảo: tạo tab, thư mục ảnh, lịch nhắc việc ======
function caiDat() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Hãy mở Apps Script từ trong Google Sheet (Tiện ích mở rộng > Apps Script).');
  var props = PropertiesService.getScriptProperties();
  props.setProperty('SHEET_ID', ss.getId());
  var sh = ss.getSheetByName(TEN_TAB) || ss.insertSheet(TEN_TAB);
  sh.getRange(1, 1, 1, TIEU_DE.length).setValues([TIEU_DE]).setFontWeight('bold').setBackground('#e8eef5');
  sh.getRange(1, 1, sh.getMaxRows(), COLS.length).setNumberFormat('@');  // giữ nguyên chữ, không tự đổi thành ngày
  sh.setFrozenRows(1);
  sh.setColumnWidth(5, 320);
  if (!props.getProperty('THU_MUC_ANH')) {
    props.setProperty('THU_MUC_ANH', DriveApp.createFolder('QuanLyVanBan - Anh').getId());
  }
  if (!props.getProperty('THU_MUC_PDF')) {
    props.setProperty('THU_MUC_PDF', DriveApp.createFolder('QuanLyVanBan - PDF ky nhan').getId());
  }
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'guiNhacViec') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('guiNhacViec').timeBased().everyDays(1).atHour(CAU_HINH.GIO_GUI).create();
  Logger.log('Xong. Bước tiếp theo: Triển khai > Ứng dụng web.');
}

// ====== Trang web ======
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Quản lý văn bản')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ====== Cổng gọi duy nhất từ điện thoại ======
function api(name, args, pass) {
  try {
    if (CAU_HINH.MA_TRUY_CAP && String(pass || '') !== String(CAU_HINH.MA_TRUY_CAP)) {
      return { ok: false, code: 'PASS', error: 'Sai mã truy cập' };
    }
    var fn = API_[name];
    if (!fn) return { ok: false, error: 'Không có chức năng ' + name };
    return { ok: true, data: fn.apply(null, args || []) };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}

var API_ = {
  ping: function () { return true; },
  getAll: function () { return docHet_(); },
  getInfo: function () {
    return { sheetUrl: sheet_().getParent().getUrl(), email: emailNhan_(), gio: CAU_HINH.GIO_GUI, soNgay: CAU_HINH.SO_NGAY_NHAC, pass: !!CAU_HINH.MA_TRUY_CAP };
  },
  saveDoc: function (d) { return luu_(d); },
  getLoai: function () {
    var s = PropertiesService.getScriptProperties().getProperty('LOAI');
    try { var l = JSON.parse(s); return (l && l.length) ? l : null; } catch (e) { return null; }
  },
  saveLoai: function (list) {
    var ok = { '': 1, tuan: 1, thang: 1, quy: 1, '6thang': 1, nam: 1 };
    if (!list || !list.length || list.length > 60) throw new Error('Danh sách loại không hợp lệ');
    var clean = list.map(function (x) {
      var name = String(x.name || '').trim().slice(0, 60), id = String(x.id || '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 30);
      if (!name || !id) throw new Error('Tên loại không hợp lệ');
      return { id: id, name: name, ky: ok[x.ky || ''] ? (x.ky || '') : '' };
    });
    if (!clean.some(function (x) { return x.id === 'vb'; })) throw new Error('Phải giữ loại "Văn bản thường"');
    PropertiesService.getScriptProperties().setProperty('LOAI', JSON.stringify(clean));
    return true;
  },
  setStatus: function (id, kq) {
    if (!KET_QUA[kq]) throw new Error('Kết quả không hợp lệ');
    return voiKhoa_(function () {
      var sh = sheet_(), r = timDong_(sh, id);
      sh.getRange(r, COLS.indexOf('ket_qua') + 1).setValue(kq);
      sh.getRange(r, COLS.indexOf('sua_luc') + 1).setValue(bayGio_());
      return true;
    });
  },
  deleteDoc: function (id) {
    return voiKhoa_(function () {
      var sh = sheet_(), r = timDong_(sh, id);
      layAnh_(sh, r).forEach(function (a) { try { DriveApp.getFileById(a.id).setTrashed(true); } catch (e) { } });
      sh.deleteRow(r);
      return true;
    });
  },
  addPhoto: function (id, name, dataUrl) {
    var m = /^data:(image\/[a-z+.-]+);base64,(.+)$/i.exec(dataUrl || '');
    if (!m) throw new Error('Ảnh không hợp lệ');
    return voiKhoa_(function () {
      var sh = sheet_(), r = timDong_(sh, id);
      var blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], (name || 'anh') + '.jpg');
      var f = folder_('THU_MUC_ANH').createFile(blob);
      var list = layAnh_(sh, r);
      var a = { id: f.getId(), name: f.getName() };
      list.push(a);
      sh.getRange(r, COLS.indexOf('anh') + 1).setValue(JSON.stringify(list));
      return a;
    });
  },
  removePhoto: function (id, fileId) {
    return voiKhoa_(function () {
      var sh = sheet_(), r = timDong_(sh, id);
      var list = layAnh_(sh, r).filter(function (a) { return a.id !== fileId; });
      sh.getRange(r, COLS.indexOf('anh') + 1).setValue(JSON.stringify(list));
      try { DriveApp.getFileById(fileId).setTrashed(true); } catch (e) { }
      return true;
    });
  },
  getPhoto: function (fileId) {
    // Chỉ cho đọc ảnh thuộc một văn bản trong sheet
    var hit = sheet_().createTextFinder(fileId).matchEntireCell(false).findNext();
    if (!hit) throw new Error('Không tìm thấy ảnh');
    var b = DriveApp.getFileById(fileId).getBlob();
    return 'data:' + b.getContentType() + ';base64,' + Utilities.base64Encode(b.getBytes());
  },
  htmlToPdf: function (html, title) {
    var blob = HtmlService.createHtmlOutput(html).getBlob().getAs('application/pdf');
    var name = (title || 'Danh sach ky nhan') + ' ' + Utilities.formatDate(new Date(), tz_(), 'dd-MM-yyyy HHmm') + '.pdf';
    var f = folder_('THU_MUC_PDF').createFile(blob.setName(name));
    return { id: f.getId(), name: name, url: f.getUrl() };
  },
  guiThuNhacViec: function () { return guiNhacViec(true); }
};

// ====== Nhắc việc bằng email mỗi sáng (chạy theo lịch) ======
function guiNhacViec(thuCong) {
  var today = homNay_(), limit = congNgay_(today, CAU_HINH.SO_NGAY_NHAC);
  var ds = docHet_().filter(function (d) {
    return (d.ket_qua === 'chua' || d.ket_qua === 'dang') && d.han && d.han <= limit;
  }).sort(function (a, b) { return a.han < b.han ? -1 : 1; });
  if (!ds.length) return thuCong ? 'Hiện không có văn bản nào cần nhắc.' : 'none';
  var late = ds.filter(function (d) { return d.han < today; }).length;
  var rows = ds.map(function (d) {
    var qua = d.han < today, ht = d.han === today;
    return '<tr><td>' + esc_(d.so_van_ban) + '</td><td>' + esc_(d.trich_yeu) + '</td><td>' + esc_(d.can_bo) + '</td>' +
      '<td style="color:' + (qua || ht ? '#b42318' : '#b45309') + ';font-weight:bold">' + vn_(d.han) +
      (qua ? ' (quá hạn)' : (ht ? ' (hôm nay)' : '')) + '</td></tr>';
  }).join('');
  var html = '<p><b>' + ds.length + ' văn bản cần xử lý</b>' + (late ? ', trong đó ' + late + ' đã quá hạn' : '') + '.</p>' +
    '<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:14px">' +
    '<tr style="background:#e8eef5"><th>Số VB</th><th>Trích yếu</th><th>Cán bộ</th><th>Hạn</th></tr>' + rows + '</table>' +
    '<p><a href="' + sheet_().getParent().getUrl() + '">Mở Google Sheet</a></p>';
  MailApp.sendEmail({
    to: emailNhan_(),
    subject: 'Nhắc việc văn bản: ' + ds.length + ' việc' + (late ? ' (' + late + ' quá hạn)' : ''),
    htmlBody: html
  });
  return 'Đã gửi email tới ' + emailNhan_();
}

// ====== Hàm nội bộ ======
function tz_() { return Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh'; }
function bayGio_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm:ss'); }
function homNay_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd'); }
function congNgay_(iso, n) {
  var p = iso.split('-'), d = new Date(+p[0], +p[1] - 1, +p[2] + n);
  return Utilities.formatDate(d, tz_(), 'yyyy-MM-dd');
}
function vn_(s) { return s ? s.split('-').reverse().join('/') : ''; }
function esc_(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function emailNhan_() { return CAU_HINH.EMAIL_NHAC || Session.getEffectiveUser().getEmail(); }

function sheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('Chưa chạy hàm caiDat()');
  return SpreadsheetApp.openById(id).getSheetByName(TEN_TAB);
}
function folder_(key) {
  return DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty(key));
}
function voiKhoa_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}
function chuoiNgay_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
  var s = String(v == null ? '' : v).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}
function docHet_() {
  var sh = sheet_(), n = sh.getLastRow();
  if (n < 2) return [];
  var vals = sh.getRange(2, 1, n - 1, COLS.length).getValues();
  return vals.filter(function (r) { return r[0] !== ''; }).map(function (r) {
    var o = {};
    COLS.forEach(function (c, i) { o[c] = r[i]; });
    ['ngay_van_ban', 'ngay_nhan', 'han'].forEach(function (k) { o[k] = chuoiNgay_(o[k]); });
    ['id', 'so_van_ban', 'trich_yeu', 'noi_dung', 'y_kien_chi_dao', 'can_bo', 'ghi_chu_ket_qua', 'ket_qua'].forEach(function (k) { o[k] = String(o[k] == null ? '' : o[k]); });
    if (!KET_QUA[o.ket_qua]) o.ket_qua = 'chua';
    try { o.anh = JSON.parse(o.anh || '[]'); } catch (e) { o.anh = []; }
    o.tao_luc = String(o.tao_luc); o.sua_luc = String(o.sua_luc);
    o.loai = String(o.loai || 'vb'); o.ky_sau = String(o.ky_sau || '');
    return o;
  });
}
function timDong_(sh, id) {
  var hit = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).createTextFinder(String(id)).matchEntireCell(true).findNext();
  if (!hit) throw new Error('Không tìm thấy văn bản');
  return hit.getRow();
}
function layAnh_(sh, r) {
  try { return JSON.parse(sh.getRange(r, COLS.indexOf('anh') + 1).getValue() || '[]'); } catch (e) { return []; }
}
function luu_(d) {
  return voiKhoa_(function () {
    var sh = sheet_(), row = {}, t = bayGio_();
    TU_KHOA_EDIT.forEach(function (k) { if (d[k] !== undefined) row[k] = String(d[k] == null ? '' : d[k]).trim(); });
    ['ngay_van_ban', 'ngay_nhan', 'han'].forEach(function (k) { if (k in row) row[k] = chuoiNgay_(row[k]); });
    if ('ket_qua' in row && !KET_QUA[row.ket_qua]) row.ket_qua = 'chua';
    if ('loai' in row && !row.loai) row.loai = 'vb';
    if (d.id) {
      if ('so_van_ban' in row && 'trich_yeu' in row && !row.trich_yeu && !row.so_van_ban) throw new Error('Nhập ít nhất số văn bản hoặc trích yếu');
      var r = timDong_(sh, d.id);
      Object.keys(row).forEach(function (k) { sh.getRange(r, COLS.indexOf(k) + 1).setValue(row[k]); });
      sh.getRange(r, COLS.indexOf('sua_luc') + 1).setValue(t);
      return { id: String(d.id) };
    }
    TU_KHOA_EDIT.forEach(function (k) { if (!(k in row)) row[k] = ''; });
    if (!row.ket_qua) row.ket_qua = 'chua';
    if (!row.loai) row.loai = 'vb';
    if (!row.trich_yeu && !row.so_van_ban) throw new Error('Nhập ít nhất số văn bản hoặc trích yếu');
    var id = 'v' + new Date().getTime();
    var vals = COLS.map(function (c) {
      if (c === 'id') return id;
      if (c === 'anh') return '[]';
      if (c === 'tao_luc' || c === 'sua_luc') return t;
      return row[c];
    });
    var r2 = sh.getLastRow() + 1;
    sh.getRange(r2, 1, 1, COLS.length).setNumberFormat('@').setValues([vals]);
    return { id: id };
  });
}
