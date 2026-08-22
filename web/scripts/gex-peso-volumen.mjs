// ¿ESTÁBAMOS PESANDO EL GEX CON LA BÁSCULA EQUIVOCADA?
//
// ═══ LA DUDA ════════════════════════════════════════════════════════════════════════════════
//
// Nuestro GEX pesa la gamma de cada strike por el INTERÉS ABIERTO de ayer. Un documento del
// propio proyecto (`Proceso 0DTE.md` §8) trae esta medición:
//
//     SPXW C7450   volumen 66.047   interés abierto 3.039   → 22 veces más
//     SPXW C7440   volumen 44.924   interés abierto 1.617   → 28 veces
//     SPY  P738    volumen 327.841  interés abierto 8.079   → 41 veces
//
// El interés abierto se publica con un día de retraso y no recoge lo que abre y cierra dentro de
// la misma sesión — que en 0DTE es casi todo. Así que puede que llevemos midiendo la gamma con un
// número que representa una fracción diminuta de lo que de verdad se movió ese día.
//
// Si eso es así, la conclusión de que "el GEX vivo no predice" estaría mal: no porque el GEX no
// sirva, sino porque lo pesábamos con la báscula equivocada.
//
// ═══ EL CONTRAARGUMENTO, ESCRITO ANTES DE MIRAR ═════════════════════════════════════════════
//
// El GEX es exposición de POSICIÓN, y el volumen no es posición: cuenta aperturas y cierres
// mezclados. Un contrato que se abre y se cierra el mismo día suma 2 al volumen y 0 a la posición.
// Teóricamente el interés abierto es lo correcto. Pero si en 0DTE está 20-40 veces por debajo de
// la actividad real, la teoría puede estar describiendo algo que ya no existe.
//
// Por eso se mide en vez de discutirse. Y se miden LOS DOS pesos sobre LOS MISMOS DÍAS, que es la
// única forma de que la comparación signifique algo.
//
// ═══ LO QUE SE PREGUNTA ═════════════════════════════════════════════════════════════════════
//
//   1. ¿son de verdad tan distintos los dos pesos? (¿dónde cae el imán con cada uno?)
//   2. ¿predice alguno la dirección a 5, 15 y 30 minutos?
//
// El listón es el de siempre: entrar al azar da 0,209 puntos por operación.
//
// Uso: node --import tsx --max-old-space-size=12288 scripts/gex-peso-volumen.mjs

import { readFileSync, readdirSync, existsSync } from "node:fs";

const DIR = "scripts/cache-theta/gex-2026";
const OIDIR = "scripts/cache-theta/oi-spxw";
const VOLDIR = "scripts/cache-theta/vol-spxw";
const BARRAS = [1, 3, 6];              // 5, 15 y 30 minutos
const LISTON = 0.209;

const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const sd = (v) => { const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const tDe = (v) => (v.length > 2 ? media(v) / (sd(v) / Math.sqrt(v.length)) : NaN);
const num = (x, d = 3) => (isFinite(x) ? x.toFixed(d) : "—");

const phi = (x) => 0.3989422804014327 * Math.exp((-x * x) / 2);
function gammaBS(S, K, T, v) {
  if (!(S > 0) || !(K > 0) || !(T > 0) || !(v > 0)) return 0;
  const d1 = (Math.log(S / K) + (v * v / 2) * T) / (v * Math.sqrt(T));
  const g = phi(d1) / (S * v * Math.sqrt(T));
  return isFinite(g) ? g : 0;
}

function leerDia(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const ix = ["strike", "timestamp", "implied_vol", "underlying_price"].map((c) => cab.indexOf(c));
  if (ix.some((x) => x < 0)) return null;
  const [iK, iT, iV, iU] = ix;
  const porHora = new Map();
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(",");
    const h = String(c[iT]).slice(11, 16);
    const K = Number(c[iK]), iv = Number(c[iV]), sp = Number(c[iU]);
    if (!(K > 0) || !(iv > 0.01) || iv > 4 || !(sp > 0)) continue;
    if (!porHora.has(h)) porHora.set(h, { spot: sp, strikes: [] });
    porHora.get(h).strikes.push({ K, iv });
  }
  return porHora;
}

// ── SÓLO los días que tienen LAS DOS básculas ──────────────────────────────
// Comparar el peso A en unos días y el B en otros no compara nada.
const fechas = [...new Set(readdirSync(DIR).map((f) => f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/)?.[1]).filter(Boolean))]
  .filter((d) => existsSync(`${OIDIR}/${d}.json`) && existsSync(`${VOLDIR}/${d}.json`))
  .sort();
console.log(`\n## ${fechas.length} días CON LAS DOS básculas (${fechas[0]} → ${fechas[fechas.length - 1]})`);
console.log(`   la descarga de volumen aún corre: esto es un PRIMER VISTAZO, no la medición final\n`);

const obs = [];
let sumaOI = 0, sumaVol = 0, nStrikes = 0, imanIgual = 0, imanTotal = 0;

for (let d = 0; d < fechas.length; d++) {
  const fecha = fechas[d];
  if (d % 100 === 0) console.log(`   ${d}/${fechas.length} · ${fecha}`);
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P) continue;
  const oi = JSON.parse(readFileSync(`${OIDIR}/${fecha}.json`, "utf8"));
  const vol = JSON.parse(readFileSync(`${VOLDIR}/${fecha}.json`, "utf8"));

  const horas = [...C.keys()].filter((h) => h >= "09:35" && h <= "15:55").sort();
  if (horas.length < 10) continue;

  const barras = [];
  for (const h of horas) {
    const cc = C.get(h), pp = P.get(h);
    if (!cc || !pp) continue;
    const S = cc.spot;
    const min = (16 - Number(h.slice(0, 2))) * 60 - Number(h.slice(3));
    const T = Math.max(min, 1) / (60 * 6.5 * 252);

    const porOI = new Map(), porVol = new Map();
    for (const [lado, lista] of [["C", cc.strikes], ["P", pp.strikes]]) {
      for (const s of lista) {
        const g1 = gammaBS(S, s.K, T, s.iv) * 100 * S * S * 0.01;
        if (!isFinite(g1) || g1 <= 0) continue;
        const wOI = Number(oi[`${s.K}|${lado}`] ?? 0);
        const wV = Array.isArray(vol[`${s.K}|${lado}`]) ? vol[`${s.K}|${lado}`][0] : 0;
        if (wOI > 0) porOI.set(s.K, (porOI.get(s.K) ?? 0) + g1 * wOI);
        if (wV > 0) porVol.set(s.K, (porVol.get(s.K) ?? 0) + g1 * wV);
        if (h === "11:00") { sumaOI += wOI; sumaVol += wV; nStrikes++; }
      }
    }
    if (porOI.size < 5 || porVol.size < 5) continue;

    const mayor = (m) => { let k = null, mx = 0; for (const [K, g] of m) if (g > mx) { mx = g; k = K; } return k; };
    const imOI = mayor(porOI), imVol = mayor(porVol);
    if (imOI && imVol) { imanTotal++; if (imOI === imVol) imanIgual++; }
    barras.push({ S, imOI, imVol });
  }

  for (let i = 0; i < barras.length; i++) {
    const b = barras[i];
    const fila = { fecha, distOI: b.imOI - b.S, distVol: b.imVol - b.S };
    let sirve = false;
    for (const k of BARRAS) {
      if (i + k >= barras.length) continue;
      fila[`d${k}`] = barras[i + k].S - b.S;      // el movimiento EN PUNTOS
      sirve = true;
    }
    if (sirve) obs.push(fila);
  }
}

console.log(`\n${obs.length.toLocaleString("es-ES")} barras medidas\n`);
if (obs.length < 3000) { console.error("Muestra insuficiente para un vistazo."); process.exit(1); }

// ── 1 · ¿SON DE VERDAD TAN DISTINTAS LAS DOS BÁSCULAS? ─────────────────────
console.log("=".repeat(92));
console.log("  1 · ¿SON DISTINTAS LAS DOS BÁSCULAS?");
console.log("=".repeat(92) + "\n");
console.log(`  volumen medio por strike a las 11:00: ${Math.round(sumaVol / nStrikes).toLocaleString("es-ES")}`);
console.log(`  interés abierto medio:                ${Math.round(sumaOI / nStrikes).toLocaleString("es-ES")}`);
console.log(`  el volumen es **${(sumaVol / Math.max(1, sumaOI)).toFixed(1)} veces** el interés abierto\n`);
console.log(`  el imán cae en el MISMO strike con las dos básculas: ${(imanIgual / imanTotal * 100).toFixed(1)}% de las barras`);
console.log(`  (si fuera ~100%, cambiar la báscula no cambiaría nada y la duda se cierra sola)\n`);

// ── 2 · ¿PREDICE ALGUNA? ───────────────────────────────────────────────────
const puntos = (o, k, campo) => {
  const dd = o[campo];
  if (!dd || o[`d${k}`] == null) return null;
  return Math.sign(dd) * o[`d${k}`];      // ir HACIA el imán
};

console.log("=".repeat(92));
console.log("  2 · ¿PREDICE ALGUNA? — ir hacia el imán, en puntos de SPX por operación");
console.log(`  (el listón es ${LISTON}: lo que da entrar al azar)`);
console.log("=".repeat(92) + "\n");
console.log(`| báscula | n | ${BARRAS.map((k) => `${k * 5} min`).join(" | ")} |`);
console.log(`|---|---|${BARRAS.map(() => "---").join("|")}|`);
for (const [nom, campo] of [["interés abierto (lo que usamos hoy)", "distOI"], ["**VOLUMEN del día**", "distVol"]]) {
  const cel = BARRAS.map((k) => {
    const v = obs.map((o) => puntos(o, k, campo)).filter((x) => x != null);
    return v.length < 500 ? "—" : `${num(media(v))} (t ${num(tDe(v), 1)})`;
  });
  const n = obs.filter((o) => o[campo]).length;
  console.log(`| ${nom} | ${n.toLocaleString("es-ES")} | ${cel.join(" | ")} |`);
}

const mejor = Math.max(...BARRAS.map((k) => media(obs.map((o) => puntos(o, k, "distVol")).filter((x) => x != null))));
console.log(`\n${"=".repeat(92)}`);
if (mejor > LISTON) {
  console.log(`  🟢 CAMBIA ALGO. Con el peso por volumen lo mejor es ${num(mejor)} puntos, por encima`);
  console.log(`     del listón de ${LISTON}. Hay que repetirlo entero cuando termine la descarga.`);
} else {
  console.log(`  🔴 NO CAMBIA. Con el peso por volumen lo mejor es ${num(mejor)} puntos, y el listón`);
  console.log(`     está en ${LISTON}. La báscula no era el problema.`);
}
console.log("=".repeat(92) + "\n");
