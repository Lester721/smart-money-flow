// EL HOYO DE LA MAÑANA, PERO SÓLO DENTRO DEL PATRÓN
//
// ═══ DE DÓNDE SALE LA PREGUNTA ══════════════════════════════════════════════════════════════
//
// Eduardo ganó cuatro calls 0DTE de SPXW el viernes 21 de agosto de 2026 y dijo que las eligió
// por el GEX. La medición anterior probó la FORMA de su operación (comprar una call X puntos por
// encima a la hora E y venderla a la hora S) repetida A CIEGAS todos los días: pierde −2,43% por
// operación con un 34% de aciertos.
//
// Lester, con razón: «la regla de Eduardo te aseguro que no es comprar una call a las diez y
// venderla a mediodía. Algo tuvo que haber visto el GEX».
//
// La hipótesis de este fichero es de DOS PISOS:
//
//   PISO 1 — EL PERMISO (el GEX):  el precio abre POR DEBAJO del imán (el strike con más interés
//            abierto cerca del dinero) Y POR DEBAJO del punto de giro de gamma. Si los muros de
//            arriba tiran, hay sitio para subir.
//   PISO 2 — EL DISPARADOR (el hoyo):  y SÓLO en esos días, esperar a que el precio haya caído
//            un X% a la hora T. Eduardo no compró en la apertura: compró después de un hoyo de
//            12 puntos, entre las 09:55 y las 10:05.
//
// ═══ DOS COSAS QUE SALTARON AL MEDIR Y QUE CAMBIAN LA DEFINICIÓN ════════════════════════════
//
// (1) EL IMÁN DEL ENCARGO ESTÁ EN EL FILO DE LA NAVAJA. El encargo daba, para el 21, imán en
//     7700 → +0,336%. Eso sale con el spot de las 09:30 (7674,18). Pero la barra de las 09:30
//     NO EXISTE en los 1.123 días históricos: allí la primera es las 09:35. Y con el spot de las
//     09:35 del 21 (7666,99) el imán salta a 7520 → −1,917%, o sea al otro lado del precio.
//     El motivo: el imán de perfilGex() es el strike con más OI dentro de ±2%, y el 21 había
//     7520 con 14.979 contratos contra 7700 con 13.993. A 7674,18 el suelo del ±2% cae en
//     7520,70 y 7520 queda FUERA por setenta céntimos; a 7666,99 el suelo cae en 7513,65 y 7520
//     entra y gana. Siete puntos de índice le dan la vuelta al «patrón» entero.
//     Por eso aquí se miden DOS permisos: el del encargo (imán a ±2%) y uno ROBUSTO (imán a ±1%,
//     que da 7700 con los dos spots). El robusto es el que de verdad contiene al 21.
//
// (2) EL HOYO DE EDUARDO TAMPOCO EXISTE MEDIDO DESDE LAS 09:35. Los 12 puntos de caída se
//     cuentan desde la apertura de las 09:30. Desde las 09:35 el 21 apenas se movió por la
//     mañana. Así que se miden DOS disparadores: la caída desde las 09:35 y la caída desde el
//     MÁXIMO acumulado del día hasta T (un hoyo de verdad, sin depender de dónde se ponga el
//     punto de partida).
//
// ═══ LAS CUATRO COMPARACIONES QUE DECIDEN ═══════════════════════════════════════════════════
//
//   (a) el PATRÓN solo, sin hoyo      — comprar a la hora T en los días con permiso
//   (b) el HOYO solo, sin patrón      — comprar tras la caída, en TODOS los días
//   (c) los DOS juntos                — la regla de dos pisos
//   (d) el hoyo en los días donde el patrón dice LO CONTRARIO (imán y giro POR DEBAJO)
//
// Si (c) no bate claramente a (a) y a (b), el GEX no aporta y el disparador es todo el efecto.
// Y si (b) y (d) se parecen, el patrón no filtra nada.
//
// ═══ LOS TRES CONTROLES DE LA CASA ══════════════════════════════════════════════════════════
//
// Sobre los días que dispararon el hoyo, el grupo «con permiso» se compara contra tres grupos
// del MISMO tamaño sacados de los mismos días:
//   · al AZAR (índice desplazado con paso fijo; los scripts de este proyecto no usan Math.random)
//   · emparejados por TAMAÑO de la cadena (totalContratos parecido) pero sin permiso
//   · emparejados por VOLATILIDAD del día (cuna al dinero a las 09:35, al ask, sobre el índice)
// Y además contra el complemento entero (todos los días de hoyo SIN permiso).
//
// ═══ REGLAS DE LA CASA QUE SE CUMPLEN AQUÍ ══════════════════════════════════════════════════
//
//  · Se compra al ASK y se vende al BID — lo hace operar(), no se puede desactivar.
//  · Sólo se mira el pasado: el permiso sale del OI del ARRANQUE del día y del spot de las 09:35;
//    el disparador, de las barras hasta T. Nunca de una barra posterior.
//  · Un hueco no es un cero: si falta un precio la operación se descarta y se cuenta aparte.
//  · Ningún precio sale de un modelo.
//  · Todo en dólares al año con UN contrato y calendario real (244 días de mercado al año).
//  · Nunca la media sola: mediana, peor día, año a año, mitades, tercios y SIN los 5 mejores.
//
//   node --import tsx scripts/p7-el-hoyo-dentro-del-patron.mjs

import {
  diasDisponibles, cargarDia, cargarDia21, perfilGex, operar,
  hayHora, rejilla, compraEn, resumen,
} from "./lib0dte.mjs";

// ── la rejilla ────────────────────────────────────────────────────────────────────────────────
const TS = ["09:45", "09:50", "09:55", "10:00", "10:05", "10:15", "10:30"];  // hora del disparo
const SS = ["11:00", "11:30", "12:00", "12:30", "13:00", "14:00", "15:55"];  // hora de salida
const DS = [0, 0.20];              // el strike, en % POR ENCIMA del precio (0,20% ≈ 15 pts)
const XS = [0.03, 0.05, 0.10, 0.15, 0.20, 0.30, 0.40];                       // el hoyo, en %
const MODOS = ["abs", "dd"];       // abs = caída desde 09:35 · dd = caída desde el máximo del día
const DIAS_ANO = 244;

// La celda de Eduardo, fijada de antemano: strike ~15 pts arriba, dispara a las 10:05 con un
// hoyo de 0,15% desde la apertura, sale a las 12:00.
const EDU = { D: 0.20, T: "10:05", X: 0.15, S: "12:00", M: "abs" };

const kOp = (D, T, S) => `${D}|${T}|${S}`;

/** El strike con más OI total dentro de ±radio del spot. Devuelve la distancia en %. */
function imanRadio(oi, spot, radio) {
  const porK = new Map();
  for (const [clave, n] of Object.entries(oi)) {
    if (!(n > 0)) continue;
    const K = Number(clave.split("|")[0]);
    if (!(K > 0)) continue;
    if (Math.abs((K - spot) / spot) > radio) continue;
    porK.set(K, (porK.get(K) ?? 0) + n);
  }
  let mejor = null;
  for (const [K, n] of porK) if (!mejor || n > mejor.n) mejor = { K, n };
  return mejor ? { K: mejor.K, pct: ((mejor.K - spot) / spot) * 100 } : null;
}

// ═══ 1. UNA SOLA PASADA POR LOS 1.123 DÍAS ══════════════════════════════════════════════════

const dias = diasDisponibles();
console.log(`días con cadena 0DTE: ${dias.length}  (${dias[0]} … ${dias[dias.length - 1]})`);

const fichas = [];                 // una por día
let sinOI = 0, sinPerfil = 0, nulos = 0, huecos = 0, opsOk = 0;
const costes = [];
const t0 = Date.now();

for (const nombre of dias) {
  const d = cargarDia(nombre);
  if (!d) { nulos++; continue; }
  if (!d.oi) { sinOI++; continue; }

  const spot0 = d.barras[0].spot;                       // 09:35 — la barra de las 09:30 NO existe
  const p = perfilGex(d.oi, spot0);
  if (!p || p.imanPct == null || p.giroPct == null) { sinPerfil++; continue; }
  const im1 = imanRadio(d.oi, spot0, 0.01);
  if (!im1) { sinPerfil++; continue; }

  // volatilidad del propio día: la cuna al dinero a las 09:35, al ask, sobre el nivel del índice
  const Katm = rejilla(spot0);
  const cAtm = compraEn(d.barras[0], Katm, "C");
  const pAtm = compraEn(d.barras[0], Katm, "P");
  const vol = cAtm != null && pAtm != null ? ((cAtm + pAtm) / spot0) * 100 : null;

  // los dos disparadores, a cada hora T
  const caida = { abs: {}, dd: {} };
  let maxHasta = spot0;
  const porHora = new Map(d.barras.map((b, i) => [b.t, i]));
  for (const T of TS) {
    const i = porHora.get(T);
    if (i == null) { caida.abs[T] = null; caida.dd[T] = null; continue; }
    let mx = spot0;
    for (let j = 0; j <= i; j++) mx = Math.max(mx, d.barras[j].spot);   // sólo el pasado
    caida.abs[T] = ((d.barras[i].spot - spot0) / spot0) * 100;
    caida.dd[T] = ((d.barras[i].spot - mx) / mx) * 100;
  }

  // todas las operaciones de la rejilla, una vez por día
  const res = new Map();
  for (const D of DS) {
    for (const T of TS) {
      const iT = porHora.get(T);
      if (iT == null) continue;
      const K = rejilla(d.barras[iT].spot * (1 + D / 100));
      for (const S of SS) {
        const iS = porHora.get(S);
        if (iS == null || iS <= iT) continue;
        const o = operar(d, iT, iS, K, "C");
        if (!o) { huecos++; continue; }
        opsOk++;
        costes.push(o.coste);
        res.set(kOp(D, T, S), o.dolares);
      }
    }
  }

  fichas.push({
    dia: nombre,
    ano: +nombre.slice(0, 4),
    spot0,
    // PERMISO del encargo: imán a ±2% (el de perfilGex) y giro, los dos POR ENCIMA del precio
    permiso2: p.imanPct > 0 && p.giroPct > 0,
    contra2: p.imanPct < 0 && p.giroPct < 0,
    // PERMISO ROBUSTO: imán a ±1% y giro, los dos por encima. Es el que contiene al 21.
    permiso1: im1.pct > 0 && p.giroPct > 0,
    contra1: im1.pct < 0 && p.giroPct < 0,
    imanPct: p.imanPct, iman1Pct: im1.pct, giroPct: p.giroPct,
    desb05: p.desbalance05, conc: p.concentracion,
    tam: p.totalContratos, vol, caida, res,
  });
}

console.log(`cargados ${fichas.length} días en ${((Date.now() - t0) / 1000).toFixed(0)}s   ` +
  `(nulos ${nulos}, sin OI ${sinOI}, sin perfil ${sinPerfil})`);
console.log(`operaciones válidas ${opsOk}   huecos descartados ${huecos}`);
costes.sort((a, b) => a - b);
console.log(`coste de la call: mín $${costes[0].toFixed(2)}  mediana $${costes[costes.length >> 1].toFixed(2)}` +
  `  p95 $${costes[Math.floor(costes.length * 0.95)].toFixed(2)}  máx $${costes[costes.length - 1].toFixed(2)}`);

const ANOS = fichas.length / DIAS_ANO;
console.log(`ventana: ${fichas.length} días = ${ANOS.toFixed(2)} años de mercado`);

// ═══ 2. DÓNDE CAE EL 21 DE AGOSTO DENTRO DE TODO ════════════════════════════════════════════

const pct = (arr, v) => (arr.filter((x) => x < v).length / arr.length) * 100;
const imanes1 = fichas.map((f) => f.iman1Pct), giros = fichas.map((f) => f.giroPct);
const desbs = fichas.map((f) => f.desb05), conces = fichas.map((f) => f.conc);

const d21 = cargarDia21();
let p21 = null, im21 = null, s21 = 0;
console.log(`\n═══ EL 21 DE AGOSTO DENTRO DE LA HISTORIA ═══`);
if (d21) {
  const i35 = hayHora(d21, "09:35");
  s21 = d21.barras[i35].spot;
  p21 = perfilGex(d21.oi, s21);
  im21 = imanRadio(d21.oi, s21, 0.01);
  const p30 = perfilGex(d21.oi, d21.barras[hayHora(d21, "09:30")].spot);
  console.log(`  con el spot de las 09:30 (${d21.barras[0].spot.toFixed(2)}): imán±2% ${p30.imanK} → ${p30.imanPct.toFixed(3)}%   giro ${p30.giroPct.toFixed(3)}%`);
  console.log(`  con el spot de las 09:35 (${s21.toFixed(2)}): imán±2% ${p21.imanK} → ${p21.imanPct.toFixed(3)}%   giro ${p21.giroPct.toFixed(3)}%`);
  console.log(`  ↑ EL FILO DE LA NAVAJA: 7 puntos de índice le dan la vuelta al imán de ±2%.`);
  console.log(`  imán ROBUSTO (±1%) con el spot de las 09:35: ${im21.K} → ${im21.pct.toFixed(3)}%  (percentil ${pct(imanes1, im21.pct).toFixed(0)})`);
  console.log(`  giro ${p21.giroPct.toFixed(3)}% (percentil ${pct(giros, p21.giroPct).toFixed(0)})   ` +
    `desbalance ±0,5% ${p21.desbalance05.toFixed(3)} (percentil ${pct(desbs, p21.desbalance05).toFixed(0)})   ` +
    `concentración ${p21.concentracion.toFixed(3)} (percentil ${pct(conces, p21.concentracion).toFixed(0)})`);
}
for (const [nom, k] of [["±2% (el del encargo)", "permiso2"], ["±1% (robusto)", "permiso1"]]) {
  const n = fichas.filter((f) => f[k]).length;
  const c = fichas.filter((f) => f[k.replace("permiso", "contra")]).length;
  console.log(`  permiso ${nom}: ${n} de ${fichas.length} días = ${((n / fichas.length) * 100).toFixed(1)}%   ` +
    `contrarios ${c} = ${((c / fichas.length) * 100).toFixed(1)}%`);
}

// el hoyo del 21, medido de las dos formas
if (d21) {
  const s30 = d21.barras[0].spot;
  console.log(`  el hoyo del 21, hora a hora:`);
  let mx = s21;
  for (const T of TS) {
    const i = hayHora(d21, T);
    if (i < 0) continue;
    for (let j = hayHora(d21, "09:35"); j <= i; j++) mx = Math.max(mx, d21.barras[j].spot);
    console.log(`    ${T} spot ${d21.barras[i].spot.toFixed(2)}  desde 09:30 ${(((d21.barras[i].spot - s30) / s30) * 100).toFixed(3)}%` +
      `  desde 09:35 ${(((d21.barras[i].spot - s21) / s21) * 100).toFixed(3)}%  desde el máximo ${(((d21.barras[i].spot - mx) / mx) * 100).toFixed(3)}%`);
  }
}

// ═══ 3. LA CONTABILIDAD ═════════════════════════════════════════════════════════════════════

function ficha(sel, D, T, S) {
  const dols = [], anos = new Map();
  for (const f of sel) {
    const v = f.res.get(kOp(D, T, S));
    if (v == null) continue;
    dols.push(v);
    anos.set(f.ano, (anos.get(f.ano) ?? 0) + v);
  }
  const n = dols.length;
  if (n < 2) return { n, vacio: true };
  const r = resumen(dols);
  const orden = [...dols].sort((a, b) => a - b);
  const suma = dols.reduce((a, b) => a + b, 0);
  const sinTop5 = orden.slice(0, Math.max(0, n - 5)).reduce((a, b) => a + b, 0);
  const t3 = Math.floor(n / 3);
  const med = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
  return {
    n, media: r.media, t: r.t, aciertos: r.aciertos * 100,
    mediana: orden[n >> 1], peor: orden[0], mejor: orden[n - 1],
    suma, porAno: suma / ANOS, sinTop5Ano: sinTop5 / ANOS,
    mitad1: med(dols.slice(0, n >> 1)), mitad2: med(dols.slice(n >> 1)),
    tercios: [med(dols.slice(0, t3)), med(dols.slice(t3, 2 * t3)), med(dols.slice(2 * t3))],
    anos: [...anos.entries()].sort((a, b) => a[0] - b[0]),
  };
}

const linea = (nom, f) => f.vacio
  ? `${nom.padEnd(32)} n=${f.n}  (muestra insuficiente)`
  : `${nom.padEnd(32)} n=${String(f.n).padStart(4)}  media $${f.media.toFixed(2).padStart(8)}  t=${f.t.toFixed(2).padStart(6)}` +
    `  acierta ${f.aciertos.toFixed(0).padStart(2)}%  mediana $${f.mediana.toFixed(0).padStart(5)}` +
    `  peor $${f.peor.toFixed(0).padStart(6)}  $/año ${f.porAno.toFixed(0).padStart(7)}  sin top5 ${f.sinTop5Ano.toFixed(0).padStart(7)}`;

// los cuatro grupos de una celda, para un permiso dado
const grupos = (PER, D, T, S, X, M) => {
  const CON = PER === 1 ? "contra1" : "contra2", PRM = PER === 1 ? "permiso1" : "permiso2";
  const hoyo = (f) => f.caida[M][T] != null && f.caida[M][T] <= -X;
  return {
    a: fichas.filter((f) => f[PRM]),
    b: fichas.filter(hoyo),
    c: fichas.filter((f) => f[PRM] && hoyo(f)),
    d: fichas.filter((f) => f[CON] && hoyo(f)),
    e: fichas.filter((f) => !f[PRM] && hoyo(f)),   // el complemento: hoyo SIN permiso
  };
};

/** Media recortada: quita los 5 mejores días del grupo antes de promediar. */
function sinCinco(sel, D, T, S) {
  const v = sel.map((f) => f.res.get(kOp(D, T, S))).filter((x) => x != null).sort((a, b) => b - a).slice(5);
  return v.length >= 2 ? resumen(v) : null;
}

// ═══ 4. LA CELDA DE EDUARDO, FIJADA DE ANTEMANO ═════════════════════════════════════════════

for (const PER of [1, 2]) {
  console.log(`\n═══ LA CELDA DE EDUARDO con el permiso ${PER === 1 ? "ROBUSTO (imán ±1%)" : "DEL ENCARGO (imán ±2%)"} ═══`);
  console.log(`    (strike +${EDU.D}%, dispara a las ${EDU.T} con hoyo ≥${EDU.X}% desde 09:35, sale ${EDU.S})`);
  const g = grupos(PER, EDU.D, EDU.T, EDU.S, EDU.X, EDU.M);
  console.log(linea("(a) patrón solo, sin hoyo", ficha(g.a, EDU.D, EDU.T, EDU.S)));
  console.log(linea("(b) hoyo solo, sin patrón", ficha(g.b, EDU.D, EDU.T, EDU.S)));
  console.log(linea("(c) LOS DOS JUNTOS", ficha(g.c, EDU.D, EDU.T, EDU.S)));
  console.log(linea("(d) hoyo con patrón AL REVÉS", ficha(g.d, EDU.D, EDU.T, EDU.S)));
  console.log(linea("    todos los días, sin nada", ficha(fichas, EDU.D, EDU.T, EDU.S)));
  const fc = ficha(g.c, EDU.D, EDU.T, EDU.S);
  if (!fc.vacio) {
    console.log(`    año a año (c): ` + fc.anos.map(([a, v]) => `${a} $${v.toFixed(0)}`).join("  "));
    console.log(`    mitades (c): $${fc.mitad1.toFixed(0)} / $${fc.mitad2.toFixed(0)}   ` +
      `tercios: ${fc.tercios.map((x) => "$" + x.toFixed(0)).join(" / ")}`);
  }
}

// ═══ 5. LA REJILLA ENTERA ═══════════════════════════════════════════════════════════════════

function rejillaEntera(PER) {
  const filas = [];
  for (const M of MODOS) for (const D of DS) for (const T of TS) for (const S of SS) {
    if (S <= T) continue;
    for (const X of XS) {
      const g = grupos(PER, D, T, S, X, M);
      const fc = ficha(g.c, D, T, S);
      if (fc.vacio || fc.n < 30) continue;
      filas.push({ M, D, T, S, X, a: ficha(g.a, D, T, S), b: ficha(g.b, D, T, S), c: fc,
        d: ficha(g.d, D, T, S), e: ficha(g.e, D, T, S),
        cSin5: sinCinco(g.c, D, T, S), eSin5: sinCinco(g.e, D, T, S) });
    }
  }
  return filas;
}

let filasRobusto = null;
for (const PER of [1, 2]) {
  const filas = rejillaEntera(PER);
  if (PER === 1) filasRobusto = filas;
  console.log(`\n═══ LA REJILLA ENTERA — permiso ${PER === 1 ? "ROBUSTO (±1%)" : "DEL ENCARGO (±2%)"} ═══`);
  console.log(`  celdas con n≥30 en (c): ${filas.length}`);
  const pos = filas.filter((f) => f.c.media > 0).length;
  console.log(`  con media positiva: ${pos} (${((pos / filas.length) * 100).toFixed(0)}%)   ` +
    `con t>+2: ${filas.filter((f) => f.c.t > 2).length}   con t<−2: ${filas.filter((f) => f.c.t < -2).length}`);
  const m = (k) => filas.reduce((a, f) => a + (f[k].vacio ? 0 : f[k].media), 0) / filas.length;
  console.log(`  media de TODAS las celdas:  (c) los dos $${m("c").toFixed(2)}   (a) patrón solo $${m("a").toFixed(2)}   ` +
    `(b) hoyo solo $${m("b").toFixed(2)}   (d) al revés $${m("d").toFixed(2)}`);
  const ganaB = filas.filter((f) => !f.b.vacio && f.c.media > f.b.media).length;
  const ganaA = filas.filter((f) => !f.a.vacio && f.c.media > f.a.media).length;
  console.log(`  (c) bate a (b) en ${ganaB} de ${filas.length} = ${((ganaB / filas.length) * 100).toFixed(0)}%   ` +
    `(c) bate a (a) en ${ganaA} de ${filas.length} = ${((ganaA / filas.length) * 100).toFixed(0)}%   [sin aporte, ~50%]`);
  // LA PRUEBA LIMPIA: mismo hoyo, mismos días, CON permiso contra SIN permiso — y lo mismo
  // quitando los 5 mejores días de cada lado, que es donde murieron los hallazgos anteriores.
  const val = filas.filter((f) => !f.e.vacio && f.e.n >= 30);
  const gpe = val.filter((f) => f.c.media > f.e.media).length;
  const dif = val.map((f) => f.c.media - f.e.media).sort((a, b) => a - b);
  console.log(`  CON permiso bate a SIN permiso (mismos días de hoyo) en ${gpe} de ${val.length} = ` +
    `${((gpe / val.length) * 100).toFixed(0)}%   diferencia mediana $${dif[dif.length >> 1].toFixed(2)}`);
  const val5 = val.filter((f) => f.cSin5 && f.eSin5);
  const gpe5 = val5.filter((f) => f.cSin5.media > f.eSin5.media).length;
  const dif5 = val5.map((f) => f.cSin5.media - f.eSin5.media).sort((a, b) => a - b);
  console.log(`  lo mismo SIN los 5 mejores días de cada lado: ${gpe5} de ${val5.length} = ` +
    `${((gpe5 / val5.length) * 100).toFixed(0)}%   diferencia mediana $${dif5[dif5.length >> 1].toFixed(2)}`);
  const posC5 = val5.filter((f) => f.cSin5.media > 0).length;
  console.log(`  celdas de (c) que siguen positivas sin sus 5 mejores días: ${posC5} de ${val5.length} = ` +
    `${((posC5 / val5.length) * 100).toFixed(0)}%`);

  filas.sort((x, y) => y.c.t - x.c.t);
  console.log(`  las 6 mejores celdas de (c) por t:`);
  for (const f of filas.slice(0, 6)) {
    console.log(`   ${f.M} D+${f.D}% ${f.T}→${f.S} hoyo≥${f.X}%  (c) n=${String(f.c.n).padStart(3)} $${f.c.media.toFixed(2).padStart(7)}` +
      ` t=${f.c.t.toFixed(2).padStart(5)} $/año ${f.c.porAno.toFixed(0).padStart(6)} sinTop5 ${f.c.sinTop5Ano.toFixed(0).padStart(6)} | ` +
      `(b) $${f.b.media.toFixed(2).padStart(7)} | (a) $${f.a.media.toFixed(2).padStart(7)} | (d) $${(f.d.vacio ? NaN : f.d.media).toFixed(2).padStart(7)}`);
  }
  console.log(`  las 3 peores:  ` + filas.slice(-3).map((f) => `${f.M} D+${f.D}% ${f.T}→${f.S} X${f.X} n=${f.c.n} $${f.c.media.toFixed(0)} t=${f.c.t.toFixed(2)}`).join(" | "));
}

// ═══ 6. LOS TRES CONTROLES ══════════════════════════════════════════════════════════════════

function controles(PER, D, T, S, X, M, etiqueta) {
  const PRM = PER === 1 ? "permiso1" : "permiso2";
  const H = fichas.filter((f) => f.caida[M][T] != null && f.caida[M][T] <= -X && f.res.get(kOp(D, T, S)) != null);
  const P = H.filter((f) => f[PRM]);
  const R = H.filter((f) => !f[PRM]);
  const k = P.length;
  console.log(`\n─── controles de ${etiqueta}:  días con hoyo ${H.length}, con permiso ${k}, sin permiso ${R.length}`);
  if (k < 10 || R.length < k) { console.log(`    (no hay bastantes días para emparejar)`); return; }

  const paso = H.length / k, off = Math.floor(H.length / 3);
  const azar = [];
  for (let i = 0; i < k; i++) azar.push(H[(off + Math.floor(i * paso)) % H.length]);

  const empareja = (campo) => {
    const libres = R.filter((f) => f[campo] != null);
    const usados = new Set(), sel = [];
    for (const p of P) {
      if (p[campo] == null) continue;
      let mejor = null, dm = Infinity;
      for (let i = 0; i < libres.length; i++) {
        if (usados.has(i)) continue;
        const dd = Math.abs(libres[i][campo] - p[campo]);
        if (dd < dm) { dm = dd; mejor = i; }
      }
      if (mejor != null) { usados.add(mejor); sel.push(libres[mejor]); }
    }
    return sel;
  };

  const f = (arr) => {
    const v = arr.map((x) => x.res.get(kOp(D, T, S))).filter((x) => x != null);
    const r = resumen(v);
    return `n=${String(r.n).padStart(3)} media $${r.media.toFixed(2).padStart(7)} t=${r.t.toFixed(2).padStart(5)} acierta ${(r.aciertos * 100).toFixed(0)}%`;
  };
  console.log(`    CON permiso                      ${f(P)}`);
  console.log(`    control AZAR (mismo tamaño)      ${f(azar)}`);
  console.log(`    control TAMAÑO de cadena         ${f(empareja("tam"))}`);
  console.log(`    control VOLATILIDAD del día      ${f(empareja("vol"))}`);
  console.log(`    complemento entero (sin permiso) ${f(R)}`);
}

filasRobusto.sort((x, y) => y.c.t - x.c.t);
const mejor = filasRobusto[0];
controles(1, mejor.D, mejor.T, mejor.S, mejor.X, mejor.M, `la MEJOR celda robusta (${mejor.M} D+${mejor.D}% ${mejor.T}→${mejor.S} hoyo≥${mejor.X}%)`);
controles(1, EDU.D, EDU.T, EDU.S, EDU.X, EDU.M, `la celda de EDUARDO (permiso robusto)`);

// ═══ 7. FUERA DE MUESTRA: se elige con <2025, se comprueba en 2025-2026 ═════════════════════

const dentro = fichas.filter((f) => f.dia < "2025-01-01");
const fuera = fichas.filter((f) => f.dia >= "2025-01-01");
const anosD = dentro.length / DIAS_ANO, anosF = fuera.length / DIAS_ANO;
console.log(`\n═══ FUERA DE MUESTRA ═══  construcción ${dentro.length} días (${anosD.toFixed(2)} años), comprobación ${fuera.length} días (${anosF.toFixed(2)} años)`);

function evalua(sel, D, T, S, X, M, anos) {
  const v = sel.filter((f) => f.permiso1 && f.caida[M][T] != null && f.caida[M][T] <= -X)
    .map((f) => f.res.get(kOp(D, T, S))).filter((x) => x != null);
  if (v.length < 2) return null;
  const r = resumen(v);
  const orden = [...v].sort((a, b) => a - b);
  return { n: r.n, media: r.media, t: r.t, aciertos: r.aciertos * 100,
           porAno: v.reduce((a, b) => a + b, 0) / anos,
           sinTop5Ano: orden.slice(0, Math.max(0, v.length - 5)).reduce((a, b) => a + b, 0) / anos };
}

let mejorD = null;
for (const M of MODOS) for (const D of DS) for (const T of TS) for (const S of SS) {
  if (S <= T) continue;
  for (const X of XS) {
    const e = evalua(dentro, D, T, S, X, M, anosD);
    if (!e || e.n < 25) continue;
    if (!mejorD || e.t > mejorD.e.t) mejorD = { M, D, T, S, X, e };
  }
}
if (mejorD) {
  console.log(`  mejor celda construida SÓLO con <2025:  ${mejorD.M} D+${mejorD.D}% ${mejorD.T}→${mejorD.S} hoyo≥${mejorD.X}%`);
  console.log(`    dentro   n=${mejorD.e.n} media $${mejorD.e.media.toFixed(2)} t=${mejorD.e.t.toFixed(2)} acierta ${mejorD.e.aciertos.toFixed(0)}% $/año ${mejorD.e.porAno.toFixed(0)}`);
  const ef = evalua(fuera, mejorD.D, mejorD.T, mejorD.S, mejorD.X, mejorD.M, anosF);
  console.log(`    FUERA    ` + (ef ? `n=${ef.n} media $${ef.media.toFixed(2)} t=${ef.t.toFixed(2)} acierta ${ef.aciertos.toFixed(0)}% $/año ${ef.porAno.toFixed(0)} sinTop5 ${ef.sinTop5Ano.toFixed(0)}` : `muestra insuficiente`));
}
{
  const ed = evalua(dentro, EDU.D, EDU.T, EDU.S, EDU.X, EDU.M, anosD);
  const ef = evalua(fuera, EDU.D, EDU.T, EDU.S, EDU.X, EDU.M, anosF);
  console.log(`  la celda de Eduardo:  <2025 ` + (ed ? `n=${ed.n} $${ed.media.toFixed(2)} t=${ed.t.toFixed(2)}` : "—") +
    `   ≥2025 ` + (ef ? `n=${ef.n} $${ef.media.toFixed(2)} t=${ef.t.toFixed(2)}` : "—"));
  const ei = evalua(dentro, mejor.D, mejor.T, mejor.S, mejor.X, mejor.M, anosD);
  const em = evalua(fuera, mejor.D, mejor.T, mejor.S, mejor.X, mejor.M, anosF);
  console.log(`  la mejor celda del TOTAL partida en dos:  <2025 ` + (ei ? `n=${ei.n} $${ei.media.toFixed(2)} t=${ei.t.toFixed(2)}` : "—") +
    `   ≥2025 ` + (em ? `n=${em.n} $${em.media.toFixed(2)} t=${em.t.toFixed(2)}` : "—"));
}

// ═══ 8. EL 21 DE AGOSTO PASADO POR LA REGLA ═════════════════════════════════════════════════

if (d21 && p21 && im21) {
  console.log(`\n═══ EL PROPIO 21 PASADO POR LA REGLA ═══`);
  console.log(`  permiso ROBUSTO (imán±1% ${im21.pct.toFixed(3)}% y giro ${p21.giroPct.toFixed(3)}%): ${im21.pct > 0 && p21.giroPct > 0 ? "SÍ" : "NO"}`);
  console.log(`  permiso DEL ENCARGO (imán±2% ${p21.imanPct.toFixed(3)}%): ${p21.imanPct > 0 && p21.giroPct > 0 ? "SÍ" : "NO"}`);
  const iT = hayHora(d21, EDU.T), iS = hayHora(d21, EDU.S);
  const K = rejilla(d21.barras[iT].spot * (1 + EDU.D / 100));
  const o = operar(d21, iT, iS, K, "C");
  console.log(`  la operación de la regla ese día: call ${K} de ${EDU.T} a ${EDU.S} → ` +
    (o ? `coste $${o.coste.toFixed(2)} ingreso $${o.ingreso.toFixed(2)} = $${o.dolares.toFixed(0)}` : "hueco"));
}

// ═══ 9. LA AUTOPSIA DE LA MEJOR CELDA — ¿de dónde sale el dinero? ═══════════════════════════
//
// El encargo anterior mató dos hallazgos porque todo el dinero venía de 4 días de 259. Aquí se
// mira lo mismo: se quitan los 5 mejores días y se vuelve a comparar contra los controles.

{
  const { D, T, S, X, M } = mejor;
  console.log(`\n═══ AUTOPSIA DE LA MEJOR CELDA (${M} D+${D}% ${T}→${S} hoyo≥${X}%) ═══`);
  const H = fichas.filter((f) => f.caida[M][T] != null && f.caida[M][T] <= -X && f.res.get(kOp(D, T, S)) != null);
  const P = H.filter((f) => f.permiso1), R = H.filter((f) => !f.permiso1);
  const orden = [...P].sort((a, b) => b.res.get(kOp(D, T, S)) - a.res.get(kOp(D, T, S)));
  console.log(`  los 5 mejores días del grupo: ` +
    orden.slice(0, 5).map((f) => `${f.dia} $${f.res.get(kOp(D, T, S)).toFixed(0)}`).join("  "));
  const total = P.reduce((a, f) => a + f.res.get(kOp(D, T, S)), 0);
  const top5 = orden.slice(0, 5).reduce((a, f) => a + f.res.get(kOp(D, T, S)), 0);
  console.log(`  total del grupo $${total.toFixed(0)}   de los 5 mejores $${top5.toFixed(0)} = ` +
    `${((top5 / total) * 100).toFixed(1)}% del dinero, con 5 días de ${P.length}`);

  const sinTop = (arr) => {
    const o = [...arr].sort((a, b) => b.res.get(kOp(D, T, S)) - a.res.get(kOp(D, T, S))).slice(5);
    return resumen(o.map((f) => f.res.get(kOp(D, T, S))));
  };
  const rp = sinTop(P), rr = sinTop(R);
  console.log(`  SIN los 5 mejores de cada grupo:  con permiso n=${rp.n} $${rp.media.toFixed(2)} t=${rp.t.toFixed(2)}   ` +
    `sin permiso n=${rr.n} $${rr.media.toFixed(2)} t=${rr.t.toFixed(2)}`);

  const anos = new Map();
  for (const f of P) anos.set(f.ano, (anos.get(f.ano) ?? 0) + f.res.get(kOp(D, T, S)));
  console.log(`  año a año: ` + [...anos.entries()].sort((a, b) => a[0] - b[0]).map(([a, v]) => `${a} $${v.toFixed(0)}`).join("  "));
  const ac = P.filter((f) => f.res.get(kOp(D, T, S)) > 0).length;
  console.log(`  días ganadores ${ac} de ${P.length} = ${((ac / P.length) * 100).toFixed(0)}%   ` +
    `peor día $${orden[orden.length - 1].res.get(kOp(D, T, S)).toFixed(0)}`);
  const fp = ficha(P, D, T, S);
  console.log(`  mitades $${fp.mitad1.toFixed(0)} / $${fp.mitad2.toFixed(0)}   ` +
    `tercios ${fp.tercios.map((x) => "$" + x.toFixed(0)).join(" / ")}   mediana $${fp.mediana.toFixed(0)}`);

  // el retorno en % por operación — hay que rehacer la operación para tener el coste
  const rets = [], retsE = [];
  for (const [arr, dest] of [[P, rets], [R, retsE]]) {
    for (const f of arr) {
      const d = cargarDia(f.dia);
      const iT = d.barras.findIndex((b) => b.t === T), iS = d.barras.findIndex((b) => b.t === S);
      if (iT < 0 || iS < 0) continue;
      const o = operar(d, iT, iS, rejilla(d.barras[iT].spot * (1 + D / 100)), "C");
      if (o) dest.push(o.ret * 100);
    }
  }
  const rr2 = resumen(rets), re2 = resumen(retsE);
  console.log(`  retorno por operación: con permiso ${rr2.media.toFixed(2)}% (t=${rr2.t.toFixed(2)})   ` +
    `sin permiso ${re2.media.toFixed(2)}% (t=${re2.t.toFixed(2)})`);
}

console.log(`\nfin en ${((Date.now() - t0) / 1000).toFixed(0)}s`);
