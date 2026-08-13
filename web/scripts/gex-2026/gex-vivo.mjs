// GEX EN VIVO — la prueba de que el sistema se puede ejecutar de verdad, no solo reconstruir.
//
// Todo el backtest es reconstrucción a posteriori. Esto comprueba lo único que decide si existe
// la estrategia: que a las 11:00 de la mañana se pueda calcular el GEX con datos que YA están
// disponibles, y sacar los strikes concretos del cóndor.
//
// Medido el 2026-08-11 con el mercado abierto: el histórico intradía va con RETRASO CERO
// (última foto 14:55 a las 14:55) y la petición tarda ~4 segundos.
//
// Uso: node scripts/gex-2026/gex-vivo.mjs [YYYY-MM-DD] [HH:MM]

const B = process.env.THETA_BASE || 'http://127.0.0.1:25503/v3';
const SYM = 'SPXW';
const hoyET = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const ahoraET = () => new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false }).slice(0, 5);
const DIA = process.argv[2] || hoyET();
const HORA = process.argv[3] || null;   // null = la foto más reciente

// Black-Scholes solo para gamma y delta, alimentado con la IV REAL del mercado.
const nd = x => { const t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p; };
const phi = x => 0.3989423 * Math.exp(-x * x / 2);
const d1f = (S, K, T, v) => (Math.log(S / K) + (v * v / 2) * T) / (v * Math.sqrt(T));
const gamma = (S, K, T, v) => phi(d1f(S, K, T, v)) / (S * v * Math.sqrt(T));
const deltaCall = (S, K, T, v) => nd(d1f(S, K, T, v));

async function csv(ruta) {
  const t0 = Date.now();
  const r = await fetch(`${B}/${ruta}`, { signal: AbortSignal.timeout(120_000) });
  const txt = await r.text();
  if (!r.ok || txt.length < 200 || txt.includes(' ')) throw new Error(txt.slice(0, 120));
  const lin = txt.trim().split('\n');
  return { cab: lin[0].split(','), filas: lin.slice(1).map(l => l.split(',')), ms: Date.now() - t0 };
}

(async () => {
  const t0 = Date.now();
  console.log(`═══ GEX EN VIVO — ${SYM} 0DTE ${DIA} ═══`);
  console.log(`   hora del mercado: ${ahoraET()} ET\n`);

  // 1. open interest de partida (sellado a las 06:30, antes de abrir)
  const oiRaw = await csv(`option/history/open_interest?symbol=${SYM}&expiration=${DIA}&start_date=${DIA}&end_date=${DIA}`);
  const iK = oiRaw.cab.indexOf('strike'), iR = oiRaw.cab.indexOf('right'), iO = oiRaw.cab.indexOf('open_interest');
  const oi = { C: new Map(), P: new Map() };
  for (const c of oiRaw.filas) {
    const v = +c[iO]; if (!(v > 0)) continue;
    oi[c[iR].replace(/"/g, '') === 'CALL' ? 'C' : 'P'].set(+c[iK], v);
  }
  console.log(`1. open interest: ${oi.C.size} calls + ${oi.P.size} puts  (${oiRaw.ms} ms)`);

  // 2. la cadena a la hora pedida (o la más reciente)
  const cad = { C: new Map(), P: new Map() }; let U = 0, hora = '';
  for (const lado of ['P', 'C']) {
    const d = await csv(`option/history/greeks/implied_volatility?symbol=${SYM}&expiration=${DIA}&start_date=${DIA}&end_date=${DIA}&right=${lado}&interval=5m`);
    const jK = d.cab.indexOf('strike'), jT = d.cab.indexOf('timestamp'), jB = d.cab.indexOf('bid'),
          jA = d.cab.indexOf('ask'), jM = d.cab.indexOf('midpoint'), jV = d.cab.indexOf('implied_vol'), jU = d.cab.indexOf('underlying_price');
    let objetivo = HORA || ''; // '' y no null: 'HH:MM' > null compara mal y deja objetivo sin fijar
    if (!objetivo) { for (const c of d.filas) { const h = c[jT].slice(11, 16); if (+c[jU] > 0 && h > objetivo) objetivo = h; } }
    for (const c of d.filas) {
      if (c[jT].slice(11, 16) !== objetivo) continue;
      const u = +c[jU]; if (u > 0) { U = u; hora = objetivo; }
      const bid = +c[jB], ask = +c[jA], mid = +c[jM], iv = +c[jV];
      if (!(bid > 0) || !(ask > 0) || ask < bid || !(mid > 0) || !(iv > 0.01) || iv > 4) continue;
      if ((ask - bid) / mid > 0.5) continue;
      cad[lado].set(+c[jK], { bid, ask, mid, iv });
    }
    console.log(`2. cadena ${lado === 'P' ? 'puts ' : 'calls'}: ${cad[lado].size} strikes vivos a las ${objetivo}  (${d.ms} ms)`);
  }
  if (!(U > 0)) { console.log('\n✗ sin precio del subyacente — no se puede calcular'); return; }

  // 3. el GEX
  const min = +hora.slice(0, 2) * 60 + +hora.slice(3);
  const T = Math.max((16 * 60 - min) / 60 / 24 / 365, 1 / 24 / 365);
  let gC = 0, gP = 0, muro = null, muroG = 0;
  for (const [lado, mapa] of [['C', cad.C], ['P', cad.P]]) {
    for (const [K, q] of mapa) {
      const o = oi[lado].get(K); if (!o) continue;
      const g = gamma(U, K, T, q.iv); if (!isFinite(g) || g <= 0) continue;
      const $ = g * o * 100 * U * U * 0.01;
      if (!isFinite($)) continue;
      if (lado === 'C') gC += $; else gP += $;
      if ($ > muroG) { muroG = $; muro = K; }
    }
  }
  const net = gC - gP;
  console.log(`\n3. SPX: ${U.toFixed(2)}   ·   hora de la foto: ${hora}   ·   quedan ${Math.round(T * 365 * 24 * 60)} min hasta el cierre`);
  console.log(`   gamma de calls: $${(gC / 1e6).toFixed(0)}M   ·   gamma de puts: $${(gP / 1e6).toFixed(0)}M`);
  console.log(`   GEX NETO: ${net > 0 ? '+' : ''}$${(net / 1e6).toFixed(0)}M   ->  ${net > 0 ? 'POSITIVO' : 'NEGATIVO'}`);
  console.log(`   muro de gamma en ${muro}  (${((muro - U) / U * 100).toFixed(2)}% del precio)`);

  // 4. la señal
  console.log(`\n4. SEÑAL`);
  if (net <= 0) { console.log(`   ✗ NO OPERAR — el GEX es negativo. Es el veto, y es lo único firme que medimos.`); return; }
  const paso = 5, SEP = 25, ALA = 50;
  const red = x => Math.round(x / paso) * paso;
  const Kc = red(U) + SEP, Kp = red(U) - SEP;
  const c = cad.C.get(Kc), cA = cad.C.get(Kc + ALA), p = cad.P.get(Kp), pA = cad.P.get(Kp - ALA);
  if (!c || !cA || !p || !pA) { console.log(`   ⚠ GEX positivo pero faltan strikes cotizados para el cóndor ±${SEP}/alas ${ALA}`); return; }
  const credito = c.bid + p.bid - cA.ask - pA.ask;
  console.log(`   ✓ GEX POSITIVO — cóndor de hierro ±${SEP}, alas ${ALA}:`);
  console.log(`        vender call ${Kc}  a $${c.bid.toFixed(2)}   (delta ${deltaCall(U, Kc, T, c.iv).toFixed(3)})`);
  console.log(`        comprar call ${Kc + ALA} a $${cA.ask.toFixed(2)}`);
  console.log(`        vender put  ${Kp}  a $${p.bid.toFixed(2)}`);
  console.log(`        comprar put  ${Kp - ALA} a $${pA.ask.toFixed(2)}`);
  console.log(`   crédito cruzando la horquilla entera: $${(credito * 100).toFixed(0)}   ·   riesgo máximo $${((ALA - credito) * 100).toFixed(0)}`);
  console.log(`   gana si SPX cierra entre ${Kp} y ${Kc}  (${((Kp / U - 1) * 100).toFixed(2)}% a +${((Kc / U - 1) * 100).toFixed(2)}%)`);

  console.log(`\n   TIEMPO TOTAL DEL CÁLCULO: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  console.log(`   (papel: esto NO ejecuta ninguna orden)`);
})();
