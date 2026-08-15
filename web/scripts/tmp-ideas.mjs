// Espera a que se libere la sesion, lanza Ideas, y manda el cierre por Telegram.
import { execFileSync } from "node:child_process";
import Redis from "ioredis";
const r = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 3 });
const espera = ms => new Promise(x => setTimeout(x, ms));
const t0 = Date.now();
while (Date.now() - t0 < 45 * 60000) {
  const l = await r.get("lock:theta");
  if (!l) break;
  console.log(`  esperando: ${l}`);
  await espera(20000);
}
console.log("sesion libre, lanzando Ideas…");
try { execFileSync("node", ["--env-file=.env.local", "scripts/railway-run.mjs", "Ideas"], { stdio: "inherit" }); }
catch { console.log("no se pudo lanzar"); }
const desde = Date.now();
while (Date.now() - desde < 12 * 60000) {
  await espera(15000);
  const raw = await r.get("latido:ideas");
  if (raw && Date.parse(JSON.parse(raw).cuandoISO) > desde - 60000) break;
}
const filas = [];
for (const s of ["gex-condor", "credit-spread", "wheel", "ideas"]) {
  const raw = await r.get(`latido:${s}`);
  const L = raw ? JSON.parse(raw) : null;
  filas.push(L ? `${s}: ${L.cuandoET} ${String(L.commit).slice(0,8)}\n   ${L.resultado.slice(0,95)}` : `${s}: SIN LATIDO`);
}
await r.quit();
let comp = ""; try { comp = execFileSync("node", ["--env-file=.env.local", "scripts/estado-railway.mjs"], { encoding: "utf8" }); }
catch (e) { comp = (e.stdout || "") + (e.stderr || ""); }
const v = (comp.match(/(SISTEMA SANO[^\n]*|\d+ FALLOS?[^\n]*|NO SE PUDO COMPROBAR[^\n]*)/) || ["(sin veredicto)"])[0];
const cuerpo = `LOS CUATRO CRON — CIERRE\n\n${filas.join("\n")}\n\nVEREDICTO DEL COMPROBADOR:\n${v}`;
console.log(cuerpo);
try { execFileSync("node", ["--env-file=.env.local", "scripts/telegram.mjs", "--enviar", cuerpo], { stdio: "inherit" }); } catch {}
