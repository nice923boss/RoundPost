@echo off
cd /d "%~dp0"
echo ========================================
echo  RoundPost - Windows Build (NSIS .exe)
echo ========================================
echo.
echo [1/2] Building with electron-vite...
call npx electron-vite build
if errorlevel 1 (
    echo.
    echo ERROR: electron-vite build failed!
    pause
    exit /b 1
)
echo.
echo [2/2] Packaging with electron-builder...
call npx --yes electron-builder@26.15.3 --win
if errorlevel 1 (
    echo.
    echo ERROR: electron-builder failed!
    pause
    exit /b 1
)
echo.
echo ========================================
echo  Build complete!
echo  Output: release\
echo ========================================
echo.
pause
