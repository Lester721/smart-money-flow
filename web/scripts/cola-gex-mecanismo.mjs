// ═══════════════════════════════════════════════════════════════════════════════════════════
// PASO 4 — EL MECANISMO: ¿es el GEX, o es la VOLATILIDAD IMPLÍCITA disfrazada de GEX?
//
// Por qué esta pregunta y no otra. La gamma de Black-Scholes lleva la IV en el DENOMINADOR:
//     gamma = φ(d₁) / (S · σ · √T)
// Con la IV alta la gamma se aplana y se reparte; con la IV baja se concentra en el dinero.
// Así que "zonaSobreTotal" (qué parte de la gamma cae dentro de ±25 puntos) es, por construcción,
// una medida INVERSA de la IV. Y "la IV alta a las 11:00 anticipa que el cóndor se rompa" no es
// un hallazgo de gamma: es que el mercado ya sabía que iba a moverse y por eso pagaba más prima.
//
// Aquí se separan las dos cosas:
//   1. ¿los controles de IV (ivATM, sigma, crédito, ancho en sigmas) predicen la cola SOLOS?
//   2. ¿el GEX sigue separando DENTRO de cada tercil de IV? (si no, es la IV)
//   3. ¿el residuo del GEX una vez quitada la IV separa algo?
//
// PRUEBAS DE ESTE PASO: 6 controles + 3 señales GEX × (condicional + residuo) = 12.
// Con las 9 del paso 3 → 21 en esta tarea. Con las 47 ya hechas sobre estos días → 68.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync } from "node:fs";
import { listonT } from "../lib/barreraHallazgos";

const filas = JSON.parse(readFileSync("scripts/cola-gex-filas.json", "utf8"))
  .sort((a, b) => a.fecha.localeCompare(b.fecha));
const reg = new Map(JSON.parse(readFileSync("scripts/regimen-filas.json", "utf8")).map((r) => [r.fecha, r]));
for (const f of filas) {
  const r = reg.get(f.fecha);
  f.sigmaReg = r?.sigma ?? null;
  f.rangoMan = r ? (r.maxM - r.minM) / f.spot : null;         // rango 09:30→11:00, observable
  f.desdeApertura = r ? (f.spot - r.ap) / f.spot : null;
}

const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const media = (v) => v.reduce((s, x) => s + x, 0) / v.length;
const pctil = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))]; };
const cor = (a, b) => {
  const ma = media(a), mb = media(b);
  let n = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return n / Math.sqrt(da * db);
};
function zProp(k1, n1, k2, n2) {
  if (!n1 || !n2) return 0;
  const p = (k1 + k2) / (n1 + n2), se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  return se > 0 ? (k1 / n1 - k2 / n2) / se : 0;
}
const MALO = -2000;
function tail(g) {
  const pls = g.map((x) => x.pl);
  return { n: g.length, media: media(pls), p5: pctil(pls, 0.05), peor: Math.min(...pls),
           k: pls.filter((x) => x < MALO).length, p: pls.filter((x) => x < MALO).length / pls.length };
}
function terciles(rows, f) {
  const v = rows.filter((r) => f(r) != null && isFinite(f(r)));
  const o = [...v].sort((a, b) => f(a) - f(b));
  const k = Math.floor(o.length / 3);
  return [o.slice(0, k), o.slice(k, o.length - k), o.slice(o.length - k)];
}

// ═══ 1 · LOS CONTROLES DE VOLATILIDAD, SOLOS ═══════════════════════════════════════════════
const CONTROLES = [
  { id: "ivATM",       f: (r) => r.ivATM,        peligro: "alto", que: "IV del dinero a las 11:00 (real)" },
  { id: "sigmaPts",    f: (r) => r.sigmaPts,     peligro: "alto", que: "movimiento esperado 11:00→16:00, en puntos" },
  { id: "anchoRel",    f: (r) => r.anchoRel,     peligro: "bajo", que: "25 pts / sigma — a cuántas sigmas se vende" },
  { id: "credito",     f: (r) => r.credito,      peligro: "alto", que: "crédito cobrado (el precio del riesgo)" },
  { id: "skew",        f: (r) => r.skew,         peligro: "alto", que: "IV del put vendido − IV del call vendido" },
  { id: "rangoMan",    f: (r) => r.rangoMan,     peligro: "alto", que: "rango 09:30→11:00 / spot" },
];
const GEX = [
  { id: "zonaSobreTot", f: (r) => r.zonaSobreTotal, peligro: "bajo", que: "% de la gamma dentro de ±25 pts" },
  { id: "gexNetSuave",  f: (r) => r.gexNetSuave,    peligro: "bajo", que: "GEX neto en $" },
  { id: "distFlip",     f: (r) => r.distFlip,       peligro: "bajo", que: "(spot − gamma cero)/spot" },
];
const PRUEBAS = 21, PRUEBAS_TOTAL = 68;

console.log(`listón de Bonferroni: |z| ≥ ${listonT(PRUEBAS)} (21 pruebas de esta tarea) · |z| ≥ ${listonT(PRUEBAS_TOTAL)} (68 con todo lo ya hecho sobre estos días)\n`);

console.log(`═══ 1 · ¿LOS CONTROLES DE VOLATILIDAD PREDICEN LA COLA SOLOS? ═══`);
console.log(`(los 41 días de pérdida > $2.000 repartidos por tercil)\n`);
console.log("| señal | qué es | T1 | T2 | T3 | P(<−2k) peligroso | P(<−2k) seguro | z | media T1 | media T3 |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
for (const s of [...CONTROLES, ...GEX]) {
  const T = terciles(filas, s.f).map(tail);
  const mal = s.peligro === "bajo" ? T[0] : T[2], bien = s.peligro === "bajo" ? T[2] : T[0];
  const z = zProp(mal.k, mal.n, bien.k, bien.n);
  console.log(`| ${s.id} | ${s.que} | ${T[0].k} | ${T[1].k} | ${T[2].k} | ${(mal.p * 100).toFixed(1)}% | ${(bien.p * 100).toFixed(1)}% | ${z.toFixed(2)} | ${eur(T[0].media)} | ${eur(T[2].media)} |`);
}

// ═══ 2 · CORRELACIONES: ¿el GEX ES la IV? ══════════════════════════════════════════════════
console.log(`\n\n═══ 2 · ¿ES LA MISMA COSA? correlaciones entre el GEX y la volatilidad ═══\n`);
console.log("| | ivATM | sigmaPts | credito | rangoMan |");
console.log("|---|---|---|---|---|");
for (const s of GEX) {
  const v = filas.filter((r) => s.f(r) != null && isFinite(s.f(r)) && r.rangoMan != null);
  const a = v.map(s.f);
  const c = ["ivATM", "sigmaPts", "credito", "rangoMan"].map((k) => cor(a, v.map((r) => r[k])).toFixed(3));
  console.log(`| ${s.id} | ${c.join(" | ")} |`);
}

// ═══ 3 · CONDICIONAL: ¿el GEX separa DENTRO de cada tercil de IV? ══════════════════════════
console.log(`\n\n═══ 3 · CONDICIONAL — el GEX dentro de cada tercil de IV del dinero ═══`);
console.log(`Si el GEX es la IV disfrazada, aquí no queda nada.\n`);
console.log("| señal GEX | tercil de ivATM | n | días malos mitad peligrosa | mitad segura | z |");
console.log("|---|---|---|---|---|---|");
for (const s of GEX) {
  const TI = terciles(filas, (r) => r.ivATM);
  let sumZ = [];
  TI.forEach((g, i) => {
    const v = g.filter((r) => s.f(r) != null && isFinite(s.f(r)));
    const o = [...v].sort((a, b) => s.f(a) - s.f(b));
    const h = Math.floor(o.length / 2);
    const mal = s.peligro === "bajo" ? o.slice(0, h) : o.slice(-h);
    const bien = s.peligro === "bajo" ? o.slice(-h) : o.slice(0, h);
    const km = mal.filter((x) => x.pl < MALO).length, kb = bien.filter((x) => x.pl < MALO).length;
    const z = zProp(km, mal.length, kb, bien.length); sumZ.push(z);
    console.log(`| ${i === 0 ? s.id : ""} | IV ${["baja", "media", "alta"][i]} | ${v.length} | ${km}/${mal.length} | ${kb}/${bien.length} | ${z.toFixed(2)} |`);
  });
  console.log(`| **${s.id}** | **combinado (Stouffer)** | | | | **${(sumZ.reduce((a, b) => a + b, 0) / Math.sqrt(sumZ.length)).toFixed(2)}** |`);
}

// ═══ 4 · RESIDUO: quitar la IV por regresión y medir lo que queda ══════════════════════════
console.log(`\n\n═══ 4 · RESIDUO — el GEX una vez quitada la parte explicada por la IV ═══\n`);
console.log("| señal GEX | R² con ivATM | z de la cola del residuo | reparto T1/T2/T3 de días malos |");
console.log("|---|---|---|---|");
for (const s of GEX) {
  const v = filas.filter((r) => s.f(r) != null && isFinite(s.f(r)));
  const x = v.map((r) => r.ivATM), y = v.map(s.f);
  const mx = media(x), my = media(y);
  let sxy = 0, sxx = 0;
  for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; }
  const b = sxy / sxx, a = my - b * mx;
  const res = v.map((r, i) => ({ ...r, resid: y[i] - (a + b * x[i]) }));
  const r2 = cor(x, y) ** 2;
  const T = terciles(res, (r) => r.resid).map(tail);
  const mal = s.peligro === "bajo" ? T[0] : T[2], bien = s.peligro === "bajo" ? T[2] : T[0];
  console.log(`| ${s.id} | ${r2.toFixed(3)} | ${zProp(mal.k, mal.n, bien.k, bien.n).toFixed(2)} | ${T[0].k}/${T[1].k}/${T[2].k} |`);
}

// ═══ 5 · AL REVÉS: ¿la IV separa DENTRO de cada tercil de GEX? ═════════════════════════════
console.log(`\n\n═══ 5 · AL REVÉS — la IV dentro de cada tercil de la mejor señal GEX ═══\n`);
console.log("| tercil de zonaSobreTot | n | días malos con IV alta | con IV baja | z |");
console.log("|---|---|---|---|---|");
{
  const TG = terciles(filas, (r) => r.zonaSobreTotal);
  const zs = [];
  TG.forEach((g, i) => {
    const o = [...g].sort((a, b) => a.ivATM - b.ivATM);
    const h = Math.floor(o.length / 2);
    const alto = o.slice(-h), bajo = o.slice(0, h);
    const ka = alto.filter((x) => x.pl < MALO).length, kb = bajo.filter((x) => x.pl < MALO).length;
    const z = zProp(ka, alto.length, kb, bajo.length); zs.push(z);
    console.log(`| ${["T1 bajo", "T2", "T3 alto"][i]} | ${g.length} | ${ka}/${alto.length} | ${kb}/${bajo.length} | ${z.toFixed(2)} |`);
  });
  console.log(`| **combinado (Stouffer)** | | | | **${(zs.reduce((a, b) => a + b, 0) / Math.sqrt(zs.length)).toFixed(2)}** |`);
}
