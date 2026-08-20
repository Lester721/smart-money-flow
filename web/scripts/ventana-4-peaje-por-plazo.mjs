// VENTANA CORTA · 4 — EL PUENTE HACIA EL 0-2 DTE.
//
// El flujo de MS no tiene 0-2 DTE (borrados por su archivo). Pero las CADENAS de ThetaData SÍ los
// tienen: cada fichero {TICKER}_d{día}.json trae todas las expiraciones, incluida la del mismo día.
// Así que la pregunta que Lester hace —"si el efecto dura horas, ¿se lo come el peaje?"— SÍ se
// puede contestar con datos reales para el plazo 0-2 DTE, aunque la señal no se pueda probar ahí.
//
// Se mide, sobre bid/ask REALES:
//   · el peaje: (ask−bid)/ask por DTE, cerca del dinero y fuera del dinero
//   · el tamaño del movimiento: |cambio del punto medio| de un cierre al siguiente, por DTE
// La comparación de los dos dice cuánto tiene que acertar la señal para pagar el peaje.

import { cadena, cierres, calendario, media, pct } from "./ventana-lib.mjs";
import { readdirSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const TICKERS = [...new Set(readdirSync(CDIR).filter((f) => /_d\d{8}\.json$/.test(f)).map((f) => f.split("_d")[0]))].sort();
const cal = calendario().filter((d) => d >= "20260422" && d <= "20260806");
console.log(`\n## Peaje real de la horquilla por plazo · ${TICKERS.length} tickers · ${cal.length} días (${cal[0]}→${cal[cal.length - 1]})\n`);

const BUCKETS = [[0, 0, "0 DTE"], [1, 2, "1-2 DTE"], [3, 5, "3-5"], [6, 10, "6-10"], [11, 20, "11-20"], [21, 45, "21-45"], [46, 120, "46-120"], [121, 9999, ">120"]];
const bucket = (d) => BUCKETS.find(([a, b]) => d >= a && d <= b)?.[2] ?? null;
const iso = (a) => `${a.slice(0, 4)}-${a.slice(4, 6)}-${a.slice(6, 8)}`;
const dteDe = (e, d) => Math.round((new Date(`${iso(e)}T00:00:00Z`) - new Date(`${iso(d)}T00:00:00Z`)) / 864e5);

// horquilla por bucket × distancia; y precio medio del contrato (para ver el "billete barato")
const acc = new Map();   // clave -> {h:[], prima:[]}
const add = (k, h, prima) => { if (!acc.has(k)) acc.set(k, { h: [], prima: [] }); const a = acc.get(k); a.h.push(h); a.prima.push(prima); };
// movimiento de un cierre al siguiente, mismo contrato
const mov = new Map();   // bucket -> []

let paresContrato = 0;
for (const t of TICKERS) {
  const cl = cierres(t);
  if (!cl) { console.log(`  ${t}: sin cierres — no se puede saber la distancia al dinero, se salta`); continue; }
  for (let i = 0; i < cal.length; i++) {
    const d = cal[i], S = cl[d];
    if (!S) continue;
    const c = cadena(t, d);
    if (!c) continue;
    const cSig = i + 1 < cal.length ? cadena(t, cal[i + 1]) : null;
    for (const exp of Object.keys(c)) {
      const dte = dteDe(exp, d), b = bucket(dte);
      if (b === null || dte < 0) continue;
      for (const [ks, v] of Object.entries(c[exp])) {
        const [kStr, tipo] = ks.split("|");
        const K = Number(kStr);
        const [bid, ask] = v;
        if (!(bid > 0) || !(ask > 0)) continue;
        const dist = (tipo === "C" ? K / S - 1 : 1 - K / S);      // + = fuera del dinero
        const zona = Math.abs(dist) <= 0.01 ? "ATM ±1%" : (dist > 0.01 && dist <= 0.05 ? "OTM 1-5%" : (dist > 0.05 && dist <= 0.15 ? "OTM 5-15%" : null));
        if (!zona) continue;
        add(`${b}|${zona}`, (ask - bid) / ask, (bid + ask) / 2 * 100);
        if (cSig && cSig[exp] && cSig[exp][ks] && zona === "ATM ±1%") {
          const [b2, a2] = cSig[exp][ks];
          if (b2 > 0 && a2 > 0) {
            if (!mov.has(b)) mov.set(b, []);
            mov.get(b).push(Math.abs(((b2 + a2) / 2) / ((bid + ask) / 2) - 1));
            paresContrato++;
          }
        }
      }
    }
  }
}

console.log(`\n### Peaje = (ask − bid) / ask, sobre cotizaciones reales de cierre\n`);
console.log(`  ${"plazo".padEnd(9)} ${"zona".padEnd(10)} ${"n".padStart(8)}  ${"MEDIANA".padStart(8)} ${"media".padStart(8)} ${"p75".padStart(8)}   prima mediana`);
for (const [, , b] of BUCKETS) for (const z of ["ATM ±1%", "OTM 1-5%", "OTM 5-15%"]) {
  const a = acc.get(`${b}|${z}`);
  if (!a || a.h.length < 50) continue;
  console.log(`  ${b.padEnd(9)} ${z.padEnd(10)} ${String(a.h.length).padStart(8)}  ${(100 * pct(a.h, 0.5)).toFixed(2).padStart(7)}% ${(100 * media(a.h)).toFixed(2).padStart(7)}% ${(100 * pct(a.h, 0.75)).toFixed(2).padStart(7)}%   $${pct(a.prima, 0.5).toFixed(0)}`);
}

console.log(`\n### Tamaño del movimiento de un cierre al siguiente (ATM, punto medio, ${paresContrato} pares de contrato)\n`);
console.log(`  ${"plazo".padEnd(9)} ${"n".padStart(8)}  |mov| mediana   |mov| media   peaje mediana   ¿tapa el peaje la MEDIANA del movimiento?`);
for (const [, , b] of BUCKETS) {
  const m = mov.get(b), a = acc.get(`${b}|ATM ±1%`);
  if (!m || m.length < 50 || !a) continue;
  const pe = pct(a.h, 0.5), mm = pct(m, 0.5);
  console.log(`  ${b.padEnd(9)} ${String(m.length).padStart(8)}  ${(100 * mm).toFixed(2).padStart(11)}%  ${(100 * media(m)).toFixed(2).padStart(11)}%  ${(100 * pe).toFixed(2).padStart(12)}%   ${mm > pe ? "sí, ×" + (mm / pe).toFixed(1) : "NO"}`);
}

// ¿Y qué mueve un ATM 0-2DTE cuando el subyacente se mueve lo típico? — dato real, no modelo:
console.log(`\n### Lo que hace falta acertar: el movimiento del punto medio tiene que superar el peaje de IDA Y VUELTA`);
for (const [, , b] of BUCKETS) {
  const a = acc.get(`${b}|ATM ±1%`);
  if (!a || a.h.length < 50) continue;
  console.log(`  ${b.padEnd(9)} peaje mediana ${(100 * pct(a.h, 0.5)).toFixed(2)}%  →  para empatar comprando al ask y vendiendo al bid, el medio tiene que subir ${(100 * pct(a.h, 0.5)).toFixed(2)}% en la ventana`);
}
