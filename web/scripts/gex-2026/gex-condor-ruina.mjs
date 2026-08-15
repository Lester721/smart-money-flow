// ¿SOBREVIVE LA CUENTA DE LESTER AL CÓNDOR, AUNQUE LA VENTAJA SEA REAL?
//
// El cóndor da +4,87% sobre $5.000 de riesgo (2026). Con ~140 días de GEX positivo al año eso
// serían ~$34.000/año. Sobre $7.897 de efectivo es un 430% anual, y un número así es una alarma,
// no un logro.
//
// La media no decide nada aquí. Lo que decide es si la cuenta AGUANTA el camino: cada operación
// arriesga $5.000 de los $7.897 que tiene, y un solo día malo se lleva más de la mitad.
//
// Esto NO es un modelo. Se remuestrean las operaciones REALES ya medidas (bootstrap), en orden
// aleatorio, y se cuenta cuántos caminos se quedan sin poder operar.
//
// Uso: node scripts/gex-2026/gex-condor-ruina.mjs

import { obs, med, mean } from './gex-lib-gex.mjs';

const ALA = 50, HORA = '11:00';
const EFECTIVO = 7897;             // lo que tiene disponible de verdad
const RIESGO = ALA * 100;          // $5.000 de colateral por cóndor
const CAMINOS = 20_000;
const AL_ANIO = 140;               // días con GEX positivo al año, si la cobertura fuera completa

const P = new Map();
for (const o of obs) P.set(`${o.d} ${o.h}`, o);
const dias = [...new Set(obs.map((o) => o.d))].sort();
const atm = (o) => { let K = null, d = Infinity;
  for (const k of o.calls.keys()) if (o.puts.has(k) && Math.abs(k - o.U) < d) { d = Math.abs(k - o.U); K = k; }
  return d <= 10 ? K : null; };

// Las operaciones reales, en DÓLARES por contrato.
const pnl = [];
for (const d of dias) {
  const o = P.get(`${d} ${HORA}`);
  if (!o || !(o.net1 > 0)) continue;
  const K = atm(o); if (K == null) continue;
  const c = o.calls.get(K + 25), cA = o.calls.get(K + 75), p = o.puts.get(K - 25), pA = o.puts.get(K - 75);
  if (!c || !cA || !p || !pA) continue;
  const cr = c.bid + p.bid - cA.ask - pA.ask;
  if (!(cr > 0.2) || cr > ALA) continue;
  const S = o.cierre;
  const perd = Math.min(Math.max(S - (K + 25), 0), ALA) + Math.min(Math.max((K - 25) - S, 0), ALA);
  pnl.push((cr - perd) * 100 - 8 * 0.03);
}

const ord = [...pnl].sort((a, b) => a - b);
console.log(`OPERACIONES REALES MEDIDAS: ${pnl.length}\n`);
console.log(`  media por operación .... $${mean(pnl).toFixed(0)}`);
console.log(`  mediana ................ $${med(pnl).toFixed(0)}`);
console.log(`  la mejor ............... $${ord[ord.length - 1].toFixed(0)}`);
console.log(`  la peor ................ $${ord[0].toFixed(0)}   ← ${(100 * Math.abs(ord[0]) / EFECTIVO).toFixed(0)}% del efectivo, en UN día`);
console.log(`  peores 5 ............... ${ord.slice(0, 5).map((x) => '$' + x.toFixed(0)).join(' · ')}`);
console.log(`  días que pierden ....... ${pnl.filter((x) => x < 0).length} de ${pnl.length} (${(100 * pnl.filter((x) => x < 0).length / pnl.length).toFixed(0)}%)`);
console.log(`  pérdida media cuando pierde: $${mean(pnl.filter((x) => x < 0)).toFixed(0)}`);

// ── Bootstrap: un año de operar, 20.000 veces ───────────────────────────────
// Regla de parada: si el efectivo baja de $5.000 ya no puede poner otro cóndor. Eso es la ruina
// práctica — no hace falta llegar a cero.
function simular(contratos) {
  let arruinados = 0, finales = [], peorCaida = [];
  for (let c = 0; c < CAMINOS; c++) {
    let saldo = EFECTIVO, pico = EFECTIVO, caida = 0, muerto = false;
    for (let i = 0; i < AL_ANIO; i++) {
      if (saldo < RIESGO * contratos) { muerto = true; break; }
      saldo += pnl[Math.floor(Math.random() * pnl.length)] * contratos;
      pico = Math.max(pico, saldo);
      caida = Math.max(caida, (pico - saldo) / pico);
    }
    if (muerto) arruinados++;
    finales.push(saldo);
    peorCaida.push(caida);
  }
  finales.sort((a, b) => a - b);
  peorCaida.sort((a, b) => a - b);
  return {
    ruina: 100 * arruinados / CAMINOS,
    p5: finales[Math.floor(CAMINOS * 0.05)],
    mediana: finales[Math.floor(CAMINOS * 0.5)],
    p95: finales[Math.floor(CAMINOS * 0.95)],
    caidaMediana: 100 * peorCaida[Math.floor(CAMINOS * 0.5)],
  };
}

console.log(`\n── UN AÑO OPERANDO (${AL_ANIO} veces), remuestreando las operaciones reales ${CAMINOS.toLocaleString('es')} veces`);
console.log(`   empieza con $${EFECTIVO.toLocaleString('es')} · cada cóndor retiene $${RIESGO.toLocaleString('es')}`);
console.log(`   "sin poder operar" = el efectivo baja de lo que cuesta poner un cóndor\n`);
const r = simular(1);
console.log(`   se queda sin poder operar ... ${r.ruina.toFixed(1)}% de los caminos`);
console.log(`   saldo final, mal año (p5) ... $${r.p5.toFixed(0)}`);
console.log(`   saldo final, típico ......... $${r.mediana.toFixed(0)}`);
console.log(`   saldo final, buen año (p95) . $${r.p95.toFixed(0)}`);
console.log(`   caída máxima típica ......... ${r.caidaMediana.toFixed(0)}%`);

// ── ¿Y si tuviera más dinero? ───────────────────────────────────────────────
console.log(`\n── LO MISMO CON MÁS EFECTIVO (un cóndor cada vez):\n`);
console.log('   efectivo    sin poder operar   saldo típico   caída máxima típica');
for (const cash of [7897, 15000, 25000, 50000, 100000]) {
  let arruinados = 0, fin = [], cai = [];
  for (let c = 0; c < CAMINOS; c++) {
    let saldo = cash, pico = cash, caida = 0, muerto = false;
    for (let i = 0; i < AL_ANIO; i++) {
      if (saldo < RIESGO) { muerto = true; break; }
      saldo += pnl[Math.floor(Math.random() * pnl.length)];
      pico = Math.max(pico, saldo);
      caida = Math.max(caida, (pico - saldo) / pico);
    }
    if (muerto) arruinados++;
    fin.push(saldo); cai.push(caida);
  }
  fin.sort((a, b) => a - b); cai.sort((a, b) => a - b);
  const gan = fin[CAMINOS >> 1] - cash;
  console.log(`   $${String(cash.toLocaleString('es')).padStart(8)}   ${(100 * arruinados / CAMINOS).toFixed(1).padStart(6)}%          ` +
              `$${fin[CAMINOS >> 1].toFixed(0).padStart(8)}   ${(100 * cai[CAMINOS >> 1]).toFixed(0).padStart(4)}%   ` +
              `(${gan >= 0 ? '+' : ''}${(100 * gan / cash).toFixed(0)}%/año)`);
}

console.log(`\nEl listón que hay que batir sigue siendo comprar el índice: 14-16%/año sin dolores de cabeza.`);
