// ¿Hace falta Black-Scholes para el GEX? — la objeción de Lester, contestada con datos.
//
// Lo que mató a EVA fue usar BS para GENERAR el precio de la opción alimentándolo con la
// volatilidad realizada. Eso pone la prima extra en cero por construcción: das por hecho que la
// opción vale exactamente lo que el subyacente va a hacer. El +3,20% se volvió −2,53% con
// precios reales.
//
// Aquí BS haría otra cosa: convertir una IV REAL de mercado en gamma. No inventa ningún precio.
// Pero la objeción es justa, así que se comprueba: la gamma también se puede sacar SIN modelo,
// como la segunda diferencia de los precios REALES entre strikes contiguos.
//
//     gamma(K) ≈ [P(K+h) − 2·P(K) + P(K−h)] / h²
//
// Si las dos coinciden, el modelo no está haciendo ningún trabajo y la objeción queda cerrada.
// Si no coinciden, usamos la de mercado y BS no entra.

import fs from 'node:fs';
const S = process.argv[2];

const lin = fs.readFileSync(`${S}/iv_5m.csv`, 'utf8').split('\n');
const cab = lin[0].split(',');
const iK = cab.indexOf('strike'), iT = cab.indexOf('timestamp'), iM = cab.indexOf('midpoint'),
      iIV = cab.indexOf('implied_vol'), iU = cab.indexOf('underlying_price');

// una foto: todos los strikes a una hora concreta
const HORA = '11:00';
const filas = [];
for (let n = 1; n < lin.length; n++) {
  const c = lin[n].split(','); if (c.length < cab.length) continue;
  if (c[iT].slice(11, 16) !== HORA) continue;
  const K = +c[iK], mid = +c[iM], iv = +c[iIV], U = +c[iU];
  if (!(mid > 0) || !(iv > 0.01) || !(U > 0)) continue;
  filas.push({ K, mid, iv, U });
}
filas.sort((a, b) => a.K - b.K);
const U = filas[0]?.U;
console.log(`SPY 0DTE del 2026-08-07 a las ${HORA}. Subyacente ${U}. ${filas.length} strikes con precio.\n`);

// --- A. gamma con Black-Scholes, usando la IV REAL de mercado ---
const N = x => { const t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p; };
const phi = x => 0.3989423 * Math.exp(-x * x / 2);
// vencimiento: cierra a las 16:00 del mismo día -> 5 horas desde las 11:00
const T = (5 / 24) / 365;
const gammaBS = (S0, K, iv) => {
  const d1 = (Math.log(S0 / K) + (iv * iv / 2) * T) / (iv * Math.sqrt(T));
  return phi(d1) / (S0 * iv * Math.sqrt(T));
};

// --- B. gamma SIN modelo: segunda diferencia de los precios reales entre strikes ---
const gammaMercado = (i) => {
  if (i === 0 || i === filas.length - 1) return null;
  const a = filas[i - 1], b = filas[i], c = filas[i + 1];
  const h1 = b.K - a.K, h2 = c.K - b.K;
  if (Math.abs(h1 - h2) > 0.01) return null;      // solo si la rejilla es uniforme
  return (c.mid - 2 * b.mid + a.mid) / (h1 * h1);
};

console.log('strike    precio    IV      gamma BS     gamma de MERCADO    diferencia');
const pares = [];
for (let i = 0; i < filas.length; i++) {
  const f = filas[i];
  if (f.K < U * 0.97 || f.K > U * 1.03) continue;   // la zona que importa
  const gm = gammaMercado(i); if (gm == null || gm <= 0) continue;
  const gb = gammaBS(f.U, f.K, f.iv);
  pares.push({ K: f.K, gb, gm });
  console.log(`${f.K.toFixed(0).padStart(6)}  ${f.mid.toFixed(2).padStart(8)}  ${(f.iv * 100).toFixed(1).padStart(5)}%  ${gb.toFixed(5).padStart(10)}   ${gm.toFixed(5).padStart(14)}   ${((gm / gb - 1) * 100).toFixed(0).padStart(6)}%`);
}

if (pares.length > 2) {
  const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
  const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
  const A = pares.map(p => p.gb), B = pares.map(p => p.gm);
  const corr = A.reduce((s, _, i) => s + (A[i] - mean(A)) * (B[i] - mean(B)), 0) / ((A.length - 1) * sd(A) * sd(B));
  const rat = pares.map(p => p.gm / p.gb).sort((a, b) => a - b);
  console.log(`\ncorrelación entre las dos: ${corr.toFixed(3)}`);
  console.log(`razón mercado/BS, mediana: ${rat[Math.floor(rat.length / 2)].toFixed(3)}`);
  console.log(`\n-> ${corr > 0.95 ? 'COINCIDEN: Black-Scholes no está haciendo trabajo aquí, solo traduce la IV real.' : 'NO coinciden lo suficiente: usar la de mercado y dejar BS fuera.'}`);
}
