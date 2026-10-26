@echo off
rem ==========================================================================
rem  Start Cyclic Labs without the helper window.
rem  Use this if "Start Cyclic Labs" is blocked on your computer (for example a
rem  work PC that doesn't allow PowerShell). Everything works except the
rem  "CalculiX check" card. Designs saved this way are kept separately from the
rem  ones saved with "Start Cyclic Labs" (use Export file / Import file to move them).
rem ==========================================================================
if not exist "%~dp0app\index.html" (
  echo.
  echo   Cyclic Labs can't find its files. Extract the zip first: right-click it,
  echo   choose "Extract All...", then run this from the extracted folder.
  echo.
  pause
  exit /b 1
)
start "" "%~dp0app\index.html"
