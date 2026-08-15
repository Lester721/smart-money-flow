// ESTADO REAL DE LOS CRON DE RAILWAY — por lo que ESCRIBEN, no por lo que dice el log.
//
// Uso:  node --env-file=.env.local scripts/estado-railway.mjs
//   Sólo mira: no escribe nada en Redis y no imprime ninguna credencial.
//   Sale con código 1 si hay algún aviso, para poder encadenarlo.
//
// POR QUÉ NO BASTA CON MIRAR LOS LEDGERS. Un servicio que corre bien pero no tiene nada que
// añadir ese día NO ESCRIBE NADA. Desde fuera, "corrió y no había señal" y "lleva tres días
// muerto" se ven exactamente igual. El 2026-08-15 eso costó una mañana entera: la Wheel
// funcionaba, pero como el dedup no añadía operaciones no había forma de comprobar si el
// contenedor tenía el código actual — la única respuesta posible era "espera a las 18:00 a ver".
//
// Por eso cada cron deja ahora un LATIDO en CADA corrida, con el commit que Railway le inyectó.
// Este comprobador lo compara con `main` y dice, sin esperar a nada, si algún servicio se quedó
// en un despliegue viejo.

import { execFileSync } from "node:child_process";
import Redis from "ioredis";

if (!process.env.REDIS_URL) { console.error("falta REDIS_URL en .env.local"); process.exit(1); }
const r = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 3 });

const DESDE_ORIGEN = "2026-08-13";   // el día que se añadió el campo `origen`
const hoyET = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const ahoraET = new Date().toLocaleString("sv-SE", { timeZone: "America/New_York" }).slice(0, 16);
const corto = (c) => (c || "").slice(0, 8) || "?";
/** ¿Es un SHA de git (40 hex) o el id de despliegue de Railway (un UUID)? Compararlos sería
 *  fabricar un aviso falso todos los días. */
const esSha = (c) => /^[0-9a-f]{40}$/i.test(String(c || ""));

/** El commit que Railway DEBERÍA estar corriendo = la punta de main en el remoto. */
function commitDeMain() {
  if (process.env.COMMIT_MAIN) return process.env.COMMIT_MAIN.trim();
  try { return execFileSync("git", ["rev-parse", "origin/main"], { encoding: "utf8" }).trim(); }
  catch { return ""; }
}

let avisos = 0;   // fallos del sistema: hay que arreglarlos
let notas = 0;    // observaciones del forward-test: información, no fallos
const COMMIT_MAIN = commitDeMain();

console.log(`AHORA (hora de Nueva York): ${ahoraET}`);
console.log(`main en el remoto: ${corto(COMMIT_MAIN) || "(no se pudo leer)"}`);

// ── 1. LATIDOS: qué commit corre cada servicio ──────────────────────────────
console.log("\n── SERVICIOS ────────────────────────────────────────────────────────");
const latidos = (await r.keys("latido:*")).sort();
if (!latidos.length) {
  console.log("  (todavía ningún latido: los servicios lo escribirán en su próxima corrida)");
  console.log("   hasta entonces no se puede saber qué commit corre cada uno.");
} else {
  for (const k of latidos) {
    let L; try { L = JSON.parse(await r.get(k)); } catch { continue; }
    const horas = (Date.now() - Date.parse(L.cuandoISO)) / 3_600_000;
    console.log(`  ${String(L.servicio).padEnd(14)} ${String(L.origen).padEnd(8)} commit ${corto(L.commit)}` +
                `  ·  corrió ${L.cuandoET} (hace ${horas.toFixed(1)} h)`);
    console.log(`  ${" ".repeat(14)} ${L.resultado}`);
    if (horas > 26) { console.log(`                 ⚠ lleva ${horas.toFixed(0)} h sin correr`); avisos++; }
    if (L.origen !== "railway") {
      console.log(`                 ⚠ el último que corrió NO fue Railway, fue "${L.origen}"`); avisos++;
    } else if (L.commit === "desconocido") {
      console.log(`                 ⚠ el contenedor no expone ninguna variable de versión`); avisos++;
    } else if (!esSha(L.commit)) {
      // NO es un SHA de git (será el id de despliegue de Railway). Compararlo con main daría
      // "despliegue viejo" TODOS los días — un aviso inventado, que es peor que ninguno. Se
      // enseña tal cual: si cambia, es que hubo un redespliegue, y eso ya dice bastante.
      console.log(`                 · versión "${corto(L.commit)}" (no es un SHA de git: no se puede`);
      console.log(`                   comparar con main, pero si cambia es que se redesplegó)`);
    } else if (COMMIT_MAIN && corto(L.commit) !== corto(COMMIT_MAIN)) {
      console.log(`                 ⚠ DESPLIEGUE VIEJO: corre ${corto(L.commit)}, main está en ` +
                  `${corto(COMMIT_MAIN)} → hay que redesplegar ese servicio`);
      avisos++;
    } else if (COMMIT_MAIN) console.log(`                 ✓ al día con main`);
  }
}

// ── 2. LEDGERS ──────────────────────────────────────────────────────────────
console.log("\n── LEDGERS ──────────────────────────────────────────────────────────");
const claves = (await r.keys("*")).filter((k) => !k.startsWith("latido:")).sort();
for (const k of claves) {
  const tipo = await r.type(k);
  if (tipo !== "string") { console.log(`  ${k.padEnd(34)} (${tipo})`); continue; }
  const crudo = await r.get(k);

  if (k.endsWith(":report")) {
    // DOS COSAS DISTINTAS QUE ANTES SE MEZCLABAN, y mezclarlas hacía inútil el contador:
    //
    //   · SALUD DEL SISTEMA — "el servicio no corrió", "se quedó en un despliegue viejo". Se
    //     arreglan, y hasta que se arreglen hay algo que hacer.
    //   · NOTAS DEL FORWARD-TEST — "con 3 cierres esto no dice nada, hacen falta ~30", "el
    //     crédito está por debajo del p10". NO son fallos: es la prueba diciendo la verdad
    //     sobre sí misma, y la de los 30 cierres va a estar ahí durante meses.
    //
    // Si las dos suman al mismo contador, nunca sale verde aunque todo esté perfecto — y un
    // contador que nunca sale verde no se mira. Se cuentan aparte.
    const lineas = crudo.split("\n").filter((x) => x.includes("⚠"));
    console.log(`  ${k.padEnd(34)} ${lineas.length ? `${lineas.length} notas del forward-test` : "sin notas"}`);
    for (const l of lineas) console.log(`        · ${l.replace("⚠", "").trim()}`);
    notas += lineas.length;
    continue;
  }

  let v; try { v = JSON.parse(crudo); } catch { console.log(`  ${k.padEnd(34)} ${crudo.slice(0, 60)}`); continue; }
  if (!Array.isArray(v)) { console.log(`  ${k.padEnd(34)} ${JSON.stringify(v).slice(0, 90)}`); continue; }

  const dias = v.map((o) => o.dia ?? o.entryDate ?? o.fecha).filter(Boolean).sort();
  const orig = {};
  for (const o of v) orig[o.origen ?? "SIN ORIGEN"] = (orig[o.origen ?? "SIN ORIGEN"] ?? 0) + 1;
  console.log(`  ${k}`);
  console.log(`      ${v.length} operaciones · ${dias[0] ?? "?"} → ${dias[dias.length - 1] ?? "?"} · ` +
              `${v.filter((o) => o.estado === "abierta").length} abiertas`);
  console.log(`      origen: ${Object.entries(orig).map(([a, b]) => `${a}=${b}`).join(" · ")}`);
  const ultimo = dias[dias.length - 1];
  const atras = ultimo ? Math.round((Date.parse(hoyET()) - Date.parse(ultimo)) / 86_400_000) : null;
  if (atras != null && atras > 4) { console.log(`      ⚠ la última operación es de hace ${atras} días`); avisos++; }

  // ¿QUÉ ES HISTORIA Y QUÉ ES UN FALLO DE VERDAD?
  //
  // Una fecha fija no vale. Las 7 operaciones que la Wheel escribió el 2026-08-14 no llevan
  // firma porque su contenedor corría un despliegue anterior al campo — es un hecho pasado que
  // ya NO se puede cambiar, y avisar de ello todos los días para siempre convierte el contador
  // en ruido. Pero tampoco se pueden ignorar sin más: mientras el servicio siga sin firmar,
  // sigue siendo un problema vivo.
  //
  // La frontera se calcula sola: la PRIMERA operación firmada de este ledger. Todo lo anterior
  // es historia (el servicio aún no tenía el código); todo lo posterior sin firmar es un fallo
  // real y actual. En cuanto el servicio corra con el código nuevo, el aviso se apaga solo y sin
  // que nadie toque un dato.
  const firmadas = v.filter((o) => o.origen).map((o) => o.dia ?? o.entryDate ?? "").filter(Boolean).sort();
  const frontera = firmadas[0] ?? null;
  const sinFirma = v.filter((o) => !o.origen);
  const posteriores = frontera ? sinFirma.filter((o) => (o.dia ?? o.entryDate ?? "") > frontera).length : 0;
  const historicas = sinFirma.length - posteriores;
  if (historicas > 0) {
    console.log(`      ${historicas} sin firmar, ` + (frontera
      ? `anteriores a la primera firmada (${frontera}): historia, no se pueden arreglar`
      : `y este servicio NUNCA ha firmado ninguna → todavía no ha corrido con el código nuevo`));
    if (!frontera) avisos++;
  }
  if (posteriores > 0) {
    console.log(`      ⚠ ${posteriores} operaciones sin firmar POSTERIORES a una que sí lo está` +
                ` → el servicio dejó de firmar, eso es un fallo vivo`);
    avisos++;
  }
}

console.log(`\n${avisos === 0 ? "✅ NINGÚN AVISO" : `⚠ ${avisos} avisos`}`);
await r.quit();
process.exit(avisos === 0 ? 0 : 1);
