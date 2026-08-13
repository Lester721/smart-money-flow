// ¿PREDICE EL `score` DE MARKETSNACK EL MOVIMIENTO DEL SUBYACENTE?
//
// El diseño está fijado de antemano en docs/preregistro-marketsnack.md y NO se toca según salgan
// los resultados. Si al correrlo aparece un fallo del diseño, se anota debajo del pre-registro
// con fecha y el resultado pasa a ser exploración, no test.
//
// ╔═══ CÓMO SE EVITA MIRAR EL FUTURO ═══╗
// Las operaciones ocurren DURANTE el día D, a cualquier hora. Si usara el precio de apertura de D
// o el de la barra del momento, estaría mezclando información que aún no existía. Aquí:
//     entrada = CIERRE del día D   ·   salida = CIERRE de D+1, D+3, D+5
// El cierre de D es posterior a cualquier operación de D, así que no hay forma de mirar adelante.
// Es conservador —se pierde el movimiento intradía— pero es defendible, que es lo que importa.
// Ver [[trampa-etiquetas-de-tiempo]]: ya nos coló un look-ahead por una etiqueta de tiempo.
//
// ╔═══ POR QUÉ SE AGREGA POR TICKER-DÍA ═══╗
// Diez operaciones del mismo ticker el mismo día NO son diez datos: reaccionan a lo mismo. Si las
// contara sueltas, la t saldría inflada y me creería un resultado que no está. El pre-registro
// exige n >= 200 eventos INDEPENDIENTES, y un evento es un ticker-día.
//
// Uso: node scripts/marketsnack/medir-score.mjs [archivo.jsonl]

import fs from "node:fs";
import path from "node:path";
import rl from "node:readline";

const B = process.env.THETA_BASE || "http://127.0.0.1:25503/v3";
const FLUJO = process.argv[2] || "data/marketsnack/flujo-prima1000k.jsonl";
const CACHE = "data/marketsnack/cierres";
const HORIZONTES = [1, 3, 5];          // fijados en el pre-registro. No se añaden más.
const QUINTILES = 5;

fs.mkdirSync(CACHE, { recursive: true });

// OCC: RAIZ + YYMMDD + C|P + strike×1000 a 8 dígitos.
const parsear = (s) => {
  const m = /^([A-Z]+)(\d{6})([CP])(\d{8})$/.exec(s);
  return m ? { raiz: m[1], tipo: m[3] } : null;
};

// ── 1. agregar el flujo por ticker-día ───────────────────────────────────────
console.log(`═══ MEDIR EL SCORE DE MARKETSNACK ═══\n`);
console.log(`[1] leyendo ${FLUJO}`);

const eventos = new Map();   // "RAIZ|YYYY-MM-DD" -> acumulador
let leidas = 0, sinParsear = 0;

for await (const linea of rl.createInterface({ input: fs.createReadStream(FLUJO) })) {
  if (!linea.trim()) continue;
  let t; try { t = JSON.parse(linea); } catch { continue; }
  const p = parsear(t.symbol ?? "");
  if (!p) { sinParsear++; continue; }
  if (!t.timestamp || typeof t.score !== "number" || !(t.premium > 0)) continue;
  leidas++;

  const dia = t.timestamp.slice(0, 10);
  const k = `${p.raiz}|${dia}`;
  let e = eventos.get(k);
  if (!e) { e = { raiz: p.raiz, dia, prima: 0, scorePonderado: 0, direccion: 0, n: 0, lados: new Map() }; eventos.set(k, e); }

  // El signo de la dirección lo pone SU etiqueta `sentiment`, no yo. Si me inventara la dirección
  // a partir de calls/puts estaría probando mi regla, no la suya.
  const signo = t.sentiment === "bullish" ? 1 : t.sentiment === "bearish" ? -1 : 0;
  e.prima += t.premium;
  e.scorePonderado += t.score * t.premium;
  e.direccion += signo * t.premium;
  e.n++;
  e.lados.set(t.side, (e.lados.get(t.side) ?? 0) + t.premium);
}

console.log(`    operaciones usadas: ${leidas.toLocaleString("es-ES")}  ·  sin parsear: ${sinParsear}`);
console.log(`    eventos ticker-día: ${eventos.size.toLocaleString("es-ES")}`);

// ── 2. cierres del subyacente, de ThetaData (NO de MarketSnack) ──────────────
const raices = [...new Set([...eventos.values()].map((e) => e.raiz))];
const dias = [...new Set([...eventos.values()].map((e) => e.dia))].sort();
const desde = dias[0], hasta = new Date(Date.parse(dias[dias.length - 1]) + 20 * 86400000).toISOString().slice(0, 10);
console.log(`\n[2] cierres de ${raices.length} subyacentes · ${desde} → ${hasta}`);
console.log(`    (de ThetaData: no se valida a MarketSnack con sus propios datos)`);

const INDICES = new Set(["SPX", "SPXW", "VIX", "XSP", "RUT", "DJX"]);

async function cierres(raiz) {
  const f = path.join(CACHE, `${raiz}.json`);
  if (fs.existsSync(f)) { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { /* rehacer */ } }
  const sim = raiz === "SPXW" ? "SPX" : raiz;
  const ruta = INDICES.has(raiz) ? "index/history/eod" : "stock/history/eod";
  try {
    const r = await fetch(`${B}/${ruta}?symbol=${sim}&start_date=${desde.replaceAll("-", "")}&end_date=${hasta.replaceAll("-", "")}`,
                          { signal: AbortSignal.timeout(60000) });
    const txt = await r.text();
    if (!r.ok || txt.includes("permission") || txt.includes("subscription") || txt.length < 100) {
      fs.writeFileSync(f, "null"); return null;
    }
    const lin = txt.trim().split("\n");
    const cab = lin[0].split(","), iC = cab.indexOf("close"), iT = cab.indexOf("last_trade");
    const serie = [];
    for (const l of lin.slice(1)) {
      const c = l.split(",");
      const cierre = +c[iC], fecha = (c[iT] ?? "").slice(0, 10);
      if (cierre > 0 && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) serie.push([fecha, cierre]);
    }
    serie.sort((a, b) => (a[0] < b[0] ? -1 : 1));
    fs.writeFileSync(f, JSON.stringify(serie));
    return serie.length ? serie : null;
  } catch { fs.writeFileSync(f, "null"); return null; }
}

const series = new Map();
let hechas = 0, sinDatos = 0;
for (const r of raices) {
  const s = await cierres(r);
  if (s) series.set(r, s); else sinDatos++;
  if (++hechas % 50 === 0) process.stdout.write(`\r    ${hechas}/${raices.length}`);
}
console.log(`\r    ${hechas}/${raices.length}  ·  sin datos: ${sinDatos} (se excluyen y se dice)`);

// ── 3. rendimientos futuros, entrada al CIERRE del día del flujo ─────────────
const muestra = [];
for (const e of eventos.values()) {
  const s = series.get(e.raiz);
  if (!s) continue;
  const i = s.findIndex(([f]) => f === e.dia);
  if (i < 0) continue;                         // el día del flujo no es día de mercado
  const entrada = s[i][1];
  const dir = Math.sign(e.direccion);
  if (dir === 0) continue;                     // sin dirección neta: no hay nada que predecir
  const fila = { raiz: e.raiz, dia: e.dia, score: e.scorePonderado / e.prima, dir, prima: e.prima, n: e.n };
  let alguno = false;
  for (const h of HORIZONTES) {
    if (i + h >= s.length) continue;
    // Rendimiento FIRMADO: si ellos dicen bajista y baja, acertaron -> positivo.
    fila[`r${h}`] = ((s[i + h][1] - entrada) / entrada) * dir * 100;
    alguno = true;
  }
  if (alguno) muestra.push(fila);
}
console.log(`\n[3] eventos con rendimiento calculable: ${muestra.length.toLocaleString("es-ES")}`);

// ── 4. medición ──────────────────────────────────────────────────────────────
const media = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const de = (a) => { const m = media(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const t2 = (a, b) => {
  const ma = media(a), mb = media(b), va = de(a) ** 2, vb = de(b) ** 2;
  return (ma - mb) / Math.sqrt(va / a.length + vb / b.length);
};

function medir(filas, etiqueta) {
  console.log(`\n${"─".repeat(72)}\n${etiqueta}   (n = ${filas.length})`);
  if (filas.length < 30) { console.log(`   muestra insuficiente`); return null; }
  const resultado = {};
  for (const h of HORIZONTES) {
    const con = filas.filter((f) => f[`r${h}`] != null).sort((a, b) => a.score - b.score);
    if (con.length < 30) continue;
    const tam = Math.floor(con.length / QUINTILES);
    const grupos = [];
    for (let q = 0; q < QUINTILES; q++) {
      const trozo = con.slice(q * tam, q === QUINTILES - 1 ? con.length : (q + 1) * tam);
      grupos.push({ score: media(trozo.map((f) => f.score)), r: media(trozo.map((f) => f[`r${h}`])), n: trozo.length,
                    vals: trozo.map((f) => f[`r${h}`]) });
    }
    const t = t2(grupos[QUINTILES - 1].vals, grupos[0].vals);
    // Monótona = cada grupo mejor que el anterior. El pre-registro lo exige, no vale solo el techo.
    const monotona = grupos.every((g, i) => i === 0 || g.r >= grupos[i - 1].r);
    console.log(`\n   Horizonte +${h} día(s)   ·   n = ${con.length}`);
    console.log(`     quintil   score medio   rendimiento firmado   n`);
    grupos.forEach((g, i) => console.log(`        Q${i + 1}       ${g.score.toFixed(1).padStart(6)}        ${(g.r >= 0 ? "+" : "") + g.r.toFixed(3)}%`.padEnd(52) + `${g.n}`));
    console.log(`     Q5 − Q1 = ${(grupos[4].r - grupos[0].r >= 0 ? "+" : "") + (grupos[4].r - grupos[0].r).toFixed(3)}%   ·   t = ${t.toFixed(2)}   ·   monótona: ${monotona ? "SÍ" : "NO"}`);
    resultado[h] = { spread: grupos[4].r - grupos[0].r, t, monotona, n: con.length };
  }
  return resultado;
}

const todo = medir(muestra, "TODA LA MUESTRA");

// Partir por la mitad EN EL TIEMPO, como exige el pre-registro.
const ordenPorFecha = [...muestra].sort((a, b) => (a.dia < b.dia ? -1 : 1));
const corte = Math.floor(ordenPorFecha.length / 2);
const primera = medir(ordenPorFecha.slice(0, corte), "PRIMERA MITAD (fuera de muestra)");
const segunda = medir(ordenPorFecha.slice(corte), "SEGUNDA MITAD (fuera de muestra)");

// ── 5. veredicto contra el pre-registro ──────────────────────────────────────
console.log(`\n${"═".repeat(72)}\nVEREDICTO CONTRA EL PRE-REGISTRO\n`);
if (!todo) { console.log(`   Muestra insuficiente. Según el pre-registro: NO RENOVAR.`); process.exit(0); }

for (const h of HORIZONTES) {
  const a = todo[h], p = primera?.[h], s = segunda?.[h];
  if (!a) continue;
  const cond = {
    "monótona": a.monotona,
    "t > 2": a.t > 2,
    "n ≥ 200": a.n >= 200,
    "mismo signo en las dos mitades": !!(p && s && Math.sign(p.spread) === Math.sign(s.spread) && Math.sign(a.spread) === Math.sign(p.spread)),
  };
  const pasa = Object.values(cond).every(Boolean);
  console.log(`   +${h} día(s):  ${Object.entries(cond).map(([k, v]) => `${v ? "✓" : "✗"} ${k}`).join("   ")}`);
  console.log(`             ${pasa ? "→ pasa las condiciones estadísticas. Falta el coste real y el listón de dinero." : "→ NO pasa."}\n`);
}
console.log(`   Recordatorio: aunque pase lo de arriba, el pre-registro exige TAMBIÉN sobrevivir a`);
console.log(`   la horquilla y comisiones reales, y dejar >$5.000/año netos superando a SPY.`);
console.log(`   Nada de esto está medido todavía.\n`);
