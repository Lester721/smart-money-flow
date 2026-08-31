// ══ LOS SEIS QUE FALTABAN ══ Lester, 2026-08-30: «corre los seis».
//
// Todos los diales de LA PALANCA se afinaron sobre la población «por debajo de la media», donde
// el 98% de las entradas están en la zona muerta (1,03–1,12x). La señal vive en el 1,4% más
// hundido. Así que los diales están calibrados para la población equivocada.
//
// Se mide a nivel de OPERACIÓN y SIN SOLAPAR (una por ticker cada 180 días), que es el único
// banco que hoy funciona: el de cartera baraja el 100% de las operaciones al tocar un parámetro.
// ⚠️ Los solapes se quitan DENTRO de cada regla, nunca antes de filtrar (eso daba 20 en vez de 139).
const CAST = 0.0138, kM = (1-CAST/2)/(1+CAST/2);
const ms = (d) => Date.parse(d.slice(0,4)+"-"+d.slice(4,6)+"-"+d.slice(6,8));
const mf = (c, hold=120, suelo=0.50) => { let i = Math.min(hold, c.length)-1;
  for (let j=0;j<=i;j++) if (c[j][1]<=suelo) { i=j; break; } return c[i][1]*kM; };
function ss(L) { const P={}; for (const x of L) (P[x.k]=P[x.k]||[]).push(x);
  const o=[]; for (const g of Object.values(P)) { let u=-1e15;
    for (const x of g.sort((a,b)=>a.dC.localeCompare(b.dC))) {
      const t=ms(x.dC); if (t-u < 180*86400000) continue; u=t; o.push(x); } } return o; }
const mm = (V) => V.reduce((a,b)=>a+b,0)/V.length;
function t2(A,B){ if(A.length<8||B.length<8) return {d:NaN,t:NaN};
  const a=mm(A), b=mm(B);
  const va=A.reduce((s,x)=>s+(x-a)**2,0)/(A.length-1), vb=B.reduce((s,x)=>s+(x-b)**2,0)/(B.length-1);
  return { d:a-b, t:(a-b)/Math.sqrt(va/A.length+vb/B.length) }; }
const fmt = (x,n=3) => isNaN(x) ? "   —" : ((x>=0&&n===3?"+":"")+x.toFixed(n));

async function cargar(f, g) { process.env.CAMINOS = f;
  const M = await import("./motor-cartera.mjs?s=" + f + g);
  return M.OPS.filter((o)=>o.ma>-0.30 && o.camino && o.camino.length>=15)
    .map((o)=>({ k:g+o.tk, tk:o.tk, dC:o.dC, ma:o.ma, cam:o.camino, a:o.dC.slice(0,4) })); }

const D27 = await cargar("largo-p25-d400.json","27|");
const DA  = await cargar("caminos-A.json","A|");
const T = D27.concat(DA);
const linea = (et, A, B, extra="") => console.log("  " + et.padEnd(22) + String(A.length).padStart(6) +
  mm(A.map(x=>x.m)).toFixed(3).padStart(10) + (B.length? mm(B.map(x=>x.m)).toFixed(3):"  —").padStart(10) +
  fmt(t2(A.map(x=>x.m),B.map(x=>x.m)).d).padStart(9) +
  fmt(t2(A.map(x=>x.m),B.map(x=>x.m)).t,2).padStart(7) + extra);

// ── 1. EL GRADIENTE, MÁS ABAJO ────────────────────────────────────────────────────────────
console.log("\n  ══ 1 · ¿HASTA DÓNDE LLEGA EL GRADIENTE? ══   (27 + grupo A juntos)");
console.log("  " + "corte".padEnd(22) + "n".padStart(6) + "x dentro".padStart(10) +
  "x fuera".padStart(10) + "dif".padStart(9) + "t".padStart(7) + "   años>1");
for (const u of [-0.10,-0.13,-0.15,-0.18,-0.20,-0.25,-0.30]) {
  const A = ss(T.filter(x=>x.ma<=u)).map(x=>({...x,m:mf(x.cam)}));
  const B = ss(T.filter(x=>x.ma>u)).map(x=>({...x,m:mf(x.cam)}));
  if (A.length < 10) { console.log("  " + ((100*u).toFixed(0)+"% o más").padEnd(22) + String(A.length).padStart(6) + "   (pocas)"); continue; }
  const P={}; for (const x of A) (P[x.a]=P[x.a]||[]).push(x.m);
  const an = Object.keys(P).filter(a=>mm(P[a])>1).length;
  linea((100*u).toFixed(0)+"% o más", A, B, "   " + an + "/" + Object.keys(P).length); }

// ── 3. LA RAMA DE ARRIBA ──────────────────────────────────────────────────────────────────
console.log("\n  ══ 3 · ¿Y LA RAMA DE ARRIBA? ══   ¿el efecto es «hundida» o «lejos de la media»?");
console.log("  " + "corte".padEnd(22) + "n".padStart(6) + "x dentro".padStart(10) +
  "x fuera".padStart(10) + "dif".padStart(9) + "t".padStart(7));
for (const [et, fl] of [["+5% o más ARRIBA", x=>x.ma>=0.05], ["+8% o más ARRIBA", x=>x.ma>=0.08],
                        ["+10% o más ARRIBA", x=>x.ma>=0.10],
                        ["LEJOS, los dos lados ±10%", x=>Math.abs(x.ma)>=0.10]]) {
  const A = ss(T.filter(fl)).map(x=>({...x,m:mf(x.cam)}));
  const B = ss(T.filter(x=>!fl(x))).map(x=>({...x,m:mf(x.cam)}));
  if (A.length < 10) { console.log("  " + et.padEnd(22) + String(A.length).padStart(6) + "   (pocas)"); continue; }
  linea(et, A, B); }

// ── 5. EL AGUANTE, PARA ESTAS ENTRADAS ────────────────────────────────────────────────────
console.log("\n  ══ 5 · ¿CUÁNTO HAY QUE AGUANTAR una entrada del −10%? ══");
console.log("  " + "sesiones".padEnd(22) + "n".padStart(6) + "x del −10%".padStart(12) +
  "x del resto".padStart(13) + "dif".padStart(9) + "t".padStart(7));
for (const h of [20,40,60,90,120,180,250]) {
  const A = ss(T.filter(x=>x.ma<=-0.10)).map(x=>({...x,m:mf(x.cam,h)}));
  const B = ss(T.filter(x=>x.ma>-0.10)).map(x=>({...x,m:mf(x.cam,h)}));
  const r = t2(A.map(x=>x.m), B.map(x=>x.m));
  console.log("  " + (h+" sesiones").padEnd(22) + String(A.length).padStart(6) +
    mm(A.map(x=>x.m)).toFixed(3).padStart(12) + mm(B.map(x=>x.m)).toFixed(3).padStart(13) +
    fmt(r.d).padStart(9) + fmt(r.t,2).padStart(7)); }

// ── 4. LA PROFUNDIDAD DE LA CALL (sólo los 27: el grupo A sólo está construido a 25%) ──────
console.log("\n  ══ 4 · ¿QUÉ PROFUNDIDAD para una entrada hundida? ══   ⚠️ SÓLO los 27 (el grupo A");
console.log("       sólo está construido al 25% — haría falta reconstruirlo para comprobarlo)");
console.log("  " + "call dentro del".padEnd(22) + "n".padStart(6) + "x del −10%".padStart(12) +
  "x del resto".padStart(13) + "dif".padStart(9) + "t".padStart(7));
for (const p of [15,25,35,50]) {
  let D; try { D = await cargar("caminos-p"+p+"-d250.json","p"+p+"|"); } catch { console.log("  " + (p+"%").padEnd(22) + "  (sin fichero)"); continue; }
  const A = ss(D.filter(x=>x.ma<=-0.10)).map(x=>({...x,m:mf(x.cam,90)}));
  const B = ss(D.filter(x=>x.ma>-0.10)).map(x=>({...x,m:mf(x.cam,90)}));
  if (A.length < 10) { console.log("  " + (p+"% dentro").padEnd(22) + String(A.length).padStart(6) + "  (pocas)"); continue; }
  const r = t2(A.map(x=>x.m), B.map(x=>x.m));
  console.log("  " + (p+"% dentro").padEnd(22) + String(A.length).padStart(6) +
    mm(A.map(x=>x.m)).toFixed(3).padStart(12) + mm(B.map(x=>x.m)).toFixed(3).padStart(13) +
    fmt(r.d).padStart(9) + fmt(r.t,2).padStart(7)); }

// ── 6. ¿EL TAMAÑO DEBE SEGUIR AL GRADIENTE? ───────────────────────────────────────────────
console.log("\n  ══ 6 · SI EL GRADIENTE ES MONÓTONO, ¿cuánto más pagar por lo más hundido? ══");
console.log("  " + "franja".padEnd(22) + "n".padStart(6) + "x medio".padStart(10) + "   peso relativo si el tamaño siguiera al x");
const FR = [[-0.30,-0.15,"15% a 30% abajo"],[-0.15,-0.10,"10% a 15% abajo"],
            [-0.10,-0.05,"5% a 10% abajo"],[-0.05,0,"0% a 5% abajo"]];
const base = [];
for (const [lo,hi,et] of FR) { const A = ss(T.filter(x=>x.ma>=lo&&x.ma<hi)).map(x=>({...x,m:mf(x.cam)}));
  base.push([et, A.length, A.length>=10?mm(A.map(x=>x.m)):NaN]); }
const ref = base[base.length-1][2];
for (const [et,n,m] of base) console.log("  " + et.padEnd(22) + String(n).padStart(6) +
  (isNaN(m)?"   —":m.toFixed(3)).padStart(10) + "        " + (isNaN(m)?"—":"x" + ((m-1)/(ref-1)).toFixed(2) + " del de abajo"));
console.log("");
