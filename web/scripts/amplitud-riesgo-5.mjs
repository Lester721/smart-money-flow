// AMPLITUD COMO RIESGO · PARTE 5 — la decisión, con las dos comparaciones arregladas.
//
// Dos fallos de la parte 4 que hay que corregir antes de concluir nada:
//
//  1 · En la comparación "a riesgo igualado" el brazo de la DISTANCIA no estaba igualado: se
//      comparaba el $/año de ±50 (5% peor −$3.002) contra el del filtro (−$1.865) como si fueran
//      el mismo riesgo. No lo son. Aquí TODOS los brazos tontos se escalan en contratos hasta
//      tener el MISMO 5% peor que el filtro, y sólo entonces se comparan los ingresos.
//
//  2 · El tamaño máximo se elegía sólo por "que el efectivo no se ponga en rojo". Con eso salían
//      12 contratos y una caída de −$83.180 — el 147% de la cuenta — porque la caída ocurría
//      DESPUÉS de acumular beneficios. Se añade el tope de caída y se elige el tamaño en una
//      mitad para aplicarlo a la otra, no sobre todo el período.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/amplitud-riesgo-5.mjs

import { readFileSync } from "node:fs";
import { listonT } from "../lib/barreraHallazgos";

const CUENTA = 56389, EFECTIVO = 7977, PODER = 73874;
const COLATERAL = 5000;                 // alas de 50 puntos → $5.000 por cóndor, sea cual sea la distancia
const TOPE_CAIDA = 0.25;                // ninguna configuración puede pasar del 25% de la cuenta
const PRUEBAS = 50, LISTON = listonT(PRUEBAS);
const eur = (x) => (x == null || !Number.isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const pct = (x) => (x == null || !Number.isFinite(x) ? "—" : (x * 100).toFixed(1) + "%");
const suma = (v) => v.reduce((a, b) => a + b, 0);
const media = (v) => (v.length ? suma(v) / v.length : NaN);

const { dias } = JSON.parse(readFileSync("scripts/amplitud-riesgo-dias.json", "utf8"));
function caidaMax(pl) { let c = 0, p = 0, w = 0; for (const x of pl) { c += x; p = Math.max(p, c); w = Math.min(w, c - p); } return w; }
function es5de(pl) { const o = [...pl].sort((a, b) => a - b); return media(o.slice(0, Math.max(1, Math.round(pl.length * 0.05)))); }
function suelo(pl, f) { let c = EFECTIVO, m = EFECTIVO, fe = null; for (let i = 0; i < pl.length; i++) { c += pl[i]; if (c < m) { m = c; fe = f[i]; } } return { min: m, fecha: fe }; }

const MC = [5, 10, 20, 50, 100, 200];
const MA = {};
for (const k of MC) MA[k] = dias.map((_, i) => { if (i < k) return null; let s = 0; for (let j = i - k; j < i; j++) s += dias[j].cierre; return s / k; });
const idxDe = new Map(dias.map((d, i) => [d.fecha, i]));
const serie = (ds, c, k = 1) => ds.map((d) => {
  const i = idxDe.get(d.fecha), p = d.pnl[String(c.dist)];
  if (p == null) return 0;
  if (c.a == null) return p * k;
  const m1 = MA[c.a][i], m2 = c.b ? MA[c.b][i] : m1;
  if (m1 == null || m2 == null) return 0;
  return d.sp11 >= m1 && d.sp11 >= m2 ? p * k : 0;
});
const evalua = (ds, c, k = 1) => {
  const s = serie(ds, c, k);
  return { n: s.filter((x) => x !== 0).length, a: suma(s) / (ds.length / 252), c: caidaMax(s), e: es5de(s), peor: Math.min(...s), su: suelo(s, ds.map((d) => d.fecha)), s };
};
const nomC = (c) => (c.a == null ? `±${c.dist} sin filtro` : `±${c.dist} · sobre MA${c.a}${c.b ? "+MA" + c.b : ""}`);

const ANCHO = 104;
const raya = (t) => { console.log("\n" + "═".repeat(ANCHO)); console.log("  " + t); console.log("═".repeat(ANCHO)); };
const m2 = Math.floor(dias.length / 2);
const H = [dias.slice(0, m2), dias.slice(m2)];
const nomH = ["H1 " + dias[0].fecha + "→" + dias[m2 - 1].fecha, "H2 " + dias[m2].fecha + "→" + dias[dias.length - 1].fecha];
const BASE = { a: null, b: null, dist: 25 };
const REF = { a: 20, b: 50, dist: 30 };
const CRUCE = [{ a: 5, b: 50, dist: 45 }, { a: 5, b: 20, dist: 45 }];   // elegidos por riesgo en H1 y en H2
const DISTS = [20, 25, 30, 35, 40, 45, 50];

console.log(`\n# AMPLITUD COMO RIESGO · PARTE 5 — la decisión\n`);
console.log(`${dias.length} sesiones · ${dias[0].fecha} → ${dias[dias.length - 1].fecha} · ${PRUEBAS} pruebas · listón |t| = ${LISTON}`);
console.log(`Cuenta ${eur(CUENTA)} · efectivo ${eur(EFECTIVO)} · poder de compra ${eur(PODER)} · colateral ${eur(COLATERAL)} por cóndor`);

// ═══ P' · A RIESGO IGUALADO, TODOS LOS BRAZOS ESCALADOS ═════════════════════════════════════
raya("P' · A 5% PEOR IGUALADO — ahora sí, todos los brazos escalados al mismo riesgo");
console.log(`
  Todo se escala en contratos hasta tener EL MISMO 5% peor que el filtro. Escalar es exacto:
  con f contratos el ingreso y todas las medidas de riesgo se multiplican por f. Sólo entonces
  el $/año es comparable. Los brazos tontos:
     TAMAÑO       · base ±25 todos los días, encogida
     DISTANCIA    · la distancia sin filtro que MEJOR paga por unidad de 5% peor, encogida
  El filtro y la distancia de referencia se eligen en la mitad de AJUSTE; el resultado es el de
  la mitad de PRUEBA, donde no participó nada en la elección.
`);
const resP = [];
for (const [aj, pr] of [[0, 1], [1, 0]]) {
  const cand = CRUCE[aj];
  // la mejor distancia sin filtro POR EFICIENCIA DE RIESGO, elegida en la mitad de ajuste
  const mejorDist = DISTS.map((d) => { const m = evalua(H[aj], { a: null, b: null, dist: d }); return { d, r: m.a / -m.e }; })
    .sort((x, y) => y.r - x.r)[0].d;
  const mPr = evalua(H[pr], cand);
  const objetivo = mPr.e;                                   // el 5% peor al que se iguala todo
  const brazos = [
    [`**FILTRO ${nomC(cand)}** · 1 contrato`, evalua(H[pr], cand), 1],
    ...[[BASE, "TAMAÑO · base ±25 encogida"], [{ a: null, b: null, dist: mejorDist }, `DISTANCIA · ±${mejorDist} sin filtro, encogida`]]
      .map(([c, n]) => { const m1 = evalua(H[pr], c); const f = objetivo / m1.e; return [`${n} · ${f.toFixed(3)} contratos`, evalua(H[pr], c, f), f]; }),
    [`base ±25 · 1 contrato (referencia, SIN igualar)`, evalua(H[pr], BASE), 1],
  ];
  console.log(`\n### Ajuste en ${nomH[aj].slice(0, 2)} (${nomC(cand)} · mejor distancia ±${mejorDist}) → PRUEBA en ${nomH[pr]}\n`);
  console.log("| brazo | días op. | $/año | 5% peor | caída máx | % cuenta | peor día | suelo EFECTIVO |");
  console.log("|---|---|---|---|---|---|---|---|");
  for (const [n, m] of brazos) console.log(`| ${n} | ${m.n} | ${eur(m.a)} | ${eur(m.e)} | ${eur(m.c)} | ${pct(m.c / CUENTA)} | ${eur(m.peor)} | ${eur(m.su.min)} |`);
  const [f0, t0, d0] = [brazos[0][1].a, brazos[1][1].a, brazos[2][1].a];
  const gana = f0 > t0 && f0 > d0;
  resP.push(gana);
  console.log(`\n   → **${gana ? "GANA EL FILTRO" : "NO gana el filtro"}**: ${eur(f0)}/año contra ${eur(t0)} del tamaño y ${eur(d0)} de la distancia, con el mismo 5% peor de ${eur(objetivo)}.`);
  console.log(`   → ventaja del filtro sobre el mejor brazo tonto: **${eur(f0 - Math.max(t0, d0))}/año**`);
}
console.log(`\n   ═══ ${resP.every(Boolean) ? "GANA EN LAS DOS DIRECCIONES DEL CRUCE" : "NO gana en las dos direcciones"} ═══`);

// ═══ Q' · EL TAMAÑO QUE COMPRA, ELEGIDO EN UNA MITAD ════════════════════════════════════════
raya("Q' · QUÉ COMPRA EL RIESGO AHORRADO — el tamaño se elige en una mitad y se sufre en la otra");
console.log(`
  Dos topes a la vez: el efectivo nunca en rojo Y la caída máxima nunca por encima del
  ${pct(TOPE_CAIDA)} de la cuenta (${eur(CUENTA * TOPE_CAIDA)}). El número de contratos se elige con la mitad de
  AJUSTE y se aplica TAL CUAL a la otra. Si el tamaño elegido revienta fuera de muestra, se ve.
`);
function maxContratos(ds, c) {
  for (let k = 12; k >= 1; k--) {
    const m = evalua(ds, c, k);
    if (m.su.min > 0 && -m.c <= CUENTA * TOPE_CAIDA && k * COLATERAL <= PODER) return k;
  }
  return 0;
}
console.log("| variante | ajuste | k elegido | prueba | $/año en prueba | caída en prueba | % cuenta | suelo EFECTIVO | ¿aguanta fuera de muestra? |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const c of [BASE, { a: null, b: null, dist: 45 }, REF, CRUCE[0], CRUCE[1]]) {
  for (const [aj, pr] of [[0, 1], [1, 0]]) {
    const k = maxContratos(H[aj], c);
    if (k === 0) { console.log(`| ${nomC(c)} | ${nomH[aj].slice(0, 2)} | **0** | ${nomH[pr].slice(0, 2)} | — | — | — | — | ni 1 contrato pasa los topes en la mitad de ajuste |`); continue; }
    const m = evalua(H[pr], c, k);
    const ok = m.su.min > 0 && -m.c <= CUENTA * TOPE_CAIDA;
    console.log(`| ${nomC(c)} | ${nomH[aj].slice(0, 2)} | **${k}** | ${nomH[pr].slice(0, 2)} | ${eur(m.a)} | ${eur(m.c)} | ${pct(m.c / CUENTA)} | ${eur(m.su.min)} | ${ok ? "**sí**" : "**NO**"} |`);
  }
}

// ═══ S · DE DÓNDE SALE EL DINERO — el crédito año a año ═════════════════════════════════════
raya("S · DE DÓNDE SALE EL DINERO — y por qué esto NO es una máquina de ingresos");
console.log(`
  El filtro de riesgo empuja el cóndor lejos del dinero. Ahí el crédito depende casi por entero
  de la volatilidad: en 2022 se cobraban $253 por cóndor a ±45; en 2023, $65. Con $65 de crédito
  y $5.000 de riesgo máximo, un solo día malo se come un año. Esto hay que verlo antes de decidir.
`);
const anos = [...new Set(dias.map((d) => d.ano))].sort();
console.log("\n| año | días | ±45+MA5+MA50: días op. | crédito medio | $ del año | perdedores | peor día | 5% peor |");
console.log("|---|---|---|---|---|---|---|---|");
for (const a of anos) {
  const ds = dias.filter((d) => d.ano === a);
  const op = ds.filter((d) => { const i = idxDe.get(d.fecha); return MA[5][i] != null && MA[50][i] != null && d.sp11 >= MA[5][i] && d.sp11 >= MA[50][i] && d.pnl["45"] != null; });
  const pl = op.map((d) => d.pnl["45"]), cr = op.map((d) => d.cred["45"]);
  const m = evalua(ds, CRUCE[0]);
  console.log(`| **${a}** | ${ds.length} | ${op.length} | ${eur(media(cr))} | ${eur(suma(pl))} | ${pl.filter((x) => x < 0).length} | ${eur(Math.min(...pl))} | ${eur(m.e)} |`);
}

// ═══ VEREDICTO ══════════════════════════════════════════════════════════════════════════════
raya("VEREDICTO — la amplitud como herramienta de riesgo");
const B = evalua(dias, BASE), R = evalua(dias, REF), F = evalua(dias, CRUCE[0]);
console.log("\n| | base ±25 todos | FILTRO de Lester ±30·MA20+MA50 | ±45·MA5+MA50 (elegido por riesgo) |");
console.log("|---|---|---|---|");
const fila = (n, g) => console.log(`| ${n} | ${g(B)} | ${g(R)} | ${g(F)} |`);
fila("$/año · 1 contrato", (m) => eur(m.a));
fila("caída máxima", (m) => `${eur(m.c)} (${pct(m.c / CUENTA)})`);
fila("**5% peor (la que se hereda)**", (m) => eur(m.e));
fila("peor día", (m) => eur(m.peor));
fila("días operados de " + dias.length, (m) => `${m.n} (${pct(m.n / dias.length)})`);
fila("suelo de efectivo desde " + eur(EFECTIVO), (m) => eur(m.su.min));
fila("$/año por cada $1 de 5% peor", (m) => (m.a / -m.e).toFixed(2));
