// ══ ULTRACODE — laboratorio comun para la SINTESIS del 30 de agosto ══════════════════
// Un proceso = un universo (UNI=AB|27) x una profundidad de contrato (PROF=25|15|10).
// motor-cartera.mjs NO se toca: se usa motor-uc.mjs, que es una copia con cuatro mandos
// nuevos (porTicker, sepDias, kProf/topeProf/umbralProf, kBajo/kAlto) y que con los
// valores por defecto es identico al original.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CACHE } from './raiz.mjs';

export const UNI  = process.env.UNI  || 'AB';
export const PROF = process.env.PROF || '25';
const FICH = UNI === 'AB' ? `sincosteAB-p${PROF}-d400.json` : `sincoste-p${PROF}-d400.json`;
process.env.CAMINOS = FICH;

// ── precios del universo (para la MA50 de cada accion) ──
const P = {};
if (UNI === 'AB') { for (const f of ['precios-A.json','precios-B.json'])
    Object.assign(P, JSON.parse(readFileSync(join(CACHE, f), 'utf8'))); }
else Object.assign(P, JSON.parse(readFileSync(join(CACHE, 'precios-ajustados.json'), 'utf8')));

const PX = {}, IDX = {}, SPL = {};
for (const tk of Object.keys(P)) { const D = Object.keys(P[tk]).sort();
  PX[tk] = D.map(d => P[tk][d]); IDX[tk] = new Map(D.map((d,i) => [d,i]));
  const S = new Set(); for (let i=1;i<D.length;i++){ const r = PX[tk][i]/PX[tk][i-1]; if (r>1.35||r<0.65) S.add(i);} SPL[tk]=S; }

const maN = (tk,d,N) => { const i = IDX[tk]?.get(d); if (i==null||i<N) return null;
  for (let j=i-N+1;j<=i;j++) if (SPL[tk].has(j)) return null;
  let s=0; for (let j=i-N;j<i;j++) s+=PX[tk][j]; return PX[tk][i]/(s/N)-1; };

// volatilidad realizada anualizada de las N sesiones ANTERIORES (no toca el cierre de hoy)
const volN = (tk,d,N) => { const i = IDX[tk]?.get(d); if (i==null||i<=N) return null;
  const r=[]; for (let j=i-N+1;j<=i-1;j++){ if (SPL[tk].has(j)) continue; r.push(Math.log(PX[tk][j]/PX[tk][j-1])); }
  if (r.length < N*0.8) return null;
  const m=r.reduce((a,x)=>a+x,0)/r.length;
  return Math.sqrt(r.reduce((a,x)=>a+(x-m)**2,0)/(r.length-1))*Math.sqrt(252); };

// ── SPY contra su propia MA50 (SPY solo esta en precios-ajustados.json) ──
const PA = JSON.parse(readFileSync(join(CACHE, 'precios-ajustados.json'), 'utf8'));
const SD = Object.keys(PA.SPY).sort(), SP = SD.map(d => PA.SPY[d]);
export const SPYMA = new Map();
for (let i=50;i<SD.length;i++){ let s=0; for (let j=i-50;j<i;j++) s+=SP[j]; SPYMA.set(SD[i], SP[i]/(s/50)-1); }

export const M = await import('./motor-uc.mjs');
export const OPS = M.OPS;

// ── se precalcula UNA vez por proceso ──
export const MA50 = OPS.map(o => maN(o.tk, o.dC, 50));
export const VOL  = OPS.map(o => volN(o.tk, o.dC, 100));
export const SBAJ = OPS.map(o => { const v = SPYMA.get(o.dC); return v != null && v < 0; });
for (let i=0;i<OPS.length;i++) OPS[i].sbaj = SBAJ[i];

/** Marca que operaciones son elegibles. hoyo=−0.05 => la accion 5% bajo su MA50. */
export function marcar({ hoyo = -0.07, suelo = -0.30, volMin = 0, anosFuera = null } = {}) {
  let n = 0;
  for (let i=0;i<OPS.length;i++) { const v = MA50[i];
    let ok = v != null && v < hoyo && v >= suelo;
    if (ok && volMin > 0) { const w = VOL[i]; ok = w != null && w > volMin; }
    if (ok && anosFuera) ok = !anosFuera.includes(OPS[i].dC.slice(0,4));
    OPS[i].ma = ok ? v : 999; if (ok) n++; }
  return n; }

const CAP = 60000;
/** SIEMPRE la mediana de 41 capitales de partida. Devuelve tambien concentracion. */
export function correr(cfg, cap = CAP) {
  const F=[],A=[],C=[],S=[],O=[],I=[],MY=[];
  for (let i=0;i<41;i++){ const c = cap*(1+(i-20)*0.005);
    const q = M.simular({ ...cfg, capital: c });
    F.push(q.final-c); A.push(q.cagr); C.push(q.caida); S.push(q.sharpe); O.push(q.ops); I.push(q.invertido);
    const T=[...q.cerr,...q.abiertas];
    const gan=T.filter(x=>x.pnl>0).reduce((a,x)=>a+x.pnl,0);
    const mx=T.reduce((a,x)=>Math.max(a,x.pnl),0);
    MY.push(gan>0?100*mx/gan:0); }
  const anos = M.ANOS;
  return { dol: M.med(F)/anos, cagr: M.med(A), caida: M.med(C), sharpe: M.med(S),
           ops: M.med(O), inv: M.med(I), mayor: M.med(MY) }; }

/** Mediana de 41 capitales sobre una VENTANA de calendario (los $/ano usan los anos de la ventana). */
export function correrVent(cfg, desdeD, hasta, cap = CAP) {
  const F=[],A=[],C=[],S=[],O=[];
  let anos = null;
  for (let i=0;i<41;i++){ const c = cap*(1+(i-20)*0.005);
    const q = M.simular({ ...cfg, capital: c, desdeD, hasta });
    if (anos == null) { const d=q.dias; const ms=(x)=>Date.parse(x.slice(0,4)+'-'+x.slice(4,6)+'-'+x.slice(6,8)+'T00:00:00Z');
      anos = (ms(d[d.length-1])-ms(d[0]))/(365.25*86400000); }
    F.push(q.final-c); A.push(q.cagr); C.push(q.caida); S.push(q.sharpe); O.push(q.ops); }
  return { dol: M.med(F)/anos, cagr: M.med(A), caida: M.med(C), sharpe: M.med(S), ops: M.med(O), anos }; }

export const fila = (n,r) => `${n.padEnd(30)} $${Math.round(r.dol).toLocaleString('en-US').padStart(8)}/ano  ${r.cagr.toFixed(1).padStart(5)}%  caida ${r.caida.toFixed(1).padStart(5)}%  Sharpe ${r.sharpe.toFixed(3)}  ops ${String(Math.round(r.ops)).padStart(4)}${r.mayor!=null?`  mayor ${r.mayor.toFixed(1)}%`:''}${r.inv!=null?`  inv ${r.inv.toFixed(1)}%`:''}`;
