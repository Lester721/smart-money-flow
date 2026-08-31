// ══ LA MEZCLA: CALLS DE ÍNDICE + PUT SEMANAL ══ Lester, 2026-08-28: «córrelo».
//
// ═══ POR QUÉ ESTAS DOS Y NO OTRAS ══════════════════════════════════════════════════════════
//
// Hoy quedó medido que las calls de índice son beta apalancada con convexidad y SIN alfa:
// empatan con comprar SPY en Sharpe (0,71 vs 0,70). Para batir al índice en riesgo/rendimiento
// no hace falta más alfa — hace falta algo QUE NO SE MUEVA CON ELLAS.
//
// La put semanal de QQQ 3% fuera a media sesión es lo único medido que cumple eso:
//   en semanas que el QQQ SUBE: +0,436%   ·   en semanas que BAJA: +0,002%
// No gana en las bajadas: se queda PLANA. Correlación 0,50 con el índice.
//
// Estructuralmente son opuestas: la call cobra en el salto grande, la put cobra en la calma.
//
// ═══ LO QUE HAY QUE VIGILAR AL MEDIRLO ═════════════════════════════════════════════════════
//   · La put sólo existe de 2020-01 a 2026-07. La ventana común manda, y se dice.
//   · La put es SEMANAL: la curva se mide los viernes. Una caída medida en puntos semanales
//     sale MENOR que la diaria. Se enseñan las dos para el tramo de calls y se avisa.
//   · El listón NO es cero: es comprar SPY, comprar QQQ y SPY a crédito, en la misma ventana.
//   · Las dos mitades desde el primer momento, como en r122.
process.argv[2] = new URL("./cache-theta/noche-2026-08-10", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
process.env.CAMINOS = "caminos-indice.json";
const { res } = await import("./noche-2026-08-10/intradia-lib.mjs");
const { simular, spyApalancado, OPS, SPY, DD, D, pct } = await import("./motor-cartera.mjs");

const PUT = res.get("12:00").slice().sort((a, b) => a.rolo.localeCompare(b.rolo));
const sinGuion = (d) => d.replace(/-/g, "");
const med = (X) => { const B = [...X].sort((a, b) => a - b); return B[Math.floor(B.length / 2)]; };

// ── la pata de calls de índice: curva diaria del motor, la config validada en r126 ──
for (const o of OPS) o.ma = -1;                      // «siempre puesta» (r125: la media no aporta)
const calls = simular({ tam: 0.08, huecos: 2, modo: "spy" });
const vCalls = new Map(DD.map((d, i) => [d, calls.V[i]]));

// ── ventana común, CON REJILLA COMPLETA DE VIERNES ────────────────────────────────────────
//
// ⚠️ ESTE ES EL FALLO QUE YA COMETIMOS EL 2026-08-10 y está en la memoria:
// quedarse sólo con las semanas que tienen dato de la put saca esas semanas TAMBIÉN del
// índice y de las calls. Las 30 semanas sin dato son de festivo (Viernes Santo, Navidad,
// Año Nuevo) y el mercado SUBIÓ más en ellas, así que quitarlas hunde al índice: la primera
// vez bajó al QQQ de 20,2% a 10,9% y casi lo damos por bueno.
//
// La rejilla es de TODOS los viernes. Las semanas sin put, la put está EN EFECTIVO.
const PORROLO = new Map(PUT.map((p) => [p.rolo, p]));
const RATE = Math.pow(1.033, 7 / 365) - 1;            // el efectivo de la pata parada
const viernes = [];
{ const d = new Date(Date.UTC(2020, 0, 3));
  while (d < new Date(Date.UTC(2026, 7, 1))) { viernes.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 7); } }
// cada viernes al día de negociación real más cercano hacia atrás (festivos incluidos)
const haciaAtras = (iso) => { const d = sinGuion(iso); const c = DD.filter((x) => x <= d); return c.length ? c[c.length-1] : null; };

const rPut = [], rCall = [], rSPY = [], semanas = [];
let sinPut = 0;
for (let i = 0; i < viernes.length - 1; i++) {
  const a = haciaAtras(viernes[i]), b = haciaAtras(viernes[i + 1]);
  if (!a || !b || a === b) continue;
  const va = vCalls.get(a), vb = vCalls.get(b);
  if (va == null || vb == null) continue;
  const p = PORROLO.get(viernes[i]);
  if (!p) sinPut++;
  rPut.push(p ? p.ret : RATE);
  rCall.push(vb / va - 1);
  rSPY.push(SPY[b] / SPY[a] - 1 + 0.013 * 7 / 365);
  semanas.push(viernes[i]); }
const ANOS = (Date.parse(semanas[semanas.length-1]) - Date.parse(semanas[0])) / (365.25 * 86400000);

function metricas(R, anos = ANOS) {
  let eq = 1, pico = 1, dd = 0; const C = [1];
  for (const x of R) { eq *= (1 + x); C.push(eq); pico = Math.max(pico, eq); dd = Math.max(dd, 1 - eq / pico); }
  const m = R.reduce((a, x) => a + x, 0) / R.length;
  const sd = Math.sqrt(R.reduce((a, x) => a + (x - m) ** 2, 0) / (R.length - 1));
  return { anual: 100 * (Math.pow(eq, 1 / anos) - 1), caida: 100 * dd, C,
    sharpe: (m * 52 - 0.033) / (sd * Math.sqrt(52)), gan: 100 * R.filter((x) => x > 0).length / R.length,
    final: 60000 * eq }; }
function corr(A, B) { const n = A.length, ma = A.reduce((a,x)=>a+x,0)/n, mb = B.reduce((a,x)=>a+x,0)/n;
  let s = 0, sa = 0, sb = 0;
  for (let i = 0; i < n; i++) { s += (A[i]-ma)*(B[i]-mb); sa += (A[i]-ma)**2; sb += (B[i]-mb)**2; }
  return s / Math.sqrt(sa * sb); }

console.log("");
console.log("  ══ AUDIT ══");
console.log("  ventana: " + semanas[0] + " → " + semanas[semanas.length-1] +
  "   " + ANOS.toFixed(1) + " años, " + rPut.length + " semanas (" + sinPut + " sin put, en efectivo)");
// LA COMPROBACIÓN QUE HABRÍA CAZADO EL FALLO: SPY encadenado por viernes vs SPY directo.
{ const a = haciaAtras(semanas[0]), b = haciaAtras(semanas[semanas.length-1]);
  const directo = 100 * (Math.pow(SPY[b] / SPY[a] * Math.pow(1.013, ANOS), 1 / ANOS) - 1);
  const cadena = metricas(rSPY).anual;
  console.log("  ✓ SPY encadenado por viernes " + cadena.toFixed(1) + "% vs SPY directo " + directo.toFixed(1) +
    "%  →  " + (Math.abs(cadena - directo) < 0.6 ? "cuadra ✓" : "NO CUADRA ⛔ la rejilla pierde semanas")); }
console.log("  la put: QQQ semanal 3% fuera, vendida a las 12:00, recomprada si acaba dentro. Precios reales.");
console.log("  las calls: SPY/QQQ 15% dentro ~120d, 2 huecos al 8%, siempre puesta, el ocioso en SPY.");
console.log("");
console.log("  ⚠️ la caída se mide en puntos SEMANALES (viernes), no diarios: sale algo MENOR que la real.");
const ddDia = (() => { const d = DD.filter((x) => x >= haciaAtras(semanas[0]) && x <= haciaAtras(semanas[semanas.length-1]));
  let pi = 0, pe = 0; for (const x of d) { const v = vCalls.get(x); if (v > pi) pi = v; const q = 1 - v/pi; if (q > pe) pe = q; } return 100*pe; })();
console.log("     la pata de calls: caída DIARIA −" + ddDia.toFixed(0) + "%  ·  medida los viernes −" +
  metricas(rCall).caida.toFixed(0) + "%   → el sesgo es de " + (ddDia - metricas(rCall).caida).toFixed(0) + " puntos");
console.log("");
console.log("  correlación semanal entre las dos patas: " + corr(rPut, rCall).toFixed(3) +
  "   (put vs SPY: " + corr(rPut, rSPY).toFixed(3) + "  ·  calls vs SPY: " + corr(rCall, rSPY).toFixed(3) + ")");
console.log("");

// ── ¿la put sigue plana en las bajadas, también contra ESTAS calls? ────────────────────────
console.log("  ══ 1 · ¿SE COMPORTAN AL REVÉS? ══  (lo que justifica mezclarlas)");
console.log("");
const sube = rSPY.map((x, i) => i).filter((i) => rSPY[i] > 0), baja = rSPY.map((x, i) => i).filter((i) => rSPY[i] <= 0);
const pr = (I, R) => 100 * I.reduce((a, i) => a + R[i], 0) / I.length;
console.log("  " + "semanas en que SPY…".padEnd(26) + "la put".padStart(12) + "las calls".padStart(12) + "comprar SPY".padStart(14));
console.log("  " + ("SUBE (" + sube.length + ")").padEnd(26) + (pct(pr(sube, rPut), 3)).padStart(12) +
  (pct(pr(sube, rCall), 3)).padStart(12) + (pct(pr(sube, rSPY), 3)).padStart(14));
console.log("  " + ("BAJA (" + baja.length + ")").padEnd(26) + (pct(pr(baja, rPut), 3)).padStart(12) +
  (pct(pr(baja, rCall), 3)).padStart(12) + (pct(pr(baja, rSPY), 3)).padStart(14));
console.log("");

// ── LA MEZCLA ─────────────────────────────────────────────────────────────────────────────
console.log("  ══ 2 · LA MEZCLA ══  (reequilibrada cada semana)");
console.log("");
console.log("  " + "peso".padEnd(24) + "al año".padStart(9) + "caída".padStart(9) + "Sharpe".padStart(9) +
  "ret/caída".padStart(11) + "$60.000 →".padStart(13));
const filas = [];
for (const w of [0, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 1]) {
  const R = rCall.map((c, i) => w * rPut[i] + (1 - w) * c);
  const m = metricas(R);
  filas.push({ w, ...m });
  console.log("  " + ((100*w).toFixed(0) + "% put / " + (100*(1-w)).toFixed(0) + "% calls").padEnd(24) +
    (m.anual.toFixed(1)+"%").padStart(9) + ("−"+m.caida.toFixed(0)+"%").padStart(9) + m.sharpe.toFixed(2).padStart(9) +
    (m.anual/Math.max(1,m.caida)).toFixed(2).padStart(11) + D(m.final).padStart(13)); }
const mSPY = metricas(rSPY);
console.log("  " + "comprar SPY".padEnd(24) + (mSPY.anual.toFixed(1)+"%").padStart(9) + ("−"+mSPY.caida.toFixed(0)+"%").padStart(9) +
  mSPY.sharpe.toFixed(2).padStart(9) + (mSPY.anual/Math.max(1,mSPY.caida)).toFixed(2).padStart(11) + D(mSPY.final).padStart(13));
for (const L of [1.5, 2]) { const R = rSPY.map((x) => L*x - (Math.pow(1.05,1/52)-1)*(L-1)); const m = metricas(R);
  console.log("  " + ("SPY a crédito " + L + "x").padEnd(24) + (m.anual.toFixed(1)+"%").padStart(9) + ("−"+m.caida.toFixed(0)+"%").padStart(9) +
    m.sharpe.toFixed(2).padStart(9) + (m.anual/Math.max(1,m.caida)).toFixed(2).padStart(11) + D(m.final).padStart(13)); }
console.log("");

// ── LAS DOS MITADES ───────────────────────────────────────────────────────────────────────
console.log("  ══ 3 · LAS DOS MITADES ══  (por si la mezcla sólo vive en una)");
console.log("");
const corte = Math.floor(rPut.length / 2);
console.log("  " + "peso".padEnd(24) + ("1ª mitad: " + semanas[0] + " →").padStart(28) + ("2ª mitad: " + semanas[corte] + " →").padStart(28));
console.log("  " + " ".repeat(24) + "al año   caída  Sharpe".padStart(28) + "al año   caída  Sharpe".padStart(28));
for (const w of [0, 0.3, 0.5, 0.7, 1]) {
  const R = rCall.map((c, i) => w * rPut[i] + (1 - w) * c);
  const a = metricas(R.slice(0, corte), ANOS/2), b = metricas(R.slice(corte), ANOS/2);
  console.log("  " + ((100*w).toFixed(0) + "% put / " + (100*(1-w)).toFixed(0) + "% calls").padEnd(24) +
    ((a.anual.toFixed(1)+"%").padStart(8) + ("−"+a.caida.toFixed(0)+"%").padStart(8) + a.sharpe.toFixed(2).padStart(8)).padStart(28) +
    ((b.anual.toFixed(1)+"%").padStart(8) + ("−"+b.caida.toFixed(0)+"%").padStart(8) + b.sharpe.toFixed(2).padStart(8)).padStart(28)); }
{ const a = metricas(rSPY.slice(0, corte), ANOS/2), b = metricas(rSPY.slice(corte), ANOS/2);
  console.log("  " + "comprar SPY".padEnd(24) +
    ((a.anual.toFixed(1)+"%").padStart(8) + ("−"+a.caida.toFixed(0)+"%").padStart(8) + a.sharpe.toFixed(2).padStart(8)).padStart(28) +
    ((b.anual.toFixed(1)+"%").padStart(8) + ("−"+b.caida.toFixed(0)+"%").padStart(8) + b.sharpe.toFixed(2).padStart(8)).padStart(28)); }
console.log("");

// ── CASTIGAR LA EJECUCIÓN ─────────────────────────────────────────────────────────────────
console.log("  ══ 4 · CASTIGANDO LA EJECUCIÓN ══  (−20% de prima en la put; el margen de r126 se lo comía esto)");
console.log("");
const rPutMal = semanas.map((s) => { const p = PORROLO.get(s);
  return p ? p.ret - Math.abs(p.cobro * 0.20 / p.K) : RATE; });
console.log("  " + "peso".padEnd(24) + "al año".padStart(9) + "caída".padStart(9) + "Sharpe".padStart(9));
for (const w of [0, 0.3, 0.5, 0.7, 1]) {
  const R = rCall.map((c, i) => w * rPutMal[i] + (1 - w) * c);
  const m = metricas(R);
  console.log("  " + ((100*w).toFixed(0) + "% put / " + (100*(1-w)).toFixed(0) + "% calls").padEnd(24) +
    (m.anual.toFixed(1)+"%").padStart(9) + ("−"+m.caida.toFixed(0)+"%").padStart(9) + m.sharpe.toFixed(2).padStart(9)); }
console.log("  " + "comprar SPY".padEnd(24) + (mSPY.anual.toFixed(1)+"%").padStart(9) + ("−"+mSPY.caida.toFixed(0)+"%").padStart(9) + mSPY.sharpe.toFixed(2).padStart(9));
console.log("");

// ── AÑO A AÑO de la mejor por ret/caída ───────────────────────────────────────────────────
const mej = filas.filter((f) => f.w > 0 && f.w < 1).sort((a,b) => (b.anual/Math.max(1,b.caida)) - (a.anual/Math.max(1,a.caida)))[0];
console.log("  ══ 5 · AÑO A AÑO ══  " + (100*mej.w).toFixed(0) + "% put / " + (100*(1-mej.w)).toFixed(0) + "% calls");
console.log("");
const Rm = rCall.map((c, i) => mej.w * rPut[i] + (1 - mej.w) * c);
console.log("  " + "año".padEnd(7) + "la mezcla".padStart(12) + "sólo calls".padStart(12) + "sólo put".padStart(11) + "SPY".padStart(9) + "sem".padStart(6));
for (const y of ["2020","2021","2022","2023","2024","2025","2026"]) {
  const I = semanas.map((s, i) => [s, i]).filter(([s]) => s.startsWith(y)).map(([, i]) => i);
  if (I.length < 5) continue;
  const acum = (R) => 100 * (I.reduce((a, i) => a * (1 + R[i]), 1) - 1);
  console.log("  " + y.padEnd(7) + pct(acum(Rm), 1).padStart(12) + pct(acum(rCall), 1).padStart(12) +
    pct(acum(rPut), 1).padStart(11) + pct(acum(rSPY), 1).padStart(9) + String(I.length).padStart(6)); }
console.log("");

// ══════════════════════════════════════════════════════════════════════════════════════════
// ¿VIVE DEL REEQUILIBRIO? 337 reequilibrios semanales es donde se esconden los almuerzos
// gratis: si el resultado desaparece al reequilibrar poco, no es diversificación, es una
// máquina de comprar barato y vender caro que nadie ejecuta.
// ══════════════════════════════════════════════════════════════════════════════════════════
console.log("  ══ 6 · ¿VIVE DEL REEQUILIBRIO? ══");
console.log("");
function conFrec(w, cada) {          // cada = semanas entre reequilibrios; 0 = nunca
  let a = w, b = 1 - w; const C = [1];
  for (let i = 0; i < rPut.length; i++) {
    a *= (1 + rPut[i]); b *= (1 + rCall[i]);
    C.push(a + b);
    if (cada > 0 && (i + 1) % cada === 0) { const t = a + b; a = w * t; b = (1 - w) * t; } }
  const R = []; for (let i = 1; i < C.length; i++) R.push(C[i] / C[i-1] - 1);
  return metricas(R); }
console.log("  " + "peso".padEnd(20) + ["semanal","mensual","trimestral","anual","NUNCA"].map((x)=>x.padStart(15)).join(""));
for (const w of [0.3, 0.5, 0.7, 0.8]) {
  let l = "  " + ((100*w).toFixed(0) + "% put").padEnd(20);
  for (const c of [1, 4, 13, 52, 0]) { const m = conFrec(w, c);
    l += (m.anual.toFixed(1) + "% −" + m.caida.toFixed(0) + "%").padStart(15); }
  console.log(l); }
console.log("");
console.log("  (si las cinco columnas se parecen, el efecto es la DIVERSIFICACIÓN, no el reequilibrio)");
console.log("");

// ══════════════════════════════════════════════════════════════════════════════════════════
// LA CUENTA DE LESTER, con lo que tiene de verdad. Sin inventar capital.
// ══════════════════════════════════════════════════════════════════════════════════════════
console.log("  ══ 7 · CON SU CUENTA ══");
console.log("");
console.log("  ⚠️ ventana 2020-2026 (6,6 años), la manda la put. NO son los 10,6 años de las calls.");
console.log("  ⚠️ la caída va medida los viernes: la diaria es ~2 puntos peor.");
console.log("");
const CAP = 55419;
console.log("  " + "estrategia".padEnd(26) + "al año".padStart(9) + "caída".padStart(8) +
  "Sharpe".padStart(8) + ("$" + (CAP/1000).toFixed(0) + "k →").padStart(12) + "vs SPY".padStart(11));
const base = metricas(rSPY);
const linea = (n, m) => console.log("  " + n.padEnd(26) + (m.anual.toFixed(1)+"%").padStart(9) +
  ("−"+m.caida.toFixed(0)+"%").padStart(8) + m.sharpe.toFixed(2).padStart(8) +
  D(CAP * m.final / 60000).padStart(12) + D(CAP * (m.final - base.final) / 60000).padStart(11));
linea("comprar SPY y dormir", base);
for (const w of [0.3, 0.5, 0.7, 0.8]) linea((100*w).toFixed(0) + "% put / " + (100*(1-w)).toFixed(0) + "% calls",
  metricas(rCall.map((c, i) => w * rPut[i] + (1 - w) * c)));
linea("sólo la put", metricas(rPut));
linea("sólo las calls", metricas(rCall));
console.log("");
console.log("  peor año de cada una:");
for (const [n, R] of [["comprar SPY", rSPY], ["70% put / 30% calls", rCall.map((c,i)=>0.7*rPut[i]+0.3*c)],
                      ["sólo la put", rPut], ["sólo las calls", rCall]]) {
  let peor = 9e9, pa = "";
  for (const y of ["2020","2021","2022","2023","2024","2025"]) {
    const I = semanas.map((s,i)=>[s,i]).filter(([s])=>s.startsWith(y)).map(([,i])=>i);
    if (I.length < 40) continue;
    const a = 100 * (I.reduce((x,i)=>x*(1+R[i]),1) - 1);
    if (a < peor) { peor = a; pa = y; } }
  console.log("    " + n.padEnd(24) + pct(peor,1).padStart(9) + "  en " + pa); }
console.log("");
