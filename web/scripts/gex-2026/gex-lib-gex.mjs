// LOS DOS ESCENARIOS DEL GEX, con datos reales de SPXW 0DTE, 151 días de 2026.
//
// ESCENARIO A (el mío): ¿el precio se PEGA al muro de gamma?
// ESCENARIO B (el de Lester, y es el bueno): el GEX como filtro de RÉGIMEN.
//     GEX neto negativo  -> los dealers amplifican, hay movimiento
//     el precio empuja hacia abajo
//     -> vender un call credit spread arriba, delta 0,05-0,11, que vence hoy
//
// El escenario B es el que se opera de verdad, y se puede valorar entero con precios reales:
// tengo el bid/ask de cada strike cada 5 min y el cierre real del índice para liquidar.
//
// EL SIGNO DEL GEX — aquí está la única decisión delicada.
// Calcular "GEX neto" exige saber de qué lado están los dealers, y ese dato no existe.
// En vez de elegirlo yo, **se prueban las DOS convenciones** y que decidan los datos:
//     convención 1: dealers cortos de calls, largos de puts  (la de casi todo el mundo)
//     convención 2: la contraria
// Y se comprueba fuera de muestra. Si solo funciona la que elegí a posteriori, no vale.

import fs from 'node:fs';
const DIR = process.argv[2] || 'scripts/cache-theta/gex-2026';
const COMM = 0.03;          // por contrato y pata

// ── Black-Scholes SOLO para delta y gamma, alimentado con la IV REAL del fichero ──────────
const nd = x => { const t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p; };
const phi = x => 0.3989423 * Math.exp(-x * x / 2);
const d1f = (S, K, T, v) => (Math.log(S / K) + (v * v / 2) * T) / (v * Math.sqrt(T));
const deltaCall = (S, K, T, v) => nd(d1f(S, K, T, v));
const gammaBS = (S, K, T, v) => phi(d1f(S, K, T, v)) / (S * v * Math.sqrt(T));

// ── cargar un día ────────────────────────────────────────────────────────────────────────
function cargarDia(d) {
  const out = new Map();   // hora -> { U, calls:Map, puts:Map }
  for (const [lado, suf] of [['C', '_C'], ['P', '_P']]) {
    const f = `${DIR}/iv_${d}${suf}.csv`;
    if (!fs.existsSync(f)) return null;
    const lin = fs.readFileSync(f, 'utf8').split('\n'), cab = lin[0].split(',');
    const iK = cab.indexOf('strike'), iT = cab.indexOf('timestamp'), iB = cab.indexOf('bid'),
          iA = cab.indexOf('ask'), iM = cab.indexOf('midpoint'), iV = cab.indexOf('implied_vol'),
          iU = cab.indexOf('underlying_price');
    for (let n = 1; n < lin.length; n++) {
      const c = lin[n].split(','); if (c.length < cab.length) continue;
      const h = c[iT].slice(11, 16), U = +c[iU];
      if (!(U > 0)) continue;
      if (!out.has(h)) out.set(h, { U, calls: new Map(), puts: new Map() });
      const g = out.get(h); g.U = U;
      const bid = +c[iB], ask = +c[iA], mid = +c[iM], iv = +c[iV], K = +c[iK];
      if (!(bid > 0) || !(ask > 0) || ask < bid || !(mid > 0) || !(iv > 0.01) || iv > 4) continue;
      if ((ask - bid) / mid > 0.5) continue;                       // cotización rota
      (lado === 'C' ? g.calls : g.puts).set(K, { bid, ask, mid, iv });
    }
  }
  // open interest de partida (fila con fecha = día de vencimiento -> cierre de la víspera)
  const oi = { calls: new Map(), puts: new Map() };
  const fo = `${DIR}/oi_${d}.csv`;
  if (!fs.existsSync(fo)) return null;
  {
    const lin = fs.readFileSync(fo, 'utf8').split('\n'), cab = lin[0].split(',');
    const iK = cab.indexOf('strike'), iT = cab.indexOf('timestamp'), iO = cab.indexOf('open_interest'), iR = cab.indexOf('right');
    for (let n = 1; n < lin.length; n++) {
      const c = lin[n].split(','); if (c.length < cab.length) continue;
      if (c[iT].slice(0, 10) !== d) continue;
      const v = +c[iO]; if (!(v > 0)) continue;
      (c[iR].replace(/"/g, '') === 'CALL' ? oi.calls : oi.puts).set(+c[iK], v);
    }
  }
  return { horas: out, oi };
}

const HORAS = [];
for (let h = 10; h <= 15; h++) for (const m of ['00', '30']) HORAS.push(`${String(h).padStart(2, '0')}:${m}`);
const minutos = h => +h.slice(0, 2) * 60 + +h.slice(3);
const TCierre = h => Math.max((16 * 60 - minutos(h)) / 60 / 24 / 365, 1 / 24 / 365);  // años hasta las 16:00

// ── perfil de gamma por strike en una foto ───────────────────────────────────────────────
function perfil(g, oi) {
  const T = null;
  const filas = [];
  for (const [lado, mapa, mapaOI] of [['C', g.calls, oi.calls], ['P', g.puts, oi.puts]]) {
    for (const [K, q] of mapa) {
      const o = mapaOI.get(K); if (!o) continue;
      filas.push({ lado, K, q, oi: o });
    }
  }
  return filas;
}

const dias = fs.readdirSync(DIR).filter(f => f.startsWith('oi_')).map(f => f.slice(3, 13)).sort();

// ── recorrer todo ────────────────────────────────────────────────────────────────────────
const obs = [];
for (const d of dias) {
  const D = cargarDia(d); if (!D) continue;
  const horas = [...D.horas.keys()].sort();
  const serie = horas.map(h => ({ h, U: D.horas.get(h).U }));
  const cierre = serie[serie.length - 1]?.U;
  if (!(cierre > 0)) continue;

  for (const h of HORAS) {
    const g = D.horas.get(h); if (!g) continue;
    const T = TCierre(h), U = g.U;
    const fil = perfil(g, D.oi);
    if (fil.length < 40) continue;

    // gamma en dólares por strike, con la IV REAL
    let gexPos = 0, gexNeg = 0, mayor = null, mayorG = 0;
    for (const f of fil) {
      const gm = gammaBS(U, f.K, T, f.q.iv);
      if (!isFinite(gm) || gm <= 0) continue;
      const dolares = gm * f.oi * 100 * U * U * 0.01;      // $ por 1% de movimiento
      if (!isFinite(dolares)) continue;
      if (f.lado === 'C') gexPos += dolares; else gexNeg += dolares;
      if (dolares > mayorG) { mayorG = dolares; mayor = f.K; }
    }
    // convención 1: dealers largos de calls, cortos de puts  -> neto = calls − puts
    const net1 = gexPos - gexNeg;

    // momento intradía: retorno de los últimos 30 min
    const i = serie.findIndex(x => x.h === h);
    const prev = serie[Math.max(0, i - 6)];
    const mom = prev ? U / prev.U - 1 : 0;

    // futuro (para el escenario A)
    const fut = serie[Math.min(serie.length - 1, i + 6)];
    const movFuturo = fut ? Math.abs(fut.U - U) / U : null;

    obs.push({ d, h, U, cierre, net1, gexPos, gexNeg, mayor, mom, movFuturo,
               distMuro: mayor ? (U - mayor) / U : null,
               calls: g.calls, puts: g.puts, oiCalls: D.oi.calls, T });
  }
}
console.log(`${obs.length} fotos con perfil de gamma, ${dias.length} días\n`);

const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;


export { obs, HORAS, deltaCall, med, mean, COMM };
