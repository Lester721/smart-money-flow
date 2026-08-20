// LA PRUEBA QUE DECIDE — ¿la regla está eligiendo días, o sólo operando más pequeño con suerte?
//
// ═══ POR QUÉ HACE FALTA ══════════════════════════════════════════════════════════════════════
// En cola-3, el CONTROL D4 —bajar a la mitad un tercio de los días elegidos AL AZAR, sin mirar
// absolutamente nada— salió el PRIMERO de la tabla de caída a igual ingreso: −26%. Eso no puede
// ser un hallazgo, y por tanto la tabla de caída, sola, no vale para decidir.
//
// La razón: la peor racha acumulada es UN número de UN camino. Basta con que un recorte al azar
// caiga encima de dos días malos para que la caída baje mucho. No hay 653 observaciones de la
// caída: hay una.
//
// ═══ LA PRUEBA ═══════════════════════════════════════════════════════════════════════════════
// Para cada regla se guarda su serie de multiplicadores y se BARAJA 4.000 veces sobre los mismos
// 653 días. El barajado conserva EXACTAMENTE la misma distribución de tamaños (el mismo tamaño
// medio, los mismos días a la mitad) y destruye una sola cosa: en QUÉ días caen. Después se
// reescala cada barajado a los mismos $/año que el fijo, igual que el real.
//
// Si la regla real no queda en la cola de sus propios barajados, lo que hace no es elegir días.
//
// Las cuatro medidas de cola se juzgan por separado: peor día, percentil 1, percentil 5 y peor
// racha acumulada. La caída es la más ruidosa de las cuatro; los percentiles, con n=653, son las
// que más pesan.

import { readFileSync, writeFileSync } from "node:fs";
import { listonT } from "../lib/barreraHallazgos";

const PRUEBAS = 20, PERM = 4000;
const S = JSON.parse(readFileSync("scripts/cola-3-series.json", "utf8"));
const pl = S.pl, n = pl.length, base = S.base;
const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const pctl = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };

function medir(tams) {
  let tot = 0; const p = new Array(n);
  for (let i = 0; i < n; i++) { p[i] = pl[i] * tams[i]; tot += p[i]; }
  let pico = 0, ac = 0, dd = 0, peor = Infinity;
  for (const x of p) { ac += x; pico = Math.max(pico, ac); dd = Math.min(dd, ac - pico); if (x < peor) peor = x; }
  const anual = tot / (n / 252);
  const k = anual > 0 ? base.anual / anual : null;      // reescalado a MISMO ingreso
  if (k == null) return null;
  return { anual, k, dd: dd * k, peorDia: peor * k, p1: pctl(p, 0.01) * k, p5: pctl(p, 0.05) * k };
}

let sem = 987654321;
const rnd = () => { sem ^= sem << 13; sem ^= sem >>> 17; sem ^= sem << 5; sem >>>= 0; return sem / 4294967296; };

const liston = listonT(PRUEBAS);
console.log("═".repeat(126));
console.log("  ¿ELIGE DÍAS O SÓLO OPERA PEQUEÑO? · " + PERM.toLocaleString("es-ES") + " barajados por regla · " + n + " días");
console.log("  Todo reescalado a los mismos " + eur(base.anual) + "/año del contrato fijo.");
console.log("  Referencia del fijo: peor día " + eur(base.peorDia) + " · p1 " + eur(base.p1) + " · p5 " + eur(base.p5) + " · caída " + eur(base.dd));
console.log("═".repeat(126));
console.log("\n  Un percentil BAJO = la regla real está en la cola buena de sus barajados = SÍ elige días.");
console.log("  Con " + PRUEBAS + " pruebas declaradas, el listón de un percentil por azar es 0,05/" + PRUEBAS +
            " = " + (5 / PRUEBAS).toFixed(2) + "%.\n");
console.log("| id | regla | peor día | pct | p1 | pct | p5 | pct | PEOR RACHA | pct | ¿elige días? |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");

const salida = [];
for (const R of S.reglas) {
  const real = medir(R.tams);
  if (!real) { console.log("| **" + R.id + "** | " + R.desc.slice(0, 40) + " | ingreso ≤ 0, no se puede reescalar | | | | | | | | no |"); continue; }
  const dist = { dd: [], peorDia: [], p1: [], p5: [] };
  const t = [...R.tams];
  for (let s = 0; s < PERM; s++) {
    for (let i = t.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const x = t[i]; t[i] = t[j]; t[j] = x; }
    const m = medir(t);
    if (!m) continue;
    dist.dd.push(m.dd); dist.peorDia.push(m.peorDia); dist.p1.push(m.p1); dist.p5.push(m.p5);
  }
  // percentil de la real: qué fracción de barajados sale IGUAL DE BUENA O MEJOR (menos negativa)
  const pctDe = (v, real) => (v.filter((x) => x >= real).length / v.length) * 100;
  const q = {
    dd: pctDe(dist.dd, real.dd), peorDia: pctDe(dist.peorDia, real.peorDia),
    p1: pctDe(dist.p1, real.p1), p5: pctDe(dist.p5, real.p5),
  };
  const umbral = 5 / PRUEBAS;
  const elige = [q.p1, q.p5, q.dd, q.peorDia].filter((x) => x <= umbral).length;
  const marca = (x) => (x <= umbral ? "**" + x.toFixed(1) + "%**" : x.toFixed(1) + "%");
  console.log("| **" + R.id + "** | " + R.desc.slice(0, 40) + " | " + eur(real.peorDia) + " | " + marca(q.peorDia) +
    " | " + eur(real.p1) + " | " + marca(q.p1) + " | " + eur(real.p5) + " | " + marca(q.p5) +
    " | " + eur(real.dd) + " | " + marca(q.dd) + " | " + (elige >= 2 ? "🟢 **" + elige + "/4**" : elige === 1 ? "1/4" : "no") + " |");
  salida.push({ id: R.id, desc: R.desc, real, q, elige,
                medianaBarajada: { dd: pctl(dist.dd, 0.5), p1: pctl(dist.p1, 0.5), p5: pctl(dist.p5, 0.5), peorDia: pctl(dist.peorDia, 0.5) } });
}

console.log("\n## Lo mismo, en una frase por regla: la real contra la MEDIANA de sus barajados\n");
console.log("| id | p1 real | p1 barajado típico | ganancia sobre el azar | p5 real | p5 barajado típico | ganancia | caída real | caída barajada típica | ganancia |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
for (const r of salida.sort((a, b) => a.q.p1 - b.q.p1)) {
  const g = (real, baraj) => (baraj !== 0 ? ((1 - real / baraj) * 100).toFixed(0) + "%" : "—");
  console.log("| **" + r.id + "** | " + eur(r.real.p1) + " | " + eur(r.medianaBarajada.p1) + " | " + g(r.real.p1, r.medianaBarajada.p1) +
    " | " + eur(r.real.p5) + " | " + eur(r.medianaBarajada.p5) + " | " + g(r.real.p5, r.medianaBarajada.p5) +
    " | " + eur(r.real.dd) + " | " + eur(r.medianaBarajada.dd) + " | " + g(r.real.dd, r.medianaBarajada.dd) + " |");
}

const pasan = salida.filter((r) => r.elige >= 2);
console.log("\n" + "═".repeat(126));
console.log("  VEREDICTO: " + pasan.length + " de " + salida.length + " reglas quedan en la cola de sus propios barajados en 2 medidas o más.");
if (pasan.length) for (const r of pasan) console.log("    🟢 " + r.id + " — " + r.desc);
else console.log("    Ninguna. Lo que baja la cola es el tamaño medio, no la elección del día.");
console.log("═".repeat(126));
writeFileSync("scripts/cola-4-permutacion.json", JSON.stringify(salida, null, 2), "utf8");
console.log("\n  detalle en scripts/cola-4-permutacion.json");
