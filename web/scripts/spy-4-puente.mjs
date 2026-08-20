// ═══════════════════════════════════════════════════════════════════════════════════════════
// SPY · PASO 4 — LOS DOS PUENTES QUE QUEDAN
//
// El paso 3 deja dos pistas concretas, y ninguna es "no funciona":
//
//   PISTA 1  El muro CONTIENE MENOS que una raya al azar a la misma distancia (−6,6 pp de
//            vueltas al precio de apertura). Si el muro no es una barrera, quizá lo que dice
//            no es DÓNDE se para el precio sino HACIA DÓNDE va: entonces hay que probar los
//            niveles como DIRECCIÓN a las 09:35, sin esperar a ningún toque.
//              → PUENTE A: giro (gamma flip) e imán como brújula. Entrar a las 09:35, cerrar
//                al cierre. Es lo más barato posible: UNA ida y vuelta, sin esperar toques.
//
//   PISTA 2  La gamma se calcula CON LA IV de la cadena. Un día de IV alta ensancha el perfil
//            y aleja el muro. O sea: la DISTANCIA al muro puede ser un pronóstico de cuánto se
//            va a mover el día, no una barrera. Eso sí sería utilizable — para dimensionar, para
//            elegir el ancho de un cóndor, para saber si hoy hay recorrido que cobrar.
//              → PUENTE B: ¿predice la distancia al muro el RANGO del día? ¿y le gana al
//                predictor tonto (el rango de ayer)?
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/spy-4-puente.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync } from "node:fs";
import { listonT } from "../lib/barreraHallazgos.ts";

const CUENTA = 56389, MEDIA_HORQ = 0.005, SEC = 0.0000278, TAF = 0.000166, DIAS_ANO = 252;
const J = JSON.parse(readFileSync("scripts/spy-dias.json", "utf8"));
const DIAS = J.dias;
const CORTE = "2024-01-01";
const A = DIAS.filter((d) => d.fecha < CORTE), B = DIAS.filter((d) => d.fecha >= CORTE);

const media = (v) => v.reduce((a, b) => a + b, 0) / v.length;
function tStat(v) {
  if (v.length < 3) return 0;
  const m = media(v), sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
  return sd > 0 ? m / (sd / Math.sqrt(v.length)) : 0;
}
const P = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };
function rng(s0) { let s = s0 >>> 0; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function corr(x, y) {
  const mx = media(x), my = media(y);
  let sxy = 0, sx = 0, sy = 0;
  for (let i = 0; i < x.length; i++) { const a = x[i] - mx, b = y[i] - my; sxy += a * b; sx += a * a; sy += b * b; }
  return sxy / Math.sqrt(sx * sy);
}

console.log(`\n╔══ SPY · PASO 4: LOS DOS PUENTES ══╗\n  ${DIAS.length} días · ${DIAS[0].fecha} → ${DIAS[DIAS.length - 1].fecha}\n`);

// ═══ PUENTE A — LOS NIVELES COMO BRÚJULA, no como barrera ══════════════════════════════════
// Entrar a las 09:35 (relleno en el minuto SIGUIENTE, 09:36, nunca en el que se mira) y cerrar
// al cierre. Una sola ida y vuelta: es la forma más barata de cobrar una dirección.
function direccion(dia, senal) {
  const cam = dia.camino;
  const dir = senal(dia);
  if (dir === 0) return null;
  const midIn = cam[1][1];                                    // 09:36 — un minuto después de decidir
  const pIn = dir === 1 ? midIn + MEDIA_HORQ : midIn - MEDIA_HORQ;
  const acciones = Math.floor(CUENTA / pIn);
  const midOut = cam[cam.length - 1][1];
  const pOut = dir === 1 ? midOut - MEDIA_HORQ : midOut + MEDIA_HORQ;
  const tasas = (dir === 1 ? pOut : pIn) * acciones * SEC + Math.min(8.30, acciones * TAF);
  return { fecha: dia.fecha, ano: dia.ano, dir, acciones, pnl: dir * (pOut - pIn) * acciones - tasas };
}
const resumir = (ops, nDias) => {
  if (!ops.length) return { n: 0, anual: 0, t: 0, acierto: 0 };
  const v = ops.map((o) => o.pnl), tot = v.reduce((a, b) => a + b, 0);
  const orden = [...ops].sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  let acum = 0, pico = 0, peorRacha = 0;
  for (const o of orden) { acum += o.pnl; if (acum > pico) pico = acum; if (acum - pico < peorRacha) peorRacha = acum - pico; }
  const peor = orden.reduce((a, b) => (b.pnl < a.pnl ? b : a));
  return { n: ops.length, opsAno: +((ops.length / nDias) * DIAS_ANO).toFixed(1), mediaOp: +media(v).toFixed(1),
    t: +tStat(v).toFixed(2), acierto: +((v.filter((x) => x > 0).length / v.length) * 100).toFixed(1),
    anual: Math.round((tot / nDias) * DIAS_ANO), anualPct: +(((tot / nDias) * DIAS_ANO / CUENTA) * 100).toFixed(2),
    peorDia: Math.round(peor.pnl), peorFecha: peor.fecha, peorRacha: Math.round(peorRacha) };
};

const SENALES = {};
for (const L of ["gam", "gamD"]) {
  SENALES[`giro|${L}`] = (d) => { const f = d.niv[L].flip; if (f == null) return 0; return d.camino[0][1] > f ? 1 : -1; };
  SENALES[`iman|${L}`] = (d) => { const m = d.niv[L].imanBruto; if (m == null) return 0; return m > d.camino[0][1] ? 1 : m < d.camino[0][1] ? -1 : 0; };
}
SENALES["maxPain"] = (d) => { const m = d.niv.maxPain; if (m == null) return 0; return m > d.camino[0][1] ? 1 : m < d.camino[0][1] ? -1 : 0; };
SENALES["gammaNeta|gam"] = (d) => { const g = d.niv.gam.netPunto; if (g == null) return 0; return g > 0 ? 1 : -1; };

console.log(`── PUENTE A: los niveles como BRÚJULA (entrar 09:36, cerrar 16:00, una ida y vuelta) ──`);
console.log(`  ${"señal".padEnd(16)} ${"n".padStart(5)} ${"$/op".padStart(8)} ${"acierto".padStart(8)} ${"t".padStart(7)} ${"$/año".padStart(9)} | ${"A $/año".padStart(9)} ${"B $/año".padStart(9)}  signo`);
const brujula = {};
for (const [nom, sen] of Object.entries(SENALES)) {
  const ops = DIAS.map((d) => direccion(d, sen)).filter(Boolean);
  const r = resumir(ops, DIAS.length);
  const rA = resumir(ops.filter((o) => o.fecha < CORTE), A.length), rB = resumir(ops.filter((o) => o.fecha >= CORTE), B.length);
  brujula[nom] = { ...r, A: rA.anual, B: rB.anual, tA: rA.t, tB: rB.t, mismoSigno: Math.sign(rA.anual) === Math.sign(rB.anual) };
  console.log(`  ${nom.padEnd(16)} ${String(r.n).padStart(5)} ${r.mediaOp.toFixed(0).padStart(8)} ${(r.acierto + "%").padStart(8)} ${r.t.toFixed(2).padStart(7)} ${r.anual.toLocaleString("es").padStart(9)} | ${rA.anual.toLocaleString("es").padStart(9)} ${rB.anual.toLocaleString("es").padStart(9)}  ${brujula[nom].mismoSigno ? (rA.anual > 0 ? "✅ +/+" : "🔻 −/−") : "❌ se contradicen"}`);
}
// el listón de referencia: comprar SPY a las 09:36 y venderlo al cierre, SIEMPRE largo
const siempre = resumir(DIAS.map((d) => direccion(d, () => 1)).filter(Boolean), DIAS.length);
console.log(`  ${"[SIEMPRE LARGO]".padEnd(16)} ${String(siempre.n).padStart(5)} ${siempre.mediaOp.toFixed(0).padStart(8)} ${(siempre.acierto + "%").padStart(8)} ${siempre.t.toFixed(2).padStart(7)} ${siempre.anual.toLocaleString("es").padStart(9)}   ← el listón que hay que batir (intradía, sin dividendos ni noche)`);

// control del azar: la misma señal, con la dirección barajada
console.log(`\n  contra dirección AL AZAR (200 barajas, misma proporción de largos):`);
const azarA = {};
for (const [nom, sen] of Object.entries(SENALES)) {
  const dirs = DIAS.map((d) => sen(d)).filter((x) => x !== 0);
  const pLargo = dirs.filter((x) => x === 1).length / dirs.length;
  const rnd = rng(4242 + nom.length * 31);
  const anuales = [];
  for (let b = 0; b < 200; b++) {
    const ops = DIAS.map((d) => direccion(d, () => (rnd() < pLargo ? 1 : -1))).filter(Boolean);
    anuales.push((ops.reduce((a, x) => a + x.pnl, 0) / DIAS.length) * DIAS_ANO);
  }
  const pct = +((anuales.filter((x) => x < brujula[nom].anual).length / 200) * 100).toFixed(1);
  azarA[nom] = { p50: Math.round(P(anuales, 0.5)), percentil: pct };
  console.log(`    ${nom.padEnd(16)} real ${brujula[nom].anual.toLocaleString("es").padStart(9)} · azar p50 ${azarA[nom].p50.toLocaleString("es").padStart(9)} → percentil ${String(pct).padStart(5)}%`);
}

// ═══ PUENTE B — ¿ES LA DISTANCIA AL MURO UN PRONÓSTICO DE VOLATILIDAD? ═════════════════════
console.log(`\n── PUENTE B: ¿predice la DISTANCIA al muro el RANGO del día? ──`);
console.log(`  (si el muro no es barrera pero su distancia sí anticipa el recorrido, ESO es lo utilizable)`);
const rango = DIAS.map((d) => ((d.max - d.min) / d.entrada) * 100);
// predictor tonto: el rango del día ANTERIOR (lo último conocido al abrir — no hay futuro dentro)
const rangoAyer = DIAS.map((_, i) => (i === 0 ? null : rango[i - 1]));
const preds = {};
for (const L of ["gam", "gamD", "oi"]) {
  preds[`ancho|${L}`] = DIAS.map((d) => (d.niv[L].muroCall != null && d.niv[L].muroPut != null
    ? ((d.niv[L].muroCall - d.niv[L].muroPut) / d.entrada) * 100 : null));
  preds[`dCall|${L}`] = DIAS.map((d) => (d.niv[L].muroCall != null ? Math.abs((d.niv[L].muroCall - d.entrada) / d.entrada) * 100 : null));
}
preds["rangoAyer"] = rangoAyer;
const puenteB = {};
console.log(`  ${"predictor".padEnd(16)} ${"n".padStart(5)} ${"corr".padStart(7)} ${"corrA".padStart(7)} ${"corrB".padStart(7)}   rango medio del quintil bajo → alto`);
for (const [nom, v] of Object.entries(preds)) {
  const idx = v.map((x, i) => (x != null && Number.isFinite(x) ? i : -1)).filter((i) => i >= 0);
  if (idx.length < 100) { console.log(`  ${nom.padEnd(16)} muestra corta`); continue; }
  const x = idx.map((i) => v[i]), y = idx.map((i) => rango[i]);
  const iA = idx.filter((i) => DIAS[i].fecha < CORTE), iB = idx.filter((i) => DIAS[i].fecha >= CORTE);
  const c = corr(x, y), cA = corr(iA.map((i) => v[i]), iA.map((i) => rango[i])), cB = corr(iB.map((i) => v[i]), iB.map((i) => rango[i]));
  const orden = idx.map((i) => [v[i], rango[i]]).sort((a, b) => a[0] - b[0]);
  const q = Math.floor(orden.length / 5);
  const quintiles = [0, 1, 2, 3, 4].map((k) => media(orden.slice(k * q, k === 4 ? orden.length : (k + 1) * q).map((r) => r[1])));
  puenteB[nom] = { n: idx.length, corr: +c.toFixed(3), corrA: +cA.toFixed(3), corrB: +cB.toFixed(3), quintiles: quintiles.map((z) => +z.toFixed(2)) };
  console.log(`  ${nom.padEnd(16)} ${String(idx.length).padStart(5)} ${c.toFixed(3).padStart(7)} ${cA.toFixed(3).padStart(7)} ${cB.toFixed(3).padStart(7)}   ${quintiles.map((z) => z.toFixed(2) + "%").join(" → ")}`);
}
// ¿aporta algo POR ENCIMA del rango de ayer? correlación parcial, hecha a mano
const base = rangoAyer;
console.log(`\n  ¿aporta ALGO por encima del rango de ayer? (correlación del residuo)`);
for (const L of ["gam", "gamD", "oi"]) {
  const nom = `ancho|${L}`;
  const idx = preds[nom].map((x, i) => (x != null && base[i] != null ? i : -1)).filter((i) => i >= 0);
  const xb = idx.map((i) => base[i]), y = idx.map((i) => rango[i]), xa = idx.map((i) => preds[nom][i]);
  // residuo de y sobre xb, y residuo de xa sobre xb
  const reg = (yy, xx) => { const mx = media(xx), my = media(yy); let sxy = 0, sxx = 0;
    for (let i = 0; i < xx.length; i++) { sxy += (xx[i] - mx) * (yy[i] - my); sxx += (xx[i] - mx) ** 2; }
    const b = sxy / sxx; return yy.map((z, i) => z - (my + b * (xx[i] - mx))); };
  const cp = corr(reg(xa, xb), reg(y, xb));
  puenteB[`parcial|${L}`] = +cp.toFixed(3);
  console.log(`    ${nom.padEnd(16)} correlación parcial ${cp.toFixed(3)}  ${Math.abs(cp) > 0.15 ? "← aporta información propia" : "← no aporta casi nada sobre el rango de ayer"}`);
}

const PRUEBAS_TOTAL = 9 + 28 + Object.keys(SENALES).length + Object.keys(preds).length;
console.log(`\n── LISTÓN ACUMULADO ──`);
console.log(`  pruebas de esta línea de trabajo: 9 (paso 2) + 28 (puente distancia) + ${Object.keys(SENALES).length} (brújula) + ${Object.keys(preds).length} (volatilidad) = ${PRUEBAS_TOTAL}`);
console.log(`  → listón |t| ≥ ${listonT(PRUEBAS_TOTAL)}`);

writeFileSync("scripts/spy-puente.json", JSON.stringify({
  generado: new Date().toISOString(), brujula, azarA, siempreLargo: siempre, puenteB,
  pruebasTotal: PRUEBAS_TOTAL, liston: listonT(PRUEBAS_TOTAL),
}, null, 1), "utf8");
console.log(`\n  escrito scripts/spy-puente.json`);
