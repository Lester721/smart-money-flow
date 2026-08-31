// ══ ¿LA PUT PROTEGE, O SÓLO ES NO ESTAR INVERTIDO? ══ Lester, 2026-08-28.
//
// ═══ POR QUÉ HAY QUE PREGUNTARSE ESTO ══════════════════════════════════════════════════════
// r127 dio que 70% put + 30% calls = 16,4% al año con caída −16%, contra SPY 15,1% y −32%.
// Bate al índice en las DOS columnas y no vive del reequilibrio. Sonaba a hallazgo.
//
// Pero r129 lo puso en duda sin querer: al meter la pata de put como VERTICAL (que sólo ata
// el 5-20% del capital), la caída se quedó en −38%, igual que sin ella. Y eso apunta a algo
// incómodo: en r127 el 70% de la cuenta estaba en COLATERAL DE EFECTIVO. La caída no bajaba
// porque la put protegiera — bajaba porque el 70% del dinero NO ESTABA EN EL MERCADO.
//
// ═══ EL CONTROL QUE LO DECIDE ══════════════════════════════════════════════════════════════
// Se cambia la pata de put por EFECTIVO al 3,3% y por SPY, con el mismo peso, y se comparan
// las tres. Si «efectivo + calls» da la misma caída que «put + calls», entonces la put no
// protege: sólo rinde más que el efectivo. Sigue valiendo — pero se cuenta de otra manera,
// y no se puede llamar cobertura.
process.argv[2] = new URL("./cache-theta/noche-2026-08-10", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
process.env.CAMINOS = "caminos-indice.json";
const { res } = await import("./noche-2026-08-10/intradia-lib.mjs");
const { simular, OPS, SPY, DD, D, pct } = await import("./motor-cartera.mjs");

const PUT = new Map(res.get("12:00").map((p) => [p.rolo, p]));
const sinGuion = (d) => d.replace(/-/g, "");
for (const o of OPS) o.ma = -1;
const calls = simular({ tam: 0.08, huecos: 2, modo: "spy" });
const vCalls = new Map(DD.map((d, i) => [d, calls.V[i]]));
const RATE = Math.pow(1.033, 7 / 365) - 1;

const viernes = [];
{ const d = new Date(Date.UTC(2020, 0, 3));
  while (d < new Date(Date.UTC(2026, 7, 1))) { viernes.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 7); } }
const haciaAtras = (iso) => { const d = sinGuion(iso); const c = DD.filter((x) => x <= d); return c.length ? c[c.length-1] : null; };

const rPut = [], rCall = [], rSPY = [], semanas = [];
for (let i = 0; i < viernes.length - 1; i++) {
  const a = haciaAtras(viernes[i]), b = haciaAtras(viernes[i + 1]);
  if (!a || !b || a === b) continue;
  const va = vCalls.get(a), vb = vCalls.get(b); if (va == null || vb == null) continue;
  const p = PUT.get(viernes[i]);
  rPut.push(p ? p.ret : RATE); rCall.push(vb / va - 1);
  rSPY.push(SPY[b] / SPY[a] - 1 + 0.013 * 7 / 365); semanas.push(viernes[i]); }
const ANOS = (Date.parse(semanas[semanas.length-1]) - Date.parse(semanas[0])) / (365.25 * 86400000);
const rCASH = rPut.map(() => RATE);

function met(R, anos = ANOS) {
  let eq = 1, pico = 1, dd = 0;
  for (const x of R) { eq *= (1 + x); pico = Math.max(pico, eq); dd = Math.max(dd, 1 - eq / pico); }
  const m = R.reduce((a,x)=>a+x,0)/R.length;
  const sd = Math.sqrt(R.reduce((a,x)=>a+(x-m)**2,0)/(R.length-1));
  return { anual: 100*(Math.pow(eq, 1/anos)-1), caida: 100*dd, sharpe: (m*52-0.033)/(sd*Math.sqrt(52)),
    final: 55419*eq, peor: 100*Math.min(...R) }; }
const mezcla = (w, otra) => rCall.map((c, i) => w * otra[i] + (1 - w) * c);

console.log("");
console.log("  ══ AUDIT ══");
console.log("  ventana " + semanas[0] + " → " + semanas[semanas.length-1] + "  ·  " + ANOS.toFixed(1) +
  " años · " + rPut.length + " semanas · capital $55.419");
const mS = met(rSPY);
console.log("  ✓ comprar SPY: " + mS.anual.toFixed(1) + "% al año, caída −" + mS.caida.toFixed(0) + "%");
console.log("  ⚠️ caída medida los viernes (~2 puntos optimista)");
console.log("");

console.log("  ══ EL CONTROL ══  la misma cartera cambiando SÓLO qué hay en la pata que no son calls");
console.log("");
console.log("  " + "peso fuera de las calls".padEnd(26) +
  "la PUT semanal".padStart(22) + "EFECTIVO al 3,3%".padStart(22) + "SPY".padStart(22));
console.log("  " + " ".repeat(26) + "al año  caída  Sharpe".padStart(22) + "al año  caída  Sharpe".padStart(22) + "al año  caída  Sharpe".padStart(22));
const tri = (w) => [mezcla(w, rPut), mezcla(w, rCASH), mezcla(w, rSPY)].map((R) => met(R));
for (const w of [0, 0.2, 0.3, 0.5, 0.7, 0.8, 1]) {
  const [a, b, c] = tri(w);
  const cel = (m) => ((m.anual.toFixed(1)+"%").padStart(7) + ("−"+m.caida.toFixed(0)+"%").padStart(7) + m.sharpe.toFixed(2).padStart(6)).padStart(22);
  console.log("  " + ((100*w).toFixed(0) + "%").padEnd(26) + cel(a) + cel(b) + cel(c)); }
console.log("");
console.log("  ── la pregunta ──");
const [pa, pb] = tri(0.7);
console.log("  al 70%:  put → caída −" + pa.caida.toFixed(0) + "%   ·   efectivo → caída −" + pb.caida.toFixed(0) + "%");
console.log("  " + (Math.abs(pa.caida - pb.caida) < 3
  ? "  ⛔ LA PUT NO PROTEGE. La caída baja por NO ESTAR INVERTIDO, no por la put."
  : "  ✓ la put baja la caída " + (pb.caida - pa.caida).toFixed(0) + " puntos MÁS que el efectivo"));
console.log("  lo que la put SÍ aporta: " + (pa.anual - pb.anual).toFixed(1) +
  " puntos de rendimiento al año sobre tener ese dinero en efectivo");
console.log("");

// ── ¿y comparado con simplemente poner MENOS en las calls? ──
console.log("  ══ EL LISTÓN DE SIEMPRE ══  ¿le gana a poner menos dinero y punto?");
console.log("");
console.log("  " + "estructura".padEnd(34) + "al año".padStart(9) + "caída".padStart(8) + "Sharpe".padStart(8) +
  "peor sem".padStart(10) + "$55.419 →".padStart(13));
const filas = [["comprar SPY y dormir", rSPY]];
for (const w of [0.3, 0.5, 0.7]) filas.push([(100*w).toFixed(0) + "% put + " + (100*(1-w)).toFixed(0) + "% calls", mezcla(w, rPut)]);
for (const w of [0.3, 0.5, 0.7]) filas.push([(100*w).toFixed(0) + "% EFECTIVO + " + (100*(1-w)).toFixed(0) + "% calls", mezcla(w, rCASH)]);
for (const w of [0.3, 0.5, 0.7]) filas.push([(100*w).toFixed(0) + "% SPY + " + (100*(1-w)).toFixed(0) + "% calls", mezcla(w, rSPY)]);
for (const [n, R] of filas) { const m = met(R);
  console.log("  " + n.padEnd(34) + (m.anual.toFixed(1)+"%").padStart(9) + ("−"+m.caida.toFixed(0)+"%").padStart(8) +
    m.sharpe.toFixed(2).padStart(8) + pct(m.peor,1).padStart(10) + D(m.final).padStart(13)); }
console.log("");

// ── las dos mitades del ganador ──
console.log("  ══ LAS DOS MITADES ══");
console.log("");
const corte = Math.floor(rPut.length / 2);
console.log("  " + "estructura".padEnd(34) + ("1ª: " + semanas[0]).padStart(20) + ("2ª: " + semanas[corte]).padStart(20));
for (const [n, R] of filas) {
  const a = met(R.slice(0, corte), ANOS/2), b = met(R.slice(corte), ANOS/2);
  console.log("  " + n.padEnd(34) + ((a.anual.toFixed(1)+"%").padStart(9) + ("−"+a.caida.toFixed(0)+"%").padStart(8)).padStart(20) +
    ((b.anual.toFixed(1)+"%").padStart(9) + ("−"+b.caida.toFixed(0)+"%").padStart(8)).padStart(20)); }
console.log("");
