@echo off
cd /d "%~dp0"
echo Stopping RoundPost (Electron)...
REM Match electron/node processes by command line path (unique per project)
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='electron.exe'\" | Where-Object { $_.CommandLine -like '*RoundPost*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" 2>nul
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*RoundPost*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" 2>nul
echo Done.
timeout /t 1 >nul
