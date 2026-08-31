// ══ ¿QUÉ FUNCIONÓ EN LOS 27 Y SIGUE FUNCIONANDO EN EL GRUPO A? ══ Lester, 2026-08-30
//
// El nivel de CARTERA está roto para medir: con 2 huecos, dos versiones de la misma regla
// comparten 0 de 49 operaciones. Cualquier cosa que se mida ahí es el reparto de cartas.
//
// El nivel de OPERACIÓN no tiene ese problema. Cada entrada tiene su camino guardado, así que
// se puede calcular qué habría rendido SIN que el orden de llenado de huecos decida nada.
// Y el fichero guarda `ma` de TODOS los días, incluidos los que están POR ENCIMA de la media —
// que es el control que nunca hemos mirado.
//
// ⚠️ Las entradas se solapan (mismo ticker, días consecutivos), así que el número de
//    observaciones INDEPENDIENTES es mucho menor. Se reporta también contando una por
//    ticker-mes, que es la unidad honesta.
const CAST = 0.0138, kM = (1 - CAST/2) / (1 + CAST/2);
const AGUANTE = 120, SUELO = 0.50;

function multFinal(cam) {                     // la regla congelada: 120 sesiones, suelo 0,50x
  let iFin = Math.min(AGUANTE, cam.length) - 1;
  for (let j = 0; j <= iFin; j++) if (cam[j][1] <= SUELO) { iFin = j; break; }
  return cam[iFin][1] * kM; }

const BUCKETS = [[-0.30,-0.10,"10% o más abajo"],[-0.10,-0.05,"5% a 10% abajo"],
  [-0.05,-0.02,"2% a 5% abajo"],[-0.02,0,"0% a 2% abajo"],
  [0,0.02,"0% a 2% ARRIBA"],[0.02,0.05,"2% a 5% ARRIBA"],[0.05,99,"5%+ ARRIBA"]];

for (const [n, f] of [["los 27 PUBLICADOS","largo-p25-d400.json"],
                      ["GRUPO A (fuera de muestra)","caminos-A.json"]]) {
  process.env.CAMINOS = f;
  const M = await import("./motor-cartera.mjs?w=" + f);
  const D = M.OPS.filter((o) => o.ma > -0.30 && o.camino && o.camino.length >= 15)
                 .map((o) => ({ ma: o.ma, m: multFinal(o.camino), tk: o.tk, ym: o.dC.slice(0,6) }));
  const todo = D.reduce((a,x) => a + x.m, 0) / D.length;
  console.log("");
  console.log("  ══ " + n + " ══   " + D.length.toLocaleString("en-US") + " entradas");
  console.log("  " + "dónde está la acción vs su media".padEnd(26) + "n".padStart(8) +
    "indep.".padStart(8) + "x medio".padStart(10) + "gana".padStart(8) + "  vs. la media de todas");
  for (const [lo, hi, et] of BUCKETS) {
    const L = D.filter((x) => x.ma >= lo && x.ma < hi);
    if (L.length < 30) { console.log("  " + et.padEnd(26) + String(L.length).padStart(8) + "   (pocas)"); continue; }
    const mm = L.reduce((a,x) => a + x.m, 0) / L.length;
    const ind = new Set(L.map((x) => x.tk + x.ym)).size;
    const gan = 100 * L.filter((x) => x.m > 1).length / L.length;
    const d = mm - todo;
    console.log("  " + et.padEnd(26) + String(L.length).padStart(8) + String(ind).padStart(8) +
      mm.toFixed(3).padStart(10) + (gan.toFixed(0)+"%").padStart(8) +
      "   " + (d >= 0 ? "+" : "") + d.toFixed(3)); }
  console.log("  " + "TODAS juntas".padEnd(26) + String(D.length).padStart(8) +
    String(new Set(D.map((x) => x.tk + x.ym)).size).padStart(8) + todo.toFixed(3).padStart(10));
}
console.log("");
