// LA FORMA DE LA APERTURA — ¿dice algo el hueco y el rango de la primera media hora?
//
// ═══ QUÉ MIDE Y POR QUÉ ═════════════════════════════════════════════════════════════════════
//
// Todo lo que este proyecto ha probado del GEX mira el INTERÉS ABIERTO. Aquí no se mira nada de
// eso: sólo la FORMA con la que el día abre, que es lo primero que ve cualquiera que se siente
// delante de la pantalla a las 09:30.
//
//   · el HUECO: la apertura de hoy contra el cierre de ayer (el cierre de ayer es el último
//     precio del SPX del día anterior del propio banco de pruebas, no otra serie).
//   · el RANGO de los primeros 30 minutos (09:30 a 10:00) y dónde queda el precio dentro de él.
//   · la ROTURA: cuando el precio se sale por arriba de ese rango se compran CALLS, cuando se
//     sale por abajo se compran PUTS. Es la regla de libro de cualquier manual de intradía.
//   · y LO CONTRARIO: desvanecer la rotura (arriba → puts, abajo → calls), porque la mitad de
//     los manuales dice exactamente lo opuesto.
//
// Por qué merece la pena preguntarlo aquí: lo que mató las ideas anteriores de comprar opciones
// fue el peaje de la horquilla (3% por operación a plazo). En la 0DTE de SPXW cerca del dinero
// la horquilla medida en este mismo banco es del 0,9% al 4,3%. El listón que hay que superar
// baja mucho, así que un efecto pequeño que antes no se podía cobrar aquí quizá sí.
//
// ═══ CÓMO SE MIDE (las reglas de la casa, sin excepciones) ══════════════════════════════════
//
//   · se COMPRA AL ASK y se VENDE AL BID (lo hace operar(), no se puede desactivar).
//   · en la barra i sólo se miran barras 0..i. El rango de la primera media hora está cerrado a
//     las 10:00 y la rotura se detecta en la propia barra en la que ocurre, comprando en ESA
//     barra (bid/ask y precio del SPX vienen en la misma fila, no se cruzan series).
//   · si falta un precio la operación NO existe: se cuenta como hueco y se descarta. Nunca cero.
//   · nada de modelos: si el contrato no cotizaba, no hay operación.
//
// ═══ LOS CONTROLES (una regla no vale nada sin ellos) ═══════════════════════════════════════
//
//   a) CONTROL TONTO: la misma compra y la misma salida, TODOS los días, entrando a las 10:00
//      sin mirar ninguna rotura.
//   b) MITADES y TERCIOS en el tiempo.
//   c) BARAJADO: la misma regla pero con el rango de la primera media hora de OTRO día (el de
//      50 días antes, aplicado como distancia relativa a la apertura de hoy). Sin Math.random.
//   d) SIMETRÍA: la misma regla comprando el lado contrario. Si las dos ganan, lo que hay es
//      volatilidad o deriva, no dirección.
//
// Ejecutar:  node --import tsx scripts/e7-forma-de-la-apertura.mjs

import { diasDisponibles, cargarDia, operar, idxHora, rejilla, resumen } from "./lib0dte.mjs";

// ── parámetros de la rejilla ────────────────────────────────────────────────────────────────
const OFFSETS = [0, 5, 10, 15, 20, 25];        // puntos fuera del dinero en el momento de entrar
const SALIDAS = [3, 6, 12, 24, "cierre"];      // barras de 5 min que se aguanta (o hasta el final)
const DESPLAZA_BARAJADO = 50;                  // el rango de hace 50 días, no aleatorio
const ULTIMA_ENTRADA = "14:30";                // no se abre nada después de esta hora
const DIAS_POR_ANO = 252;

// ── acumuladores ────────────────────────────────────────────────────────────────────────────
const ops = new Map();      // clave de variante -> array de operaciones
const huecos = new Map();   // clave de variante -> nº de operaciones descartadas por falta de precio
const mete = (k, o) => { let a = ops.get(k); if (!a) { a = []; ops.set(k, a); } a.push(o); };
const hueco = (k) => huecos.set(k, (huecos.get(k) || 0) + 1);

const clave = (modo, off, sal) => `${modo}|${off}|${sal}`;

/** Ejecuta una operación y la archiva, o la cuenta como hueco. */
function intenta(d, iEnt, sal, K, lado, k, extra) {
  const ultimo = d.barras.length - 1;
  const iSal = sal === "cierre" ? ultimo : Math.min(iEnt + sal, ultimo);
  if (iSal <= iEnt) { hueco(k); return; }
  const r = operar(d, iEnt, iSal, K, lado);
  if (!r) { hueco(k); return; }
  mete(k, { dia: d.dia, ret: r.ret, dolares: r.dolares, coste: r.coste, horq: r.horquillaPct, lado, K, iEnt, ...extra });
}

// ── la pasada ───────────────────────────────────────────────────────────────────────────────
const dias = diasDisponibles();
console.log(`Banco: ${dias.length} días, de ${dias[0]} a ${dias[dias.length - 1]}`);

const diag = {
  cargados: 0, nulos: 0, sinRango: 0, sinCierreAyer: 0,
  roturaArriba: 0, roturaAbajo: 0, sinRotura: 0, tardeParaEntrar: 0,
};
const relLevels = [];   // {relHi, relLo} de cada día procesado, para el barajado
const fichaDias = [];   // una ficha por día, para los cortes por hueco
let cierreAyer = null, diaAyer = null;
const costesCanon = [];

const t0 = Date.now();
for (const dd of dias) {
  const d = cargarDia(dd);
  if (!d) { diag.nulos++; continue; }
  diag.cargados++;

  // OJO: la primera barra del banco es la de las 09:35 (no existe una barra "09:30"), así que
  // la primera media hora son las barras 09:35..10:00 — seis barras. Comprobado a mano: si el
  // día no arranca a las 09:35 no se usa, para no medir medias horas de distinta longitud.
  const i930 = d.barras[0].t <= "09:40" ? 0 : -1;
  const i10 = idxHora(d, "10:00"), iTope = idxHora(d, ULTIMA_ENTRADA);
  const apertura = d.barras[0].spot;
  const cierreHoy = d.barras[d.barras.length - 1].spot;

  // hueco contra el cierre de AYER (sólo si ayer está a menos de 5 días de calendario)
  let gap = null;
  if (cierreAyer != null) {
    const dist = (new Date(dd) - new Date(diaAyer)) / 86400000;
    if (dist > 0 && dist <= 5) gap = apertura - cierreAyer;
  }
  if (gap == null) diag.sinCierreAyer++;
  cierreAyer = cierreHoy; diaAyer = dd;

  if (i930 < 0 || i10 < 0 || iTope < 0 || i10 <= i930) { diag.sinRango++; relLevels.push(null); continue; }

  // rango de los primeros 30 minutos: 09:30..10:00 inclusive
  let hi30 = -Infinity, lo30 = Infinity;
  for (let i = i930; i <= i10; i++) { const s = d.barras[i].spot; if (s > hi30) hi30 = s; if (s < lo30) lo30 = s; }
  const ancho = hi30 - lo30;
  const spot10 = d.barras[i10].spot;
  const pos10 = ancho > 0 ? (spot10 - lo30) / ancho : 0.5;

  const j = relLevels.length;
  relLevels.push({ relHi: hi30 - apertura, relLo: lo30 - apertura });

  // primera rotura real, después de las 10:00
  let dir = null, iEnt = -1;
  for (let i = i10 + 1; i <= iTope; i++) {
    const s = d.barras[i].spot;
    if (s > hi30) { dir = "up"; iEnt = i; break; }
    if (s < lo30) { dir = "down"; iEnt = i; break; }
  }
  if (dir === "up") diag.roturaArriba++; else if (dir === "down") diag.roturaAbajo++; else diag.sinRotura++;

  // primera rotura BARAJADA: el rango relativo de hace 50 días sobre la apertura de hoy
  let dirB = null, iEntB = -1;
  const viejo = j >= DESPLAZA_BARAJADO ? relLevels[j - DESPLAZA_BARAJADO] : null;
  if (viejo) {
    const hiB = apertura + viejo.relHi, loB = apertura + viejo.relLo;
    for (let i = i10 + 1; i <= iTope; i++) {
      const s = d.barras[i].spot;
      if (s > hiB) { dirB = "up"; iEntB = i; break; }
      if (s < loB) { dirB = "down"; iEntB = i; break; }
    }
  }

  fichaDias.push({ dia: dd, gap, ancho, pos10, dir, iEnt, apertura, hi30, lo30 });

  const extra = { gap, ancho, pos10, dir };

  for (const off of OFFSETS) {
    for (const sal of SALIDAS) {
      // ── control tonto: TODOS los días, entrada a las 10:00, sin mirar nada ──
      intenta(d, i10, sal, rejilla(spot10) + off, "C", clave("tonto-C", off, sal), { gap, pos10, dir });
      intenta(d, i10, sal, rejilla(spot10) - off, "P", clave("tonto-P", off, sal), { gap, pos10, dir });

      if (dir) {
        const sEnt = d.barras[iEnt].spot;
        const base = rejilla(sEnt);
        const ladoSigue = dir === "up" ? "C" : "P";
        const ladoContra = dir === "up" ? "P" : "C";
        const Ksigue = ladoSigue === "C" ? base + off : base - off;
        const Kcontra = ladoContra === "C" ? base + off : base - off;
        intenta(d, iEnt, sal, Ksigue, ladoSigue, clave("seguir", off, sal), extra);
        // MISMO, PERO ENTRANDO 5 MINUTOS TARDE. En la barra i se ve el cruce y se compra al ask
        // de esa misma barra: eso supone reaccionar al instante. Comprar en la barra siguiente
        // es lo que de verdad puede hacer una persona, y es la prueba que suele matar estas
        // reglas. Si el hallazgo desaparece con 5 minutos de retraso, no es operable.
        if (iEnt + 1 < d.barras.length - 1) {
          const sT = d.barras[iEnt + 1].spot, bT = rejilla(sT);
          intenta(d, iEnt + 1, sal, ladoSigue === "C" ? bT + off : bT - off, ladoSigue, clave("seguir-tarde", off, sal), extra);
        }
        intenta(d, iEnt, sal, Kcontra, ladoContra, clave("desvanecer", off, sal), extra);
        // dirección ignorada: misma entrada y salida, siempre call / siempre put
        intenta(d, iEnt, sal, base + off, "C", clave("señal-siempreC", off, sal), extra);
        intenta(d, iEnt, sal, base - off, "P", clave("señal-siempreP", off, sal), extra);
      }
      if (dirB) {
        const sEnt = d.barras[iEntB].spot;
        const base = rejilla(sEnt);
        const ladoSigue = dirB === "up" ? "C" : "P";
        const ladoContra = dirB === "up" ? "P" : "C";
        intenta(d, iEntB, sal, ladoSigue === "C" ? base + off : base - off, ladoSigue, clave("barajado-seguir", off, sal), { gap, pos10, dir: dirB });
        intenta(d, iEntB, sal, ladoContra === "C" ? base + off : base - off, ladoContra, clave("barajado-desvanecer", off, sal), { gap, pos10, dir: dirB });
      }
    }
  }
  if (dir) {
    const c = operar(d, iEnt, Math.min(iEnt + 12, d.barras.length - 1), rejilla(d.barras[iEnt].spot) + (dir === "up" ? 10 : -10), dir === "up" ? "C" : "P");
    if (c) costesCanon.push(c.coste);
  }
}
console.log(`Pasada completa en ${((Date.now() - t0) / 1000).toFixed(0)} s\n`);

// ── DIAGNÓSTICO: antes de creerse ningún número ─────────────────────────────────────────────
const anos = diag.cargados / DIAS_POR_ANO;
console.log("═══ DIAGNÓSTICO ═══════════════════════════════════════════════");
console.log(`días cargados            ${diag.cargados}   (nulos/incompletos ${diag.nulos})`);
console.log(`sin rango 09:30-10:00    ${diag.sinRango}`);
console.log(`sin cierre de ayer útil  ${diag.sinCierreAyer}  (huecos de fin de semana largo o día suelto)`);
console.log(`rotura ARRIBA            ${diag.roturaArriba}`);
console.log(`rotura ABAJO             ${diag.roturaAbajo}`);
console.log(`SIN rotura antes de ${ULTIMA_ENTRADA}  ${diag.sinRotura}`);
console.log(`años de muestra          ${anos.toFixed(2)}`);
costesCanon.sort((a, b) => a - b);
const pc = (q) => costesCanon[Math.floor(q * (costesCanon.length - 1))];
console.log(`coste de entrada (call 10 pts fuera, en la rotura): min $${pc(0).toFixed(2)} · p5 $${pc(.05).toFixed(2)} · mediana $${pc(.5).toFixed(2)} · p95 $${pc(.95).toFixed(2)} · max $${pc(1).toFixed(2)}   n=${costesCanon.length}`);
const gaps = fichaDias.filter((f) => f.gap != null).map((f) => Math.abs(f.gap)).sort((a, b) => a - b);
const gq = (q) => gaps[Math.floor(q * (gaps.length - 1))];
console.log(`|hueco| en puntos:  mediana ${gq(.5).toFixed(1)} · p75 ${gq(.75).toFixed(1)} · p90 ${gq(.9).toFixed(1)} · max ${gq(1).toFixed(1)}   n=${gaps.length}`);
const anchos = fichaDias.map((f) => f.ancho).sort((a, b) => a - b);
console.log(`ancho del rango 30 min: mediana ${anchos[Math.floor(anchos.length / 2)].toFixed(1)} puntos`);
console.log();

// ── informe de una variante ─────────────────────────────────────────────────────────────────
// OJO con una trampa de unidades que este proyecto ya ha pagado: la media del RETORNO EN % y
// la media en DÓLARES no dicen lo mismo. Un +200% sobre una opción de $1 son $100; un −40%
// sobre una de $20 son −$800. Por eso se saca la t de las DOS y se informan las dos.
function ficha(lista) {
  if (!lista || lista.length < 2) return null;
  const r = resumen(lista.map((o) => o.ret));
  const rd = resumen(lista.map((o) => o.dolares));
  const dol = lista.reduce((a, o) => a + o.dolares, 0);
  const rets = lista.map((o) => o.ret).sort((a, b) => a - b);
  return {
    n: r.n, mediaPct: r.media * 100, t: r.t, aciertos: r.aciertos,
    medianaPct: rets[Math.floor(rets.length / 2)] * 100,
    tDol: rd.t,
    dolPorOp: dol / r.n, opsPorAno: r.n / anos, dolPorAno: dol / anos,
  };
}
const linea = (nom, f) => f
  ? `${nom.padEnd(34)} n=${String(f.n).padStart(5)}  media ${f.mediaPct >= 0 ? "+" : ""}${f.mediaPct.toFixed(2).padStart(7)}%  t=${f.t.toFixed(2).padStart(6)}  medi ${f.medianaPct.toFixed(1).padStart(6)}%  acierta ${(f.aciertos * 100).toFixed(0).padStart(2)}%  $/op ${f.dolPorOp.toFixed(0).padStart(6)}  t$=${f.tDol.toFixed(2).padStart(5)}  ops/año ${f.opsPorAno.toFixed(0).padStart(4)}  $/año ${f.dolPorAno.toFixed(0).padStart(8)}`
  : `${nom.padEnd(34)} (sin datos)`;

// ── TABLA COMPLETA de la rejilla ────────────────────────────────────────────────────────────
const filas = [];
for (const modo of ["seguir", "desvanecer", "tonto-C", "tonto-P", "barajado-seguir", "barajado-desvanecer", "señal-siempreC", "señal-siempreP"]) {
  for (const off of OFFSETS) for (const sal of SALIDAS) {
    const k = clave(modo, off, sal);
    const f = ficha(ops.get(k));
    if (f) filas.push({ modo, off, sal, k, ...f, huecos: huecos.get(k) || 0 });
  }
}

function tabla(modo) {
  console.log(`─── ${modo} ${"─".repeat(Math.max(0, 60 - modo.length))}`);
  console.log("  fuera  salida      n   media %      t   acierta   $/op   $/año   huecos");
  for (const f of filas.filter((x) => x.modo === modo)) {
    console.log(`  ${String(f.off).padStart(4)}  ${String(f.sal).padStart(7)}  ${String(f.n).padStart(5)}  ${(f.mediaPct >= 0 ? "+" : "") + f.mediaPct.toFixed(2).padStart(6)}  ${f.t.toFixed(2).padStart(6)}     ${(f.aciertos * 100).toFixed(0).padStart(3)}%  ${f.dolPorOp.toFixed(0).padStart(6)}  ${f.dolPorAno.toFixed(0).padStart(7)}   ${String(f.huecos).padStart(4)}`);
  }
  console.log();
}
console.log("═══ LA REJILLA ENTERA ═════════════════════════════════════════");
for (const m of ["seguir", "desvanecer", "tonto-C", "tonto-P"]) tabla(m);

// ── LA MEJOR VARIANTE de la familia (seguir o desvanecer), por t ────────────────────────────
const familia = filas.filter((x) => x.modo === "seguir" || x.modo === "desvanecer");
familia.sort((a, b) => b.t - a.t);
console.log("═══ LAS 8 MEJORES DE LA FAMILIA (ordenadas por t) ═════════════");
for (const f of familia.slice(0, 8)) console.log(linea(`${f.modo} ${f.off} pts, salida ${f.sal}`, f));
console.log();

const mejor = familia[0];
console.log(`═══ AUTOPSIA DE LA MEJOR: ${mejor.modo}, ${mejor.off} puntos fuera, salida ${mejor.sal} ═══`);
const L = ops.get(mejor.k);
console.log(linea("la regla", ficha(L)));

// controles
const contrario = mejor.modo === "seguir" ? "desvanecer" : "seguir";
console.log(linea(`CONTROL simetría (${contrario})`, ficha(ops.get(clave(contrario, mejor.off, mejor.sal)))));
console.log(linea("CONTROL tonto  (10:00, calls)", ficha(ops.get(clave("tonto-C", mejor.off, mejor.sal)))));
console.log(linea("CONTROL tonto  (10:00, puts)", ficha(ops.get(clave("tonto-P", mejor.off, mejor.sal)))));
console.log(linea("CONTROL barajado (rango -50d)", ficha(ops.get(clave(`barajado-${mejor.modo}`, mejor.off, mejor.sal)))));
console.log(linea("CONTROL dirección ignorada: C", ficha(ops.get(clave("señal-siempreC", mejor.off, mejor.sal)))));
console.log(linea("CONTROL dirección ignorada: P", ficha(ops.get(clave("señal-siempreP", mejor.off, mejor.sal)))));
console.log();

// mitades y tercios
const ordenado = [...L].sort((a, b) => a.dia.localeCompare(b.dia));
const trozo = (a, b) => ficha(ordenado.slice(a, b));
const m1 = trozo(0, Math.floor(ordenado.length / 2)), m2 = trozo(Math.floor(ordenado.length / 2), ordenado.length);
const t1 = trozo(0, Math.floor(ordenado.length / 3));
const t2 = trozo(Math.floor(ordenado.length / 3), Math.floor(2 * ordenado.length / 3));
const t3 = trozo(Math.floor(2 * ordenado.length / 3), ordenado.length);
console.log(linea(`1ª mitad (${ordenado[0].dia}→)`, m1));
console.log(linea(`2ª mitad (→${ordenado[ordenado.length - 1].dia})`, m2));
console.log(linea("tercio 1", t1));
console.log(linea("tercio 2", t2));
console.log(linea("tercio 3", t3));
console.log();

// por año natural
console.log("─── por año ──────────────────────────────────────────────────");
const anosSet = [...new Set(ordenado.map((o) => o.dia.slice(0, 4)))].sort();
for (const a of anosSet) console.log(linea(`  ${a}`, ficha(ordenado.filter((o) => o.dia.slice(0, 4) === a))));
console.log();

// ── ¿SÓLO EN DÍAS DE HUECO GRANDE? ──────────────────────────────────────────────────────────
console.log("═══ CORTE POR TAMAÑO DEL HUECO (la mejor variante) ════════════");
const conGap = ordenado.filter((o) => o.gap != null);
const absG = conGap.map((o) => Math.abs(o.gap)).sort((a, b) => a - b);
const cortes = [0.25, 0.5, 0.75, 0.9].map((q) => absG[Math.floor(q * (absG.length - 1))]);
console.log(`cuartiles de |hueco|: ${cortes.map((x) => x.toFixed(1)).join(" / ")} puntos   (n con hueco = ${conGap.length})`);
const cubos = [
  ["|hueco| pequeño (<p25)", (o) => Math.abs(o.gap) < cortes[0]],
  ["|hueco| p25-p50", (o) => Math.abs(o.gap) >= cortes[0] && Math.abs(o.gap) < cortes[1]],
  ["|hueco| p50-p75", (o) => Math.abs(o.gap) >= cortes[1] && Math.abs(o.gap) < cortes[2]],
  ["|hueco| p75-p90", (o) => Math.abs(o.gap) >= cortes[2] && Math.abs(o.gap) < cortes[3]],
  ["|hueco| GRANDE (>p90)", (o) => Math.abs(o.gap) >= cortes[3]],
];
for (const [nom, f] of cubos) console.log(linea(nom, ficha(conGap.filter(f))));
console.log();
console.log("─── hueco CON el signo (¿importa la dirección del hueco?) ─────");
console.log(linea("hueco ARRIBA y rotura arriba", ficha(conGap.filter((o) => o.gap > 0 && o.dir === "up"))));
console.log(linea("hueco ARRIBA y rotura abajo", ficha(conGap.filter((o) => o.gap > 0 && o.dir === "down"))));
console.log(linea("hueco ABAJO y rotura arriba", ficha(conGap.filter((o) => o.gap < 0 && o.dir === "up"))));
console.log(linea("hueco ABAJO y rotura abajo", ficha(conGap.filter((o) => o.gap < 0 && o.dir === "down"))));
console.log();
console.log("─── por dónde queda el precio a las 10:00 dentro del rango ────");
console.log(linea("pega al techo  (pos>0,75)", ficha(ordenado.filter((o) => o.pos10 > 0.75))));
console.log(linea("en medio       (0,25-0,75)", ficha(ordenado.filter((o) => o.pos10 >= 0.25 && o.pos10 <= 0.75))));
console.log(linea("pega al suelo  (pos<0,25)", ficha(ordenado.filter((o) => o.pos10 < 0.25))));
console.log();
console.log("─── por ancho del rango de 30 min ────────────────────────────");
const anchosOrd = ordenado.map((o) => o.ancho).sort((a, b) => a - b);
const aMed = anchosOrd[Math.floor(anchosOrd.length / 2)];
console.log(linea(`rango ESTRECHO (<${aMed.toFixed(1)} pts)`, ficha(ordenado.filter((o) => o.ancho < aMed))));
console.log(linea(`rango ANCHO    (>=${aMed.toFixed(1)} pts)`, ficha(ordenado.filter((o) => o.ancho >= aMed))));
console.log();

// ── el mejor cubo de hueco, con sus propios controles ───────────────────────────────────────
console.log("═══ SI SÓLO SE OPERASEN LOS DÍAS DE HUECO GRANDE ══════════════");
const grandes = conGap.filter((o) => Math.abs(o.gap) >= cortes[3]);
const fg = ficha(grandes);
console.log(linea("la regla, sólo hueco >p90", fg));
if (fg) console.log(`   → son ${(fg.opsPorAno).toFixed(0)} operaciones al año y ${fg.dolPorAno.toFixed(0)} $/año con UN contrato`);
const contraGrande = (ops.get(clave(contrario, mejor.off, mejor.sal)) || []).filter((o) => o.gap != null && Math.abs(o.gap) >= cortes[3]);
console.log(linea("  su simetría (lado contrario)", ficha(contraGrande)));
const tontoGrande = (ops.get(clave(mejor.modo === "seguir" ? "tonto-C" : "tonto-P", mejor.off, mejor.sal)) || []).filter((o) => o.gap != null && Math.abs(o.gap) >= cortes[3]);
console.log(linea("  su control tonto (10:00)", ficha(tontoGrande)));
const barGrande = (ops.get(clave(`barajado-${mejor.modo}`, mejor.off, mejor.sal)) || []).filter((o) => o.gap != null && Math.abs(o.gap) >= cortes[3]);
console.log(linea("  su barajado", ficha(barGrande)));
console.log();

// ── LA CELDA MÁS FUERTE, MIRADA EN SERIO ────────────────────────────────────────────────────
//
// Del corte por signo del hueco sale una hipótesis con nombre propio y que se puede contar en
// una frase: «el día abre con HUECO ARRIBA, y luego PIERDE el mínimo de la primera media hora
// → se compran PUTS». Es la vieja idea de que los huecos se rellenan.
//
// Una celda buena de una tabla de cuatro no vale nada por sí sola: hay que ver si aguanta en
// TODA la rejilla de parámetros (si sólo funciona en una casilla, es ruido), y hay que pasarle
// sus propios controles. Eso es lo que hace este bloque.
console.log("═══ LA HIPÓTESIS DEL HUECO QUE SE RELLENA ═════════════════════");
console.log("   (abre con hueco ARRIBA + pierde el mínimo de los 30 min → puts)\n");
console.log("  fuera  salida      n   media %      t    t$   acierta   $/op    $/año");
const rellena = [];
for (const off of OFFSETS) for (const sal of SALIDAS) {
  const l = (ops.get(clave("seguir", off, sal)) || []).filter((o) => o.gap != null && o.gap > 0 && o.dir === "down");
  const f = ficha(l);
  if (!f) continue;
  rellena.push({ off, sal, f, l });
  console.log(`  ${String(off).padStart(4)}  ${String(sal).padStart(7)}  ${String(f.n).padStart(5)}  ${(f.mediaPct >= 0 ? "+" : "") + f.mediaPct.toFixed(2).padStart(6)}  ${f.t.toFixed(2).padStart(5)}  ${f.tDol.toFixed(2).padStart(5)}     ${(f.aciertos * 100).toFixed(0).padStart(3)}%  ${f.dolPorOp.toFixed(0).padStart(6)}  ${f.dolPorAno.toFixed(0).padStart(7)}`);
}
const positivas = rellena.filter((x) => x.f.mediaPct > 0).length;
console.log(`\n  casillas con media positiva: ${positivas} de ${rellena.length}`);
const mejorR = rellena.slice().sort((a, b) => b.f.t - a.f.t)[0];
console.log(`\n  ── controles de la mejor casilla (${mejorR.off} pts fuera, salida ${mejorR.sal}) ──`);
console.log(linea("  la regla", mejorR.f));
const ordR = [...mejorR.l].sort((a, b) => a.dia.localeCompare(b.dia));
const tR = (a, b) => ficha(ordR.slice(a, b));
console.log(linea("  1ª mitad", tR(0, Math.floor(ordR.length / 2))));
console.log(linea("  2ª mitad", tR(Math.floor(ordR.length / 2), ordR.length)));
console.log(linea("  tercio 1", tR(0, Math.floor(ordR.length / 3))));
console.log(linea("  tercio 2", tR(Math.floor(ordR.length / 3), Math.floor(2 * ordR.length / 3))));
console.log(linea("  tercio 3", tR(Math.floor(2 * ordR.length / 3), ordR.length)));
console.log(linea("  SIMETRÍA (calls en vez de puts)", ficha((ops.get(clave("desvanecer", mejorR.off, mejorR.sal)) || []).filter((o) => o.gap != null && o.gap > 0 && o.dir === "down"))));
console.log(linea("  TONTO (puts a las 10:00)", ficha((ops.get(clave("tonto-P", mejorR.off, mejorR.sal)) || []).filter((o) => o.gap != null && o.gap > 0))));
console.log(linea("  BARAJADO (rango de -50 días)", ficha((ops.get(clave(`barajado-seguir`, mejorR.off, mejorR.sal)) || []).filter((o) => o.gap != null && o.gap > 0 && o.dir === "down"))));
console.log(linea("  el otro hueco (abajo + rotura ab.)", ficha((ops.get(clave("seguir", mejorR.off, mejorR.sal)) || []).filter((o) => o.gap != null && o.gap < 0 && o.dir === "down"))));
console.log();

// ¿De dónde sale el dinero? Con una media de +11,6% y una mediana de −23% el beneficio no está
// repartido: lo ponen unos pocos días. Si quitando cinco días se acaba el negocio, no es una
// regla, es haber comprado el billete de lotería premiado. Hay que enseñarlo.
console.log("  ── ¿de dónde sale el dinero? ──");
const porD = [...mejorR.l].sort((a, b) => b.dolares - a.dolares);
const total = porD.reduce((a, o) => a + o.dolares, 0);
console.log(`  coste medio de entrada: $${(porD.reduce((a, o) => a + o.coste, 0) / porD.length * 100).toFixed(0)} por contrato   ·   beneficio total ${total.toFixed(0)} $ en ${porD.length} operaciones`);
console.log(`  los 5 mejores días:  ${porD.slice(0, 5).map((o) => `${o.dia} ${o.dolares.toFixed(0)}$`).join("  ")}`);
for (const k of [1, 5, 10, 20]) {
  const resto = porD.slice(k);
  const f = ficha(resto);
  console.log(linea(`  quitando los ${k} mejores días`, f));
}
const tarde = (ops.get(clave("seguir-tarde", mejorR.off, mejorR.sal)) || []).filter((o) => o.gap != null && o.gap > 0 && o.dir === "down");
console.log(linea("  ENTRANDO 5 MIN TARDE", ficha(tarde)));
console.log(linea("  la misma, sin los 5 mejores días", ficha([...tarde].sort((a, b) => b.dolares - a.dolares).slice(5))));
console.log("  ── por año ──");
for (const a of [...new Set(mejorR.l.map((o) => o.dia.slice(0, 4)))].sort()) {
  console.log(linea(`  ${a}`, ficha(mejorR.l.filter((o) => o.dia.slice(0, 4) === a))));
}
console.log();

// ── resumen máquina ─────────────────────────────────────────────────────────────────────────
console.log("═══ RESUMEN MÁQUINA ═══════════════════════════════════════════");
const fm = ficha(L);
const fb = ficha(ops.get(clave(`barajado-${mejor.modo}`, mejor.off, mejor.sal)));
const ft = ficha(ops.get(clave("tonto-C", mejor.off, mejor.sal)));
const ftp = ficha(ops.get(clave("tonto-P", mejor.off, mejor.sal)));
const fc = ficha(ops.get(clave(contrario, mejor.off, mejor.sal)));
console.log(JSON.stringify({
  mejor: `${mejor.modo} ${mejor.off} pts fuera, salida ${mejor.sal}`,
  n: fm.n, mediaPct: +fm.mediaPct.toFixed(3), t: +fm.t.toFixed(3), aciertos: +fm.aciertos.toFixed(3),
  dolPorAno: Math.round(fm.dolPorAno), opsPorAno: Math.round(fm.opsPorAno),
  tontoC: +ft.mediaPct.toFixed(3), tontoP: +ftp.mediaPct.toFixed(3),
  barajado: +fb.mediaPct.toFixed(3), contrario: +fc.mediaPct.toFixed(3),
  mitad1: +m1.mediaPct.toFixed(3), mitad2: +m2.mediaPct.toFixed(3),
  tercios: [t1, t2, t3].map((x) => +x.mediaPct.toFixed(2)),
  huecosDescartados: mejor.huecos,
  diasConSenal: diag.roturaArriba + diag.roturaAbajo,
  diasSinSenal: diag.sinRotura,
  tDolares: +fm.tDol.toFixed(3),
  medianaPct: +fm.medianaPct.toFixed(2),
  rellenaHueco: { casillasPositivas: positivas, deTotal: rellena.length, mejor: `${mejorR.off}/${mejorR.sal}`, n: mejorR.f.n, mediaPct: +mejorR.f.mediaPct.toFixed(2), t: +mejorR.f.t.toFixed(2), dolPorAno: Math.round(mejorR.f.dolPorAno) },
}, null, 2));
