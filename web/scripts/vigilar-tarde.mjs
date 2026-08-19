// VIGILAR LA TANDA DE LA TARDE — una línea por servicio, y se muere cuando estén los tres.
//
// Credit Spread (18:00), Wheel (18:30) e Ideas (19:00). Es la primera vez que corren con el
// código de hoy: el jar dentro de la imagen, los reintentos del Terminal, y el disparador de
// despliegue apuntando por fin a main. Ideas además lleva desde el 17 sin correr.
//
// ⚠️ NO BASTA CON QUE HAYA LATIDO. Se comprueban TRES cosas, porque cada una falla distinto:
//   1. que el latido sea DE HOY            — si no, el cron ni se disparó
//   2. que el COMMIT sea el de origin/main — si no, corrió código viejo (el fallo de esta mañana)
//   3. que el resultado no diga NO CORRIÓ  — el script puede arrancar y no hacer nada
//
// ⚠️ Y EL SILENCIO NO ES ÉXITO: a las 19:30 avisa igual de los que falten. Un vigilante que sólo
// sabe dar buenas noticias se calla igual cuando algo se rompe, y ese silencio se lee como
// "todavía no". Ver [auditar-el-propio-monitor] en memoria.

import Redis from "ioredis";
import { execSync } from "node:child_process";

const SERVICIOS = [
  { key: "latido:credit-spread", nombre: "Credit Spread", hora: "18:00" },
  { key: "latido:wheel", nombre: "Wheel", hora: "18:30" },
  { key: "latido:ideas", nombre: "Ideas", hora: "19:00" },
];
const LIMITE = 19 * 60 + 30;                        // 19:30 ET

execSync("git fetch -q origin", { cwd: process.cwd() });
const MAIN = execSync("git rev-parse origin/main").toString().trim();

const HOY = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const ahoraMin = () => {
  const s = new Date().toLocaleTimeString("en-GB", { timeZone: "America/New_York", hour12: false });
  return +s.slice(0, 2) * 60 + +s.slice(3, 5);
};
const reloj = () => new Date().toLocaleTimeString("en-GB", { timeZone: "America/New_York", hour12: false }).slice(0, 5);

const r = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 3 });
const pendientes = new Set(SERVICIOS.map((s) => s.key));

while (pendientes.size) {
  for (const s of SERVICIOS) {
    if (!pendientes.has(s.key)) continue;
    let l = null;
    try { const c = await r.get(s.key); l = c ? JSON.parse(c) : null; } catch { continue; }
    if (!l?.cuandoET?.startsWith(HOY)) continue;    // todavía es el latido de ayer

    pendientes.delete(s.key);
    const viejo = l.commit && !l.commit.startsWith(MAIN.slice(0, 8));
    const malo = /NO CORRIÓ|FALLÓ|ERROR/i.test(l.resultado ?? "");
    const marca = malo ? "❌" : viejo ? "⚠️" : "✅";
    console.log(`${marca} ${reloj()} ET · ${s.nombre} (cron ${s.hora}) — ${l.resultado}`);
    if (viejo) console.log(`   ⚠ corrió con el commit ${l.commit.slice(0, 8)}, no con ${MAIN.slice(0, 8)} de main`);
    if (malo) console.log(`   → node --env-file=.env.local scripts/railway-api.mjs --logs "Forward · ${s.nombre}" --lineas 40`);
  }

  if (!pendientes.size) break;

  if (ahoraMin() >= LIMITE) {
    const faltan = SERVICIOS.filter((s) => pendientes.has(s.key));
    console.log(`❌ ${reloj()} ET · son las 19:30 y NO han corrido: ${faltan.map((s) => s.nombre).join(", ")}`);
    console.log(`   el cron no se disparó o el contenedor no arrancó · revisar con estado-railway.mjs`);
    break;
  }
  await new Promise((s) => setTimeout(s, 120_000));
}
await r.quit();
