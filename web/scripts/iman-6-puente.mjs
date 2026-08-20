// ═══════════════════════════════════════════════════════════════════════════════════════════
// RESPETAR · IMANES (5) — EL PUENTE: ¿qué le faltaría para funcionar?
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/iman-6-puente.mjs
//
// ═══ DE DÓNDE VIENE ════════════════════════════════════════════════════════════════════════
// El imán NO atrae (acercamiento t máx 1,23 contra niveles al azar a la misma distancia). Pero
// UNA cosa sí replica en las dos mitades: el LADO del imán gamD.imanNeto en días de gamma neta
// negativa acierta el cierre el 55,4%, contra el 49,2% de su propia deriva; +6,9 pp en 2022-23 y
// +5,0 pp en 2024-26, mismo signo las dos veces.
//
// Y sin embargo no es dinero: acierto medio +32,2 pts, fallo medio −37,2 pts. El 55,4% de acierto
// está JUSTO por encima del punto muerto que exige esa asimetría (hace falta 0,805 de ratio y hay
// 0,866), así que la media sale +1,28 pts/día... con una desviación de 49,7. Ahogado en ruido.
//
// ═══ LAS DOS SALIDAS, Y CUÁL SE PUEDE MEDIR ════════════════════════════════════════════════
//  1) MÁS MUESTRA. Se calcula cuántos años harían falta. (Spoiler: la respuesta la da el número.)
//  2) CAMBIAR LA FORMA DEL PAGO. El acierto ya está; lo que sobra es la cola izquierda. Un stop
//     es la salida obvia y en este proyecto ya se midió: los stops pierden 19 de 20. La que queda
//     es la estructura de RIESGO DEFINIDO: una vertical de débito, que corta la cola por
//     construcción y no por reacción. Lester la opera de un botón en Robinhood.
//
//     Y se puede medir EXACTA, sin modelo: el fichero ya trae bid/ask reales de las 09:35 de la
//     ATM y de la de ~0,5% fuera del dinero. Se compra la ATM al ASK, se vende la otra al BID
//     (el peaje entero de las dos patas), y el valor al vencimiento de una 0DTE es su intrínseco,
//     que es un dato exacto, no un precio modelado. Black-Scholes no entra aquí.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync } from "node:fs";

const CUENTA = 56389, EFECTIVO = 7977, LISTON = 3.08;
const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : NaN);
const varianza = (v) => { if (v.length < 2) return NaN; const m = media(v); return v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1); };
const sd = (v) => Math.sqrt(varianza(v));
const pct = (v, p) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))]; };
const mediana = (v) => pct(v, 50);
const tOf = (v) => (sd(v) > 0 ? media(v) / (sd(v) / Math.sqrt(v.length)) : NaN);
function exigir(c, m) { if (!c) throw new Error(`FALLO CERRADO: ${m}`); }
function rachas(s) { let peor = 0, act = 0, caida = 0, acum = 0, pico = 0; for (const x of s) { if (x < 0) { act++; peor = Math.max(peor, act); } else act = 0; acum += x; pico = Math.max(pico, acum); caida = Math.min(caida, acum - pico); } return { peor, caida }; }

const J = JSON.parse(readFileSync("scripts/gex-niveles.json", "utf8"));
const D = [];
for (const f of J.filas) {
  const c = f.peaje.callATM, p = f.peaje.putATM, c5 = f.peaje.call05, p5 = f.peaje.put05;
  if (!(f.apertura > 0) || !(f.cierre > 0)) continue;
  const K = f.niveles.gamD?.imanNeto; if (!(K > 0)) continue;
  D.push({ fecha: f.fecha, ano: +f.fecha.slice(0, 4), ap: f.apertura, ci: f.cierre,
    lado: Math.sign(K - f.apertura), net: f.niveles.gam?.netPunto, cATM: c, pATM: p, c05: c5, p05: p5 });
}
const NEG = D.filter((d) => d.net < 0);
console.log("\n" + "═".repeat(95));
console.log("RESPETAR · IMANES (5) — EL PUENTE: qué le faltaría, con números");
console.log("═".repeat(95));

// ═══ RADIOGRAFÍA de las patas que se van a usar ═════════════════════════════════════════════
console.log(`\n## 0 · RADIOGRAFÍA de las cuatro patas (NO se mide un campo sin mirarlo)`);
for (const [et, sel] of [["callATM", (d) => d.cATM], ["putATM", (d) => d.pATM], ["call05", (d) => d.c05], ["put05", (d) => d.p05]]) {
  const v = NEG.map(sel);
  const vivos = v.filter((x) => x && Number.isFinite(x.bid) && Number.isFinite(x.ask) && Number.isFinite(x.K));
  const bids = vivos.map((x) => x.bid), anchos = vivos.map((x) => x.ask - x.bid);
  console.log(`   ${et.padEnd(9)} vivos ${String(vivos.length).padStart(4)}/${NEG.length} · bid p50 ${mediana(bids).toFixed(2)} · ancho p50 ${mediana(anchos).toFixed(2)} pts · bid=0 en ${bids.filter((x) => x === 0).length}`);
  exigir(vivos.length > NEG.length * 0.9, `${et} muerto en demasiados días`);
}
const anchoK = NEG.map((d) => (d.lado > 0 && d.c05 && d.cATM ? d.c05.K - d.cATM.K : d.lado < 0 && d.p05 && d.pATM ? d.pATM.K - d.p05.K : null)).filter((x) => x != null && x > 0);
console.log(`   ANCHO de la vertical (distancia entre strikes): p25 ${pct(anchoK, 25).toFixed(0)} · p50 ${mediana(anchoK).toFixed(0)} · p75 ${pct(anchoK, 75).toFixed(0)} pts`);

// ═══ 1 · LA VERTICAL DE DÉBITO, PRECIOS REALES ══════════════════════════════════════════════
// compra ATM al ASK · venta ~0,5% fuera al BID · vencimiento = intrínseco exacto
console.log(`\n## 1 · VERTICAL DE DÉBITO en la dirección del imán (γ<0), con las dos horquillas pagadas`);
const V = [];
const fuera = {};
const cae = (k) => { fuera[k] = (fuera[k] || 0) + 1; };
for (const d of NEG) {
  if (d.lado === 0) { cae("imán justo en la apertura"); continue; }
  const larga = d.lado > 0 ? d.cATM : d.pATM;
  const corta = d.lado > 0 ? d.c05 : d.p05;
  if (!larga || !corta || !(larga.ask > 0) || !(corta.bid > 0)) { cae("pata sin cotización"); continue; }
  const ancho = d.lado > 0 ? corta.K - larga.K : larga.K - corta.K;
  if (!(ancho > 0)) { cae("ancho no positivo"); continue; }
  const debito = larga.ask - corta.bid;               // lo que sale de la cuenta, peaje entero
  if (!(debito > 0) || debito >= ancho) { cae("débito imposible (≥ ancho o ≤0)"); continue; }
  const intr = d.lado > 0 ? Math.max(0, d.ci - larga.K) : Math.max(0, larga.K - d.ci);
  const valorFinal = Math.min(intr, ancho);           // la pata corta corta la ganancia
  const pnl = (valorFinal - debito) * 100;
  V.push({ ...d, ancho, debito, pnl, riesgo: debito * 100, techo: (ancho - debito) * 100 });
}
for (const [k, v] of Object.entries(fuera)) console.log(`   descartados por ${k}: ${v}`);
exigir(V.length > 300, `muestra de verticales pequeña: ${V.length}`);
const pnl = V.map((v) => v.pnl), riesgo = V.map((v) => v.riesgo);
console.log(`\n   n=${V.length} de ${NEG.length} días γ<0`);
console.log(`   riesgo por operación (débito): p25 $${pct(riesgo, 25).toFixed(0)} · p50 $${mediana(riesgo).toFixed(0)} · p75 $${pct(riesgo, 75).toFixed(0)}`);
console.log(`   techo de ganancia: p50 $${mediana(V.map((v) => v.techo)).toFixed(0)} · peaje pagado (2 horquillas) p50 $${mediana(V.map((v) => ((v.lado > 0 ? v.cATM.ask - v.cATM.bid : v.pATM.ask - v.pATM.bid) + (v.lado > 0 ? v.c05.ask - v.c05.bid : v.p05.ask - v.p05.bid)) * 100)).toFixed(0)}`);
console.log(`   P&L medio $${media(pnl).toFixed(2)} · mediana $${mediana(pnl).toFixed(0)} · t=${tOf(pnl).toFixed(2)}`);
console.log(`   sobre el riesgo: ${(100 * media(pnl) / media(riesgo)).toFixed(2)}% por operación`);
console.log(`   gana el ${(100 * pnl.filter((x) => x > 0).length / pnl.length).toFixed(1)}% de las veces · máximo ${(100 * pnl.filter((x, i) => x >= V[i].techo - 1).length / pnl.length).toFixed(1)}% · pierde todo el ${(100 * pnl.filter((x, i) => x <= -V[i].riesgo + 1).length / pnl.length).toFixed(1)}%`);
const diasAno = 252 * (NEG.length / D.length) * (V.length / NEG.length);
const ic = 1.96 * sd(pnl) / Math.sqrt(pnl.length);
console.log(`\n   DINERO con 1 contrato al día (${diasAno.toFixed(0)} días/año): $${(media(pnl) * diasAno).toFixed(0)}/año`);
console.log(`      intervalo 95%: $${((media(pnl) - ic) * diasAno).toFixed(0)} a $${((media(pnl) + ic) * diasAno).toFixed(0)}`);
const r = rachas(V.slice().sort((a, b) => a.fecha.localeCompare(b.fecha)).map((v) => v.pnl));
console.log(`      racha perdedora más larga ${r.peor} días · peor caída acumulada $${r.caida.toFixed(0)}`);
console.log(`      con $${EFECTIVO.toLocaleString("es-ES")} de efectivo caben ${Math.floor(EFECTIVO / mediana(riesgo))} contratos al débito mediano`);

// ═══ 2 · EL CRUCE, sobre la vertical ════════════════════════════════════════════════════════
console.log(`\n## 2 · EL CRUCE sobre la vertical — 2022-2023 contra 2024-2026`);
for (const [et, g] of [["2022-2023", V.filter((v) => v.ano <= 2023)], ["2024-2026", V.filter((v) => v.ano >= 2024)]]) {
  const p = g.map((v) => v.pnl);
  console.log(`   ${et}: n=${g.length} · $${media(p).toFixed(2)}/op · ${(100 * media(p) / media(g.map((v) => v.riesgo))).toFixed(2)}% sobre riesgo · t=${tOf(p).toFixed(2)} · gana ${(100 * p.filter((x) => x > 0).length / p.length).toFixed(1)}%`);
}
const pA = V.filter((v) => v.ano <= 2023).map((v) => v.pnl), pB = V.filter((v) => v.ano >= 2024).map((v) => v.pnl);
const mismoSigno = Math.sign(media(pA)) === Math.sign(media(pB));
console.log(`   mismo signo en las dos mitades: ${mismoSigno ? "SÍ" : "NO"} · |t| ≥ 2 en las dos: ${Math.abs(tOf(pA)) >= 2 && Math.abs(tOf(pB)) >= 2 ? "SÍ" : "NO"}`);

// ═══ 3 · EL CONTROL QUE DECIDE, también sobre la vertical ═══════════════════════════════════
// La misma vertical pero con el LADO al azar. Si el imán no le gana, el imán no existe.
console.log(`\n## 3 · CONTROL — la MISMA vertical con el lado al azar (500 sorteos)`);
function rng(s0) { let a = s0 >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rnd = rng(4242);
const nube = [];
for (let s = 0; s < 500; s++) {
  let suma = 0, n = 0;
  for (const d of NEG) {
    const lado = rnd() < 0.5 ? -1 : 1;
    const larga = lado > 0 ? d.cATM : d.pATM, corta = lado > 0 ? d.c05 : d.p05;
    if (!larga || !corta || !(larga.ask > 0) || !(corta.bid > 0)) continue;
    const ancho = lado > 0 ? corta.K - larga.K : larga.K - corta.K;
    const deb = larga.ask - corta.bid;
    if (!(ancho > 0) || !(deb > 0) || deb >= ancho) continue;
    const intr = lado > 0 ? Math.max(0, d.ci - larga.K) : Math.max(0, larga.K - d.ci);
    suma += (Math.min(intr, ancho) - deb) * 100; n++;
  }
  nube.push(suma / n);
}
const pctil = 100 * nube.filter((x) => x < media(pnl)).length / nube.length;
console.log(`   imán real: $${media(pnl).toFixed(2)}/op · azar: $${media(nube).toFixed(2)}/op (sd ${sd(nube).toFixed(2)})`);
console.log(`   percentil del imán dentro del azar: ${pctil.toFixed(1)}  ${pctil >= 97.5 ? "← le gana al azar" : "← NO le gana al azar"}`);

// ═══ 4 · CUÁNTA MUESTRA HARÍA FALTA ═════════════════════════════════════════════════════════
console.log(`\n## 4 · LOS NÚMEROS DEL PUENTE`);
const ptsNeg = NEG.map((d) => d.lado * (d.ci - d.ap));
const nNec = Math.pow(LISTON * sd(ptsNeg) / media(ptsNeg), 2);
console.log(`   · SEGUIR EL ÍNDICE: media ${media(ptsNeg).toFixed(2)} pts/día, desviación ${sd(ptsNeg).toFixed(1)}.`);
console.log(`     Para que eso llegue a t=${LISTON} harían falta ${nNec.toFixed(0)} días γ<0 = ${(nNec / (252 * NEG.length / D.length)).toFixed(0)} AÑOS de mercado.`);
console.log(`     Ese es el tamaño real del hallazgo: no es que falte muestra, es que el efecto es demasiado pequeño.`);
const nNecV = Math.pow(LISTON * sd(pnl) / media(pnl), 2);
console.log(`   · VERTICAL: media $${media(pnl).toFixed(2)}, desviación $${sd(pnl).toFixed(0)} → ${nNecV.toFixed(0)} operaciones = ${(nNecV / diasAno).toFixed(0)} años.`);
console.log(`   · PUNTO MUERTO del acierto direccional: con acierto medio +32,2 y fallo −37,2 pts hace falta acertar el`);
console.log(`     ${(100 * 37.2 / (32.2 + 37.2)).toFixed(1)}%. Observado 55,4%: sobra ${(55.4 - 100 * 37.2 / (32.2 + 37.2)).toFixed(1)} pp. El margen existe pero es del grosor del ruido.`);

writeFileSync("scripts/iman-6-resultado.json", JSON.stringify({
  generado: new Date().toISOString(), n: V.length, diasAno: +diasAno.toFixed(0),
  vertical: { pnlMedio: +media(pnl).toFixed(2), mediana: +mediana(pnl).toFixed(0), t: +tOf(pnl).toFixed(2),
    pctSobreRiesgo: +(100 * media(pnl) / media(riesgo)).toFixed(2), anual: +(media(pnl) * diasAno).toFixed(0),
    ic95: [+((media(pnl) - ic) * diasAno).toFixed(0), +((media(pnl) + ic) * diasAno).toFixed(0)],
    riesgoP50: +mediana(riesgo).toFixed(0), peorRacha: r.peor, peorCaida: +r.caida.toFixed(0) },
  cruce: { A: +media(pA).toFixed(2), tA: +tOf(pA).toFixed(2), B: +media(pB).toFixed(2), tB: +tOf(pB).toFixed(2), mismoSigno },
  control: { azar: +media(nube).toFixed(2), percentil: +pctil.toFixed(1) },
  anosNecesarios: +(nNec / (252 * NEG.length / D.length)).toFixed(0),
}, null, 1));
console.log(`\n   → scripts/iman-6-resultado.json\n`);
