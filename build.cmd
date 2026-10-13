@echo off
setlocal
cd /d "%~dp0"
where cl >nul 2>nul
if not errorlevel 1 goto compile
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if not exist "%VSWHERE%" goto missing
for /f "usebackq tokens=*" %%i in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do set "VSROOT=%%i"
if not defined VSROOT goto missing
call "%VSROOT%\VC\Auxiliary\Build\vcvars64.bat" >nul
:compile
if not exist build mkdir build
cl /nologo /std:c17 /O2 /MT /W4 /WX /DUNICODE /D_UNICODE /utf-8 /I vendor src\app.c src\core.c vendor\cJSON.c /Fo:build\ /Fe:OilPerps.exe /link /SUBSYSTEM:WINDOWS winhttp.lib ws2_32.lib shell32.lib user32.lib
if errorlevel 1 exit /b 1
cl /nologo /std:c17 /O2 /MT /W4 /DOIL_TEST /utf-8 /I vendor tests\test_core.c src\core.c vendor\cJSON.c /Fo:build\ /Fe:build\test_core.exe /link winhttp.lib
if errorlevel 1 exit /b 1
build\test_core.exe
if errorlevel 1 exit /b 1
where node >nul 2>nul
if not errorlevel 1 node tests\test_ui.cjs
exit /b %errorlevel%
:missing
echo Installez Visual Studio Build Tools avec "Developpement Desktop en C++".
exit /b 2
