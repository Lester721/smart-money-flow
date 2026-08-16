// COBERTURA DE LAS SALIDAS — ¿se puede medir "comprar y aguantar" con la caché que hay?
//
// Antes de escribir el test hay que saber tres cosas, y las tres con números, no con impresiones:
//
//   1. Para cada operación del flujo y cada horizonte (1/3/6/12 meses), ¿existe la cadena del día
//      de salida en disco? Un día que falta NO es lo mismo que un contrato que no cotiza.
//   2. Si la cadena existe, ¿está el contrato dentro? Ausente = puja a cero = pérdida total, pero
//      eso hay que comprobarlo aparte (validar-ausentes-cadena.mjs), no darlo por hecho.
//   3. ¿Cuántas operaciones sobreviven a cada horizonte? Un contrato que vence antes del horizonte
//      no se puede "aguantar" ese plazo: o se sale al vencimiento o no entra en esa medida.
//
// Sin estos tres números, cualquier resultado del test estaría condicionado por huecos de datos
// que nadie habría mirado. Es la lección de [campo-que-no-existe-se-lee-cero]: un hueco silencioso
// se lee como un cero y el cero se lee como un resultado.
//
// Uso: node scripts/cobertura-salidas.mjs

import { readFileSync, existsSync, readdirSync } from "node:fs";

const FDIR = "scripts/cache-theta/flujo-historico";
const CDIR = "scripts/cache-theta/cadenas";
const sinG = (s) => String(s).replace(/-/g, "");
const aIso = (d) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
const HORIZONTES = [30, 90, 180, 365];

// Qué días hábiles hay en caché por símbolo: la salida se ancla en el PRIMER día con cadena a
// partir del objetivo. Sin esto, cualquier salida que cayera en fin de semana o festivo contaría
// como "hueco" y la cobertura saldría artificialmente mala.
const diasPorSimbolo = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/);
  if (!m) continue;
  if (!diasPorSimbolo.has(m[1])) diasPorSimbolo.set(m[1], []);
  diasPorSimbolo.get(m[1]).push(m[2]);
}
for (const v of diasPorSimbolo.values()) v.sort();

/** Primer día con cadena en caché a partir de `objetivo` (y como mucho 10 días después). */
function diaSalida(sym, objetivo) {
  const dias = diasPorSimbolo.get(sym);
  if (!dias) return null;
  let lo = 0, hi = dias.length - 1, res = null;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (dias[m] >= objetivo) { res = dias[m]; hi = m - 1; } else lo = m + 1;
  }
  if (!res) return null;
  const d1 = Date.parse(aIso(objetivo) + "T00:00:00Z"), d2 = Date.parse(aIso(res) + "T00:00:00Z");
  return (d2 - d1) / 86_400_000 <= 10 ? res : null;      // más de 10 días de salto: es un hueco
}

const cacheCadena = new Map();
function cadena(sym, dia) {
  const k = `${sym}|${dia}`;
  if (cacheCadena.has(k)) return cacheCadena.get(k);
  const f = `${CDIR}/${sym}_d${dia}.json`;
  const v = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
  if (cacheCadena.size > 400) cacheCadena.clear();       // no cabe 1,5 GB en memoria
  cacheCadena.set(k, v);
  return v;
}

const est = {};
for (const h of HORIZONTES) est[h] = { total: 0, venceAntes: 0, sinCadena: 0, ausente: 0, ok: 0 };
let opsTotales = 0, sinCadenaEntrada = 0;

const ficheros = readdirSync(FDIR).filter((f) => f.endsWith(".json")).sort();
console.log(`Recorriendo ${ficheros.length} días de flujo…\n`);

for (const f of ficheros) {
  const j = JSON.parse(readFileSync(`${FDIR}/${f}`, "utf8"));
  const sym = j.sym, entrada = j.dia;
  const cadEntrada = cadena(sym, entrada);
  if (!cadEntrada) { sinCadenaEntrada += (j.notables || []).length; continue; }
  const msEntrada = Date.parse(aIso(entrada) + "T00:00:00Z");

  for (const n of j.notables || []) {
    opsTotales++;
    const expYmd = sinG(n.exp);
    const clave = `${n.strike}|${n.right}`;
    for (const h of HORIZONTES) {
      const e = est[h];
      e.total++;
      const objetivo = sinG(new Date(msEntrada + h * 86_400_000).toISOString().slice(0, 10));
      // Vence antes del horizonte: no se puede aguantar ese plazo con ESTE contrato.
      if (expYmd <= objetivo) { e.venceAntes++; continue; }
      const dSal = diaSalida(sym, objetivo);
      if (!dSal) { e.sinCadena++; continue; }
      const c = cadena(sym, dSal);
      if (!c) { e.sinCadena++; continue; }
      if (c[expYmd]?.[clave]) e.ok++; else e.ausente++;
    }
  }
}

console.log(`═══ ${opsTotales.toLocaleString("es-ES")} operaciones de flujo con cadena de entrada en disco ═══`);
if (sinCadenaEntrada) console.log(`    (${sinCadenaEntrada.toLocaleString("es-ES")} descartadas: sin cadena el día de la entrada)\n`);

console.log("horizonte   vence antes    sin cadena     ausente        MEDIBLES");
for (const h of HORIZONTES) {
  const e = est[h], p = (x) => `${String(x).padStart(7)} (${((x / e.total) * 100).toFixed(1).padStart(4)}%)`;
  console.log(`  ${String(h).padStart(3)} d    ${p(e.venceAntes)}  ${p(e.sinCadena)}  ${p(e.ausente)}  ${p(e.ok)}`);
}
console.log(`
  "vence antes"  → el contrato expira antes del horizonte. No es un fallo de datos: es que ese
                   plazo no aplica a ese contrato. Manda el vencimiento, no el horizonte.
  "sin cadena"   → falta el día de salida en disco. ESTO sí es hueco de datos.
  "ausente"      → hay cadena pero el contrato no está: casi seguro puja a cero (pérdida total).
                   Se cuenta como −100%, NO se descarta. Comprobado en validar-ausentes-cadena.mjs.
  "MEDIBLES"     → con precio de salida real.`);
