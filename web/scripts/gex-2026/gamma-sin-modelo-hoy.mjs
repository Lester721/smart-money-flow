// ¿HACE FALTA BLACK-SCHOLES PARA EL GEX? — contestado con la cadena de hoy.
//
// La objeción de Lester es justa y hay que contestarla con números, no con matices.
//
// Lo que mató a EVA fue usar BS para GENERAR EL PRECIO de la opción alimentándolo con la
// volatilidad realizada. Eso pone la prima extra en cero por construcción: das por hecho que la
// opción vale exactamente lo que el subyacente va a hacer. El +3,20% se volvió −2,53% con
// precios reales. Ese uso está PROHIBIDO y no aparece en ningún script del GEX.
//
// Lo que sí hacemos: convertir una IV REAL del mercado en gamma. No se inventa ningún precio.
// Pero la gamma también se puede sacar SIN NINGÚN MODELO, como la curvatura de los precios
// REALES entre strikes contiguos — que es literalmente lo que significa gamma:
//
//     gamma(K) ≈ [P(K+h) − 2·P(K) + P(K−h)] / h²
//
// Si las dos coinciden, el modelo no está haciendo trabajo y la objeción queda cerrada.
// Si no coinciden, se usa la de mercado y BS no entra en el GEX.
//
// Uso: node scripts/gex-2026/gamma-sin-modelo-hoy.mjs [YYYY-MM-DD] [HH:MM]

const B = (process.env.THETA_BASE || 'http://127.0.0.1:25503').replace(/\/+$/, '').replace(/\/v3$/, '') + '/v3';
const DIA = process.argv[2] || new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const HORA = process.argv[3] || '11:00';
const SYM = 'SPXW';

const phi = (x) => 0.3989423 * Math.exp((-x * x) / 2);
const d1f = (S, K, T, v) => (Math.log(S / K) + ((v * v) / 2) * T) / (v * Math.sqrt(T));

async function csv(ruta) {
  const r = await fetch(`${B}/${ruta}`, { signal: AbortSignal.timeout(180000) });
  const txt = await r.text();
  if (!r.ok || txt.length < 200) return null;
  const lin = txt.trim().split('\n');
  return { cab: lin[0].split(','), filas: lin.slice(1).map((l) => l.split(',')) };
}

// Se usan CALLS: la segunda diferencia sobre calls da la densidad implícita directamente.
const d = await csv(`option/history/greeks/implied_volatility?symbol=${SYM}&expiration=${DIA}&start_date=${DIA}&end_date=${DIA}&right=C&interval=5m`);
if (!d) { console.log('✗ sin datos'); process.exit(1); }

const jK = d.cab.indexOf('strike'), jT = d.cab.indexOf('timestamp'), jB = d.cab.indexOf('bid'),
      jA = d.cab.indexOf('ask'), jM = d.cab.indexOf('midpoint'), jV = d.cab.indexOf('implied_vol'),
      jU = d.cab.indexOf('underlying_price');

const filas = [];
let U = 0;
for (const c of d.filas) {
  if (c[jT].slice(11, 16) !== HORA) continue;
  const u = +c[jU]; if (u > 0) U = u;
  const bid = +c[jB], ask = +c[jA], mid = +c[jM], iv = +c[jV];
  if (!(bid > 0) || !(ask > 0) || !(mid > 0) || !(iv > 0.01) || iv > 4) continue;
  filas.push({ K: +c[jK], mid, iv });
}
filas.sort((a, b) => a.K - b.K);
if (!(U > 0) || filas.length < 20) { console.log(`✗ pocos strikes con precio a las ${HORA}`); process.exit(1); }

// Tiempo hasta el cierre, igual que en el GEX de producción.
const T = Math.max((16 * 60 - (+HORA.slice(0, 2) * 60 + +HORA.slice(3))) / 60 / 24 / 365, 1 / 24 / 365);
const gammaBS = (K, iv) => phi(d1f(U, K, T, iv)) / (U * iv * Math.sqrt(T));

// Gamma SIN modelo: curvatura de los precios REALES. Cero supuestos sobre la distribución.
const gammaMercado = (i) => {
  const a = filas[i - 1], b = filas[i], c = filas[i + 1];
  const h1 = b.K - a.K, h2 = c.K - b.K;
  if (Math.abs(h1 - h2) > 0.01) return null;           // sólo con rejilla uniforme
  return (c.mid - 2 * b.mid + a.mid) / (h1 * h1);
};

console.log(`═══ ¿HACE FALTA BLACK-SCHOLES PARA EL GEX? ═══`);
console.log(`   ${SYM} 0DTE del ${DIA} a las ${HORA} ET · subyacente ${U.toFixed(2)} · ${filas.length} strikes\n`);
console.log(`   strike     precio     IV      gamma BS    gamma MERCADO    dif%`);

const difs = [];
const cerca = [];
for (let i = 1; i < filas.length - 1; i++) {
  const f = filas[i];
  if (Math.abs(f.K - U) > 60) continue;                // la zona que manda en el GEX
  const gm = gammaMercado(i);
  if (gm == null || !(gm > 0)) continue;
  const gb = gammaBS(f.K, f.iv);
  if (!isFinite(gb) || gb <= 0) continue;
  const dif = (gb - gm) / gm * 100;
  difs.push(dif);
  cerca.push({ K: f.K, gb, gm });
  console.log(`   ${String(f.K).padStart(6)}  ${f.mid.toFixed(2).padStart(9)}  ${(f.iv * 100).toFixed(1).padStart(5)}%  ${gb.toExponential(3).padStart(11)}  ${gm.toExponential(3).padStart(14)}  ${(dif >= 0 ? '+' : '') + dif.toFixed(1).padStart(6)}`);
}

if (!difs.length) { console.log('\n   ✗ no hubo strikes comparables'); process.exit(1); }

const med = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const mdn = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

// Lo que de verdad importa: ¿cambia la CONCLUSIÓN del GEX, o sólo los decimales?
const sumaBS = cerca.reduce((s, x) => s + x.gb, 0);
const sumaMK = cerca.reduce((s, x) => s + x.gm, 0);
const picoBS = cerca.reduce((a, b) => (b.gb > a.gb ? b : a)).K;
const picoMK = cerca.reduce((a, b) => (b.gm > a.gm ? b : a)).K;

console.log(`\n   ── VEREDICTO ──`);
console.log(`   strikes comparados          : ${difs.length}`);
console.log(`   diferencia mediana          : ${(mdn(difs) >= 0 ? '+' : '') + mdn(difs).toFixed(1)}%`);
console.log(`   diferencia media            : ${(med(difs) >= 0 ? '+' : '') + med(difs).toFixed(1)}%`);
console.log(`   gamma total (BS / mercado)  : ${(sumaBS / sumaMK).toFixed(3)}x`);
console.log(`   strike de MÁXIMA gamma      : BS dice ${picoBS}  ·  mercado dice ${picoMK}  ${picoBS === picoMK ? '← COINCIDEN' : '← NO coinciden'}`);
console.log(`\n   El GEX no usa la gamma para poner precio a nada: la usa para SITUAR los muros.`);
console.log(`   Si el pico coincide y el total es parecido, el modelo no cambia la conclusión.`);
console.log(`   Si no coincide, hay que usar la de mercado y sacar BS del cálculo.\n`);
