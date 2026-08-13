// ¿A QUE HORA CONVIENE VENDER? — la hipotesis de Lester: en la apertura hay mas volatilidad,
// asi que la prima deberia estar mas alta.
//
// Se cambia UNA SOLA cosa: la hora de entrada del viernes. Todo lo demas identico —
// mismo 3% por debajo del precio DE ESE MOMENTO, mismo vencimiento (viernes siguiente),
// misma salida (recomprar al cierre del viernes de vencimiento si acaba dentro del dinero).
//
// El tipo de interes sale de la paridad put-call al cierre, que no depende de la hora.

import fs from 'node:fs';
const S = process.argv[2] || 'scripts/cache-theta/noche-2026-08-10';
const COMM = 0.03;

// --- precio del QQQ a cada media hora ---
//
// Sale de theta-griegas (columna underlying_price del feed de OPCIONES): es una FOTO del
// mismo instante que la cotizacion de la opcion.
//
// La version anterior usaba las barras OHLC de acciones y estaba MAL: esas barras se etiquetan
// por la hora en que EMPIEZAN y su campo `close` es el precio de MEDIA HORA DESPUES. Al
// cruzarlo con cotizaciones selladas a las 10:00, el strike se elegia con el precio de las
// 10:30 — media hora de futuro. Comprobado el 2026-07-17: griegas 10:30 = 697,02 y
// barra "10:00".close = 697,0299, el mismo instante con etiqueta distinta.
// Sesgo favorable y silencioso: subia el strike (mas riesgo, mas prima) justo los dias en que
// ya se sabia que el mercado estaba subiendo.
const spot = new Map();   // 'YYYY-MM-DD HH:MM' -> precio en ese instante
for (const f of fs.readdirSync(S + '/theta-griegas')) {
  const lin = fs.readFileSync(`${S}/theta-griegas/${f}`, 'utf8').split('\n');
  const cab = lin[0].split(','); const iT = cab.indexOf('timestamp'), iC = cab.indexOf('close');
  for (let n = 1; n < lin.length; n++) { const c = lin[n].split(','); if (c.length < cab.length) continue;
    spot.set(c[iT].slice(0, 16).replace('T', ' '), +c[iC]); }
}

// --- cierres diarios, para el desenlace ---
const px = new Map(JSON.parse(fs.readFileSync(S + '/precios.json', 'utf8')).QQQ.map(b => [b.d, b.c]));

// --- tipo de interes por semana, de la paridad al cierre (theta-sem) ---
function leerEOD(f) {
  if (!fs.existsSync(f)) return null;
  const lin = fs.readFileSync(f, 'utf8').split('\n'); const cab = lin[0].split(',');
  const iK = cab.indexOf('strike'), iB = cab.indexOf('bid'), iA = cab.indexOf('ask');
  const m = new Map();
  for (let n = 1; n < lin.length; n++) { const c = lin[n].split(','); if (c.length < cab.length) continue;
    const bid = +c[iB], ask = +c[iA]; if (!(bid > 0) || !(ask > 0) || ask < bid) continue;
    if ((ask - bid) / ((ask + bid) / 2) > 0.50) continue;
    m.set(+c[iK], { bid, ask, mid: (bid + ask) / 2 }); }
  return m;
}
function tipo(rolo, exp) {
  const p = leerEOD(`${S}/theta-sem/QQQ_${rolo}_${exp}_P.csv`), c = leerEOD(`${S}/theta-sem/QQQ_${rolo}_${exp}_C.csv`);
  if (!p || !c) return 0;
  const S0 = px.get(rolo); if (S0 == null) return 0;
  let r = 0, dm = 1e9, T = (new Date(exp) - new Date(rolo)) / 365 / 864e5;
  for (const [K, pp] of p) { const cc = c.get(K); if (!cc) continue; const d = Math.abs(K - S0);
    if (d < dm) { dm = d; const v = (S0 - cc.mid + pp.mid) / K; const rr = -Math.log(v) / T;
      if (rr > -0.02 && rr < 0.12) r = rr; } }
  return r;
}

// --- cadena intradia: fichero -> hora -> strike -> {bid,ask} ---
function leerIntra(rolo, exp) {
  const f = `${S}/theta-intra/QQQ_${rolo}_${exp}.csv`;
  if (!fs.existsSync(f)) return null;
  const lin = fs.readFileSync(f, 'utf8').split('\n'); const cab = lin[0].split(',');
  const iK = cab.indexOf('strike'), iT = cab.indexOf('timestamp'), iB = cab.indexOf('bid'), iA = cab.indexOf('ask');
  const m = new Map();
  for (let n = 1; n < lin.length; n++) {
    const c = lin[n].split(','); if (c.length < cab.length) continue;
    const bid = +c[iB], ask = +c[iA];
    if (!(bid > 0) || !(ask > 0) || ask < bid) continue;
    if ((ask - bid) / ((ask + bid) / 2) > 0.50) continue;
    const h = c[iT].slice(11, 16);
    if (!m.has(h)) m.set(h, new Map());
    m.get(h).set(+c[iK], { bid, ask, mid: (bid + ask) / 2 });
  }
  return m;
}

// El "cierre" tambien sale de la serie intradia (16:00). El fichero diario trae la cotizacion
// sellada a las 17:22 — fuera de mercado — y compararla con las 10:00 no seria comparar horas,
// seria comparar mercado abierto contra mercado cerrado.
const HORAS = ['09:30', '10:00', '10:30', '11:00', '12:00', '13:00', '14:00', '15:00', '15:30', '16:00'];

const viernes = [];
{ const d = new Date(Date.UTC(2020, 0, 3));
  while (d < new Date(Date.UTC(2026, 7, 1))) { viernes.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 7); } }
const pares = viernes.slice(0, -1).map((r, i) => ({ rolo: r, exp: viernes[i + 1] }));

const res = new Map(HORAS.map(h => [h, []]));
const resCierre = [];
let sinDato = 0;

for (const { rolo, exp } of pares) {
  const intra = leerIntra(rolo, exp); if (!intra) { sinDato++; continue; }
  const ST = px.get(exp); if (ST == null) continue;
  const T = (new Date(exp) - new Date(rolo)) / 365 / 864e5;
  const r = tipo(rolo, exp);
  const vencEOD = leerEOD(`${S}/theta-venc/QQQ_${exp}_P.csv`);

  const opera = (cad, S0) => {
    if (!cad || S0 == null) return null;
    const obj = S0 * 0.97;
    let K = null, dif = 1e9;
    for (const k of cad.keys()) { const d = Math.abs(k - obj); if (d < dif) { dif = d; K = k; } }
    if (K == null || dif > S0 * 0.01) return null;
    const cobro = cad.get(K).mid;
    // salida: si acaba dentro del dinero, recomprar al ask real del viernes de vencimiento
    let pl;
    if (ST < K) {
      const c = vencEOD?.get(K);
      const recompra = c ? c.ask : Math.max(K - ST, 0);
      pl = (cobro - recompra) * 100 - 2 * COMM;
    } else pl = cobro * 100 - COMM;
    pl += K * 100 * (Math.exp(r * T) - 1);
    return { rolo, exp, K, S0, ST, cobro, pl, ret: pl / (K * 100) };
  };

  for (const h of HORAS) {
    // La ultima barra de 30m empieza a las 15:30, asi que NO hay barra de las 16:00.
    // Para esa hora el precio es el cierre diario. (Sin esto la fila del cierre salia casi
    // vacia y arrastraba el cruce de semanas a 23.)
    const S0 = h === '16:00' ? px.get(rolo) : spot.get(`${rolo} ${h}`);
    const o = opera(intra.get(h), S0);
    if (o) res.get(h).push(o);
  }
  // el cierre, con la misma maquinaria (EOD)
  const o = opera(leerEOD(`${S}/theta-sem/QQQ_${rolo}_${exp}_P.csv`), px.get(rolo));
  if (o) resCierre.push(o);
}

// SOLO las semanas que tienen dato en TODAS las horas. Sin esto, la fila del cierre traia
// 316 semanas (incluido el COVID) y las intradia 269 — y la diferencia de caida maxima seria
// la muestra, no la hora.
// 09:30 se queda fuera del cruce: en los datos, la subasta de apertura casi nunca tiene
// bid/ask utilizables (salen 0,00 / 0,00). Si se incluyera, la interseccion seria vacia.
const HORAS_OK = HORAS.filter(h => res.get(h).length > 50);
const comunes = new Set(res.get('16:00').map(o => o.rolo));
for (const h of HORAS_OK) {
  const s = new Set(res.get(h).map(o => o.rolo));
  for (const k of [...comunes]) if (!s.has(k)) comunes.delete(k);
}
for (const h of HORAS) res.set(h, res.get(h).filter(o => comunes.has(o.rolo)));
const cierreEOD = resCierre.filter(o => comunes.has(o.rolo));

function met(o) {
  if (o.length < 20) return null;
  let eq = 1, pico = 1, dd = 0;
  for (const x of o) { eq *= (1 + x.ret); pico = Math.max(pico, eq); dd = Math.max(dd, 1 - eq / pico); }
  const años = (new Date(o[o.length - 1].exp) - new Date(o[0].rolo)) / 365 / 864e5;
  return { n: o.length, anual: (eq ** (1 / años) - 1) * 100, dd, win: o.filter(x => x.ret > 0).length / o.length };
}
const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };


export { res, comunes, met, med, cierreEOD };
