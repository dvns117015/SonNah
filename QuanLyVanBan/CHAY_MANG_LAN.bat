@echo off
chcp 65001 >nul
cd /d "%~dp0"
set PYTHONIOENCODING=utf-8
set VB_HOST=0.0.0.0
echo Che do LAN: may khac truy cap bang dia chi IP cua may nay, cong 8080. Xem IP bang lenh: ipconfig
if exist "python\python.exe" (
  "python\python.exe" server.py
) else (
  python server.py
)
pause
