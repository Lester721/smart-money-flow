// ¿UN CONTRATO QUE NO ESTÁ EN LA CADENA CACHEADA VALE CERO, O ES UN HUECO DE DATOS?
//
// Esta pregunta decide si se puede hacer el test de "comprar y aguantar" con lo que hay en disco.
//
// `bajar-cadenas-todos-los-dias.ts` descarta al guardar todo contrato con `bid <= 0`. Para vender
// prima eso es un filtro sano: sin puja no hay a quién venderle. Pero para COMPRAR Y AGUANTAR es
// exactamente al revés — un contrato cuya puja se va a cero es la pérdida total, el resultado más
// importante que hay que contar. Si "no está en el fichero" se leyera como "sin dato" y se
// descartara, el test tiraría sistemáticamente a los perdedores y daría un resultado precioso y
// falso. Es la trampa de supervivencia de manual.
//
// Así que hay que comprobarlo contra la fuente, no suponerlo: se cogen contratos que SÍ existían
// el día de la entrada, se buscan en la cadena cacheada de una fecha posterior, y a los que faltan
// se les pregunta a ThetaData qué cotización tenían ese día de verdad.
//
// Uso: node scripts/validar-ausentes-cadena.mjs

import { readFileSync, existsSync, readdirSync } from "node:fs";

const B = process.env.THETA_BASE || "http://127.0.0.1:25503";
const FDIR = "scripts/cache-theta/flujo-historico";
const CDIR = "scripts/cache-theta/cadenas";
const sinG = (s) => String(s).replace(/-/g, "");

/** Pares (entrada, salida) de varios símbolos y meses, para no sacar conclusiones de un solo día. */
const CASOS = [
  ["NVDA", "20240603", "20240902"],
  ["AAPL", "20240902", "20241202"],
  ["TSLA", "20250203", "20250502"],
  ["META", "20250602", "20250902"],
  ["SPY",  "20241202", "20250303"],
];

const MAX_PREGUNTAS = 6;   // por caso: suficiente para ver el patrón sin machacar el Terminal

let totalAusentes = 0, totalHallados = 0;
const veredictos = { "bid 0 (vale cero)": 0, "cotiza pero no está en caché": 0, "sin filas": 0, "error": 0 };

for (const [sym, entrada, salida] of CASOS) {
  const fFlujo = `${FDIR}/${sym}_${entrada}.json`;
  const fCadena = `${CDIR}/${sym}_d${salida}.json`;
  if (!existsSync(fFlujo)) { console.log(`(sin flujo: ${fFlujo})`); continue; }
  if (!existsSync(fCadena)) { console.log(`(sin cadena: ${fCadena})`); continue; }

  const flujo = JSON.parse(readFileSync(fFlujo, "utf8"));
  const cadena = JSON.parse(readFileSync(fCadena, "utf8"));

  const hallados = [], ausentes = [];
  for (const n of flujo.notables || []) {
    if (sinG(n.exp) <= salida) continue;                 // ya habría vencido: no aplica
    const grupo = cadena[sinG(n.exp)];
    if (grupo && grupo[`${n.strike}|${n.right}`]) hallados.push(n); else ausentes.push(n);
  }
  totalHallados += hallados.length; totalAusentes += ausentes.length;

  console.log(`\n═══ ${sym}  entrada ${entrada} → salida ${salida}`);
  console.log(`    en la cadena: ${hallados.length} · AUSENTES: ${ausentes.length}` +
              ` (${((ausentes.length / Math.max(1, hallados.length + ausentes.length)) * 100).toFixed(0)}%)`);

  for (const n of ausentes.slice(0, MAX_PREGUNTAS)) {
    const url = `${B}/v3/option/history/eod?symbol=${sym}&expiration=${sinG(n.exp)}` +
                `&strike=${Math.round(n.strike * 1000)}&right=${n.right}` +
                `&start_date=${salida}&end_date=${salida}`;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      const lin = (await r.text()).trim().split("\n");
      if (lin.length < 2) { console.log(`    ${n.exp} ${String(n.strike).padStart(8)}${n.right}  SIN FILAS (HTTP ${r.status})`); veredictos["sin filas"]++; continue; }
      const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
      const c = lin[1].split(",");
      const g = (nom) => { const i = cab.indexOf(nom); return i < 0 ? null : Number(String(c[i]).replace(/"/g, "")); };
      const bid = g("bid"), ask = g("ask"), close = g("close"), vol = g("volume");
      const veredicto = !(bid > 0) ? "bid 0 (vale cero)" : "cotiza pero no está en caché";
      veredictos[veredicto]++;
      console.log(`    ${n.exp} ${String(n.strike).padStart(8)}${n.right}  bid=${bid} ask=${ask} close=${close} vol=${vol}   → ${veredicto}`);
    } catch (e) { veredictos["error"]++; console.log(`    ${n.exp} ${n.strike}${n.right}  error: ${String(e.message).slice(0, 40)}`); }
  }
}

console.log(`\n═══ RESUMEN ═══`);
console.log(`  contratos hallados en caché: ${totalHallados}`);
console.log(`  ausentes:                    ${totalAusentes}`);
console.log(`\n  de los ausentes preguntados a ThetaData:`);
for (const [k, v] of Object.entries(veredictos)) if (v) console.log(`    ${String(v).padStart(3)}  ${k}`);
console.log(`\n  Si casi todos son "bid 0", la ausencia SE PUEDE leer como pérdida total y el test`);
console.log(`  se puede hacer con la caché. Si hay muchos "cotiza pero no está en caché", la caché`);
console.log(`  tiene huecos y habría que rellenarlos antes de medir nada.`);
