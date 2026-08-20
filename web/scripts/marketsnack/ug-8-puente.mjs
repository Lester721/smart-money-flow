// PANEL SUBYACENTE-GAMMA · EL PUENTE: ¿qué le falta para pagar?
//
// Lo medido en ug-7: el cono a UN DÍA pierde $131-177 por contrato vendiendo el tercio alto, y la
// horquilla del propio cono es el 5,9-6,5% de la prima = ~$95-100 de ida y vuelta sobre una prima
// media de $1.600. El peaje se paga UNA VEZ por operación, dure lo que dure. Así que la pregunta
// no es si la señal vale: es CUÁNTOS DÍAS hay que aguantar para que el peaje deje de comérsela.
//
// Aquí se mide exactamente eso, con las mismas cadenas reales:
//   · aguantar el mismo cono 1, 3, 5 y 10 días (una sola ida y vuelta de horquilla)
//   · y si la señal SOBREVIVE a esos plazos (centroMny → realizado/implícito a 3, 5 y 10 días)
import fs from "node:fs"; import path from "node:path"; import zlib from "node:zlib";
import { tWelch, listonT, pasarBarrera } from "../../lib/barreraHallazgos.ts";

const CDIR="scripts/cache-theta/cadenas";
const CH="scripts/cache-theta/marketsnack/aux/chart-all";
const CUENTA=56389;
const PRUEBAS=140+12; const LISTON=listonT(PRUEBAS);
const P5=JSON.parse(fs.readFileSync("scripts/marketsnack/ug-5-panel.json","utf8"));
const media=(v)=>v.length?v.reduce((a,x)=>a+x,0)/v.length:0;
const sd=(v)=>{ if(v.length<2) return 0; const m=media(v); return Math.sqrt(v.reduce((a,x)=>a+(x-m)**2,0)/(v.length-1)); };
const tU=(v)=>v.length>2&&sd(v)>0?media(v)/(sd(v)/Math.sqrt(v.length)):0;

const spy=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(CH,"SPY.json.gz"))).toString("utf8")).data;
const CAL=spy.map(p=>p.t.slice(0,10)); const iCal=new Map(CAL.map((d,i)=>[d,i]));
const masDias=(d,h)=>{ const i=iCal.get(d); return i!=null&&i+h<CAL.length?CAL[i+h]:null; };
const px=new Map();
for(const f of fs.readdirSync(CH)){ if(!f.endsWith(".json.gz")) continue;
  const T=f.replace(".json.gz",""); const s=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(CH,f))).toString("utf8")).data;
  px.set(T,new Map(s.map(p=>[p.t.slice(0,10),p.v]))); }
const cargar=(T,d)=>{ const f=`${CDIR}/${T}_d${d.replace(/-/g,"")}.json`;
  if(!fs.existsSync(f)) return null; try{ return JSON.parse(fs.readFileSync(f,"utf8")); }catch{ return null; } };
const conCadena=new Set(fs.readdirSync(CDIR).map(f=>f.split("_d")[0]));

// ── [1] ¿la señal sobrevive a plazos más largos? realizado/implícito a 3, 5 y 10 días ────────
console.log(`═══ [1] ¿AGUANTA LA SEÑAL A MÁS PLAZO? centroMny → realizado/implícito · listón |t| ≥ ${LISTON} ═══`);
for(const et of Object.keys(P5)){
  const P=P5[et];
  for(const h of [1,3,5,10]){
    for(const f of P){
      const m=px.get(f.ticker); const dF=masDias(f.fecha,h);
      const p0=f.cierreD, p1=dF!=null?m?.get(dF):null;
      f[`R${h}`]=(p0>0&&p1>0&&Math.abs(p1/p0-1)<0.5)?p1/p0-1:null;
    }
    const porDia=new Map();
    for(const f of P){ let g=porDia.get(f.fecha); if(!g){g=[];porDia.set(f.fecha,g);} g.push(f); }
    for(const [d,g] of porDia){
      const v=g.filter(f=>f[`R${h}`]!=null&&f.ivATM>0);
      if(v.length<20) { for(const f of g) f[`z${h}`]=null; continue; }
      const mu=media(v.map(f=>f[`R${h}`]));
      const z=v.map(f=>Math.abs(f[`R${h}`]-mu)/(f.ivATM*Math.sqrt(h/252)));
      const muZ=media(z);
      for(const f of g) f[`z${h}`]=(f[`R${h}`]!=null&&f.ivATM>0)?Math.abs(f[`R${h}`]-mu)/(f.ivATM*Math.sqrt(h/252))-muZ:null;
    }
    const filas=P.filter(f=>f.centroMny!=null&&f[`z${h}`]!=null).map(f=>({pnl:f[`z${h}`],ticker:f.ticker,fecha:f.fecha,m:f.centroMny}));
    if(filas.length<200){ console.log(`  ${et} h=${h}: muestra ${filas.length}`); continue; }
    const v=pasarBarrera(filas,x=>x.m,{pruebas:PRUEBAS,nMinimo:200,maxPorTicker:0.2});
    console.log(`  ${v.pasa?"✅":"  "}${et} · horizonte ${String(h).padStart(2)} día(s): n=${String(filas.length).padStart(5)} sep ${v.detalle.sep.toFixed(4).padStart(8)} t=${v.detalle.t.toFixed(2).padStart(6)}  ${v.pasa?"PASA":v.motivos.slice(0,1)}`);
  }
}

// ── [2] el mismo cono real, aguantado 1/3/5/10 días: una sola ida y vuelta de horquilla ──────
function cono(cad,p,dia,minDte,maxDte){
  if(!cad) return null;
  const d0=Date.parse(dia+"T00:00:00Z");
  const exps=Object.keys(cad).map(e=>({e,dte:(Date.parse(`${e.slice(0,4)}-${e.slice(4,6)}-${e.slice(6,8)}T00:00:00Z`)-d0)/86400e3}))
    .filter(x=>x.dte>=minDte&&x.dte<=maxDte).sort((a,b)=>a.dte-b.dte);
  if(!exps.length) return null;
  const exp=exps[0].e, fl=cad[exp]; let mejor=null;
  for(const k of Object.keys(fl)){ const [Ks,r]=k.split("|"); if(r!=="C") continue;
    const K=Number(Ks); if(!(K>0)||!fl[`${Ks}|P`]) continue;
    const d=Math.abs(K-p); if(!mejor||d<mejor.d) mejor={K,Ks,d}; }
  if(!mejor||mejor.d/p>0.03) return null;
  const c=fl[`${mejor.Ks}|C`], q=fl[`${mejor.Ks}|P`];
  if(!c||!q||!(c[0]>0)||!(c[1]>0)||!(q[0]>0)||!(q[1]>0)) return null;
  return {exp,Ks:mejor.Ks,dte:exps[0].dte,bid:c[0]+q[0],ask:c[1]+q[1]};
}
console.log(`\n═══ [2] EL MISMO CONO, AGUANTADO MÁS DÍAS (una sola horquilla) · precios reales ═══`);
for(const et of Object.keys(P5)){
  const P=P5[et];
  console.log(`\n  ── corte ${et} ──`);
  for(const H of [1,3,5,10]){
    const minDte=H+7, maxDte=H+25;
    const porDia=new Map();
    for(const f of P){ let g=porDia.get(f.fecha); if(!g){g=[];porDia.set(f.fecha,g);} g.push(f); }
    const ops=[];
    for(const [dia,g] of [...porDia].sort()){
      if(g.length<20) continue;
      const dF=masDias(dia,H); if(!dF) continue;
      const o=[...g].sort((a,b)=>a.centroMny-b.centroMny), k=Math.floor(o.length/3); if(k<5) continue;
      const marca=new Map();
      o.slice(0,k).forEach(f=>marca.set(f.ticker,"bajo")); o.slice(-k).forEach(f=>marca.set(f.ticker,"alto"));
      for(const f of g){
        const lado=marca.get(f.ticker); if(!lado||!conCadena.has(f.ticker)) continue;
        const cadD=cargar(f.ticker,dia), cadF=cargar(f.ticker,dF); if(!cadD||!cadF) continue;
        const p0=f.cierreD; if(!(p0>0)) continue;
        const e=cono(cadD,p0,dia,minDte,maxDte); if(!e) continue;
        const fl=cadF[e.exp]; if(!fl) continue;
        const c=fl[`${e.Ks}|C`], q=fl[`${e.Ks}|P`];
        if(!c||!q||!(c[0]>0)||!(c[1]>0)||!(q[0]>0)||!(q[1]>0)) continue;
        ops.push({ticker:f.ticker,fecha:dia,lado,
          vender:(e.bid-(c[1]+q[1]))*100, comprar:((c[0]+q[0])-e.ask)*100,
          horq:(e.ask-e.bid)*100, prima:((e.ask+e.bid)/2)*100});
      }
    }
    const alto=ops.filter(o=>o.lado==="alto").map(o=>o.vender);
    const bajo=ops.filter(o=>o.lado==="bajo").map(o=>o.comprar);
    if(alto.length<20||bajo.length<20){ console.log(`    aguantar ${H} día(s): muestra insuficiente (${alto.length}/${bajo.length})`); continue; }
    const horq=media(ops.map(o=>o.horq)), prima=media(ops.map(o=>o.prima));
    // cartera: por día, media del tercio alto vendido + media del bajo comprado
    const pd=new Map(); for(const o of ops){ let g=pd.get(o.fecha); if(!g){g={a:[],b:[]};pd.set(o.fecha,g);} (o.lado==="alto"?g.a:g.b).push(o); }
    const dias=[]; for(const [d,g] of [...pd].sort()){ if(!g.a.length||!g.b.length) continue;
      dias.push(media(g.a.map(o=>o.vender))+media(g.b.map(o=>o.comprar))); }
    const porAno = dias.length>2 ? media(dias)*(250/H) : null;
    console.log(`    aguantar ${String(H).padStart(2)} día(s) · horquilla $${horq.toFixed(0)} sobre prima $${prima.toFixed(0)} (${(100*horq/prima).toFixed(1)}%) · ` +
      `vender ALTO $${media(alto).toFixed(0)} (t=${tU(alto).toFixed(2)}) · comprar BAJO $${media(bajo).toFixed(0)} (t=${tU(bajo).toFixed(2)}) · ` +
      `par $${dias.length>2?media(dias).toFixed(0):"—"}/op · ${porAno!=null?Math.round(porAno).toLocaleString("es-ES")+" $/año":"—"} (${porAno!=null?(100*porAno/CUENTA).toFixed(1)+"%":"—"})`);
  }
}

// ── [3] cuánto tendría que valer la señal para batir al peaje ────────────────────────────────
console.log(`\n═══ [3] EL LISTÓN QUE HAY QUE SALTAR ═══`);
{
  const ops=JSON.parse(fs.readFileSync("scripts/marketsnack/ug-7-salida.json","utf8"))["14:00"];
  const prima=media(ops.map(o=>o.prima)), horq=media(ops.map(o=>o.horquillaEntrada*o.prima));
  const sinPeaje=media(ops.filter(o=>o.lado==="alto").map(o=>o.vender_sinPeaje));
  console.log(`  prima media del cono: $${prima.toFixed(0)} · ida y vuelta de horquilla: $${(2*horq).toFixed(0)} = ${(200*horq/prima).toFixed(1)}% de la prima`);
  console.log(`  la señal, sin peaje y a un día, da $${sinPeaje.toFixed(0)} por contrato. Para pagar el peaje tendría que dar $${(2*horq).toFixed(0)}:`);
  console.log(`  le falta un factor de ${Math.abs(2*horq/(sinPeaje||1)).toFixed(1)}× — o el mismo peaje repartido entre ${Math.ceil(Math.abs(2*horq/(sinPeaje||1)))} días de aguante, si la señal aguantara.`);
}
console.log(`\n✓ fin`);
