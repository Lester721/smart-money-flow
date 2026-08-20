// ═══════════════════════════════════════════════════════════════════════════════════════════
// ¿SON MUROS? · CUARTA VUELTA — matar (o salvar) el único resultado que pasó.
//
// La tercera vuelta encontró algo: el canal entre los dos muros contiene el día MÁS que un canal
// barajado entre días (oi z=5,36 · gamD z=4,48, listón 3,36). Antes de firmar eso hay que
// entender POR QUÉ, porque hay una explicación aburrida que daría exactamente lo mismo:
//
//   EL ANCHO DEL CANAL LLEVA DENTRO LA VOLATILIDAD DEL DÍA. La lente gamD se construye con la
//   IV REAL de la cadena de las 09:35, y el perfil de OI se abre cuando el mercado está nervioso.
//   Un día de IV alta tiene el canal ANCHO y el recorrido GRANDE; uno de IV baja, los dos
//   pequeños. Barajar entre días rompe ese emparejamiento y le pone un canal estrecho a un día
//   grande. Eso solo —sin ningún muro— ya produce el resultado.
//
// Así que aquí se le quita el ancho al canal y se mira si queda algo:
//
//   C3 · MISMO ANCHO. Se baraja sólo entre días del MISMO DECIL de anchura. El canal de prueba
//        mide casi lo mismo que el real; lo único que cambia es DÓNDE está puesto respecto a la
//        apertura. Si el muro es un nivel, la colocación tiene que valer algo.
//   C4 · SIMÉTRICO. El mismo ancho exacto, repartido a partes iguales arriba y abajo. Sin
//        barajar y sin ruido: ¿la asimetría de los muros aporta algo sobre no tener ninguna?
//   C5 · LA HORQUILLA DEL MERCADO. Un canal de ±k × (straddle ATM del día), que es la previsión
//        de recorrido que publica el propio mercado de opciones. k se calibra en UNA mitad para
//        igualar el ancho mediano y se PRUEBA en la otra — en las dos direcciones. Si el canal
//        de gamma no le gana al straddle, el muro no aporta nada que la prima no dijera ya.
//
// (El straddle se usa como ANCHO de banda, no como resultado en dinero: por eso va a punto medio
//  y se dice. Ningún euro de este fichero sale de un punto medio.)
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/muros-respetar-4.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const N = JSON.parse(readFileSync("scripts/gex-niveles.json", "utf8"));
const SALIDA = "scripts/muros-respetar-4.json";
const LENTES = ["gam", "gamD", "oi"];
const SORTEOS = 500;
const SEMILLA = 20260822;
const PRUEBAS = 63 + 27;                 // + 9 mismo ancho + 9 simétrico + 9 straddle

const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : NaN);
const sd = (v) => { if (v.length < 2) return NaN; const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const pct = (v, q) => { const s = [...v].filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))] : NaN; };
function listonT(p) { if (p <= 1) return 2; const q = 0.05 / p / 2; const t = Math.sqrt(-2 * Math.log(q)); return Math.round((t - (2.30753 + 0.27061 * t) / (1 + 0.99229 * t + 0.04481 * t * t)) * 100) / 100; }
const LISTON = listonT(PRUEBAS);
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : "—");
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "—");
function exigir(c, m) { if (!c) throw new Error(`FALLO CERRADO: ${m}`); }
let _s = SEMILLA;
const rnd = () => { _s = (_s * 1664525 + 1013904223) >>> 0; return _s / 4294967296; };
function barajar(a) { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }
/** correlación de Pearson */
function corr(x, y) {
  const n = x.length; if (n < 3) return NaN;
  const mx = media(x), my = media(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const a = x[i] - mx, b = y[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : NaN;
}

// ═══ DÍAS ══════════════════════════════════════════════════════════════════════════════════
const spyPorDia = {};
for (const y of [2022, 2023, 2024, 2025, 2026]) {
  const p = `scripts/cache-theta/SPY_spotmin_y_${y}.json`;
  if (existsSync(p)) Object.assign(spyPorDia, JSON.parse(readFileSync(p, "utf8")));
}
const dias = [];
let sinStraddle = 0;
for (const f of N.filas) {
  const bruto = spyPorDia[f.fecha.replace(/-/g, "")];
  const razon = f.spy?.razonSPX ?? null;
  if (!bruto || !(razon > 0)) continue;
  const arr = [];
  for (const [t, p] of bruto) if (t >= 575 && p > 0) arr.push(p * razon);
  if (arr.length < 300) continue;
  let max = -Infinity, min = Infinity;
  for (const p of arr) { if (p > max) max = p; if (p < min) min = p; }
  // straddle ATM a punto medio: ANCHO de banda, nunca un resultado en dinero
  const pc = f.peaje?.callATM, pp = f.peaje?.putATM;
  let strad = null;
  if (pc && pp && pc.bid > 0 && pc.ask > 0 && pp.bid > 0 && pp.ask > 0)
    strad = (pc.bid + pc.ask) / 2 + (pp.bid + pp.ask) / 2;
  else sinStraddle++;
  dias.push({ fecha: f.fecha, per: f.fecha < "2024-01-01" ? "A" : "B", ap: f.apertura, max, min, rango: max - min, strad, niv: f.niveles });
}
exigir(dias.length > 900, `sólo ${dias.length} días`);

console.log(`\n${"═".repeat(100)}`);
console.log(`¿SON MUROS? · CUARTA VUELTA · ${dias.length} días · listón |z| ≥ ${LISTON} (${PRUEBAS} pruebas declaradas)`);
console.log(`${"═".repeat(100)}`);
console.log(`\n   días sin straddle ATM utilizable: ${sinStraddle} — se dicen, no se rellenan.`);

// ═══ 0 · LA EXPLICACIÓN ABURRIDA, MEDIDA ═══════════════════════════════════════════════════
console.log(`\n\n## 0 · ¿EL ANCHO DEL CANAL LLEVA DENTRO LA VOLATILIDAD DEL DÍA?`);
console.log(`   Si el ancho correla con el recorrido, barajar entre días ya produce el resultado sin ningún muro.\n`);
console.log(`   ${"lente".padEnd(6)} ${"n".padStart(5)} ${"corr(ancho, rango del día)".padStart(26)} ${"corr(straddle, rango)".padStart(22)}`);
for (const lente of LENTES) {
  const A = [], Rg = [];
  for (const d of dias) {
    const dc = d.niv[lente].dMuroCall?.pts, dp = d.niv[lente].dMuroPut?.pts;
    if (dc > 0 && dp < 0) { A.push(dc - dp); Rg.push(d.rango); }
  }
  console.log(`   ${lente.padEnd(6)} ${String(A.length).padStart(5)} ${f2(corr(A, Rg)).padStart(26)}`);
}
{
  const S = [], Rg = [];
  for (const d of dias) if (d.strad > 0) { S.push(d.strad); Rg.push(d.rango); }
  console.log(`   ${"straddle".padEnd(6)} ${String(S.length).padStart(5)} ${" ".padStart(26)} ${f2(corr(S, Rg)).padStart(22)}`);
}

// ═══ EL MOTOR DEL CANAL ════════════════════════════════════════════════════════════════════
const dentro = (items) => {
  let n = 0;
  for (const { d, arriba, abajo } of items) if (d.max < d.ap + arriba && d.min > d.ap - abajo) n++;
  return (100 * n) / items.length;
};

// ═══ 1 · LOS TRES CONTROLES DUROS ══════════════════════════════════════════════════════════
console.log(`\n\n## 1 · EL CANAL CONTRA CONTROLES QUE LE QUITAN EL ANCHO`);
console.log(`   C2 = barajar libre (el de la tercera vuelta) · C3 = barajar dentro del decil de ancho`);
console.log(`   C4 = el mismo ancho exacto, simétrico sobre la apertura (sin barajar, sin ruido)\n`);
console.log(`   ${"lente".padEnd(5)} ${"per".padEnd(3)} ${"días".padStart(5)} ${"ancho".padStart(8)} ${"DENTRO".padStart(7)} ║ ${"C2".padStart(7)} ${"z".padStart(6)} ║ ${"C3".padStart(7)} ${"z".padStart(6)} ║ ${"C4 sim".padStart(7)} ${"dif".padStart(6)}`);
console.log(`   ${"─".repeat(92)}`);
const CAN = {};
for (const lente of LENTES) {
  for (const per of ["A", "B", "T"]) {
    const cand = [];
    for (const d of dias) {
      if (per !== "T" && d.per !== per) continue;
      const dc = d.niv[lente].dMuroCall?.pts, dp = d.niv[lente].dMuroPut?.pts;
      if (!(dc > 0 && dp < 0)) continue;
      cand.push({ d, arriba: dc, abajo: -dp });
    }
    if (cand.length < 40) continue;
    const real = dentro(cand);
    const anchos = cand.map((c) => c.arriba + c.abajo);

    // C2 · barajar libre
    const v2 = [];
    for (let k = 0; k < SORTEOS; k++) {
      const p = barajar(cand.map((c) => [c.arriba, c.abajo]));
      v2.push(dentro(cand.map((c, i) => ({ d: c.d, arriba: p[i][0], abajo: p[i][1] }))));
    }
    // C3 · barajar dentro del decil de ancho
    const orden = cand.map((c, i) => i).sort((a, b) => anchos[a] - anchos[b]);
    const grupos = [];
    for (let g = 0; g < 10; g++) grupos.push(orden.slice(Math.floor((g * orden.length) / 10), Math.floor(((g + 1) * orden.length) / 10)));
    const v3 = [];
    for (let k = 0; k < SORTEOS; k++) {
      const it = new Array(cand.length);
      for (const g of grupos) {
        const p = barajar(g.map((i) => [cand[i].arriba, cand[i].abajo]));
        g.forEach((i, j) => { it[i] = { d: cand[i].d, arriba: p[j][0], abajo: p[j][1] }; });
      }
      v3.push(dentro(it));
    }
    // C4 · mismo ancho, simétrico
    const c4 = dentro(cand.map((c) => ({ d: c.d, arriba: (c.arriba + c.abajo) / 2, abajo: (c.arriba + c.abajo) / 2 })));

    const z2 = sd(v2) > 0 ? (real - media(v2)) / sd(v2) : NaN;
    const z3 = sd(v3) > 0 ? (real - media(v3)) / sd(v3) : NaN;
    CAN[`${lente}|${per}`] = { n: cand.length, ancho: pct(anchos, 0.5), real, c2: media(v2), z2, c3: media(v3), z3, c4, dif4: real - c4 };
    const marca = Math.abs(z3) >= LISTON ? " ◄" : "";
    console.log(`   ${lente.padEnd(5)} ${per.padEnd(3)} ${String(cand.length).padStart(5)} ${(f1(pct(anchos, 0.5)) + "pt").padStart(8)} ${(f1(real) + "%").padStart(7)} ║ ${(f1(media(v2)) + "%").padStart(7)} ${f2(z2).padStart(6)} ║ ${(f1(media(v3)) + "%").padStart(7)} ${f2(z3).padStart(6)} ║ ${(f1(c4) + "%").padStart(7)} ${((real - c4 >= 0 ? "+" : "") + f1(real - c4)).padStart(6)}${marca}`);
  }
}

// ═══ 2 · CONTRA LA PREVISIÓN DEL PROPIO MERCADO ════════════════════════════════════════════
console.log(`\n\n## 2 · CONTRA EL STRADDLE — la previsión de recorrido que publica el mercado de opciones`);
console.log(`   k se calibra en una mitad (igualando el ancho MEDIANO al del canal de gamma) y se prueba en la`);
console.log(`   otra, en las dos direcciones. Mismo ancho mediano ⇒ la comparación es de COLOCACIÓN, no de tamaño.\n`);
console.log(`   ${"lente".padEnd(5)} ${"calibra".padEnd(8)} ${"k".padStart(6)} ${"prueba".padEnd(7)} ${"n".padStart(5)} ${"ancho gam".padStart(10)} ${"ancho str".padStart(10)} ${"gamma".padStart(7)} ${"straddle".padStart(9)} ${"dif".padStart(7)}`);
console.log(`   ${"─".repeat(88)}`);
const STR = {};
for (const lente of LENTES) {
  for (const [cal, pru] of [["A", "B"], ["B", "A"]]) {
    const dOf = (per) => dias.filter((d) => {
      if (d.per !== per) return false;
      if (!(d.strad > 0)) return false;
      const dc = d.niv[lente].dMuroCall?.pts, dp = d.niv[lente].dMuroPut?.pts;
      return dc > 0 && dp < 0;
    });
    const cal_ = dOf(cal), pru_ = dOf(pru);
    if (cal_.length < 40 || pru_.length < 40) continue;
    const anchoCal = pct(cal_.map((d) => d.niv[lente].dMuroCall.pts - d.niv[lente].dMuroPut.pts), 0.5);
    const stradCal = pct(cal_.map((d) => d.strad), 0.5);
    const k = anchoCal / stradCal / 2;               // semiancho = k × straddle
    const gam = dentro(pru_.map((d) => ({ d, arriba: d.niv[lente].dMuroCall.pts, abajo: -d.niv[lente].dMuroPut.pts })));
    const str = dentro(pru_.map((d) => ({ d, arriba: k * d.strad, abajo: k * d.strad })));
    const anchoG = pct(pru_.map((d) => d.niv[lente].dMuroCall.pts - d.niv[lente].dMuroPut.pts), 0.5);
    const anchoS = pct(pru_.map((d) => 2 * k * d.strad), 0.5);
    STR[`${lente}|${cal}→${pru}`] = { k, n: pru_.length, anchoG, anchoS, gam, str, dif: gam - str };
    console.log(`   ${lente.padEnd(5)} ${cal.padEnd(8)} ${f2(k).padStart(6)} ${pru.padEnd(7)} ${String(pru_.length).padStart(5)} ${(f1(anchoG) + "pt").padStart(10)} ${(f1(anchoS) + "pt").padStart(10)} ${(f1(gam) + "%").padStart(7)} ${(f1(str) + "%").padStart(9)} ${((gam - str >= 0 ? "+" : "") + f1(gam - str)).padStart(7)}`);
  }
}

writeFileSync(SALIDA, JSON.stringify({ generado: new Date().toISOString(), liston: LISTON, pruebas: PRUEBAS, sorteos: SORTEOS, dias: dias.length, canal: CAN, straddle: STR }, null, 1));
console.log(`\n   escrito ${SALIDA}\n`);
