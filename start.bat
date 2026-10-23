@echo off
rem Starts a local web server for the 3D house walkthrough (works offline).
rem Tries Python 3, then the py launcher, then Node.js, then built-in PowerShell.
cd /d "%~dp0"

python -c "import sys; sys.exit(0 if sys.version_info >= (3, 7) else 1)" >nul 2>nul
if %errorlevel%==0 (
  python serve.py %*
  goto :done
)
py -3 -c "import sys" >nul 2>nul
if %errorlevel%==0 (
  py -3 serve.py %*
  goto :done
)
node -v >nul 2>nul
if %errorlevel%==0 (
  node serve.mjs %*
  goto :done
)
echo Python / Node.js not found - using the built-in Windows PowerShell server...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"

:done
pause
