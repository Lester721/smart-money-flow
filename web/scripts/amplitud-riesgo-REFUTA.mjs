// REFUTACION — "la amplitud como herramienta de riesgo".
//
// El hallazgo dice que el mecanismo es RACIMO DE VOLATILIDAD, no prediccion. Si eso es cierto,
// la amplitud (donde esta el precio respecto a sus medias) es un TERMOMETRO de volatilidad, y
// hay termometros directos. El control que falta en los 5 scripts: correr EL MISMO
// PROCEDIMIENTO DE SELECCION sobre una familia de senales SIN NINGUN contenido de amplitud
// —volatilidad realizada de los cierres anteriores— con EL MISMO numero de combinaciones.
//
// Ademas: (1) el numero del titular es de PERIODO ENTERO para una configuracion elegida en H1;
// (2) el escalado "a riesgo igualado" de la parte 5 se calcula CON la mitad de prueba;
// (3) el cruce solo gana con UNA metrica de riesgo — la que se eligio tras ver fallar la otra.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/amplitud-riesgo-REFUTA.mjs

import { readFileSync } from "node:fs";
import { listonT } from "../lib/barreraHallazgos";
import { radiografia } from "../lib/radiografia";

const CUENTA = 56389, EFECTIVO = 7977;
const PRUEBAS = 60, LISTON = listonT(PRUEBAS);
const eur = (x) => (x == null || !Number.isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const pct = (x) => (x == null || !Number.isFinite(x) ? "—" : (x * 100).toFixed(1) + "%");
const suma = (v) => v.reduce((a, b) => a + b, 0);
const media = (v) => (v.length ? suma(v) / v.length : NaN);
const desv = (v) => { const m = media(v); return Math.sqrt(media(v.map((x) => (x - m) ** 2))); };

const { dias } = JSON.parse(readFileSync("scripts/amplitud-riesgo-dias.json", "utf8"));
const N = dias.length;

const caidaMax = (pl) => { let c = 0, p = 0, w = 0; for (const x of pl) { c += x; p = Math.max(p, c); w = Math.min(w, c - p); } return w; };
const es5de = (pl) => { const o = [...pl].sort((a, b) => a - b); return media(o.slice(0, Math.max(1, Math.round(pl.length * 0.05)))); };
const suelo = (pl) => { let c = EFECTIVO, m = EFECTIVO; for (const x of pl) { c += x; if (c < m) m = c; } return m; };

// ── SENALES, todas con cierres ESTRICTAMENTE anteriores ──────────────────────────────────────
const MC = [5, 10, 20, 50, 100, 200];
const MA = {};
for (const k of MC) MA[k] = dias.map((_, i) => { if (i < k) return null; let s = 0; for (let j = i - k; j < i; j++) s += dias[j].cierre; return s / k; });

// volatilidad realizada de los K rendimientos anteriores (nada del dia de hoy)
const ret = dias.map((d, i) => (i === 0 ? null : Math.log(d.cierre / dias[i - 1].cierre)));
const VK = [5, 10, 20, 50, 100];
const VOL = {};
for (const k of VK) VOL[k] = dias.map((_, i) => { if (i < k + 1) return null; const r = ret.slice(i - k, i); return r.some((x) => x == null) ? null : desv(r); });
// percentil de la vol de hoy dentro de sus 100 valores anteriores
const VPCT = {};
for (const k of VK) VPCT[k] = dias.map((_, i) => {
  const v = VOL[k][i]; if (v == null || i < 100) return null;
  const prev = VOL[k].slice(i - 100, i).filter((x) => x != null);
  return prev.length < 60 ? null : prev.filter((x) => x < v).length / prev.length;
});

// ── RADIOGRAFIA de lo que voy a medir ────────────────────────────────────────────────────────
radiografia(dias.map((d, i) => ({
  fecha: d.fecha, ano: d.ano, sp11: d.sp11, cierre: d.cierre,
  pl45: d.pnl["45"], cred45: d.cred["45"],
  ma5: MA[5][i], ma50: MA[50][i], vol20: VOL[20][i], vpct20: VPCT[20][i],
})), ["sp11", "cierre", "pl45", "cred45", "ma5", "ma50", "vol20", "vpct20"], "refutacion amplitud", { cerosLegitimos: [] });

// ── UNIVERSOS DE CANDIDATOS, del MISMO tamano ────────────────────────────────────────────────
const DISTS = [20, 25, 30, 35, 40, 45, 50];
const parejasMA = [];
for (let a = 0; a < MC.length; a++) for (let b = a + 1; b < MC.length; b++) parejasMA.push([MC[a], MC[b]]);   // 15
const parejasVOL = [];
for (const k of VK) for (const p of [0.50, 0.65, 0.80]) parejasVOL.push([k, p]);                             // 15

const okAMP = (i, d, c) => { const m1 = MA[c.a][i], m2 = MA[c.b][i]; return m1 != null && m2 != null && d.sp11 >= m1 && d.sp11 >= m2; };
const okVOL = (i, _d, c) => { const p = VPCT[c.k][i]; return p != null && p <= c.p; };
const okSIN = () => true;

function evalua(idx, c, k = 1) {
  const s = idx.map((i) => {
    const d = dias[i], p = d.pnl[String(c.dist)];
    if (p == null) return 0;
    return c.ok(i, d, c) ? p * k : 0;
  });
  return { s, n: s.filter((x) => x !== 0).length, a: suma(s) / (idx.length / 252), c: caidaMax(s),
           e: es5de(s), peor: Math.min(...s), sd: desv(s), su: suelo(s), tot: suma(s) };
}
const nombra = (c) => c.tipo === "amp" ? `±${c.dist} · sobre MA${c.a}+MA${c.b}` : c.tipo === "vol" ? `±${c.dist} · vol${c.k} bajo p${Math.round(c.p * 100)}` : `±${c.dist} sin filtro`;

const candAMP = [], candVOL = [], candSIN = [];
for (const dist of DISTS) {
  candSIN.push({ tipo: "sin", dist, ok: okSIN });
  for (const [a, b] of parejasMA) candAMP.push({ tipo: "amp", dist, a, b, ok: okAMP });
  for (const [k, p] of parejasVOL) candVOL.push({ tipo: "vol", dist, k, p, ok: okVOL });
}

const ANCHO = 106;
const raya = (t) => { console.log("\n" + "═".repeat(ANCHO)); console.log("  " + t); console.log("═".repeat(ANCHO)); };
const m2 = Math.floor(N / 2);
const IDX = [...Array(N).keys()];
const H = [IDX.slice(0, m2), IDX.slice(m2)];
const nomH = ["H1 " + dias[0].fecha + "→" + dias[m2 - 1].fecha, "H2 " + dias[m2].fecha + "→" + dias[N - 1].fecha];

console.log(`\n# REFUTACION — la amplitud como herramienta de riesgo\n`);
console.log(`${N} sesiones · ${dias[0].fecha} → ${dias[N - 1].fecha} · ${PRUEBAS} pruebas declaradas · liston |t| = ${LISTON}`);
console.log(`Candidatos por familia: AMPLITUD ${candAMP.length} · VOLATILIDAD ${candVOL.length} · sin filtro ${candSIN.length} — mismo tamano de busqueda`);

// ═══ 1 · DE DONDE SALE EL NUMERO DEL TITULAR ════════════════════════════════════════════════
raya("1 · EL NUMERO DEL TITULAR ES DE PERIODO ENTERO PARA UNA CONFIGURACION ELEGIDA EN H1");
const GANA1 = { tipo: "amp", dist: 45, a: 5, b: 50, ok: okAMP };   // elegida en H1
const GANA2 = { tipo: "amp", dist: 45, a: 5, b: 20, ok: okAMP };   // elegida en H2
console.log("\n| configuracion | tramo | participo en elegirla | $/ano | caida max | 5% peor | peor dia |");
console.log("|---|---|---|---|---|---|---|");
for (const [c, ajuste] of [[GANA1, 0], [GANA2, 1]]) {
  for (const [nm, idx, part] of [["periodo ENTERO", IDX, "si, la mitad"], [nomH[0].slice(0, 2), H[0], ajuste === 0 ? "**SI**" : "no"], [nomH[1].slice(0, 2), H[1], ajuste === 1 ? "**SI**" : "no"]]) {
    const m = evalua(idx, c);
    console.log(`| ${nombra(c)} | ${nm} | ${part} | ${eur(m.a)} | ${eur(m.c)} | ${eur(m.e)} | ${eur(m.peor)} |`);
  }
}

// ═══ 2 · EL CONTROL QUE FALTA ═══════════════════════════════════════════════════════════════
raya("2 · EL CONTROL QUE FALTA — mismo procedimiento, senal SIN amplitud (volatilidad realizada)");
console.log(`
  Identico protocolo al del hallazgo: se elige por MENOR 5% peor en la mitad de ajuste, entre un
  universo del MISMO tamano, y se aplica TAL CUAL a la otra. La unica diferencia es la senal:
  en vez de "esta el precio sobre sus medias" (amplitud), "esta la volatilidad de los ultimos
  K dias por debajo de su percentil p" (termometro puro, cero contenido de amplitud).
`);
const elige = (idxAj, cands) => cands.map((c) => ({ c, m: evalua(idxAj, c) })).filter((x) => x.m.n >= 30).sort((x, y) => y.m.e - x.m.e)[0];
console.log("| ajuste | familia | elegida | 5% peor ajuste | prueba | 5% peor prueba | $/ano prueba | caida prueba | dias op. |");
console.log("|---|---|---|---|---|---|---|---|---|");
const cruces = {};
for (const [aj, pr] of [[0, 1], [1, 0]]) {
  for (const [fam, cands] of [["AMPLITUD", candAMP], ["VOLATILIDAD", candVOL]]) {
    const el = elige(H[aj], cands);
    const m = evalua(H[pr], el.c);
    (cruces[fam] ??= []).push({ aj, pr, c: el.c, m });
    console.log(`| ${nomH[aj].slice(0, 2)} | ${fam} | ${nombra(el.c)} | ${eur(el.m.e)} | ${nomH[pr].slice(0, 2)} | ${eur(m.e)} | ${eur(m.a)} | ${eur(m.c)} | ${m.n} |`);
  }
}

// ═══ 3 · CARA A CARA A RIESGO IGUALADO, ESCALANDO EN LA MITAD DE AJUSTE ═════════════════════
raya("3 · CARA A CARA A 5% PEOR IGUALADO — y el escalado SIN mirar la mitad de prueba");
console.log(`
  La parte 5 del hallazgo calcula el factor de contratos f = objetivo/riesgo usando la mitad de
  PRUEBA. Eso no es un procedimiento que se pueda seguir el lunes: nadie conoce su 5% peor futuro.
  Aqui el objetivo de riesgo y el factor se fijan en la mitad de AJUSTE y se aplican tal cual.
`);
const resumen3 = [];
for (const [aj, pr] of [[0, 1], [1, 0]]) {
  const A = cruces.AMPLITUD.find((x) => x.aj === aj), V = cruces.VOLATILIDAD.find((x) => x.aj === aj);
  const mAaj = evalua(H[aj], A.c), mVaj = evalua(H[aj], V.c);
  console.log(`\n### Ajuste en ${nomH[aj].slice(0, 2)} → PRUEBA en ${nomH[pr]}\n`);
  console.log("| brazo | escalado | dias op. | $/ano en prueba | 5% peor en prueba | caida | % cuenta | suelo EFECTIVO |");
  console.log("|---|---|---|---|---|---|---|---|");
  const obj = mAaj.e;
  const b25 = { tipo: "sin", dist: 25, ok: okSIN }, b45 = { tipo: "sin", dist: 45, ok: okSIN };
  const brazos = [
    [`AMPLITUD ${nombra(A.c)}`, 1, A.c],
    [`VOLATILIDAD ${nombra(V.c)}`, obj / mVaj.e, V.c],
    [`TAMANO base ±25 encogida`, obj / evalua(H[aj], b25).e, b25],
    [`DISTANCIA ±45 sin filtro, encogida`, obj / evalua(H[aj], b45).e, b45],
  ];
  const res = [];
  for (const [n, f, c] of brazos) {
    const m = evalua(H[pr], c, f); res.push({ n, a: m.a, e: m.e });
    console.log(`| ${n} | ${f.toFixed(3)} contr. | ${m.n} | ${eur(m.a)} | ${eur(m.e)} | ${eur(m.c)} | ${pct(m.c / CUENTA)} | ${eur(m.su)} |`);
  }
  const mejor = res.slice(1).sort((x, y) => y.a - x.a)[0];
  const gana = res[0].a > mejor.a;
  resumen3.push({ aj, gana, prop: res[0].a, mejor });
  console.log(`\n   → ${gana ? "**gana AMPLITUD**" : "**NO gana la amplitud** — la bate " + mejor.n}: ${eur(res[0].a)}/ano contra ${eur(mejor.a)}.`);
}

// ═══ 4 · LA METRICA ═════════════════════════════════════════════════════════════════════════
raya("4 · LA METRICA — el cruce solo se probo con la que sobrevivio; aqui, con las cuatro");
console.log(`
  El script 1 iguala por CAIDA y su propio veredicto dice "NO gana en las dos direcciones". El
  hallazgo cambia entonces a "5% peor" y gana. Se repite el cruce entero con cada metrica de
  riesgo, eligiendo la configuracion con esa misma metrica en la mitad de ajuste e igualando
  el tamano de la base por esa misma metrica.
`);
function spearman(a, b) {
  const rk = (v) => { const o = v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]); const r = new Array(v.length); o.forEach(([, i], j) => (r[i] = j + 1)); return r; };
  const x = rk(a), y = rk(b), n = a.length, mx = media(x), my = media(y);
  let nu = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { nu += (x[i] - mx) * (y[i] - my); dx += (x[i] - mx) ** 2; dy += (y[i] - my) ** 2; }
  return nu / Math.sqrt(dx * dy);
}
const varSet = candAMP.concat(candSIN).filter((c) => [25, 30, 45].includes(c.dist));
const mH = varSet.map((c) => [evalua(H[0], c), evalua(H[1], c)]);
const METRICAS = [["5% peor", (m) => m.e], ["caida maxima", (m) => m.c], ["peor dia", (m) => m.peor], ["desv. tipica diaria", (m) => -m.sd]];
const filasMet = [];
console.log(`| metrica de riesgo | rho H1-H2 (${varSet.length} var.) | H1→H2 bate al tamano | H2→H1 bate al tamano | las dos |`);
console.log("|---|---|---|---|---|");
for (const [nm, get] of METRICAS) {
  const rho = spearman(mH.map((x) => get(x[0])), mH.map((x) => get(x[1])));
  const gana = [], det = [];
  for (const [aj, pr] of [[0, 1], [1, 0]]) {
    const el = candAMP.map((c) => ({ c, m: evalua(H[aj], c) })).filter((x) => x.m.n >= 30).sort((x, y) => get(y.m) - get(x.m))[0];
    const mAaj = evalua(H[aj], el.c), base = { tipo: "sin", dist: 25, ok: okSIN };
    const f = get(mAaj) / get(evalua(H[aj], base));
    const A = evalua(H[pr], el.c), T = evalua(H[pr], base, f);
    gana.push(A.a > T.a); det.push(`${nombra(el.c)}: ${eur(A.a)} vs ${eur(T.a)}`);
  }
  filasMet.push({ nm, rho, gana, det });
  console.log(`| ${nm} | ${rho.toFixed(2)} | ${gana[0] ? "**si**" : "NO"} | ${gana[1] ? "**si**" : "NO"} | ${gana.every(Boolean) ? "**SI**" : "**NO**"} |`);
}
for (const f of filasMet) console.log(`   ${f.nm.padEnd(22)} H1→H2 ${f.det[0]}  |  H2→H1 ${f.det[1]}`);

// ═══ 5 · EL NULO CON RACIMOS ════════════════════════════════════════════════════════════════
raya("5 · EL NULO, BIEN HECHO — sorteo por BLOQUES en vez de dia a dia");
console.log(`
  El sorteo de la parte 2 baraja dias sueltos. Eso destruye el racimo de volatilidad, que es —
  segun el propio hallazgo— el mecanismo. Cualquier regla que apague en racimos gana a un sorteo
  uniforme por construccion. El nulo honesto conserva la estructura: se apagan BLOQUES contiguos
  de las mismas longitudes que los tramos apagados del filtro, colocados al azar.
`);
let rng = 20260820; const rnd = () => { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng / 0x7fffffff; };
const REPS = 4000;
console.log("| tramo | metrica | FILTRO ±45·MA5+MA50 | mediana UNIFORME | perc. | mediana BLOQUES | perc. |");
console.log("|---|---|---|---|---|---|---|");
const percBloques = [];
for (const [nm, idx] of [["periodo entero", IDX], [nomH[0].slice(0, 2), H[0]], [nomH[1].slice(0, 2), H[1]]]) {
  const pl = idx.map((i) => dias[i].pnl["45"] ?? 0);
  const on = idx.map((i) => (GANA1.ok(i, dias[i], GANA1) && dias[i].pnl["45"] != null ? 1 : 0));
  const nOp = suma(on);
  const bloques = []; let run = 0;
  for (const v of on) { if (!v) run++; else if (run) { bloques.push(run); run = 0; } }
  if (run) bloques.push(run);
  const sReal = pl.map((x, i) => (on[i] ? x : 0));
  const real = { e: es5de(sReal), c: caidaMax(sReal) };
  const dU = { e: [], c: [] }, dB = { e: [], c: [] };
  for (let r = 0; r < REPS; r++) {
    const ord = pl.map((_, i) => i);
    for (let i = ord.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ord[i], ord[j]] = [ord[j], ord[i]]; }
    const oU = new Uint8Array(pl.length); for (let i = 0; i < nOp; i++) oU[ord[i]] = 1;
    const sU = pl.map((x, i) => (oU[i] ? x : 0)); dU.e.push(es5de(sU)); dU.c.push(caidaMax(sU));
    const oB = new Uint8Array(pl.length).fill(1);
    for (const L of bloques) { const st = Math.floor(rnd() * Math.max(1, pl.length - L)); for (let i = st; i < st + L && i < pl.length; i++) oB[i] = 0; }
    const sB = pl.map((x, i) => (oB[i] ? x : 0)); dB.e.push(es5de(sB)); dB.c.push(caidaMax(sB));
  }
  const perc = (arr, v) => arr.filter((x) => x < v).length / arr.length;
  const med = (arr) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  for (const [k, etq] of [["e", "5% peor"], ["c", "caida maxima"]]) {
    const pB = perc(dB[k], real[k]);
    if (k === "e") percBloques.push({ nm, p: pB });
    console.log(`| ${nm} | ${etq} | ${eur(real[k])} | ${eur(med(dU[k]))} | ${(perc(dU[k], real[k]) * 100).toFixed(1)}% | ${eur(med(dB[k]))} | **${(pB * 100).toFixed(1)}%** |`);
  }
}

// ═══ 6 · CONCENTRACION ══════════════════════════════════════════════════════════════════════
raya("6 · CONCENTRACION — cuanto del resultado vive en un punado de sesiones");
const sG = evalua(IDX, GANA1).s;
const opIdx = sG.map((x, i) => (x !== 0 ? i : -1)).filter((i) => i >= 0);
const ordG = [...opIdx].sort((a, b) => sG[b] - sG[a]);
const tot = suma(sG);
console.log(`\n±45·MA5+MA50 · ${opIdx.length} sesiones operadas · total ${eur(tot)} en ${(N / 252).toFixed(2)} anos\n`);
console.log("| se quitan | $ restantes | $/ano | sigue positivo |");
console.log("|---|---|---|---|");
for (const k of [0, 5, 10, 20, 40]) {
  const quitar = new Set(ordG.slice(0, k));
  const t = suma(sG.filter((_, i) => !quitar.has(i)));
  console.log(`| las ${k} mejores sesiones | ${eur(t)} | ${eur(t / (N / 252))} | ${t > 0 ? "si" : "**NO**"} |`);
}
const n2022 = sG.filter((x, i) => x !== 0 && dias[i].ano === "2022").length;
const p2022 = suma(sG.filter((_, i) => dias[i].ano === "2022"));
console.log(`\n   2022 aporta ${eur(p2022)} de ${eur(tot)} (${pct(p2022 / tot)}) con solo ${n2022} sesiones operadas`);
console.log(`   de ${opIdx.length} (${pct(n2022 / opIdx.length)}). El fichero arranca en 2022-04-27, ya dentro del mercado bajista.`);

// ═══ VEREDICTO ══════════════════════════════════════════════════════════════════════════════
raya("VEREDICTO DE LA REFUTACION");
console.log(`
  · AMPLITUD, 5% peor fuera de muestra: ${cruces.AMPLITUD.map((x) => eur(x.m.e)).join("  y  ")}
  · VOLATILIDAD pura, mismo protocolo:  ${cruces.VOLATILIDAD.map((x) => eur(x.m.e)).join("  y  ")}
  · AMPLITUD, $/ano fuera de muestra:   ${cruces.AMPLITUD.map((x) => eur(x.m.a)).join("  y  ")}
  · VOLATILIDAD, $/ano fuera de muestra: ${cruces.VOLATILIDAD.map((x) => eur(x.m.a)).join("  y  ")}
  · Metricas de riesgo con las que el cruce gana en las DOS direcciones: ${filasMet.filter((f) => f.gana.every(Boolean)).map((f) => f.nm).join(", ") || "NINGUNA"}
  · Metricas con las que NO: ${filasMet.filter((f) => !f.gana.every(Boolean)).map((f) => f.nm).join(", ") || "ninguna"}
  · Nulo de BLOQUES, percentil del 5% peor: ${percBloques.map((x) => x.nm + " " + (x.p * 100).toFixed(1) + "%").join(" · ")}
  · Con el escalado honesto (en la mitad de ajuste) la amplitud gana en ${resumen3.filter((x) => x.gana).length} de 2 direcciones.
`);
