// ¿QUIÉN INICIÓ CADA OPERACIÓN? — y el CLAVADO del tercer viernes
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/quien-inicio.mjs
//
// ═══ POR QUÉ IMPORTA QUIÉN INICIÓ ═════════════════════════════════════════════════════════
//
// El GEX de este proyecto SUPONE el signo en vez de medirlo: da por hecho que los clientes compran
// calls y venden puts. De ahí sale si el creador de mercado está corto o largo de gamma, que es
// TODO el mecanismo. Si la suposición está mal, el GEX está mal.
//
//   cliente COMPRA la call → creador CORTO de call → CORTO de gamma → compra cuando sube y vende
//                            cuando baja → AMPLIFICA el movimiento
//   cliente VENDE la call  → creador LARGO de call → LARGO de gamma → vende cuando sube y compra
//                            cuando baja → CLAVA el precio
//
// El flujo de 2024-2026 guarda el bid y el ask DEL MOMENTO de cada operación, así que se puede
// clasificar: precio en el ask = lo inició un comprador; precio en el bid = lo inició un vendedor.
//
// Esto no es una estrategia: es la comprobación de un supuesto del que cuelga lo único que sigue
// vivo en el proyecto. Ver [cboe-open-close-el-dato-que-falta] en memoria.
//
// ═══ Y EL CLAVADO (segunda parte) ═════════════════════════════════════════════════════════
//
// La otra pregunta de Lester: ¿sigue teniendo valor el tercer viernes? El DESARME ya se midió y dio
// cero (t=0,02). Pero el CLAVADO no: que el precio se pegue al strike con más interés abierto
// según se acerca el vencimiento. Y eso es cobertura DURANTE la vida de la opción — el único sitio
// donde hemos concluido que sí hay flujo nuevo.
//
// Criterio declarado: se mide la distancia del cierre del viernes al strike de máximo interés
// abierto, contra la distancia que había el lunes anterior. Si hay clavado, la distancia ENCOGE
// más de lo que encogería por azar. El control son los viernes que NO son terceros.

import { readFileSync, readdirSync, existsSync } from "node:fs";

const FDIR = "scripts/cache-theta/flujo-historico";
const OIDIR = "scripts/cache-theta/oi-ancho";
const CIE = "scripts/cache-theta/cierres";
const CDIR = "scripts/cache-theta/cadenas";

// ── PARTE 1 · quién inició ──────────────────────────────────────────────────
console.log("\n═══ PARTE 1 · ¿QUIÉN INICIÓ CADA OPERACIÓN? ═══\n");

const cuenta = { call: { comprador: 0, vendedor: 0, medio: 0, sinBBO: 0 },
                 put:  { comprador: 0, vendedor: 0, medio: 0, sinBBO: 0 } };
const dolares = { call: { comprador: 0, vendedor: 0, medio: 0 }, put: { comprador: 0, vendedor: 0, medio: 0 } };

for (const f of readdirSync(FDIR)) {
  if (!f.endsWith(".json")) continue;
  const j = JSON.parse(readFileSync(`${FDIR}/${f}`, "utf8"));
  for (const n of j.notables ?? []) {
    const lado = n.right === "C" ? "call" : "put";
    if (!(n.bid > 0) || !(n.ask > 0)) { cuenta[lado].sinBBO++; continue; }
    // A CABALLO DE LA HORQUILLA, no exacto: una operación al ask menos un céntimo la inició un
    // comprador igual. El punto medio se cuenta aparte porque no se sabe.
    const ancho = n.ask - n.bid;
    const pos = ancho > 0 ? (n.price - n.bid) / ancho : 0.5;
    const quien = pos >= 0.7 ? "comprador" : pos <= 0.3 ? "vendedor" : "medio";
    cuenta[lado][quien]++;
    dolares[lado][quien] += n.prima;
  }
}

const pct = (x, t) => `${((x / t) * 100).toFixed(1)}%`;
for (const lado of ["call", "put"]) {
  const c = cuenta[lado];
  const t = c.comprador + c.vendedor + c.medio;
  const d = dolares[lado];
  const td = d.comprador + d.vendedor + d.medio;
  console.log(`  ${lado.toUpperCase()}S · ${t.toLocaleString("es-ES")} operaciones con horquilla (${c.sinBBO} sin)`);
  console.log(`     por NÚMERO:  las inició un comprador ${pct(c.comprador, t)} · un vendedor ${pct(c.vendedor, t)} · a medias ${pct(c.medio, t)}`);
  console.log(`     por DÓLARES: comprador ${pct(d.comprador, td)} · vendedor ${pct(d.vendedor, td)} · a medias ${pct(d.medio, td)}`);
}
const dc = dolares.call, dp = dolares.put;
console.log(`\n  EL SUPUESTO DEL GEX es "el cliente compra calls y vende puts".`);
console.log(`     en calls: ${pct(dc.comprador, dc.comprador + dc.vendedor)} de los dólares decididos los inició un comprador`);
console.log(`     en puts:  ${pct(dp.vendedor, dp.comprador + dp.vendedor)} los inició un vendedor`);
console.log(`     (si los dos están cerca del 50%, el supuesto no se sostiene y el signo del GEX es una moneda al aire)`);

// ── PARTE 2 · el clavado del tercer viernes ─────────────────────────────────
console.log("\n\n═══ PARTE 2 · ¿SE CLAVA EL PRECIO EN EL STRIKE CON MÁS INTERÉS ABIERTO? ═══\n");

const px = new Map();
for (const f of readdirSync(CIE)) px.set(f.replace(".json", ""), JSON.parse(readFileSync(`${CIE}/${f}`, "utf8")));
const diasPorSim = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/);
  if (!m) continue;
  if (!diasPorSim.has(m[1])) diasPorSim.set(m[1], []);
  diasPorSim.get(m[1]).push(m[2]);
}
for (const v of diasPorSim.values()) v.sort();
const cal = [...new Set([...diasPorSim.values()].flat())].sort();
const idx = new Map(cal.map((d, i) => [d, i]));
const esTercerViernes = (d) => {
  const n = +d.slice(6, 8);
  return n >= 15 && n <= 21 && new Date(Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, n)).getUTCDay() === 5;
};

/** Strike con más interés abierto (calls+puts) en un vencimiento, visto desde `dia`. */
function strikeImán(t, dia, venc) {
  const f = `${OIDIR}/${t}_d${dia}.json`;
  if (!existsSync(f)) return null;
  const g = JSON.parse(readFileSync(f, "utf8"))[venc];
  if (!g) return null;
  const suma = new Map();
  for (const [cl, n] of Object.entries(g)) {
    const K = Number(cl.slice(0, -2)), c = Number(n) || 0;
    if (K > 0 && c > 0) suma.set(K, (suma.get(K) ?? 0) + c);
  }
  let mejor = null, max = 0;
  for (const [K, c] of suma) if (c > max) { max = c; mejor = K; }
  return mejor;
}

const acerca = { tercer: [], otros: [] };
for (const venc of cal) {
  const i = idx.get(venc);
  if (i == null || i < 6) continue;
  const dow = new Date(Date.UTC(+venc.slice(0, 4), +venc.slice(4, 6) - 1, +venc.slice(6, 8))).getUTCDay();
  if (dow !== 5) continue;                                   // sólo viernes
  const grupo = esTercerViernes(venc) ? "tercer" : "otros";
  const lunes = cal[i - 4];                                  // el lunes de esa semana
  for (const t of diasPorSim.keys()) {
    const p = px.get(t);
    if (!p) continue;
    const pL = p[lunes], pV = p[venc];
    if (!(pL > 0) || !(pV > 0)) continue;
    const K = strikeImán(t, lunes, venc);
    if (!K || !(K > 0)) continue;
    const dLunes = Math.abs(pL - K) / pL;
    const dViernes = Math.abs(pV - K) / pV;
    if (!(dLunes > 0.005)) continue;                         // ya estaba encima: no hay nada que acercar
    acerca[grupo].push((dLunes - dViernes) / dLunes);         // >0 = se acercó
  }
}

const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
for (const g of ["tercer", "otros"]) {
  const v = acerca[g];
  if (!v.length) { console.log(`  ${g}: sin datos`); continue; }
  const s = [...v].sort((a, b) => a - b);
  const sd = Math.sqrt(v.reduce((a, x) => a + (x - media(v)) ** 2, 0) / (v.length - 1));
  console.log(`  ${g === "tercer" ? "TERCEROS viernes" : "el resto de viernes"}  n=${String(v.length).padStart(5)} · ` +
              `se acercó ${(media(v) * 100).toFixed(1)}% de media · mediana ${(s[s.length >> 1] * 100).toFixed(1)}% · ` +
              `t vs cero ${(media(v) / (sd / Math.sqrt(v.length))).toFixed(2)}`);
}
const A = acerca.tercer, B = acerca.otros;
if (A.length && B.length) {
  const vA = A.reduce((a, x) => a + (x - media(A)) ** 2, 0) / (A.length - 1);
  const vB = B.reduce((a, x) => a + (x - media(B)) ** 2, 0) / (B.length - 1);
  const t = (media(A) - media(B)) / Math.sqrt(vA / A.length + vB / B.length);
  console.log(`\n  DIFERENCIA tercer viernes menos el resto: ${((media(A) - media(B)) * 100).toFixed(2)} puntos · t = ${t.toFixed(2)}`);
  console.log(`  (si el clavado existe, el tercer viernes debería acercarse MÁS que un viernes normal)`);
}
