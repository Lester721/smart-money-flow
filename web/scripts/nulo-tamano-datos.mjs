// NULO · PASO 0 — la tabla de días con VARIOS ANCHOS DE ALA y con el LADO CONTRARIO.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/nulo-tamano-datos.mjs
//
// POR QUÉ. El informe recomienda "1 contrato del cóndor ±25 / alas 50" y descarta el filtro de
// amplitud diciendo que "operar menos días se consigue gratis bajando el tamaño". Eso NO se midió.
// El control tonto que pide el encargo es exactamente ése: la misma reducción de exposición
// conseguida con MENOS TAMAÑO en vez de con la regla. Para un spread de riesgo definido, "menos
// tamaño" es el ANCHO DEL ALA (el colateral y la pérdida máxima son el ancho × 100).
//
// Además se calcula el LADO CONTRARIO (COMPRAR el cóndor en vez de venderlo), que es una estrategia
// mala por construcción: paga la horquilla en las cuatro patas dos veces. Sirve de nulo para la
// pregunta "¿la cuenta aguanta?": si el lado contrario TAMBIÉN aguanta, esa pregunta no distingue.
//
// Mismas reglas de siempre: bid al vender, ask al comprar, $0,03 por pata × 8 patas, nada se rellena.

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";

const DIR = "scripts/cache-theta/gex-2026";
const HORA = "11:00", COMM = 0.03;
const ALAS = [10, 20, 25, 30, 50];
const DIST = [25, 30];

function leerDia(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const idx = ["strike", "timestamp", "bid", "ask", "underlying_price"].map((c) => cab.indexOf(c));
  if (idx.some((x) => x < 0)) throw new Error("faltan columnas en " + f);
  const [iK, iT, iB, iA, iU] = idx;
  const enHora = [];
  let cierre = 0, hFin = "";
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(",");
    const h = String(c[iT]).slice(11, 16), sp = Number(c[iU]);
    if (sp > 0 && h >= hFin) { hFin = h; cierre = sp; }
    if (h !== HORA) continue;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]);
    if (K > 0 && bid >= 0 && ask > 0) enHora.push({ K, bid, ask, spot: sp });
  }
  return enHora.length ? { filas: enHora, cierre } : null;
}
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));

const fechas = [...new Set(readdirSync(DIR).map((f) => (f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/) || [])[1]).filter(Boolean))].sort();
console.log(`${fechas.length} sesiones`);

const out = [];
let sinFichero = 0, sinCierre = 0, sinPatas = 0;

for (const fecha of fechas) {
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P) { sinFichero++; continue; }
  if (!(C.cierre > 0)) { sinCierre++; continue; }
  const sp11 = C.filas[0].spot;
  if (!(sp11 > 0)) { sinCierre++; continue; }
  const S = C.cierre;

  const fila = { fecha, ano: Number(fecha.slice(0, 4)), sp11, cierre: S, g: {} };
  let roto = false;

  for (const dist of DIST) {
    const cC = cerca(C.filas, sp11 + dist), pC = cerca(P.filas, sp11 - dist);
    for (const ala of ALAS) {
      const cL = cerca(C.filas, cC.K + ala), pL = cerca(P.filas, pC.K - ala);
      if (cL.K <= cC.K || pL.K >= pC.K) { roto = true; continue; }
      // ancho REAL de cada vertical (los strikes existen en la rejilla, puede no ser exactamente `ala`)
      const wC = cL.K - cC.K, wP = pC.K - pL.K;
      const cred = cC.bid + pC.bid - cL.ask - pL.ask;     // VENDER el cóndor: bid al vender, ask al comprar
      const deb = cC.ask + pC.ask - cL.bid - pL.bid;      // COMPRAR el cóndor: ask al comprar, bid al vender
      const perdC = Math.min(Math.max(S - cC.K, 0), wC);
      const perdP = Math.min(Math.max(pC.K - S, 0), wP);
      const k = `d${dist}a${ala}`;
      if (!(cred > 0)) { roto = true; continue; }
      fila.g[k] = {
        pl: (cred - perdC - perdP) * 100 - 8 * COMM,       // VENDIDO (lo del informe)
        plInv: (perdC + perdP - deb) * 100 - 8 * COMM,     // COMPRADO (el lado contrario)
        cred: cred * 100,
        col: Math.max(wC, wP) * 100,
      };
    }
  }
  if (roto || Object.keys(fila.g).length !== DIST.length * ALAS.length) { sinPatas++; continue; }
  out.push(fila);
}

// las MISMAS fechas y el MISMO filtro que usa el informe, para que la comparación valga
const ref = JSON.parse(readFileSync("scripts/cuanto-aguanta-dias.json", "utf8")).dias;
const opera = new Map(ref.map((d) => [d.fecha, d.opera]));
const usables = out.filter((d) => opera.has(d.fecha)).map((d) => ({ ...d, opera: opera.get(d.fecha) }));

writeFileSync("scripts/nulo-tamano-dias.json", JSON.stringify({ HORA, COMM, ALAS, DIST, dias: usables }));
console.log(`descartes: sin fichero ${sinFichero} · sin cierre ${sinCierre} · sin las 10 geometrías ${sinPatas}`);
console.log(`${out.length} días con las 10 geometrías · ${usables.length} en las MISMAS fechas que el informe (${ref.length})`);
const faltan = ref.filter((d) => !out.find((x) => x.fecha === d.fecha)).map((d) => d.fecha);
if (faltan.length) console.log(`OJO — ${faltan.length} fechas del informe se pierden aquí: ${faltan.slice(0, 10).join(", ")}`);
console.log(`${usables[0].fecha} → ${usables[usables.length - 1].fecha}`);
