// COSTE-REAL - el rango de la manana parecio pasar el cruce. Antes de decir nada, apretarlo:
//   1. en forma ADIMENSIONAL (un umbral en PUNTOS sube de exigencia solo porque el indice sube)
//   2. en los TRES tercios de tiempo, no en dos mitades
//   3. dentro de la CAJA: si no cambia lo que Lester cobra ni lo que puede arriesgar, no sirve
import { readFileSync } from "node:fs";
import { listonT, tWelch } from "../lib/barreraHallazgos.ts";

const F = JSON.parse(readFileSync("scripts/coste-real-base.json", "utf8")).sort((a, b) => a.fecha.localeCompare(b.fecha));
const EFECTIVO0 = 7977, PC0 = 73874, HOOD = 48412, TASA = 0.05, W = 50;
const eur = (x) => (x == null || !isFinite(x) ? "-" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const pctl = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))]; };
const dd = (v) => { let a = 0, p = 0, w = 0; for (const x of v) { a += x; if (a > p) p = a; w = Math.min(w, a - p); } return w; };
const dias = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const anos = (g) => dias(g[0].fecha, g[g.length - 1].fecha) / 365.25;
const A = F.filter((f) => f.fecha < "2024-01-01"), B = F.filter((f) => f.fecha >= "2024-01-01");
const met = (g, base) => { const pl = g.map((f) => f.porAncho[W].pl); return { n: g.length, quedan: (g.length / base.length * 100).toFixed(0) + "%", alAno: pl.reduce((a, b) => a + b, 0) / anos(base), peor: Math.min(...pl), p1: pctl(pl, 0.01), p5: pctl(pl, 0.05), dd: dd(pl) }; };

// las tres formas de decir "la manana se movio mucho"
const FORMAS = {
  "PUNTOS  (rango 09:30-11:00, en puntos del indice)": (f) => f.rangoMananaPts,
  "PORCENTAJE  (rango / spot)": (f) => f.rangoMananaPts / f.spot * 100,
  "SIGMAS  (rango / sigma del straddle) -- adimensional de verdad": (f) => f.rangoMananaPts / f.sigmaPts,
};

console.log("=== 1 - LA MISMA IDEA EN TRES UNIDADES - umbral elegido en un periodo, aplicado al otro ===");
console.log("(se OPERA cuando la manana ha estado por DEBAJO del umbral)\n");
let pruebas = 0;
for (const [nom, fn] of Object.entries(FORMAS)) {
  console.log(`--- ${nom} ---`);
  console.log("| corte | umbral | ajustado en | dias que quedan fuera de muestra | $/ano fuera de muestra (base) | peor racha fuera de muestra (base) | peor dia | $ perdidos / $ de racha |");
  console.log("|---|---|---|---|---|---|---|---|");
  for (const [nomAj, ajuste, prueba] of [["2022-23 -> 2024-26", A, B], ["2024-26 -> 2022-23", B, A]]) {
    const base = met(prueba, prueba);
    for (const q of [0.6, 0.7, 0.8, 0.9]) {
      pruebas++;
      const u = pctl(ajuste.map(fn), q);
      const g = prueba.filter((f) => fn(f) <= u);
      if (g.length < 100) continue;
      const m = met(g, prueba);
      const perdido = base.alAno - m.alAno, quitado = m.dd - base.dd;
      console.log(`| deja el ${(q * 100).toFixed(0)}% mas tranquilo | ${u.toFixed(2)} | ${nomAj} | ${m.n} (${m.quedan}) | ${eur(m.alAno)} (${eur(base.alAno)}) | ${eur(m.dd)} (${eur(base.dd)}) | ${eur(m.peor)} (${eur(base.peor)}) | ${quitado > 0 ? "$" + (perdido / quitado).toFixed(2) : "**la racha EMPEORA**"} |`);
    }
  }
  console.log("");
}

// 2. LOS TRES TERCIOS, con el corte adimensional al 80%
console.log("=== 2 - LOS TRES TERCIOS DE TIEMPO (corte adimensional: rango/sigma por debajo del percentil 80 de TODA la muestra) ===");
const fn = FORMAS["SIGMAS  (rango / sigma del straddle) -- adimensional de verdad"];
const uGlobal = pctl(F.map(fn), 0.8);
console.log(`umbral global: rango de la manana <= ${uGlobal.toFixed(2)} sigmas del straddle\n`);
console.log("| tercio | dias | opera | $/ano operando | $/ano sin filtro | peor racha con | peor racha sin | mejora? |");
console.log("|---|---|---|---|---|---|---|---|");
const k = Math.floor(F.length / 3);
const tercios = [F.slice(0, k), F.slice(k, 2 * k), F.slice(2 * k)];
for (const t of tercios) {
  const con = t.filter((f) => fn(f) <= uGlobal);
  const mc = met(con, t), ms = met(t, t);
  console.log(`| ${t[0].fecha} a ${t[t.length - 1].fecha} | ${t.length} | ${con.length} | ${eur(mc.alAno)} | ${eur(ms.alAno)} | ${eur(mc.dd)} | ${eur(ms.dd)} | ${mc.alAno > ms.alAno && mc.dd > ms.dd ? "SI en las dos" : mc.alAno > ms.alAno ? "solo ingreso" : mc.dd > ms.dd ? "solo racha" : "NO"} |`);
}
// separacion de medias con t, contra el liston
const dentro = F.filter((f) => fn(f) <= uGlobal).map((f) => f.porAncho[W].pl);
const fuera = F.filter((f) => fn(f) > uGlobal).map((f) => f.porAncho[W].pl);
const mm = (v) => v.reduce((a, b) => a + b, 0) / v.length;
console.log(`\ndias tranquilos ${eur(mm(dentro))}/dia (n=${dentro.length}) vs dias movidos ${eur(mm(fuera))}/dia (n=${fuera.length}) - t=${tWelch(dentro, fuera).toFixed(2)}`);

// 3. DENTRO DE LA CAJA
function simular(filas, N, w = 50, { mant = 0.30, lambda = 1.31, hood = HOOD, filtro = null, hoodReal = null } = {}) {
  let ef = EFECTIVO0, int = 0, acum = 0, pico = 0, peorDD = 0, maxPrest = 0, sinEf = null, llamada = null, ops = 0, saltados = 0;
  for (let i = 0; i < filas.length; i++) {
    const f = filas[i], a = f.porAncho[w]; if (!a) continue;
    if (i > 0 && ef < 0) { const d = dias(filas[i - 1].fecha, f.fecha); const c = (-ef) * TASA / 360 * d; int += c; ef -= c; }
    if (ef < 0) maxPrest = Math.max(maxPrest, -ef);
    const h = hoodReal ? hoodReal(f.fecha) : hood;
    if (ef < h * (mant - 1)) { llamada ??= f.fecha; break; }
    const pc = PC0 + lambda * (ef - EFECTIVO0);
    if (N * w * 100 > pc) continue;
    if (filtro && !filtro(f)) { saltados++; continue; }
    const pl = N * a.pl; ef += pl; ops++; acum += pl; if (acum > pico) pico = acum; peorDD = Math.min(peorDD, acum - pico);
    if (ef < 0 && !sinEf) sinEf = f.fecha; if (ef < 0) maxPrest = Math.max(maxPrest, -ef);
  }
  return { ops, saltados, bruto: acum, interes: int, neto: acum - int, alAno: (acum - int) / anos(filas), sinEf, llamada, maxPrest, peorDD, efFinal: ef };
}

console.log(`\n=== 3 - DENTRO DE LA CAJA - 1.121 dias en orden, empezando en enero de 2022 ===`);
console.log("| que se opera | contratos | dias operados | bruto | interes | NETO | $/ano | prestamo maximo | 1er dia en rojo | LLAMADA (HOOD hoy) |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
const filtroRango = (f) => fn(f) <= uGlobal;
for (const [nom, N, filt] of [["todos los dias", 1, null], ["todos los dias", 2, null],
                              ["solo manana tranquila", 1, filtroRango], ["solo manana tranquila", 2, filtroRango], ["solo manana tranquila", 3, filtroRango]]) {
  const r = simular(F, N, 50, { filtro: filt });
  console.log(`| ${nom} | ${N} | ${r.ops} | ${eur(r.bruto)} | ${eur(-r.interes)} | ${eur(r.neto)} | ${eur(r.alAno)} | ${eur(r.maxPrest)} | ${r.sinEf ?? "nunca"} | ${r.llamada ? "**" + r.llamada + "**" : "no"} |`);
}
console.log(`\npruebas de este script: ${pruebas + 4} - acumuladas con los anteriores: ~${pruebas + 4 + 60} - liston de |t| = ${listonT(pruebas + 64)}`);
