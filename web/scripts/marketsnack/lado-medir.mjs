import fs from "node:fs";
import { radiografia } from "../../lib/radiografia.ts";
import { pasarBarrera, listonT, informe, potencia, tWelch, comprobarDescarte } from "../../lib/barreraHallazgos.ts";

const P = JSON.parse(fs.readFileSync("scripts/marketsnack/lado-panel.json","utf8"));
const METRICAS = ["netoCall","netoPut","direccion","deltaNeto"];
const HORIZ = [1,5,20];
const CORTES = Object.keys(P);
const PRUEBAS = METRICAS.length * HORIZ.length * CORTES.length;   // 4 × 3 × 3 = 36, DECLARADAS
console.log(`PRUEBAS DECLARADAS: ${PRUEBAS}  →  listón de |t| = ${listonT(PRUEBAS)}  (Bonferroni)\n`);

// ── radiografía sobre las filas del corte primario ──
const base = P["12:00"];
radiografia(base, ["netoCall","netoPut","direccion","deltaNeto","r1","r5","r20","primaDirigida","n"], "panel LADO 12:00 ET",
  { cerosLegitimos: [] });

const media=(v)=>v.length?v.reduce((a,x)=>a+x,0)/v.length:0;
const resumen = [];

for(const corte of CORTES){
  for(const m of METRICAS){
    for(const h of HORIZ){
      const filas = P[corte]
        .filter(f => f[`q_${m}`]!=null && f[`d${h}`]!=null)
        .map(f => ({ pnl: f[`d${h}`], ticker: f.ticker, fecha: f.fecha, q: f[`q_${m}`], bruto: f[`r${h}`] }));
      if(filas.length < 50) { console.log(`${corte} ${m} ${h}d → sólo ${filas.length} filas`); continue; }
      const v = pasarBarrera(filas, f=>f.q, { pruebas: PRUEBAS, nMinimo: 200, maxPorTicker: 0.2 });
      const pot = potencia(filas, 0.005);
      resumen.push({ corte, m, h, n: filas.length, sep: v.detalle.sep, t: v.detalle.t,
                     pasa: v.pasa, tercios: v.detalle.tercios.map(x=>x.sep), motivos: v.motivos, det: pot.detectable });
    }
  }
}
resumen.sort((a,b)=>Math.abs(b.t)-Math.abs(a.t));
console.log(`\n═══ LAS ${resumen.length} PRUEBAS, ordenadas por |t| ═══`);
console.log(`corte  métrica    h    n     sep(alto−bajo)      t     signo de los 3 tercios   ¿pasa?`);
for(const r of resumen){
  const sg = r.tercios.map(s=> s>=0?"+":"−").join("");
  console.log(`${r.corte}  ${r.m.padEnd(10)} ${String(r.h).padStart(2)}d ${String(r.n).padStart(5)}  ${(r.sep*100).toFixed(3).padStart(8)}%  ${r.t.toFixed(2).padStart(6)}   ${sg}   ${r.pasa?"✅ PASA":"—"}`);
}
fs.writeFileSync("scripts/marketsnack/lado-resumen.json", JSON.stringify(resumen,null,1));

// ── informe detallado del mejor ──
const mejor = resumen[0];
console.log(`\n═══ DETALLE del mayor |t|: ${mejor.corte} · ${mejor.m} · ${mejor.h}d ═══`);
{
  const filas = P[mejor.corte].filter(f=>f[`q_${mejor.m}`]!=null && f[`d${mejor.h}`]!=null)
    .map(f=>({pnl:f[`d${mejor.h}`],ticker:f.ticker,fecha:f.fecha,q:f[`q_${mejor.m}`]}));
  const v = pasarBarrera(filas, f=>f.q, {pruebas:PRUEBAS,nMinimo:200,maxPorTicker:0.2});
  console.log(informe(v, `LADO · ${mejor.m} · ${mejor.h}d · corte ${mejor.corte}`));
  console.log("\n" + potencia(filas, 0.005).mensaje);
}

// ── monotonía en quintiles, corte primario, todas las métricas y horizontes ──
console.log(`\n═══ MONOTONÍA por quintiles (corte 12:00 ET · retorno demediado, %) ═══`);
for(const m of METRICAS){
  for(const h of HORIZ){
    const f = P["12:00"].filter(x=>x[`q_${m}`]!=null && x[`d${h}`]!=null);
    if(f.length<200) continue;
    const q = [0,1,2,3,4].map(k=> f.filter(x=> x[`q_${m}`]>=k/5 && x[`q_${m}`]<(k+1)/5 + (k===4?0.001:0)));
    console.log(`${m.padEnd(10)} ${String(h).padStart(2)}d  ` + q.map((g,i)=>`Q${i+1} ${(media(g.map(x=>x[`d${h}`]))*100).toFixed(3)}%`).join("  ") +
                `   n/quintil ≈ ${Math.round(f.length/5)}`);
  }
}

// ── ¿vive antes o después de la ruptura del 2026-07-16? ──
console.log(`\n═══ ANTES vs DESPUÉS de la ruptura del 2026-07-16 (corte 12:00) ═══`);
for(const m of METRICAS){
  for(const h of HORIZ){
    const f = P["12:00"].filter(x=>x[`q_${m}`]!=null && x[`d${h}`]!=null);
    const parte = (g)=>{ if(g.length<60) return "—";
      const o=[...g].sort((a,b)=>a[`q_${m}`]-b[`q_${m}`]); const k=Math.floor(o.length/3);
      const alto=o.slice(-k).map(x=>x[`d${h}`]), bajo=o.slice(0,k).map(x=>x[`d${h}`]);
      return `${((media(alto)-media(bajo))*100).toFixed(3)}% (t=${tWelch(alto,bajo).toFixed(2)}, n=${g.length})`; };
    console.log(`${m.padEnd(10)} ${String(h).padStart(2)}d  antes ${parte(f.filter(x=>x.fecha<"2026-07-16")).padEnd(30)} después ${parte(f.filter(x=>x.fecha>="2026-07-16"))}`);
  }
}
