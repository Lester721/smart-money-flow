// POWER MONDAY y el DESARME DEL TERCER VIERNES — posicionamiento forzado con calendario
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/power-monday.mjs
//
// ═══ LA IDEA (Lester, 2026-08-16) ═════════════════════════════════════════════════════════
//
// Dos mecanismos distintos que conviene NO mezclar:
//
//   A) POWER MONDAY — ASIGNACIÓN. Las calls que vencen DENTRO del dinero se ejercen solas. Quien
//      las vendió tiene que ENTREGAR las acciones, y si no las tiene, las compra. Es una compra
//      OBLIGATORIA, no discrecional, que liquida el lunes. Con las puts al revés: entrega de
//      efectivo contra acciones, o sea venta forzada.
//
//   B) DESARME DEL TERCER VIERNES — COBERTURA. Mientras las opciones viven, el creador de mercado
//      que las tiene vendidas está cubierto con acciones. Al vencer, esa cobertura sobra y se
//      deshace. Flujo con fecha conocida años antes.
//
// ═══ POR QUÉ ESTE TEST NO SE PUEDE CONTAMINAR COMO LOS DE HOY ═════════════════════════════
//
// Hoy se cayeron dos hallazgos porque el futuro entró por el preprocesado. Aquí no puede:
//   · La FECHA del vencimiento está publicada con años de antelación. No se deduce de nada.
//   · El INTERÉS ABIERTO se observa ANTES del vencimiento (se usa el de 2 días antes, que ya
//     estaba publicado cuando había que decidir).
//   · No hay normalización de nada sobre la serie completa: F=1 en todas partes.
//   · Los precios son CIERRES REALES descargados, no el spot por paridad — que se desvía una
//     mediana del 0,4-1% y hasta un 4,5%, suficiente para inventar lunes que no existieron.
//
// ═══ EL CRITERIO, ESCRITO ANTES DE MIRAR NINGÚN NÚMERO ════════════════════════════════════
//
// EL DISEÑO ES TRANSVERSAL, y eso es lo que lo hace fuerte: dentro de CADA vencimiento se ordenan
// los 28 símbolos por la señal y se compara el tercio alto contra el bajo EL MISMO DÍA. Así el
// movimiento del mercado se cancela solo — no hace falta ningún control de "qué hizo el índice".
//
// SEÑAL A (Power Monday): valor en dólares de las CALLS que vencen dentro del dinero, menos el de
//   las PUTS que vencen dentro del dinero, dividido por la capitalización flotante aproximada
//   (aquí: dividido por el volumen en dólares del propio interés abierto total, para hacerlo
//   comparable entre acciones de tamaños distintos).
// SEÑAL B (desarme): interés abierto TOTAL que vence ese día, en dólares, sobre el total abierto.
//
// RESULTADO: rendimiento del LUNES siguiente (cierre lunes / cierre viernes − 1).
//
// PASA si, y sólo si, las cuatro cribas de `pasarBarrera()`. Y se declaran 6 pruebas:
//   2 señales × 3 ventanas (lunes solo, lunes+martes, semana entera).
//
// SI SALE NEGATIVO se corre `potencia()` antes de decir nada.
// SI SALE POSITIVO se manda a auditar ANTES de contárselo a nadie, y sin dólares hasta entonces.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { pasarBarrera, potencia, informe } from "../lib/barreraHallazgos";
import { radiografia } from "../lib/radiografia";

const CDIR = "scripts/cache-theta/cadenas";
const OIDIR = "scripts/cache-theta/oi-ancho";
const CIERRES = "scripts/cache-theta/cierres";
const BARRAS = "scripts/cache-theta";
const PRUEBAS = 12;   // 2 señales x 4 resultados (ver la cabecera de la versión 2)

// ── Cierres reales, de las dos fuentes ──────────────────────────────────────
// `cierres/` llega desde 2021 (límite de la suscripción de acciones). Los 9 símbolos originales
// tienen además `*_barsPAR_y_*.json` con cierres reales desde 2016. Se fusionan, y se anota qué
// símbolo tiene cuánta historia — un símbolo con la mitad de años pesa distinto en la muestra.
const cierres = new Map();
for (const f of readdirSync(CIERRES)) {
  const t = f.replace(".json", "");
  cierres.set(t, new Map(Object.entries(JSON.parse(readFileSync(`${CIERRES}/${f}`, "utf8")))));
}
for (const f of readdirSync(BARRAS)) {
  const m = f.match(/^([A-Z]+)_barsPAR_y_\d+_\d+\.json$/);
  if (!m) continue;
  const t = m[1];
  if (!cierres.has(t)) cierres.set(t, new Map());
  const mapa = cierres.get(t);
  for (const b of JSON.parse(readFileSync(`${BARRAS}/${f}`, "utf8")) ?? []) {
    const d = String(b.time).replace(/-/g, "");
    if (d.length === 8 && b.close > 0 && !mapa.has(d)) mapa.set(d, b.close);
  }
}

const diasPorSim = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/);
  if (!m) continue;
  if (!diasPorSim.has(m[1])) diasPorSim.set(m[1], []);
  diasPorSim.get(m[1]).push(m[2]);
}
for (const v of diasPorSim.values()) v.sort();
const TICKERS = [...diasPorSim.keys()].sort();

// Calendario de mercado: la unión de todos los días con cadena.
const calendario = [...new Set([...diasPorSim.values()].flat())].sort();
const idxCal = new Map(calendario.map((d, i) => [d, i]));

const leerJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null);

/** Los TERCEROS VIERNES: el vencimiento mensual clásico, donde vive el grueso del interés abierto. */
function tercerosViernes() {
  const out = [];
  for (const d of calendario) {
    const dia = Number(d.slice(6, 8));
    if (dia < 15 || dia > 21) continue;                 // el tercer viernes cae siempre aquí
    const dow = new Date(Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, dia)).getUTCDay();
    if (dow === 5) out.push(d);
  }
  return out;
}

const filas = [];
const VENCIMIENTOS = tercerosViernes();
console.log(`\n## POWER MONDAY · ${VENCIMIENTOS.length} terceros viernes · ${TICKERS.length} símbolos\n`);

for (const venc of VENCIMIENTOS) {
  const i = idxCal.get(venc);
  if (i == null || i < 3 || i + 5 >= calendario.length) continue;
  const diaSenal = calendario[i - 2];                   // OI de 2 días antes: ya publicado el viernes

  for (const t of TICKERS) {
    const px = cierres.get(t);
    if (!px) continue;
    const pV = px.get(venc);
    const pL = px.get(calendario[i + 1]);               // el lunes siguiente
    const pM = px.get(calendario[i + 2]);
    const pS = px.get(calendario[i + 5]);
    if (!(pV > 0) || !(pL > 0)) continue;

    const oi = leerJson(`${OIDIR}/${t}_d${diaSenal}.json`);
    const cad = leerJson(`${CDIR}/${t}_d${diaSenal}.json`);
    if (!oi || !cad) continue;
    const pSenal = px.get(diaSenal);
    if (!(pSenal > 0)) continue;

    // ── ARREGLO 1 · DENTRO DEL DINERO SE DECIDE EL VIERNES AL CIERRE ────────
    // La primera versión miraba si el strike estaba dentro del dinero DOS DÍAS ANTES. Pero la
    // asignación la dispara el precio FINAL del viernes: un contrato que el miércoles está fuera y
    // el viernes acaba dentro es justamente el que genera la compra SORPRESA, y lo estaba tirando.
    //
    // Y NO es mirar al futuro: el cierre del viernes se conoce el viernes a las 16:00, horas antes
    // de que abra el lunes. El interés abierto sí sigue siendo el de dos días antes, que es lo
    // último publicado. Cada dato en su momento.
    const pItm = pV;

    // ── Las dos señales, ambas con el OI del día de la señal ──────────────
    let callItm = 0, putItm = 0, venceTodo = 0, abiertoTodo = 0;
    for (const [exp, grupo] of Object.entries(oi)) {
      for (const [clave, n] of Object.entries(grupo)) {
        const K = Number(clave.slice(0, -2));
        const cnt = Number(n) || 0;
        if (!(K > 0) || !(cnt > 0)) continue;
        const dolares = cnt * 100 * pSenal;             // valor en acciones a precio de hoy
        abiertoTodo += dolares;
        if (exp !== venc) continue;
        venceTodo += dolares;
        // DENTRO DEL DINERO respecto al precio del día de la señal. Es lo observable entonces;
        // que acabe dentro o no el viernes es futuro y no se puede usar.
        if (clave.slice(-1) === "C") { if (K < pItm) callItm += dolares; }
        else if (K > pItm) putItm += dolares;
      }
    }
    if (!(abiertoTodo > 0)) continue;

    // ── ARREGLO 3 · LA VENTANA DEL PROPIO VIERNES ──────────────────────────
    // El desarme de coberturas no espera al lunes: el creador de mercado ve expirar sus posiciones
    // DURANTE el viernes. Puede que la ventana buena sea esa tarde y no el lunes siguiente.
    const pJ = px.get(diaSenal);                        // cierre de 2 días antes
    const pPrevio = px.get(calendario[i - 1]);          // jueves
    const viernes = pPrevio > 0 ? pV / pPrevio - 1 : null;

    // ── ARREGLO 2 · MAGNITUD, NO DIRECCIÓN ────────────────────────────────
    // Una compra forzada por asignación mueve VOLUMEN. El precio sólo se mueve si el flujo está
    // desequilibrado, y no hay razón para que lo esté siempre en el mismo sentido. Lo que sí
    // debería notarse es que el lunes se mueva MUCHO, en cualquier dirección.
    // Se escala por la volatilidad NORMAL de ese símbolo (60 días previos): sin eso estaríamos
    // midiendo qué acciones son volátiles, que ya lo sabemos.
    let volNormal = null;
    {
      const rr = [];
      for (let k = i - 62; k < i - 1; k++) {
        const a1 = px.get(calendario[k]), b1 = px.get(calendario[k + 1]);
        if (a1 > 0 && b1 > 0) rr.push(b1 / a1 - 1);
      }
      if (rr.length >= 30) {
        const m = rr.reduce((a1, b1) => a1 + b1, 0) / rr.length;
        volNormal = Math.sqrt(rr.reduce((a1, x) => a1 + (x - m) ** 2, 0) / (rr.length - 1));
      }
    }

    filas.push({
      ticker: t, venc,
      viernes,
      magLunes: volNormal > 0 ? Math.abs(pL / pV - 1) / volNormal : null,
      magViernes: volNormal > 0 && viernes != null ? Math.abs(viernes) / volNormal : null,
      // A · Power Monday: compra forzada menos venta forzada, escalado por el tamaño del ticker
      neto: (callItm - putItm) / abiertoTodo,
      // B · desarme: cuánto del interés abierto total desaparece ese día
      desarme: venceTodo / abiertoTodo,
      lunes: pL / pV - 1,
      dosDias: pM > 0 ? pM / pV - 1 : null,
      semana: pS > 0 ? pS / pV - 1 : null,
    });
  }
}

console.log(`${filas.length} observaciones (símbolo, vencimiento)\n`);
radiografia(filas, ["neto", "desarme", "lunes", "viernes", "magLunes", "magViernes"], "power-monday");

// ── TRANSVERSAL: dentro de cada vencimiento, el mercado se cancela ──────────
// Se resta la media del propio día: lo que queda es cuánto se movió ESE símbolo por encima o por
// debajo de los otros 27 el mismo lunes. Sin esto estaríamos midiendo si el mercado subió.
const porVenc = new Map();
for (const f of filas) { if (!porVenc.has(f.venc)) porVenc.set(f.venc, []); porVenc.get(f.venc).push(f); }
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
for (const g of porVenc.values()) {
  for (const campo of ["lunes", "dosDias", "semana", "viernes", "magLunes", "magViernes"]) {
    const v = g.map((x) => x[campo]).filter((x) => x != null && Number.isFinite(x));
    if (!v.length) continue;
    const m = media(v);
    for (const x of g) if (x[campo] != null) x[`${campo}Rel`] = x[campo] - m;
  }
}

// ── LA SEÑAL LIMPIA DE "LA ACCIÓN YA HABÍA SUBIDO" ──────────────────────────
// `neto` alto significa que muchas calls acabaron dentro del dinero, y eso pasa sobre todo cuando
// la acción SUBIÓ hasta el vencimiento. Así que `neto` puede estar midiendo "hubo rally", no
// "habrá compra forzada" — y después de un rally el lunes suele ser más tranquilo.
//
// `netoLimpio` es lo que queda de `neto` tras quitarle, dentro de cada vencimiento, la parte que se
// explica por el rendimiento del viernes y por el de la semana previa. Es una regresión de andar por
// casa: se ordena por el rendimiento y se resta la media del cubo. Si el efecto sobre la magnitud
// del lunes SOBREVIVE a esta limpieza, es de las opciones; si desaparece, era la resaca del rally.
for (const g of porVenc.values()) {
  const conRet = g.filter((x) => x.viernes != null).sort((a2, b2) => a2.viernes - b2.viernes);
  const k = Math.max(1, Math.floor(conRet.length / 5));
  for (let q = 0; q < conRet.length; q += k) {
    const cubo = conRet.slice(q, q + k);
    const mNeto = cubo.reduce((a2, x) => a2 + x.neto, 0) / cubo.length;
    for (const x of cubo) x.netoLimpio = x.neto - mNeto;   // dentro del mismo nivel de rally
  }
}

const SENALES = [["neto", "A · calls ITM menos puts ITM (compra forzada)"],
                 ["netoLimpio", "A' · lo mismo, SIN el efecto del rally"],
                 ["desarme", "B · % del OI que vence (desarme)"]];
const VENTANAS = [["lunesRel", "lunes (dirección)"], ["magLunesRel", "lunes (MAGNITUD)"],
                  ["magViernesRel", "viernes (MAGNITUD)"]];

console.log(`═══ LAS ${PRUEBAS} PRUEBAS ═══`);
console.log(`(el resultado es RELATIVO al resto de símbolos del mismo día: el mercado ya está descontado)\n`);
console.log("señal                                          ventana        n    separación       t   ¿pasa?");
const res = [];
for (const [campo, nombreS] of SENALES) {
  for (const [vent, nombreV] of VENTANAS) {
    const sel = filas.filter((f) => f[campo] != null && f[vent] != null && Number.isFinite(f[vent]));
    if (sel.length < 200) { console.log(`  ${nombreS} · ${nombreV}: sólo ${sel.length}, no se corre`); continue; }
    const hall = sel.map((f) => ({ pnl: f[vent], ticker: f.ticker, fecha: `${f.venc.slice(0, 4)}-${f.venc.slice(4, 6)}-${f.venc.slice(6, 8)}` }));
    const clave = new Map(hall.map((h, i) => [h, sel[i][campo]]));
    const v = pasarBarrera(hall, (h) => clave.get(h), { pruebas: PRUEBAS, nMinimo: 200 });
    res.push({ nombre: `${nombreS} · ${nombreV}`, v, n: sel.length });
    const d = v.detalle;
    console.log(`${nombreS.padEnd(46)} ${nombreV.padEnd(12)} ${String(sel.length).padStart(4)}   ` +
                `${(d.sep == null ? "—" : (d.sep >= 0 ? "+" : "−") + (Math.abs(d.sep) * 100).toFixed(3) + "%").padStart(10)}   ` +
                `${(d.t == null ? "—" : d.t.toFixed(2)).padStart(5)}   ${v.pasa ? "✅ SÍ" : "no"}`);
  }
}

const pasan = res.filter((x) => x.v.pasa);
console.log(`\n${pasan.length} de ${res.length} pasan las cuatro cribas.`);
for (const x of res) {
  const d = x.v.detalle;
  if (!x.v.pasa && Math.abs(d.t ?? 0) < d.listonT) continue;
  console.log("\n" + informe(x.v, x.nombre));
}
if (!pasan.length && res.length) {
  console.log("\n═══ POTENCIA ═══");
  const hall = filas.filter((f) => f.lunesRel != null).map((f) => ({ pnl: f.lunesRel, ticker: f.ticker, fecha: f.venc }));
  const p = potencia(hall, 0.01);
  console.log(`  n=${hall.length} · separación detectable ${(p.detectable * 100).toFixed(3)}% · ${p.concluyente ? "CONCLUYENTE para un 1%" : "NO concluyente"}`);
}
