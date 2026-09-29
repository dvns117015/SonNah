# Ghép index.html + claude-backend.js thành trang dùng cho Claude Artifact.  Chạy: python3 claude/build_artifact.py <file_ra>
import re, sys, os
here = os.path.dirname(os.path.abspath(__file__))
s = open(os.path.join(here, '..', 'index.html'), encoding='utf-8').read()
b = open(os.path.join(here, 'claude-backend.js'), encoding='utf-8').read()
s = s.replace('<base target="_top">\n', '')
s = s.replace('<script>\n(function () {', '<script>' + b + '</script>\n<script>\n(function () {', 1)
link = re.search(r'<link rel="stylesheet"[^>]*>', s).group(0)
style = re.search(r'<style>.*?</style>', s, re.S).group(0)
body = re.search(r'<body>(.*)</body>', s, re.S).group(1)
open(sys.argv[1], 'w', encoding='utf-8').write('<title>Quản lý văn bản</title>\n' + link + '\n' + style + '\n' + body)
