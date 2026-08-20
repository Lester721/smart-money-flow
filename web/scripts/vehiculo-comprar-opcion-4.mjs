// vehiculo-comprar-opcion-4.mjs — ¿SALVA ALGO SALIR ANTES DE VENCIMIENTO?
//
// Los pases 1-3 miden comprar y AGUANTAR a vencimiento: 87,6% expiran sin valor y el cono
// (call+put, neutral a la dirección) pierde -26,8% por operación. Antes de cerrar el encargo hay
// que probar la única palanca que queda dentro de los datos que ya existen: NO aguantar.
//
// Aguantar a vencimiento tira a la basura todo el valor temporal que queda. Salir a mitad de
// camino lo cobra. Las cadenas son DIARIAS, así que el mismo contrato se puede valorar cualquier
// día posterior a su bid REAL. No hace falta ningún modelo.
//
// LA TRAMPA, y cómo se trata: el descargador descarta las filas con bid <= 0. Un contrato que
// desaparece del fichero NO es un dato que falta: es un contrato sin comprador. Se liquida a 0.
// Contarlo como "no medible" sería exactamente el sesgo de supervivencia que mató el "3,54x".

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia.ts";

const CDIR = "scripts/cache-theta/cadenas";
const CIERRES = "scripts/cache-theta/cierres";
const CUENTA = 56389;
const iso = (y) => `${y.slice(0, 4)}-${y.slice(4, 6)}-${y.slice(6, 8)}`;
const dias = (a, b) => Math.round((Date.parse(iso(b)) - Date.parse(iso(a))) / 86400000);
const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : NaN);
const sd = (v) => { if (v.length < 2) return NaN; const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const tDe = (v) => media(v) / (sd(v) / Math.sqrt(v.length));
const pctl = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };

const tickersCadena = [...new Set(readdirSync(CDIR).filter((f) => /^[A-Z]+_d\d{8}\.json$/.test(f)).map((f) => f.split("_d")[0]))].sort();
const diasCadena = {};
for (const t of tickersCadena) {
  const ds = readdirSync(CDIR).filter((f) => f.startsWith(`${t}_d2026`)).map((f) => f.slice(-13, -5)).sort().filter((d) => d >= "20260422");
  if (ds.length) diasCadena[t] = ds;
}
const cierres = {};
for (const t of Object.keys(diasCadena)) if (existsSync(`${CIERRES}/${t}.json`)) cierres[t] = JSON.parse(readFileSync(`${CIERRES}/${t}.json`, "utf8"));
const tickers = Object.keys(diasCadena).filter((t) => cierres[t]);

// caché de cadenas en memoria (son ~250 MB en total, cabe de sobra con 10 GB)
const cache = new Map();
function cadena(t, dY) {
  const k = `${t}|${dY}`;
  if (cache.has(k)) return cache.get(k);
  const p = `${CDIR}/${t}_d${dY}.json`;
  let v = null;
  if (existsSync(p)) { try { v = JSON.parse(readFileSync(p, "utf8")); } catch { v = null; } }
  cache.set(k, v);
  return v;
}

const DIST = [0.05, 0.10, 0.20], DTE = [7, 30, 90], TOL_DTE = { 7: 4, 30: 10, 90: 25 }, ULTIMO = "20260806";
// fracción del plazo que se aguanta antes de salir
const FRACCIONES = [0.25, 0.50, 0.75, 1.0];

function elegir(cad, S, dteObj, dist, tipo, hoy) {
  let mejorExp = null, mejorDD = Infinity;
  for (const exp of Object.keys(cad)) {
    const d = dias(hoy, exp); if (d < 1) continue;
    const dd = Math.abs(d - dteObj); if (dd < mejorDD) { mejorDD = dd; mejorExp = exp; }
  }
  if (!mejorExp || mejorDD > TOL_DTE[dteObj]) return null;
  const objetivo = tipo === "C" ? S * (1 + dist) : S * (1 - dist);
  let mejorK = null, mejorKD = Infinity;
  for (const clave of Object.keys(cad[mejorExp])) {
    const [ks, r] = clave.split("|"); if (r !== tipo) continue;
    const K = Number(ks), kd = Math.abs(K - objetivo);
    if (kd < mejorKD) { mejorKD = kd; mejorK = K; }
  }
  if (mejorK == null) return null;
  const distReal = tipo === "C" ? mejorK / S - 1 : 1 - mejorK / S;
  if (Math.abs(distReal - dist) > dist * 0.30) return null;
  const [bid, ask] = cad[mejorExp][`${mejorK}|${tipo}`];
  return { expiracion: mejorExp, K: mejorK, bid, ask };
}

/** Valor de liquidación de un contrato el día `salida`: su BID real, o 0 si ya no tiene comprador. */
function bidEn(t, salidaY, exp, K, tipo) {
  const cad = cadena(t, salidaY);
  if (!cad) return null;                       // no hay fichero ese día → no medible
  const v = cad?.[exp]?.[`${K}|${tipo}`];
  return v ? v[0] : 0;                          // ausente = sin comprador = 0
}

const filas = [];
let sinFicheroSalida = 0, aCero = 0, conBid = 0;

for (const t of tickers) {
  const misDias = diasCadena[t].filter((d) => d <= ULTIMO);
  const setDias = new Set(misDias);
  for (const dY of misDias) {
    const S = cierres[t][dY]; if (!(S > 0)) continue;
    const cad = cadena(t, dY); if (!cad || !Object.keys(cad).length) continue;

    for (const dte of DTE) for (const dist of DIST) {
      const c = elegir(cad, S, dte, dist, "C", dY), q = elegir(cad, S, dte, dist, "P", dY);
      if (!c || !q || c.expiracion !== q.expiracion) continue;
      if (!(c.ask > 0 && q.ask > 0 && c.bid > 0 && q.bid > 0)) continue;
      const dteReal = dias(dY, c.expiracion);
      const capital = (c.ask + q.ask) * 100;

      for (const fr of FRACCIONES) {
        let salidaY;
        if (fr === 1.0) {
          salidaY = c.expiracion;
        } else {
          // primer día de mercado con cadena a >= fr del plazo
          const objetivo = Math.round(dteReal * fr);
          salidaY = misDias.find((d) => d > dY && dias(dY, d) >= objetivo);
          if (!salidaY || salidaY > c.expiracion) continue;
        }
        let vC, vP;
        if (fr === 1.0) {
          const ST = cierres[t][c.expiracion];
          if (!(ST > 0)) continue;
          vC = Math.max(0, ST - c.K); vP = Math.max(0, q.K - ST);   // intrínseco real
        } else {
          if (!setDias.has(salidaY)) { sinFicheroSalida++; continue; }
          vC = bidEn(t, salidaY, c.expiracion, c.K, "C");
          vP = bidEn(t, salidaY, c.expiracion, q.K, "P");
          if (vC == null || vP == null) { sinFicheroSalida++; continue; }
          if (vC === 0) aCero++; else conBid++;
          if (vP === 0) aCero++; else conBid++;
        }
        filas.push({
          ticker: t, fecha: iso(dY), fechaY: dY, dist, dte, fr,
          retCono: (vC + vP) * 100 / capital - 1,
          retC: vC / c.ask - 1, retP: vP / q.ask - 1,
          capital, diasEnPos: dias(dY, salidaY),
        });
      }
    }
  }
}

console.log(`  filas: ${filas.length.toLocaleString()} · salidas anticipadas sin fichero: ${sinFicheroSalida.toLocaleString()}`);
console.log(`  patas liquidadas a CERO por no tener comprador: ${aCero.toLocaleString()} · con bid real: ${conBid.toLocaleString()} (${(100 * aCero / (aCero + conBid)).toFixed(1)}% a cero)`);
radiografia(filas, ["retCono", "capital", "diasEnPos"], "salidas anticipadas");

console.log("\n" + "═".repeat(97));
console.log("¿SALVA ALGO SALIR ANTES? — el cono (call+put), neutral a la dirección");
console.log("═".repeat(97));
console.log("  compra al ASK · venta al BID REAL del día de salida (0 si ya no tiene comprador)\n");
console.log("  dist  dte    salida     n   días en pos.   retorno del cono   t crudo   n EF   t HONESTA");
console.log("  " + "─".repeat(93));
const tabla = [];
for (const dist of DIST) for (const dte of DTE) for (const fr of FRACCIONES) {
  const g = filas.filter((f) => f.dist === dist && f.dte === dte && f.fr === fr);
  if (g.length < 20) continue;
  const r = g.map((f) => f.retCono);
  // n efectiva: una obs por fecha, y fechas separadas >= días en posición
  const porFecha = new Map();
  for (const f of g) { if (!porFecha.has(f.fechaY)) porFecha.set(f.fechaY, []); porFecha.get(f.fechaY).push(f.retCono); }
  const fechas = [...porFecha.keys()].sort();
  const paso = Math.max(1, Math.round(media(g.map((f) => f.diasEnPos))));
  const noSolap = []; let ultima = null;
  for (const d of fechas) if (ultima === null || dias(ultima, d) >= paso) { noSolap.push(media(porFecha.get(d))); ultima = d; }
  const tH = noSolap.length >= 3 ? tDe(noSolap) : NaN;
  tabla.push({ dist, dte, fr, n: g.length, ret: media(r), t: tDe(r), nEf: noSolap.length, tH, diasPos: paso,
    capital: media(g.map((f) => f.capital)) });
  console.log(`  ${(dist * 100).toFixed(0).padStart(3)}%  ${String(dte).padStart(3)}   ${(fr === 1 ? "vencim." : (fr * 100).toFixed(0) + "%").padStart(7)} ${String(g.length).padStart(6)}   ${String(paso).padStart(10)}   ` +
    `${(media(r) * 100).toFixed(1).padStart(14)}%   ${tDe(r).toFixed(2).padStart(7)}  ${String(noSolap.length).padStart(5)}   ${(Number.isFinite(tH) ? tH.toFixed(2) : "n/a").padStart(9)}`);
}

console.log("\n" + "═".repeat(97));
console.log("RESUMEN — ¿mejora salir antes?");
console.log("═".repeat(97));
console.log("  dist  dte    25%      50%      75%    vencimiento   mejor salida");
console.log("  " + "─".repeat(93));
const mejoras = [];
for (const dist of DIST) for (const dte of DTE) {
  const fs = FRACCIONES.map((fr) => tabla.find((x) => x.dist === dist && x.dte === dte && x.fr === fr));
  if (fs.some((x) => !x)) continue;
  const mejor = [...fs].sort((a, b) => b.ret - a.ret)[0];
  mejoras.push({ dist, dte, venc: fs[3].ret, mejor: mejor.ret, frMejor: mejor.fr, gana: mejor.ret - fs[3].ret });
  console.log(`  ${(dist * 100).toFixed(0).padStart(3)}%  ${String(dte).padStart(3)}  ` +
    fs.map((x) => (x.ret * 100).toFixed(1).padStart(6) + "%").join("  ") + `   ${(mejor.fr === 1 ? "vencim." : (mejor.fr * 100).toFixed(0) + "%").padStart(8)}`);
}
const gananSalirAntes = mejoras.filter((m) => m.frMejor !== 1).length;
console.log(`\n  cubos donde salir antes gana a aguantar: ${gananSalirAntes} de ${mejoras.length}`);
console.log(`  mejora media de salir en el mejor momento (con la ventaja del retrovisor): ${(media(mejoras.map((m) => m.gana)) * 100).toFixed(1)} pp`);
const mejorAbs = [...tabla].sort((a, b) => b.ret - a.ret)[0];
console.log(`  el mejor cubo de todos: ${(mejorAbs.dist * 100).toFixed(0)}% a ${mejorAbs.dte}d saliendo al ${mejorAbs.fr === 1 ? "vencimiento" : (mejorAbs.fr * 100).toFixed(0) + "%"} → ${(mejorAbs.ret * 100).toFixed(1)}% por operación`);
console.log(`  ${mejorAbs.ret < 0 ? "SIGUE SIENDO NEGATIVO: ni con el mejor momento de salida elegido a posteriori sale a cuenta." : "positivo — merece medición aparte."}`);

// dólares al año del mejor cubo
const dolarAno = mejorAbs.capital * mejorAbs.ret * (365 / mejorAbs.diasPos);
console.log(`\n  en dólares: $${mejorAbs.capital.toFixed(0)} de capital por cono · ${(365 / mejorAbs.diasPos).toFixed(1)} ciclos/año → $${dolarAno.toFixed(0)}/año por cono`);
console.log(`  sobre una cuenta de $${CUENTA.toLocaleString()} comprometiendo el 10% ($${(CUENTA * 0.1).toFixed(0)}) = ${Math.floor(CUENTA * 0.1 / mejorAbs.capital)} conos → $${(dolarAno * Math.floor(CUENTA * 0.1 / mejorAbs.capital)).toFixed(0)}/año`);

writeFileSync("scripts/vehiculo-comprar-opcion-4.json", JSON.stringify({ tabla, mejoras, aCero, conBid, filas: filas.length }, null, 1));
console.log("\n  → scripts/vehiculo-comprar-opcion-4.json");
