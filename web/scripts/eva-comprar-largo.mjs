// ¿SIRVE EVA PARA LO QUE VICTOR LA CONSTRUYÓ: ENCONTRAR CONTRATOS QUE MULTIPLIQUEN?
//
// Uso: node --max-old-space-size=6144 scripts/eva-comprar-largo.mjs
// Salida: scripts/eva-largo-filas.json  (lo puntúa eva-comprar-largo-puntuar.ts)
//
// ═══ POR QUÉ EXISTE ESTE TEST ═════════════════════════════════════════════════════════════
//
// Victor hizo el scorecard para detectar contratos que subieran mucho de valor DENTRO DE UN AÑO.
// Su fuerte es el swing trading. Todas las mediciones que se le han hecho a EVA hasta hoy fueron
// de lo contrario: VENDER prima a CORTO plazo. La medición grande (19.465 operaciones, 2026-08-15)
// remató que no separa — pero los dos subgrupos que pasaron el listón eran "contratos a ≤30 días"
// y "salidas adelantadas por vencimiento". Es decir: se midió el corto plazo y el lado vendedor.
//
// Nunca se ha medido comprando y aguantando meses. Este script mide eso.
//
// ═══ EL CRITERIO, ESCRITO ANTES DE MIRAR NINGÚN NÚMERO ════════════════════════════════════
//
// Escrito el 2026-08-16 de madrugada, con el script todavía sin correr. Está aquí para que no se
// pueda mover después de ver el resultado.
//
// LA MEDIDA ES PAREADA, y esto es lo más importante del diseño. No se mide "cuánto ganó la
// operación del flujo", porque eso lo decide sobre todo si el mercado subió. Se mide:
//
//        retorno(el contrato que compró el dinero grande)  −  retorno(su cubo de control)
//
// donde el cubo de control son TODOS los contratos comparables del mismo ticker, el mismo día, el
// mismo tipo (call/put), vencimiento parecido y prima parecida. Si el mercado sube, sube todo el
// cubo también: la resta lo cancela. Lo que queda es sólo la elección del contrato.
//
// PASA si, y sólo si, las cuatro condiciones de `pasarBarrera()`:
//   1. Muestra suficiente.
//   2. Ningún ticker pasa del 20%.
//   3. El MISMO SIGNO en los TRES tercios de tiempo. Tres tercios, no dos mitades.
//   4. |t| por encima del listón de Bonferroni para las pruebas declaradas.
//
// LAS 12 PRUEBAS, contadas de antemano para el listón:
//   · 4 horizontes (30/90/180/365 días) × 2 brazos = 8
//        brazo A = decil alto de EVA
//        brazo B = comprado contra la oferta (agresivo), sin usar EVA para nada
//   · 4 más a 180 días partiendo por tipo: A-calls, A-puts, B-calls, B-puts
//
// SI SALE NEGATIVO: se corre `potencia()` antes de decir nada. Si el efecto que buscamos es menor
// que el detectable, la respuesta honesta es "no lo pudimos ver", no "no existe".
//
// SI SALE POSITIVO: no se cree. Se ataca con una auditoría adversaria antes de contárselo a nadie.
// Un positivo aquí es una hipótesis.
//
// ═══ DECISIONES DE MEDICIÓN, Y POR QUÉ ════════════════════════════════════════════════════
//
// PRECIO DE ENTRADA: el ASK de cierre de ese día, de la cadena, para el contrato del flujo Y para
// todos los del cubo de control. El registro del flujo trae su propia horquilla del instante de la
// operación, que es más fiel a lo que pagó el que la hizo — pero el control no tiene instante, y
// comparar un precio intradía contra uno de cierre metería un sesgo que nadie vería. Se usa la
// MISMA fuente para los dos lados. Además es lo realista: uno ve la operación en la cinta y compra
// después, no al mismo tick.
//
// PRECIO DE SALIDA: el BID de cierre del día de salida. Se vende contra la puja, que es lo que de
// verdad cobras.
//
// CONTRATO AUSENTE EN LA CADENA DE SALIDA = PÉRDIDA TOTAL, no dato que falta. El descargador
// descarta los contratos con puja 0, así que su ausencia es justamente el peor resultado posible.
// Tirarlos sería tirar sistemáticamente a los perdedores: la trampa de supervivencia de manual.
// Medido antes de escribir esto: sólo el 0,7%–1,4% de los casos.
//
// VENCE ANTES DEL HORIZONTE: no entra en ese horizonte. No es un fallo — es que a ese contrato no
// se le puede aguantar ese plazo. Se aplica igual al tratamiento y al control.
//
// LO QUE ESTE TEST NO MIDE, y hay que decirlo cada vez:
//   · ESTRUCTURA (15% del peso de EVA) — necesita el open interest de toda la cadena.
//   · CONFIRMACIÓN (10%) — se calcula con barras posteriores: meterla sería mirar al futuro.
//   · Sólo 8 tickers (los que tienen cadena en disco) y sólo 2024-2026 (lo que cubre el flujo).
//   · Comisiones: cero. Robinhood no cobra por contrato; quedan ~$0,03 de tasas, que a estas
//     primas es ruido. La horquilla SÍ está dentro: se compra al ask y se vende al bid.

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";

const FDIR = "scripts/cache-theta/flujo-historico";
const CDIR = "scripts/cache-theta/cadenas";
const SALIDA = process.env.EVA_LARGO_SALIDA || "scripts/eva-largo-filas.json";

const HORIZONTES = [30, 90, 180, 365];
const PRIMA_MIN = Number(process.env.PRIMA_MIN || 3_000_000);
const DTE_MIN = Number(process.env.DTE_MIN || 0);        // 0 = todos; el corte se hace al puntuar
const CUBO_EXP_DIAS = 30;                                 // vencimiento del control: ±30 días
const CUBO_PRIMA_LO = 0.5, CUBO_PRIMA_HI = 2.0;           // prima del control: entre ½× y 2×
const CUBO_MIN = 5;                                       // menos de 5 comparables: no hay control

const sinG = (s) => String(s).replace(/-/g, "");
const aIso = (d) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
const ms = (ymd) => Date.parse(aIso(ymd) + "T00:00:00Z");

// ── Qué días hay en caché, por símbolo ──────────────────────────────────────
// La salida se ancla en el PRIMER día con cadena a partir del objetivo: si no, toda salida que
// cayera en sábado o festivo contaría como hueco.
const diasPorSimbolo = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/);
  if (!m) continue;
  (diasPorSimbolo.get(m[1]) ?? diasPorSimbolo.set(m[1], []).get(m[1])).push(m[2]);
}
for (const v of diasPorSimbolo.values()) v.sort();
const ULTIMO_DIA = Math.max(...[...diasPorSimbolo.values()].map((v) => Number(v[v.length - 1])));

function diaSalida(sym, objetivo) {
  const dias = diasPorSimbolo.get(sym);
  if (!dias) return null;
  let lo = 0, hi = dias.length - 1, res = null;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (dias[m] >= objetivo) { res = dias[m]; hi = m - 1; } else lo = m + 1; }
  if (!res) return null;
  return (ms(res) - ms(objetivo)) / 86_400_000 <= 10 ? res : null;   // salto >10 días: es un hueco
}

// ── SPLITS: el strike cambia y el contrato "desaparece" ─────────────────────
//
// NVDA hizo 10:1 el 2024-06-10: el strike 1200 pasó a ser 120. Como la salida se busca por la
// clave `strike|tipo`, un contrato comprado antes del split NO SE ENCUENTRA después — y "no está"
// se leía como puja cero, o sea −100%. Medido con audit-splits.mjs: de las filas que cruzaban el
// split, el 81-98% se contaban como pérdida total; de las que no, el 0,2-0,6%. Casi todas las
// "pérdidas totales" del test eran esto.
//
// Los splits se detectan solos mirando cómo cae el strike máximo de un día al siguiente, en vez de
// escribir una tabla a mano que se quedaría vieja. Un ratio ≥ 1,8 entre días consecutivos no ocurre
// por movimiento de mercado: los strikes listados no se reducen a la mitad de un día para otro.
function detectarSplits() {
  const out = [];
  for (const [sym, dias] of diasPorSimbolo) {
    let prev = 0;
    for (const d of dias) {
      if (d < "20231001") continue;                  // sólo el rango del test
      const c = cadena(sym, d);
      if (!c) continue;
      let maxK = 0;
      for (const grupo of Object.values(c))
        for (const clave of Object.keys(grupo)) {
          const k = Number(clave.slice(0, -2));
          if (k > maxK) maxK = k;
        }
      if (prev && maxK > 0 && prev / maxK >= 1.8) out.push({ sym, desde: d, ratio: prev / maxK });
      prev = maxK;
    }
  }
  return out;
}

/** Factor por el que hay que dividir el strike para buscarlo en la cadena de `dia`. */
function factorSplit(sym, diaEntrada, diaSalida) {
  let f = 1;
  for (const s of SPLITS)
    if (s.sym === sym && s.desde > diaEntrada && s.desde <= diaSalida) f *= s.ratio;
  return f;
}

// ── Caché de cadenas en memoria (1,5 GB no caben) ───────────────────────────
const cacheCad = new Map();
function cadena(sym, dia) {
  const k = `${sym}|${dia}`;
  const hit = cacheCad.get(k);
  if (hit !== undefined) { cacheCad.delete(k); cacheCad.set(k, hit); return hit; }   // LRU
  const f = `${CDIR}/${sym}_d${dia}.json`;
  const v = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
  cacheCad.set(k, v);
  if (cacheCad.size > 300) cacheCad.delete(cacheCad.keys().next().value);
  return v;
}

/**
 * Retorno de comprar al ask de entrada y vender al bid de salida. null = no medible.
 * `factor` = ratio de split entre la entrada y la salida (1 si no hubo).
 */
function retorno(cadEnt, cadSal, expYmd, clave, factor) {
  const ent = cadEnt?.[expYmd]?.[clave];
  if (!ent) return null;                     // sin precio de entrada no hay operación
  const ask = ent[1];
  if (!(ask > 0)) return null;
  let claveSal = clave;
  if (factor !== 1) {
    const [k, right] = [Number(clave.slice(0, -2)), clave.slice(-1)];
    claveSal = `${k / factor}|${right}`;
  }
  const sal = cadSal?.[expYmd]?.[claveSal];
  const bid = sal ? sal[0] : 0;              // AUSENTE = puja cero = pérdida total (ver cabecera)
  // Tras un split hay N veces más contratos: el retorno POR CONTRATO se compara con el ask de UNO,
  // así que el valor de la posición se multiplica por el factor.
  return (bid * factor - ask) / ask;
}

const claveAjustada = (clave, factor) =>
  factor === 1 ? clave : `${Number(clave.slice(0, -2)) / factor}|${clave.slice(-1)}`;

const SPLITS = detectarSplits();
console.log(SPLITS.length
  ? `splits detectados: ${SPLITS.map((s) => `${s.sym} ${s.desde} ${s.ratio.toFixed(1)}:1`).join(" · ")}`
  : "splits detectados: ninguno");
console.log("");

// ── Recorrido ───────────────────────────────────────────────────────────────
const ficheros = readdirSync(FDIR).filter((f) => f.endsWith(".json")).sort();
const filas = [];
const desc = { sinCadenaEntrada: 0, sinPrecioEntrada: 0, cuboPequeno: 0, sinSalida: 0, futuro: 0,
               venceAntesDeTodo: 0 };   // ni siquiera llega a 30 dias: el grueso del flujo es corto
let vistas = 0;

console.log(`Recorriendo ${ficheros.length} días de flujo · prima ≥ $${(PRIMA_MIN / 1e6).toFixed(0)}M\n`);

for (const f of ficheros) {
  const j = JSON.parse(readFileSync(`${FDIR}/${f}`, "utf8"));
  const sym = j.sym, entrada = j.dia;
  const notables = (j.notables || []).filter((n) => n.prima >= PRIMA_MIN);
  if (!notables.length) continue;
  const cadEnt = cadena(sym, entrada);
  if (!cadEnt) { desc.sinCadenaEntrada += notables.length; continue; }
  const msEnt = ms(entrada);

  // Índice del día: todos los contratos con su vencimiento, para armar cubos sin re-recorrer.
  const universo = [];
  for (const [exp, grupo] of Object.entries(cadEnt)) {
    const msExp = ms(exp);
    for (const [clave, ba] of Object.entries(grupo)) {
      const right = clave.slice(-1);
      if (ba[1] > 0) universo.push({ exp, msExp, clave, right, ask: ba[1] });
    }
  }

  for (const n of notables) {
    vistas++;
    const expYmd = sinG(n.exp);
    const clave = `${n.strike}|${n.right}`;
    const ent = cadEnt[expYmd]?.[clave];
    if (!ent || !(ent[1] > 0)) { desc.sinPrecioEntrada++; continue; }
    const askEnt = ent[1], bidEnt = ent[0];
    const msExp = ms(expYmd);
    const dte = Math.round((msExp - msEnt) / 86_400_000);
    if (dte < DTE_MIN) continue;

    // CUBO DE CONTROL: mismo ticker, mismo día, mismo tipo, vencimiento ±30d, prima entre ½× y 2×.
    // Se excluye el propio contrato: compararlo consigo mismo daría cero por construcción.
    const cubo = universo.filter((u) =>
      u.right === n.right &&
      Math.abs(u.msExp - msExp) <= CUBO_EXP_DIAS * 86_400_000 &&
      u.ask >= askEnt * CUBO_PRIMA_LO && u.ask <= askEnt * CUBO_PRIMA_HI &&
      !(u.exp === expYmd && u.clave === clave));
    if (cubo.length < CUBO_MIN) { desc.cuboPequeno++; continue; }

    // EL LADO, de la horquilla del instante de la operación (el flujo sí la trae).
    let lado = "medio";
    if (n.bid > 0 && n.ask > 0) {
      if (n.price >= n.ask - 1e-9) lado = "comprado";
      else if (n.price <= n.bid + 1e-9) lado = "vendido";
    } else lado = "sinBBO";

    const fila = {
      ticker: sym, dia: entrada, exp: n.exp, strike: n.strike, right: n.right,
      // `ts` y `condition` NO son adorno: los pide el scorecard. timingScore() usa la hora de la
      // operacion y legScore() usa la condicion para saber si era una pata de varias. Sin ellos no
      // se puede puntuar a EVA con SUS funciones, que es todo el objetivo del test.
      ts: n.ts, condition: n.condition,
      dte, prima: n.prima, size: n.size, oi: n.oi, lado,
      askEnt, bidEnt, spreadRel: askEnt > 0 ? (askEnt - bidEnt) / askEnt : null,
      precioOper: n.price, bidOper: n.bid, askOper: n.ask,
      cubo: cubo.length,
      h: {},                       // por horizonte: {tratamiento, control, diferencia, ausente}
    };

    for (const H of HORIZONTES) {
      const objetivo = sinG(new Date(msEnt + H * 86_400_000).toISOString().slice(0, 10));
      if (msExp <= ms(objetivo)) continue;                   // vence antes: ese plazo no aplica
      if (Number(objetivo) > ULTIMO_DIA) { desc.futuro++; continue; }   // aún no ha ocurrido
      const dSal = diaSalida(sym, objetivo);
      if (!dSal) { desc.sinSalida++; continue; }
      const cadSal = cadena(sym, dSal);
      if (!cadSal) { desc.sinSalida++; continue; }

      const fac = factorSplit(sym, entrada, dSal);
      const rT = retorno(cadEnt, cadSal, expYmd, clave, fac);
      if (rT === null) continue;

      let suma = 0, cuenta = 0, ausentes = 0;
      for (const u of cubo) {
        if (u.msExp <= ms(objetivo)) continue;               // el control también debe sobrevivir
        const r = retorno(cadEnt, cadSal, u.exp, u.clave, fac);
        if (r === null) continue;
        if (!cadSal?.[u.exp]?.[claveAjustada(u.clave, fac)]) ausentes++;
        suma += r; cuenta++;
      }
      if (cuenta < CUBO_MIN) continue;

      const rC = suma / cuenta;
      fila.h[H] = {
        t: rT, c: rC, d: rT - rC,
        n: cuenta, ausenteT: !cadSal?.[expYmd]?.[claveAjustada(clave, fac)], ausentesC: ausentes,
        diaSal: dSal, split: fac !== 1 ? fac : undefined,
      };
    }

    if (Object.keys(fila.h).length) filas.push(fila); else desc.venceAntesDeTodo++;
  }
}

console.log(`operaciones vistas (prima ≥ $${(PRIMA_MIN / 1e6).toFixed(0)}M): ${vistas.toLocaleString("es-ES")}`);
console.log(`filas con al menos un horizonte medible:               ${filas.length.toLocaleString("es-ES")}`);
console.log(`\ndescartes:`);
for (const [k, v] of Object.entries(desc)) console.log(`  ${k.padEnd(20)} ${v.toLocaleString("es-ES")}`);
console.log(`\npor horizonte:`);
for (const H of HORIZONTES) {
  const con = filas.filter((f) => f.h[H]);
  const ausT = con.filter((f) => f.h[H].ausenteT).length;
  console.log(`  ${String(H).padStart(3)} d  ${String(con.length).padStart(7)} filas` +
              `  · ${ausT} tratamientos a cero (${con.length ? ((ausT / con.length) * 100).toFixed(1) : "0"}%)`);
}

writeFileSync(SALIDA, JSON.stringify(filas), "utf8");
console.log(`\nescrito ${SALIDA} (${(JSON.stringify(filas).length / 1e6).toFixed(1)} MB)`);
