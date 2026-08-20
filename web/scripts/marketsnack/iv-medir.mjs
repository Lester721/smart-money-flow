// MEDIR EL INGREDIENTE "VOLATILIDAD IMPLÍCITA DEL FLUJO".
//
// Cuatro métricas por (root, día), todas con datos anteriores a las 19:00Z (15:00 ET):
//   ivPond     — IV media ponderada por prima
//   ivZ        — la misma, en desviaciones típicas contra SUS 20 días ANTERIORES
//   ivSkew     — IV de lo comprado (agresión al ASK) menos IV de lo vendido (agresión al BID)
//   ivSkewRel  — lo mismo, dividido por el nivel de IV del día
// Contra el retorno del subyacente desde el CIERRE de D a 1, 5 y 20 días. 4×3 = 12 pruebas.
import { readFileSync, writeFileSync } from "node:fs";
import { pasarBarrera, informe, listonT, tWelch, potencia } from "../../lib/barreraHallazgos";
import { radiografia } from "../../lib/radiografia";

const PRUEBAS = 12;
const MIN_ROOTS_DIA = 20;
const P = JSON.parse(readFileSync("scripts/cache-theta/marketsnack/iv-panel.json","utf8"));

console.log(`panel: ${P.length} filas · ${new Set(P.map(f=>f.root)).size} roots · ${new Set(P.map(f=>f.fecha)).size} días`);
radiografia(P, ["ivPond","ivSkew","ivSkewRel","nOps","primaTotal","ret1"], "panel IV (todas las filas)");
radiografia(P.filter(f=>f.ivZ!=null&&f.ret20!=null), ["ivZ","ret20"], "panel IV (subconjunto con ivZ y ret20)");

const media = v => v.reduce((a,x)=>a+x,0)/v.length;

/** Rango percentil DENTRO de cada día. El movimiento del mercado se cancela solo. */
function transversal(filas, campo, horizonte) {
  const val = filas.filter(f => f[campo]!=null && Number.isFinite(f[campo]) && f["ret"+horizonte]!=null);
  const porDia = new Map();
  for (const f of val) { if(!porDia.has(f.fecha)) porDia.set(f.fecha,[]); porDia.get(f.fecha).push(f); }
  const out = [];
  for (const [fecha, g] of porDia) {
    if (g.length < MIN_ROOTS_DIA) continue;
    const ord = [...g].sort((a,b)=>a[campo]-b[campo]);
    ord.forEach((f,i)=> out.push({ pnl: f["ret"+horizonte], ticker: f.root, fecha,
                                   rango: g.length>1 ? i/(g.length-1) : 0.5, valor: f[campo] }));
  }
  return out;
}

const resultados = [];
for (const campo of ["ivPond","ivZ","ivSkew","ivSkewRel"]) {
  for (const h of [1,5,20]) {
    const filas = transversal(P, campo, h);
    if (filas.length < 50) { console.log(`\n${campo} @${h}d — sólo ${filas.length} filas, no se mide`); continue; }
    const v = pasarBarrera(filas, f=>f.rango, { pruebas: PRUEBAS, nMinimo: 200, maxPorTicker: 0.2 });
    // medias explícitas de cada tercio, para poder hablar en dinero
    const ord = [...filas].sort((a,b)=>b.rango-a.rango);
    const k = Math.floor(ord.length/3);
    const alto = ord.slice(0,k).map(f=>f.pnl), bajo = ord.slice(-k).map(f=>f.pnl);
    const pot = potencia(filas, 0.005);
    console.log(`\n${"═".repeat(78)}\n${campo} → retorno a ${h} día(s) · n=${filas.length} · días=${new Set(filas.map(f=>f.fecha)).size}`);
    console.log(`  tercio ALTO ${(100*media(alto)).toFixed(3)}%   tercio BAJO ${(100*media(bajo)).toFixed(3)}%   separación ${(100*(media(alto)-media(bajo))).toFixed(3)} pts   t=${tWelch(alto,bajo).toFixed(2)} (listón ${listonT(PRUEBAS)})`);
    console.log(informe(v, `${campo} @ ${h}d`));
    console.log(`  potencia: ${pot.mensaje}`);
    resultados.push({ campo, h, n: filas.length, dias: new Set(filas.map(f=>f.fecha)).size,
      alto: media(alto), bajo: media(bajo), sep: media(alto)-media(bajo), t: tWelch(alto,bajo),
      pasa: v.pasa, motivos: v.motivos, tercios: v.detalle.tercios, detectable: pot.detectable });
  }
}
writeFileSync("scripts/cache-theta/marketsnack/iv-resultados.json", JSON.stringify(resultados,null,1));
console.log(`\n${"═".repeat(78)}\nRESUMEN (listón t=${listonT(PRUEBAS)} para ${PRUEBAS} pruebas)`);
console.log("campo      h    n     sep(pts)      t     pasa");
for (const r of resultados)
  console.log(`${r.campo.padEnd(10)} ${String(r.h).padStart(2)} ${String(r.n).padStart(5)} ${(100*r.sep).toFixed(3).padStart(9)} ${r.t.toFixed(2).padStart(7)}   ${r.pasa?"SÍ":"no"}`);
