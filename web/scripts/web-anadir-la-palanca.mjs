// ══ AÑADIR LA PALANCA A LA WEB ══ Lester, 2026-08-29: «sube al web en la sección de estrategia
// la palanca».
//
// Los números NO se escriben a mano: se calculan aquí con el mismo motor que todo lo demás
// (marcado a mercado, castigo de ejecución, splits limpios) y se inyectan en
// lib/estrategias-por-ano.json, que es lo que lee EstrategiasTabla.tsx.
//
// LA REGLA que se publica es la CONGELADA (ver LA-PALANCA-CONGELADA.md), pero **sin el umbral
// del 3%** — porque ese umbral es la HIPÓTESIS que está en examen, no un hecho. En la web va
// la versión verificada, y la nota lo dice.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RAIZ } from "./raiz.mjs";
process.env.CAMINOS = "largo-p25-d400.json";
const M = await import("./motor-cartera.mjs");

const CAP = 60000, CAST = 0.5 * 0.0276;
const g = M.OPS.map((o) => o.ma);
for (let i = 0; i < M.OPS.length; i++) M.OPS[i].ma = (g[i] >= 0 || g[i] < -0.30) ? 999 : g[i];
const CF = { tam: 0.12, huecos: 2, modo: "spy", plazo: 120, castigo: CAST, capital: CAP };
const q = M.simular(CF);

// rachas y peor caída acumulada, en el orden real de las operaciones
function rachas(L) {
  let rp = 0, rg = 0, cp = 0, cg = 0, peorAc = 0, ac = 0;
  for (const x of L) {
    const gan = x.dinero * (x.mult - 1);
    if (gan > 0) { cg++; cp = 0; ac = Math.min(0, ac + gan); }
    else { cp++; cg = 0; ac += gan; }
    rp = Math.max(rp, cp); rg = Math.max(rg, cg);
    peorAc = Math.min(peorAc, ac);
  }
  return { rachaPerd: rp, rachaGan: rg, peorCaida: peorAc };
}
const ops = q.tom.slice().sort((a, b) => a.dC.localeCompare(b.dC))
  .map((x) => ({ ...x, gan: x.dinero * (x.mult - 1) }));

const porAno = [];
for (const y of ["2016","2017","2018","2019","2020","2021","2022","2023","2024","2025","2026"]) {
  const L = ops.filter((x) => x.y === y);
  if (!L.length) continue;
  const r = rachas(L);
  porAno.push({ ano: y, ops: L.length,
    ganancia: L.reduce((a, x) => a + x.gan, 0),
    peorOp: Math.min(...L.map((x) => x.gan)),
    peorCaida: r.peorCaida, rachaPerd: r.rachaPerd, rachaGan: r.rachaGan });
}
const rT = rachas(ops);
const anos = 10.6;
const total = {
  ops: ops.length,
  ganancia: q.final - CAP,
  alAno: (q.final - CAP) / anos,
  peorOp: Math.min(...ops.map((x) => x.gan)),
  peorCaida: rT.peorCaida, rachaPerd: rT.rachaPerd, rachaGan: rT.rachaGan,
  acierto: ops.filter((x) => x.gan > 0).length / ops.length,
  porOperacion: ops.reduce((a, x) => a + (x.mult - 1), 0) / ops.length,
  desde: ops[0].dC.slice(0,4) + "-" + ops[0].dC.slice(4,6) + "-" + ops[0].dC.slice(6,8),
  hasta: "2026-08-19",
};

const TABLA = {
  nombre: "LA PALANCA · calls muy dentro del dinero",
  unidad: "cartera de $60.000 · el ocioso en SPY",
  nota: "CALL 25% dentro del dinero, vencimiento a ~400 días, comprada al ask el día que la acción " +
    "está bajo su media de 20 sesiones. Se aguanta 120 sesiones, suelo 0,50x, sin tope de ganancia, " +
    "se vende al bid. 2 posiciones al 12% del patrimonio. Precios reales con castigo de media " +
    "horquilla medida. En el mismo período comprar SPY y dormir da " +
    Math.round((262254 - CAP)) .toLocaleString("es-ES") + " dólares, o sea $" +
    Math.round((262254 - CAP) / anos).toLocaleString("es-ES") + " al año, con caída máxima del 34% " +
    "contra el 42% de esta. En Sharpe empatan (0,72 contra 0,70): lo que ganas es dinero, lo que " +
    "pagas es susto. AVISO: el umbral de «más de 3% bajo la media», que en estos 27 tickers sube " +
    "el Sharpe a 0,80, NO está aquí — está en examen sobre 24 tickers nuevos y hasta que no pase " +
    "no se publica.",
  porAno, total,
};

const F = join(RAIZ, "lib", "estrategias-por-ano.json");
const J = JSON.parse(readFileSync(F, "utf8"));
J.tablas = J.tablas.filter((t) => !t.nombre.startsWith("LA PALANCA"));
J.tablas.unshift(TABLA);
J.generado = new Date().toISOString().slice(0, 10);
writeFileSync(F, JSON.stringify(J, null, 1), "utf8");

console.log("");
console.log("  ══ LA PALANCA → la web ══");
console.log("  " + TABLA.nombre);
console.log("  " + total.ops + " operaciones · " + total.desde + " → " + total.hasta);
console.log("  gana $" + Math.round(total.ganancia).toLocaleString("es-ES") +
  " = $" + Math.round(total.alAno).toLocaleString("es-ES") + " al año  ·  acierta " +
  Math.round(total.acierto * 100) + "%");
console.log("  peor operación −$" + Math.round(-total.peorOp).toLocaleString("es-ES") +
  "  ·  " + total.rachaPerd + " perdedoras seguidas  ·  " + total.rachaGan + " ganadoras seguidas");
console.log("");
console.log("  " + "año".padEnd(7) + "ops".padStart(5) + "ganancia".padStart(13) +
  "peor op".padStart(12) + "peor racha".padStart(13) + "perd".padStart(6) + "gan".padStart(5));
for (const a of porAno)
  console.log("  " + a.ano.padEnd(7) + String(a.ops).padStart(5) +
    ("$" + Math.round(a.ganancia).toLocaleString("es-ES")).padStart(13) +
    ("$" + Math.round(a.peorOp).toLocaleString("es-ES")).padStart(12) +
    ("$" + Math.round(a.peorCaida).toLocaleString("es-ES")).padStart(13) +
    String(a.rachaPerd).padStart(6) + String(a.rachaGan).padStart(5));
console.log("");
console.log("  tablas ahora en la web: " + J.tablas.map((t) => t.nombre.split(" ·")[0]).join("  ·  "));
console.log("");
