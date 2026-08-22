@echo off
REM Enciende el Theta Terminal y lo deja vivo, fuera de la sesión de Claude.
REM Carga .env.local a mano porque el Programador de tareas no hereda el entorno
REM (eso ya nos costó 876 peticiones a un puerto vacío que salieron con código 0).
setlocal enabledelayedexpansion
REM La raíz se deduce de dónde vive este .cmd (%~dp0 = su propia carpeta). Escrita a
REM mano se rompe el día que se renombra o mueve el proyecto.
for %%I in ("%~dp0..") do set "RAIZ=%%~fI"
cd /d "%RAIZ%"
for /f "usebackq eol=# tokens=1,* delims==" %%A in ("%RAIZ%\.env.local") do (
  if not "%%~A"=="" if not "%%~B"=="" set "%%~A=%%~B"
)
if "%THETADATA_API_KEY%"=="" ( echo ABORTA: falta THETADATA_API_KEY >> scripts\cache-theta\theta.log & exit /b 3 )
echo [%date% %time%] arrancando Terminal >> scripts\cache-theta\theta.log
java -jar ThetaTerminalv3.jar %THETADATA_API_KEY% >> scripts\cache-theta\theta.log 2>&1
endlocal
