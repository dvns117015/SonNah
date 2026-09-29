@echo off
chcp 65001 >nul
cd /d "%~dp0"
set PYTHONIOENCODING=utf-8
if exist "python\python.exe" (
  "python\python.exe" server.py
  goto end
)
where python >nul 2>nul
if errorlevel 1 (
  echo CHUA CO PYTHON. Hay giai nen goi Python 3.8 ^(embeddable^) vao thu muc "python" canh file nay.
  echo Xem file HUONG_DAN.txt.
  pause
  exit /b 1
)
python server.py
:end
if errorlevel 1 pause
