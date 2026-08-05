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
//       THETA_TRUSTSTORE    (opcional, solo Windows/Norton) keystore con el cert de la MITM
//       THETA_BOOT_TIMEOUT  segundos de espera a que arranque (default 180)

import { spawn } from "node:child_process";
import { existsSync, createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const JAR = process.env.THETA_JAR || "ThetaTerminalv3.jar";
const JAR_URL = process.env.THETA_JAR_URL || "https://download-stable.thetadata.us/ThetaTerminalv3.jar";
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
process.on("SIGINT", () => { shutdown(); process.exit(130); });
process.on("SIGTERM", () => { shutdown(); process.exit(143); });

(async () => {
  await ensureJar();

  // Java: el truststore solo hace falta donde un antivirus inspecciona TLS (Windows/Norton).
  // preferIPv4Stack evita el cuelgue por IPv6 al contactar el servidor de auth.
  const opts = ["-Djava.net.preferIPv4Stack=true"];
  if (process.env.THETA_TRUSTSTORE) {
    opts.push(`-Djavax.net.ssl.trustStore=${process.env.THETA_TRUSTSTORE}`, "-Djavax.net.ssl.trustStorePassword=changeit");
  }

  log("arrancando el Theta Terminal…");
  term = spawn("java", [...opts, "-jar", JAR, "--api-key", KEY], { stdio: ["ignore", "pipe", "pipe"] });
  term.stdout.on("data", (d) => process.stdout.write(`[theta] ${d}`));
  term.stderr.on("data", (d) => process.stderr.write(`[theta] ${d}`));
  term.on("exit", (c) => log(`Terminal terminó (código ${c})`));

  const t0 = Date.now();
  while (Date.now() - t0 < BOOT_TIMEOUT * 1000) {
    if (await ready()) break;
    await new Promise((r) => setTimeout(r, 3000));
  }
  if (!(await ready())) { log(`el Terminal no respondió en ${BOOT_TIMEOUT}s`); shutdown(); process.exit(1); }
  log(`Terminal listo en ${((Date.now() - t0) / 1000).toFixed(0)}s — corriendo: ${cmd.join(" ")}`);

  const child = runChild();
  child.on("exit", (code) => { shutdown(); process.exit(code ?? 1); });
  child.on("error", (e) => { console.error(`[with-theta] no pude correr el comando: ${e.message}`); shutdown(); process.exit(1); });
})().catch((e) => { console.error(`[with-theta] ERROR: ${e.message}`); shutdown(); process.exit(1); });

} // fin del modo ThetaData
