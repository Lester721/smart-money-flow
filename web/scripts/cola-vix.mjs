// ¿PREDICE LA FAMILIA VIX LA COLA DEL CÓNDOR 0DTE? — 22 pruebas contra la COLA, no contra la media.
//
// ═══ EN QUÉ SE DIFERENCIA DE regimen-18.mjs ══════════════════════════════════════════════════
// regimen-18 midió 17 filtros contra la MEDIA (tercio alto vs tercio bajo del P&L medio) y todos
// fallaron. Aquí NO manda la media. Se mide si la señal anticipa el DÍA MALO:
//   · P(pérdida > $2.000) y P(pérdida > $4.000) en el tercio alto contra el bajo
//   · percentil 5 y percentil 1 del P&L en cada tercio
//   · y si FILTRAS: cuánto baja el peor día, cuánto baja la peor racha, cuánto ingreso pierdes
// Lester quiere REDUCIR LA CAÍDA. Un filtro con la media plana que parta el peor día por la mitad
// ES UN ÉXITO.
//
// ═══ LA REGLA DE ORO ═════════════════════════════════════════════════════════════════════════
// TODO observable a las 11:00 ET. El cierre del VIX de HOY son 5 horas de futuro: se usa SIEMPRE
// el cierre de AYER (la suscripción Index de ThetaData no da intradía).
//
// ═══ DEFECTO DE DATO ENCONTRADO Y CORREGIDO ══════════════════════════════════════════════════
// VIX.json trae 678 claves; VIX9D/VIX3M/VVIX traen 658. Las 20 de más son FESTIVOS de mercado
// (MLK, Presidents, Memorial, Juneteenth, 4-jul, Labor, Thanksgiving, 9-ene-2025). El VIX no
// cotiza esos días. Aquí las series se restringen a días reales de sesión SPX. regimen-18.mjs NO
// lo hacía: su señal vix usó un valor fantasma los ~20 días siguientes a un festivo.
// Alineación verificada aparte: corr(deltaVIX[d], retSPX[d]) = -0,811 y ~0 a +/-1 día → VIX[d] es
// el cierre del MISMO día d: no hay desplazamiento ni futuro colado.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { radiografia } from "../lib/radiografia";
import { listonT } from "../lib/barreraHallazgos";

const VDIR = "scripts/cache-theta/vol-indices";
const PRUEBAS = 22;              // 11 señales x 2 direcciones. DECLARADO ANTES DE CORRER.
const LISTON = listonT(PRUEBAS);
const MALO = 2000, MUYMALO = 4000;
const DIAS_ANO = 252;

const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const pct = (x) => (x * 100).toFixed(1) + "%";
const perc = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };

// z de dos proporciones. Para la COLA la t de medias no es el estadístico: lo es esto.
function zProp(x1, n1, x2, n2) {
  if (n1 < 20 || n2 < 20) return 0;
  const p = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  return se > 0 ? (x1 / n1 - x2 / n2) / se : 0;
}

// ── FASE A · los 653 días ya calculados ─────────────────────────────────────
const filas = JSON.parse(readFileSync("scripts/regimen-filas.json", "utf8"));
filas.sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
const claveDe = (f) => f.replace(/-/g, "");
const diasSesion = new Set(filas.map((f) => claveDe(f.fecha)));

// ── FASE B · la familia VIX, SIEMPRE con el cierre de AYER ──────────────────
const V = {};
for (const s of ["VIX", "VIX9D", "VIX3M", "VVIX"]) {
  const f = VDIR + "/" + s + ".json";
  if (!existsSync(f)) throw new Error("FALTA " + f + " — no se rellena, se dice.");
  const bruto = JSON.parse(readFileSync(f, "utf8"));
  const limpio = {};
  let fantasmas = 0;
  for (const k of Object.keys(bruto)) {
    if (diasSesion.has(k)) limpio[k] = bruto[k];
    else if (k >= claveDe(filas[0].fecha) && k <= claveDe(filas[filas.length - 1].fecha)) fantasmas++;
  }
  V[s] = limpio;
  console.log("   " + s.padEnd(6) + " " + Object.keys(bruto).length + " claves brutas -> " +
              Object.keys(limpio).length + " en sesión SPX · " + fantasmas + " fantasmas de festivo descartadas");
}
const anterior = (serie, fecha, n) => {                   // ÚLTIMO cierre ESTRICTAMENTE anterior
  const d = claveDe(fecha), ks = Object.keys(serie).filter((k) => k < d).sort();
  return ks.length >= n ? serie[ks[ks.length - n]] : null;
};

for (const f of filas) {
  const vix = anterior(V.VIX, f.fecha, 1), vix2 = anterior(V.VIX, f.fecha, 2);
  const v9 = anterior(V.VIX9D, f.fecha, 1), v3 = anterior(V.VIX3M, f.fecha, 1);
  const vv = anterior(V.VVIX, f.fecha, 1);
  f.vix = vix;
  f.vixCambio = vix && vix2 ? (vix / vix2 - 1) * 100 : null;
  f.term9 = vix && v9 ? v9 / vix : null;                  // >1 = estrés a corto
  f.term3m = vix && v3 ? vix / v3 : null;                 // >1 = curva invertida
  f.vvix = vv;
  f.vvixRel = vv && vix ? vv / vix : null;                // vol-de-vol relativa a la vol
}

radiografia(filas, ["pl", "vix", "vixCambio", "term9", "term3m", "vvix", "vvixRel"], "cóndor + familia VIX", { maxCeros: 0.2 });

// rango percentil dentro de la muestra (para las combinaciones de dos)
function rangos(campo) {
  const val = filas.filter((f) => f[campo] != null && isFinite(f[campo]));
  const ord = [...val].sort((a, b) => a[campo] - b[campo]);
  const r = new Map();
  ord.forEach((f, i) => r.set(f.fecha, i / (ord.length - 1)));
  return r;
}
const R = {}; for (const c of ["vix", "vixCambio", "term9", "term3m", "vvix", "vvixRel"]) R[c] = rangos(c);
const combo = (a, b) => (f) => {
  const x = R[a].get(f.fecha), y = R[b].get(f.fecha);
  return x == null || y == null ? null : (x + y) / 2;
};

// ── LAS 11 SEÑALES (x 2 direcciones = 22 pruebas) ───────────────────────────
const SENALES = [
  ["A", "vix",             "VIX al cierre de AYER",                        (f) => f.vix],
  ["B", "vixCambio",       "% que cambió el VIX ayer",                     (f) => f.vixCambio],
  ["C", "term9",           "VIX9D/VIX de ayer (>1 estrés corto)",          (f) => f.term9],
  ["D", "term3m",          "VIX/VIX3M de ayer (>1 curva invertida)",       (f) => f.term3m],
  ["E", "vvix",            "VVIX al cierre de AYER",                       (f) => f.vvix],
  ["F", "vvixRel",         "VVIX/VIX de ayer",                             (f) => f.vvixRel],
  ["G", "vix+term3m",      "rango medio VIX y curva 3M",                   combo("vix", "term3m")],
  ["H", "vix+vvix",        "rango medio VIX y VVIX",                       combo("vix", "vvix")],
  ["I", "vix+term9",       "rango medio VIX y estrés a 9 días",            combo("vix", "term9")],
  ["J", "vixCambio+term9", "rango medio cambio del VIX y estrés a 9 días", combo("vixCambio", "term9")],
  ["K", "term9+term3m",    "rango medio de las dos pendientes de curva",   combo("term9", "term3m")],
];

// ── métricas de COLA y de CARTERA ───────────────────────────────────────────
function racha(serie) {                                    // peor caída acumulada
  let c = 0, pico = 0, dd = 0;
  for (const x of serie) { c += x; pico = Math.max(pico, c); dd = Math.max(dd, pico - c); }
  return dd;
}
function cartera(pls) {
  const total = pls.reduce((a, b) => a + b, 0);
  const operados = pls.filter((x) => x !== 0);
  return {
    total, anual: total / (filas.length / DIAS_ANO),
    peorDia: operados.length ? Math.min(...operados) : 0,
    dd: racha(pls), n: operados.length,
  };
}
const BASE = cartera(filas.map((f) => f.pl));

function colaDe(pls) {
  return {
    n: pls.length, media: media(pls),
    p2k: pls.filter((x) => x < -MALO).length / pls.length,
    n2k: pls.filter((x) => x < -MALO).length,
    p4k: pls.filter((x) => x < -MUYMALO).length / pls.length,
    n4k: pls.filter((x) => x < -MUYMALO).length,
    p5: perc(pls, 0.05), p1: perc(pls, 0.01), peor: Math.min(...pls),
  };
}

console.log("\n" + "=".repeat(112));
console.log("  PREDECIR LA COLA · FAMILIA VIX (cierre de AYER) · " + PRUEBAS + " pruebas declaradas · listón |z| = " + LISTON);
console.log("  " + filas.length + " días · 2024-01-02 -> " + filas[filas.length - 1].fecha);
console.log("  BASE: " + eur(BASE.total) + " acumulados · " + eur(BASE.anual) + "/año · peor día " + eur(BASE.peorDia) + " · peor racha " + eur(BASE.dd));
const base = colaDe(filas.map((f) => f.pl));
console.log("  BASE cola: P(>" + eur(MALO) + ") = " + pct(base.p2k) + " (" + base.n2k + " días) · P(>" + eur(MUYMALO) + ") = " +
            pct(base.p4k) + " (" + base.n4k + ") · p5 " + eur(base.p5) + " · p1 " + eur(base.p1));
console.log("=".repeat(112));

// ── TABLA 1 · la cola por tercios ───────────────────────────────────────────
console.log("\n## 1 · LA COLA POR TERCIOS — ¿el tercio ALTO tiene más días malos que el BAJO?\n");
console.log("| # | señal | n | P(>$2k) ALTO | P(>$2k) BAJO | z | P(>$4k) A/B | p5 ALTO | p5 BAJO | p1 ALTO | p1 BAJO | media A-B |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|");
const tabla = [];
for (const [id, nom, desc, fn] of SENALES) {
  const val = filas.filter((f) => { const v = fn(f); return v != null && isFinite(v); });
  if (val.length < 200) { console.log("| " + id + " | `" + nom + "` | " + val.length + " | — | — | — | — | — | — | — | — | **sin muestra** |"); continue; }
  const ord = [...val].sort((a, b) => fn(b) - fn(a));
  const k = Math.floor(ord.length / 3);
  const A = colaDe(ord.slice(0, k).map((f) => f.pl)), B = colaDe(ord.slice(-k).map((f) => f.pl));
  const z = zProp(A.n2k, A.n, B.n2k, B.n);
  const z4 = zProp(A.n4k, A.n, B.n4k, B.n);
  tabla.push({ id, nom, desc, fn, A, B, z, z4, val });
  console.log("| " + id + " | `" + nom + "` | " + val.length + " | " + pct(A.p2k) + " (" + A.n2k + ") | " + pct(B.p2k) + " (" + B.n2k +
              ") | **" + z.toFixed(2) + "** | " + A.n4k + "/" + B.n4k + " (z " + z4.toFixed(2) + ") | " + eur(A.p5) + " | " + eur(B.p5) +
              " | " + eur(A.p1) + " | " + eur(B.p1) + " | " + eur(A.media - B.media) + " |");
}

// ── TABLA 2 · el filtro: qué pasa si tiras esos días ────────────────────────
// Se prueban las DOS direcciones (tirar el tercio alto / tirar el bajo) — por eso 22 pruebas.
console.log("\n## 2 · EL FILTRO — tirar el tercio y ver la cartera. La métrica que decide es la última columna.\n");
console.log("| # | señal | dirección | días fuera | ingreso/año | % retenido | peor día | delta peor día | peor racha | delta racha | $ caída matada / $ año perdido |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
const filtros = [];
for (const { id, nom, desc, fn, val } of tabla) {
  const ord = [...val].sort((a, b) => fn(b) - fn(a));
  const k = Math.floor(ord.length / 3);
  const dirs = [["tirar ALTO", new Set(ord.slice(0, k).map((f) => f.fecha))],
                ["tirar BAJO", new Set(ord.slice(-k).map((f) => f.fecha))]];
  for (const [dir, fuera] of dirs) {
    const pls = filas.map((f) => (fuera.has(f.fecha) ? 0 : f.pl));
    const c = cartera(pls);
    const perdido = BASE.anual - c.anual;
    const matado = BASE.dd - c.dd;
    const ratio = perdido > 0 ? matado / perdido : (matado > 0 ? Infinity : 0);
    filtros.push({ id, nom, desc, dir, fuera, c, perdido, matado, ratio, retenido: c.anual / BASE.anual, pls });
    console.log("| " + id + " | `" + nom + "` | " + dir + " | " + fuera.size + " (" + pct(fuera.size / filas.length) + ") | " +
                eur(c.anual) + " | " + pct(c.anual / BASE.anual) + " | " + eur(c.peorDia) + " | " + eur(c.peorDia - BASE.peorDia) +
                " | " + eur(c.dd) + " | " + eur(c.dd - BASE.dd) + " | **" + (perdido > 0 ? ratio.toFixed(2) : "gratis") + "** |");
  }
}

// ── TABLA 3 · el signo en los TRES tercios del período ──────────────────────
console.log("\n## 3 · LOS TRES TERCIOS DEL PERÍODO — P(pérdida>$2k) ALTO menos BAJO, en puntos porcentuales\n");
const trozo = (f) => f.fecha.slice(0, 4);
const anos = [...new Set(filas.map(trozo))].sort();
console.log("| # | señal | " + anos.map((a) => a + " (n)").join(" | ") + " | signos |");
console.log("|---|---|" + anos.map(() => "---|").join(""));
for (const { id, nom, fn, val } of tabla) {
  const cel = [], sg = [];
  for (const a of anos) {
    const sub = val.filter((f) => trozo(f) === a);
    if (sub.length < 40) { cel.push("— (" + sub.length + ")"); sg.push("?"); continue; }
    const ord = [...sub].sort((x, y) => fn(y) - fn(x));
    const k = Math.floor(ord.length / 3);
    const A = colaDe(ord.slice(0, k).map((f) => f.pl)), B = colaDe(ord.slice(-k).map((f) => f.pl));
    const d = (A.p2k - B.p2k) * 100;
    cel.push((d >= 0 ? "+" : "−") + Math.abs(d).toFixed(1) + " pp (" + sub.length + ")");
    sg.push(d >= 0 ? "+" : "−");
  }
  console.log("| " + id + " | `" + nom + "` | " + cel.join(" | ") + " | **" + sg.join("") + "** |");
}

writeFileSync("scripts/cola-vix-salida.json", JSON.stringify({
  base: { ...BASE, ...base }, liston: LISTON, pruebas: PRUEBAS,
  tabla: tabla.map(({ id, nom, desc, A, B, z, z4 }) => ({ id, nom, desc, A, B, z, z4 })),
  filtros: filtros.map(({ id, nom, dir, c, perdido, matado, ratio, retenido, fuera }) =>
    ({ id, nom, dir, ...c, perdido, matado, ratio, retenido, fuera: fuera.size })),
}, null, 1), "utf8");
console.log("\n-> scripts/cola-vix-salida.json");
