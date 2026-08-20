// ═══════════════════════════════════════════════════════════════════════════════════════════
// RESPETAR · IMANES (3) — el único subgrupo con pulso, contra el cruce y contra el vehículo
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/iman-4-regimen.mjs
//
// ═══ QUÉ QUEDA VIVO DESPUÉS DE iman-3 ══════════════════════════════════════════════════════
// Nada en ACERCAMIENTO (t máx 1,23), nada en FIJACIÓN (t máx 1,63), nada en TOQUE salvo un
// signo NEGATIVO (el precio evita el strike de máxima gamma, t=−2,45). En DIRECCIÓN, un solo
// hueco: gamD.imanNeto acierta el lado el 55,4% cuando la gamma neta es NEGATIVA (z=3,01 contra
// la propia deriva de ese subgrupo) y el 51,8% cuando es positiva (z=−0,03).
//
// ═══ POR QUÉ ESE HALLAZGO ES SOSPECHOSO ANTES DE MEDIRLO ═══════════════════════════════════
//  1) Sale INVERTIDO respecto a la hipótesis. La historia del imán dice que el creador PINCHA el
//     precio cuando está LARGO de gamma (γ>0). Aquí el efecto está entero en γ<0, donde la teoría
//     dice que amplifica, no que atrae. Es la tercera vez en este proyecto que un hallazgo de GEX
//     sale del revés; eso es la firma de haber buscado, no de haber encontrado.
//  2) Es un subgrupo elegido DESPUÉS de mirar. z=3,01 en uno de doce cortes no es z=3,01.
//  3) Los años del candidato decaen: +4,4 · +3,6 · +3,0 · −0,1 · +1,6 puntos porcentuales.
//
// Así que se le aplican las dos pruebas que deciden:
//   · EL CRUCE: elegir en 2022-2023 y probar en 2024-2026, y AL REVÉS.
//   · EL VEHÍCULO: dinero real con la horquilla real, en los dos vehículos que Lester tiene.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync } from "node:fs";

const ENTRADA = "scripts/gex-niveles.json";
const SALIDA  = "scripts/iman-4-resultado.json";
const CUENTA  = 56389;
const SORTEOS = 500;
const LISTON  = 3.08;   // mismo listón declarado: 24 pruebas

const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : NaN);
const varianza = (v) => { if (v.length < 2) return NaN; const m = media(v); return v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1); };
const sd = (v) => Math.sqrt(varianza(v));
const pct = (v, p) => { if (!v.length) return NaN; const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))]; };
const mediana = (v) => pct(v, 50);
function tPareada(d) { if (d.length < 3) return { t: NaN, m: NaN, n: d.length }; const m = media(d), s = sd(d); return { t: s > 0 ? m / (s / Math.sqrt(d.length)) : NaN, m, n: d.length }; }
function rng(s0) { let a = s0 >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const percentilEnNube = (r, n) => +(100 * n.filter((x) => x < r).length / n.length).toFixed(1);
function exigir(c, m) { if (!c) throw new Error(`FALLO CERRADO: ${m}`); }

const J = JSON.parse(readFileSync(ENTRADA, "utf8"));
const CAND = "gamD.imanNeto";
const D = [];
for (const f of J.filas) {
  const c = f.peaje.callATM, p = f.peaje.putATM;
  if (!(f.apertura > 0) || !(f.cierre > 0) || !c || !p || !(c.bid > 0) || !(p.bid > 0)) continue;
  const K = f.niveles.gamD?.imanNeto; if (!(K > 0)) continue;
  const straddlePts = (c.bid + c.ask) / 2 + (p.bid + p.ask) / 2; if (!(straddlePts > 2)) continue;
  D.push({ fecha: f.fecha, ano: +f.fecha.slice(0, 4), ap: f.apertura, ci: f.cierre, iman: K,
    lado: Math.sign(K - f.apertura), straddlePts, netPunto: f.niveles.gam?.netPunto ?? null,
    callATM: c, putATM: p, spy: f.spy || null });
}
console.log("\n" + "═".repeat(95));
console.log("RESPETAR · IMANES (3) — el subgrupo γ<0 contra el cruce y contra el vehículo");
console.log("═".repeat(95));
console.log(`   ${D.length} días · candidato ${CAND} · listón |t|/|z| ≥ ${LISTON}`);

// radiografía mínima del campo que define el subgrupo
const netVivos = D.map((d) => d.netPunto).filter((x) => x != null && Number.isFinite(x));
exigir(netVivos.length === D.length, `netPunto muerto en ${D.length - netVivos.length} días`);
exigir(sd(netVivos) > 0, "netPunto constante");
console.log(`   netPunto ($/pt): p05 ${pct(netVivos, 5).toExponential(2)} · p50 ${mediana(netVivos).toExponential(2)} · p95 ${pct(netVivos, 95).toExponential(2)} · sin nulos`);

// ═══ 1 · EL CRUCE, en las DOS direcciones ═══════════════════════════════════════════════════
// El umbral que se "elige" es netPunto < 0. Se comprueba que se elegiría igual en cada mitad
// (es decir: que la mitad de entrenamiento REALMENTE señala ese lado) y luego se aplica a la otra.
function direccionContraDeriva(filas, semilla) {
  const rnd = rng(semilla);
  const signos = filas.map((d) => d.lado).filter((s) => s !== 0);
  let ac = 0, n = 0;
  for (const d of filas) { const sC = Math.sign(d.ci - d.ap); if (sC === 0 || d.lado === 0) continue; n++; if (d.lado === sC) ac++; }
  const nube = [];
  for (let s = 0; s < SORTEOS; s++) {
    let a = 0, m = 0;
    for (const d of filas) { const sC = Math.sign(d.ci - d.ap); if (sC === 0) continue; m++; if (signos[Math.floor(rnd() * signos.length)] === sC) a++; }
    nube.push(100 * a / m);
  }
  const real = 100 * ac / n, azar = media(nube);
  return { real, azar, ventaja: real - azar, z: (real - azar) / sd(nube), pctil: percentilEnNube(real, nube), n };
}

const A = D.filter((d) => d.ano <= 2023), B = D.filter((d) => d.ano >= 2024);
const Aneg = A.filter((d) => d.netPunto < 0), Bneg = B.filter((d) => d.netPunto < 0);
const Apos = A.filter((d) => d.netPunto > 0), Bpos = B.filter((d) => d.netPunto > 0);

console.log(`\n## 1 · EL CRUCE — elegir en una mitad, probar en la otra`);
console.log(`\n   ENTRENA en 2022-2023 (n=${A.length}) → ¿qué diría?`);
const eAneg = direccionContraDeriva(Aneg, 991), eApos = direccionContraDeriva(Apos, 992);
console.log(`      γ<0: acierto ${eAneg.real.toFixed(1)}% vs deriva ${eAneg.azar.toFixed(1)}% → ventaja ${eAneg.ventaja.toFixed(1)} pp (z=${eAneg.z.toFixed(2)}, n=${eAneg.n})`);
console.log(`      γ>0: acierto ${eApos.real.toFixed(1)}% vs deriva ${eApos.azar.toFixed(1)}% → ventaja ${eApos.ventaja.toFixed(1)} pp (z=${eApos.z.toFixed(2)}, n=${eApos.n})`);
const eligeA = eAneg.ventaja > eApos.ventaja ? "γ<0" : "γ>0";
console.log(`      → 2022-2023 elegiría: ${eligeA}`);
console.log(`\n   PRUEBA en 2024-2026 (n=${B.length}):`);
const pBneg = direccionContraDeriva(Bneg, 993), pBpos = direccionContraDeriva(Bpos, 994);
console.log(`      γ<0: acierto ${pBneg.real.toFixed(1)}% vs deriva ${pBneg.azar.toFixed(1)}% → ventaja ${pBneg.ventaja.toFixed(1)} pp (z=${pBneg.z.toFixed(2)}, n=${pBneg.n})`);
console.log(`      γ>0: acierto ${pBpos.real.toFixed(1)}% vs deriva ${pBpos.azar.toFixed(1)}% → ventaja ${pBpos.ventaja.toFixed(1)} pp (z=${pBpos.z.toFixed(2)}, n=${pBpos.n})`);
const aciertoFueraA = eligeA === "γ<0" ? pBneg : pBpos;

console.log(`\n   Y AL REVÉS — entrena en 2024-2026:`);
console.log(`      γ<0: ventaja ${pBneg.ventaja.toFixed(1)} pp (z=${pBneg.z.toFixed(2)}) · γ>0: ventaja ${pBpos.ventaja.toFixed(1)} pp (z=${pBpos.z.toFixed(2)})`);
const eligeB = pBneg.ventaja > pBpos.ventaja ? "γ<0" : "γ>0";
console.log(`      → 2024-2026 elegiría: ${eligeB}`);
console.log(`   PRUEBA en 2022-2023:`);
console.log(`      γ<0: ventaja ${eAneg.ventaja.toFixed(1)} pp (z=${eAneg.z.toFixed(2)}) · γ>0: ventaja ${eApos.ventaja.toFixed(1)} pp (z=${eApos.z.toFixed(2)})`);
const aciertoFueraB = eligeB === "γ<0" ? eAneg : eApos;

const mismaEleccion = eligeA === eligeB;
const sobreviveCruce = mismaEleccion && aciertoFueraA.ventaja > 0 && aciertoFueraB.ventaja > 0 &&
  Math.abs(aciertoFueraA.z) >= 2 && Math.abs(aciertoFueraB.z) >= 2;
console.log(`\n   ¿Las dos mitades eligen lo mismo? ${mismaEleccion ? "SÍ (" + eligeA + ")" : "NO (" + eligeA + " vs " + eligeB + ")"}`);
console.log(`   ¿Sobrevive al cruce (ventaja >0 y |z|≥2 en las DOS pruebas fuera de muestra)? ${sobreviveCruce ? "SÍ" : "NO"}`);

// ═══ 2 · ¿DE DÓNDE SALE? — la cola manda ════════════════════════════════════════════════════
console.log(`\n## 2 · ¿LO SOSTIENEN TODOS LOS DÍAS O CUATRO DÍAS GRANDES?`);
const NEG = D.filter((d) => d.netPunto < 0);
const ptsNeg = NEG.map((d) => d.lado * (d.ci - d.ap)).filter((x) => Number.isFinite(x));
const orden = [...ptsNeg].sort((a, b) => b - a);
const total = ptsNeg.reduce((a, x) => a + x, 0);
const top5 = orden.slice(0, 5).reduce((a, x) => a + x, 0);
const top20 = orden.slice(0, 20).reduce((a, x) => a + x, 0);
console.log(`   γ<0: n=${ptsNeg.length} · total ${total.toFixed(0)} pts · media ${media(ptsNeg).toFixed(2)} · MEDIANA ${mediana(ptsNeg).toFixed(2)} · t=${tPareada(ptsNeg).t.toFixed(2)}`);
console.log(`   los 5 mejores días aportan ${top5.toFixed(0)} pts = ${(100 * top5 / total).toFixed(0)}% del total`);
console.log(`   los 20 mejores días aportan ${top20.toFixed(0)} pts = ${(100 * top20 / total).toFixed(0)}% del total`);
console.log(`   sin los 20 mejores: media ${((total - top20) / (ptsNeg.length - 20)).toFixed(2)} pts/día`);

// ═══ 3 · EL VEHÍCULO — dinero real con horquilla real ═══════════════════════════════════════
console.log(`\n## 3 · EL VEHÍCULO — ¿queda algo después del peaje?`);

// (a) SPY en acciones: horquilla de un céntimo sobre ~$500. Sin apalancamiento.
// Se convierte el movimiento de SPX a % y se cobra la horquilla de SPY de ida y vuelta.
const conSpy = NEG.filter((d) => d.spy && d.spy.apertura > 0 && d.spy.cierre > 0);
console.log(`\n   (a) SPY en ACCIONES — ${conSpy.length} de ${NEG.length} días γ<0 tienen SPY en caché (los demás NO se rellenan)`);
if (conSpy.length > 100) {
  const HORQ_SPY = 0.01;   // un céntimo, medido de verdad en SPY
  const retSpy = conSpy.map((d) => {
    const bruto = d.lado * (d.spy.cierre - d.spy.apertura);
    const neto = bruto - HORQ_SPY;              // entrar al ask, salir al bid: un céntimo redondo
    return neto / d.spy.apertura;
  });
  const t = tPareada(retSpy);
  const diasAno = 252 * (NEG.length / D.length);
  const anual = t.m * diasAno * CUENTA;
  console.log(`      retorno neto medio ${(100 * t.m).toFixed(4)}%/día · t=${t.t.toFixed(2)} · mediana ${(100 * mediana(retSpy)).toFixed(4)}%`);
  console.log(`      días γ<0 al año: ${diasAno.toFixed(0)} → $${anual.toFixed(0)}/año sobre $${CUENTA.toLocaleString("es-ES")} (todo el capital, sin apalancar)`);
  console.log(`      peor día: ${(100 * Math.min(...retSpy)).toFixed(2)}% = $${(Math.min(...retSpy) * CUENTA).toFixed(0)}`);
  var RES_SPY = { n: conSpy.length, retDia: t.m, t: t.t, diasAno, anual, peorDia: Math.min(...retSpy) * CUENTA };
} else { console.log(`      NO se mide: sólo ${conSpy.length} días con SPY en caché.`); var RES_SPY = null; }

// (b) SPXW 0DTE comprando la opción ATM del lado del imán, al ASK, y cerrando al BID.
// No hay precio de cierre de la opción en el fichero, así que NO se inventa: se calcula el valor
// intrínseco al cierre (la opción 0DTE vence hoy, su valor final ES el intrínseco: dato exacto,
// no modelo) y se le resta el ask pagado. La única suposición es que se aguanta a vencimiento,
// que es lo que hace el intrínseco exacto en vez de un precio modelado.
console.log(`\n   (b) SPXW 0DTE — comprar la ATM del lado del imán al ASK, dejarla vencer (intrínseco exacto, sin modelo)`);
const pnlOpc = [], costes = [];
for (const d of NEG) {
  if (d.lado === 0) continue;
  const o = d.lado > 0 ? d.callATM : d.putATM;
  if (!o || !(o.ask > 0) || !(o.K > 0)) continue;
  const intrinseco = d.lado > 0 ? Math.max(0, d.ci - o.K) : Math.max(0, o.K - d.ci);
  pnlOpc.push((intrinseco - o.ask) * 100);       // un contrato = 100 × puntos
  costes.push(o.ask * 100);
}
const tO = tPareada(pnlOpc);
const diasAnoNeg = 252 * (NEG.length / D.length);
console.log(`      n=${pnlOpc.length} · coste medio del billete $${media(costes).toFixed(0)} · P&L medio $${tO.m.toFixed(2)}/contrato · t=${tO.t.toFixed(2)}`);
console.log(`      sobre el riesgo: ${(100 * tO.m / media(costes)).toFixed(2)}% por operación · mediana $${mediana(pnlOpc).toFixed(0)}`);
console.log(`      con 1 contrato al día: $${(tO.m * diasAnoNeg).toFixed(0)}/año · efectivo libre $7.977 aguanta ${Math.floor(7977 / media(costes))} contratos`);
console.log(`      horquilla ATM real de esos días: p50 ${mediana(NEG.map((d) => (d.lado > 0 ? d.callATM : d.putATM).horquillaPct).filter(Number.isFinite)).toFixed(2)}% de la prima`);

// ═══ 4 · ¿QUÉ LE FALTARÍA? ══════════════════════════════════════════════════════════════════
console.log(`\n## 4 · QUÉ LE FALTARÍA — los números del puente`);
const nNeg = NEG.length;
// para que la dirección pase el listón z≥3.08 contra su propia deriva en AMBAS mitades:
const sdProp = Math.sqrt(0.25 / Math.min(Aneg.length, Bneg.length)) * 100;
console.log(`   · La mitad más corta del subgrupo tiene n=${Math.min(Aneg.length, Bneg.length)}. Para que el acierto direccional`);
console.log(`     supere z=${LISTON} en ESA mitad hace falta una ventaja de ${(LISTON * sdProp).toFixed(1)} puntos porcentuales sobre la deriva.`);
console.log(`     Observado fuera de muestra: ${aciertoFueraA.ventaja.toFixed(1)} pp. Falta ×${(LISTON * sdProp / Math.max(0.1, aciertoFueraA.ventaja)).toFixed(1)}.`);
console.log(`   · Con n=${nNeg} días γ<0 en los 4 años y medio, el efecto más pequeño detectable a z=${LISTON} es`);
console.log(`     ${(LISTON * Math.sqrt(0.25 / nNeg) * 100).toFixed(1)} pp de acierto. Un imán que tirase de verdad daría bastante más que eso.`);
const sdPts = sd(ptsNeg);
console.log(`   · En puntos: la desviación diaria del subgrupo es ${sdPts.toFixed(1)} pts. Para t=${LISTON} con n=${nNeg} haría falta`);
console.log(`     una media de ${(LISTON * sdPts / Math.sqrt(nNeg)).toFixed(2)} pts/día. Observada: ${media(ptsNeg).toFixed(2)} pts/día.`);
console.log(`   · Para que la opción 0DTE lo pague, el movimiento a favor tiene que superar la prima ATM,`);
console.log(`     mediana $${(mediana(costes) / 100).toFixed(1)} puntos. El |movimiento| mediano del día es ${mediana(D.map((d) => Math.abs(d.ci - d.ap))).toFixed(1)} pts:`);
console.log(`     comprar la ATM y aguantar pierde por construcción salvo que el acierto direccional sea muy alto.`);

console.log(`\n${"═".repeat(95)}`);
console.log(`## 5 · VEREDICTO DEL SUBGRUPO`);
console.log("═".repeat(95));
console.log(`   misma elección en las dos mitades: ${mismaEleccion ? "SÍ" : "NO"}`);
console.log(`   sobrevive al cruce: ${sobreviveCruce ? "SÍ" : "NO"}`);
console.log(`   dinero en SPY: ${RES_SPY ? "$" + RES_SPY.anual.toFixed(0) + "/año (t=" + RES_SPY.t.toFixed(2) + ")" : "no medible"}`);
console.log(`   dinero en SPXW 0DTE: $${(tO.m * diasAnoNeg).toFixed(0)}/año con 1 contrato (t=${tO.t.toFixed(2)})`);

writeFileSync(SALIDA, JSON.stringify({ generado: new Date().toISOString(), candidato: CAND, n: D.length,
  cruce: { eligeA, eligeB, mismaEleccion, sobreviveCruce, fueraA: aciertoFueraA, fueraB: aciertoFueraB,
    Aneg: eAneg, Apos: eApos, Bneg: pBneg, Bpos: pBpos },
  cola: { n: ptsNeg.length, mediaPts: +media(ptsNeg).toFixed(2), medianaPts: +mediana(ptsNeg).toFixed(2), t: +tPareada(ptsNeg).t.toFixed(2), pctTop20: +(100 * top20 / total).toFixed(0) },
  spy: RES_SPY, opcion: { n: pnlOpc.length, costeMedio: +media(costes).toFixed(0), pnlMedio: +tO.m.toFixed(2), t: +tO.t.toFixed(2), anual: +(tO.m * diasAnoNeg).toFixed(0) },
}, null, 1));
console.log(`\n   → ${SALIDA}\n`);
