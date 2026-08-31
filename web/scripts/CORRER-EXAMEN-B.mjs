// ══ EJECUTOR DEL EXAMEN DEL GRUPO B ══
// No decide nada: aplica lo firmado en EXAMEN-grupo-B.mjs. Los criterios se LEEN de allí para
// que no se puedan mover mirando el resultado.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";
import { REGLA, CRITERIOS, GRUPO_B } from "./EXAMEN-grupo-B.mjs";

// ── el fichero de B no trae SPY (cadenas-B no lo contiene): se copia del de los 27 ──
const fB = join(CACHE, "sincosteB-p25-d400.json");
{ const B = JSON.parse(readFileSync(fB, "utf8"));
  if (!B.spy || !Object.keys(B.spy).length) {
    B.spy = JSON.parse(readFileSync(join(CACHE, "sincoste-p25-d400.json"), "utf8")).spy;
    B.ops.sort((a, b) => a.dC.localeCompare(b.dC));
    writeFileSync(fB, JSON.stringify(B));
    console.log("\n  SPY copiado al fichero de B (" + Object.keys(B.spy).length + " días)"); } }

const P = JSON.parse(readFileSync(join(CACHE, "precios-B.json"), "utf8"));
const PX={}, IDX={}, SPL={};
for (const tk of Object.keys(P)) { const D = Object.keys(P[tk]).sort();
  PX[tk]=D.map(d=>P[tk][d]); IDX[tk]=new Map(D.map((d,i)=>[d,i]));
  const S=new Set(); for(let i=1;i<D.length;i++){const r=PX[tk][i]/PX[tk][i-1]; if(r>1.35||r<0.65)S.add(i);}
  SPL[tk]=S; }
function maN(tk,d,N){ const i=IDX[tk]?.get(d); if(i==null||i<N) return null;
  for(let j=i-N+1;j<=i;j++) if(SPL[tk].has(j)) return null;
  let s=0; for(let j=i-N;j<i;j++) s+=PX[tk][j]; return PX[tk][i]/(s/N)-1; }

process.env.CAMINOS = "sincosteB-p25-d400.json";
const M = await import("./motor-cartera.mjs");
const MA20 = M.OPS.map(o => o.ma);                        // la que trae el fichero
const MA50 = M.OPS.map(o => maN(o.tk, o.dC, REGLA.mediaN));
const poner = (usa50, u) => { for (let i=0;i<M.OPS.length;i++) {
  const v = usa50 ? MA50[i] : MA20[i];
  M.OPS[i].ma = (v!=null && v<u && v>=REGLA.descarteRoto) ? v : 999; } };
const CFG = { tam:REGLA.tam, huecos:REGLA.huecos, modo:REGLA.ocioso, plazo:REGLA.aguante,
              castigo:REGLA.castigo, suelo:REGLA.suelo, costeMin:REGLA.costeMin };
function banda(cfg=CFG) { const F=[],A=[],C=[],S=[],O=[];
  for (let i=0;i<REGLA.bandas;i++) { const cap = REGLA.capital*(1+(i-20)*0.005);
    const q = M.simular({...cfg, capital:cap});
    F.push(q.final-cap);A.push(q.cagr);C.push(q.caida);S.push(q.sharpe);O.push(q.ops); }
  const q1 = M.simular({...cfg, capital:REGLA.capital});
  const L = q1.tom.map(x=>x.dinero*(x.mult-1)); const tot = L.reduce((a,b)=>a+b,0);
  const PA={}; q1.tom.forEach((x,i)=>{const y=x.dC.slice(0,4); PA[y]=(PA[y]||0)+L[i];});
  return { d:M.med(F)/M.ANOS, a:M.med(A), c:M.med(C), s:M.med(S), o:M.med(O),
           may: tot>0?100*Math.max(...L)/tot:NaN,
           ap:Object.values(PA).filter(v=>v>0).length, at:Object.keys(PA).length }; }

// ── AUDIT ─────────────────────────────────────────────────────────────────────────────────
const tks=[...new Set(M.OPS.map(o=>o.tk))].sort(), F=M.OPS.map(o=>o.dC).sort();
const spy = M.spyApalancado(1), spyD = (spy.final-REGLA.capital)/M.ANOS;
console.log("");
console.log("  ══ AUDIT ══");
console.log("  entradas: " + M.OPS.length.toLocaleString("en-US") + "  ·  tickers: " + tks.length + " de " + GRUPO_B.length);
console.log("  período: " + F[0] + " → " + F[F.length-1] + "  ·  días de mercado: " + M.DD.length);
const sin = GRUPO_B.filter(t=>!tks.includes(t));
if (sin.length) console.log("  sin operaciones: " + sin.join(" "));
console.log("  comprar SPY: $" + Math.round(spyD).toLocaleString("en-US") + "/año · " +
  spy.cagr.toFixed(1) + "% · −" + spy.caida.toFixed(0) + "% · Sharpe " + spy.sharpe.toFixed(2));
if (Math.abs(spy.cagr-14.9) > 0.3) { console.log("  ⛔ SPY no cuadra. No sigo."); process.exit(1); }
console.log("  ✓ SPY cuadra con los otros grupos");

// ── EL EXAMEN ─────────────────────────────────────────────────────────────────────────────
poner(true, REGLA.umbral);
const R = banda();
console.log("");
console.log("  ══ EL EXAMEN ══   (mediana de " + REGLA.bandas + " capitales)");
console.log("  " + "".padEnd(36)+"al año".padStart(11)+"%/año".padStart(8)+"caída".padStart(8)+
  "Sharpe".padStart(8)+"ops".padStart(6)+"  la mayor"+"  años+");
const fila=(et,r)=>console.log("  "+et.padEnd(36)+
  ("$"+Math.round(r.d).toLocaleString("en-US")).padStart(11)+(r.a.toFixed(1)+"%").padStart(8)+
  ("−"+r.c.toFixed(0)+"%").padStart(8)+r.s.toFixed(2).padStart(8)+String(Math.round(r.o)).padStart(6)+
  (isNaN(r.may)?"    —":(r.may.toFixed(0)+"%").padStart(9))+("  "+r.ap+"/"+r.at).padStart(7));
fila("LA REGLA (media 50, −7%, 10 hue)", R);
console.log("  " + "comprar SPY y dormir".padEnd(36)+("$"+Math.round(spyD).toLocaleString("en-US")).padStart(11)+
  (spy.cagr.toFixed(1)+"%").padStart(8)+("−"+spy.caida.toFixed(0)+"%").padStart(8)+spy.sharpe.toFixed(2).padStart(8));

// ── LO QUE SE REPORTA PERO NO DECIDE ──────────────────────────────────────────────────────
console.log("");
console.log("  ── no deciden, pero se reportan ──");
poner(false, 0); fila("CONTROL · entrada vieja (media 20)", banda());
for (const u of [-0.06, -0.08]) { poner(true, u);
  fila("vecino · umbral " + (100*u).toFixed(0) + "%", banda()); }
poner(true, REGLA.umbral);
fila("con \$5.000 al medir (referencia)", banda({...CFG, costeMin:5000}));
fila("LA PALANCA vieja (2 huecos, 12%)", (poner(false,0), banda({...CFG, huecos:2, tam:0.12, costeMin:5000})));

// ── VEREDICTO ─────────────────────────────────────────────────────────────────────────────
const c1 = R.d > spyD, c2 = R.s >= CRITERIOS.sharpeMinimo, c3 = R.o >= CRITERIOS.minOperaciones;
console.log("");
console.log("  ══ VEREDICTO ══");
console.log("  (1) gana más que SPY ......... $" + Math.round(R.d).toLocaleString("en-US") +
  " contra $" + Math.round(spyD).toLocaleString("en-US") + "   " + (c1?"✓ SÍ":"✗ NO"));
console.log("  (2) Sharpe >= " + CRITERIOS.sharpeMinimo + " ............. " + R.s.toFixed(2) + "   " + (c2?"✓ SÍ":"✗ NO"));
console.log("  (3) al menos " + CRITERIOS.minOperaciones + " ops ......... " + Math.round(R.o) + "   " + (c3?"✓ SÍ":"✗ NO"));
console.log("");
console.log("  ►►► " + (c1&&c2&&c3 ? "APRUEBA" : "SUSPENDE — la regla se RETIRA, no se ajusta."));
console.log("");
