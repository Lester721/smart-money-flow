// SPY · PASO 5 — el puente B da positivo: el ANCHO entre muros anticipa el rango del día
// (corr 0,47, y aguanta en las dos mitades). Antes de llamarlo hallazgo hay que descartar lo
// obvio: la gamma se calcula CON la IV de la cadena, así que el ancho podría ser sólo la IV
// disfrazada. Si lo es, no es un descubrimiento: es "la volatilidad implícita predice la
// realizada", que se sabe desde hace treinta años y NO es lo que dice Victor.
//
// Proxy de IV del día, sin estimar nada: la prima ATM real de las 09:35 (punto medio de la call
// en el dinero) dividida entre el precio. Está en gex-niveles.json, medida, no modelada.
import { readFileSync } from "node:fs";
const N = JSON.parse(readFileSync("scripts/gex-niveles.json", "utf8"));
const S = JSON.parse(readFileSync("scripts/spy-dias.json", "utf8"));
const porFecha = new Map(N.filas.map((f) => [f.fecha, f]));

const media = (v) => v.reduce((a, b) => a + b, 0) / v.length;
function corr(x, y) { const mx = media(x), my = media(y); let a = 0, b = 0, c = 0;
  for (let i = 0; i < x.length; i++) { const u = x[i] - mx, v = y[i] - my; a += u * v; b += u * u; c += v * v; } return a / Math.sqrt(b * c); }
const reg = (yy, xx) => { const mx = media(xx), my = media(yy); let sxy = 0, sxx = 0;
  for (let i = 0; i < xx.length; i++) { sxy += (xx[i] - mx) * (yy[i] - my); sxx += (xx[i] - mx) ** 2; }
  const b = sxy / sxx; return yy.map((z, i) => z - (my + b * (xx[i] - mx))); };

const filas = [];
for (const d of S.dias) {
  const f = porFecha.get(d.fecha);
  const c = f?.peaje?.callATM;
  if (!c || !(c.ask > 0)) continue;
  const primaPct = (((c.bid + c.ask) / 2) / f.apertura) * 100;      // prima ATM en % del índice = proxy de IV
  filas.push({
    fecha: d.fecha,
    primaPct,
    anchoGamD: d.niv.gamD.muroCall != null && d.niv.gamD.muroPut != null ? ((d.niv.gamD.muroCall - d.niv.gamD.muroPut) / d.entrada) * 100 : null,
    dCallGam: d.niv.gam.muroCall != null ? Math.abs((d.niv.gam.muroCall - d.entrada) / d.entrada) * 100 : null,
    rango: ((d.max - d.min) / d.entrada) * 100,
  });
}
const ok = filas.filter((f) => f.anchoGamD != null && f.dCallGam != null && Number.isFinite(f.primaPct));
console.log(`\n╔══ ¿ES EL ANCHO DE LOS MUROS SÓLO LA IV DISFRAZADA? ══╗`);
console.log(`  ${ok.length} días con prima ATM real de las 09:35 (bid/ask del fichero, no modelo)\n`);

const y = ok.map((f) => f.rango), iv = ok.map((f) => f.primaPct);
const anc = ok.map((f) => f.anchoGamD), dca = ok.map((f) => f.dCallGam);
console.log(`  corr(prima ATM, rango del día)      ${corr(iv, y).toFixed(3)}   ← el predictor CONOCIDO`);
console.log(`  corr(ancho gamD,  rango del día)    ${corr(anc, y).toFixed(3)}`);
console.log(`  corr(dist. muro call gam, rango)    ${corr(dca, y).toFixed(3)}`);
console.log(`  corr(prima ATM, ancho gamD)         ${corr(iv, anc).toFixed(3)}   ← si es alta, el ancho ES la IV`);
console.log(`  corr(prima ATM, dist. muro gam)     ${corr(iv, dca).toFixed(3)}\n`);
console.log(`  LO QUE DECIDE — ¿queda algo del ancho cuando ya se conoce la prima ATM?`);
console.log(`    correlación parcial (ancho gamD ⟂ rango | prima ATM)  ${corr(reg(anc, iv), reg(y, iv)).toFixed(3)}`);
console.log(`    correlación parcial (muro gam  ⟂ rango | prima ATM)   ${corr(reg(dca, iv), reg(y, iv)).toFixed(3)}`);
