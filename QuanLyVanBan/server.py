# -*- coding: utf-8 -*-
"""Quan ly van ban - chi dung thu vien co san cua Python (3.4+ / khuyen dung 3.8 cho Windows 7).
Du lieu nam trong thu muc data/ (app.db + files/). Chep thu muc nay la sao luu toan bo."""
import csv
import io
import json
import mimetypes
import os
import re
import sqlite3
import sys
import threading
import time
import webbrowser
from datetime import date, timedelta
from http.server import BaseHTTPRequestHandler, HTTPServer
try:
    from http.server import ThreadingHTTPServer
except ImportError:  # Python < 3.7
    from socketserver import ThreadingMixIn

    class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
        daemon_threads = True
try:
    from urllib.parse import urlparse, parse_qs, unquote
except ImportError:
    raise SystemExit("Can Python 3")

BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, "data")
FILES = os.path.join(DATA, "files")
STATIC = os.path.join(BASE, "static")
DB = os.path.join(DATA, "app.db")
MAX_UPLOAD = 100 * 1024 * 1024
LOCK = threading.Lock()

HOST = os.environ.get("VB_HOST", "127.0.0.1")
PORT = int(os.environ.get("VB_PORT", "8080"))

STATUS = {"chua": "Chưa xong", "dang": "Đang thực hiện", "xong": "Đã xong", "huy": "Không thực hiện"}
DONE = ("xong", "huy")
FIELDS = ["so_van_ban", "ngay_van_ban", "ngay_nhan", "trich_yeu", "noi_dung",
          "y_kien_chi_dao", "can_bo", "han", "ket_qua", "ghi_chu_ket_qua"]

SCHEMA = """
CREATE TABLE IF NOT EXISTS vanban (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  so_van_ban TEXT DEFAULT '',
  ngay_van_ban TEXT DEFAULT '',
  ngay_nhan TEXT DEFAULT '',
  trich_yeu TEXT DEFAULT '',
  noi_dung TEXT DEFAULT '',
  y_kien_chi_dao TEXT DEFAULT '',
  can_bo TEXT DEFAULT '',
  han TEXT DEFAULT '',
  ket_qua TEXT DEFAULT 'chua',
  ghi_chu_ket_qua TEXT DEFAULT '',
  file_name TEXT DEFAULT '',
  file_path TEXT DEFAULT '',
  created TEXT DEFAULT '',
  updated TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_han ON vanban(han);
"""


def db():
    c = sqlite3.connect(DB, timeout=30)
    c.row_factory = sqlite3.Row
    return c


def init():
    for d in (DATA, FILES):
        if not os.path.isdir(d):
            os.makedirs(d)
    c = db()
    c.executescript(SCHEMA)
    c.commit()
    c.close()


def now():
    return time.strftime("%Y-%m-%d %H:%M:%S")


def row_dict(r):
    d = dict(r)
    d["has_file"] = bool(d.pop("file_path"))
    d["ket_qua_text"] = STATUS.get(d["ket_qua"], d["ket_qua"])
    return d


def clean_date(s):
    s = (s or "").strip()
    return s if re.match(r"^\d{4}-\d{2}-\d{2}$", s) else ""


def query_list(qs):
    """Loc danh sach theo tham so (dung chung cho danh sach, xuat CSV)."""
    def g(k):
        return (qs.get(k) or [""])[0].strip()
    where, args = [], []
    q = g("q")
    if q:
        like = "%" + q + "%"
        where.append("(so_van_ban LIKE ? OR trich_yeu LIKE ? OR noi_dung LIKE ? OR y_kien_chi_dao LIKE ? OR can_bo LIKE ? OR ghi_chu_ket_qua LIKE ?)")
        args += [like] * 6
    kq = g("ket_qua")
    today = date.today().isoformat()
    if kq == "chuaxong":       # chua hoan thanh (chua + dang)
        where.append("ket_qua IN ('chua','dang')")
    elif kq == "quahan":
        where.append("ket_qua IN ('chua','dang') AND han != '' AND han < ?")
        args.append(today)
    elif kq in STATUS:
        where.append("ket_qua = ?")
        args.append(kq)
    cb = g("can_bo")
    if cb:
        where.append("can_bo LIKE ?")
        args.append("%" + cb + "%")
    for key, col, op in (("nhan_tu", "ngay_nhan", ">="), ("nhan_den", "ngay_nhan", "<="),
                         ("han_tu", "han", ">="), ("han_den", "han", "<=")):
        v = clean_date(g(key))
        if v:
            where.append("%s != '' AND %s %s ?" % (col, col, op))
            args.append(v)
    sql = "SELECT * FROM vanban"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY (han = '' ), han ASC, id DESC"
    c = db()
    rows = [row_dict(r) for r in c.execute(sql, args).fetchall()]
    c.close()
    return rows


def read_payload(d):
    out = {}
    for f in FIELDS:
        v = d.get(f, "")
        out[f] = (v if isinstance(v, str) else str(v or "")).strip()
    for f in ("ngay_van_ban", "ngay_nhan", "han"):
        out[f] = clean_date(out[f])
    if out["ket_qua"] not in STATUS:
        out["ket_qua"] = "chua"
    return out


class Handler(BaseHTTPRequestHandler):
    server_version = "QuanLyVanBan/1.0"

    def log_message(self, fmt, *a):
        pass

    # ---- tien ich ----
    def send_json(self, obj, code=200):
        b = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(b)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(b)

    def err(self, code, msg):
        self.send_json({"error": msg}, code)

    def body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(n) if n else b""

    def json_body(self):
        try:
            return json.loads(self.body().decode("utf-8") or "{}")
        except ValueError:
            return {}

    # ---- GET ----
    def do_GET(self):
        u = urlparse(self.path)
        p = unquote(u.path)
        qs = parse_qs(u.query)
        if p == "/api/vanban":
            return self.send_json(query_list(qs))
        m = re.match(r"^/api/vanban/(\d+)$", p)
        if m:
            c = db()
            r = c.execute("SELECT * FROM vanban WHERE id=?", (m.group(1),)).fetchone()
            c.close()
            return self.send_json(row_dict(r)) if r else self.err(404, "Không tìm thấy")
        if p == "/api/canbo":
            c = db()
            names = set()
            for r in c.execute("SELECT DISTINCT can_bo FROM vanban WHERE can_bo != ''"):
                for n in re.split(r"[;,]", r[0]):
                    if n.strip():
                        names.add(n.strip())
            c.close()
            return self.send_json(sorted(names))
        if p == "/api/nhacviec":
            try:
                days = int((qs.get("days") or ["3"])[0])
            except ValueError:
                days = 3
            today = date.today()
            limit = (today + timedelta(days=days)).isoformat()
            c = db()
            rows = c.execute("SELECT * FROM vanban WHERE ket_qua IN ('chua','dang') AND han != '' AND han <= ? ORDER BY han ASC", (limit,)).fetchall()
            c.close()
            out = []
            for r in rows:
                d = row_dict(r)
                d["con_lai"] = (date(*[int(x) for x in d["han"].split("-")]) - today).days
                out.append(d)
            return self.send_json(out)
        if p == "/api/thongke":
            today = date.today().isoformat()
            c = db()
            s = {"tong": c.execute("SELECT COUNT(*) FROM vanban").fetchone()[0],
                 "chuaxong": c.execute("SELECT COUNT(*) FROM vanban WHERE ket_qua IN ('chua','dang')").fetchone()[0],
                 "xong": c.execute("SELECT COUNT(*) FROM vanban WHERE ket_qua='xong'").fetchone()[0],
                 "quahan": c.execute("SELECT COUNT(*) FROM vanban WHERE ket_qua IN ('chua','dang') AND han!='' AND han<?", (today,)).fetchone()[0]}
            c.close()
            return self.send_json(s)
        if p == "/export.csv":
            return self.export_csv(qs)
        m = re.match(r"^/files/(\d+)$", p)
        if m:
            return self.serve_pdf(m.group(1), qs.get("dl"))
        if p == "/":
            p = "/index.html"
        return self.serve_static(p)

    def export_csv(self, qs):
        rows = query_list(qs)
        sel = (qs.get("ids") or [""])[0]
        if sel:
            ids = set(sel.split(","))
            rows = [r for r in rows if str(r["id"]) in ids]
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["STT", "Số văn bản", "Ngày văn bản", "Ngày nhận", "Trích yếu", "Nội dung công việc",
                    "Ý kiến chỉ đạo", "Cán bộ thực hiện", "Hạn", "Kết quả", "Ghi chú kết quả", "Ký nhận"])
        vn = lambda s: "/".join(reversed(s.split("-"))) if s else ""
        for i, r in enumerate(rows, 1):
            w.writerow([i, r["so_van_ban"], vn(r["ngay_van_ban"]), vn(r["ngay_nhan"]), r["trich_yeu"], r["noi_dung"],
                        r["y_kien_chi_dao"], r["can_bo"], vn(r["han"]), r["ket_qua_text"], r["ghi_chu_ket_qua"], ""])
        b = u"﻿".encode("utf-8") + buf.getvalue().encode("utf-8")  # BOM de Excel doc dung tieng Viet
        self.send_response(200)
        self.send_header("Content-Type", "text/csv; charset=utf-8")
        self.send_header("Content-Disposition", 'attachment; filename="danh-sach-van-ban.csv"')
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def serve_pdf(self, vid, dl):
        c = db()
        r = c.execute("SELECT file_name, file_path FROM vanban WHERE id=?", (vid,)).fetchone()
        c.close()
        if not r or not r["file_path"]:
            return self.err(404, "Không có file")
        path = os.path.join(FILES, os.path.basename(r["file_path"]))
        if not os.path.isfile(path):
            return self.err(404, "File đã mất")
        size = os.path.getsize(path)
        self.send_response(200)
        self.send_header("Content-Type", "application/pdf")
        self.send_header("Content-Length", str(size))
        fname = "".join(ch if ord(ch) < 128 and ch not in '"\\' else "_" for ch in r["file_name"]) or "van-ban.pdf"
        self.send_header("Content-Disposition", '%s; filename="%s"' % ("attachment" if dl else "inline", fname))
        self.end_headers()
        with open(path, "rb") as f:
            while True:
                chunk = f.read(65536)
                if not chunk:
                    break
                self.wfile.write(chunk)

    def serve_static(self, p):
        path = os.path.normpath(os.path.join(STATIC, p.lstrip("/")))
        if not path.startswith(STATIC + os.sep) or not os.path.isfile(path):
            return self.err(404, "Not found")
        ctype = mimetypes.guess_type(path)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype.endswith("javascript"):
            ctype += "; charset=utf-8"
        with open(path, "rb") as f:
            b = f.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(b)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(b)

    # ---- POST / PUT / DELETE ----
    def do_POST(self):
        p = unquote(urlparse(self.path).path)
        if p == "/api/vanban":
            d = read_payload(self.json_body())
            t = now()
            with LOCK:
                c = db()
                cur = c.execute(
                    "INSERT INTO vanban (%s, created, updated) VALUES (%s)" % (
                        ",".join(FIELDS), ",".join("?" * (len(FIELDS) + 2))),
                    [d[f] for f in FIELDS] + [t, t])
                c.commit()
                vid = cur.lastrowid
                c.close()
            return self.send_json({"id": vid})
        m = re.match(r"^/api/vanban/(\d+)/file$", p)
        if m:
            return self.upload(m.group(1))
        self.err(404, "Not found")

    def upload(self, vid):
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            n = 0
        if n <= 0 or n > MAX_UPLOAD:
            return self.err(413, "File rỗng hoặc quá lớn (tối đa 100MB)")
        data = self.rfile.read(n)
        if not data.startswith(b"%PDF"):
            return self.err(400, "Chỉ nhận file PDF")
        name = unquote(self.headers.get("X-Filename") or "van-ban.pdf")[:200]
        with LOCK:
            c = db()
            r = c.execute("SELECT file_path FROM vanban WHERE id=?", (vid,)).fetchone()
            if not r:
                c.close()
                return self.err(404, "Không tìm thấy văn bản")
            stored = "%s_%d.pdf" % (vid, int(time.time() * 1000))
            with open(os.path.join(FILES, stored), "wb") as f:
                f.write(data)
            if r["file_path"]:
                try:
                    os.remove(os.path.join(FILES, os.path.basename(r["file_path"])))
                except OSError:
                    pass
            c.execute("UPDATE vanban SET file_name=?, file_path=?, updated=? WHERE id=?", (name, stored, now(), vid))
            c.commit()
            c.close()
        self.send_json({"ok": True})

    def do_PUT(self):
        m = re.match(r"^/api/vanban/(\d+)$", unquote(urlparse(self.path).path))
        if not m:
            return self.err(404, "Not found")
        d = read_payload(self.json_body())
        with LOCK:
            c = db()
            c.execute("UPDATE vanban SET %s, updated=? WHERE id=?" % ",".join(f + "=?" for f in FIELDS),
                      [d[f] for f in FIELDS] + [now(), m.group(1)])
            c.commit()
            c.close()
        self.send_json({"ok": True})

    def do_DELETE(self):
        p = unquote(urlparse(self.path).path)
        m = re.match(r"^/api/vanban/(\d+)(/file)?$", p)
        if not m:
            return self.err(404, "Not found")
        vid, only_file = m.group(1), bool(m.group(2))
        with LOCK:
            c = db()
            r = c.execute("SELECT file_path FROM vanban WHERE id=?", (vid,)).fetchone()
            if r and r["file_path"]:
                try:
                    os.remove(os.path.join(FILES, os.path.basename(r["file_path"])))
                except OSError:
                    pass
            if only_file:
                c.execute("UPDATE vanban SET file_name='', file_path='' WHERE id=?", (vid,))
            else:
                c.execute("DELETE FROM vanban WHERE id=?", (vid,))
            c.commit()
            c.close()
        self.send_json({"ok": True})


def main():
    init()
    try:
        srv = ThreadingHTTPServer((HOST, PORT), Handler)
    except OSError as e:
        print("Không mở được cổng %d (%s). Có thể chương trình đã chạy sẵn rồi." % (PORT, e))
        webbrowser.open("http://127.0.0.1:%d/" % PORT)
        return
    url = "http://127.0.0.1:%d/" % PORT
    print("=" * 60)
    print(" QUẢN LÝ VĂN BẢN đang chạy tại: " + url)
    if HOST != "127.0.0.1":
        print(" Máy khác trong mạng LAN truy cập bằng: http://<IP-máy-này>:%d/" % PORT)
    print(" Đóng cửa sổ này để tắt chương trình.")
    print("=" * 60)
    if "--no-browser" not in sys.argv:
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
