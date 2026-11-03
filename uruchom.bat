@echo off
rem Uruchamia edytor map. Domyślne repo: ..\NSV13-master. Inne repo: uruchom.bat --repo C:\sciezka\do\repo
cd /d "%~dp0"
python serwer.py %*
pause
