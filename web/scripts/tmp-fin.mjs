// Espera a que Ideas escriba latido y luego avisa por Telegram con el estado de los cuatro.
import { execFileSync } from "node:child_process";
import Redis from "ioredis";
const r = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 3 });
const DESDE = Date.now();
console.log("esperando el latido de ideas…");
let ok = false;
while (Date.now() - DESDE < 35 * 60000) {
  await new Promise(x => setTimeout(x, 15000));
  const raw = await r.get("latido:ideas");
  if (raw && Date.parse(JSON.parse(raw).cuandoISO) > DESDE - 120000) { ok = true; break; }
}
const est = [];
for (const s of ["gex-condor", "credit-spread", "wheel", "ideas"]) {
  const raw = await r.get(`latido:${s}`);
  if (!raw) { est.push(`${s}: SIN LATIDO`); continue; }
  const L = JSON.parse(raw);
  est.push(`${s}: ${L.cuandoET} ${String(L.commit).slice(0,8)} · ${L.resultado}`);
}
await r.quit();
const cuerpo = (ok ? "LOS CUATRO CRON HAN TERMINADO\n\n" : "Ideas no escribio latido en 35 min\n\n") + est.join("\n");
console.log(cuerpo);
try { execFileSync("node", ["--env-file=.env.local", "scripts/telegram.mjs", "--enviar", cuerpo], { stdio: "inherit" }); } catch {}
