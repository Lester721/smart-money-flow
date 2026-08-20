// PANEL SUBYACENTE-GAMMA · MEDICIÓN.  Tercio alto contra tercio bajo, dentro de cada día.
//
// PRUEBAS DECLARADAS: 56 (ver LISTA abajo). El listón de |t| sale de listonT(56).
//   PANEL A: 6 métricas × 4 resultados = 24
//   PANEL B: 4 métricas × 4 resultados × 2 cortes = 32
import fs from "node:fs"; import path from "node:path";
import { listonT, pasarBarrera, informe, tWelch, potencia } from "../../lib/barreraHallazgos.ts";
import { radiografia } from "../../lib/radiografia.ts";

const PRUEBAS = 56;
const LISTON = listonT(PRUEBAS);
const J = JSON.parse(fs.readFileSync("scripts/marketsnack/ug-panel.json","utf8"));

const media=(v)=>v.length?v.reduce((a,x)=>a+x,0)/v.length:0;
const sd=(v)=>{ if(v.length<2) return 0; const m=media(v); return Math.sqrt(v.reduce((a,x)=>a+(x-m)**2,0)/(v.length-1)); };

// ── cobertura por período (la ruptura del 2026-07-16 parte la muestra en dos poblaciones) ────
{
  const b = J.B["11:00"];
  const antes = b.filter(f=>f.fecha < "2026-07-16"), desde = b.filter(f=>f.fecha >= "2026-07-16");
  const dias=(g)=>new Set(g.map(f=>f.fecha)).size;
  console.log(`\n══ COBERTURA a los dos lados de la ruptura del 2026-07-16 (corte 11:00) ══`);
  console.log(`  antes: ${antes.length} filas · ${dias(antes)} días · ${(antes.length/Math.max(1,dias(antes))).toFixed(1)} símbolos/día · ops/símbolo mediana ${(()=>{const a=antes.map(f=>f.n).sort((x,y)=>x-y);return a[Math.floor(a.length/2)]??0;})()}`);
  console.log(`  desde: ${desde.length} filas · ${dias(desde)} días · ${(desde.length/Math.max(1,dias(desde))).toFixed(1)} símbolos/día · ops/símbolo mediana ${(()=>{const a=desde.map(f=>f.n).sort((x,y)=>x-y);return a[Math.floor(a.length/2)]??0;})()}`);
}

// ── radiografía ──────────────────────────────────────────────────────────────────────────────
radiografia(J.A, ["gexRel","distFlip","distMagnet","distMaxPain","posEnMuros","anchoMuros","d_r1","a_r1"], "panel A (GEX diario de MarketSnack)", { maxNulos: 0.6 });
for(const et of Object.keys(J.B))
  radiografia(J.B[et], ["gammaNeta","gammaClasica","gammaRel","distCentro","d_rIntra","a_rIntra","d_r1","a_r1"], `panel B · corte ${et}`, { maxNulos: 0.6 });

// ── una prueba = una métrica contra un resultado ─────────────────────────────────────────────
const resultados=[];
function prueba(nombre, filas, metrica, resultado, etiqueta){
  const f = filas.filter(x => x[metrica]!=null && x[resultado]!=null)
                 .map(x => ({ pnl:x[resultado], ticker:x.ticker, fecha:x.fecha, m:x[metrica] }));
  if(f.length < 50){ console.log(`  ${nombre.padEnd(46)} SIN MUESTRA (${f.length})`); return null; }
  const v = pasarBarrera(f, x=>x.m, { pruebas:PRUEBAS, nMinimo:200, maxPorTicker:0.2 });
  // separación por día (cartera larga-corta neutral: tercio alto − tercio bajo cada día)
  const porDia=new Map();
  for(const x of f){ let g=porDia.get(x.fecha); if(!g){g=[];porDia.set(x.fecha,g);} g.push(x); }
  const LS=[], LG=[];
  for(const [d,g] of [...porDia].sort()){
    if(g.length<20) continue;
    const o=[...g].sort((a,b)=>a.m-b.m), k=Math.floor(o.length/3); if(k<5) continue;
    LS.push(media(o.slice(-k).map(x=>x.pnl)) - media(o.slice(0,k).map(x=>x.pnl)));
    LG.push(media(o.slice(-k).map(x=>x.pnl)) - media(o.map(x=>x.pnl)));
  }
  const tLS = LS.length>2 ? media(LS)/(sd(LS)/Math.sqrt(LS.length)) : 0;
  const k3=Math.floor(LS.length/3);
  const tercios3 = k3>=2 ? [LS.slice(0,k3),LS.slice(k3,2*k3),LS.slice(2*k3)].map(g=>media(g)) : [];
  const r = { nombre, etiqueta, n:f.length, dias:LS.length,
    sep:v.detalle.sep, t:v.detalle.t, pasa:v.pasa, motivos:v.motivos,
    tercios:v.detalle.tercios.map(t=>({p:t.periodo,sep:t.sep,t:t.t})),
    tickerMayor:v.detalle.tickerMayor,
    diario:{ media:media(LS), t:tLS, positivos:LS.filter(x=>x>0).length, n:LS.length, tercios:tercios3, largoSolo:media(LG) } };
  resultados.push(r);
  const marca = v.pasa ? "✅" : (Math.abs(v.detalle.t??0)>=2 ? "· " : "  ");
  console.log(`  ${marca}${nombre.padEnd(44)} n=${String(f.length).padStart(5)}  sep ${((v.detalle.sep??0)*100).toFixed(3).padStart(8)}%  t=${(v.detalle.t??0).toFixed(2).padStart(6)}  diaria t=${tLS.toFixed(2).padStart(6)}  ${v.pasa?"PASA":v.motivos.length+" fallo(s)"}`);
  return r;
}

console.log(`\n══════════ PANEL A · el GEX diario de MarketSnack (19 días, 33 tickers) ══════════`);
console.log(`   se observa a las 15:30 ET, se entra al cierre de ESE día. listón |t| ≥ ${LISTON} (${PRUEBAS} pruebas)\n`);
const metA = ["gexRel","distFlip","distMagnet","distMaxPain","posEnMuros","anchoMuros"];
const resA = [["d_r1","dirección D→D+1"],["a_r1","amplitud D→D+1"],["d_r5","dirección D→D+5"],["a_r5","amplitud D→D+5"]];
for(const m of metA) for(const [rr,et] of resA) prueba(`A · ${m} → ${et}`, J.A, m, rr, et);

console.log(`\n══════════ PANEL B · gamma del creador reconstruida con el LADO REAL (86 días) ══════════\n`);
const metB = ["gammaNeta","gammaClasica","gammaRel","distCentro"];
const resB = [["d_rIntra","dirección corte→cierre"],["a_rIntra","amplitud corte→cierre"],["d_r1","dirección cierre→cierre+1"],["a_r1","amplitud cierre→cierre+1"]];
for(const et of Object.keys(J.B)){
  console.log(`  ── corte ${et} ET ──`);
  for(const m of metB) for(const [rr,e] of resB) prueba(`B ${et} · ${m} → ${e}`, J.B[et], m, rr, e);
}

// ── resumen ──────────────────────────────────────────────────────────────────────────────────
console.log(`\n══════════ RESUMEN ══════════`);
const pasan = resultados.filter(r=>r.pasa);
console.log(`pruebas hechas: ${resultados.length} (declaradas ${PRUEBAS}) · listón |t| ≥ ${LISTON}`);
console.log(`pasan las cuatro cribas: ${pasan.length}`);
for(const r of pasan) console.log(`   ✅ ${r.nombre}  sep ${(r.sep*100).toFixed(3)}%  t=${r.t.toFixed(2)}`);
const cerca = resultados.filter(r=>!r.pasa && Math.abs(r.t??0)>=2).sort((a,b)=>Math.abs(b.t)-Math.abs(a.t));
console.log(`\ncon |t| ≥ 2 pero SIN pasar (${cerca.length}):`);
for(const r of cerca.slice(0,12)) console.log(`   · ${r.nombre.padEnd(44)} t=${r.t.toFixed(2)}  → ${r.motivos.join(" | ")}`);

fs.writeFileSync("scripts/marketsnack/ug-2-salida.json", JSON.stringify({liston:LISTON, pruebas:PRUEBAS, resultados}, null, 1));
console.log(`\n✓ scripts/marketsnack/ug-2-salida.json`);
