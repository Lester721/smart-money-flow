// ══ AUDITAR MI AUDITORÍA ══ Lester, 2026-08-29.
//
// r133 sacó dos conclusiones y LAS DOS ESTABAN MAL MEDIDAS. Por mí. Se rehacen.
//
// ═══ FALLO 1 — el «−53%» de la put ═════════════════════════════════════════════════════════
//   let peor = 0;                                    // ← empieza en CERO
//   for (const d of dias) { ... if (marca < peor) peor = marca; }
//   dentro: Math.min(p.ret, peor)
// Si una semana nunca estuvo bajo el agua, `peor` se queda en 0 y `dentro` = min(ganancia, 0)
// = **0**. O sea que puse a CERO todas las semanas ganadoras y dejé las perdedoras en su peor
// momento. Eso no es una caída intrasemanal: es una máquina de fabricar una.
// Bien hecho: se construye una curva DIARIA y se mide el pico a valle sobre ella.
//
// ═══ FALLO 2 — la beta de la cobertura ═════════════════════════════════════════════════════
// Comparé el ÚLTIMO betaHat (una ventana móvil de 120 días) contra la beta de TODA la muestra.
// Son dos cosas distintas y no tienen por qué coincidir. La pregunta correcta es otra:
// **después de cubrir, ¿le queda beta al libro?** Si queda ~0, la cobertura funciona y mi
// conclusión valía. Si no, la maté con una implementación rota.
process.argv[2] = new URL("./cache-theta/noche-2026-08-10", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
process.env.CAMINOS = "caminos-indice.json";
import fs from "node:fs";
const { res } = await import("./noche-2026-08-10/intradia-lib.mjs");
const { simular, banda, spyApalancado, OPS, SPY, DD, D, pct } = await import("./motor-cartera.mjs");

const S = process.argv[2];
const PUT = res.get("12:00").slice().sort((a,b)=>a.rolo.localeCompare(b.rolo));
const pxQQQ = new Map(JSON.parse(fs.readFileSync(S + "/precios.json","utf8")).QQQ.map((b)=>[b.d,b.c]));
const DQ = [...pxQQQ.keys()].sort();
const PORROLO = new Map(PUT.map((p)=>[p.rolo,p]));
const RATE_D = Math.pow(1.033, 1/365) - 1;

console.log("");
console.log("  ══════════ 5 (BIEN HECHO) · LA PUT MARCADA CADA DÍA ══════════");
console.log("");
console.log("  La posición nace y muere cada semana, así que medirla sólo los viernes es la");
console.log("  resolución equivocada. Aquí hay una curva DIARIA: cada día se marca la put corta");
console.log("  a su VALOR INTRÍNSECO. Como una put vale SIEMPRE ≥ su intrínseco, esto");
console.log("  SUBESTIMA la pérdida → lo que salga es una COTA INFERIOR de la caída real.");
console.log("");
// curva diaria de la pata de put, en unidades de patrimonio
const curva = [], fechas = [];
let eq = 1;
for (const p of PUT) {
  const dias = DQ.filter((d) => d > p.rolo && d <= p.exp);
  if (!dias.length) continue;
  const cap = p.K * 100, base = eq;
  for (const d of dias) {
    const intr = Math.max(0, p.K - pxQQQ.get(d)) * 100;
    const pl = p.cobro * 100 - intr;                       // sin cerrar: cobro menos lo que vale
    curva.push(base * (1 + pl / cap)); fechas.push(d); }
  eq = base * (1 + p.ret);                                  // al vencer, el resultado REAL
  curva[curva.length - 1] = eq; }
function caidaCurva(C) { let pico = C[0], peor = 0, i0 = 0, iF = 0, ip = 0;
  for (let i = 0; i < C.length; i++) { if (C[i] > pico) { pico = C[i]; ip = i; }
    const d = 1 - C[i]/pico; if (d > peor) { peor = d; i0 = ip; iF = i; } }
  return { c: 100*peor, i0, iF }; }
const semanal = []; { let e = 1; for (const p of PUT) { e *= (1 + p.ret); semanal.push(e); } }
const cS = caidaCurva(semanal), cD = caidaCurva(curva);
console.log("  caída medida sólo los VIERNES : −" + cS.c.toFixed(1) + "%");
console.log("  caída marcada CADA DÍA        : −" + cD.c.toFixed(1) + "%   (" + fechas[cD.i0] + " → " + fechas[cD.iF] + ")");
console.log("  → " + (cD.c > cS.c + 2
  ? "el viernes SÍ escondía susto: " + (cD.c - cS.c).toFixed(1) + " puntos más ⚠"
  : "el viernes no escondía nada relevante ✓"));
console.log("");
const peorDia = [];
for (const p of PUT) { const dias = DQ.filter((d)=>d>p.rolo && d<=p.exp); let w = 0;
  for (const d of dias) { const m = (p.cobro*100 - Math.max(0,p.K-pxQQQ.get(d))*100) / (p.K*100); if (m < w) w = m; }
  peorDia.push({ f: p.rolo, viernes: p.ret, dentro: w }); }
console.log("  las 6 semanas con peor momento intrasemanal:");
console.log("  " + "semana".padEnd(14) + "resultado del viernes".padStart(22) + "peor momento".padStart(15));
for (const x of [...peorDia].sort((a,b)=>a.dentro-b.dentro).slice(0,6))
  console.log("  " + x.f.padEnd(14) + pct(100*x.viernes,2).padStart(22) + pct(100*x.dentro,2).padStart(15));
console.log("");
console.log("  ¿y cambia la conclusión de la mezcla? la caída de la pata de put pasa de −" +
  cS.c.toFixed(1) + "% a −" + cD.c.toFixed(1) + "%.");
console.log("  Al 70% de peso eso mueve la caída de la cartera como mucho " +
  (0.7*(cD.c - cS.c)).toFixed(1) + " puntos.");
console.log("");

console.log("  ══════════ 6 (BIEN HECHO) · ¿LE QUEDA BETA AL LIBRO CUBIERTO? ══════════");
console.log("");
process.env.CAMINOS = "caminos-120d.json";
const M = await import("./motor-cartera.mjs?v=4");
function reg(Y, X) { const n=Y.length, my=Y.reduce((a,x)=>a+x,0)/n, mx=X.reduce((a,x)=>a+x,0)/n;
  let nu=0,de=0; for(let i=0;i<n;i++){nu+=(Y[i]-my)*(X[i]-mx); de+=(X[i]-mx)**2;}
  const b=nu/de, a=my-b*mx; let ssr=0,sst=0;
  for(let i=0;i<n;i++){const f=a+b*X[i]; ssr+=(Y[i]-f)**2; sst+=(Y[i]-my)**2;}
  return { b, a, r2:1-ssr/sst, tb:b/Math.sqrt(ssr/(n-2)/de), n }; }
const RSPY = []; for (let i=1;i<DD.length;i++) RSPY.push(SPY[DD[i]]/SPY[DD[i-1]]-1);
console.log("  " + "config".padEnd(16) + "beta SIN cubrir".padStart(18) + "beta CUBIERTO".padStart(16) +
  "¿queda beta?".padStart(16));
let rotas = 0, n = 0;
for (const [h,t] of [[2,0.08],[6,0.15],[10,0.08]]) {
  const a = M.simular({ tam:t, huecos:h, modo:"efectivo" });
  const b = M.simular({ tam:t, huecos:h, modo:"efectivo", cubrir:true });
  const ra = reg(a.R, RSPY), rb = reg(b.R, RSPY);
  n++; if (Math.abs(rb.b) > 0.5) rotas++;
  console.log("  " + (h + " × " + (100*t).toFixed(0) + "%").padEnd(16) + ra.b.toFixed(2).padStart(18) +
    rb.b.toFixed(2).padStart(16) + ((Math.abs(rb.b) < 0.5 ? "no, cubre bien ✓" : "SÍ, mal cubierto ⛔")).padStart(16)); }
console.log("");
console.log("  " + (rotas === 0
  ? "→ La cobertura hace su trabajo: quita la beta. Matar «cubrir la beta» fue CORRECTO,\n"
  + "    y lo que dice sigue en pie: al quitarle el mercado al libro, debajo no queda nada."
  : "→ ⛔ La cobertura deja beta suelta en " + rotas + " de " + n + " configuraciones.\n"
  + "    Maté «cubrir la beta» con una implementación que no cubría. HAY QUE REHACERLO."));
console.log("");
