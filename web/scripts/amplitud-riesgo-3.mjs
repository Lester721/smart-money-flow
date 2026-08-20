// AMPLITUD COMO RIESGO · PARTE 3 — el filtro sí toca la COLA, y contra qué hay que compararlo.
//
// La parte 1 midió la MEDIA de los días saltados y salió t = 0,82: nada. La parte 2 midió la COLA
// contra 4.000 sorteos de los mismos días y salió 4.000 de 4.000, en las dos mitades. Las dos
// cosas pueden ser verdad a la vez: el día MEDIO que se salta es igual de bueno, y los días de
// PALO GORDO no lo son. Aquí se comprueba directo, se busca el mecanismo, y se compara contra la
// OTRA palanca de riesgo que no cuesta días: alejar el cóndor.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/amplitud-riesgo-3.mjs

import { readFileSync } from "node:fs";
import { listonT } from "../lib/barreraHallazgos";

const CUENTA = 56389, EFECTIVO = 7977;
const PRUEBAS = 40, LISTON = listonT(PRUEBAS);
const eur = (x) => (x == null || !Number.isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const pct = (x) => (x == null || !Number.isFinite(x) ? "—" : (x * 100).toFixed(1) + "%");
const suma = (v) => v.reduce((a, b) => a + b, 0);
const media = (v) => (v.length ? suma(v) / v.length : NaN);

const { dias } = JSON.parse(readFileSync("scripts/amplitud-riesgo-dias.json", "utf8"));
const sobreAmbas = (d) => d.sp11 >= d.ma20 && d.sp11 >= d.ma50;
function caidaMax(pl) { let c = 0, p = 0, w = 0; for (const x of pl) { c += x; p = Math.max(p, c); w = Math.min(w, c - p); } return w; }
function es5de(pl) { const o = [...pl].sort((a, b) => a - b); return media(o.slice(0, Math.max(1, Math.round(pl.length * 0.05)))); }
function suelo(pl, f) { let c = EFECTIVO, m = EFECTIVO, fe = null; for (let i = 0; i < pl.length; i++) { c += pl[i]; if (c < m) { m = c; fe = f[i]; } } return { min: m, fecha: fe }; }
const dSer = (ds, dist, filt) => ds.map((d) => { const p = d.pnl[String(dist)]; return filt(d) && p != null ? p : 0; });

const ANCHO = 104;
const raya = (t) => { console.log("\n" + "═".repeat(ANCHO)); console.log("  " + t); console.log("═".repeat(ANCHO)); };
const mitad = Math.floor(dias.length / 2);
const H = [dias.slice(0, mitad), dias.slice(mitad)];
const TRAMOS = [["período entero", dias], [`H1 ${dias[0].fecha}→${dias[mitad - 1].fecha}`, H[0]], [`H2 ${dias[mitad].fecha}→${dias[dias.length - 1].fecha}`, H[1]]];

console.log(`\n# AMPLITUD COMO RIESGO · PARTE 3 — la cola\n`);
console.log(`${dias.length} sesiones · ${dias[0].fecha} → ${dias[dias.length - 1].fecha} · ${PRUEBAS} pruebas declaradas · listón |t| = ${LISTON}`);

// ═══ K · LA COLA, CONTADA A MANO ════════════════════════════════════════════════════════════
raya("K · LOS DÍAS DE PALO GORDO — contados uno a uno");
console.log(`
  De los días más caros con la geometría ±30, ¿cuántos se salta el filtro? Si no eligiera nada,
  se saltaría la misma proporción que en el resto del calendario.
`);
console.log("| tramo | días saltados / total | de los 20 peores, saltados | de los 50 peores | esperado si fuera al azar | z |");
console.log("|---|---|---|---|---|---|");
for (const [nom, ds] of TRAMOS) {
  const conPL = ds.filter((d) => d.pnl["30"] != null);
  const salta = conPL.filter((d) => !sobreAmbas(d)).length;
  const p0 = salta / conPL.length;
  const ord = [...conPL].sort((a, b) => a.pnl["30"] - b.pnl["30"]);
  const cnt = (k) => ord.slice(0, k).filter((d) => !sobreAmbas(d)).length;
  const k = 50, obs = cnt(k), esp = k * p0;
  const z = (obs - esp) / Math.sqrt(k * p0 * (1 - p0));
  console.log(`| ${nom} | ${salta}/${conPL.length} (${pct(p0)}) | ${cnt(20)}/20 (${pct(cnt(20) / 20)}) | ${obs}/50 (${pct(obs / 50)}) | ${esp.toFixed(1)}/50 | **${z.toFixed(2)}** |`);
}

console.log(`\n### La frecuencia de palo gordo — proporción de días con pérdida > $2.000\n`);
console.log("| tramo | opera: días malos | salta: días malos | diferencia | z de dos proporciones | ¿pasa " + LISTON + "? |");
console.log("|---|---|---|---|---|---|");
for (const [nom, ds] of TRAMOS) {
  const op = ds.filter((d) => sobreAmbas(d) && d.pnl["30"] != null).map((d) => d.pnl["30"]);
  const sa = ds.filter((d) => !sobreAmbas(d) && d.pnl["30"] != null).map((d) => d.pnl["30"]);
  const c1 = op.filter((x) => x < -2000).length, c2 = sa.filter((x) => x < -2000).length;
  const p1 = c1 / op.length, p2 = c2 / sa.length, p = (c1 + c2) / (op.length + sa.length);
  const z = (p1 - p2) / Math.sqrt(p * (1 - p) * (1 / op.length + 1 / sa.length));
  console.log(`| ${nom} | ${c1}/${op.length} (${pct(p1)}) | ${c2}/${sa.length} (${pct(p2)}) | ${pct(p1 - p2)} | **${z.toFixed(2)}** | ${Math.abs(z) >= LISTON ? "**sí**" : "no"} |`);
}

console.log(`\n### El mecanismo — qué mueve el mercado los días que el filtro opera y los que salta\n`);
console.log("| tramo | movimiento 11:00→cierre, media |abs| opera | salta | días con |mov| > 1% opera | salta |");
console.log("|---|---|---|---|---|---|");
for (const [nom, ds] of TRAMOS) {
  const mv = (d) => Math.abs(d.cierre / d.sp11 - 1);
  const op = ds.filter(sobreAmbas), sa = ds.filter((d) => !sobreAmbas(d));
  const g = (v) => pct(media(v.map(mv)));
  const b = (v) => `${v.filter((d) => mv(d) > 0.01).length} (${pct(v.filter((d) => mv(d) > 0.01).length / v.length)})`;
  console.log(`| ${nom} | ${g(op)} | ${g(sa)} | ${b(op)} | ${b(sa)} |`);
}
console.log(`
   El filtro no adivina el día: apaga la máquina cuando el índice está por debajo de sus medias,
   y ahí es donde vive la volatilidad. Es el efecto de racimo de siempre, no una predicción.
`);

// ═══ L · A EXPOSICIÓN IGUALADA — sin ajustar nada ═══════════════════════════════════════════
raya("L · A EXPOSICIÓN IGUALADA — el filtro contra operar menos contratos, sin ajustar nada");
const fExp = dias.filter(sobreAmbas).length / dias.length;
console.log(`
  El filtro opera el ${pct(fExp)} de las sesiones. El modo tonto de quitar esa misma exposición es
  operar ${fExp.toFixed(3)} contratos todos los días. Ese número NO se ajusta a nada: sale del propio
  recuento de días del filtro. Por eso esta comparación no necesita cruce — no hay nada que elegir.
`);
console.log("| tramo | variante | $/año | caída máx | 5% peor | suelo de EFECTIVO | ¿domina? |");
console.log("|---|---|---|---|---|---|---|");
for (const [nom, ds] of TRAMOS) {
  const fechas = ds.map((d) => d.fecha), anos = ds.length / 252;
  const sF = dSer(ds, 30, sobreAmbas);
  const sT = dSer(ds, 25, () => true).map((x) => x * fExp);
  const filas = [["FILTRO ±30 + medias · 1 contrato", sF], [`BASE ±25 · ${fExp.toFixed(3)} contratos`, sT]];
  const m = filas.map(([, s]) => ({ a: suma(s) / anos, c: caidaMax(s), e: es5de(s), su: suelo(s, fechas) }));
  const domina = m[0].a > m[1].a && m[0].c > m[1].c && m[0].e > m[1].e ? "**FILTRO en las 3**"
    : m[1].a > m[0].a && m[1].c > m[0].c && m[1].e > m[0].e ? "**TAMAÑO en las 3**" : "mixto";
  for (const [i, [n]] of filas.entries())
    console.log(`| ${i === 0 ? nom : ""} | ${n} | ${eur(m[i].a)} | ${eur(m[i].c)} | ${eur(m[i].e)} | ${eur(m[i].su.min)} | ${i === 0 ? domina : ""} |`);
}

// ═══ M · CONTRA LA OTRA PALANCA: ALEJAR EL CÓNDOR ═══════════════════════════════════════════
raya("M · CONTRA LA PALANCA QUE NO CUESTA DÍAS — alejar el cóndor");
console.log(`
  Bajar contratos no es el único modo tonto de bajar riesgo. El otro es la DISTANCIA: ±40 en vez
  de ±25 baja la caída de −$22.182 a −$13.338 SIN dejar de operar ni un día. Ésa es la competencia
  de verdad del filtro, porque llega al mismo sitio por otro camino. Se comparan a caída igualada.
`);
console.log("| tramo | variante | días op. | $/año | caída máx | % cuenta | 5% peor | suelo EFECTIVO |");
console.log("|---|---|---|---|---|---|---|---|");
for (const [nom, ds] of TRAMOS) {
  const fechas = ds.map((d) => d.fecha), anos = ds.length / 252;
  const filas = [["FILTRO ±30 + medias", 30, sobreAmbas], ["±40 · todos los días", 40, () => true], ["±45 · todos los días", 45, () => true], ["BASE ±25 · todos", 25, () => true]];
  for (const [i, [n, dist, filt]] of filas.entries()) {
    const s = dSer(ds, dist, filt), su = suelo(s, fechas), c = caidaMax(s);
    console.log(`| ${i === 0 ? nom : ""} | ${n} | ${s.filter((x) => x !== 0).length} | ${eur(suma(s) / anos)} | ${eur(c)} | ${pct(c / CUENTA)} | ${eur(es5de(s))} | ${eur(su.min)} |`);
  }
}

// ═══ N · EL CRUCE DE VERDAD — elegir los parámetros en una mitad ════════════════════════════
raya("N · EL CRUCE — elegir la media y la distancia POR RIESGO en una mitad, aplicarlas a la otra");
console.log(`
  Hasta aquí ±30/MA20/MA50 venía dado. Aquí se elige de cero: se barren 6 medias cortas × 6 largas
  × 6 distancias = 216 combinaciones, se coge la de MENOR 5% peor en la mitad de ajuste (nunca por
  $/año: el hallazgo de ρ dice que el ingreso va invertido) y se aplica TAL CUAL a la otra.
`);
const MC = [5, 10, 20, 50, 100, 200], DD = [20, 25, 30, 35, 40, 45];
function mediasPrev(k, i) { if (i < k) return null; let s = 0; for (let j = i - k; j < i; j++) s += dias[j].cierre; return s / k; }
const MA = {};
for (const k of MC) MA[k] = dias.map((_, i) => mediasPrev(k, i));
const combos = [];
for (const a of MC) for (const b of MC) { if (b <= a) continue; for (const dist of DD) combos.push({ a, b, dist }); }
combos.push({ a: null, b: null, dist: 25 });   // la base, sin filtro, dentro del concurso
const idxDe = new Map(dias.map((d, i) => [d.fecha, i]));
const serieCombo = (ds, c) => ds.map((d) => {
  const i = idxDe.get(d.fecha), p = d.pnl[String(c.dist)];
  if (p == null) return 0;
  if (c.a == null) return p;
  const m1 = MA[c.a][i], m2 = MA[c.b][i];
  if (m1 == null || m2 == null) return 0;
  return d.sp11 >= m1 && d.sp11 >= m2 ? p : 0;
});
const evalua = (ds, c) => { const s = serieCombo(ds, c); const n = s.filter((x) => x !== 0).length; return { n, a: suma(s) / (ds.length / 252), c: caidaMax(s), e: es5de(s) }; };

console.log(`${combos.length} combinaciones (incluida la base sin filtro).\n`);
console.log("| ajuste en | elegida por 5% peor | 5% peor ajuste | prueba en | 5% peor prueba | ¿mejor que la base? | $/año prueba | $/año base |");
console.log("|---|---|---|---|---|---|---|---|");
const salida = [];
for (const [aj, pr] of [[0, 1], [1, 0]]) {
  const cand = combos.filter((c) => evalua(H[aj], c).n >= 100 && evalua(H[pr], c).n >= 100);
  const mejor = cand.map((c) => ({ c, m: evalua(H[aj], c) })).sort((x, y) => y.m.e - x.m.e)[0];
  const base = { a: null, b: null, dist: 25 };
  const mP = evalua(H[pr], mejor.c), bP = evalua(H[pr], base);
  const nom = mejor.c.a == null ? "BASE ±25 sin filtro" : `±${mejor.c.dist} · sobre MA${mejor.c.a} y MA${mejor.c.b}`;
  salida.push({ aj, pr, nom, mP, bP });
  console.log(`| H${aj + 1} | ${nom} | ${eur(mejor.m.e)} | H${pr + 1} | ${eur(mP.e)} | ${mP.e > bP.e ? "**SÍ** (" + eur(bP.e) + ")" : "no (" + eur(bP.e) + ")"} | ${eur(mP.a)} | ${eur(bP.a)} |`);
}

console.log(`\n### ¿Pico o meseta? — el 5% peor de ±30 con todas las parejas de medias\n`);
console.log("| media corta \\ larga | " + MC.map((x) => "MA" + x).join(" | ") + " |");
console.log("|---|" + MC.map(() => "---").join("|") + "|");
for (const a of MC) {
  const cel = MC.map((b) => { if (b <= a) return "·"; const m = evalua(dias, { a, b, dist: 30 }); return m.n >= 100 ? eur(m.e) : "—"; });
  console.log(`| **MA${a}** | ${cel.join(" | ")} |`);
}
const bE = evalua(dias, { a: null, b: null, dist: 30 });
console.log(`\n(sin filtro, ±30: ${eur(bE.e)} · el filtro de referencia MA20+MA50: ${eur(evalua(dias, { a: 20, b: 50, dist: 30 }).e)})`);

// ═══ VEREDICTO ══════════════════════════════════════════════════════════════════════════════
raya("VEREDICTO DE LA PARTE 3");
const cruceOK = salida.every((s) => s.mP.e > s.bP.e);
console.log(`
  · El filtro elegido de cero POR RIESGO en una mitad mejora el 5% peor en la otra: ${cruceOK ? "SÍ, en las dos direcciones" : "NO en las dos"}.
${salida.map((s) => `      H${s.aj + 1}→H${s.pr + 1}: ${s.nom} → 5% peor ${eur(s.mP.e)} contra ${eur(s.bP.e)} de la base · $/año ${eur(s.mP.a)} contra ${eur(s.bP.a)}`).join("\n")}
`);
