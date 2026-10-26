@echo off
rem ==========================================================================
rem  Start Cyclic Labs (with the CalculiX solver)
rem  Opens a small helper window (leave it open) and Cyclic Labs in your browser.
rem ==========================================================================
cd /d "%~dp0"
if not exist "%~dp0app\index.html" goto notextracted
if not exist "%~dp0system\CyclicLabs-Server.ps1" goto notextracted
start "Cyclic Labs" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0system\CyclicLabs-Server.ps1"
exit /b 0

:notextracted
echo.
echo   Cyclic Labs can't find its files.
echo.
echo   This usually means it's being run from inside the zip file.
echo   Close this window, right-click the zip, choose "Extract All...",
echo   then open the extracted "Cyclic Labs" folder and double-click
echo   "Start Cyclic Labs" there.
echo.
pause
exit /b 1
