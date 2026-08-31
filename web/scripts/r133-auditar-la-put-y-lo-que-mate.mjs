// ══ AUDITAR LA PUT, Y LO QUE MATÉ ══ Lester, 2026-08-29: «audita todo lo demás».
//
// Quedan dos cosas de la lista:
//
//   5. «la put rinde como SPY con la mitad de caída» — lo único en pie de la mezcla.
//      SOSPECHA CONCRETA: la curva se mide de VIERNES A VIERNES. Para una estrategia cuya
//      posición entera nace y muere cada semana, marcar sólo en los bordes es exactamente
//      la resolución equivocada: nunca se ve lo que pasa el miércoles. El −7% de caída
//      puede estar escondiendo el susto de verdad.
//
//   6. ¿MATÉ ALGO CON UNA COMPARACIÓN MAL HECHA? (orden permanente de Lester)
//      El candidato es «cubrir la beta»: daba 14,7% a CUALQUIER tamaño, y un resultado que
//      no se mueve con el tamaño casi siempre es un fallo de implementación, no un hallazgo.
process.argv[2] = new URL("./cache-theta/noche-2026-08-10", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
process.env.CAMINOS = "caminos-indice.json";
import fs from "node:fs";
const { res } = await import("./noche-2026-08-10/intradia-lib.mjs");
const { simular, banda, spyApalancado, OPS, SPY, DD, D, pct } = await import("./motor-cartera.mjs");

const S = process.argv[2];
const PUT = res.get("12:00").slice().sort((a,b)=>a.rolo.localeCompare(b.rolo));
const pxQQQ = new Map(JSON.parse(fs.readFileSync(S + "/precios.json", "utf8")).QQQ.map((b) => [b.d, b.c]));
const DIAS_Q = [...pxQQQ.keys()].sort();

console.log("");
console.log("  ══════════ 5 · LA PUT: ¿ESCONDE LA SEMANA POR DENTRO? ══════════");
console.log("");
console.log("  la posición nace el viernes y muere el viernes siguiente. Medimos sólo los bordes.");
console.log("  Aquí se marca CADA DÍA con el valor intrínseco de la put (cota INFERIOR de la pérdida:");
console.log("  el valor real incluye además valor temporal, así que la de verdad es aún peor).");
console.log("");
let peorSemBorde = 0, peorSemDentro = 0, fBorde = "", fDentro = "";
const DDentro = [];
for (const p of PUT) {
  const dias = DIAS_Q.filter((d) => d > p.rolo && d <= p.exp);
  const cap = p.K * 100;
  let peor = 0;
  for (const d of dias) {
    const intr = Math.max(0, p.K - pxQQQ.get(d)) * 100;     // lo que costaría cerrarla, mínimo
    const marca = (p.cobro * 100 - intr) / cap;             // P&L sobre el colateral
    if (marca < peor) peor = marca; }
  DDentro.push({ rolo: p.rolo, borde: p.ret, dentro: Math.min(p.ret, peor) });
  if (p.ret < peorSemBorde) { peorSemBorde = p.ret; fBorde = p.rolo; }
  if (peor < peorSemDentro) { peorSemDentro = peor; fDentro = p.rolo; } }
console.log("  peor semana medida en el BORDE:   " + pct(100*peorSemBorde, 1) + "   (" + fBorde + ")");
console.log("  peor momento medido POR DENTRO:   " + pct(100*peorSemDentro, 1) + "   (" + fDentro + ")");
console.log("");
function caidaDe(R) { let eq=1,pico=1,dd=0; for (const x of R){eq*=(1+x); pico=Math.max(pico,eq); dd=Math.max(dd,1-eq/pico);} return 100*dd; }
const cB = caidaDe(DDentro.map((x)=>x.borde)), cD = caidaDe(DDentro.map((x)=>x.dentro));
console.log("  caída de la pata de put, medida en los bordes: −" + cB.toFixed(0) + "%");
console.log("  caída de la pata de put, marcando por dentro:  −" + cD.toFixed(0) + "%");
console.log("  → " + (cD > cB + 3 ? "el −" + cB.toFixed(0) + "% ESCONDÍA el susto: la de verdad es −" + cD.toFixed(0) + "% ⚠"
                                  : "el borde no escondía nada relevante ✓"));
console.log("");
console.log("  las 6 peores semanas por dentro:");
console.log("  " + "semana".padEnd(14) + "en el borde".padStart(14) + "por dentro".padStart(14));
for (const x of [...DDentro].sort((a,b)=>a.dentro-b.dentro).slice(0,6))
  console.log("  " + x.rolo.padEnd(14) + pct(100*x.borde,1).padStart(14) + pct(100*x.dentro,1).padStart(14));
console.log("");

// ── y lo que importa: ¿cambia la conclusión de la mezcla? ──
console.log("  ══ ¿CAMBIA LA CONCLUSIÓN DE LA MEZCLA? ══");
console.log("");
for (const o of OPS) o.ma = -1;
const calls = simular({ tam: 0.08, huecos: 2, modo: "spy" });
const vCalls = new Map(DD.map((d,i)=>[d, calls.V[i]]));
const sinG = (d) => d.replace(/-/g,"");
const atras = (iso) => { const d = sinG(iso); const c = DD.filter((x)=>x<=d); return c.length?c[c.length-1]:null; };
const PB = new Map(DDentro.map((x)=>[x.rolo,x]));
const viernes = []; { const d=new Date(Date.UTC(2020,0,3));
  while (d < new Date(Date.UTC(2026,7,1))) { viernes.push(d.toISOString().slice(0,10)); d.setUTCDate(d.getUTCDate()+7); } }
const RATE = Math.pow(1.033, 7/365)-1;
const rB=[], rD=[], rC=[], rS=[];
for (let i=0;i<viernes.length-1;i++){ const a=atras(viernes[i]), b=atras(viernes[i+1]);
  if(!a||!b||a===b) continue; const va=vCalls.get(a), vb=vCalls.get(b); if(va==null||vb==null) continue;
  const p=PB.get(viernes[i]);
  rB.push(p?p.borde:RATE); rD.push(p?p.dentro:RATE); rC.push(vb/va-1); rS.push(SPY[b]/SPY[a]-1+0.013*7/365); }
const ANOS=(Date.parse(viernes[viernes.length-2])-Date.parse(viernes[0]))/(365.25*86400000);
function met(R){ let eq=1,pico=1,dd=0; for(const x of R){eq*=(1+x);pico=Math.max(pico,eq);dd=Math.max(dd,1-eq/pico);}
  const m=R.reduce((a,x)=>a+x,0)/R.length, sd=Math.sqrt(R.reduce((a,x)=>a+(x-m)**2,0)/(R.length-1));
  return { a:100*(Math.pow(eq,1/ANOS)-1), c:100*dd, s:(m*52-0.033)/(sd*Math.sqrt(52)) }; }
console.log("  " + "70% en la pata / 30% calls".padEnd(32) + "al año".padStart(9) + "caída".padStart(8) + "Sharpe".padStart(8));
for (const [n,R] of [["la put medida EN EL BORDE", rB.map((x,i)=>0.7*x+0.3*rC[i])],
                     ["la put marcada POR DENTRO", rD.map((x,i)=>0.7*x+0.3*rC[i])],
                     ["SPY en esa pata", rS.map((x,i)=>0.7*x+0.3*rC[i])],
                     ["comprar SPY y dormir", rS]]) {
  const m = met(R);
  console.log("  " + n.padEnd(32) + (m.a.toFixed(1)+"%").padStart(9) + ("−"+m.c.toFixed(0)+"%").padStart(8) + m.s.toFixed(2).padStart(8)); }
console.log("");

// ══════════════════════════════════════════════════════════════════════════════════════════
console.log("  ══════════ 6 · ¿MATÉ «CUBRIR LA BETA» CON UN FALLO MÍO? ══════════");
console.log("  (daba 14,7% a CUALQUIER tamaño — eso huele a implementación rota, no a hallazgo)");
console.log("");
process.env.CAMINOS = "caminos-120d.json";
const M = await import("./motor-cartera.mjs?v=3");
console.log("  " + "config".padEnd(22) + "SIN cubrir".padStart(24) + "CUBRIENDO".padStart(24));
console.log("  " + " ".repeat(22) + "al año  caída  Sharpe".padStart(24) + "al año  caída  Sharpe".padStart(24));
for (const [h,t] of [[2,0.08],[6,0.15],[10,0.08],[4,0.25]]) {
  const a = M.banda({ tam:t, huecos:h, modo:"efectivo" });
  const b = M.banda({ tam:t, huecos:h, modo:"efectivo", cubrir:true });
  const cel = (m) => ((m.a.toFixed(1)+"%").padStart(8)+("−"+m.c.toFixed(0)+"%").padStart(8)+m.s.toFixed(2).padStart(8)).padStart(24);
  console.log("  " + (h + " × " + (100*t).toFixed(0) + "%").padEnd(22) + cel(a) + cel(b)); }
const qc = M.simular({ tam:0.15, huecos:6, modo:"efectivo", cubrir:true });
console.log("");
console.log("  beta con la que acabó cubriendo: " + qc.betaHat.toFixed(2) +
  "   (la beta real del libro es 3,11)");
console.log("  " + (Math.abs(qc.betaHat - 3.11) < 1.2
  ? "→ la cobertura usaba una beta razonable: el resultado es real, no un fallo ✓"
  : "→ ⛔ LA BETA DE LA COBERTURA ESTÁ MAL. Maté «cubrir la beta» con una implementación rota."));
console.log("");
