@echo off
setlocal
cd /d "%~dp0.."
where cl >nul 2>nul
if not errorlevel 1 goto compile
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if not exist "%VSWHERE%" goto missing
for /f "usebackq tokens=*" %%i in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do set "VSROOT=%%i"
if not defined VSROOT goto missing
call "%VSROOT%\VC\Auxiliary\Build\vcvars64.bat" >nul
:compile
if not exist build mkdir build
rc /nologo /I src /I . /fo build/assets.res src/assets.rc
if errorlevel 1 exit /b 1
cl /nologo /std:c17 /O2 /MT /W4 /WX /DUNICODE /D_UNICODE /utf-8 /I vendor src\app.c src\core.c src\benchmark.c src\sources.c src\public_prices.c src\bcrp_prices.c src\open_stocks.c vendor\cJSON.c build\assets.res /Fo:build\ /Fe:OilPerps.exe /link /SUBSYSTEM:WINDOWS winhttp.lib ws2_32.lib shell32.lib user32.lib advapi32.lib
if errorlevel 1 exit /b 1
cl /nologo /std:c17 /O2 /MT /W4 /DOIL_TEST /utf-8 /I vendor tests\test_core.c src\core.c src\benchmark.c src\sources.c vendor\cJSON.c /Fo:build\ /Fe:build\test_core.exe /link winhttp.lib
if errorlevel 1 exit /b 1
build\test_core.exe
if errorlevel 1 exit /b 1
cl /nologo /std:c17 /O2 /MT /W4 /WX /utf-8 /I vendor tests\test_sources.c src\core.c src\benchmark.c src\sources.c vendor\cJSON.c /Fo:build\ /Fe:build\test_sources.exe /link winhttp.lib
if errorlevel 1 exit /b 1
build\test_sources.exe
if errorlevel 1 exit /b 1
cl /nologo /std:c17 /O2 /MT /W4 /WX /utf-8 /I vendor tests\test_public_prices.c src\core.c src\benchmark.c src\sources.c src\public_prices.c src\bcrp_prices.c src\open_stocks.c vendor\cJSON.c /Fo:build\ /Fe:build\test_public_prices.exe /link winhttp.lib advapi32.lib
if errorlevel 1 exit /b 1
build\test_public_prices.exe
if errorlevel 1 exit /b 1
cl /nologo /std:c17 /O2 /MT /W4 /WX /utf-8 /I vendor tests\test_bcrp.c src\bcrp_prices.c src\core.c src\benchmark.c src\sources.c vendor\cJSON.c /Fo:build\ /Fe:build\test_bcrp.exe /link winhttp.lib
if errorlevel 1 exit /b 1
build\test_bcrp.exe
if errorlevel 1 exit /b 1
cl /nologo /std:c17 /O2 /MT /W4 /WX /utf-8 /I vendor tests\test_open_stocks.c src\core.c src\benchmark.c src\sources.c src\public_prices.c src\bcrp_prices.c src\open_stocks.c vendor\cJSON.c /Fo:build\ /Fe:build\test_open_stocks.exe /link winhttp.lib advapi32.lib
if errorlevel 1 exit /b 1
build\test_open_stocks.exe
if errorlevel 1 exit /b 1
powershell -NoProfile -Command "$p=Start-Process .\OilPerps.exe -ArgumentList --verify-bundle -WindowStyle Hidden -Wait -PassThru; exit $p.ExitCode"
if errorlevel 1 exit /b 1
where node >nul 2>nul
if errorlevel 1 exit /b 0
node tests\test_ui.cjs
if errorlevel 1 exit /b 1
node tests\test_updates.cjs
if errorlevel 1 exit /b 1
node tests\test_analysis.cjs
if errorlevel 1 exit /b 1
node tests\test_research_i18n.cjs
if errorlevel 1 exit /b 1
node tests\test_research.cjs
exit /b %errorlevel%
:missing
echo Installez Visual Studio Build Tools avec "Developpement Desktop en C++".
exit /b 2
