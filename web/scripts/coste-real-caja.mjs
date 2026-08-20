// COSTE-REAL · paso 2 — la caja de Lester, día a día, 1.121 días.
//
// CUENTA (hoy): $56.389 en total · $7.977 EN EFECTIVO · 500 HOOD ≈ $48.412 · poder de compra
// $73.874 · interés de margen 5%. El colateral sale del poder de compra; LAS PÉRDIDAS DEL EFECTIVO.
//
// SUPUESTOS, dichos en voz alta porque cambian el resultado:
//  · HOOD se mantiene FIJO en $48.412 los 4,5 años. Es FALSO y es OPTIMISTA: en 2022 HOOD valía
//    ~$10 y la cuenta habría sido mucho más pequeña justo en el año que más duele.
//  · La liquidación del SPX es T+1; aquí se apunta el mismo día (diferencia < $10 de interés).
//  · No se acredita el 4% que Robinhood Gold paga por el efectivo ocioso (sería a favor de Lester).
//  · Interés 5%/360 sobre el saldo prestado, TODOS los días naturales (también fines de semana).

import { readFileSync } from "node:fs";
const F = JSON.parse(readFileSync("scripts/coste-real-base.json","utf8")).sort((a,b)=>a.fecha.localeCompare(b.fecha));

export const EFECTIVO0 = 7977, PC0 = 73874, HOOD = 48412, TASA = 0.05, COLAT = 5000;
const eur = x => (x==null||!isFinite(x)?"—":(x<0?"−":"")+"$"+Math.abs(Math.round(x)).toLocaleString("es-ES"));
const dias = (a,b) => Math.round((Date.parse(b)-Date.parse(a))/86400000);

/**
 * Simula la caja con N contratos fijos.
 * @param mantenimiento  tasa de mantenimiento que Robinhood exige sobre HOOD (0,25 / 0,30 / 0,35)
 * @param lambda         cuántos $ de poder de compra se pierden por cada $ de patrimonio perdido
 */
export function simular(filas, N, { mantenimiento = 0.30, lambda = 1.31, reactivo = false } = {}) {
  let efectivo = EFECTIVO0, interes = 0, pico = 0, acum = 0, ddPeor = 0;
  let sinEfectivo = null, llamada = null, maxPrestado = 0, diasSinPoder = 0, operados = 0;
  const serie = [];
  // línea de llamada de margen: patrimonio/HOOD < mantenimiento  ⇔  efectivo < HOOD*(m-1)
  const lineaLlamada = HOOD * (mantenimiento - 1);

  for (let i = 0; i < filas.length; i++) {
    const f = filas[i];
    // interés de los días naturales transcurridos desde la sesión anterior
    if (i > 0 && efectivo < 0) {
      const d = dias(filas[i-1].fecha, f.fecha);
      const c = (-efectivo) * TASA / 360 * d;
      interes += c; efectivo -= c;
    }
    if (efectivo < 0) maxPrestado = Math.max(maxPrestado, -efectivo);

    // ¿ya hay llamada de margen? Robinhood vende HOOD y se acabó la simulación
    if (efectivo < lineaLlamada) { llamada ??= f.fecha; break; }

    // poder de compra disponible a las 11:00
    const pc = PC0 + lambda * (efectivo - EFECTIVO0);
    let n = N;
    if (reactivo) n = Math.max(0, Math.min(N, Math.floor(pc / COLAT)));
    if (n * COLAT > pc) { diasSinPoder++; serie.push({ fecha: f.fecha, pl: 0, efectivo, n: 0 }); continue; }
    if (n === 0) { diasSinPoder++; serie.push({ fecha: f.fecha, pl: 0, efectivo, n: 0 }); continue; }

    const pl = n * f.pl;
    efectivo += pl; operados++;
    acum += pl; if (acum > pico) pico = acum; ddPeor = Math.min(ddPeor, acum - pico);
    if (efectivo < 0 && !sinEfectivo) sinEfectivo = f.fecha;
    if (efectivo < 0) maxPrestado = Math.max(maxPrestado, -efectivo);
    serie.push({ fecha: f.fecha, pl, efectivo, n });
  }
  const anos = (dias(filas[0].fecha, filas[filas.length-1].fecha)) / 365.25;
  const bruto = acum, neto = acum - interes;
  return { N, n: serie.length, operados, bruto, interes, neto, alAno: neto/anos, anos,
           efectivoFinal: efectivo, sinEfectivo, llamada, maxPrestado, ddPeor, diasSinPoder, serie,
           lineaLlamada };
}

export { F, eur, dias };

if (process.argv[1].endsWith("coste-real-caja.mjs")) {
  console.log(`\n═══ LA CAJA REAL · ${F.length} días (${F[0].fecha} → ${F[F.length-1].fecha}) · en ORDEN, empezando por 2022 ═══`);
  console.log(`línea de llamada de margen (mantenimiento 30% sobre HOOD): efectivo por debajo de ${eur(HOOD*(0.30-1))}\n`);
  console.log("| contratos | días operados | bruto | interés | NETO | neto $/año | %/año s/$56.389 | 1er día sin efectivo | préstamo máx | peor racha | LLAMADA DE MARGEN |");
  console.log("|---|---|---|---|---|---|---|---|---|---|---|");
  for (const N of [1,2,3,4,5,6,8,10,14]) {
    const r = simular(F, N);
    console.log(`| ${N} | ${r.operados} | ${eur(r.bruto)} | ${eur(-r.interes)} | ${eur(r.neto)} | ${eur(r.alAno)} | ${(r.alAno/56389*100).toFixed(1)}% | ${r.sinEfectivo ?? "nunca"} | ${eur(r.maxPrestado)} | ${eur(r.ddPeor)} | ${r.llamada ? "**"+r.llamada+"**" : "no"} |`);
  }

  console.log(`\n─── sensibilidad al mantenimiento que Robinhood exija sobre HOOD (no es observable en mis datos) ───`);
  console.log("| contratos | m=25% | m=30% | m=35% | m=50% |");
  console.log("|---|---|---|---|---|");
  for (const N of [1,2,3,4,5]) {
    const c = [0.25,0.30,0.35,0.50].map(m => simular(F,N,{mantenimiento:m}).llamada ?? "sobrevive");
    console.log(`| ${N} | ${c.join(" | ")} |`);
  }

  console.log(`\n─── sensibilidad a λ (poder de compra que se pierde por cada $ de patrimonio) ───`);
  console.log("| contratos | λ=1,0 días sin poder | λ=1,31 | λ=2,0 |");
  console.log("|---|---|---|---|");
  for (const N of [1,2,3,4,5,8]) {
    const c = [1.0,1.31,2.0].map(l => { const r = simular(F,N,{lambda:l}); return `${r.diasSinPoder}`; });
    console.log(`| ${N} | ${c.join(" | ")} |`);
  }
}
