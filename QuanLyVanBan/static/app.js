(function () {
  'use strict';
  var FIELDS = ['so_van_ban', 'ngay_van_ban', 'ngay_nhan', 'trich_yeu', 'noi_dung', 'y_kien_chi_dao', 'can_bo', 'han', 'ket_qua', 'ghi_chu_ket_qua'];
  var STATUS = { chua: 'Chưa xong', dang: 'Đang thực hiện', xong: 'Đã xong', huy: 'Không thực hiện' };
  var rows = [], editId = null, dismissedKey = '', lastDay = '';

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function vn(d) { return d ? d.split('-').reverse().join('/') : ''; }
  function todayStr() {
    var t = new Date();
    return t.getFullYear() + '-' + ('0' + (t.getMonth() + 1)).slice(-2) + '-' + ('0' + t.getDate()).slice(-2);
  }
  function daysLeft(han) {
    var p = han.split('-'), t = new Date(), a = new Date(+p[0], +p[1] - 1, +p[2]);
    var b = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    return Math.round((a - b) / 86400000);
  }
  function isOpen(r) { return r.ket_qua === 'chua' || r.ket_qua === 'dang'; }

  function ajax(method, url, body, cb, raw, headers) {
    var x = new XMLHttpRequest();
    x.open(method, url, true);
    if (body && !raw) x.setRequestHeader('Content-Type', 'application/json');
    for (var h in (headers || {})) x.setRequestHeader(h, headers[h]);
    x.onreadystatechange = function () {
      if (x.readyState !== 4) return;
      var res = null;
      try { res = JSON.parse(x.responseText); } catch (e) { }
      if (x.status >= 200 && x.status < 300) cb(null, res);
      else cb((res && res.error) || ('Lỗi ' + x.status), res);
    };
    x.send(raw ? body : (body ? JSON.stringify(body) : null));
  }

  function filterQS() {
    var m = { q: 'fQ', ket_qua: 'fKq', can_bo: 'fCb', han_tu: 'fHanTu', han_den: 'fHanDen', nhan_tu: 'fNhanTu', nhan_den: 'fNhanDen' };
    var out = [];
    for (var k in m) { var v = $(m[k]).value; if (v) out.push(k + '=' + encodeURIComponent(v)); }
    return out.join('&');
  }

  // ---------- Danh sach ----------
  function load() {
    ajax('GET', '/api/vanban?' + filterQS(), null, function (e, d) {
      if (e) { alert(e); return; }
      rows = d; render();
    });
    loadStats(); loadReminder(); loadCanBo();
  }

  function render() {
    var h = '';
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i], open = isOpen(r), hanCls = '', tag = '';
      if (r.han && open) {
        var dl = daysLeft(r.han);
        if (dl < 0) { hanCls = 'late'; tag = 'Quá hạn ' + (-dl) + ' ngày'; }
        else if (dl === 0) { hanCls = 'late'; tag = 'Hết hạn hôm nay'; }
        else if (dl <= remDays()) { hanCls = 'soon'; tag = 'Còn ' + dl + ' ngày'; }
      }
      h += '<tr class="' + (open ? '' : 'done') + '">' +
        '<td><input type="checkbox" class="chk" value="' + r.id + '"></td>' +
        '<td>' + (i + 1) + '</td>' +
        '<td><b>' + esc(r.so_van_ban) + '</b><div class="small">VB: ' + vn(r.ngay_van_ban) + '<br>Nhận: ' + vn(r.ngay_nhan) + '</div></td>' +
        '<td><div class="trich">' + esc(r.trich_yeu) + '</div>' + (r.noi_dung ? '<div class="nd">' + esc(r.noi_dung) + '</div>' : '') +
        (r.ghi_chu_ket_qua ? '<div class="small">KQ: ' + esc(r.ghi_chu_ket_qua) + '</div>' : '') + '</td>' +
        '<td class="pre">' + esc(r.y_kien_chi_dao) + '</td>' +
        '<td>' + esc(r.can_bo) + '</td>' +
        '<td><span class="han ' + hanCls + '">' + vn(r.han) + '</span><span class="tag ' + hanCls + '">' + tag + '</span></td>' +
        '<td><select class="kq ' + r.ket_qua + '" data-id="' + r.id + '">' + statusOptions(r.ket_qua) + '</select></td>' +
        '<td>' + (r.has_file ? '<a href="/files/' + r.id + '" target="_blank" title="' + esc(r.file_name) + '">📄 PDF</a> ' : '') +
        '<div style="margin-top:3px"><button class="btn sm ed" data-id="' + r.id + '">Sửa</button> ' +
        '<button class="btn sm danger del" data-id="' + r.id + '">Xóa</button></div></td></tr>';
    }
    $('tbody').innerHTML = h || '<tr><td colspan="9" class="empty">Chưa có văn bản nào.</td></tr>';
    $('count').textContent = rows.length + ' văn bản';
    $('chkAll').checked = false;
  }
  function statusOptions(cur) {
    var s = '';
    for (var k in STATUS) s += '<option value="' + k + '"' + (k === cur ? ' selected' : '') + '>' + STATUS[k] + '</option>';
    return s;
  }

  function loadStats() {
    ajax('GET', '/api/thongke', null, function (e, s) {
      if (e) return;
      $('stats').innerHTML =
        '<div class="stat" data-k="">Tổng văn bản<b>' + s.tong + '</b></div>' +
        '<div class="stat orange" data-k="chuaxong">Chưa hoàn thành<b>' + s.chuaxong + '</b></div>' +
        '<div class="stat red" data-k="quahan">Quá hạn<b>' + s.quahan + '</b></div>' +
        '<div class="stat green" data-k="xong">Đã xong<b>' + s.xong + '</b></div>';
    });
  }
  function loadCanBo() {
    ajax('GET', '/api/canbo', null, function (e, l) {
      if (e) return;
      var h = ''; for (var i = 0; i < l.length; i++) h += '<option value="' + esc(l[i]) + '">';
      $('dlCb').innerHTML = h;
    });
  }

  // ---------- Nhac viec ----------
  function remDays() { var n = parseInt($('remDays').value, 10); return isNaN(n) ? 3 : n; }
  var lastNotified = '';
  function loadReminder() {
    ajax('GET', '/api/nhacviec?days=' + remDays(), null, function (e, l) {
      if (e) return;
      var box = $('reminder');
      var key = l.map(function (r) { return r.id + ':' + r.han; }).join('|') + '@' + todayStr();
      document.title = (l.length ? '(' + l.length + ') ' : '') + 'Quản lý văn bản';
      if (!l.length || key === dismissedKey) { box.style.display = 'none'; return; }
      var late = l.filter(function (r) { return r.con_lai < 0; }).length;
      var h = '<button class="close" title="Ẩn" id="remClose">×</button><h3>🔔 Nhắc việc: ' + l.length + ' văn bản cần xử lý' +
        (late ? ' (' + late + ' quá hạn)' : '') + '</h3><ul>';
      for (var i = 0; i < l.length; i++) {
        var r = l[i], w = r.con_lai < 0 ? '<span class="late">quá hạn ' + (-r.con_lai) + ' ngày</span>' :
          (r.con_lai === 0 ? '<span class="late">hết hạn HÔM NAY</span>' : 'còn ' + r.con_lai + ' ngày');
        h += '<li><b>' + esc(r.so_van_ban) + '</b> – ' + esc(r.trich_yeu) + ' | ' + esc(r.can_bo || 'chưa giao') + ' | hạn ' + vn(r.han) + ' (' + w + ')</li>';
      }
      box.innerHTML = h + '</ul>'; box.style.display = 'block';
      $('remClose').onclick = function () { dismissedKey = key; box.style.display = 'none'; };
      if (key !== lastNotified) { lastNotified = key; desktopNotify(l.length, late); }
    });
  }
  function desktopNotify(n, late) {
    try {
      if (window.Notification && Notification.permission === 'granted') {
        new Notification('Nhắc việc văn bản', { body: n + ' văn bản đến hạn/gần hạn' + (late ? ', ' + late + ' đã quá hạn' : '') });
      }
    } catch (e) { }
  }

  // ---------- Form ----------
  function openForm(r) {
    editId = r ? r.id : null;
    $('mTitle').textContent = r ? 'Sửa văn bản' : 'Thêm văn bản';
    for (var i = 0; i < FIELDS.length; i++) $(FIELDS[i]).value = r ? r[FIELDS[i]] : (FIELDS[i] === 'ket_qua' ? 'chua' : '');
    if (!r) $('ngay_nhan').value = todayStr();
    $('pdf').value = '';
    var cf = $('curFile');
    cf.innerHTML = r && r.has_file ? 'Đang có: <a href="/files/' + r.id + '" target="_blank">' + esc(r.file_name) + '</a> – <a href="#" id="rmFile">gỡ file</a> (chọn file mới để thay thế)' : '';
    if ($('rmFile')) $('rmFile').onclick = function (ev) {
      ev.preventDefault();
      if (confirm('Gỡ file PDF này?')) ajax('DELETE', '/api/vanban/' + r.id + '/file', null, function () { cf.textContent = 'Đã gỡ file.'; load(); });
    };
    $('modal').style.display = 'block';
    $('so_van_ban').focus();
  }
  function save() {
    var d = {};
    for (var i = 0; i < FIELDS.length; i++) d[FIELDS[i]] = $(FIELDS[i]).value;
    if (!d.trich_yeu.trim() && !d.so_van_ban.trim()) { alert('Nhập ít nhất số văn bản hoặc trích yếu.'); return; }
    var f = $('pdf').files[0];
    if (f && !/\.pdf$/i.test(f.name)) { alert('Chỉ chọn file .pdf'); return; }
    $('mSave').disabled = true;
    var finish = function () { $('mSave').disabled = false; $('modal').style.display = 'none'; load(); };
    var done = function (id) {
      if (!f) { finish(); return; }
      ajax('POST', '/api/vanban/' + id + '/file', f, function (e) {
        if (e) alert('Lưu văn bản được nhưng tải PDF lỗi: ' + e);
        finish();
      }, true, { 'X-Filename': encodeURIComponent(f.name) });
    };
    if (editId) ajax('PUT', '/api/vanban/' + editId, d, function (e) { if (e) { alert(e); $('mSave').disabled = false; } else done(editId); });
    else ajax('POST', '/api/vanban', d, function (e, res) { if (e) { alert(e); $('mSave').disabled = false; } else done(res.id); });
  }
  function byId(id) { for (var i = 0; i < rows.length; i++) if (String(rows[i].id) === String(id)) return rows[i]; }

  // ---------- Ky nhan ----------
  function selectedRows() {
    var chk = document.querySelectorAll('.chk:checked'), ids = {}, i, out = [];
    for (i = 0; i < chk.length; i++) ids[chk[i].value] = 1;
    if (!chk.length) return rows.slice();
    for (i = 0; i < rows.length; i++) if (ids[rows[i].id]) out.push(rows[i]);
    return out;
  }
  function signTable(list) {
    var h = '<table><thead><tr><th style="width:32px">STT</th><th style="width:90px">Số VB</th><th style="width:78px">Ngày VB</th>' +
      '<th>Trích yếu</th><th style="width:22%">Ý kiến chỉ đạo</th><th style="width:110px">Cán bộ thực hiện</th><th style="width:78px">Hạn</th>' +
      '<th style="width:120px">Ký nhận</th></tr></thead><tbody>';
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      h += '<tr><td style="text-align:center">' + (i + 1) + '</td><td>' + esc(r.so_van_ban) + '</td><td>' + vn(r.ngay_van_ban) + '</td><td>' + esc(r.trich_yeu) +
        (r.noi_dung ? '<br><i>' + esc(r.noi_dung) + '</i>' : '') + '</td><td style="white-space:pre-wrap">' + esc(r.y_kien_chi_dao) + '</td><td>' + esc(r.can_bo) +
        '</td><td>' + vn(r.han) + '</td><td class="ky"></td></tr>';
    }
    return h + '</tbody></table>';
  }
  function buildSign() {
    var list = selectedRows(), t = new Date(), h = '', title = esc($('sgTitle').value);
    var date = 'Ngày in: ' + ('0' + t.getDate()).slice(-2) + '/' + ('0' + (t.getMonth() + 1)).slice(-2) + '/' + t.getFullYear();
    if ($('sgGroup').checked) {
      var groups = {}, names = [];
      list.forEach(function (r) {
        var ns = (r.can_bo || '').split(/[;,]/).map(function (s) { return s.trim(); }).filter(Boolean);
        if (!ns.length) ns = ['(Chưa giao)'];
        ns.forEach(function (n) { if (!groups[n]) { groups[n] = []; names.push(n); } groups[n].push(r); });
      });
      names.sort();
      names.forEach(function (n, i) {
        h += '<div class="' + (i < names.length - 1 ? 'pgbreak' : '') + '"><h2>' + title + '</h2><div class="sub">Cán bộ: <b>' + esc(n) + '</b> – ' + date + '</div>' + signTable(groups[n]) + '</div>';
      });
    } else {
      h = '<h2>' + title + '</h2><div class="sub">' + date + ' – ' + list.length + ' văn bản</div>' + signTable(list);
    }
    $('signPaper').innerHTML = list.length ? h : '<p>Không có văn bản để in.</p>';
  }

  // ---------- Su kien ----------
  function bind() {
    $('btnAdd').onclick = function () { openForm(null); };
    $('mCancel').onclick = function () { $('modal').style.display = 'none'; };
    $('mSave').onclick = save;
    $('btnClear').onclick = function () {
      ['fQ', 'fKq', 'fCb', 'fHanTu', 'fHanDen', 'fNhanTu', 'fNhanDen'].forEach(function (i) { $(i).value = ''; }); load();
    };
    var timer;
    $('fQ').oninput = $('fCb').oninput = function () { clearTimeout(timer); timer = setTimeout(load, 250); };
    ['fKq', 'fHanTu', 'fHanDen', 'fNhanTu', 'fNhanDen'].forEach(function (i) { $(i).onchange = load; });
    $('chkAll').onclick = function () {
      var c = document.querySelectorAll('.chk'); for (var i = 0; i < c.length; i++) c[i].checked = $('chkAll').checked;
    };
    $('btnCsv').onclick = function () {
      var ids = [].map.call(document.querySelectorAll('.chk:checked'), function (c) { return c.value; }).join(',');
      window.location = '/export.csv?' + filterQS() + (ids ? '&ids=' + ids : '');
    };
    $('btnSign').onclick = function () { buildSign(); $('signView').style.display = 'block'; };
    $('sgTitle').oninput = buildSign;
    $('sgGroup').onchange = buildSign;
    $('sgClose').onclick = function () { $('signView').style.display = 'none'; };
    $('sgPrint').onclick = function () { window.print(); };
    $('stats').onclick = function (ev) {
      var el = ev.target;
      while (el && el !== this && el.getAttribute('data-k') === null) el = el.parentNode;
      if (el && el !== this) { $('fKq').value = el.getAttribute('data-k'); load(); }
    };
    $('tbody').onclick = function (ev) {
      var t = ev.target, id = t.getAttribute('data-id');
      if (!id) return;
      if (t.className.indexOf('ed') >= 0) openForm(byId(id));
      else if (t.className.indexOf('del') >= 0) {
        var r = byId(id);
        if (confirm('Xóa văn bản "' + (r.so_van_ban || r.trich_yeu) + '" (kèm file PDF)?')) ajax('DELETE', '/api/vanban/' + id, null, load);
      }
    };
    $('tbody').onchange = function (ev) {
      var t = ev.target;
      if (t.className.indexOf('kq') >= 0) {
        var r = byId(t.getAttribute('data-id')), d = {};
        FIELDS.forEach(function (f) { d[f] = r[f]; });
        d.ket_qua = t.value;
        ajax('PUT', '/api/vanban/' + r.id, d, function () { load(); });
      }
    };
    try { $('remDays').value = localStorage.getItem('remDays') || 3; } catch (e) { }
    $('remDays').onchange = function () {
      try { localStorage.setItem('remDays', $('remDays').value); } catch (e) { }
      dismissedKey = ''; load();
    };
    $('btnNotify').onclick = function () {
      if (!window.Notification) { alert('Trình duyệt không hỗ trợ thông báo. Vẫn có khung nhắc việc màu cam trên đầu trang.'); return; }
      Notification.requestPermission(function (p) { $('btnNotify').textContent = p === 'granted' ? '🔔 Đã bật thông báo' : '🔕 Thông báo bị chặn'; });
    };
    if (window.Notification && Notification.permission === 'granted') $('btnNotify').textContent = '🔔 Đã bật thông báo';
    document.onkeydown = function (e) { if (e.keyCode === 27) { $('modal').style.display = 'none'; $('signView').style.display = 'none'; } };
    lastDay = todayStr();
    setInterval(function () { loadReminder(); loadStats(); }, 5 * 60 * 1000);
    setInterval(function () { if (todayStr() !== lastDay) { lastDay = todayStr(); load(); } }, 60 * 1000);
  }

  bind();
  load();
})();
