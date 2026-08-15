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
import { existsSync, createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const JAR = process.env.THETA_JAR || "ThetaTerminalv3.jar";
const JAR_URL = process.env.THETA_JAR_URL || "https://downloads.thetadata.us/ThetaTerminalv3.jar";
const BASE = process.env.THETA_BASE || "http://127.0.0.1:25503";
const BOOT_TIMEOUT = Number(process.env.THETA_BOOT_TIMEOUT || 180);
const KEY = process.env.THETADATA_API_KEY;

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

if (!KEY) { console.error("[with-theta] Falta THETADATA_API_KEY"); process.exit(1); }

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
process.on("SIGINT", async () => { await cerrar(); process.exit(130); });
process.on("SIGTERM", async () => { await cerrar(); process.exit(143); });

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
const LOCK_TTL = Number(process.env.THETA_LOCK_TTL || 1800);     // 30 min: más que cualquier job
const LOCK_ESPERA = Number(process.env.THETA_LOCK_ESPERA || 600); // esperar hasta 10 min al otro
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

async function soltarCandado() {
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

  if (!(await cogerCandado())) { await soltarCandado(); process.exit(75); }   // 75 = EX_TEMPFAIL

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

  log("arrancando el Theta Terminal…");
  term = spawn("java", ["-jar", JAR, "--api-key", KEY], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, JAVA_TOOL_OPTIONS: jto },
  });
  term.stdout.on("data", (d) => process.stdout.write(`[theta] ${d}`));
  term.stderr.on("data", (d) => process.stderr.write(`[theta] ${d}`));
  term.on("exit", (c) => log(`Terminal terminó (código ${c})`));

  const t0 = Date.now();
  while (Date.now() - t0 < BOOT_TIMEOUT * 1000) {
    if (await ready()) break;
    await new Promise((r) => setTimeout(r, 3000));
  }
  if (!(await ready())) { log(`el Terminal no respondió en ${BOOT_TIMEOUT}s`); await cerrar(); process.exit(1); }
  log(`Terminal listo en ${((Date.now() - t0) / 1000).toFixed(0)}s — corriendo: ${cmd.join(" ")}`);

  const child = runChild();
  child.on("exit", async (code) => { await cerrar(); process.exit(code ?? 1); });
  child.on("error", async (e) => { console.error(`[with-theta] no pude correr el comando: ${e.message}`); await cerrar(); process.exit(1); });
})().catch(async (e) => { console.error(`[with-theta] ERROR: ${e.message}`); await cerrar(); process.exit(1); });

} // fin del modo ThetaData
