// SIGMA-CREDITO · FASE 1 — sacar de las cadenas lo que regimen-filas.json NO tiene.
//
// regimen-filas.json ya trae pl, credito, sigma y el spot de las 11:00. Lo que NO trae es la
// FORMA de la cadena: la IV del dinero contra la de las alas (la sonrisa), el sesgo put/call, y
// el crédito partido por lados. Esta pasada lo saca UNA VEZ y lo deja en caché.
//
// El lector es COPIA del de scripts/regimen-18.mjs (misma hora, mismos strikes, mismo `cerca`).
// Si esta pasada reconstruye un crédito distinto del que ya estaba guardado, se PARA: significa
// que el lector se ha separado del original y todo lo que midiera después sería otra cosa.
//
// TODO se lee a las 11:00 ET. Nada de este fichero mira más allá.

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const DIR = "scripts/cache-theta/gex-2026";
const HORA = "11:00", ALA = 50, SEP = 25, COMM = 0.03;
const SALIDA = "scripts/cola-sigcred-cadena.json";

const filasBase = JSON.parse(readFileSync("scripts/regimen-filas.json", "utf8"));
filasBase.sort((a, b) => a.fecha.localeCompare(b.fecha));

function leerHora(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const cols = ["strike", "timestamp", "bid", "ask", "implied_vol", "iv_error", "underlying_price"];
  const idx = cols.map((c) => cab.indexOf(c));
  if (idx.some((x) => x < 0)) throw new Error(`faltan columnas ${cols.filter((c, i) => idx[i] < 0)} en ${f}`);
  const [iK, iT, iB, iA, iV, iE, iU] = idx;
  const out = [];
  let spot = 0;
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(",");
    if (String(c[iT]).slice(11, 16) !== HORA) continue;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]);
    const iv = Number(c[iV]), err = Number(c[iE]), sp = Number(c[iU]);
    if (sp > 0) spot = sp;
    if (K > 0 && bid >= 0 && ask > 0) out.push({ K, bid, ask, iv, err });
  }
  return out.length && spot > 0 ? { filas: out, spot } : null;
}
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));
// IV utilizable: implied_vol > 0 y iv_error sin la marca de fallo (-0,99999 = no convergió).
const ivOk = (o) => (o && o.iv > 0 && o.iv < 5 && o.err > -0.5 ? o.iv * 100 : null);

const salida = {};
let malCredito = 0, sinDato = 0;
const ejemplosMal = [];
for (let i = 0; i < filasBase.length; i++) {
  const b = filasBase[i];
  if (i % 100 === 0) console.log(`   ${i}/${filasBase.length} · ${b.fecha}`);
  const C = leerHora(b.fecha, "C"), P = leerHora(b.fecha, "P");
  if (!C || !P) { sinDato++; continue; }
  const sp11 = C.spot;
  if (Math.abs(sp11 - b.sp11) > 0.01) { malCredito++; ejemplosMal.push(`${b.fecha} spot ${sp11} vs ${b.sp11}`); continue; }

  const sc = cerca(C.filas, sp11 + SEP);            // call vendida
  const sp = cerca(P.filas, sp11 - SEP);            // put vendida
  const lc = cerca(C.filas, sc.K + ALA);            // ala call comprada
  const lp = cerca(P.filas, sp.K - ALA);            // ala put comprada
  if (lc.K <= sc.K || lp.K >= sp.K) { sinDato++; continue; }

  const credCall = sc.bid - lc.ask, credPut = sp.bid - lp.ask;
  const cred = credCall + credPut;

  // ── GUARDIÁN: el crédito reconstruido tiene que ser el que ya estaba guardado ──
  if (Math.abs(cred * 100 - b.credito) > 0.5) {
    malCredito++;
    if (ejemplosMal.length < 5) ejemplosMal.push(`${b.fecha} crédito ${(cred * 100).toFixed(2)} vs ${b.credito.toFixed(2)}`);
    continue;
  }

  const atmC = cerca(C.filas, sp11), atmP = cerca(P.filas, sp11);
  salida[b.fecha] = {
    sp11,
    kSC: sc.K, kSP: sp.K, kLC: lc.K, kLP: lp.K,
    credCall: credCall * 100, credPut: credPut * 100,
    // horquilla pagada en las cuatro patas (dato de contexto, no señal)
    horquilla: ((sc.ask - sc.bid) + (sp.ask - sp.bid) + (lc.ask - lc.bid) + (lp.ask - lp.bid)) * 100,
    ivAtmC: ivOk(atmC), ivAtmP: ivOk(atmP),
    ivSC: ivOk(sc), ivSP: ivOk(sp),
    ivLC: ivOk(lc), ivLP: ivOk(lp),
    comision: 8 * COMM,
  };
}

console.log(`\n días con cadena buena: ${Object.keys(salida).length} de ${filasBase.length}`);
console.log(` sin fichero o sin alas: ${sinDato}`);
console.log(` DESCUADRE contra regimen-filas.json: ${malCredito}`);
if (ejemplosMal.length) console.log("  ejemplos: " + ejemplosMal.join(" · "));
if (malCredito > 0) throw new Error("El lector NO reproduce el crédito ya guardado. Se para aquí.");

// cuántas IV se pierden: se DICE, no se rellena
const campos = ["ivAtmC", "ivAtmP", "ivSC", "ivSP", "ivLC", "ivLP"];
const vals = Object.values(salida);
console.log("\n IV no utilizables por campo (implied_vol<=0 o iv_error de fallo):");
for (const c of campos) console.log(`   ${c}: ${vals.filter((v) => v[c] == null).length} de ${vals.length}`);

writeFileSync(SALIDA, JSON.stringify(salida), "utf8");
console.log(`\n guardado en ${SALIDA}`);
