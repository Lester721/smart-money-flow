// ══ EL −10%, CON TODO JUNTO ══ Lester: mis tres razones para decir "no" eran flojas.
// Se junta 27 + grupo A sin solapar (la muestra más grande honesta que tenemos) y se hace la
// pregunta correcta: ¿las entradas MUY hundidas rinden más que TODAS LAS DEMÁS?
// Dos muestras, no una contra 1,0 — porque la pregunta no es "¿gana dinero?" sino "¿gana MÁS?".
const CAST = 0.0138, kM = (1-CAST/2)/(1+CAST/2);
const mf = (c) => { let i = Math.min(120, c.length)-1;
  for (let j=0;j<=i;j++) if (c[j][1]<=0.50) { i=j; break; } return c[i][1]*kM; };
const ms = (d) => Date.parse(d.slice(0,4)+"-"+d.slice(4,6)+"-"+d.slice(6,8));
function sinSolapar(L) { const P={}; for (const x of L) (P[x.tk+"|"+x.g]=P[x.tk+"|"+x.g]||[]).push(x);
  const o=[]; for (const k of Object.keys(P)) { let u=-1e15;
    for (const x of P[k].sort((a,b)=>a.dC.localeCompare(b.dC))) {
      const t=ms(x.dC); if (t-u < 180*86400000) continue; u=t; o.push(x); } } return o; }
const mm = (V) => V.reduce((a,b)=>a+b,0)/V.length;
function dosMuestras(A, B) {            // ¿la media de A supera a la de B?
  const ma=mm(A), mb=mm(B);
  const va=A.reduce((a,x)=>a+(x-ma)**2,0)/(A.length-1), vb=B.reduce((a,x)=>a+(x-mb)**2,0)/(B.length-1);
  return { d: ma-mb, t: (ma-mb)/Math.sqrt(va/A.length + vb/B.length) }; }

let TODO = [];
for (const [g, f] of [["27","largo-p25-d400.json"], ["A","caminos-A.json"]]) {
  process.env.CAMINOS = f;
  const M = await import("./motor-cartera.mjs?p=" + f);
  TODO = TODO.concat(M.OPS.filter((o)=>o.ma>-0.30 && o.camino && o.camino.length>=15)
    .map((o)=>({ g, tk:o.tk, dC:o.dC, ma:o.ma, m:mf(o.camino) }))); }

// ⚠️ ARREGLADO: se FILTRA y LUEGO se quitan los solapes, no al revés. Al revés un día del
//    −10% sólo contaba si el paseo lo elegía por casualidad: 20 operaciones en vez de 139.
const S = TODO;
const SS = (fl) => sinSolapar(TODO.filter(fl));
console.log("");
console.log("  ══ 27 + GRUPO A JUNTOS ══   " + TODO.length.toLocaleString("en-US") + " entradas · los solapes se quitan DENTRO de cada regla");
console.log("");
console.log("  " + "corte".padEnd(14) + "n dentro".padStart(9) + "n fuera".padStart(9) +
  "x dentro".padStart(10) + "x fuera".padStart(10) + "dif".padStart(8) + "t".padStart(7));
for (const u of [-0.02, -0.03, -0.05, -0.07, -0.10, -0.13]) {
  const A = SS((x)=>x.ma<=u).map((x)=>x.m), B = SS((x)=>x.ma>u).map((x)=>x.m);
  if (A.length < 20) { console.log("  " + ((100*u).toFixed(0)+"%").padEnd(14) + String(A.length).padStart(9) + "   (pocas)"); continue; }
  const r = dosMuestras(A,B);
  console.log("  " + ((100*u).toFixed(0)+"% o más").padEnd(14) + String(A.length).padStart(9) +
    String(B.length).padStart(9) + mm(A).toFixed(3).padStart(10) + mm(B).toFixed(3).padStart(10) +
    ((r.d>=0?"+":"")+r.d.toFixed(3)).padStart(8) + r.t.toFixed(2).padStart(7)); }

// ¿y las mitades del −10%, con la muestra doble?
const A10 = SS((x)=>x.ma<=-0.10), R10 = SS((x)=>x.ma>-0.10);
const F = A10.map((x)=>x.dC).sort(), corte = F[Math.floor(F.length/2)];
console.log("");
console.log("  ── el −10%, partido por la mitad (contra todas las demás de su mitad) ──");
for (const [et, fl] of [["1ª mitad", (x)=>x.dC<corte], ["2ª mitad", (x)=>x.dC>=corte]]) {
  const a = A10.filter(fl).map((x)=>x.m), b = R10.filter(fl).map((x)=>x.m);
  const r = dosMuestras(a,b);
  console.log("  " + et.padEnd(14) + ("n="+a.length).padStart(9) + "         " +
    mm(a).toFixed(3).padStart(10) + mm(b).toFixed(3).padStart(10) +
    ((r.d>=0?"+":"")+r.d.toFixed(3)).padStart(8) + r.t.toFixed(2).padStart(7)); }
console.log("");
console.log("  ── y por grupo, para ver si los dos apuntan igual ──");
for (const g of ["27","A"]) {
  const a = A10.filter((x)=>x.g===g).map((x)=>x.m), b = R10.filter((x)=>x.g===g).map((x)=>x.m);
  const r = dosMuestras(a,b);
  console.log("  " + ("grupo "+g).padEnd(14) + ("n="+a.length).padStart(9) + "         " +
    mm(a).toFixed(3).padStart(10) + mm(b).toFixed(3).padStart(10) +
    ((r.d>=0?"+":"")+r.d.toFixed(3)).padStart(8) + r.t.toFixed(2).padStart(7)); }
console.log("");
