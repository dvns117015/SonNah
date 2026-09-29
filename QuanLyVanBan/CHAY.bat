@echo off
chcp 65001 >nul
cd /d "%~dp0"
set PYTHONIOENCODING=utf-8
if exist "python\python.exe" (
  "python\python.exe" server.py
) else (
  python server.py
)
if errorlevel 1 (
  echo.
  echo Khong chay duoc. Hay xem file HUONG_DAN.txt ^(muc Cai dat Python^).
  pause
)
