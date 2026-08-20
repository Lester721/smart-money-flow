// LA HIPÓTESIS DECÍA "MOVIMIENTO", NO "DIRECCIÓN".
// Si pagan IV alta al comprar, lo que compran es MOVIMIENTO. Aquí se mide eso: el tamaño del
// movimiento futuro, normalizado por la volatilidad que ESE ticker ya traía (calculada SÓLO con
// los 20 días ANTERIORES a D). Sin normalizar sería una tautología: los tickers volátiles se
// mueven más, y eso no se puede operar.
//
//   mov_h = (|ret_h| / raíz(h)) / rvPrev20     →   >1 se movió más de lo que venía moviéndose
import { readFileSync, writeFileSync } from "node:fs";
import zlib from "node:zlib"; import fs from "node:fs"; import path from "node:path";
import { pasarBarrera, informe, listonT, tWelch } from "../../lib/barreraHallazgos";
import { radiografia } from "../../lib/radiografia";

const PRUEBAS = 18;      // 12 direccionales ya hechas + 6 de movimiento
const MIN_ROOTS_DIA = 20;
const RAIZ = path.join("scripts","cache-theta","marketsnack");
const P = JSON.parse(readFileSync(path.join(RAIZ,"iv-panel.json"),"utf8"));

// ── volatilidad realizada PREVIA de cada ticker (sólo días anteriores a D) ─────────────────
const CHART = path.join(RAIZ,"aux","chart-all");
const serie = new Map();
for (const f of fs.readdirSync(CHART)) {
  const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(CHART,f))).toString("utf8"));
  const d = j.data.map(p=>({f:p.t.slice(0,10), v:p.v}));
  serie.set(j.symbol, { fechas: d.map(x=>x.f), cierres: d.map(x=>x.v), idx: new Map(d.map((x,i)=>[x.f,i])) });
}
function rvPrev(root, fecha, N=20) {
  const s = serie.get(root); if(!s) return null;
  const i = s.idx.get(fecha); if(i==null || i < N+1) return null;
  const r = [];
  for (let k=i-N+1;k<=i;k++) r.push(s.cierres[k]/s.cierres[k-1]-1);   // hasta el cierre de D
  const mu = r.reduce((a,x)=>a+x,0)/r.length;
  const sd = Math.sqrt(r.reduce((a,x)=>a+(x-mu)**2,0)/(r.length-1));
  return sd>0 ? sd : null;
}
let sinRv=0;
for (const f of P) {
  const rv = rvPrev(f.root, f.fecha);
  f.rvPrev = rv;
  for (const h of [1,5,20]) {
    const r = f["ret"+h];
    f["mov"+h] = (rv!=null && r!=null) ? Math.abs(r)/Math.sqrt(h)/rv : null;
  }
  if (rv==null) sinRv++;
}
console.log(`filas sin volatilidad previa (menos de 21 barras antes de D): ${sinRv} de ${P.length}`);
radiografia(P.filter(f=>f.mov1!=null), ["rvPrev","mov1","mov5","mov20","ivZ","ivPond"], "movimiento normalizado",
            { maxNulos: 0.6 });

const media = v => v.reduce((a,x)=>a+x,0)/v.length;
function transversal(filas, campo, objetivo) {
  const val = filas.filter(f => f[campo]!=null && Number.isFinite(f[campo]) && f[objetivo]!=null && Number.isFinite(f[objetivo]));
  const porDia = new Map();
  for (const f of val) { if(!porDia.has(f.fecha)) porDia.set(f.fecha,[]); porDia.get(f.fecha).push(f); }
  const out=[];
  for (const [fecha,g] of porDia) {
    if (g.length < MIN_ROOTS_DIA) continue;
    const ord=[...g].sort((a,b)=>a[campo]-b[campo]);
    ord.forEach((f,i)=>out.push({ pnl:f[objetivo], ticker:f.root, fecha, rango: g.length>1?i/(g.length-1):0.5 }));
  }
  return out;
}
const res=[];
for (const campo of ["ivPond","ivZ"]) for (const h of [1,5,20]) {
  const filas = transversal(P, campo, "mov"+h);
  if (filas.length<200) { console.log(`${campo}→mov${h}: sólo ${filas.length} filas`); continue; }
  const v = pasarBarrera(filas, f=>f.rango, { pruebas:PRUEBAS, nMinimo:200, maxPorTicker:0.2 });
  const ord=[...filas].sort((a,b)=>b.rango-a.rango); const k=Math.floor(ord.length/3);
  const alto=ord.slice(0,k).map(f=>f.pnl), bajo=ord.slice(-k).map(f=>f.pnl);
  console.log(`\n${"═".repeat(78)}\n${campo} → MOVIMIENTO normalizado a ${h}d · n=${filas.length}`);
  console.log(`  tercio ALTO ${media(alto).toFixed(4)}×   tercio BAJO ${media(bajo).toFixed(4)}×   separación ${(media(alto)-media(bajo)).toFixed(4)}×   t=${tWelch(alto,bajo).toFixed(2)} (listón ${listonT(PRUEBAS)})`);
  console.log(informe(v, `${campo} → mov${h}`));
  res.push({campo,h,n:filas.length,alto:media(alto),bajo:media(bajo),sep:media(alto)-media(bajo),t:tWelch(alto,bajo),pasa:v.pasa,motivos:v.motivos,tercios:v.detalle.tercios});
}
writeFileSync(path.join(RAIZ,"iv-resultados-movimiento.json"), JSON.stringify(res,null,1));
console.log(`\nRESUMEN MOVIMIENTO (listón t=${listonT(PRUEBAS)} para ${PRUEBAS} pruebas)`);
for (const r of res) console.log(`${r.campo.padEnd(8)} mov${String(r.h).padStart(2)}  n=${String(r.n).padStart(5)}  alto ${r.alto.toFixed(3)}×  bajo ${r.bajo.toFixed(3)}×  sep ${r.sep.toFixed(3)}×  t=${r.t.toFixed(2)}  ${r.pasa?"PASA":"no"}`);
