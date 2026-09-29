# Ghép index.html + supabase-backend.js thành trang web đưa lên GitHub Pages (thư mục docs/ ở gốc repo).
# Chạy: python3 QuanLyVanBan_DiDong/supabase/build_web.py
import os, shutil
here = os.path.dirname(os.path.abspath(__file__))
root = os.path.abspath(os.path.join(here, '..', '..'))
out = os.path.join(root, 'docs')
os.makedirs(out, exist_ok=True)
s = open(os.path.join(here, '..', 'index.html'), encoding='utf-8').read()
b = open(os.path.join(here, 'supabase-backend.js'), encoding='utf-8').read()
s = s.replace('<base target="_top">\n', '')
s = s.replace('<meta name="viewport"', '<meta name="theme-color" content="#2a55e6">\n<meta name="viewport"', 1)
lib = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js'
s = s.replace('<script>\n(function () {', '<script src="config.js"></script>\n<script src="' + lib + '"></script>\n<script>' + b + '</script>\n<script>\n(function () {', 1)
open(os.path.join(out, 'index.html'), 'w', encoding='utf-8').write(s)
cfg = os.path.join(out, 'config.js')
if not os.path.exists(cfg):  # không ghi đè cấu hình đã điền
    shutil.copy(os.path.join(here, 'config.js'), cfg)
open(os.path.join(out, '.nojekyll'), 'w').close()
print('Đã tạo', out)
