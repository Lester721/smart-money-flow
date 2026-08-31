// ¿CÓMO SE ESCOGEN LAS MEJORES DENTRO DE LAS 839?
//
// Regla base (la que da 1.42): golpe agresivo de >$500,000 en enero 2026, contrato DENTRO del
// dinero, comprar al día siguiente al ask, vender al 1.50x, cortar la pérdida al 0.50x.
//
// ═══ LA DISCIPLINA, ESCRITA ANTES DE MIRAR NADA ═══════════════════════════════════════════
//
// Con 839 casos y una docena de factores, SIEMPRE aparece un ganador por casualidad. Para que
// un factor cuente tiene que pasar las tres a la vez:
//
//   1. MONÓTONO — que el ratio suba (o baje) al pasar de un cajón al siguiente, no que un cajón
//      del medio dé el salto. Un pico suelto es ruido.
//   2. LAS DOS MITADES — el mes se parte por la fecha: primeros 10 días de bolsa contra los
//      últimos 10. El factor tiene que ir en el MISMO sentido en las dos.
//   3. MUESTRA — al menos 80 contratos en el cajón bueno y en el malo.
//
// Todos los factores se calculan con lo que se sabía AL COMPRAR. Nada de mirar hacia delante.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { abrir } from "./datos.mjs";

const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const dteDe = (a, b) => Math.round((ms(b) - ms(a)) / 86_400_000);
const OBJ = 1.50, SUELO = 0.50, DTE_MIN = 5;

const cad = abrir("cadenas");
const flu = abrir("flujo-limpio");
const oiA = abrir("oi-ancho");

function spotOk(c, hoy) {
  let exp = null, md = Infinity;
  for (const e of Object.keys(c)) { const d = dteDe(hoy, e); if (d < 1) continue; if (d < md) { md = d; exp = e; } }
  if (!exp) return null;
  const g = c[exp]; let K = null, dm = Infinity;
  for (const cl of Object.keys(g)) {
    if (cl.slice(-1) !== "C") continue;
    const k = Number(cl.slice(0, -2)); const p = g[`${k}|P`]; if (!p) continue;
    const d = Math.abs((g[cl][0] + g[cl][1]) / 2 - (p[0] + p[1]) / 2);
    if (d < dm) { dm = d; K = k; }
  }
  if (K == null) return null;
  const C = g[`${K}|C`], P = g[`${K}|P`];
  const s = K + (C[0] + C[1]) / 2 - (P[0] + P[1]) / 2;
  return s > 0 ? s : null;
}

// ── 1. recoger, agregando TODOS los golpes del mismo contrato el mismo día ──
const cont = new Map();
const primaTickerDia = new Map();
for (const f of readdirSync(flu.dir)) {
  const g = /^([A-Z]+)_d(\d{8})\.json$/.exec(f); if (!g) continue;
  const [, tk, dia] = g;
  let lista; try { lista = JSON.parse(readFileSync(join(flu.dir, f), "utf8")); } catch { continue; }
  for (const o of lista) {
    if (!(o.ask > 0 && o.precio >= o.ask)) continue;
    primaTickerDia.set(`${tk}|${dia}`, (primaTickerDia.get(`${tk}|${dia}`) ?? 0) + o.prima);
    if (dteDe(dia, o.exp) < DTE_MIN) continue;
    const k = `${tk}|${o.exp}|${o.K}|${o.l}|${dia}`;
    const y = cont.get(k);
    if (y) {
      y.prima += o.prima; y.tam += o.tam; y.golpes++;
      if (o.precio > o.ask) y.porEncima++;
      y.horq += (o.ask - o.bid) / ((o.ask + o.bid) / 2 || 1);
    } else {
      cont.set(k, { tk, exp: o.exp, K: o.K, l: o.l, dia, prima: o.prima, tam: o.tam, golpes: 1,
                    porEncima: o.precio > o.ask ? 1 : 0,
                    horq: (o.ask - o.bid) / ((o.ask + o.bid) / 2 || 1) });
    }
  }
}

// ── 2. filtrar a DENTRO del dinero y seguir con la regla base ──
const ops = [];
for (const c of cont.values()) {
  const ds = cad.dias(c.tk); const i = ds.findIndex((x) => x > c.dia);
  if (i < 0) continue; const dC = ds[i]; if (dC >= c.exp) continue;
  const ch = cad.leer(c.tk, dC); if (!ch) continue;
  const S = spotOk(ch, dC); if (!S) continue;
  const dentro = c.l === "C" ? c.K < S : c.K > S;
  if (!dentro) continue;
  const p0 = ch[c.exp]?.[`${c.K}|${c.l}`]; if (!p0 || !(p0[1] > 0)) continue;
  const coste = p0[1];
  let mejor = null, ult = null, n = 0;
  for (const d of ds) {
    if (d <= dC) continue; if (d > c.exp) break;
    const p = cad.leer(c.tk, d)?.[c.exp]?.[`${c.K}|${c.l}`]; if (!p) continue;
    n++; const m = p[0] / coste; ult = m;
    if (mejor == null || m > mejor) mejor = m;
  }
  if (n === 0) continue;
  // el OI del contrato la víspera: ¿el golpe es grande comparado con lo que ya había?
  const oiPrev = oiA.leer(c.tk, c.dia)?.[c.exp]?.[`${c.K}|${c.l}`] ?? null;
  ops.push({
    ...c, dC, S, coste, mejor, ult,
    prof: c.l === "C" ? (S - c.K) / S : (c.K - S) / S,       // lo DENTRO que está
    dte: dteDe(dC, c.exp),
    horqMed: c.horq / c.golpes,                               // horquilla media del golpe
    pctPorEncima: c.porEncima / c.golpes,                     // cuántos golpes por ENCIMA del ask
    vsOI: oiPrev && oiPrev > 0 ? c.tam / oiPrev : null,       // tamaño del golpe contra el OI que había
    primaDia: primaTickerDia.get(`${c.tk}|${c.dia}`) ?? 0,
    // resultado con la regla base
    res: mejor >= OBJ ? OBJ : Math.max(ult, SUELO),
  });
}
ops.sort((a, b) => a.dia.localeCompare(b.dia));
const corte = ops[Math.floor(ops.length / 2)].dia;             // parte el mes por la mitad, por fecha
console.log(`\n  ${ops.length} contratos · el mes se parte en ${corte}\n`);

// ── 3. la maquinaria de evaluar un factor ──
const R = (L) => {
  if (!L.length) return null;
  let g = 0, p = 0, gana = 0;
  for (const o of L) { const x = 1000 * (o.res - 1); if (x > 0) { g += x; gana++; } else p += -x; }
  return { n: L.length, pg: 100 * gana / L.length, r: p ? g / p : Infinity, neto: g - p };
};
const base = R(ops);
console.log(`  BASE, sin escoger: ${base.n} contratos · ratio ${base.r.toFixed(2)} · ${base.pg.toFixed(0)}% aciertos · ${base.neto >= 0 ? "+" : "−"}$${Math.abs(Math.round(base.neto)).toLocaleString("en-US")}\n`);

const candidatos = [];
function factor(nombre, valor, cajones) {
  const usables = ops.filter((o) => valor(o) != null);
  if (usables.length < 200) return;
  const filas = [];
  for (const [a, b, nom] of cajones) {
    const L = usables.filter((o) => { const v = valor(o); return v >= a && v < b; });
    const r = R(L); if (!r) { filas.push({ nom, r: null }); continue; }
    const p1 = R(L.filter((o) => o.dia < corte)), p2 = R(L.filter((o) => o.dia >= corte));
    filas.push({ nom, r, p1, p2 });
  }
  const conD = filas.filter((f) => f.r);
  if (conD.length < 3) return;
  const rs = conD.map((f) => f.r.r);
  const sube = rs.every((v, i) => i === 0 || v >= rs[i - 1] - 0.06);
  const baja = rs.every((v, i) => i === 0 || v <= rs[i - 1] + 0.06);
  const monotono = sube || baja;
  const mejor = conD[sube ? conD.length - 1 : 0], peor = conD[sube ? 0 : conD.length - 1];
  const nOk = mejor.r.n >= 80 && peor.r.n >= 80;
  const mitades = mejor.p1 && mejor.p2 && peor.p1 && peor.p2 &&
                  (mejor.p1.r - peor.p1.r) * (mejor.p2.r - peor.p2.r) > 0 &&
                  mejor.p1.r > peor.p1.r && mejor.p2.r > peor.p2.r;
  console.log(`\n  ── ${nombre} ──`);
  console.log(`     ${"cajón".padEnd(26)}     n  aciertos   RATIO    1ª mitad  2ª mitad`);
  for (const f of filas) {
    if (!f.r) { console.log(`     ${f.nom.padEnd(26)}     —`); continue; }
    console.log(`     ${f.nom.padEnd(26)} ${String(f.r.n).padStart(5)}    ${f.r.pg.toFixed(0).padStart(3)}%   ${f.r.r.toFixed(2).padStart(5)}     ${(f.p1 ? f.p1.r.toFixed(2) : "—").padStart(5)}     ${(f.p2 ? f.p2.r.toFixed(2) : "—").padStart(5)}`);
  }
  const gana = mejor.r.r - peor.r.r;
  console.log(`     monótono ${monotono ? "SÍ" : "no"} · muestra ${nOk ? "SÍ" : "no"} · mismo sentido en las dos mitades ${mitades ? "SÍ" : "no"} · separa ${gana.toFixed(2)}`);
  if (monotono && nOk && mitades && gana > 0.25) candidatos.push({ nombre, mejor: mejor.nom, gana, r: mejor.r.r, n: mejor.r.n });
}

const q = (campo, p) => { const v = ops.map(campo).filter((x) => x != null).sort((a, b) => a - b); return v[Math.floor(v.length * p)]; };

factor("lo DENTRO del dinero que está", (o) => o.prof,
  [[0, 0.03, "0% a 3%"], [0.03, 0.08, "3% a 8%"], [0.08, 0.15, "8% a 15%"], [0.15, 0.30, "15% a 30%"], [0.30, 9, "más del 30%"]]);

factor("días hasta vencer", (o) => o.dte,
  [[5, 20, "5 a 20 días"], [20, 45, "20 a 45"], [45, 90, "45 a 90"], [90, 200, "90 a 200"], [200, 9999, "más de 200"]]);

factor("tamaño del golpe", (o) => o.prima,
  [[5e5, 1e6, "$500k a $1M"], [1e6, 2e6, "$1M a $2M"], [2e6, 5e6, "$2M a $5M"], [5e6, 1e15, "más de $5M"]]);

factor("horquilla al comprar (liquidez)", (o) => o.horqMed,
  [[0, 0.01, "menos del 1%"], [0.01, 0.03, "1% a 3%"], [0.03, 0.07, "3% a 7%"], [0.07, 9, "más del 7%"]]);

factor("golpes en el mismo contrato ese día", (o) => o.golpes,
  [[1, 2, "1 golpe"], [2, 4, "2 o 3"], [4, 10, "4 a 9"], [10, 1e9, "10 o más"]]);

factor("cuántos golpes POR ENCIMA del ask", (o) => o.pctPorEncima,
  [[0, 0.01, "ninguno (justo al ask)"], [0.01, 0.5, "algunos"], [0.5, 1.01, "la mayoría o todos"]]);

factor("el golpe contra el OI que ya había", (o) => o.vsOI,
  [[0, 0.05, "menos del 5%"], [0.05, 0.20, "5% a 20%"], [0.20, 0.60, "20% a 60%"], [0.60, 1e9, "más del 60%"]]);

factor("lo que cuesta el contrato", (o) => o.coste * 100,
  [[0, 2000, "menos de $2,000"], [2000, 6000, "$2,000 a $6,000"], [6000, 15000, "$6,000 a $15,000"], [15000, 1e9, "más de $15,000"]]);

factor("prima total del ticker ese día", (o) => o.primaDia,
  [[0, q((o) => o.primaDia, 0.25), "poca"], [q((o) => o.primaDia, 0.25), q((o) => o.primaDia, 0.5), "algo"], [q((o) => o.primaDia, 0.5), q((o) => o.primaDia, 0.75), "bastante"], [q((o) => o.primaDia, 0.75), 1e15, "mucha"]]);

// lado y ticker, aunque no son "monótonos", se enseñan
console.log(`\n  ── lado (no aplica lo monótono) ──`);
console.log(`     ${"".padEnd(26)}     n  aciertos   RATIO    1ª mitad  2ª mitad`);
for (const l of ["C", "P"]) {
  const L = ops.filter((o) => o.l === l); const r = R(L);
  const p1 = R(L.filter((o) => o.dia < corte)), p2 = R(L.filter((o) => o.dia >= corte));
  console.log(`     ${(l === "C" ? "calls" : "puts").padEnd(26)} ${String(r.n).padStart(5)}    ${r.pg.toFixed(0).padStart(3)}%   ${r.r.toFixed(2).padStart(5)}     ${(p1 ? p1.r.toFixed(2) : "—").padStart(5)}     ${(p2 ? p2.r.toFixed(2) : "—").padStart(5)}`);
}

console.log(`\n\n=== LO QUE PASA LAS TRES CRIBAS ===\n`);
if (!candidatos.length) console.log(`  NINGUNO.\n`);
else {
  console.log(`  ${"factor".padEnd(38)} ${"quedarse con".padEnd(22)}     n   RATIO   separa`);
  for (const c of candidatos.sort((a, b) => b.gana - a.gana))
    console.log(`  ${c.nombre.padEnd(38)} ${c.mejor.padEnd(22)} ${String(c.n).padStart(5)}   ${c.r.toFixed(2).padStart(5)}   +${c.gana.toFixed(2)}`);
  // combinarlos
  console.log(`\n  --- todos los que pasan, aplicados a la vez ---`);
}
console.log("");

// ═══ EL PERFIL DE LAS QUE PASAN EL FILTRO ═══
const sel = ops.filter((o) => o.vsOI != null && o.vsOI > 0.60);
const md = (v) => { const s = v.filter((x) => x != null).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const rg = (v, p) => { const s = v.filter((x) => x != null).sort((a, b) => a - b); return s[Math.floor(s.length * p)]; };
const r = R(sel);
console.log(`\n\n=== PERFIL DE LAS ${sel.length} QUE PASAN ===\n`);
console.log(`  ${"característica".padEnd(40)} ${"mediana".padStart(14)} ${"el 25% bajo".padStart(14)} ${"el 25% alto".padStart(14)}`);
const F2 = (n, v, fmt) => console.log(`  ${n.padEnd(40)} ${fmt(md(v)).padStart(14)} ${fmt(rg(v, 0.25)).padStart(14)} ${fmt(rg(v, 0.75)).padStart(14)}`);
const $ = (x) => "$" + Math.round(x).toLocaleString("en-US");
const pc = (x) => (100 * x).toFixed(1) + "%";
F2("tamaño del golpe", sel.map((o) => o.prima), $);
F2("el golpe contra el OI que había", sel.map((o) => o.vsOI), (x) => (100 * x).toFixed(0) + "%");
F2("lo DENTRO del dinero que está", sel.map((o) => o.prof), pc);
F2("días hasta vencer", sel.map((o) => o.dte), (x) => String(Math.round(x)));
F2("lo que cuesta el contrato", sel.map((o) => o.coste * 100), $);
F2("horquilla al comprar", sel.map((o) => o.horqMed), pc);
console.log(`\n  ${"reparto".padEnd(40)} ${"cuántas".padStart(10)} ${"de cada 100".padStart(14)}`);
const rep = (n, f) => { const L = sel.filter(f); console.log(`  ${n.padEnd(40)} ${String(L.length).padStart(10)} ${(100 * L.length / sel.length).toFixed(0).padStart(13)}%`); };
rep("calls", (o) => o.l === "C"); rep("puts", (o) => o.l === "P");
console.log("");
for (const t of [...new Set(sel.map((o) => o.tk))].sort()) rep("  " + t, (o) => o.tk === t);
console.log("");
rep("un solo golpe en el contrato ese día", (o) => o.golpes === 1);
rep("vence en menos de 45 días", (o) => o.dte < 45);
rep("vence en más de 90 días", (o) => o.dte > 90);
console.log(`\n  resultado: ratio ${r.r.toFixed(2)} · ${r.pg.toFixed(0)}% aciertos · ${r.neto >= 0 ? "+" : "−"}$${Math.abs(Math.round(r.neto)).toLocaleString("en-US")} · ${$(sel.reduce((a, o) => a + o.coste * 100, 0))} para comprarlas todas`);
console.log(`  por día: ${(sel.length / new Set(sel.map((o) => o.dC)).size).toFixed(1)} contratos\n`);
