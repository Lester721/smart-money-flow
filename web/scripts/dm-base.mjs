// DÍAS MALOS · BASE — reprecia el cóndor a cualquier geometría (±k·sigma, ala W) con bid/ask reales.
// Fuente: scripts/mal-cadenas.json (cadena entera de las 11:00, ±260 pts) + scripts/mal-dias.json.
import { readFileSync, writeFileSync } from "node:fs";

const COMM = 0.03, PATAS = 8;                    // conservador: 8 patas (abrir+cerrar). Con 4 = +$30/año.
const dias = JSON.parse(readFileSync("scripts/mal-dias.json", "utf8"));
const cad  = JSON.parse(readFileSync("scripts/mal-cadenas.json", "utf8"));

const cerca = (arr, o) => arr.reduce((a, b) => (Math.abs(b[0] - o) < Math.abs(a[0] - o) ? b : a));

// ── último día NEGOCIADO de cada mes (el mes final de la muestra no cuenta: está incompleto)
const porMes = new Map();
for (const d of dias) { const m = d.fecha.slice(0, 7); if (!porMes.has(m) || porMes.get(m) < d.fecha) porMes.set(m, d.fecha); }
const mesFinal = dias[dias.length - 1].fecha.slice(0, 7);
const finMes = new Set([...porMes.entries()].filter(([m]) => m !== mesFinal).map(([, f]) => f));

// ── geometrías: distancia en sigmas del resto de sesión, ala en PUNTOS
const KS = [0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90, 1.00, 1.20];
const ALAS = [10, 20, 25, 30, 35, 40, 50];
const variantes = [];
for (const k of KS) for (const w of ALAS) variantes.push({ id: `s${k.toFixed(2)}_a${w}`, k, w, tipo: "sigma" });
variantes.push({ id: "p25_a50", k: 25, w: 50, tipo: "puntos" });   // EL CÓNDOR DE HOY
variantes.push({ id: "p25_a30", k: 25, w: 30, tipo: "puntos" });

function precio(f, v) {
  const c = cad[f.fecha]; if (!c) return null;
  const dist = v.tipo === "sigma" ? v.k * f.sigma : v.k;
  if (!(dist > 0)) return null;
  const cC = cerca(c.C, f.sp11 + dist), pC = cerca(c.P, f.sp11 - dist);
  const cL = cerca(c.C, cC[0] + v.w), pL = cerca(c.P, pC[0] - v.w);
  if (cL[0] <= cC[0] || pL[0] >= pC[0]) return null;
  if (cC[0] <= f.sp11 || pC[0] >= f.sp11) return null;          // el corto tiene que estar fuera del dinero
  const cred = cC[1] + pC[1] - cL[2] - pL[2];                    // BID lo vendido, ASK lo comprado
  if (!(cred > 0)) return null;
  const anchoC = cL[0] - cC[0], anchoP = pC[0] - pL[0];
  const perdC = Math.min(Math.max(f.cierre - cC[0], 0), anchoC);
  const perdP = Math.min(Math.max(pC[0] - f.cierre, 0), anchoP);
  const riesgo = Math.max(anchoC, anchoP) * 100 - cred * 100;    // colateral aproximado = ancho pleno
  return {
    pl: (cred - perdC - perdP) * 100 - PATAS * COMM,
    credito: cred * 100, colateral: Math.max(anchoC, anchoP) * 100,
    kcC: cC[0], kpC: pC[0], distC: cC[0] - f.sp11, distP: f.sp11 - pC[0],
    rompe: (f.cierre > cC[0] || f.cierre < pC[0]) ? 1 : 0, riesgo,
  };
}

const salida = { meta: { comisionPatas: PATAS, comisionPorPata: COMM }, variantes: {}, dias: [] };
for (const f of dias) {
  salida.dias.push({
    fecha: f.fecha, ano: +f.fecha.slice(0, 4), sp11: f.sp11, cierre: f.cierre, sigma: f.sigma, iv: f.iv,
    mov: Math.abs(f.cierre - f.sp11), movSig: Math.abs(f.cierre - f.sp11) / f.sigma,
    dir: Math.sign(f.cierre - f.sp11), finMes: finMes.has(f.fecha) ? 1 : 0,
    rangoMan: (f.maxM - f.minM) / f.sigma, dow: f.dow,
  });
}
for (const v of variantes) {
  const serie = [];
  let nulos = 0;
  for (const f of dias) { const r = precio(f, v); if (!r) { nulos++; serie.push(null); } else serie.push(r); }
  salida.variantes[v.id] = { ...v, nulos, serie };
  console.log(`${v.id.padEnd(12)} nulos=${nulos}`);
}
writeFileSync("scripts/dm-grid.json", JSON.stringify(salida), "utf8");
console.log("## guardado scripts/dm-grid.json ·", salida.dias.length, "días ·", variantes.length, "variantes · finMes:", finMes.size);
