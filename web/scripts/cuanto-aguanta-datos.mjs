// ¿QUÉ AGUANTA SU CUENTA? · PASO 0 — la tabla de días, UNA vez, con precios reales.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/cuanto-aguanta-datos.mjs
//
// Para cada sesión con cadena 0DTE de SPXW en scripts/cache-theta/gex-2026:
//   · precio del índice a las 11:00 (el momento de decidir)
//   · cierre real de la sesión (el mismo fichero, última marca con precio > 0)
//   · straddle del dinero a las 11:00 (punto medio de call y put del strike más cercano)
//   · P&L REAL de las tres geometrías del debate, cuatro patas, bid al vender y ask al comprar:
//         A · cóndor de hoy      ±25 puntos · alas 50
//         B · filtro de amplitud ±30 puntos · alas 50   (el filtro se aplica luego)
//         C · por straddle       2,3 × straddle · alas 30
//   · MA20 y MA50 con cierres ESTRICTAMENTE anteriores (nada de hoy entra en la decisión)
//
// Comisión: $0,03 por pata × 8 patas (abrir y cerrar/expirar) — Robinhood.
// NO se estima nada: si una pata no tiene precio, el día se marca y se cuenta, no se rellena.

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";

const DIR = "scripts/cache-theta/gex-2026";
const HORA = "11:00", COMM = 0.03;
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);

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
console.log(`${fechas.length} sesiones con fichero de calls en ${DIR}`);

const dias = [];
let sinFichero = 0, sinCierre = 0, sinCredito = { A: 0, B: 0, C: 0 };

for (const fecha of fechas) {
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P) { sinFichero++; continue; }
  if (!(C.cierre > 0)) { sinCierre++; continue; }
  const sp11 = C.filas[0].spot;
  if (!(sp11 > 0)) { sinCierre++; continue; }

  const kA = cerca(C.filas, sp11), pA = P.filas.find((x) => x.K === kA.K) ?? cerca(P.filas, sp11);
  const straddle = (kA.bid + kA.ask) / 2 + (pA.bid + pA.ask) / 2;

  /** Cóndor de hierro a distancia `dist` con alas de `ala`. Precios reales en las cuatro patas. */
  const condor = (dist, ala) => {
    if (!(dist > 0)) return null;
    const cC = cerca(C.filas, sp11 + dist), pC = cerca(P.filas, sp11 - dist);
    const cL = cerca(C.filas, cC.K + ala), pL = cerca(P.filas, pC.K - ala);
    if (cL.K <= cC.K || pL.K >= pC.K) return null;
    const cred = cC.bid + pC.bid - cL.ask - pL.ask;         // vender al BID, comprar al ASK
    if (!(cred > 0)) return null;
    const S = C.cierre;
    const perdC = Math.min(Math.max(S - cC.K, 0), cL.K - cC.K);
    const perdP = Math.min(Math.max(pC.K - S, 0), pC.K - pL.K);
    return {
      pl: (cred - perdC - perdP) * 100 - 8 * COMM,
      cred: cred * 100,
      colateral: ala * 100,                                  // una vertical al ancho completo
      kc: cC.K, kp: pC.K,
      rompe: (S > cC.K || S < pC.K) ? 1 : 0,
      distC: cC.K - sp11, distP: sp11 - pC.K,
    };
  };

  const A = condor(25, 50);
  const B = condor(30, 50);
  const Cc = straddle > 0 ? condor(2.3 * straddle, 30) : null;
  if (!A) sinCredito.A++;
  if (!B) sinCredito.B++;
  if (!Cc) sinCredito.C++;
  if (!A || !B || !Cc) continue;   // el día entra sólo si las TRES son operables: mismas fechas

  dias.push({
    fecha, ano: Number(fecha.slice(0, 4)), sp11, cierre: C.cierre, straddle,
    A, B, C: Cc,
  });
}

// medias móviles con cierres ESTRICTAMENTE anteriores
for (let i = 0; i < dias.length; i++) {
  if (i < 50) { dias[i].ma20 = null; dias[i].ma50 = null; dias[i].opera = null; continue; }
  const c = dias.slice(i - 50, i).map((x) => x.cierre);
  dias[i].ma20 = media(c.slice(-20));
  dias[i].ma50 = media(c);
  dias[i].opera = dias[i].sp11 >= dias[i].ma20 && dias[i].sp11 >= dias[i].ma50;
}

const usables = dias.filter((d) => d.opera !== null);
writeFileSync("scripts/cuanto-aguanta-dias.json", JSON.stringify({ HORA, COMM, dias: usables }));
console.log(`descartes: sin fichero ${sinFichero} · sin cierre/spot ${sinCierre} · sin crédito A ${sinCredito.A} B ${sinCredito.B} C ${sinCredito.C}`);
console.log(`${dias.length} días con las tres geometrías · ${usables.length} usables tras la ventana de 50 de las medias`);
console.log(`${usables[0].fecha} → ${usables[usables.length - 1].fecha} · sobre MA20 y MA50: ${usables.filter((d) => d.opera).length}`);
