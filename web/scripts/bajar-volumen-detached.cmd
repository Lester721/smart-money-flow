@echo off
REM Descarga del VOLUMEN por strike de SPXW, fuera de la sesion de Claude.
REM Mismas dos trampas ya pagadas: el Programador no hereda el entorno, y dos
REM Terminal de ThetaData a la vez se matan entre si.
setlocal enabledelayedexpansion
for %%I in ("%~dp0..") do set "RAIZ=%%~fI"
set CERROJO=%RAIZ%\scripts\cache-theta\.vol-corriendo
set LOG=%RAIZ%\scripts\cache-theta\vol-detached.log
cd /d "%RAIZ%"
if exist "%CERROJO%" ( echo [%date% %time%] ya corre, no arranco >> "%LOG%" & exit /b 0 )
for /f "usebackq eol=# tokens=1,* delims==" %%A in ("%RAIZ%\.env.local") do (
  if not "%%~A"=="" if not "%%~B"=="" set "%%~A=%%~B"
)
if not "%DATA_PROVIDER%"=="theta" ( echo [%date% %time%] ABORTA: DATA_PROVIDER='%DATA_PROVIDER%' >> "%LOG%" & exit /b 2 )
echo %date% %time% > "%CERROJO%"
echo [%date% %time%] ARRANCA >> "%LOG%"
node scripts\bajar-volumen-spxw.mjs >> "%LOG%" 2>&1
echo [%date% %time%] TERMINA codigo %errorlevel% >> "%LOG%"
del "%CERROJO%" 2>nul
endlocal
