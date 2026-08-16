// INTERÉS ABIERTO ANCHO — todos los strikes y todos los vencimientos, día a día.
//
// Uso: node scripts/bajar-oi-ancho.mjs [añoDesde] [añoHasta] [ticker...]
// Salida: scripts/cache-theta/oi-ancho/{TICKER}_d{AAAAMMDD}.json
//         {vencimiento: {"strike|C": oi, "strike|P": oi}}
//
// ═══ POR QUÉ HACE FALTA OTRO ═══════════════════════════════════════════════════════════════
//
// Ya existe `bajar-oi-historico.ts`, pero se escribió para el GEX y filtra:
//     if (!(k > 0) || Math.abs(k - s) / s > BANDA) continue;     // BANDA = 0,25
//     if (!(dte >= 0 && dte <= MAX_DTE)) continue;                // MAX_DTE = 60
//
// O sea: sólo strikes a ±25% del precio y vencimientos de menos de 60 días. Para el GEX está bien
// — la gamma de lo lejano no mueve nada. Pero el 2026-08-16 medí con ese fichero la hipótesis de
// Lester ("¿se acumula interés abierto en los strikes lejanos antes de que la acción explote?") y
// **un strike al +60% no puede estar ahí**: 570 de 573 valores salieron cero exacto, y produjeron
// una separación con t=5,59 que pareció el mejor hallazgo del proyecto durante media hora.
//
// Éste no filtra nada. Una petición por (ticker, día) con `expiration=*` trae la cadena entera:
// comprobado el 2026-08-16 con NVDA el 2019-07-03 → 1.314 filas, strikes de 45 a 430 con la acción
// en ~165, o sea hasta un +160%. Eso es justo lo que el otro no podía dar.
//
// Ver [mirar-el-fichero-antes-de-medirlo] en memoria.

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";

const BASE = process.env.THETA_BASE || "http://127.0.0.1:25503";
const DIR = "scripts/cache-theta", CDIR = `${DIR}/cadenas`, ODIR = `${DIR}/oi-ancho`;
const AÑO_INI = Number(process.argv[2] || 2016), AÑO_FIN = Number(process.argv[3] || 2026);
const CONC = 4;                                    // el Terminal admite 4 peticiones a la vez
const limpia = (s) => String(s ?? "").replace(/"/g, "").trim();

/** El símbolo cambia con la fecha: META era FB antes del 2022-06-09. */
function simboloEnFecha(sym, dia) {
  if (sym === "META" && dia < "20220609") return "FB";
  return sym;
}

async function pMap(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    for (;;) { const k = i++; if (k >= items.length) return; await fn(items[k]); }
  }));
}

async function bajarDia(sym, dia) {
  const f = `${ODIR}/${sym}_d${dia}.json`;
  if (existsSync(f)) return true;
  const out = {};
  try {
    const r = await fetch(
      `${BASE}/v3/option/history/open_interest?symbol=${simboloEnFecha(sym, dia)}&expiration=*&start_date=${dia}&end_date=${dia}`,
      { signal: AbortSignal.timeout(120_000) });
    if (!r.ok) return false;
    const l = (await r.text()).trim().split("\n");
    if (l.length < 2) return false;
    const h = l[0].split(",").map((x) => limpia(x));
    const iE = h.indexOf("expiration"), iK = h.indexOf("strike"), iR = h.indexOf("right"), iO = h.indexOf("open_interest");
    if (iE < 0 || iK < 0 || iR < 0 || iO < 0) return false;
    for (let j = 1; j < l.length; j++) {
      const c = l[j].split(",");
      const exp = limpia(c[iE]).replace(/-/g, "");
      const K = Number(limpia(c[iK]));
      const oi = Number(limpia(c[iO]));
      const right = limpia(c[iR]).toUpperCase().startsWith("C") ? "C" : "P";
      // El OI CERO se guarda: un strike listado sin posiciones abiertas es información, no un hueco.
      // Lo que no se guarda es una fila sin strike o sin vencimiento válidos.
      if (exp.length !== 8 || !(K > 0) || !Number.isFinite(oi)) continue;
      (out[exp] ??= {})[`${K}|${right}`] = oi;
    }
  } catch { return false; }
  // Un día vacío NO se cachea: guardarlo lo daría por bueno en el siguiente arranque.
  if (!Object.keys(out).length) return false;
  writeFileSync(f, JSON.stringify(out), "utf8");
  return true;
}

(async () => {
  if (!existsSync(ODIR)) mkdirSync(ODIR, { recursive: true });

  // Los días salen de las cadenas que ya tenemos: mismo calendario, misma cobertura.
  const porSim = new Map();
  for (const f of readdirSync(CDIR)) {
    const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/);
    if (!m) continue;
    const a = Number(m[2].slice(0, 4));
    if (a < AÑO_INI || a > AÑO_FIN) continue;
    if (!porSim.has(m[1])) porSim.set(m[1], []);
    porSim.get(m[1]).push(m[2]);
  }
  const pedidos = process.argv.slice(4);
  const tickers = (pedidos.length ? pedidos : [...porSim.keys()]).sort();

  console.log(`\n## Interés abierto ANCHO · ${AÑO_INI}-${AÑO_FIN} · ${tickers.length} tickers\n`);
  for (const t of tickers) {
    const dias = (porSim.get(t) ?? []).sort();
    if (!dias.length) { console.log(`  ${t}: sin cadenas de las que sacar el calendario`); continue; }
    const faltan = dias.filter((d) => !existsSync(`${ODIR}/${t}_d${d}.json`));
    if (!faltan.length) { console.log(`  ${t}: ${dias.length} días, todos en caché`); continue; }
    const t0 = Date.now();
    let ok = 0, n = 0;
    await pMap(faltan, CONC, async (d) => {
      if (await bajarDia(t, d)) ok++;
      if (++n % 200 === 0) {
        const seg = (Date.now() - t0) / 1000;
        process.stdout.write(`\r  ${t}: ${n}/${faltan.length} · ${ok} con datos · quedan ~${(((faltan.length - n) * seg) / n / 60).toFixed(0)} min   `);
      }
    });
    console.log(`\r  ${t}: ${ok}/${faltan.length} bajados · ${((Date.now() - t0) / 60000).toFixed(1)} min          `);
  }

  // VALIDACIÓN: no basta con contar ficheros. Se abre uno y se mira hasta dónde llegan los strikes.
  console.log(`\n### Validación — ¿llega de verdad a los strikes lejanos?\n`);
  for (const t of tickers) {
    const fs = readdirSync(ODIR).filter((f) => f.startsWith(`${t}_d`));
    if (!fs.length) { console.log(`   ${t.padEnd(5)} SIN FICHEROS`); continue; }
    const j = JSON.parse(readFileSync(`${ODIR}/${fs[Math.floor(fs.length / 2)]}`, "utf8"));
    let minK = Infinity, maxK = 0, nC = 0;
    for (const g of Object.values(j)) for (const k of Object.keys(g)) {
      const K = Number(k.slice(0, -2));
      if (K < minK) minK = K;
      if (K > maxK) maxK = K;
      nC++;
    }
    console.log(`   ${t.padEnd(5)} ${String(fs.length).padStart(5)} días · ${String(nC).padStart(5)} contratos en el día del medio · strikes ${minK}–${maxK}`);
  }
})();
