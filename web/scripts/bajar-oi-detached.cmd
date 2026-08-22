@echo off
REM ── LA DESCARGA DEL OI, FUERA DE LA SESION DE CLAUDE ─────────────────────────
REM
REM La lanza el Programador de tareas de Windows, asi que sobrevive a que la app de
REM Claude se reinicie por la noche para actualizarse.
REM
REM DOS COSAS QUE YA FALLARON UNA VEZ Y POR ESO ESTAN AQUI ESCRITAS:
REM
REM  1. El Programador NO hereda el entorno de la sesion. Sin DATA_PROVIDER=theta el
REM     lanzador se salta el Terminal, las peticiones van a un puerto vacio, y sale
REM     con CODIGO 0 habiendo bajado cero. Por eso se carga .env.local a mano.
REM  2. Dos Terminal de ThetaData a la vez y el segundo se muere a los 180 segundos.
REM     Por eso el cerrojo.
setlocal enabledelayedexpansion
REM La raíz se deduce de dónde vive este .cmd (%~dp0 = su propia carpeta). Escrita a
REM mano se rompe el día que se renombra o mueve el proyecto.
for %%I in ("%~dp0..") do set "RAIZ=%%~fI"
set CERROJO=%RAIZ%\scripts\cache-theta\.oi-corriendo
set LOG=%RAIZ%\scripts\cache-theta\oi-detached.log
cd /d "%RAIZ%"

if exist "%CERROJO%" (
  echo [%date% %time%] ya hay una descarga corriendo, no arranco >> "%LOG%"
  exit /b 0
)

REM ── cargar .env.local linea a linea (saltando comentarios y lineas vacias) ──
for /f "usebackq eol=# tokens=1,* delims==" %%A in ("%RAIZ%\.env.local") do (
  if not "%%~A"=="" if not "%%~B"=="" set "%%~A=%%~B"
)

REM ── EL CHEQUEO QUE FALTABA: sin esto, "codigo 0" no significa nada ──
if not "%DATA_PROVIDER%"=="theta" (
  echo [%date% %time%] ABORTA: DATA_PROVIDER='%DATA_PROVIDER%', esperaba 'theta' >> "%LOG%"
  exit /b 2
)
if "%THETADATA_API_KEY%"=="" (
  echo [%date% %time%] ABORTA: falta THETADATA_API_KEY >> "%LOG%"
  exit /b 3
)

echo %date% %time% > "%CERROJO%"
echo [%date% %time%] ARRANCA con DATA_PROVIDER=%DATA_PROVIDER% >> "%LOG%"
node scripts\with-theta.mjs node scripts\bajar-oi-spxw.mjs >> "%LOG%" 2>&1
echo [%date% %time%] TERMINA codigo %errorlevel% >> "%LOG%"
del "%CERROJO%" 2>nul
endlocal
