// EL GEX NO DICE HACIA DÓNDE, DICE CUÁNTO — y eso nunca lo hemos medido.
//
// ═══ EL ERROR DE TODO LO ANTERIOR ═══════════════════════════════════════════════════════════
//
// Llevamos el proyecto entero haciéndole al GEX una pregunta que no contesta:
//
//     «¿el precio va hacia el muro?»          medido, NO (38,8% contra 43,2% de una raya al azar)
//     «¿viaja hacia el imán durante el día?»  medido, NO (46,1% contra 46,7% de una raya espejo)
//     «¿el punto de giro es una brújula?»     medido, NO (520 variantes, ninguna aguanta)
//
// Las tres son preguntas de DIRECCIÓN. Y la teoría de la gamma no habla de dirección. Dice que
// cuando el dealer está largo de gamma, cubrirse le obliga a vender en las subidas y comprar en
// las bajadas, y eso FRENA el movimiento. Es una afirmación sobre la VELOCIDAD, no sobre el rumbo.
//
// Así que la pregunta correcta, que aquí nadie ha hecho todavía, es:
//
//     ¿el índice se mueve MENOS cuando está pegado a un strike con mucho interés abierto
//      que cuando está lejos de todos?
//
// ═══ POR QUÉ ESTO IMPORTA MÁS QUE LA DIRECCIÓN ══════════════════════════════════════════════
//
// Porque Lester no necesita dirección: ya vende un cóndor. Al que vende un cóndor no le importa
// hacia dónde va el precio, le importa CUÁNTO se mueve. Un filtro que diga «hoy el precio está
// clavado» vale dinero directo sobre la estrategia que ya opera. Y uno que diga «hoy suelta»
// vale más todavía, porque le dice cuándo NO vender.
//
// ═══ LA NORMALIZACIÓN QUE FALTABA, Y QUE PUEDE EXPLICARLO TODO ══════════════════════════════
//
// Todas las mediciones anteriores median las distancias en PUNTOS o en % del índice. Eso mezcla
// días que no se pueden mezclar: un muro a 25 puntos es una pared en un día tranquilo y no es
// nada en un día salvaje. Aquí todo va en unidades del MOVIMIENTO ESPERADO DEL PROPIO DÍA.
//
// Ese movimiento esperado se lee sin ningún modelo: es el precio de la cuna al dinero a las
// 09:35 (call ATM al ask + put ATM al ask). Es lo que el mercado cobra por el movimiento de hoy.
// No es Black-Scholes, es un precio que existe en el fichero.
//
// ═══ LOS CONTROLES ══════════════════════════════════════════════════════════════════════════
//
// (a) EL ESPEJO: el OI que hay a la distancia OPUESTA respecto a la apertura, el mismo día y el
//     mismo instante. Como es el mismo momento del mismo día, ni la volatilidad ni la hora ni la
//     distancia recorrida pueden contaminar el contraste. Es el control más limpio que hay.
// (b) EL BARAJADO: el mapa de OI de otro día, recentrado por DISTANCIA a su propia apertura y no
//     por nivel en bruto — el SPX pasó de 4.700 a 7.700, y barajar niveles da otra regla en vez
//     de un control. Ese fallo ya se cometió una vez en este proyecto.
// (c) EL TAMAÑO: hay que separar «está cerca de un strike gordo» de «hoy la cadena entera es
//     gorda». Por eso el OI se divide siempre por el total del día: se mide forma, no tamaño.

import { diasDisponibles, cargarDia, rejilla, compraEn } from "./lib0dte.mjs";

const HORIZONTE = 6;          // 6 barras de 5 min = 30 minutos hacia delante
const DESPLAZA = 37;          // días de desplazamiento para el control barajado

const dias = diasDisponibles();
console.log(`## ${dias.length} días de SPXW 0DTE\n`);

// ── cargar todo una vez ─────────────────────────────────────────────────────
const cache = [];
let sinOi = 0, sinCuna = 0;
for (const dd of dias) {
  const d = cargarDia(dd);
  if (!d || !d.oi) { sinOi++; continue; }

  const b0 = d.barras[0];
  const K0 = rejilla(b0.spot);
  const c = compraEn(b0, K0, "C"), p = compraEn(b0, K0, "P");
  if (c == null || p == null || !(c + p > 0)) { sinCuna++; continue; }
  const esperado = c + p;                       // movimiento esperado del día, en puntos

  const mapa = new Map();
  let total = 0;
  for (const [clave, n] of Object.entries(d.oi)) {
    if (!(n > 0)) continue;
    const K = Number(clave.split("|")[0]);
    mapa.set(K, (mapa.get(K) ?? 0) + n);
    total += n;
  }
  if (!(total > 0)) { sinOi++; continue; }

  // SÓLO el camino del precio y el mapa de OI. Guardar las cadenas enteras de los 1.123 días
  // reventó la memoria de node a los 60 segundos: son ~560 strikes x 78 barras x 1.123 días.
  // Aquí el mapa se guarda como dos arrays ordenados por strike, para poder sumar por ventana
  // deslizante en vez de recorrer los 560 strikes en cada una de las 240.000 barras.
  const ks = [...mapa.keys()].sort((a, b) => a - b);
  cache.push({
    dia: dd,
    spots: d.barras.map((b) => b.spot),
    horas: d.barras.map((b) => b.t),
    ks,
    ns: ks.map((K) => mapa.get(K) / total),      // ya normalizado por el total del día
    esperado,
    spot0: b0.spot,
  });
}
console.log(`cargados ${cache.length} · sin OI ${sinOi} · sin cuna ${sinCuna}`);
const esps = cache.map((c) => c.esperado).sort((a, b) => a - b);
console.log(`movimiento esperado: mediana ${esps[Math.floor(esps.length / 2)].toFixed(1)} puntos ` +
            `(p10 ${esps[Math.floor(esps.length * 0.1)].toFixed(1)} · p90 ${esps[Math.floor(esps.length * 0.9)].toFixed(1)})\n`);

// ── cuánto OI hay «aquí»: la suma alrededor de un precio, en ±0,15 del esperado ─────────────
// Búsqueda binaria sobre los strikes ordenados: la versión que recorría los 560 strikes en cada
// barra hacía 136 millones de vueltas y no terminaba.
function pesoCerca(c, x) {
  const radio = 0.15 * c.esperado;
  const { ks, ns } = c;
  let lo = 0, hi = ks.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (ks[m] < x - radio) lo = m + 1; else hi = m; }
  let s = 0;
  for (let i = lo; i < ks.length && ks[i] <= x + radio; i++) s += ns[i];
  return s;
}

// ── recoger las observaciones ───────────────────────────────────────────────
const obs = [];
for (let k = 0; k < cache.length; k++) {
  const c = cache[k];
  const cBaraja = cache[(k + DESPLAZA) % cache.length];
  for (let i = 0; i + HORIZONTE < c.spots.length; i++) {
    const x = c.spots[i];
    const mov = Math.abs(c.spots[i + HORIZONTE] - x) / c.esperado;

    const aqui = pesoCerca(c, x);
    const espejo = pesoCerca(c, 2 * c.spot0 - x);
    const barajado = pesoCerca(cBaraja, cBaraja.spot0 + (x - c.spot0));

    obs.push({ t: c.horas[i], mov, aqui, espejo, barajado });
  }
}
console.log(`${obs.length.toLocaleString("es-ES")} observaciones · cada una: dónde está el precio ahora y cuánto se mueve en 30 min\n`);

const med = (v) => v.reduce((a, b) => a + b, 0) / v.length;
const sd = (v) => { const m = med(v); return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1)); };

// ── la escalera: cinco montones por cuánto OI hay pegado al precio ──────────
function escalera(campo, etiqueta) {
  const orden = [...obs].sort((a, b) => a[campo] - b[campo]);
  const paso = Math.floor(orden.length / 5);
  console.log(`### ${etiqueta}`);
  console.log(`  montón | OI pegado al precio | se mueve en 30 min | n`);
  const medias = [];
  for (let q = 0; q < 5; q++) {
    const trozo = orden.slice(q * paso, q === 4 ? orden.length : (q + 1) * paso);
    const oiMed = med(trozo.map((x) => x[campo]));
    const movMed = med(trozo.map((x) => x.mov));
    medias.push(movMed);
    console.log(`    ${q + 1}    |       ${(oiMed * 100).toFixed(2).padStart(5)}%        |       ${movMed.toFixed(4)}       | ${trozo.length.toLocaleString("es-ES")}`);
  }
  const dif = medias[4] - medias[0];
  const baja = medias.every((v, j) => j === 0 || v <= medias[j - 1]);
  const sube = medias.every((v, j) => j === 0 || v >= medias[j - 1]);
  console.log(`  del montón 1 al 5: ${dif >= 0 ? "+" : ""}${(dif * 100).toFixed(2)} puntos del movimiento esperado`);
  console.log(`  monótona: ${baja ? "SÍ, baja siempre" : sube ? "SÍ, sube siempre" : "NO"}\n`);
  return medias;
}

const mReal = escalera("aqui", "REAL — cuánto interés abierto hay pegado al precio ahora mismo");
const mEsp = escalera("espejo", "ESPEJO — el OI a la distancia opuesta, mismo día y mismo instante");
const mBar = escalera("barajado", "BARAJADO — el mapa de otro día recentrado por distancia");

console.log("### EL CONTRASTE QUE DECIDE\n");
console.log(`  caída del movimiento del montón 1 al montón 5:`);
console.log(`     real      ${((mReal[4] - mReal[0]) * 100).toFixed(2)}`);
console.log(`     espejo    ${((mEsp[4] - mEsp[0]) * 100).toFixed(2)}`);
console.log(`     barajado  ${((mBar[4] - mBar[0]) * 100).toFixed(2)}`);
console.log(`  Si el real no baja MÁS que el espejo y el barajado, el freno no existe.\n`);

// ── prueba pareada: la misma barra, real contra espejo ─────────────────────
const pares = obs.filter((o) => Math.abs(o.aqui - o.espejo) > 0.001);
const alto = pares.filter((o) => o.aqui > o.espejo).map((o) => o.mov);
const bajo = pares.filter((o) => o.aqui < o.espejo).map((o) => o.mov);
const tt = (med(alto) - med(bajo)) / Math.sqrt(sd(alto) ** 2 / alto.length + sd(bajo) ** 2 / bajo.length);
console.log("### LA PAREADA — misma barra del mismo día, más OI aquí que en el espejo o al revés\n");
console.log(`  con MÁS OI pegado  (n=${alto.length.toLocaleString("es-ES")}): se mueve ${med(alto).toFixed(4)}`);
console.log(`  con MENOS OI pegado (n=${bajo.length.toLocaleString("es-ES")}): se mueve ${med(bajo).toFixed(4)}`);
console.log(`  diferencia ${((med(alto) - med(bajo)) * 100).toFixed(2)} puntos del esperado · t=${tt.toFixed(2)}`);
console.log(`  ${med(alto) < med(bajo)
    ? "→ el precio se mueve MENOS donde hay más interés abierto: EL FRENO EXISTE"
    : "→ el precio se mueve IGUAL o MÁS donde hay más interés abierto: no hay freno"}\n`);

// ── por hora: la gamma de una 0DTE se dispara según avanza la sesión ───────
console.log("### POR HORA — la gamma de una 0DTE crece según se acerca el vencimiento\n");
console.log("  hora  | dif (más OI − menos OI) | t     | n");
for (const h of [...new Set(obs.map((o) => o.t))].sort()) {
  if (!/:(00|30)$/.test(h)) continue;
  const p = pares.filter((o) => o.t === h);
  const a = p.filter((o) => o.aqui > o.espejo).map((o) => o.mov);
  const b = p.filter((o) => o.aqui < o.espejo).map((o) => o.mov);
  if (a.length < 50 || b.length < 50) continue;
  const th = (med(a) - med(b)) / Math.sqrt(sd(a) ** 2 / a.length + sd(b) ** 2 / b.length);
  console.log(`  ${h} |         ${((med(a) - med(b)) * 100).toFixed(2).padStart(6)}         | ${th.toFixed(2).padStart(5)} | ${p.length}`);
}
