// ═══════════════════════════════════════════════════════════════════════════════════════════
// PASO 3 — ¿LA MAGNITUD DEL GEX A LAS 11:00 ANTICIPA LA COLA DEL CÓNDOR?
//
// Lo que ya se midió y falló: el SIGNO del GEX como filtro, contra la MEDIA (t=0,67).
// Lo que se mide aquí, y es distinto: la MAGNITUD contra la COLA.
//   · P(pérdida > $2.000) y P(pérdida > $4.000) en el tercil alto vs el bajo de la señal
//   · percentil 5 y percentil 1 del P&L de cada tercil
//   · si se filtrara: cuánto baja el PEOR DÍA, cuánto baja la PEOR RACHA, cuánto ingreso se pierde
//   · la métrica que decide: $/año retenidos por cada $ de caída eliminada
//
// PRUEBAS DECLARADAS: 9 señales (abajo). Listón de Bonferroni con 9 y, para ser honestos,
// también con 56 (las 17 de régimen + 30 de gestión que ya se hicieron sobre estos mismos días).
//
// NADA DE FUTURO: todo lo que entra en la señal es de las 11:00 o anterior. El OI es la foto
// de la OCC de las 06:32 (cierre de ayer). Se mide además la versión OPERABLE (umbral rodante
// sobre los 60 días previos) porque el corte por terciles del período entero ya usa el futuro
// en el UMBRAL aunque no en la señal.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync } from "node:fs";
import { listonT, tWelch } from "../lib/barreraHallazgos";

const filas = JSON.parse(readFileSync("scripts/cola-gex-filas.json", "utf8"))
  .sort((a, b) => a.fecha.localeCompare(b.fecha));

// ── VIX del cierre de AYER, como control: ¿algo predice la cola, o nada? ────────────────────
const vix = JSON.parse(readFileSync("scripts/cache-theta/vol-indices/VIX.json", "utf8"));
const vix9 = JSON.parse(readFileSync("scripts/cache-theta/vol-indices/VIX9D.json", "utf8"));
const clavesVix = Object.keys(vix).sort();
function ayer(fecha, tabla, claves) {
  const k = fecha.replace(/-/g, "");
  let ult = null;
  for (const c of claves) { if (c >= k) break; ult = c; }
  return ult ? tabla[ult] : null;
}
for (const f of filas) {
  f.vixAyer = ayer(f.fecha, vix, clavesVix);
  const c9 = Object.keys(vix9).sort();
  f.vix9Ayer = ayer(f.fecha, vix9, c9);
}
const sinVix = filas.filter((f) => !(f.vixAyer > 0)).length;
console.log(`días sin VIX de la víspera: ${sinVix} de ${filas.length}`);

// ── las 9 señales declaradas ───────────────────────────────────────────────────────────────
// Cada una: nombre, valor, y el LADO que la hipótesis dice que es peligroso.
// La hipótesis de partida: gamma MUY NEGATIVA = dealers amplifican = desplomes. Peligro = valor BAJO.
const SENALES = [
  { id: "gexNetSuave",   f: (r) => r.gexNetSuave,    peligro: "bajo", que: "GEX neto en $ (crudo)" },
  { id: "gexNetNorm",    f: (r) => r.gexNetNorm,     peligro: "bajo", que: "GEX neto / S² (sin nivel de índice)" },
  { id: "gexRatio",      f: (r) => r.gexRatio,       peligro: "bajo", que: "neto / total (escala libre, −1..+1)" },
  { id: "gexAbsSuave",   f: (r) => r.gexAbsSuave,    peligro: "alto", que: "gamma TOTAL en $ (magnitud)" },
  { id: "gexZonaNet",    f: (r) => r.gexZonaNet,     peligro: "bajo", que: "neto sólo en la zona ±25 pts" },
  { id: "zonaSobreTot",  f: (r) => r.zonaSobreTotal, peligro: "bajo", que: "% de la gamma dentro de ±25 pts" },
  { id: "distFlip",      f: (r) => r.distFlip,       peligro: "bajo", que: "(spot − gamma cero)/spot" },
  { id: "gexNetPct60",   f: (r) => r.pct60Net,       peligro: "bajo", que: "percentil del neto en los 60 días previos" },
  { id: "vixAyer",       f: (r) => r.vixAyer,        peligro: "alto", que: "CONTROL: VIX del cierre de ayer" },
];
const PRUEBAS = SENALES.length;

// percentil rodante del neto normalizado contra los 60 días previos (100% observable)
for (let i = 0; i < filas.length; i++) {
  const ven = filas.slice(Math.max(0, i - 60), i).map((r) => r.gexNetNorm);
  filas[i].pct60Net = ven.length >= 30 ? ven.filter((v) => v < filas[i].gexNetNorm).length / ven.length : null;
}

// ── utilidades ─────────────────────────────────────────────────────────────────────────────
const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const media = (v) => v.reduce((s, x) => s + x, 0) / v.length;
const pctil = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))]; };
const ANIOS = filas.length / 252;

function racha(ops) {          // peor caída acumulada, en el orden real de fechas
  let pico = 0, acum = 0, peor = 0;
  for (const o of ops) { acum += o.pl; pico = Math.max(pico, acum); peor = Math.min(peor, acum - pico); }
  return peor;
}
function resumen(ops, anios) {
  const pls = ops.map((o) => o.pl);
  const total = pls.reduce((s, x) => s + x, 0);
  return {
    n: ops.length, total, porAnio: total / anios, media: total / ops.length,
    peorDia: Math.min(...pls), p1: pctil(pls, 0.01), p5: pctil(pls, 0.05),
    racha: racha(ops),
    p2k: pls.filter((x) => x < -2000).length / pls.length,
    p4k: pls.filter((x) => x < -4000).length / pls.length,
    acierto: pls.filter((x) => x > 0).length / pls.length,
  };
}
// z de la diferencia de dos proporciones
function zProp(k1, n1, k2, n2) {
  if (!n1 || !n2) return 0;
  const p = (k1 + k2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  return se > 0 ? (k1 / n1 - k2 / n2) / se : 0;
}

const BASE = resumen(filas, ANIOS);
console.log(`\n═══ LÍNEA BASE · ${BASE.n} días · ${ANIOS.toFixed(2)} años ═══`);
console.log(`  total ${eur(BASE.total)} · ${eur(BASE.porAnio)}/año · media ${eur(BASE.media)}/día · acierto ${(BASE.acierto * 100).toFixed(1)}%`);
console.log(`  PEOR DÍA ${eur(BASE.peorDia)} · p1 ${eur(BASE.p1)} · p5 ${eur(BASE.p5)} · PEOR RACHA ${eur(BASE.racha)}`);
console.log(`  días con pérdida > $2.000: ${(BASE.p2k * 100).toFixed(1)}% (${Math.round(BASE.p2k * BASE.n)}) · > $4.000: ${(BASE.p4k * 100).toFixed(1)}% (${Math.round(BASE.p4k * BASE.n)})`);

// ═══ A · LA COLA POR TERCILES ══════════════════════════════════════════════════════════════
console.log(`\n\n═══ A · ¿LA MAGNITUD DEL GEX CONCENTRA LOS DESPLOMES? — terciles ═══`);
console.log(`(tercil 1 = valor MÁS BAJO de la señal · tercil 3 = MÁS ALTO)\n`);
console.log("| señal | tercil | n | media | p5 | p1 | peor día | P(<−2k) | P(<−4k) |");
console.log("|---|---|---|---|---|---|---|---|---|");

const resultados = [];
for (const s of SENALES) {
  const val = filas.filter((r) => s.f(r) != null && isFinite(s.f(r)));
  const ord = [...val].sort((a, b) => s.f(a) - s.f(b));
  const k = Math.floor(ord.length / 3);
  const T = [ord.slice(0, k), ord.slice(k, ord.length - k), ord.slice(ord.length - k)];
  const R = T.map((g) => resumen(g, g.length / 252));
  for (let i = 0; i < 3; i++)
    console.log(`| ${i === 0 ? s.id : ""} | T${i + 1} | ${R[i].n} | ${eur(R[i].media)} | ${eur(R[i].p5)} | ${eur(R[i].p1)} | ${eur(R[i].peorDia)} | ${(R[i].p2k * 100).toFixed(1)}% | ${(R[i].p4k * 100).toFixed(1)}% |`);

  // el lado "peligroso" según la hipótesis, contra el otro extremo
  const mal = s.peligro === "bajo" ? T[0] : T[2];
  const bien = s.peligro === "bajo" ? T[2] : T[0];
  const z2k = zProp(mal.filter((x) => x.pl < -2000).length, mal.length, bien.filter((x) => x.pl < -2000).length, bien.length);
  const z4k = zProp(mal.filter((x) => x.pl < -4000).length, mal.length, bien.filter((x) => x.pl < -4000).length, bien.length);
  const tMedia = tWelch(mal.map((x) => x.pl), bien.map((x) => x.pl));

  // signo en los TRES tercios del período
  const signos = [];
  for (const a of ["2024", "2025", "2026"]) {
    const g = val.filter((r) => r.fecha.startsWith(a));
    const o = [...g].sort((x, y) => s.f(x) - s.f(y));
    const kk = Math.floor(o.length / 3);
    if (kk < 5) { signos.push("?"); continue; }
    const m = s.peligro === "bajo" ? o.slice(0, kk) : o.slice(-kk);
    const b = s.peligro === "bajo" ? o.slice(-kk) : o.slice(0, kk);
    const d = m.filter((x) => x.pl < -2000).length / m.length - b.filter((x) => x.pl < -2000).length / b.length;
    signos.push(d > 0 ? "+" : d < 0 ? "−" : "0");
  }
  resultados.push({ s, val, T, R, z2k, z4k, tMedia, signos: signos.join("") });
}

console.log(`\n── el estadístico de la COLA (lado peligroso vs el otro extremo) ──`);
console.log(`listón de Bonferroni: |z| ≥ ${listonT(PRUEBAS)} con ${PRUEBAS} pruebas · |z| ≥ ${listonT(56)} si se cuentan las 56 hechas sobre estos días\n`);
console.log("| señal | qué es | lado peligroso | z de P(<−2k) | z de P(<−4k) | t de la media | signo por tercios |");
console.log("|---|---|---|---|---|---|---|");
for (const r of resultados)
  console.log(`| ${r.s.id} | ${r.s.que} | ${r.s.peligro} | ${r.z2k.toFixed(2)} | ${r.z4k.toFixed(2)} | ${r.tMedia.toFixed(2)} | ${r.signos} |`);

// ═══ B · SI SE FILTRARA ════════════════════════════════════════════════════════════════════
console.log(`\n\n═══ B · SIMULACIÓN DE FILTRO — quitar los días del lado peligroso ═══`);
console.log(`Métrica que decide: $/año RETENIDOS por cada $ de caída (peor racha) eliminada.\n`);
console.log("| señal | corte | días fuera | $/año | % del ingreso | peor día | Δ peor día | peor racha | Δ racha | p5 | P(<−2k) | $año/$caída |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|");

const simulaciones = [];
for (const r of resultados) {
  for (const [etiq, q] of [["tercil (33%)", 1 / 3], ["quintil (20%)", 0.2], ["decil (10%)", 0.1]]) {
    const ord = [...r.val].sort((a, b) => r.s.f(a) - r.s.f(b));
    const m = Math.floor(ord.length * q);
    const fuera = new Set((r.s.peligro === "bajo" ? ord.slice(0, m) : ord.slice(-m)).map((x) => x.fecha));
    const dentro = filas.filter((x) => !fuera.has(x.fecha));
    const R = resumen(dentro, ANIOS);          // mismos años de calendario: los días fuera no dan nada
    const ahorroRacha = R.racha - BASE.racha;  // positivo = la racha mejora
    const perdidaAnio = BASE.porAnio - R.porAnio;
    const ratio = ahorroRacha > 0 ? perdidaAnio / ahorroRacha : null;
    simulaciones.push({ id: r.s.id, etiq, R, ahorroRacha, perdidaAnio, ratio, fuera: fuera.size });
    console.log(`| ${r.s.id} | ${etiq} | ${fuera.size} | ${eur(R.porAnio)} | ${(R.porAnio / BASE.porAnio * 100).toFixed(0)}% | ${eur(R.peorDia)} | ${eur(R.peorDia - BASE.peorDia)} | ${eur(R.racha)} | ${eur(ahorroRacha)} | ${eur(R.p5)} | ${(R.p2k * 100).toFixed(1)}% | ${ratio == null ? "—" : "$" + ratio.toFixed(2)} |`);
  }
}

// ═══ C · LA VERSIÓN OPERABLE (umbral rodante, sin usar el futuro ni en el umbral) ══════════
console.log(`\n\n═══ C · VERSIÓN OPERABLE — umbral decidido con los 60 días PREVIOS ═══`);
console.log(`El corte por terciles del período entero usa el futuro EN EL UMBRAL. Esto no.\n`);
console.log("| señal | corte | días fuera | $/año | % ingreso | peor día | peor racha | Δ racha | P(<−2k) | $año/$caída |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
for (const s of SENALES) {
  for (const q of [1 / 3, 0.2, 0.1]) {
    const fuera = new Set();
    for (let i = 0; i < filas.length; i++) {
      const v = s.f(filas[i]); if (v == null || !isFinite(v)) continue;
      const ven = filas.slice(Math.max(0, i - 60), i).map(s.f).filter((x) => x != null && isFinite(x));
      if (ven.length < 30) continue;
      const p = ven.filter((x) => x < v).length / ven.length;
      if (s.peligro === "bajo" ? p < q : p > 1 - q) fuera.add(filas[i].fecha);
    }
    const dentro = filas.filter((x) => !fuera.has(x.fecha));
    const R = resumen(dentro, ANIOS);
    const ahorro = R.racha - BASE.racha;
    const perd = BASE.porAnio - R.porAnio;
    console.log(`| ${s.id} | ${(q * 100).toFixed(0)}% | ${fuera.size} | ${eur(R.porAnio)} | ${(R.porAnio / BASE.porAnio * 100).toFixed(0)}% | ${eur(R.peorDia)} | ${eur(R.racha)} | ${eur(ahorro)} | ${(R.p2k * 100).toFixed(1)}% | ${ahorro > 0 ? "$" + (perd / ahorro).toFixed(2) : "—"} |`);
  }
}

// ═══ D · ¿DÓNDE ESTÁN LOS DESPLOMES DE VERDAD? ═════════════════════════════════════════════
console.log(`\n\n═══ D · LOS 15 PEORES DÍAS, con su GEX ═══`);
console.log("| fecha | P&L | mov del día | gexRatio | pct60 | dist flip | VIX ayer | tercil de gexRatio |");
console.log("|---|---|---|---|---|---|---|---|");
const ordRatio = [...filas].sort((a, b) => a.gexRatio - b.gexRatio);
const terc = new Map(ordRatio.map((f, i) => [f.fecha, i < 653 / 3 ? "T1 bajo" : i < 653 * 2 / 3 ? "T2" : "T3 alto"]));
for (const f of [...filas].sort((a, b) => a.pl - b.pl).slice(0, 15))
  console.log(`| ${f.fecha} | ${eur(f.pl)} | ${(f.movDia * 100).toFixed(2)}% | ${f.gexRatio.toFixed(3)} | ${f.pct60Net == null ? "—" : (f.pct60Net * 100).toFixed(0) + "%"} | ${f.distFlip == null ? "—" : (f.distFlip * 100).toFixed(2) + "%"} | ${f.vixAyer ?? "—"} | ${terc.get(f.fecha)} |`);

// reparto de los días malos por tercil de cada señal
console.log(`\n── reparto de los días con pérdida > $2.000 por tercil de cada señal ──`);
console.log("| señal | T1 (bajo) | T2 | T3 (alto) | esperado si fuera azar |");
console.log("|---|---|---|---|---|");
for (const r of resultados) {
  const c = r.T.map((g) => g.filter((x) => x.pl < -2000).length);
  console.log(`| ${r.s.id} | ${c[0]} | ${c[1]} | ${c[2]} | ${((c[0] + c[1] + c[2]) / 3).toFixed(1)} |`);
}
