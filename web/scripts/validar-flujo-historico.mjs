// VALIDADOR de la descarga de flujo histórico.
//
// Uso: node scripts/validar-flujo-historico.mjs
//
// POR QUÉ EXISTE. El 2026-08-14 la descarga decía 5.472 de 5.472 y parecía terminada. Al abrir
// los ficheros, 3.905 eran marcadores de "sin datos" escritos cuando la petición falló — cinco
// tickers ENTEROS con cero datos. **Contar ficheros no valida nada.** Y otro día, 60 de 60
// operaciones venían con `oi: null` por pedir el "31 de febrero", y tampoco se veía en el recuento.
//
// Esto abre TODOS los ficheros y comprueba lo que de verdad importa, desglosado por ticker y por
// año — porque un total sano puede esconder un trozo entero muerto.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const DIR = process.env.FLUJO_DIR || "scripts/cache-theta/flujo-historico";
if (!existsSync(DIR)) { console.error(`No existe ${DIR}`); process.exit(1); }

const ficheros = readdirSync(DIR).filter((f) => f.endsWith(".json"));
const pct = (a, b) => (b > 0 ? ((a * 100) / b).toFixed(1) + "%" : "—");

const porTicker = {}, porAnio = {};
let tot = { dias: 0, festivos: 0, conDatos: 0, notables: 0, oiOK: 0, oiCero: 0, oiNull: 0, sinBBO: 0, primaTot: 0 };
const diasSospechosos = [];

for (const f of ficheros) {
  const d = JSON.parse(readFileSync(join(DIR, f), "utf8"));
  const t = d.sym ?? f.split("_")[0];
  const anio = (d.dia ?? f.match(/(\d{8})/)?.[1] ?? "????").slice(0, 4);
  porTicker[t] ??= { dias: 0, festivos: 0, conDatos: 0, notables: 0, oiNull: 0, sinBBO: 0, primero: "9", ultimo: "0" };
  porAnio[anio] ??= { dias: 0, notables: 0 };
  const P = porTicker[t];

  P.dias++; tot.dias++; porAnio[anio].dias++;
  if (d.dia) { if (d.dia < P.primero) P.primero = d.dia; if (d.dia > P.ultimo) P.ultimo = d.dia; }
  if (d.sinDatos) { P.festivos++; tot.festivos++; continue; }

  const ns = d.notables ?? [];
  P.conDatos++; tot.conDatos++;
  P.notables += ns.length; tot.notables += ns.length; porAnio[anio].notables += ns.length;
  for (const n of ns) {
    tot.primaTot += n.prima ?? 0;
    if (n.oi === null || n.oi === undefined) { P.oiNull++; tot.oiNull++; }
    else if (n.oi === 0) tot.oiCero++;
    else tot.oiOK++;
    if (n.bid == null || n.ask == null) { P.sinBBO++; tot.sinBBO++; }
  }
  // Un día con operaciones pero SIN NINGÚN open interest huele al fallo del "31 de febrero".
  if (ns.length > 0 && ns.every((n) => n.oi == null)) diasSospechosos.push(f);
}

console.log(`\n═══ VALIDACIÓN · ${ficheros.length} ficheros ═══\n`);
console.log("ticker    días  festivos  conDatos   notables   sin OI   sin bid/ask   período");
for (const t of Object.keys(porTicker).sort()) {
  const p = porTicker[t];
  console.log(
    t.padEnd(8), String(p.dias).padStart(5), String(p.festivos).padStart(9), String(p.conDatos).padStart(9),
    String(p.notables).padStart(10), pct(p.oiNull, p.notables).padStart(8), pct(p.sinBBO, p.notables).padStart(13),
    ` ${p.primero}→${p.ultimo}`,
  );
}

console.log("\naño     días   notables");
for (const a of Object.keys(porAnio).sort()) console.log(` ${a}  ${String(porAnio[a].dias).padStart(6)} ${String(porAnio[a].notables).padStart(10)}`);

console.log("\n─── TOTALES ───");
console.log(`  días descargados : ${tot.dias}  (${tot.conDatos} con datos · ${tot.festivos} festivos)`);
console.log(`  operaciones      : ${tot.notables.toLocaleString()}  ·  $${(tot.primaTot / 1e9).toFixed(1)}B de prima`);
console.log(`  OI real (>0)     : ${tot.oiOK.toLocaleString()} (${pct(tot.oiOK, tot.notables)})`);
console.log(`  OI = 0           : ${tot.oiCero} (apertura pura — dato legítimo)`);
console.log(`  OI desconocido   : ${tot.oiNull} (${pct(tot.oiNull, tot.notables)})`);
console.log(`  sin bid/ask      : ${tot.sinBBO} (${pct(tot.sinBBO, tot.notables)})`);

// ── LOS AVISOS ───────────────────────────────────────────────────────────────
const avisos = [];
const esperados = Number(process.env.FLUJO_DIAS_ESPERADOS || 683);
for (const [t, p] of Object.entries(porTicker)) {
  if (p.dias < esperados) avisos.push(`${t}: sólo ${p.dias} días de ${esperados} — INCOMPLETO`);
  if (p.notables === 0) avisos.push(`${t}: CERO operaciones en todo el período — sospechoso`);
  if (p.notables > 0 && p.oiNull / p.notables > 0.05) avisos.push(`${t}: ${pct(p.oiNull, p.notables)} sin open interest (umbral 5%)`);
  if (p.notables > 0 && p.sinBBO / p.notables > 0.05) avisos.push(`${t}: ${pct(p.sinBBO, p.notables)} sin bid/ask (umbral 5%)`);
}
if (diasSospechosos.length) avisos.push(`${diasSospechosos.length} días con operaciones pero NINGÚN OI: ${diasSospechosos.slice(0, 4).join(", ")}`);
const ticks = Object.keys(porTicker).length;
if (ticks < Number(process.env.FLUJO_TICKERS_ESPERADOS || 8)) avisos.push(`sólo ${ticks} tickers, se esperaban 8`);

console.log("");
if (avisos.length) {
  console.log("⚠️  AVISOS:");
  for (const a of avisos) console.log("   · " + a);
  console.log("\nNO dar la descarga por buena hasta resolverlos.");
  process.exit(1);
}
console.log("✅ Sin avisos: completo, con open interest y con bid/ask en todos los tickers y años.");
