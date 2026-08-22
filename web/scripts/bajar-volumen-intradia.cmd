@echo off
REM Volumen INTRADIA de SPXW (barras de 5 minutos), fuera de la sesion de Claude.
REM
REM El de dia entero (bajar-volumen-spxw.mjs) NO sirve para pesar la gamma en tiempo
REM real: el volumen total del dia lleva dentro donde acabo el precio. Medido sobre
REM 120 dias, el strike de mas volumen esta a 11 puntos del CIERRE y a 23 de las 09:35,
REM y esta mas cerca del cierre el 75% de los dias. Usarlo a las 09:35 es mirar al futuro.
REM
REM Este baja el volumen BARRA A BARRA, que se puede acumular sin tocar el futuro.
setlocal enabledelayedexpansion
for %%I in ("%~dp0..") do set "RAIZ=%%~fI"
set CERROJO=%RAIZ%\scripts\cache-theta\.volintra-corriendo
set LOG=%RAIZ%\scripts\cache-theta\vol-intradia.log
cd /d "%RAIZ%"

if exist "%CERROJO%" (
  echo [%date% %time%] ya hay una descarga corriendo, no arranco >> "%LOG%"
  exit /b 0
)

REM El Programador NO hereda el entorno: sin DATA_PROVIDER=theta el lanzador se salta
REM el Terminal, las peticiones van a un puerto vacio, y sale con CODIGO 0 sin bajar nada.
for /f "usebackq eol=# tokens=1,* delims==" %%A in ("%RAIZ%\.env.local") do (
  if not "%%~A"=="" if not "%%~B"=="" set "%%~A=%%~B"
)
if not "%DATA_PROVIDER%"=="theta" (
  echo [%date% %time%] ABORTA: DATA_PROVIDER='%DATA_PROVIDER%', esperaba 'theta' >> "%LOG%"
  exit /b 2
)

echo %date% %time% > "%CERROJO%"
echo [%date% %time%] ARRANCA >> "%LOG%"
node scripts\bajar-volumen-intradia.mjs >> "%LOG%" 2>&1
echo [%date% %time%] TERMINA codigo %errorlevel% >> "%LOG%"
del "%CERROJO%" 2>nul
endlocal
