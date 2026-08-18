// Lanzador de "Theta Terminal EFÍMERO": arranca el Terminal, espera a que sirva datos,
// corre el comando que le pases, y al terminar lo apaga. Pensado para los cron de Railway:
// ThetaData permite UNA conexión por cuenta, así que el Terminal solo debe vivir durante el job
// (fuera de esa ventana, el Terminal local de Lester queda libre).
//
// Uso:  node scripts/with-theta.mjs npm run forward-test
//       node scripts/with-theta.mjs node --import tsx scripts/forward-wheel.ts
//
// Env:  THETADATA_API_KEY   (obligatorio)
//       THETA_JAR           ruta al jar (default ./ThetaTerminalv3.jar; se descarga si falta)
//       THETA_TRUSTSTORE    (opcional, solo Windows/Norton) keystore con el cert de la MITM.
//                           Se arma copiando el cacerts del JDK e importándole el root del
//                           antivirus (ver docs/Theta-Terminal-Windows.md). Sin él, en Windows
//                           se cae de vuelta al almacén de Windows, que arranca pero deja el
//                           refresco de sesión fallando cada segundo.
//       THETA_BOOT_TIMEOUT  segundos de espera a que arranque (default 180)

import { spawn } from "node:child_process";
import { existsSync, createWriteStream, readdirSync } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const JAR = process.env.THETA_JAR || "ThetaTerminalv3.jar";
const JAR_URL = process.env.THETA_JAR_URL || "https://downloads.thetadata.us/ThetaTerminalv3.jar";
const BASE = process.env.THETA_BASE || "http://127.0.0.1:25503";
const BOOT_TIMEOUT = Number(process.env.THETA_BOOT_TIMEOUT || 180);
const KEY = process.env.THETADATA_API_KEY;
// ── STAGE: la segunda sesión, para lo que corre EN CONTINUO ──────────────────
// ThetaData admite una sesión por cuenta en PROD y otra en STAGE — su soporte lo confirmó por
// escrito y el 2026-08-15 se comprobó que STAGE devuelve datos IDÉNTICOS (1.001.611 filas
// comparadas byte a byte) y que también sirve websocket.
//
// Reparto: los cron efímeros van a PROD y se turnan con el candado; el worker de Ideas, que vive
// SIEMPRE, va a STAGE. Sin esto habría que elegir entre el worker y los cuatro cron.
const STAGE = process.env.THETA_ENV === "stage";
// EL WORKER PERMANENTE NO COGE EL CANDADO. Es de otra sesión, así que no compite con nadie — y
// si lo cogiera, lo retendría para siempre y los cuatro cron no correrían nunca más.
const USA_CANDADO = !STAGE && process.env.THETA_SIN_CANDADO !== "1";

const log = (m) => console.log(`[with-theta] ${m}`);

const cmd = process.argv.slice(2);
if (!cmd.length) { console.error("[with-theta] Uso: node scripts/with-theta.mjs <comando...>"); process.exit(1); }

// En Windows npm/npx son .cmd y SÍ requieren shell; para todo lo demás evitamos shell
// (con shell:true los argumentos con espacios se parten). En Linux/Railway nunca hace falta.
const needsShell = process.platform === "win32" && /^(npm|npx|yarn|pnpm)$/.test(cmd[0]);
const runChild = () => spawn(cmd[0], cmd.slice(1), { stdio: "inherit", env: process.env, shell: needsShell });

// PASO DIRECTO: si el proveedor no es ThetaData, no arrancamos Terminal — corre el comando tal cual.
// Así el mismo startCommand sirve para Massive (hoy) y para ThetaData (con DATA_PROVIDER=theta).
if ((process.env.DATA_PROVIDER || "massive").toLowerCase() !== "theta") {
  log("DATA_PROVIDER≠theta → sin Terminal, corriendo el comando directo.");
  const passthrough = runChild();
  passthrough.on("exit", (code) => process.exit(code ?? 1));
  passthrough.on("error", (e) => { console.error(`[with-theta] ${e.message}`); process.exit(1); });
} else {

if (!KEY) {
  console.error("[with-theta] Falta THETADATA_API_KEY");
  const { escribirLatidoDirecto } = await import("../lib/origenEjecucion.ts");
  const rw = (process.env.RAILWAY_SERVICE_NAME || "").toLowerCase();
  for (const [pista, nombre] of Object.entries({ "cóndor": "gex-condor", condor: "gex-condor",
      wheel: "wheel", "credit spread": "credit-spread", ideas: "ideas" }))
    if (rw.includes(pista)) { await escribirLatidoDirecto(nombre, "NO CORRIÓ: falta THETADATA_API_KEY"); break; }
  process.exit(1);
}

async function ensureJar() {
  if (existsSync(JAR)) return;
  log(`descargando el Terminal desde ${JAR_URL}…`);
  const res = await fetch(JAR_URL);
  if (!res.ok) throw new Error(`descarga falló: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(JAR));
  log("Terminal descargado.");
}

async function ready() {
  try {
    const r = await fetch(`${BASE}/v3/option/list/expirations?symbol=AAPL`, { signal: AbortSignal.timeout(4000) });
    return r.ok && (await r.text()).includes("AAPL");
  } catch { return false; }
}

let term = null;
function shutdown() {
  if (term && !term.killed) { log("apagando el Terminal…"); try { term.kill("SIGTERM"); } catch {} }
}
/** Apagar + soltar candado. Se usa en TODAS las salidas: si el candado no se suelta, el
 *  siguiente servicio se queda esperando hasta que expire el TTL. */
async function cerrar() { shutdown(); await soltarCandado(); }
// SI RAILWAY MATA EL CONTENEDOR, QUE SE SEPA. El 2026-08-15 un push mío disparó un despliegue
// nuevo mientras la Wheel llevaba 12 minutos corriendo; Railway paró el contenedor a mitad
// ("Stopping Container", 5 de 12 tickers) y la corrida no dejó ni rastro: sin latido, sin
// operaciones, y desde fuera parecía que el servicio no había hecho nada. Ahora deja dicho que
// lo pararon, que es información muy distinta de "falló" o de "no corrió".
// ¿BAJO QUÉ NOMBRE SE ESCRIBE EL LATIDO?
// Tiene que ser el MISMO que usa el cron al terminar bien, o el comprobador mira una clave y el
// fallo se escribe en otra. La primera versión usaba `process.env.LATIDO_SERVICIO`, una variable
// que yo inventé y NO puse en ningún sitio: cada parada habría escrito en `latido:with-theta`,
// una clave fantasma que (1) dejaba al servicio de verdad pareciendo sano y (2) avisaría para
// siempre de un servicio que no existe. Se deriva del nombre real que inyecta Railway.
const SERVICIOS = { "cóndor": "gex-condor", condor: "gex-condor", wheel: "wheel",
                    "credit spread": "credit-spread", ideas: "ideas" };
function nombreLatido() {
  if (process.env.LATIDO_SERVICIO) return process.env.LATIDO_SERVICIO;
  const rw = (process.env.RAILWAY_SERVICE_NAME || "").toLowerCase();
  for (const [pista, nombre] of Object.entries(SERVICIOS)) if (rw.includes(pista)) return nombre;
  return null;      // NO se inventa un nombre: mejor no escribir que escribir en el sitio falso
}

/** Deja dicho por qué esta corrida no llegó a ninguna parte. Nunca lanza. */
async function avisarNoCorrio(motivo) {
  const servicio = nombreLatido();
  if (!servicio) { log(`(no sé bajo qué servicio dejar el aviso: RAILWAY_SERVICE_NAME="${process.env.RAILWAY_SERVICE_NAME || ""}")`); return; }
  try {
    const { escribirLatidoDirecto } = await import("../lib/origenEjecucion.ts");
    await escribirLatidoDirecto(servicio, motivo);
  } catch { /* nos vamos igual */ }
}
const avisarParada = (señal) =>
  avisarNoCorrio(`PARADO por ${señal} a mitad de corrida (Railway detuvo el contenedor: ¿despliegue nuevo?)`);
process.on("SIGINT", async () => { await avisarParada("SIGINT"); await cerrar(); process.exit(130); });
process.on("SIGTERM", async () => { await avisarParada("SIGTERM"); await cerrar(); process.exit(143); });

// ── CANDADO: UNA SOLA SESIÓN DE THETADATA EN TODO EL PROYECTO ───────────────
//
// ThetaData permite UNA conexión por cuenta. Si dos servicios levantan su Terminal a la vez, el
// segundo NUNCA llega a servir datos: se queda esperando 180s y muere sin decir por qué.
//
// El 2026-08-15 eso tumbó dos servicios a la vez y costó la mañana entera. Lester le dio a
// "Run now" al Cóndor y al Credit Spread casi al mismo segundo (13:36:58 los dos, según el log):
// el Cóndor se quedó colgado antes de arrancar siquiera su script — ni imprimió su cabecera— y
// el Credit Spread estuvo media hora en "Running" sin escribir nada. Desde fuera parecía un
// fallo de código. No lo era.
//
// El candado vive en Redis porque es lo único que comparten los contenedores. Con TTL, para que
// un servicio que muera sin soltar no deje a los demás bloqueados para siempre.
const LOCK_KEY = process.env.THETA_LOCK_KEY || "lock:theta";
// TTL CORTO + RENOVACIÓN, no TTL largo y a rezar. Con un TTL fijo de 30 min y un trabajo que
// tarda 28, el día que tarde 31 el candado CADUCA con el trabajo dentro y entra un segundo
// Terminal: exactamente la colisión que esto viene a evitar, pero provocada sola. Con renovación,
// el TTL sólo tiene que cubrir el hueco entre dos renovaciones — y si el dueño muere de golpe,
// el siguiente entra en 2 minutos en vez de en 30.
const LOCK_TTL = Number(process.env.THETA_LOCK_TTL || 120);       // 2 min, renovado cada 40 s
// Esperar TANTO como pueda durar la corrida del otro, no menos: el Credit Spread tarda ~18 min y
// la Wheel arranca 30 min después. Si un día el primero se pasa de 30, el segundo tiene que
// aguantar, no rendirse. Se iguala al TTL del candado: así siempre acaba pudiendo entrar.
const LOCK_ESPERA = Number(process.env.THETA_LOCK_ESPERA || 1800);
const QUIEN = `${process.env.RAILWAY_SERVICE_NAME || "local"}:${process.pid}`;

let _lockCli = null;
async function lockCliente() {
  if (!process.env.REDIS_URL) return null;
  if (!_lockCli) {
    const { default: Redis } = await import("ioredis");
    _lockCli = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 3 });
  }
  return _lockCli;
}

/** Coge el candado, esperando si otro lo tiene. Devuelve false si se agota la espera. */
async function cogerCandado() {
  const cli = await lockCliente();
  if (!cli) { log("sin REDIS_URL: no hay candado (en local no hace falta)."); return true; }
  const t0 = Date.now();
  let avisado = false;
  while (Date.now() - t0 < LOCK_ESPERA * 1000) {
    const puesto = await cli.set(LOCK_KEY, QUIEN, "EX", LOCK_TTL, "NX");
    if (puesto === "OK") {
      log(`candado de ThetaData cogido por ${QUIEN}`);
      return true;
    }
    if (!avisado) {
      log(`⏳ otro servicio tiene la sesión de ThetaData: ${await cli.get(LOCK_KEY)}`);
      log(`   esperando hasta ${LOCK_ESPERA}s a que la suelte (ThetaData sólo permite UNA).`);
      avisado = true;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  log(`✗ el candado sigue ocupado por ${await cli.get(LOCK_KEY)} tras ${LOCK_ESPERA}s.`);
  log(`  NO se arranca un segundo Terminal: moriría sin servir datos. Este job no corre hoy.`);
  return false;
}

let _renovador = null;
/** Renueva el candado mientras el trabajo siga vivo. Si deja de ser mío, aborto: seguir con un
 *  candado ajeno es peor que no tenerlo. */
function empezarRenovacion() {
  if (!USA_CANDADO || !_lockCli) return;
  _renovador = setInterval(async () => {
    try {
      const dueño = await _lockCli.get(LOCK_KEY);
      if (dueño !== QUIEN) {
        log(`✗ el candado ya no es mío (lo tiene "${dueño}"). Abortando para no chocar.`);
        clearInterval(_renovador); _renovador = null;
        await avisarNoCorrio(`ABORTADO: perdí el candado de ThetaData a mitad (lo tiene ${dueño})`);
        shutdown();
        process.exit(75);
      }
      await _lockCli.expire(LOCK_KEY, LOCK_TTL);
    } catch (e) { log(`(no pude renovar el candado: ${e.message})`); }
  }, Math.max(10, Math.floor(LOCK_TTL / 3)) * 1000);
  _renovador.unref?.();
}

async function soltarCandado() {
  if (_renovador) { clearInterval(_renovador); _renovador = null; }
  const cli = _lockCli;
  if (!cli) return;
  try {
    // Sólo se suelta si el candado es MÍO: si ya expiró y lo cogió otro, no se le quita.
    const dueño = await cli.get(LOCK_KEY);
    if (dueño === QUIEN) { await cli.del(LOCK_KEY); log("candado soltado."); }
    await cli.quit();
  } catch { /* nos vamos igual */ }
  _lockCli = null;
}

(async () => {
  await ensureJar();

  if (!USA_CANDADO) log(`sin candado (${STAGE ? "sesión STAGE, no compite con los cron" : "desactivado a mano"}).`);
  if (USA_CANDADO && !(await cogerCandado())) {
    await avisarNoCorrio(`NO CORRIÓ: la sesión de ThetaData seguía ocupada tras ${LOCK_ESPERA}s`);
    await soltarCandado(); process.exit(75);                                   // 75 = EX_TEMPFAIL
  }

  // Java: preferIPv4Stack evita el cuelgue por IPv6 al contactar el servidor de auth.
  const opts = ["-Djava.net.preferIPv4Stack=true"];
  if (process.env.THETA_TRUSTSTORE) {
    // Truststore explícito (si alguien arma uno a mano).
    opts.push(`-Djavax.net.ssl.trustStore=${process.env.THETA_TRUSTSTORE}`, "-Djavax.net.ssl.trustStorePassword=changeit");
  } else if (process.platform === "win32") {
    // Windows: un antivirus que inspecciona TLS (Norton) mete su propio certificado, que Windows
    // SÍ confía pero el cacerts de Java NO → el bootstrap del Terminal muere con "certificate_unknown"
    // y no llega a bajar el jar real. Apuntando Java al almacén de certificados de Windows queda
    // resuelto sin tener que extraer e importar el cert a mano. En Linux/Railway no aplica.
    opts.push("-Djavax.net.ssl.trustStoreType=Windows-ROOT");
  }

  // Van por JAVA_TOOL_OPTIONS y NO como argumentos: el jar que lanzamos es solo un *bootstrap*
  // que descarga el Terminal real y lo arranca en OTRO JVM. Ese hijo no hereda los -D de la línea
  // de comandos, pero sí las variables de entorno — que es donde el problema de TLS se manifiesta.
  const jto = [process.env.JAVA_TOOL_OPTIONS, ...opts].filter(Boolean).join(" ");

  // MODO PRUEBA: ejercitar el candado SIN levantar un Terminal de verdad.
  // La auditoría corre este mismo script para comprobar el candado. Si arrancara Java, se
  // conectaría a ThetaData con la MISMA clave y le robaría la sesión a lo que estuviera corriendo
  // en Railway en ese momento — o sea, la herramienta que comprueba que no hay colisiones sería
  // la que las provoca. Con THETA_SIN_TERMINAL=1 se salta el arranque y se sale limpio.
  if (process.env.THETA_SIN_TERMINAL === "1") {
    log("THETA_SIN_TERMINAL=1 → no arranco Java (modo prueba del candado).");
    empezarRenovacion();
    const hijo = runChild();
    hijo.on("exit", async (code) => { await cerrar(); process.exit(code ?? 1); });
    hijo.on("error", async (e) => { console.error(`[with-theta] ${e.message}`); await cerrar(); process.exit(1); });
    return;
  }

  // LA CLAVE NO VA EN LA LÍNEA DE COMANDOS.
  //
  // Antes se pasaba `--api-key <clave>`, y eso la deja visible ENTERA en la lista de procesos:
  // cualquier programa corriendo con este usuario la lee con un `tasklist`. Lo levantó el otro
  // proyecto de Lester el 2026-08-15 y tenía razón.
  //
  // El Terminal admite tres vías (lo dice su propio `--help`): argumento, fichero `.env`, o
  // variable de entorno. Y además lee solo `creds.txt` del directorio de trabajo — comprobado
  // apartando el fichero: sin él NO arranca ("Credentials file not found"). Así que el argumento
  // sobraba. Se le pasa la variable de entorno por si `creds.txt` no estuviera, y nada por argv.
  //
  // Un fichero también es legible por quien tenga acceso al disco, pero NO se cuela en la lista
  // de procesos, ni en capturas del administrador de tareas, ni en volcados de fallo.
  log("arrancando el Theta Terminal…");
  const argsJar = ["-jar", JAR];
  if (STAGE) argsJar.push("--config", process.env.THETA_CONFIG || "config-stage.toml");
  term = spawn("java", argsJar, {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, JAVA_TOOL_OPTIONS: jto, THETA_API_KEY: KEY },
  });
  term.stdout.on("data", (d) => process.stdout.write(`[theta] ${d}`));
  term.stderr.on("data", (d) => process.stderr.write(`[theta] ${d}`));
  term.on("exit", (c) => log(`Terminal terminó (código ${c})`));

  const t0 = Date.now();
  while (Date.now() - t0 < BOOT_TIMEOUT * 1000) {
    if (await ready()) break;
    await new Promise((r) => setTimeout(r, 3000));
  }
  if (!(await ready())) {
    // ¿POR QUÉ no arrancó? El arrancador necesita un jar con fecha en lib/; si no está y la
    // descarga falla, muere. El mensaje genérico no distingue "ThetaData caído" de "la imagen
    // viene incompleta", y esa confusión costó 47 horas de tres servicios el 2026-08-17.
    const enLib = (() => { try { return readdirSync("lib").filter((f) => f.endsWith(".jar")); } catch { return []; } })();
    const causa = enLib.length
      ? `no respondió en ${BOOT_TIMEOUT}s (hay ${enLib.length} jar(s) en lib/, así que NO es la descarga)`
      : `no respondió en ${BOOT_TIMEOUT}s y lib/ ESTÁ VACÍA — la imagen no trae el Terminal y la ` +
        `descarga en runtime falló. Mirar el log del build: scripts/preparar-jar-theta.sh`;
    log(`el Terminal ${causa}`);
    await avisarNoCorrio(`NO CORRIÓ: el Theta Terminal ${causa}`);
    await cerrar(); process.exit(1);
  }
  empezarRenovacion();
  log(`Terminal listo en ${((Date.now() - t0) / 1000).toFixed(0)}s — corriendo: ${cmd.join(" ")}`);

  const child = runChild();
  child.on("exit", async (code) => { await cerrar(); process.exit(code ?? 1); });
  child.on("error", async (e) => {
    console.error(`[with-theta] no pude correr el comando: ${e.message}`);
    await avisarNoCorrio(`NO CORRIÓ: no se pudo lanzar el comando (${e.message})`);
    await cerrar(); process.exit(1);
  });
})().catch(async (e) => {
  console.error(`[with-theta] ERROR: ${e.message}`);
  await avisarNoCorrio(`NO CORRIÓ: el lanzador falló (${e.message})`);
  await cerrar(); process.exit(1);
});

} // fin del modo ThetaData
