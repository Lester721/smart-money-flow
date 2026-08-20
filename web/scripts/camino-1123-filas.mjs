// CAMINO · PASO 1 — reconstruir el DÍA ENTERO de los 1.123 días, con precios reales de salida.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/camino-1123-filas.mjs
//
// scripts/anatomia3-camino.json sólo tiene 653 días (2024-2026) y sólo guarda el subyacente.
// Aquí hace falta más, porque el encargo pregunta si "a las 13:00 ya se sabe" — y para responder
// eso hay que saber también CUÁNTO COSTARÍA SALIR a las 13:00. Ese precio existe: la cadena de
// las 13:00 trae bid y ask de los mismos cuatro strikes. Se paga ASK para recomprar lo vendido y
// se cobra BID por lo comprado. Nunca punto medio.
//
// De cada día se guarda:
//   h[]      marcas de 5 min con subyacente > 0 (la de 09:30 viene a 0,0 y NO se rellena)
//   sp[]     subyacente en cada marca
//   i11      índice de la marca de las 11:00 dentro de h[]
//   KC/KP    strikes cortos (los más cercanos a spot±25 a las 11:00)
//   KCL/KPL  alas (los más cercanos a corto±50)
//   cred     crédito por acción cobrado a las 11:00: bid+bid−ask−ask
//   sal[]    coste de CERRAR el cóndor en cada marca (ask+ask−bid−bid), null si falta alguna pata
//   iv[]     implícita del strike más cercano al dinero en cada marca (null si no hay)
//   cierre   último subyacente > 0 del día

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";

const DIR = "scripts/cache-theta/gex-2026";
const OUT = "scripts/camino-1123-filas.json";
const HORA = "11:00";
const DIST = 25;   // distancia del corto al spot
const ALA = 50;    // anchura de las alas

const fechas = [...new Set(
  readdirSync(DIR).map((f) => (f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/) || [])[1]).filter(Boolean),
)].sort();
if (process.env.LIMITE) fechas.splice(Number(process.env.LIMITE));   // sólo para probar el lector
console.log(`## ${fechas.length} días de cadena en ${DIR}`);

/** Campo n-ésimo (0-based) de una línea CSV sin construir el array entero. */
function campo(L, n) {
  let ini = 0;
  for (let k = 0; k < n; k++) {
    ini = L.indexOf(",", ini) + 1;
    if (ini === 0) return "";
  }
  const fin = L.indexOf(",", ini);
  return fin < 0 ? L.slice(ini) : L.slice(ini, fin);
}

const C_STRIKE = 2, C_TS = 4, C_BID = 5, C_MID = 7, C_IV = 8, C_ASK = 9;

/** Primera pasada de un fichero: subyacente por marca, cadena de las 11:00, IV del dinero. */
function pasadaA(path) {
  const lin = readFileSync(path, "utf8").split("\n");
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  for (const [i, nom] of [[C_STRIKE, "strike"], [C_TS, "timestamp"], [C_BID, "bid"], [C_MID, "midpoint"], [C_IV, "implied_vol"], [C_ASK, "ask"]])
    if (cab[i] !== nom) throw new Error(`${path}: columna ${i} es "${cab[i]}", se esperaba "${nom}"`);

  const spot = new Map(), chain11 = [], ivAtm = new Map();
  for (let j = 1; j < lin.length; j++) {
    const L = lin[j];
    if (L.length < 30) continue;
    const p = L.lastIndexOf(",");
    const up = Number(L.slice(p + 1));
    if (!(up > 0)) continue;                       // 09:30 viene a 0,0 — no se rellena
    const q = L.lastIndexOf(",", p - 1);
    const h = L.slice(q + 12, q + 17);             // "HH:MM" del underlying_timestamp
    spot.set(h, up);
    const c1 = L.indexOf(","), c2 = L.indexOf(",", c1 + 1), c3 = L.indexOf(",", c2 + 1);
    const K = Number(L.slice(c2 + 1, c3));
    if (!(K > 0)) continue;
    if (h === HORA) {
      const bid = Number(campo(L, C_BID)), ask = Number(campo(L, C_ASK));
      if (bid >= 0 && ask > 0) chain11.push({ K, bid, ask });
    }
    const d = Math.abs(K - up);
    if (d <= 60) {
      const cur = ivAtm.get(h);
      if (!cur || d < cur.d) {
        const iv = Number(campo(L, C_IV));
        if (iv > 0) ivAtm.set(h, { d, iv });
      }
    }
  }
  return { spot, chain11, ivAtm, lin };
}

/** Segunda pasada: bid/ask de DOS strikes concretos en todas las marcas. */
function pasadaB(lin, k0, k1) {
  const m0 = new Map(), m1 = new Map();
  for (let j = 1; j < lin.length; j++) {
    const L = lin[j];
    if (L.length < 30) continue;
    const c1 = L.indexOf(","), c2 = L.indexOf(",", c1 + 1), c3 = L.indexOf(",", c2 + 1);
    const K = Number(L.slice(c2 + 1, c3));
    if (K !== k0 && K !== k1) continue;
    const h = campo(L, C_TS).slice(11, 16);
    const v = { b: Number(campo(L, C_BID)), a: Number(campo(L, C_ASK)), m: Number(campo(L, C_MID)) };
    (K === k0 ? m0 : m1).set(h, v);
  }
  return [m0, m1];
}

const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));
const res = {};
const t0 = Date.now();
let saltados = 0;
const motivos = {};

for (let i = 0; i < fechas.length; i++) {
  const fecha = fechas[i];
  if (i % 25 === 0) {
    const seg = ((Date.now() - t0) / 1000).toFixed(0);
    console.log(`   ${i}/${fechas.length} · ${fecha} · ${seg}s · ${Object.keys(res).length} ok`);
  }
  const fC = `${DIR}/iv_${fecha}_C.csv`, fP = `${DIR}/iv_${fecha}_P.csv`;
  const falla = (m) => { saltados++; motivos[m] = (motivos[m] ?? 0) + 1; };
  if (!existsSync(fC) || !existsSync(fP)) { falla("falta fichero"); continue; }

  const A = pasadaA(fC), B = pasadaA(fP);
  const s11 = A.spot.get(HORA) ?? B.spot.get(HORA);
  if (!(s11 > 0)) { falla("sin subyacente a las 11:00"); continue; }
  if (!A.chain11.length || !B.chain11.length) { falla("sin cadena a las 11:00"); continue; }

  const cC = cerca(A.chain11, s11 + DIST), pC = cerca(B.chain11, s11 - DIST);
  const cL = cerca(A.chain11, cC.K + ALA), pL = cerca(B.chain11, pC.K - ALA);
  if (cL.K <= cC.K || pL.K >= pC.K) { falla("no hay alas"); continue; }
  const cred = cC.bid + pC.bid - cL.ask - pL.ask;

  const horas = [...new Set([...A.spot.keys(), ...B.spot.keys()])].sort();
  const sp = horas.map((h) => A.spot.get(h) ?? B.spot.get(h));

  const [qCC, qCL] = pasadaB(A.lin, cC.K, cL.K);
  const [qPC, qPL] = pasadaB(B.lin, pC.K, pL.K);
  // Coste de cerrar CADA vertical por separado (hace falta para la gestión de un solo lado)
  const salC = horas.map((h) => {
    const a = qCC.get(h), c = qCL.get(h);
    if (!a || !c || !(a.a > 0)) return null;       // sin ask no se puede recomprar
    return Number((a.a - c.b).toFixed(4));
  });
  const salP = horas.map((h) => {
    const b = qPC.get(h), d = qPL.get(h);
    if (!b || !d || !(b.a > 0)) return null;
    return Number((b.a - d.b).toFixed(4));
  });
  // CONTRAFACTUAL, NO ES UN RESULTADO: lo mismo pero al punto medio, para medir cuánto de "no se
  // puede frenar" es la horquilla y cuánto es que el mercado tiene razón. Nunca sale en una cifra
  // que Lester pueda operar.
  const midC = horas.map((h) => {
    const a = qCC.get(h), c = qCL.get(h);
    if (!a || !c || !(a.m > 0)) return null;
    return Number((a.m - c.m).toFixed(4));
  });
  const midP = horas.map((h) => {
    const b = qPC.get(h), d = qPL.get(h);
    if (!b || !d || !(b.m > 0)) return null;
    return Number((b.m - d.m).toFixed(4));
  });
  const sal = horas.map((_, i) => (salC[i] == null || salP[i] == null ? null : Number((salC[i] + salP[i]).toFixed(4))));
  const iv = horas.map((h) => {
    const x = A.ivAtm.get(h), y = B.ivAtm.get(h);
    const best = !x ? y : !y ? x : x.d <= y.d ? x : y;
    return best ? Number(best.iv.toFixed(5)) : null;
  });

  res[fecha] = {
    h: horas, sp: sp.map((x) => Number(x.toFixed(2))), iv, sal, salC, salP, midC, midP,
    i11: horas.indexOf(HORA), KC: cC.K, KP: pC.K, KCL: cL.K, KPL: pL.K,
    cred: Number(cred.toFixed(4)), cierre: Number(sp[sp.length - 1].toFixed(2)),
  };
}

writeFileSync(OUT, JSON.stringify(res), "utf8");
const dias = Object.keys(res).sort();
console.log(`\n## guardado ${OUT}`);
console.log(`   ${dias.length} días · ${saltados} saltados ${JSON.stringify(motivos)} · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
const porAno = {};
for (const d of dias) porAno[d.slice(0, 4)] = (porAno[d.slice(0, 4)] ?? 0) + 1;
console.log("   por año:", JSON.stringify(porAno));
const marcas = dias.map((d) => res[d].h.length);
console.log(`   marcas por día: mín ${Math.min(...marcas)} · máx ${Math.max(...marcas)}`);
const conSal = dias.map((d) => res[d].sal.filter((x) => x != null).length);
console.log(`   marcas con precio de salida: mín ${Math.min(...conSal)} · mediana ${conSal.sort((a, b) => a - b)[conSal.length >> 1]}`);
console.log(`   última marca: ${JSON.stringify([...new Set(dias.map((d) => res[d].h.at(-1)))].sort())}`);
console.log(`   días sin marca de 11:00: ${dias.filter((d) => res[d].i11 < 0).length}`);
