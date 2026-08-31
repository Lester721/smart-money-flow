// ══ LA PROFUNDIDAD, EN LOS DOS GRUPOS Y SIN EL CONFUSOR ══ Lester, 2026-08-30
//
// La prueba nº4 dio "sin ganador", pero estaba sucia por DOS motivos:
//   1. Sólo se midió en los 27 — el grupo A sólo estaba construido al 25%.
//   2. Todos los ficheros llevaban COSTE_MIN = $5.000, y una call 15% dentro es MUCHO más
//      barata que una 50% dentro. O sea que el filtro mordía distinto en cada profundidad:
//      n = 56 · 80 · 97 · 107 según se hacía más profunda. Eso no compara profundidades,
//      compara cuánto las castiga el filtro.
//
// Aquí se construyen las cuatro profundidades en LOS DOS grupos con COSTE_MIN = 0. Ya está
// medido que el mínimo no aporta nada al rendimiento ($2.348/año en contra, Sharpe idéntico),
// así que quitarlo sólo elimina el confusor.
//
// Uso:  node r174-profundidades-limpias.mjs 27      |      node r174-profundidades-limpias.mjs A
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { abrir } from "./datos.mjs";
import { CACHE } from "./raiz.mjs";
import { GRUPO_A } from "./EXAMEN-grupo-A.mjs";

const G = process.argv[2] === "A"
  ? { tk: GRUPO_A, dir: "cadenas-A", sufijo: "A" }
  : { tk: ["AAPL","AMD","META","MSFT","NVDA","QQQ","SPY","BA","JPM","INTC","F","BAC","DIS","XOM",
           "GE","PYPL","COST","CRM","ORCL","WMT","T","PFE","KO","CSCO","NKE","UNH","WBA"],
      dir: "cadenas", sufijo: "27" };
const PROFS = [0.15, 0.25, 0.35, 0.50], DTE = 400;
const COSTE_MIN = 0, SUELO = 0.50, PLAZO = 130;
const HOLDS = [20, 40, 60, 90, 120];
const DESDE = "20160104", HASTA = "20260819";

const cad = abrir(G.dir, { callado: true });
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
    const dte=dteDe(d,exp); if(dte<30||dte>700) continue;
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

const SALIDA = {}; for (const p of PROFS) SALIDA[p] = [];
process.stdout.write("\n  " + G.sufijo + " · 4 profundidades a " + DTE + "d, una pasada: ");
for (const tk of G.tk) {
  CH = new Map(); SP = new Map();
  process.stdout.write(tk + " ");
  const todos = cad.dias(tk);
  for (let i = 20; i < todos.length; i++) {
    const d = todos[i]; if (d < DESDE || d > HASTA) continue;
    const s = spotDe(tk,d); if (s == null) continue;
    for (const prof of PROFS) {
      const L = elegir(tk, d, prof, DTE); if (!L) continue;
      if (Math.abs(L.prof - prof) > prof * 0.45) continue;
      if (Math.abs(L.dte - DTE) > DTE * 0.55) continue;
      const cam = [];
      for (const x of todos.filter((y)=>y>d && y<=L.exp)) {
        const ch = leer(tk,x); if(!ch) continue;
        const q = ch[L.exp] && ch[L.exp][L.K+"|C"]; if(!q||!(q[0]>0)) continue;
        cam.push([x, Math.round((q[0]/L.ask)*10000)/10000]);
        if (cam.length >= PLAZO) break; }
      if (cam.length < 15) continue;
      // ⚠️ NO se guarda el camino: 4 profundidades × 250 días × 24 tickers tumbó el proceso por
      //    memoria (y salió con código 0 igualmente). Para esta pregunta basta el multiplicador
      //    a cada aguante, con el suelo ya aplicado. Ocupa la centésima parte.
      const M = {};
      for (const h of HOLDS) { let i = Math.min(h, cam.length) - 1;
        for (let j=0;j<=i;j++) if (cam[j][1] <= SUELO) { i=j; break; }
        M["m"+h] = cam[i][1]; }
      SALIDA[prof].push({ tk, dC:d, coste:Math.round(L.ask*10000)/100,
        spot:Math.round(L.spot*100)/100, profReal:Math.round(L.prof*1000)/1000,
        dteReal:L.dte, ...M }); } } }

console.log("\n");
console.log("  ══ AUDIT ══");
console.log("  " + "profundidad".padEnd(14) + "entradas".padStart(10) + "prof. real".padStart(12) +
  "plazo real".padStart(12) + "coste med.".padStart(12) + "prima/spot".padStart(12) + "apalanca".padStart(10));
const md = (X)=>{const B=[...X].sort((a,b)=>a-b); return B[Math.floor(B.length/2)];};
for (const p of PROFS) {
  const L = SALIDA[p];
  if (!L.length) { console.log("  " + ((100*p).toFixed(0)+"%").padEnd(14) + "0".padStart(10) + "  ⛔"); continue; }
  const pv = md(L.map(o=>o.coste/(o.spot*100)));
  console.log("  " + ((100*p).toFixed(0)+"% dentro").padEnd(14) + String(L.length).padStart(10) +
    ((100*md(L.map(o=>o.profReal))).toFixed(1)+"%").padStart(12) +
    (md(L.map(o=>o.dteReal))+"d").padStart(12) +
    ("$"+Math.round(md(L.map(o=>o.coste))).toLocaleString("en-US")).padStart(12) +
    ((100*pv).toFixed(1)+"%").padStart(12) + ((1/pv).toFixed(1)+"x").padStart(10));
  writeFileSync(join(CACHE, "prof"+G.sufijo+"-p"+(100*p).toFixed(0)+"-d"+DTE+".json"), JSON.stringify({ ops: L })); }
console.log("");
console.log("  ↑ el apalancamiento TIENE que bajar al aumentar la profundidad. Si no, algo va mal.");
