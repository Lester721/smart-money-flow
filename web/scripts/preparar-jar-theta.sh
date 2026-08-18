#!/bin/sh
# DEJAR EL TERMINAL DE THETADATA DENTRO DE LA IMAGEN — se ejecuta en el BUILD de Railway.
#
# ═══ EL FALLO QUE ARREGLA (2026-08-17) ═══════════════════════════════════════════════════════
#
# `ThetaTerminalv3.jar` NO es el Terminal: es un ARRANCADOR de 41 MB que, al ejecutarse, se
# descarga el Terminal de verdad (un jar con fecha, ~61 MB) y lo deja en `lib/`.
#
# La imagen de Railway sólo llevaba el arrancador. Cada corrida intentaba bajarse el jar y, si
# esa descarga fallaba, moría:
#
#     WARN:  Failed to download JAR file. HTTP error code: 404
#     ERROR: Unable to contact the server to find the correct JAR file to run,
#     ERROR: and there are no JAR files in the library.
#
# Tres servicios (Credit Spread, Wheel, Ideas) llevaban 47 horas así, fallando cada media hora.
# En la máquina de Lester no se notaba: `lib/` tiene jars cacheados de días anteriores y el
# arrancador tira de ellos cuando la descarga falla. La caché local TAPABA el fallo remoto.
#
# El arreglo no es averiguar por qué ThetaData devuelve 404 — es DEJAR DE DEPENDER de esa
# descarga en tiempo de ejecución. Se hace una vez, en el build, y el jar viaja en la imagen.
#
# ═══ POR QUÉ SE MATA EN CUANTO APARECE EL JAR ════════════════════════════════════════════════
#
# ThetaData admite UNA sesión por cuenta. Si este arranque de build se quedara conectado, le
# robaría la sesión al cron que estuviera corriendo en ese momento — o sea, el arreglo provocaría
# el tipo de fallo que venimos persiguiendo. Por eso se vigila `lib/` y se mata en cuanto el jar
# está en disco: la ventana de conexión son segundos, no minutos.
#
# ═══ NUNCA TUMBA EL BUILD ════════════════════════════════════════════════════════════════════
#
# Todo termina en `|| true` y el script sale 0 siempre. Si esto falla, el contenedor queda
# exactamente como estaba antes de este fichero — no peor. Pero lo DICE en el log del build, en
# vez de callarse: un build verde con la imagen incompleta es cómo se llega a 47 horas caído.

set -u
JAR="${THETA_JAR:-ThetaTerminalv3.jar}"
JAR_URL="${THETA_JAR_URL:-https://downloads.thetadata.us/ThetaTerminalv3.jar}"

echo "[preparar-jar] 1/3 · el arrancador"
if [ ! -f "$JAR" ]; then
  curl -fsSL -o "$JAR" "$JAR_URL" || echo "[preparar-jar] ⚠ no se pudo bajar el arrancador; with-theta lo intentará en runtime"
fi
[ -f "$JAR" ] && echo "[preparar-jar]   arrancador presente ($(wc -c < "$JAR") bytes)"

echo "[preparar-jar] 2/3 · traer el Terminal a lib/"
if [ -n "$(ls lib/*.jar 2>/dev/null)" ]; then
  echo "[preparar-jar]   ya hay jar en lib/, no hace falta"
elif [ -z "${THETADATA_API_KEY:-}" ]; then
  # No es un error del script: en Railway las variables del servicio pueden no estar en el build.
  echo "[preparar-jar]   ⚠ sin THETADATA_API_KEY en el BUILD — no se puede autenticar la descarga."
  echo "[preparar-jar]     (en Railway: Variables del servicio; tiene que estar visible en build)"
elif ! command -v java >/dev/null 2>&1; then
  echo "[preparar-jar]   ⚠ no hay java en el build — revisar nixpacks.toml [phases.setup]"
else
  # Se arranca en segundo plano y se vigila lib/. En cuanto aparezca el jar, se mata.
  THETA_API_KEY="$THETADATA_API_KEY" java -jar "$JAR" > /tmp/preparar-jar.log 2>&1 &
  PID=$!
  i=0
  while [ $i -lt 90 ]; do
    [ -n "$(ls lib/*.jar 2>/dev/null)" ] && break
    kill -0 "$PID" 2>/dev/null || break        # se murió solo: no tiene sentido seguir esperando
    i=$((i + 1)); sleep 2
  done
  kill "$PID" 2>/dev/null || true
  wait "$PID" 2>/dev/null || true
fi

echo "[preparar-jar] 3/3 · resultado"
if [ -n "$(ls lib/*.jar 2>/dev/null)" ]; then
  ls -la lib/*.jar | sed 's/^/[preparar-jar]   /'
  echo "[preparar-jar] ✅ el Terminal viaja en la imagen: el contenedor ya no depende de la descarga"
else
  echo "[preparar-jar] ⚠️  lib/ SIGUE VACÍA — el contenedor volverá a depender de la descarga en runtime,"
  echo "[preparar-jar]     que es justo lo que falla. Últimas líneas de lo que dijo el arrancador:"
  tail -12 /tmp/preparar-jar.log 2>/dev/null | sed 's/^/[preparar-jar]   > /' || echo "[preparar-jar]   > (sin log)"
fi
exit 0
