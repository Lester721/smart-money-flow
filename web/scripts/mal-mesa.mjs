// REGLAS DE MESA · qué se puede operar sabiendo lo que dice el retrato.
//
// Se prueba SÓLO lo que el retrato señala, y todo con la regla de hierro (ajustar en un período,
// aplicar tal cual al otro, y al revés). PRUEBAS DECLARADAS DEL ENCARGO ENTERO: 48. listonT(48).
//
//   E1 · la caja: ¿cuánto efectivo hace falta para aguantar 1 contrato?
//   E2 · el mando del riesgo: empujar los cortos en SIGMAS, ajustado por ES5 en un lado
//   E3 · el suelo de crédito (el único observable que significa lo mismo en los dos períodos)
//   E4 · control: parar después de un día TOPE (el retrato dice que los TOPE van sueltos → no
//        debería servir; si sirviera, el retrato estaría mal)

import { readFileSync } from "node:fs";
import { listonT } from "../lib/barreraHallazgos";

const PRUEBAS = 48, LISTON = listonT(PRUEBAS), COMM = 0.03;
const CUENTA = 56389, EFECTIVO = 7977, PODER = 73874;

const dias = JSON.parse(readFileSync("scripts/mal-dias.json", "utf8")).sort((a, b) => a.fecha.localeCompare(b.fecha));
const CAD = JSON.parse(readFileSync("scripts/mal-cadenas.json", "utf8"));
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))]; };
const eur = (x) => (x == null || !isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const n2 = (x) => (x == null || !isFinite(x) ? "—" : x.toFixed(2));
for (const d of dias) { d.ano = d.fecha.slice(0, 4); d.per = d.fecha < "2024-01-01" ? "2022-23" : "2024-26"; }

const cercaK = (ch, o) => ch.reduce((a, b) => (Math.abs(b[0] - o) < Math.abs(a[0] - o) ? b : a));
function operar(d, modo, ala) {
  const c = CAD[d.fecha]; if (!c) return null;
  let objC, objP;
  if (modo.tipo === "pts") { objC = d.sp11 + modo.sep; objP = d.sp11 - modo.sep; }
  else { if (!(d.sigma > 0)) return null; objC = d.sp11 + modo.k * d.sigma; objP = d.sp11 - modo.k * d.sigma; }
  const cC = cercaK(c.C, objC), pC = cercaK(c.P, objP);
  const cL = cercaK(c.C, cC[0] + ala), pL = cercaK(c.P, pC[0] - ala);
  if (cL[0] <= cC[0] || pL[0] >= pC[0]) return null;
  const aC = cL[0] - cC[0], aP = pC[0] - pL[0];
  const cred = cC[1] + pC[1] - cL[2] - pL[2];
  if (!(cred > 0)) return null;
  const S = d.cierre;
  const penC = Math.min(Math.max(S - cC[0], 0), aC), penP = Math.min(Math.max(pC[0] - S, 0), aP);
  const colateral = Math.max(aC, aP) * 100 - cred * 100;
  return { fecha: d.fecha, per: d.per, ano: d.ano, pl: (cred - penC - penP) * 100 - 8 * COMM,
           credito: cred * 100, colateral, ratio: (cred * 100) / colateral,
           tope: (penC >= aC - 0.001 || penP >= aP - 0.001) ? 1 : 0 };
}
function met(ops, anos) {
  if (!ops.length) return null;
  const pl = ops.map((o) => o.pl), tot = pl.reduce((a, b) => a + b, 0);
  const s = [...pl].sort((a, b) => a - b), k5 = Math.max(1, Math.floor(s.length * 0.05));
  let acc = 0, pico = 0, dd = 0;
  for (const p of pl) { acc += p; if (acc > pico) pico = acc; if (acc - pico < dd) dd = acc - pico; }
  return { n: pl.length, tot, alAno: tot / anos, peor: s[0], p1: pct(pl, 0.01), p5: pct(pl, 0.05),
           es5: Math.abs(media(s.slice(0, k5))), dd, tope: ops.reduce((a, o) => a + o.tope, 0),
           acierto: pl.filter((x) => x > 0).length / pl.length };
}

// ══════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n====== E1 · LA CAJA · ¿cuánto efectivo pide UN contrato de lo que se opera hoy? ======\n`);
const base = dias.map((d) => operar(d, { tipo: "pts", sep: 25 }, 50)).filter(Boolean);
function peorVentana(ops, w) {
  let peor = 0, cual = "";
  for (let i = 0; i + w <= ops.length; i++) {
    const s = ops.slice(i, i + w).reduce((a, o) => a + o.pl, 0);
    if (s < peor) { peor = s; cual = `${ops[i].fecha}→${ops[i + w - 1].fecha}`; }
  }
  return { peor, cual };
}
console.log("| ventana | peor pérdida acumulada · TODO | cuándo | peor en 2022-23 | peor en 2024-26 |");
console.log("|---|---|---|---|---|");
const bA = base.filter((o) => o.per === "2022-23"), bB = base.filter((o) => o.per === "2024-26");
for (const w of [1, 3, 5, 10, 20, 40, 60]) {
  const t = peorVentana(base, w), a = peorVentana(bA, w), b = peorVentana(bB, w);
  console.log(`| ${w} día${w > 1 ? "s" : ""} | ${eur(t.peor)} | ${t.cual} | ${eur(a.peor)} | ${eur(b.peor)} |`);
}
console.log(`\n  Efectivo de Lester: ${eur(EFECTIVO)}.`);
// simulación de caja día a día
function caja(ops, contratos, efectivo) {
  let c = efectivo, min = efectivo, minF = "", dias0 = 0, primerCero = "";
  for (const o of ops) {
    c += o.pl * contratos;
    if (c < min) { min = c; minF = o.fecha; }
    if (c < 0) { dias0++; if (!primerCero) primerCero = o.fecha; }
  }
  return { final: c, min, minF, dias0, primerCero };
}
console.log("\n| contratos | colateral pedido | efectivo mínimo alcanzado | cuándo | días con la caja EN NEGATIVO | primer día en negativo | caja al final |");
console.log("|---|---|---|---|---|---|---|");
for (const n of [1, 2, 3, 5]) {
  const c = caja(base, n, EFECTIVO);
  const col = Math.max(...base.map((o) => o.colateral)) * n;
  console.log(`| ${n} | ${eur(col)} | ${eur(c.min)} | ${c.minF} | ${c.dias0} | ${c.primerCero || "—"} | ${eur(c.final)} |`);
}
console.log("\n  El mismo cálculo empezando en 2024 (lo que se midió antes de tener el bajista):");
console.log("| contratos | efectivo mínimo | cuándo | días en negativo | caja al final |");
console.log("|---|---|---|---|---|");
for (const n of [1, 2, 3, 5]) {
  const c = caja(bB, n, EFECTIVO);
  console.log(`| ${n} | ${eur(c.min)} | ${c.minF} | ${c.dias0} | ${eur(c.final)} |`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n====== E2 · EL MANDO DEL RIESGO · ¿el empujón en sigmas cruza en las DOS direcciones? ======\n`);
console.log("Se ajusta k minimizando ES5 (la pérdida media del 5% de días peores) en un período y");
console.log("se aplica TAL CUAL al otro. Lo que se comprueba aquí es SÓLO el lado del riesgo.\n");
const KS = [0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90, 1.00];
const variantes = new Map();
for (const ala of [30, 50]) for (const k of KS) {
  const nom = `±${k.toFixed(2)}s/ala${ala}`;
  variantes.set(nom, dias.map((d) => operar(d, { tipo: "sig", k }, ala)).filter(Boolean));
}
variantes.set("BASE ±25pts/ala50", base);
const parte = (ops, p) => ops.filter((o) => o.per === p);
for (const [ajP, prP] of [["2022-23", "2024-26"], ["2024-26", "2022-23"]]) {
  let mejor = null;
  for (const [nom, ops] of variantes) {
    if (nom.startsWith("BASE")) continue;
    const g = parte(ops, ajP); if (g.length < 200) continue;
    const m = met(g, g.length / 252);
    if (!mejor || m.es5 < mejor.m.es5) mejor = { nom, ops, m };
  }
  const bAj = met(parte(base, ajP), parte(base, ajP).length / 252);
  const bPr = met(parte(base, prP), parte(base, prP).length / 252);
  const mPr = met(parte(mejor.ops, prP), parte(mejor.ops, prP).length / 252);
  console.log(`── ajustado en ${ajP} → elegido ${mejor.nom} (ES5 ${eur(mejor.m.es5)}) · probado en ${prP} ──`);
  console.log("| |ES5|peor día|p1|p5|peor racha|TOPE|$/año|");
  console.log("|---|---|---|---|---|---|---|---|");
  console.log(`| ${prP} BASE ±25/50 | ${eur(bPr.es5)} | ${eur(bPr.peor)} | ${eur(bPr.p1)} | ${eur(bPr.p5)} | ${eur(bPr.dd)} | ${bPr.tope} | ${eur(bPr.alAno)} |`);
  console.log(`| ${prP} ${mejor.nom} | ${eur(mPr.es5)} | ${eur(mPr.peor)} | ${eur(mPr.p1)} | ${eur(mPr.p5)} | ${eur(mPr.dd)} | ${mPr.tope} | ${eur(mPr.alAno)} |`);
  const mejoras = [["ES5", bPr.es5 - mPr.es5], ["p5", mPr.p5 - bPr.p5], ["peor racha", mPr.dd - bPr.dd], ["TOPE", bPr.tope - mPr.tope]];
  console.log(`  mejora fuera de muestra: ${mejoras.map(([n, v]) => `${n} ${v > 0 ? "SÍ" : "NO"} (${n === "TOPE" ? v : eur(v)})`).join(" · ")}`);
  const dIng = mPr.alAno - bPr.alAno, dDD = mPr.dd - bPr.dd;
  console.log(`  ingreso ${dIng >= 0 ? "+" : ""}${eur(dIng)}/año · MÉTRICA QUE DECIDE: ${dDD > 0 ? (dIng >= 0 ? "0 (quita caída y da MÁS ingreso)" : n2(-dIng / dDD) + " $/año por cada $ de caída eliminado") : "no quita caída"}\n`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n====== E3 · EL SUELO DE CRÉDITO · el único observable con el mismo significado ======\n`);
console.log("Regla: no operar si el crédito cobrado es menos del X% del colateral. Todo observable");
console.log("a las 11:00 (el crédito es el precio real de las cuatro patas).\n");
const SUELOS = [0, 0.04, 0.06, 0.08, 0.10, 0.12, 0.15, 0.20];
console.log("| suelo | días TODO | $/año TODO | ES5 | peor racha | 22-23 días | 22-23 $/año | 22-23 racha | 24-26 días | 24-26 $/año | 24-26 racha |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
const porSuelo = new Map();
for (const s of SUELOS) {
  const ops = base.filter((o) => o.ratio >= s);
  porSuelo.set(s, ops);
  const m = met(ops, base.length / 252);          // se divide por los años NATURALES, no por los días operados
  const a = parte(ops, "2022-23"), b = parte(ops, "2024-26");
  const mA = met(a, bA.length / 252), mB = met(b, bB.length / 252);
  console.log(`| ${(s * 100).toFixed(0)}% | ${m.n} | ${eur(m.alAno)} | ${eur(m.es5)} | ${eur(m.dd)} | ${mA ? mA.n : 0} | ${mA ? eur(mA.alAno) : "—"} | ${mA ? eur(mA.dd) : "—"} | ${mB ? mB.n : 0} | ${mB ? eur(mB.alAno) : "—"} | ${mB ? eur(mB.dd) : "—"} |`);
}
for (const [ajP, prP] of [["2022-23", "2024-26"], ["2024-26", "2022-23"]]) {
  let mejor = null;
  const anosAj = parte(base, ajP).length / 252, anosPr = parte(base, prP).length / 252;
  for (const [s, ops] of porSuelo) {
    if (s === 0) continue;
    const g = parte(ops, ajP); if (g.length < 200) continue;
    const m = met(g, anosAj);
    const bm = met(parte(base, ajP), anosAj);
    const dIng = m.alAno - bm.alAno, dDD = m.dd - bm.dd;
    const score = dDD > 0 ? (dIng >= 0 ? Infinity : -dDD / -dIng) : -Infinity;   // $ de caída quitada por $ de ingreso
    if (!mejor || score > mejor.score) mejor = { s, ops, m, score };
  }
  if (!mejor) { console.log(`\n  ajustado en ${ajP}: NINGÚN suelo quita caída. No hay nada que probar fuera de muestra.`); continue; }
  const bPr = met(parte(base, prP), anosPr), mPr = met(parte(mejor.ops, prP), anosPr);
  const dIng = mPr.alAno - bPr.alAno, dDD = mPr.dd - bPr.dd;
  console.log(`\n── ajustado en ${ajP} → suelo ${(mejor.s * 100).toFixed(0)}% · probado en ${prP} ──`);
  console.log(`   ${prP} base: ${eur(bPr.alAno)}/año · racha ${eur(bPr.dd)} · ES5 ${eur(bPr.es5)} · ${bPr.n} días`);
  console.log(`   ${prP} regla: ${eur(mPr.alAno)}/año · racha ${eur(mPr.dd)} · ES5 ${eur(mPr.es5)} · ${mPr.n} días (${bPr.n - mPr.n} días saltados)`);
  console.log(`   ingreso ${dIng >= 0 ? "+" : ""}${eur(dIng)}/año · caída ${dDD > 0 ? "mejora " : "empeora "}${eur(Math.abs(dDD))} · MÉTRICA: ${dDD > 0 ? (dIng >= 0 ? "0 (gratis)" : n2(-dIng / dDD)) : "no aplica"}`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n====== E4 · CONTROL · parar el día siguiente a un TOPE ======\n`);
console.log("El retrato dice que el 91% de los TOPE van SUELTOS. Si esta regla funcionara, el");
console.log("retrato estaría mal. Es un control, no una propuesta.\n");
for (const [nom, ops] of [["TODO", base], ["2022-23", bA], ["2024-26", bB]]) {
  const filtrado = ops.filter((o, i) => i === 0 || ops[i - 1].tope === 0);
  const m0 = met(ops, ops.length / 252), m1 = met(filtrado, ops.length / 252);
  console.log(`  ${nom}: sin regla ${eur(m0.alAno)}/año racha ${eur(m0.dd)} · parando tras TOPE ${eur(m1.alAno)}/año racha ${eur(m1.dd)} · ${ops.length - filtrado.length} días saltados`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n====== E5 · POR QUÉ PIERDE CADA AÑO · el crédito contra el daño ======\n`);
console.log("| año | crédito medio cobrado | ingreso bruto de los días ganados | daño de los perdedores | días perdedores | daño medio | ¿le llega el crédito? |");
console.log("|---|---|---|---|---|---|---|");
for (const a of ["2022", "2023", "2024", "2025", "2026"]) {
  const g = base.filter((o) => o.ano === a);
  const gan = g.filter((o) => o.pl > 0), per = g.filter((o) => o.pl < 0);
  const bruto = gan.reduce((s, o) => s + o.pl, 0), dano = per.reduce((s, o) => s + o.pl, 0);
  console.log(`| ${a} | ${eur(media(g.map((o) => o.credito)))} | ${eur(bruto)} | ${eur(dano)} | ${per.length} | ${eur(dano / per.length)} | ${bruto + dano >= 0 ? "**SÍ** (+" + eur(bruto + dano).slice(1) + ")" : "NO (" + eur(bruto + dano) + ")"} |`);
}
console.log(`\n  listón de |t| con ${PRUEBAS} pruebas declaradas: ${LISTON}`);
console.log(`  cuenta ${eur(CUENTA)} · efectivo ${eur(EFECTIVO)} · poder de compra ${eur(PODER)}`);
