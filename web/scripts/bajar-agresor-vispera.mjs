// QUIÉN ABRIÓ: el lado agresor de las operaciones de la víspera.
//
// ═══ LA PIEZA QUE FALTA ═════════════════════════════════════════════════════════════════════
//
// Ya tenemos, para los 1.122 vencimientos, cuántos contratos se abrieron la última noche
// (el ΔOI, restando el OI de la víspera al del día). Pero ese número es NETO y no dice QUIÉN:
// +5.801 contratos puede ser alguien comprando o alguien vendiendo, y significan lo contrario.
//
// El producto que lo dice directo es el Cboe Open-Close, y ThetaData NO lo tiene (comprobado:
// `option/history/open_close` responde 404). Pero la mitad de esa información sí se puede
// deducir de lo que ya está pagado:
//
//   `trade_quote` trae, en la MISMA fila, el precio de cada operación Y el bid/ask de ese
//   instante. Si la operación cruzó contra el ASK, el que tenía prisa era el COMPRADOR.
//   Si cruzó contra el BID, el que tenía prisa era el VENDEDOR.
//
// Cruzando eso con el ΔOI: si en un strike se abrieron 5.000 contratos y ese día el volumen fue
// mayoritariamente agresivo de compra, lo más probable es que el público estuviera ABRIENDO
// LARGOS y el dealer quedándose corto. Es una estimación, no un dato — se dice y ya está.
//
// ═══ LO QUE ESTO NO PUEDE DECIR, Y HAY QUE REPETIRLO ════════════════════════════════════════
//
// · El agresor NO es lo mismo que abrir. Alguien que VENDE para CERRAR un largo se ve igual que
//   alguien que vende para abrir un corto. Por eso hace falta cruzarlo con el ΔOI, y aun así es
//   una inferencia.
// · Las operaciones de varias patas ensucian: en la cinta de MarketSnack sólo el 41% de los
//   prints eran de una sola pata. Una pata de un spread se clasifica como si fuera direccional.
//
// ═══ POR QUÉ NO SE GUARDAN LAS OPERACIONES ══════════════════════════════════════════════════
//
// Medido con reloj antes de lanzar: la cadena de calls de UN día son 46.173 operaciones y
// 6,7 MB. Los dos lados, ~13 MB. A 1.122 días serían 15 GB — más que todo el caché junto.
// Así que se clasifica al vuelo y se guarda SÓLO el resumen por strike. Unos pocos MB.
//
// ═══ LA COTIZACIÓN VIEJA ════════════════════════════════════════════════════════════════════
//
// Hay filas donde el bid/ask es de minutos antes de la operación (la subasta de apertura, por
// ejemplo: operación a las 09:30:02 con cotización de las 09:25). Clasificar contra una
// cotización vieja es inventar. Se mide el retraso y las que pasan de 5 segundos se cuentan
// aparte, no se clasifican.
//
// Uso: node scripts/bajar-agresor-vispera.mjs     (con un Terminal ya corriendo)

import { writeFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";

const B = (process.env.THETA_BASE || "http://127.0.0.1:25503").replace(/\/+$/, "").replace(/\/v3$/, "") + "/v3";
const DIR_VISP = join(CACHE, "oi-vispera");
const DIR = join(CACHE, "agresor-vispera");
if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });

if ((process.env.DATA_PROVIDER || "").toLowerCase() !== "theta") {
  console.error(`ABORTA: DATA_PROVIDER='${process.env.DATA_PROVIDER}', esperaba 'theta'.`);
  process.exit(2);
}

const MAX_RETRASO_MS = 5000;      // cotización más vieja que esto: no se clasifica

/** Clasifica un día entero y devuelve el resumen por strike. */
async function clasificar(exp, dia, lado) {
  const r = await fetch(
    `${B}/option/history/trade_quote?symbol=SPXW&expiration=${exp}&start_date=${dia}&end_date=${dia}&right=${lado}`,
    { signal: AbortSignal.timeout(280_000) });
  if (!r.ok) return { error: `HTTP ${r.status}` };
  const txt = await r.text();
  const nl = txt.indexOf("\n");
  if (nl < 0) return { error: "sin filas" };
  const cab = txt.slice(0, nl).split(",").map((x) => x.replace(/"/g, "").trim());
  const iK = cab.indexOf("strike"), iTT = cab.indexOf("trade_timestamp"), iQT = cab.indexOf("quote_timestamp"),
        iS = cab.indexOf("size"), iP = cab.indexOf("price"), iB = cab.indexOf("bid"), iA = cab.indexOf("ask");
  // Si el fichero cambia de forma, esto LANZA. Un índice -1 leería `undefined` y todo saldría a cero.
  if ([iK, iTT, iQT, iS, iP, iB, iA].some((x) => x < 0)) return { error: `faltan columnas: ${cab.join("|")}` };

  const res = {};
  let n = 0, viejas = 0, sinCot = 0;
  let p = nl + 1;
  while (p < txt.length) {
    let f = txt.indexOf("\n", p); if (f < 0) f = txt.length;
    const linea = txt.slice(p, f); p = f + 1;
    if (!linea) continue;
    const c = linea.split(",");
    const size = +c[iS], precio = +c[iP], bid = +c[iB], ask = +c[iA];
    if (!(size > 0) || !(precio > 0)) continue;
    n++;
    if (!(ask > 0) || ask < bid) { sinCot++; continue; }
    const retraso = Date.parse(c[iTT]) - Date.parse(c[iQT]);
    if (!isFinite(retraso) || retraso > MAX_RETRASO_MS || retraso < -1000) { viejas++; continue; }

    const K = Number(String(c[iK]).replace(/"/g, ""));
    const clave = `${K}|${lado}`;
    const e = res[clave] ?? (res[clave] = { comp: 0, vend: 0, medio: 0 });
    // El punto medio decide: por encima manda el comprador, por debajo el vendedor.
    const mid = (bid + ask) / 2;
    if (precio >= ask) e.comp += size;
    else if (precio <= bid) e.vend += size;
    else if (precio > mid) e.comp += size;
    else if (precio < mid) e.vend += size;
    else e.medio += size;
  }
  return { res, n, viejas, sinCot };
}

// ── los vencimientos que tienen víspera descargada ─────────────────────────
const pares = readdirSync(DIR_VISP)
  .filter((f) => f.endsWith(".json"))
  .map((f) => { const v = JSON.parse(readFileSync(join(DIR_VISP, f), "utf8")); return { exp: v.exp, vispera: v.vispera }; })
  .filter((x) => x.exp && x.vispera)
  .sort((a, b) => b.exp.localeCompare(a.exp));          // del más reciente hacia atrás

console.log(`## ${pares.length} vencimientos con víspera · bajando el lado agresor de esa sesión\n`);

let hechos = 0, yaEstaban = 0, fallos = 0;
let totalOps = 0, totalViejas = 0, totalSinCot = 0;
const t0 = Date.now();

for (let k = 0; k < pares.length; k++) {
  const { exp, vispera } = pares[k];
  const ruta = join(DIR, `${exp}.json`);
  if (existsSync(ruta)) {
    try {
      const v = JSON.parse(readFileSync(ruta, "utf8"));
      if (v && v.vispera && Object.keys(v.res ?? {}).length > 20) { yaEstaban++; continue; }
    } catch { /* mal escrito: se rehace */ }
  }

  const res = {};
  let n = 0, viejas = 0, sinCot = 0, error = null;
  for (const lado of ["C", "P"]) {
    const r = await clasificar(exp, vispera, lado);
    if (r.error) { error = `${lado}: ${r.error}`; break; }
    Object.assign(res, r.res);
    n += r.n; viejas += r.viejas; sinCot += r.sinCot;
  }
  if (error) { fallos++; console.log(`   ✗ ${exp} (víspera ${vispera}): ${error}`); continue; }

  writeFileSync(ruta, JSON.stringify({ exp, vispera, ops: n, viejas, sinCot, res }), "utf8");
  hechos++; totalOps += n; totalViejas += viejas; totalSinCot += sinCot;

  if (hechos % 25 === 0 || k === pares.length - 1) {
    const seg = (Date.now() - t0) / 1000;
    const quedan = Math.round((seg / hechos) * (pares.length - k - 1) / 60);
    console.log(`   ${k + 1}/${pares.length} · ${exp} · hechos ${hechos} · ya estaban ${yaEstaban} · fallos ${fallos} · ` +
                `cotización vieja ${(100 * totalViejas / Math.max(totalOps, 1)).toFixed(1)}% · quedan ~${quedan} min`);
  }
}

console.log(`\n## TERMINADO`);
console.log(`   hechos ${hechos} · ya estaban ${yaEstaban} · fallos ${fallos}`);
console.log(`   operaciones vistas ${totalOps.toLocaleString("es-ES")} · descartadas por cotización vieja ` +
            `${totalViejas.toLocaleString("es-ES")} (${(100 * totalViejas / Math.max(totalOps, 1)).toFixed(1)}%) · sin cotización ${totalSinCot.toLocaleString("es-ES")}`);
if (fallos > pares.length * 0.05) { console.error(`   ⚠ más del 5% de fallos: NO usar esto sin mirar por qué.`); process.exit(1); }
