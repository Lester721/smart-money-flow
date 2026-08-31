// ══ LA PALANCA QUE NUNCA TOQUÉ: LA PROFUNDIDAD ══ Lester, 2026-08-29:
//   «¿qué tengo que decirte para que en vez de cerrar cosas busques cómo mejorarlas?»
//
// ═══ EL DIAGNÓSTICO, Y POR QUÉ ESTO ES DISTINTO ════════════════════════════════════════════
//
// La caída de esta estrategia es, exactamente:
//        caída = caída de SPY  ×  BETA  ×  cuánto dinero pones
//
// Llevo una semana moviendo la tercera. Bajar el tamaño baja las dos cosas a la vez, así que
// nunca da 29% con poca caída — es una recta, no una mejora. **La BETA no la he tocado nunca.**
//
// Y la beta no es un misterio: la fija LA PROFUNDIDAD. Una call 15% dentro cuesta ~30% del
// spot → apalanca 3,3x. Una 40% dentro cuesta más y apalanca menos: se parece más a la acción.
// Con menos beta se puede poner MÁS dinero y quedarse con el mismo rendimiento y menos susto.
//
// Congelamos PROF_OBJ = 0,15 el primer día y no se ha movido desde entonces. Ni una vez.
//
// ═══ QUÉ HACE ESTE FICHERO ═════════════════════════════════════════════════════════════════
// CONTRATOS BARATOS — el coste mínimo baja de $5.000 a $1.500.
//
// POR QUÉ: con contratos de $5.000+ y una cuenta de $60.000 sólo caben 2 huecos. Y con 2 huecos
// la secuencia es CAÓTICA (misma regla con $57k o $63k comparte 5 de 62 operaciones), las
// mitades son una lotería, y sólo salen 4-6 operaciones al año.
//
// PREDICCIÓN, escrita ANTES de correr (r120 midió R²=65% contra SPY, así que un tercio de la
// varianza es riesgo de empresa y se diluye repartiéndolo):
//   · rendimiento: SIN CAMBIO, entre 19% y 22% — no hay alfa que ganar repartiendo
//   · Sharpe: de 0,71 a **0,74-0,78** por diluir el riesgo idiosincrático
//   · si sale mucho más alto que eso, es una casilla afortunada, no una mejora
//
// RIESGO conocido: los contratos baratos están sobre acciones baratas (F a $12, T a $25), que
// son nombres de MENOS beta — y la beta es de donde sale el rendimiento. Puede salir peor.
// Y su horquilla puede ser más ancha: se mide igual que en r140.
//
// ⚠️ NO se filtra por la media de 20 días al construir (r125: la media no aporta, y filtrar
//    al construir impide medirlo después). Se guarda `ma` y se filtra al medir.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { abrir } from "./datos.mjs";
import { CACHE } from "./raiz.mjs";

const TK = ["AAPL","AMD","META","MSFT","NVDA","QQQ","SPY",
  "BA","JPM","INTC","F","BAC","DIS","XOM","GE","PYPL","COST","CRM","ORCL","WMT","T","PFE","KO","CSCO","NKE","UNH","WBA"];
const PROFS = [0.25];        // cuánto dentro del dinero
const DTES  = [400];                       // plazo objetivo
const COSTE_MIN = 1500, SUELO = 0.50, PLAZO = 250;   // ← MÍNIMO BAJADO a $1.500
const DESDE = "20160104", HASTA = "20260819";

const cad = abrir("cadenas", { callado: true });
const ms = (d) => Date.parse(d.slice(0,4)+"-"+d.slice(4,6)+"-"+d.slice(6,8)+"T00:00:00Z");
const dteDe = (a,b) => Math.round((ms(b)-ms(a))/86400000);
let CH = new Map(), SP = new Map();
const leer = (tk,d) => { if (CH.has(d)) return CH.get(d); const c = cad.leer(tk,d); CH.set(d,c); return c; };
function spotOk(c,hoy){ if(!c) return null; let e0=null,md=Infinity;
  for(const e of Object.keys(c)){const d=dteDe(hoy,e); if(d<1)continue; if(d<md){md=d;e0=e;}}
  if(!e0) return null; const g=c[e0]; let K=null,dm=Infinity;
  for(const cl of Object.keys(g)){ if(cl.slice(-1)!=="C")continue;
    const k=Number(cl.slice(0,-2)); const p=g[k+"|P"]; if(!p)continue;
    const d=Math.abs((g[cl][0]+g[cl][1])/2-(p[0]+p[1])/2); if(d<dm){dm=d;K=k;}}
  if(K==null) return null; const C=g[K+"|C"],P=g[K+"|P"];
  const s=K+(C[0]+C[1])/2-(P[0]+P[1])/2; return s>0?s:null; }
const spotDe = (tk,d) => { if(SP.has(d)) return SP.get(d); const s=spotOk(leer(tk,d),d); SP.set(d,s); return s; };

function elegir(tk, d, profObj, dteObj) {
  const ch = leer(tk,d); if(!ch) return null;
  const s = spotDe(tk,d); if(s==null) return null;
  let mejor=null, mejorD=Infinity;
  for(const exp of Object.keys(ch)){
    const dte=dteDe(d,exp); if(dte<30||dte>500) continue;
    for(const cl of Object.keys(ch[exp])){
      if(!cl.endsWith("|C")) continue;
      const K=Number(cl.slice(0,cl.indexOf("|")));
      if(K>=s) continue;
      const q=ch[exp][cl]; if(!q||!(q[1]>0)||!(q[0]>0)) continue;
      if(q[1]*100<COSTE_MIN) continue;
      const prof=(s-K)/s;
      const dist=Math.abs(prof-profObj)/profObj + Math.abs(dte-dteObj)/dteObj;
      if(dist<mejorD){mejorD=dist; mejor={exp,K,ask:q[1],bid:q[0],prof,dte,spot:s};}}}
  return mejor; }

const SALIDA = {};
for (const p of PROFS) for (const dt of DTES) SALIDA[p+"|"+dt] = [];

process.stdout.write("\n  4 profundidades × 2 plazos, una sola pasada: ");
for (const tk of TK) {
  CH = new Map(); SP = new Map();
  process.stdout.write(tk + " ");
  const todos = cad.dias(tk);
  for (let i = 20; i < todos.length; i++) {
    const d = todos[i];
    if (d < DESDE || d > HASTA) continue;
    const pr = todos.slice(i-20,i).map((x)=>spotDe(tk,x)).filter((x)=>x!=null);
    const s = spotDe(tk,d);
    if (pr.length < 15 || s == null) continue;
    const ma = s/(pr.reduce((a,b)=>a+b,0)/pr.length) - 1;     // se GUARDA, no se filtra
    for (const prof of PROFS) for (const dteObj of DTES) {
      const L = elegir(tk, d, prof, dteObj); if (!L) continue;
      // sólo se acepta si de verdad se acercó al objetivo: si no, sería otra cosa con otra etiqueta
      if (Math.abs(L.prof - prof) > prof * 0.45) continue;
      if (Math.abs(L.dte - dteObj) > dteObj * 0.55) continue;
      const cam = [];
      for (const x of todos.filter((y)=>y>d && y<=L.exp)) {
        const ch = leer(tk,x); if(!ch) continue;
        const q = ch[L.exp] && ch[L.exp][L.K+"|C"]; if(!q||!(q[0]>0)) continue;
        cam.push([x, Math.round((q[0]/L.ask)*10000)/10000]);
        if (cam.length >= PLAZO) break; }
      if (cam.length < 15) continue;
      let corte = cam.length;
      for (let j=0;j<cam.length;j++) if (cam[j][1] <= SUELO) { corte = j+1; break; }
      SALIDA[prof+"|"+dteObj].push({ tk, dC:d, ma:Math.round(ma*10000)/10000,
        coste:Math.round(L.ask*10000)/100, spot:Math.round(L.spot*100)/100,
        K:L.K, exp:L.exp, profReal:Math.round(L.prof*1000)/1000, dteReal:L.dte,
        camino:cam.slice(0,corte) }); } } }

CH = new Map(); SP = new Map();
const SPYD = {};
for (const d of cad.dias("SPY")) { if(d<DESDE||d>HASTA) continue;
  const s = spotDe("SPY",d); if(s>0) SPYD[d]=Math.round(s*100)/100; }

console.log("\n");
console.log("  ══ AUDIT ══");
console.log("  " + "profundidad × plazo".padEnd(24) + "entradas".padStart(10) + "prof. real".padStart(12) +
  "plazo real".padStart(12) + "prima/spot".padStart(12) + "apalanca".padStart(10));
for (const p of PROFS) for (const dt of DTES) {
  const L = SALIDA[p+"|"+dt];
  if (!L.length) { console.log("  " + ((100*p).toFixed(0)+"% × "+dt+"d").padEnd(24) + "0".padStart(10) + "  ⛔ sin datos"); continue; }
  const md = (X)=>{const B=[...X].sort((a,b)=>a-b); return B[Math.floor(B.length/2)];};
  const pr = md(L.map(o=>o.profReal)), dr = md(L.map(o=>o.dteReal)), pv = md(L.map(o=>o.coste/(o.spot*100)));
  const f = join(CACHE, "barato-p" + (100*p).toFixed(0) + "-d" + dt + ".json");
  writeFileSync(f, JSON.stringify({ ops: L, spy: SPYD }));
  console.log("  " + ((100*p).toFixed(0)+"% × "+dt+"d").padEnd(24) + L.length.toLocaleString("en-US").padStart(10) +
    ((100*pr).toFixed(1)+"%").padStart(12) + (dr+"d").padStart(12) +
    ((100*pv).toFixed(1)+"%").padStart(12) + ((1/pv).toFixed(1)+"x").padStart(10)); }
console.log("");
console.log("  ↑ si el apalancamiento BAJA al aumentar la profundidad, la palanca existe.");
console.log("    Si no baja, la idea está muerta antes de medir nada más.");
console.log("");
