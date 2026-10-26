@echo off
rem ==========================================================================
rem  Builds "Cyclic Labs.exe" (one folder up) from CyclicLabs.cs.
rem  Uses the C# compiler that ships with Windows (.NET Framework 4.x):
rem  nothing to download or install. Output also goes to build_log.txt.
rem  If Cyclic Labs is running, quit it first (tray icon > Quit Cyclic Labs).
rem ==========================================================================
setlocal
cd /d "%~dp0"
set "CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not exist "%CSC%" set "CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe"
if not exist "%CSC%" (
  echo Could not find the .NET Framework 4 C# compiler in %WINDIR%\Microsoft.NET. > build_log.txt
  type build_log.txt
  pause
  exit /b 1
)
echo Building Cyclic Labs.exe ...
"%CSC%" /nologo /target:winexe /platform:anycpu /optimize+ /utf8output ^
  /win32icon:"%~dp0CyclicLabs.ico" ^
  /r:System.dll /r:System.Drawing.dll /r:System.Windows.Forms.dll ^
  /out:"%~dp0..\Cyclic Labs.exe" "%~dp0CyclicLabs.cs" > build_log.txt 2>&1
if errorlevel 1 (
  echo BUILD FAILED >> build_log.txt
  type build_log.txt
  echo.
  echo   Build failed - see above (also saved in build_log.txt).
  pause
  exit /b 1
)
echo BUILD OK >> build_log.txt
type build_log.txt
echo.
echo   Done: "Cyclic Labs.exe" is in the main folder, one up from this one. Double-click it to start.
pause
