// EL MECANISMO — el signo no se agrupa, ¿y el TAMAÑO?
//
// cola-1 dejó cerrada una puerta: las pérdidas del cóndor son indistinguibles de una moneda
// (z de rachas −0,38; tras una pérdida el día siguiente pierde el 25,6% de las veces contra un
// 24,5% de base). Cualquier regla que reaccione al RESULTADO de ayer está condenada.
//
// Pero hay una segunda pregunta que nadie ha hecho: el SIGNO no se agrupa, ¿y la MAGNITUD?
// La volatilidad se agrupa en todos los mercados. Si aquí también, entonces:
//   · la MEDIA del cóndor es plana entre regímenes (ya medido: 17 filtros y ninguno separó medias)
//   · pero la DISPERSIÓN no lo sería
// y esas dos cosas juntas son exactamente lo que hace falta: bajar tamaño donde la cola es
// gorda cuesta poco ingreso (la media es la misma) y quita mucha cola.
//
// Aquí se mide eso y NADA MÁS. Ninguna regla todavía.
//
// SIN FUTURO: VIX/VVIX entran con el cierre de AYER. σ y crédito son de las 11:00. El rango de
// la mañana (maxM/minM) es de 09:30 a 11:00.

import { readFileSync, existsSync } from "node:fs";
import { radiografia } from "../lib/radiografia";
import { tWelch, listonT } from "../lib/barreraHallazgos";

const filas = JSON.parse(readFileSync("scripts/regimen-filas.json", "utf8"));
const VDIR = "scripts/cache-theta/vol-indices";
const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const desv = (v) => { const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const pctl = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };

// ── índices de volatilidad, SIEMPRE cierre de AYER ─────────────────────────
const V = {};
for (const s of ["VIX", "VIX9D", "VIX3M", "VVIX"]) {
  const f = VDIR + "/" + s + ".json";
  if (existsSync(f)) V[s] = JSON.parse(readFileSync(f, "utf8"));
  else console.log("## FALTA " + s + ".json — esa señal no se mide, no se rellena");
}
const clave = (f) => f.replace(/-/g, "");
const cierreAnterior = (serie, fecha) => {
  const d = clave(fecha), ks = Object.keys(serie).filter((k) => k < d).sort();
  return ks.length ? serie[ks[ks.length - 1]] : null;
};

for (let i = 0; i < filas.length; i++) {
  const f = filas[i];
  f.vixAyer = V.VIX ? cierreAnterior(V.VIX, f.fecha) : null;
  f.vvixAyer = V.VVIX ? cierreAnterior(V.VVIX, f.fecha) : null;
  f.rangoManana = f.maxM > 0 && f.minM > 0 ? ((f.maxM - f.minM) / f.sp11) * 100 : null;
  f.absPl = Math.abs(f.pl);
  // movimiento REALIZADO de 11:00 al cierre, en puntos — es el que decide el cóndor
  f.movTarde = Math.abs(f.cierre - f.sp11);
}

radiografia(filas, ["pl", "credito", "sigma", "vixAyer", "vvixAyer", "rangoManana", "movTarde"],
            "días con volatilidad de ayer", { maxCeros: 0.2 });

const n = filas.length;
console.log("═".repeat(104));
console.log("  EL MECANISMO · " + n + " días · ¿se agrupa la MAGNITUD aunque no se agrupe el signo?");
console.log("═".repeat(104));

// ── 1 · autocorrelación del VALOR ABSOLUTO ─────────────────────────────────
const ac = (v, L) => {
  const m = media(v), sd = desv(v);
  let s = 0; for (let i = L; i < v.length; i++) s += (v[i] - m) * (v[i - L] - m);
  const r = s / ((v.length - L) * sd * sd);
  return { r, t: r * Math.sqrt(v.length - L) };
};
console.log("\n## 1 · Autocorrelación: el signo contra la magnitud\n");
console.log("| serie | r(1) | t | r(2) | t | r(5) | t |\n|---|---|---|---|---|---|---|");
for (const [nom, v] of [
  ["P&L con signo", filas.map((f) => f.pl)],
  ["|P&L| (magnitud)", filas.map((f) => f.absPl)],
  ["|movimiento 11:00→cierre|", filas.map((f) => f.movTarde)],
]) {
  const a1 = ac(v, 1), a2 = ac(v, 2), a5 = ac(v, 5);
  console.log("| " + nom + " | " + a1.r.toFixed(3) + " | **" + a1.t.toFixed(2) + "** | " + a2.r.toFixed(3) +
              " | " + a2.t.toFixed(2) + " | " + a5.r.toFixed(3) + " | " + a5.t.toFixed(2) + " |");
}
console.log("\n  Si la magnitud tiene autocorrelación fuerte y el signo no, el riesgo ES predecible");
console.log("  aunque la dirección no lo sea. Eso es lo único que necesita una regla de tamaño.");

// ── 2 · media PLANA contra cola VARIABLE, por régimen ──────────────────────
const SENALES = [
  ["vixAyer", "VIX al cierre de AYER"],
  ["vvixAyer", "VVIX al cierre de AYER"],
  ["sigma", "σ esperada del resto de sesión (IV del dinero a las 11:00)"],
  ["rangoManana", "% de rango recorrido de 09:30 a 11:00"],
  ["credito", "crédito cobrado a las 11:00 ($)"],
];
console.log("\n## 2 · La media es plana, ¿y la cola?\n");
console.log("  Tercios por cada señal. `t medias` compara tercio ALTO contra BAJO en la MEDIA.");
console.log("  `F disp` compara sus VARIANZAS (la cola). Listón de |t| con " + SENALES.length + " señales: " +
            listonT(SENALES.length) + "\n");
console.log("| señal | tercio | n | media | desv | p5 | peor día |\n|---|---|---|---|---|---|---|");
const resumen = [];
for (const [campo, desc] of SENALES) {
  const val = filas.filter((f) => f[campo] != null && isFinite(f[campo]));
  if (val.length < 200) { console.log("| `" + campo + "` | — | " + val.length + " | SIN MUESTRA | | | |"); continue; }
  const ord = [...val].sort((a, b) => a[campo] - b[campo]);
  const k = Math.floor(ord.length / 3);
  const grupos = [["BAJO", ord.slice(0, k)], ["MEDIO", ord.slice(k, ord.length - k)], ["ALTO", ord.slice(-k)]];
  for (const [nom, g] of grupos) {
    const p = g.map((f) => f.pl);
    console.log("| `" + campo + "` | " + nom + " | " + g.length + " | " + eur(media(p)) + " | " + eur(desv(p)) +
                " | " + eur(pctl(p, 0.05)) + " | " + eur(Math.min(...p)) + " |");
  }
  const alto = grupos[2][1].map((f) => f.pl), bajo = grupos[0][1].map((f) => f.pl);
  const vA = desv(alto) ** 2, vB = desv(bajo) ** 2;
  const F = vA / vB;
  // z de Fisher para el cociente de varianzas: ln(F)/sqrt(2/(k-1)+2/(k-1))
  const zF = Math.log(F) / Math.sqrt(4 / (k - 1));
  resumen.push({ campo, desc, tMedias: tWelch(alto, bajo), F, zF,
                 mAlto: media(alto), mBajo: media(bajo),
                 p5Alto: pctl(alto, 0.05), p5Bajo: pctl(bajo, 0.05),
                 peorAlto: Math.min(...alto), peorBajo: Math.min(...bajo) });
}

console.log("\n## 3 · El contraste que decide: MEDIA plana, DISPERSIÓN no\n");
console.log("| señal | media ALTO | media BAJO | t medias | desv²ALTO/desv²BAJO | z del cociente | p5 ALTO | p5 BAJO | peor ALTO | peor BAJO |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
for (const r of resumen) {
  console.log("| `" + r.campo + "` | " + eur(r.mAlto) + " | " + eur(r.mBajo) + " | " + r.tMedias.toFixed(2) +
              " | **" + r.F.toFixed(2) + "×** | **" + r.zF.toFixed(2) + "** | " + eur(r.p5Alto) + " | " + eur(r.p5Bajo) +
              " | " + eur(r.peorAlto) + " | " + eur(r.peorBajo) + " |");
}
const liston = listonT(SENALES.length);
console.log("\n  listón |t| = " + liston + " · señales cuya DISPERSIÓN separa por encima del listón: " +
            resumen.filter((r) => Math.abs(r.zF) >= liston).map((r) => r.campo).join(", ") || "ninguna");
console.log("  señales cuya MEDIA separa por encima del listón: " +
            (resumen.filter((r) => Math.abs(r.tMedias) >= liston).map((r) => r.campo).join(", ") || "**ninguna**"));

// ── 4 · ¿el crédito compensa? el P&L por unidad de riesgo ─────────────────
console.log("\n## 4 · Por qué la media sale plana: el crédito sube con la volatilidad\n");
console.log("| señal | crédito medio ALTO | crédito medio BAJO | movimiento medio tarde ALTO | BAJO |");
console.log("|---|---|---|---|---|");
for (const [campo] of SENALES) {
  const val = filas.filter((f) => f[campo] != null && isFinite(f[campo]));
  if (val.length < 200) continue;
  const ord = [...val].sort((a, b) => a[campo] - b[campo]), k = Math.floor(ord.length / 3);
  const A = ord.slice(-k), B = ord.slice(0, k);
  console.log("| `" + campo + "` | " + eur(media(A.map((f) => f.credito))) + " | " + eur(media(B.map((f) => f.credito))) +
              " | " + media(A.map((f) => f.movTarde)).toFixed(1) + " pts | " + media(B.map((f) => f.movTarde)).toFixed(1) + " pts |");
}
console.log("\n  El crédito paga por el riesgo extra — por eso 17 filtros de régimen salieron planos EN MEDIA.");
console.log("  Pero el crédito está ACOTADO (como mucho llega al ancho del ala) y la pérdida no lo está en");
console.log("  la misma proporción: la cola sigue siendo más gorda arriba. Ahí es donde vive el tamaño.");
