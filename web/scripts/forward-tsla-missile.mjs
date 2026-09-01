// ╔══════════════════════════════════════════════════════════════════════════════════════════╗
// ║  TSLA's MISSILE — forward-test EN PAPEL, sólo TSLA                                        ║
// ╚══════════════════════════════════════════════════════════════════════════════════════════╝
//
// NO ejecuta órdenes. Registra en papel lo que la regla habría hecho, día a día.
//
// ╔═══ POR QUÉ EXISTE, SEPARADO DE LA TABLA MÁGICA ═══╗
// Lester, 2026-08-28: «así vamos a diferenciar el forward test de sólo TSLA y una estrategia
// sólo para TSLA de lo que saquemos de la tabla mágica».
//
// La tabla mágica, como regla general sobre muchos tickers, está CERRADA: falló dos exámenes
// fuera de muestra (−6,30% en 20 nombres tranquilos, −4,05% en 20 megacaps) y su lado dominante
// —las puts dentro del dinero con la acción bajo su media— pierde −5,21% con t=−5,36 sobre 580
// entradas independientes.
//
// PERO en TSLA el resultado es otro, y no se pudo tumbar:
//   · 34 señales, +11,34% por operación, acierta 82%, t=4,23
//   · SEIS de seis años positivos en la cuenta (2021 +39% · 2022 +13% · 2023 +32% · 2024 +3% ·
//     2025 +4% · 2026 +40%) → 22,2% al año con caída −10%
//   · y el apoyo que NO es circular: con 673 controles, los días CON golpe en TSLA dieron
//     +10,40% y los días SIN golpe −0,51%. La señal elige el día.
//
// ⚠️ Todo eso es EN MUESTRA, sobre el ticker alrededor del cual se construyó la regla, con 34
// operaciones. NO se puede validar con más historia — ya se gastó toda. Sólo se puede validar
// HACIA ADELANTE. Para eso existe este registro.
//
// ╔═══ PRE-REGISTRO · 2026-08-28 · NO TOCAR NADA DE ESTE BLOQUE ═══╗
//   SUBYACENTE   TSLA, y sólo TSLA.
//   EL GOLPE     una sola operación de más de $500.000, ejecutada AL ASK o por encima,
//                después de las 14:00 de Nueva York.
//   CONTRA EL OI el golpe vale 12 veces o más el interés abierto que ese contrato tenía la
//                víspera del golpe. Si el OI de la víspera es CERO, no hay señal.
//   EL CONTRATO  DENTRO del dinero · cuesta $10.000 o más · le quedan 5 días o más.
//   EL FILTRO    TSLA por debajo de su media de 20 días el día de la compra.
//   CUÁL         si hay varias el mismo día: UNA sola, la del vencimiento MÁS LEJANO
//                (empate → la más cerca del dinero).
//   COMPRA       el día siguiente al golpe, AL ASK del cierre.
//   SALIDA       lo que ocurra PRIMERO, revisado cada día al cierre:
//                  · la opción llega a 1,50x lo pagado  → se cierra a 1,50x
//                  · la opción cae a 0,50x lo pagado    → se cierra a 0,50x
//                  · TSLA se ha movido a favor un 8% si la cinta CONFIRMA, o un 12% si NO
//                  · 60 días de mercado desde la compra
//                se vende siempre AL BID.
//   CONFIRMA     la dominancia de la cinta del día del golpe va a favor de la señal (>= 0,30)
//                O el contrato recibió entre 2 y 9 golpes ese día.
//   TAMAÑO       25% del capital · el DOBLE (50%) si confirma · 4 huecos como máximo.
//   CAPITAL      $60.000 iniciales. El efectivo ocioso NO rinde en este registro (0%), para que
//                el resultado sea el de la SEÑAL y no el del aparcadero. Lo de aparcar en SPY
//                está medido aparte y se puede sumar después.
//
// ╔═══ LO QUE EL BACKTEST DICE QUE DEBE PASAR ═══╗
//   · ~6 señales al año (34 en 5,6 años). En 2024 hubo CERO: eso es normal, no un fallo.
//   · 82% de acierto · +11,34% por operación
//   · el peor año en la cuenta fue +3%; ningún año negativo
//   · ⚠️ con 6 señales al año esto necesita AÑOS para ser concluyente. Cualquier lectura de
//     «funciona» antes de ~30 operaciones nuevas es prematura, incluida la mía.
//
// ╔═══ DETALLES DE DATOS QUE COSTARON TIEMPO ═══╗
//   · El precio de TSLA se saca por PARIDAD PUT-CALL de la cadena, igual que el backtest, y la
//     serie se guarda en el ledger. Usar el cierre de la acción sería más cómodo pero metería
//     una diferencia con el backtest que luego habría que explicar.
//   · La API devuelve los campos ENTRECOMILLADOS y el lado como "PUT"/"CALL", no P/C. Sin
//     normalizarlo las claves salen como 510|PUT y no casan con nada: cero señales, cero errores.
//   · El endpoint de acciones acepta como MÁXIMO 365 días por petición.
//   · Un 478 «Invalid session ID» llega con cuerpo, no siempre con código de error. Si no se
//     lanza, una sesión caída se ve exactamente igual que «hoy no hubo señal».
//
// Uso:  node scripts/forward-tsla-missile.mjs
//       node scripts/forward-tsla-missile.mjs --dia 2026-03-25
//       node scripts/forward-tsla-missile.mjs --dia 2026-03-25 --seco   (no guarda nada)
import {
  B, SYM, LEDGER, REDIS_KEY, STORE, SECO, CAPITAL_INICIAL, GOLPE_MIN, VS_OI_MIN, COSTE_MIN, DTE_MIN, HORA_MIN, MA_DIAS, MA_MIN, HUECOS, TAM, OBJETIVO, SUELO, MOV_CONFIRMA, MOV_NO, TOPE_DIAS, DOM_MIN, GOLPES_MIN, GOLPES_MAX, arg, limpia, lado, ymd, iso, ms, dteDe, D, dormir, csv, cadena, spotDeCadena, golpesDe, oiDe, diaAnterior, sembrarSpots, ultimaSesion,
} from "./missile-lib.mjs";

// ── almacenamiento ───────────────────────────────────────────────────────────
let _redis = null;
async function redis() {
  if (!_redis) {
    if (!process.env.REDIS_URL) throw new Error('MISSILE_STORE=redis pero falta REDIS_URL');
    const { default: Redis } = await import('ioredis');
    _redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 3 });
  }
  return _redis;
}
async function leer() {
  const vacio = { operaciones: [], spots: {}, creado: null };
  if (STORE === 'redis') {
    const c = await (await redis()).get(REDIS_KEY);
    if (c) return JSON.parse(c);
    try { return JSON.parse(fs.readFileSync(LEDGER, 'utf8')); } catch { return vacio; }
  }
  try { return JSON.parse(fs.readFileSync(LEDGER, 'utf8')); } catch { return vacio; }
}
async function guardar(L, reporte, resumen) {
  if (SECO) { console.log('\n  --seco: NO se ha guardado nada\n'); return; }
  if (STORE === 'redis') {
    const r = await redis();
    await r.set(REDIS_KEY, JSON.stringify(L));
    if (reporte) await r.set(REDIS_KEY + ':report', reporte);
    const { escribirLatido } = await import('../lib/origenEjecucion.ts');
    await escribirLatido(r, 'tsla-missile', resumen);
    return;
  }
  if (!fs.existsSync(path.dirname(LEDGER))) fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
  fs.writeFileSync(LEDGER, JSON.stringify(L, null, 1), 'utf8');
}
function origen() {
  const MARCAS = ['RAILWAY_SERVICE_ID', 'RAILWAY_DEPLOYMENT_ID', 'RAILWAY_ENVIRONMENT_ID', 'RAILWAY_PROJECT_ID', 'RAILWAY_REPLICA_ID'];
  return MARCAS.some((k) => process.env[k]) ? 'railway:' + (process.env.RAILWAY_SERVICE_NAME || '?') : 'local';
}

/** el día de mercado anterior CON datos de cadena */

(async () => {
  const pedido = arg('--dia');
  const HOY = pedido ? ymd(pedido) : await ultimaSesion();
  if (!HOY) throw new Error('no se encontro ninguna sesion cerrada con datos en los ultimos 8 dias');
  console.log("\n  ╔═══ TSLA's MISSILE ═══╗   día " + iso(HOY) + '   ·   origen ' + origen() + '   ·   store ' + STORE + '\n');

  const L = await leer();
  if (!L.spots) L.spots = {};
  if (!L.operaciones) L.operaciones = [];
  if (!L.creado) L.creado = new Date().toISOString();

  const chHoy = await cadena(HOY);
  if (!chHoy) { console.log('  no hay cadena de hoy (festivo o mercado cerrado). No se hace nada.\n'); return; }
  const spotHoy = spotDeCadena(chHoy, HOY);
  if (spotHoy == null) throw new Error('no se pudo sacar el precio por paridad — NO se sigue a ciegas');
  L.spots[HOY] = spotHoy;
  console.log('  TSLA por paridad: $' + spotHoy.toFixed(2));

  // ── la media de 20 días ────────────────────────────────────────────────────
  let previos = Object.keys(L.spots).filter((d) => d < HOY).sort().slice(-MA_DIAS);
  if (previos.length < MA_MIN) {
    console.log('  sembrando la serie de precios (faltan días para la media)…');
    const n = await sembrarSpots(L, HOY);
    console.log('    ' + n + ' días añadidos');
    previos = Object.keys(L.spots).filter((d) => d < HOY).sort().slice(-MA_DIAS);
  }
  let ma = null, bajoMedia = null;
  if (previos.length >= MA_MIN) {
    ma = previos.reduce((s, d) => s + L.spots[d], 0) / previos.length;
    bajoMedia = spotHoy < ma;
    console.log('  media de ' + previos.length + ' días: $' + ma.toFixed(2) + '  →  ' + (bajoMedia ? 'POR DEBAJO ✓' : 'por encima ✗'));
  } else {
    console.log('  ⚠️ sólo ' + previos.length + ' días de precio (hacen falta ' + MA_MIN + '). Hoy no se evalúa el filtro.');
  }

  // ── gestionar lo abierto ───────────────────────────────────────────────────
  const dias = Object.keys(L.spots).sort();
  for (const o of L.operaciones.filter((x) => x.estado === 'abierta')) {
    const q = chHoy[o.exp] && chHoy[o.exp][o.K + '|' + o.l];
    if (!q) { console.log('  ⚠️ ' + o.exp + ' ' + o.K + o.l + ': hoy no cotiza. Se deja abierta.'); continue; }
    const bid = q[0], mult = bid / o.ask;
    const abierta = dias.filter((d) => d > o.dC && d <= HOY).length;
    const mov = o.l === 'P' ? (o.spot - spotHoy) / o.spot : (spotHoy - o.spot) / o.spot;
    const objMov = o.confirma ? MOV_CONFIRMA : MOV_NO;
    let cerrar = null, mCierre = mult;
    if (mult >= OBJETIVO) { cerrar = 'objetivo 1,50x'; mCierre = OBJETIVO; }
    else if (mult <= SUELO) { cerrar = 'suelo 0,50x'; mCierre = SUELO; }
    else if (mov >= objMov) cerrar = 'la acción se movió ' + (100 * mov).toFixed(1) + '% a favor';
    else if (abierta >= TOPE_DIAS) cerrar = 'tope de ' + TOPE_DIAS + ' días';
    o.ultimoBid = bid; o.ultimoMult = Math.round(mult * 1000) / 1000; o.diasAbierta = abierta;
    if (cerrar) {
      o.estado = 'cerrada'; o.dSal = HOY; o.multSal = Math.round(mCierre * 1000) / 1000;
      o.motivo = cerrar; o.resultado = Math.round(o.dinero * (mCierre - 1));
      console.log('  CIERRA  ' + o.exp + ' ' + o.K + o.l + '  ×' + mCierre.toFixed(2) + '  ' + D(o.resultado) + '  (' + cerrar + ')');
    } else {
      console.log('  abierta ' + o.exp + ' ' + o.K + o.l + '  ×' + mult.toFixed(2) + '  día ' + abierta + '/' + TOPE_DIAS +
                  '  ·  acción ' + (100 * mov).toFixed(1) + '% de ' + (100 * objMov).toFixed(0) + '%');
    }
  }

  // ── ¿hay señal nueva? el golpe fue AYER, se compra HOY ─────────────────────
  const yaAbiertas = L.operaciones.filter((o) => o.estado === 'abierta').length;
  if (bajoMedia !== true) {
    console.log('\n  sin señal: ' + (bajoMedia === null ? 'falta historia de precio' : 'TSLA NO está bajo su media de 20'));
  } else if (yaAbiertas >= HUECOS) {
    console.log('\n  sin señal: los ' + HUECOS + ' huecos están llenos');
  } else {
    const AYER = await diaAnterior(HOY);
    const ANTEAYER = AYER ? await diaAnterior(AYER) : null;
    if (!AYER || !ANTEAYER) throw new Error('no se pudo determinar el día anterior — NO se opera a ciegas');
    const cinta = await golpesDe(AYER);
    const oi = await oiDe(ANTEAYER);
    if (!oi.size) throw new Error('sin interés abierto de ' + iso(ANTEAYER) + ' — el filtro 12x no se puede evaluar');

    // dominancia del día del golpe: sobre TODA la cinta, comprada al ask o vendida al bid
    // La dominancia del backtest se calcula SOLO sobre operaciones de $500.000 o mas: su fichero
    // de flujo ya venia filtrado por el descargador. Calcularla sobre la cinta entera (426.185
    // operaciones un dia normal) da otro numero, y eso cambia el TAMANO de la posicion y la
    // SALIDA (8% vs 12%). Cazado el 2026-08-28 validando contra el 2026-03-25.
    let al = 0, ba = 0, nDom = 0;
    for (const o of cinta) {
      if (o.prima < GOLPE_MIN) continue;
      const c = o.precio >= o.ask, v = o.precio <= o.bid;
      if (!(o.bid > 0 && o.ask > 0) || (!c && !v)) continue;
      nDom++;
      if ((o.l === 'C' && c) || (o.l === 'P' && v)) al += o.prima; else ba += o.prima;
    }
    const dom = nDom >= 5 ? (al - ba) / (al + ba) : null;

    // agregar por contrato SÓLO las operaciones que ya pasan el listón de $500.000
    const porContrato = new Map();
    for (const o of cinta) {
      if (o.precio < o.ask) continue;              // al ask o por encima
      if (o.prima < GOLPE_MIN) continue;           // el listón va POR OPERACIÓN, antes de agregar
      if (o.hora < HORA_MIN) continue;
      if (dteDe(AYER, o.exp) < DTE_MIN) continue;
      const k = o.exp + '|' + o.K + '|' + o.l;
      const y = porContrato.get(k);
      if (y) { y.prima += o.prima; y.tam += o.tam; y.golpes++; }
      else porContrato.set(k, { exp: o.exp, K: o.K, l: o.l, prima: o.prima, tam: o.tam, golpes: 1 });
    }
    console.log('\n  cinta de ' + iso(AYER) + ': ' + cinta.length + ' operaciones · ' + porContrato.size +
                ' contratos con golpe de $500k+ al ask tras las ' + HORA_MIN +
                '  ·  dominancia ' + (dom == null ? 'sin datos' : dom.toFixed(3)));

    const candidatas = [];
    for (const c of porContrato.values()) {
      // vsOI EXACTO como el backtest: contratos del golpe / OI de la víspera.
      // OI cero → el backtest da null y la señal NO pasa. Se copia igual.
      const oiV = oi.get(c.exp + '|' + c.K + '|' + c.l) || 0;
      if (!(oiV > 0)) continue;
      const vsOI = c.tam / oiV;
      if (!(vsOI >= VS_OI_MIN)) continue;
      const dentro = c.l === 'C' ? c.K < spotHoy : c.K > spotHoy;
      if (!dentro) continue;
      if (dteDe(HOY, c.exp) < DTE_MIN) continue;
      const q = chHoy[c.exp] && chHoy[c.exp][c.K + '|' + c.l];
      if (!q || !(q[1] > 0)) continue;
      if (q[1] * 100 < COSTE_MIN) continue;
      candidatas.push({ ...c, oiV, vsOI, ask: q[1], bid: q[0], prof: Math.abs(c.K - spotHoy) / spotHoy });
    }
    console.log('  candidatas que pasan TODOS los filtros: ' + candidatas.length);
    for (const c of candidatas)
      console.log('     · ' + c.exp + ' ' + c.K + c.l + '  ask $' + c.ask.toFixed(2) + '  ' + c.vsOI.toFixed(1) + 'x OI ' + c.oiV + '  ' + c.golpes + ' golpes');

    if (candidatas.length) {
      candidatas.sort((a, b) => (Number(b.exp) - Number(a.exp)) || (a.prof - b.prof));
      const c = candidatas[0];
      const acorde = dom == null ? 0 : (c.l === 'P' ? -1 : 1) * dom;
      const confirma = acorde >= DOM_MIN || (c.golpes >= GOLPES_MIN && c.golpes <= GOLPES_MAX);
      const realizado = L.operaciones.filter((o) => o.estado === 'cerrada').reduce((s, o) => s + (o.resultado || 0), 0);
      const patrimonio = CAPITAL_INICIAL + realizado;
      const tope = patrimonio * TAM * (confirma ? 2 : 1);
      const n = Math.floor(tope / (c.ask * 100));
      if (n < 1) {
        console.log('  ⚠️ la señal existe pero NO CABE: el contrato cuesta ' + D(c.ask * 100) + ' y el tope es ' + D(tope));
      } else {
        L.operaciones.push({
          dia: AYER, dC: HOY, exp: c.exp, K: c.K, l: c.l, spot: spotHoy, ma: ma == null ? null : Math.round(ma * 100) / 100,
          ask: c.ask, bidCompra: c.bid, prof: Math.round(c.prof * 10000) / 10000, dte: dteDe(HOY, c.exp),
          prima: Math.round(c.prima), contratosGolpe: c.tam, golpes: c.golpes, oiVispera: c.oiV,
          vsOI: Math.round(c.vsOI * 10) / 10, dominancia: dom == null ? null : Math.round(dom * 1000) / 1000,
          confirma, contratos: n, dinero: Math.round(n * c.ask * 100), estado: 'abierta',
          registradoEn: new Date().toISOString(), origen: origen(),
        });
        console.log('\n  🚀 COMPRA  ' + c.exp + ' ' + c.K + c.l + '  ·  ' + n + ' contratos a $' + c.ask.toFixed(2) + ' = ' + D(n * c.ask * 100));
        console.log('     golpe de ' + D(c.prima) + ' (' + c.tam + ' contratos) · ' + c.vsOI.toFixed(1) + 'x el OI de la víspera (' + c.oiV + ') · ' + c.golpes + ' golpes');
        console.log('     ' + (confirma ? 'CONFIRMA → tamaño doble, sale al 8%' : 'no confirma → tamaño normal, sale al 12%'));
      }
    }
  }

  // ── el estado ──────────────────────────────────────────────────────────────
  const cer = L.operaciones.filter((o) => o.estado === 'cerrada');
  const abi = L.operaciones.filter((o) => o.estado === 'abierta');
  const realizado = cer.reduce((s, o) => s + (o.resultado || 0), 0);
  const invertido = abi.reduce((s, o) => s + o.dinero, 0);
  const flotante = abi.reduce((s, o) => s + (o.ultimoMult != null ? o.dinero * (o.ultimoMult - 1) : 0), 0);
  const gana = cer.filter((o) => (o.resultado || 0) > 0).length;
  const valor = CAPITAL_INICIAL + realizado + flotante;
  let rep = '';
  const linea = (s) => { console.log(s); rep += s + '\n'; };
  console.log('');
  linea('  ══ ESTADO DEL REGISTRO ══');
  linea('  abierto desde: ' + L.creado.slice(0, 10) + '   ·   operaciones: ' + L.operaciones.length +
        ' (' + cer.length + ' cerradas, ' + abi.length + ' abiertas)');
  if (cer.length) linea('  cerradas: ' + gana + ' ganadoras de ' + cer.length + ' (' + (100 * gana / cer.length).toFixed(0) + '%)   ·   realizado ' + D(realizado));
  if (abi.length) linea('  abiertas: ' + D(invertido) + ' invertidos   ·   flotante ' + D(flotante));
  linea('  valor de la cuenta: ' + D(valor) + '   (de ' + D(CAPITAL_INICIAL) + ')');
  linea('  ⚠️ ~6 señales al año. Antes de ~30 operaciones nuevas, cualquier lectura es prematura.');
  console.log('');

  await guardar(L, rep, L.operaciones.length + ' operaciones · ' + abi.length + ' abiertas · valor ' + D(valor));
  if (!SECO) console.log('  guardado en ' + (STORE === 'redis' ? 'Redis, key "' + REDIS_KEY + '"' : LEDGER) + '\n');
  if (_redis) await _redis.quit();
})().catch((e) => { console.error('\n  ⛔ ' + e.message + '\n'); process.exit(1); });
