// ¿ES UN FILTRO O ES UN EPISODIO? — la prueba que decide sobre term9.
//
// El candidato: term9 = VIX9D/VIX del cierre de AYER, walk-forward q67, período operable.
//   532 días · tira el 25,8% · ingreso 106,2% de la base · racha $15.176 → $6.961 · p vs azar 0,02%
//
// Pero al subir el corte se cae: q80 tira 82 días y la racha se queda en $15.004 (p=38%), q90
// tira 51 y no la mueve. Si el signo de la señal fuese la causa, lo MÁS extremo tendría que ser
// lo PEOR. No lo es. Toda la mejora vive en la banda entre el percentil 67 y el 80.
//
// Eso tiene dos explicaciones posibles y hay que separarlas:
//   (a) el filtro pilla un patrón real y la banda 67-80 es donde está la masa de días malos
//   (b) el filtro quita CUATRO DÍAS de UN episodio y el resto es decoración
//
// Aquí se mide (b) directamente: se localiza el episodio de racha, se listan los días que el
// filtro quita dentro de él, y se rehace la cuenta QUITANDO UN MES ENTERO cada vez. Si al quitar
// un mes concreto el hallazgo desaparece, era ese mes.

import { readFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";

const VDIR = "scripts/cache-theta/vol-indices";
const DIAS_ANO = 252, WARMUP = 120;
const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const pct = (x) => (x * 100).toFixed(1) + "%";

const filas = JSON.parse(readFileSync("scripts/regimen-filas.json", "utf8"));
filas.sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
const claveDe = (f) => f.replace(/-/g, "");
const dias = new Set(filas.map((f) => claveDe(f.fecha)));
const V = {};
for (const s of ["VIX", "VIX9D"]) {
  const b = JSON.parse(readFileSync(VDIR + "/" + s + ".json", "utf8"));
  V[s] = Object.fromEntries(Object.entries(b).filter(([k]) => dias.has(k)));
}
const ant = (serie, fecha) => { const d = claveDe(fecha), ks = Object.keys(serie).filter((k) => k < d).sort(); return ks.length ? serie[ks[ks.length - 1]] : null; };
for (const f of filas) { const v = ant(V.VIX, f.fecha), v9 = ant(V.VIX9D, f.fecha); f.vix = v; f.term9 = v && v9 ? v9 / v : null; }
radiografia(filas, ["pl", "term9", "vix"], "episodio", { maxCeros: 0.2 });

function racha(serie) {                      // devuelve la caída y DÓNDE ocurre
  let c = 0, pico = 0, iPico = 0, dd = 0, a = 0, b = 0;
  for (let i = 0; i < serie.length; i++) {
    c += serie[i];
    if (c > pico) { pico = c; iPico = i; }
    if (pico - c > dd) { dd = pico - c; a = iPico; b = i; }
  }
  return { dd, a, b };
}
function walkForward(campo, q, base) {
  const hist = [], marca = new Map();
  for (const f of base) {
    const v = f[campo]; let opera = true;
    if (v != null && isFinite(v) && hist.length >= WARMUP) { const s = [...hist].sort((x, y) => x - y); opera = v < s[Math.floor(s.length * q)]; }
    if (v != null && isFinite(v)) hist.push(v);
    marca.set(f.fecha, opera);
  }
  return marca;
}
let vistos = 0, iOp = filas.length;
for (let i = 0; i < filas.length; i++) { if (filas[i].term9 != null) vistos++; if (vistos >= WARMUP) { iOp = i + 1; break; } }
const OP = filas.slice(iOp);
const marca = walkForward("term9", 2 / 3, filas);

console.log("\n" + "=".repeat(100));
console.log("  ¿FILTRO O EPISODIO? · term9 q67 walk-forward · período operable " + OP[0].fecha + " → " + OP[OP.length - 1].fecha + " (" + OP.length + " días)");
console.log("=".repeat(100));

// ── 1 · dónde está la racha de la base ──────────────────────────────────────
const rBase = racha(OP.map((f) => f.pl));
const rFil = racha(OP.map((f) => (marca.get(f.fecha) ? f.pl : 0)));
console.log("\n## 1 · EL EPISODIO\n");
console.log("racha BASE   " + eur(rBase.dd) + " · de " + OP[rBase.a].fecha + " a " + OP[rBase.b].fecha + " (" + (rBase.b - rBase.a) + " sesiones)");
console.log("racha FILTRO " + eur(rFil.dd) + " · de " + OP[rFil.a].fecha + " a " + OP[rFil.b].fecha + " (" + (rFil.b - rFil.a) + " sesiones)");

const ventana = OP.slice(rBase.a + 1, rBase.b + 1);
const quitados = ventana.filter((f) => !marca.get(f.fecha));
console.log("\ndentro del episodio base: " + ventana.length + " sesiones, el filtro quita " + quitados.length +
            " (" + pct(quitados.length / ventana.length) + ") que suman " + eur(quitados.reduce((a, f) => a + f.pl, 0)));
console.log("\nlos días QUITADOS dentro del episodio (los 12 de mayor pérdida):\n");
console.log("| fecha | P&L | crédito | VIX ayer | term9 |");
console.log("|---|---|---|---|---|");
for (const f of [...quitados].sort((a, b) => a.pl - b.pl).slice(0, 12))
  console.log("| " + f.fecha + " | " + eur(f.pl) + " | " + eur(f.credito) + " | " + f.vix + " | " + f.term9.toFixed(3) + " |");

// ── 2 · la banda 67-80: ¿de dónde sale la mejora? ───────────────────────────
console.log("\n## 2 · LA BANDA — el q80 no mueve la racha y el q67 sí. ¿Qué hay entre medias?\n");
const m80 = walkForward("term9", 0.8, filas);
const banda = OP.filter((f) => !marca.get(f.fecha) && m80.get(f.fecha));    // fuera con q67, dentro con q80
console.log("días en la banda p67–p80 de term9: " + banda.length + " · suman " + eur(banda.reduce((a, f) => a + f.pl, 0)) +
            " · media " + eur(banda.reduce((a, f) => a + f.pl, 0) / banda.length));
console.log("de ellos con pérdida > $2.000: " + banda.filter((f) => f.pl < -2000).length);
const porMesB = {};
for (const f of banda) { const m = f.fecha.slice(0, 7); porMesB[m] = (porMesB[m] || 0) + f.pl; }
console.log("\nlos 8 meses donde esa banda más pesa:\n");
console.log("| mes | P&L de los días de la banda | nº días |");
console.log("|---|---|---|");
const cuentaB = {}; for (const f of banda) cuentaB[f.fecha.slice(0, 7)] = (cuentaB[f.fecha.slice(0, 7)] || 0) + 1;
for (const [m, v] of Object.entries(porMesB).sort((a, b) => a[1] - b[1]).slice(0, 8))
  console.log("| " + m + " | " + eur(v) + " | " + cuentaB[m] + " |");

// ── 3 · QUITAR UN MES ENTERO ────────────────────────────────────────────────
console.log("\n## 3 · QUITAR UN MES ENTERO — si al sacar un mes el hallazgo se cae, era ese mes\n");
const meses = [...new Set(OP.map((f) => f.fecha.slice(0, 7)))].sort();
const res = [];
for (const mes of meses) {
  const sub = OP.filter((f) => f.fecha.slice(0, 7) !== mes);
  const b = racha(sub.map((f) => f.pl)).dd;
  const c = racha(sub.map((f) => (marca.get(f.fecha) ? f.pl : 0))).dd;
  const ib = sub.reduce((a, f) => a + f.pl, 0) / (sub.length / DIAS_ANO);
  const ic = sub.reduce((a, f) => a + (marca.get(f.fecha) ? f.pl : 0), 0) / (sub.length / DIAS_ANO);
  res.push({ mes, b, c, red: 1 - c / b, ib, ic, ret: ic / ib });
}
res.sort((a, b) => a.red - b.red);
console.log("los 6 meses cuya ausencia MÁS daña al filtro, y los 3 que menos:\n");
console.log("| mes fuera | racha base | racha filtro | reducción | ingreso retenido |");
console.log("|---|---|---|---|---|");
for (const r of [...res.slice(0, 6), null, ...res.slice(-3)]) {
  if (!r) { console.log("| … | | | | |"); continue; }
  console.log("| " + r.mes + " | " + eur(r.b) + " | " + eur(r.c) + " | **" + pct(r.red) + "** | " + pct(r.ret) + " |");
}
const peorRed = res[0].red, medRed = res[Math.floor(res.length / 2)].red;
console.log("\nreducción de racha con TODOS los meses: " + pct(1 - rFil.dd / rBase.dd));
console.log("peor caso quitando un mes: " + pct(peorRed) + " (sin " + res[0].mes + ") · mediana " + pct(medRed));
console.log("→ " + (peorRed > 0.25 ? "el hallazgo SOBREVIVE a quitar cualquier mes suelto" : "SE CAE: dependía del mes " + res[0].mes));

// ── 4 · año a año dentro del período operable ───────────────────────────────
console.log("\n## 4 · AÑO A AÑO dentro del período operable\n");
console.log("| año | días | racha base | racha filtro | reducción | ingreso base | ingreso filtro | retenido | días fuera |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const a of [...new Set(OP.map((f) => f.fecha.slice(0, 4)))].sort()) {
  const sub = OP.filter((f) => f.fecha.slice(0, 4) === a);
  const b = racha(sub.map((f) => f.pl)).dd, c = racha(sub.map((f) => (marca.get(f.fecha) ? f.pl : 0))).dd;
  const tb = sub.reduce((x, f) => x + f.pl, 0), tc = sub.reduce((x, f) => x + (marca.get(f.fecha) ? f.pl : 0), 0);
  const fu = sub.filter((f) => !marca.get(f.fecha)).length;
  console.log("| " + a + " | " + sub.length + " | " + eur(b) + " | " + eur(c) + " | " + pct(b ? 1 - c / b : 0) + " | " + eur(tb) +
              " | " + eur(tc) + " | " + pct(tb ? tc / tb : 0) + " | " + fu + " (" + pct(fu / sub.length) + ") |");
}

// ── 5 · el listón que Lester puso: peor día, p1, p5 ─────────────────────────
console.log("\n## 5 · LO QUE LESTER PIDIÓ REDUCIR — base contra filtro, período operable\n");
const opB = OP.map((f) => f.pl), opC = OP.filter((f) => marca.get(f.fecha)).map((f) => f.pl);
const P = (v, q) => { const s = [...v].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };
console.log("| métrica | base | filtro term9 q67 | cambio |");
console.log("|---|---|---|---|");
const met = [
  ["peor día", Math.min(...opB), Math.min(...opC)],
  ["percentil 1", P(opB, 0.01), P(opC, 0.01)],
  ["percentil 5", P(opB, 0.05), P(opC, 0.05)],
  ["peor racha", -rBase.dd, -rFil.dd],
  ["días < −$2.000", -opB.filter((x) => x < -2000).length, -opC.filter((x) => x < -2000).length],
  ["días < −$4.000", -opB.filter((x) => x < -4000).length, -opC.filter((x) => x < -4000).length],
];
for (const [n, b, c] of met) {
  const esDinero = !n.startsWith("días <");
  const f = esDinero ? eur : (x) => Math.abs(x);
  console.log("| " + n + " | " + f(b) + " | " + f(c) + " | " + (b !== 0 ? pct(Math.abs(c) / Math.abs(b) - 1) : "—") + " |");
}
console.log("| ingreso/año | " + eur(opB.reduce((a, b2) => a + b2, 0) / (OP.length / DIAS_ANO)) + " | " +
            eur(opC.reduce((a, b2) => a + b2, 0) / (OP.length / DIAS_ANO)) + " | " +
            pct(opC.reduce((a, b2) => a + b2, 0) / opB.reduce((a, b2) => a + b2, 0) - 1) + " |");
