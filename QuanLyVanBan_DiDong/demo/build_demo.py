# Ghép index.html + demo-backend.js thành 1 file xem thử (không cần Google).  Chạy: python3 demo/build_demo.py <file_ra>
import re, sys, os
here = os.path.dirname(os.path.abspath(__file__))
s = open(os.path.join(here, '..', 'index.html'), encoding='utf-8').read()
b = open(os.path.join(here, 'demo-backend.js'), encoding='utf-8').read()
s = s.replace('<base target="_top">\n', '')
s = s.replace('<script>\n(function () {', '<script>' + b + '</script>\n<script>\n(function () {', 1)
open(sys.argv[1], 'w', encoding='utf-8').write(s)
