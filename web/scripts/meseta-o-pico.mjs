// ¿MESETA O PICO? — la comprobación que decide si «los tres síes» merece un forward-test.
//
// La regla es: sobre MA5 Y sobre MA50, y crédito ≥ $100, a ±45 con alas de 50.
// Esos tres números salieron de un barrido sobre estos mismos días. La pregunta honesta:
//
//   Si los muevo un poco, ¿sigue funcionando?
//     · SÍ  → es una MESETA. La regla es robusta y el forward-test tiene sentido.
//     · NO  → es un PICO. Es una coincidencia de estos datos y NO hay que montar nada.
//
// Un pico se reconoce porque los vecinos se caen. Una meseta, porque todo el barrio aguanta.
// Esto no arregla las otras dos debilidades (n=218 y las ~300 pruebas acumuladas): ésas sólo
// las arregla el tiempo. Pero si esto sale pico, las otras dos dan igual.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/meseta-o-pico.mjs

import { readFileSync, readdirSync, existsSync } from "node:fs";

const DIR = "scripts/cache-theta/gex-2026";
const HORA = "11:00", ALA = 50, COMM = 0.03;
const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const sd = (v) => { const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const racha = (v) => { let c = 0, p = 0; for (const x of v) { c = Math.min(0, c + x); p = Math.min(p, c); } return p; };

function leerDia(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const idx = ["strike", "timestamp", "bid", "ask", "underlying_price"].map((c) => cab.indexOf(c));
  if (idx.some((x) => x < 0)) throw new Error("faltan columnas en " + f);
  const [iK, iT, iB, iA, iU] = idx;
  const enHora = [];
  let cierre = 0, hFin = "";
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(",");
    const h = String(c[iT]).slice(11, 16), sp = Number(c[iU]);
    if (sp > 0 && h >= hFin) { hFin = h; cierre = sp; }
    if (h !== HORA) continue;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]);
    if (K > 0 && bid >= 0 && ask > 0) enHora.push({ K, bid, ask, spot: sp });
  }
  return enHora.length ? { filas: enHora, cierre } : null;
}
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));

// ── una pasada: para cada día, el cóndor a varias distancias ────────────────
const DISTANCIAS = [35, 40, 45, 50, 55];
const fechas = [...new Set(readdirSync(DIR).map((f) => (f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/) || [])[1]).filter(Boolean))].sort();
const dias = [];
for (const fecha of fechas) {
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P || !(C.cierre > 0)) continue;
  const sp11 = C.filas[0].spot;
  if (!(sp11 > 0)) continue;
  const d = { fecha, sp11, cierre: C.cierre, c: {} };
  let ok = true;
  for (const dist of DISTANCIAS) {
    const cC = cerca(C.filas, sp11 + dist), pC = cerca(P.filas, sp11 - dist);
    const cL = cerca(C.filas, cC.K + ALA), pL = cerca(P.filas, pC.K - ALA);
    if (cL.K <= cC.K || pL.K >= pC.K) { ok = false; break; }
    const cred = cC.bid + pC.bid - cL.ask - pL.ask;
    const S = C.cierre;
    d.c[dist] = {
      cred: cred * 100,
      pl: (cred - Math.min(Math.max(S - cC.K, 0), cL.K - cC.K)
                - Math.min(Math.max(pC.K - S, 0), pC.K - pL.K)) * 100 - 8 * COMM,
    };
  }
  if (ok) dias.push(d);
}

// medias con cierres ESTRICTAMENTE anteriores, para varias longitudes
const LARGOS = [3, 5, 10, 20, 50, 100];
for (let i = 0; i < dias.length; i++) {
  if (i < 100) { dias[i].ma = null; continue; }
  const c = dias.slice(i - 100, i).map((x) => x.cierre);
  dias[i].ma = {};
  for (const n of LARGOS) dias[i].ma[n] = media(c.slice(-n));
}
const U = dias.filter((d) => d.ma);
console.log(`\n## ${U.length} días utilizables (${U[0].fecha} → ${U[U.length - 1].fecha})\n`);

const anos = U.length / 252;
/** Evalúa una configuración concreta. */
function evalua(corta, larga, umbral, dist) {
  const op = U.filter((d) => d.sp11 >= d.ma[corta] && d.sp11 >= d.ma[larga] && d.c[dist].cred >= umbral);
  if (op.length < 20) return null;
  const pl = op.map((d) => d.c[dist].pl);
  return { n: op.length, ano: pl.reduce((a, b) => a + b, 0) / anos, racha: racha(pl),
           t: media(pl) / (sd(pl) / Math.sqrt(pl.length)),
           acierto: (pl.filter((x) => x > 0).length / pl.length) * 100 };
}

// ── 1 · EL UMBRAL DE CRÉDITO ────────────────────────────────────────────────
console.log(`### 1 · ¿El umbral de $100 es un pico?  (MA5 y MA50, ±45 fijos)\n`);
console.log("| umbral | días | $/año | peor racha | acierto | t |");
console.log("|---|---|---|---|---|---|");
for (const u of [0, 50, 75, 100, 125, 150, 200, 300]) {
  const r = evalua(5, 50, u, 45);
  console.log(r ? `| ${u === 100 ? "**$100**" : "$" + u} | ${r.n} | ${eur(r.ano)} | ${eur(r.racha)} | ${r.acierto.toFixed(1)}% | ${r.t.toFixed(2)} |`
                : `| $${u} | menos de 20 días | | | | |`);
}

// ── 2 · EL PAR DE MEDIAS ────────────────────────────────────────────────────
console.log(`\n### 2 · ¿El par MA5/MA50 es un pico?  (umbral $100, ±45 fijos)\n`);
console.log("| corta \\ larga | " + [20, 50, 100].join(" | ") + " |");
console.log("|---|---|---|---|");
for (const corta of [3, 5, 10, 20]) {
  const fila = [20, 50, 100].map((larga) => {
    if (corta >= larga) return "—";
    const r = evalua(corta, larga, 100, 45);
    return r ? `${eur(r.ano)} · t ${r.t.toFixed(2)}` : "pocos días";
  });
  console.log(`| **MA${corta}** | ${fila.join(" | ")} |`);
}

// ── 3 · LA DISTANCIA ────────────────────────────────────────────────────────
console.log(`\n### 3 · ¿Y la distancia de ±45?  (MA5/MA50, umbral $100)\n`);
console.log("| distancia | días | $/año | peor racha | acierto | t |");
console.log("|---|---|---|---|---|---|");
for (const dist of DISTANCIAS) {
  const r = evalua(5, 50, 100, dist);
  console.log(r ? `| ${dist === 45 ? "**±45**" : "±" + dist} | ${r.n} | ${eur(r.ano)} | ${eur(r.racha)} | ${r.acierto.toFixed(1)}% | ${r.t.toFixed(2)} |` : `| ±${dist} | pocos días | | | | |`);
}

// ── VEREDICTO ───────────────────────────────────────────────────────────────
const base = evalua(5, 50, 100, 45);
const vecinos = [];
for (const u of [75, 125]) { const r = evalua(5, 50, u, 45); if (r) vecinos.push(["umbral $" + u, r]); }
for (const [c, l] of [[3, 50], [10, 50], [5, 20], [5, 100]]) { const r = evalua(c, l, 100, 45); if (r) vecinos.push([`MA${c}/MA${l}`, r]); }
for (const d of [40, 50]) { const r = evalua(5, 50, 100, d); if (r) vecinos.push(["±" + d, r]); }

const buenos = vecinos.filter(([, r]) => r.ano > 0 && r.t > 2);
console.log(`\n${"═".repeat(72)}`);
console.log(`  LA REGLA: ${eur(base.ano)}/año · t ${base.t.toFixed(2)} · racha ${eur(base.racha)} · ${base.n} días`);
console.log(`  SUS ${vecinos.length} VECINOS INMEDIATOS: ${buenos.length} dan dinero con t > 2`);
console.log("");
for (const [n, r] of vecinos) console.log(`    ${n.padEnd(14)} ${eur(r.ano).padStart(9)}/año · t ${r.t.toFixed(2).padStart(5)} · racha ${eur(r.racha)}`);
console.log(`\n  ${buenos.length >= vecinos.length * 0.75 ? "🟢 ES MESETA — el barrio entero aguanta, la regla no es una coincidencia" : buenos.length >= vecinos.length * 0.4 ? "🟡 MESETA IRREGULAR — aguanta pero con huecos, mirar cuáles" : "🔴 ES UN PICO — los vecinos se caen. NO montar forward-test sobre esto"}`);
console.log("═".repeat(72));
