// LA PRIMA LEJOS DEL DINERO — la única señal que quedó viva, medida en serio.
//
// ═══ DE DÓNDE VIENE ═════════════════════════════════════════════════════════════════════════
//
// Al volver a pasar las señales muertas por la esquina barata, cuatro pasaron la primera criba.
// Dos eran momento (un factor conocido de hace décadas). Una tercera se cayó al quitar tres
// tickers. Sobrevivió una: **cuánta prima vive lejos del dinero**, cobrada con el CONO.
//
// Con todos: +7,4%. Sin NVDA, QQQ y SPY: +6,7%. No es un artefacto de tres nombres.
//
// ═══ POR QUÉ ESTO NO ES TODAVÍA UN HALLAZGO ═════════════════════════════════════════════════
//
// La señal es CASI ESTÁTICA: NVDA cae en el tercio alto 127 meses de ~130. Eso significa que las
// 1.116 filas NO son 1.116 apuestas independientes — es la misma apuesta (largo de volatilidad en
// los nombres volátiles) repetida ciento y pico veces.
//
// Contar cada fila como una observación infla el t. La unidad honesta es EL MES: cada mes da UNA
// diferencia (tercio alto menos tercio bajo), y el t se calcula sobre esa serie de ~130 números.
//
// ═══ LAS TRES PRUEBAS ═══════════════════════════════════════════════════════════════════════
//
//  1. n honesto: t sobre la serie mensual, no sobre las operaciones
//  2. mitades cruzadas: ajustar en una y probar en la otra, EN LAS DOS DIRECCIONES
//  3. control: ¿es sólo "comprar opciones en lo volátil"? Se mide lo mismo ordenando por IV
//     cercana al dinero. Si da igual, la señal no aporta nada que la volatilidad no diga ya.
//
// El panel se guarda en disco: construirlo tarda, analizarlo no.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/senal-prima-lejos.mjs

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const PANEL = "scripts/cache-theta/panel-prima-lejos.json";
const OTM = 5, DTE_OBJ = 90, DTE_TOL = 25, SALIR = 23, ASK_MIN = 0.10;

const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const sd = (v) => { const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const tDe = (v) => media(v) / (sd(v) / Math.sqrt(v.length));
const pct = (x) => (x * 100).toFixed(1) + "%";
const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);

let filas;
if (existsSync(PANEL)) {
  filas = JSON.parse(readFileSync(PANEL, "utf8"));
  console.log(`\n## Panel leído de disco · ${filas.length} filas\n`);
} else {
  const diasPorSim = new Map();
  for (const f of readdirSync(CDIR)) {
    const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/);
    if (!m) continue;
    if (!diasPorSim.has(m[1])) diasPorSim.set(m[1], []);
    diasPorSim.get(m[1]).push(m[2]);
  }
  for (const v of diasPorSim.values()) v.sort();
  const TICKERS = [...diasPorSim.keys()].sort();

  const cache = new Map();
  const cadena = (sym, dia) => {
    const k = `${sym}|${dia}`;
    if (cache.has(k)) { const v = cache.get(k); cache.delete(k); cache.set(k, v); return v; }
    const f = `${CDIR}/${sym}_d${dia}.json`;
    const v = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
    cache.set(k, v); if (cache.size > 200) cache.delete(cache.keys().next().value);
    return v;
  };
  const spotDe = (c) => {
    let k = null, dm = Infinity;
    for (const g of Object.values(c)) for (const [cl, ba] of Object.entries(g)) {
      if (cl.slice(-1) !== "C") continue;
      const K = Number(cl.slice(0, -2)); const p = g[`${K}|P`];
      if (!p) continue;
      const d = Math.abs((ba[0] + ba[1]) / 2 - (p[0] + p[1]) / 2);
      if (d < dm) { dm = d; k = K; }
    }
    return k;
  };
  const esquina = (sym, dia, tipo, dias) => {
    const c = cadena(sym, dia); if (!c) return null;
    const sp = spotDe(c); if (!sp) return null;
    const i = dias.indexOf(dia); if (i < 0 || i + SALIR >= dias.length) return null;
    const obj = tipo === "C" ? sp * (1 + OTM / 100) : sp * (1 - OTM / 100);
    let mejor = null, mejorD = Infinity;
    for (const [exp, g] of Object.entries(c)) {
      const dte = Math.round((ms(exp) - ms(dia)) / 86_400_000);
      if (Math.abs(dte - DTE_OBJ) > DTE_TOL) continue;
      for (const [clave, ba] of Object.entries(g)) {
        if (clave.slice(-1) !== tipo) continue;
        if (!(ba[1] >= ASK_MIN)) continue;
        const d = Math.abs(Number(clave.slice(0, -2)) - obj) / sp + Math.abs(dte - DTE_OBJ) / 1000;
        if (d < mejorD) { mejorD = d; mejor = { exp, clave, ask: ba[1] }; }
      }
    }
    if (!mejor) return null;
    // SE COMPRA AL ASK Y SE VENDE AL BID. Si el contrato ya no cotiza, vale cero.
    return ((cadena(sym, dias[i + SALIR])?.[mejor.exp]?.[mejor.clave]?.[0] ?? 0) - mejor.ask) / mejor.ask;
  };

  console.log(`\n## Construyendo el panel · ${TICKERS.length} tickers\n`);
  filas = [];
  for (const sym of TICKERS) {
    const dias = diasPorSim.get(sym); const vistos = new Set();
    for (const d of dias) {
      const mes = d.slice(0, 6); if (vistos.has(mes)) continue; vistos.add(mes);
      const c = cadena(sym, d); if (!c) continue;
      const sp = spotDe(c); if (!sp) continue;
      let lejos = 0; const atm = [];
      for (const [exp, g] of Object.entries(c)) {
        const dte = Math.round((ms(exp) - ms(d)) / 86_400_000);
        if (dte < 5) continue;
        for (const [clave, ba] of Object.entries(g)) {
          const dist = (Number(clave.slice(0, -2)) - sp) / sp;
          const mid = (ba[0] + ba[1]) / 2; if (!(mid > 0)) continue;
          if (Math.abs(dist) > 0.10) lejos += mid;
          // proxy de IV: la prima cercana al dinero, relativa al precio y al plazo
          else if (Math.abs(dist) < 0.03 && dte > 20 && dte < 120) atm.push((mid / sp) / Math.sqrt(dte / 365));
        }
      }
      const call = esquina(sym, d, "C", dias), put = esquina(sym, d, "P", dias);
      if (call == null || put == null || !atm.length) continue;
      filas.push({ sym, mes, primaLejos: lejos / sp, ivProxy: media(atm), call, put, cono: (call + put) / 2 });
    }
    process.stdout.write(`\r   ${sym} · ${filas.length} filas   `);
  }
  writeFileSync(PANEL, JSON.stringify(filas), "utf8");
  console.log(`\n\n${filas.length} filas guardadas en ${PANEL}\n`);
}

// ── la serie mensual: una diferencia por mes, que es la unidad honesta ──────
function serieMensual(campo, vehiculo, sub = filas) {
  const porMes = new Map();
  for (const f of sub) {
    if (f[campo] == null || !isFinite(f[campo])) continue;
    if (!porMes.has(f.mes)) porMes.set(f.mes, []);
    porMes.get(f.mes).push(f);
  }
  const out = [];
  for (const [mes, g] of [...porMes].sort()) {
    if (g.length < 6) continue;
    const o = [...g].sort((a, b) => b[campo] - a[campo]); const k = Math.floor(o.length / 3);
    out.push({ mes, dif: media(o.slice(0, k).map((x) => x[vehiculo])) - media(o.slice(-k).map((x) => x[vehiculo])) });
  }
  return out;
}

console.log("=".repeat(78));
console.log("  1. EL n HONESTO — cada MES cuenta una vez, no cada operación");
console.log("=".repeat(78) + "\n");
console.log("| señal | vehículo | n meses | separación media | t honesto | meses a favor |");
console.log("|---|---|---|---|---|---|");
for (const [campo, nom] of [["primaLejos", "prima lejos"], ["ivProxy", "IV cercana (control)"]]) {
  for (const veh of ["cono", "call", "put"]) {
    const s = serieMensual(campo, veh); const d = s.map((x) => x.dif);
    if (d.length < 20) continue;
    console.log(`| ${nom} | ${veh} | ${d.length} | ${pct(media(d))} | **${tDe(d).toFixed(2)}** | ${Math.round((d.filter((x) => x > 0).length / d.length) * 100)}% |`);
  }
}

console.log("\n" + "=".repeat(78));
console.log("  2. MITADES CRUZADAS — en las dos direcciones");
console.log("=".repeat(78) + "\n");
const meses = [...new Set(filas.map((f) => f.mes))].sort();
const corte = meses[Math.floor(meses.length / 2)];
console.log(`  corte en ${corte}  (primera: ${meses[0]}–${corte} · segunda: ${corte}–${meses[meses.length - 1]})\n`);
console.log("| señal | vehículo | primera mitad | segunda mitad | ¿mismo signo? |");
console.log("|---|---|---|---|---|");
for (const [campo, nom] of [["primaLejos", "prima lejos"], ["ivProxy", "IV cercana (control)"]]) {
  for (const veh of ["cono", "call"]) {
    const a = serieMensual(campo, veh, filas.filter((f) => f.mes < corte)).map((x) => x.dif);
    const b = serieMensual(campo, veh, filas.filter((f) => f.mes >= corte)).map((x) => x.dif);
    if (a.length < 15 || b.length < 15) continue;
    const ok = Math.sign(media(a)) === Math.sign(media(b)) && Math.min(Math.abs(media(a)), Math.abs(media(b))) > 0.01;
    console.log(`| ${nom} | ${veh} | ${pct(media(a))} (t ${tDe(a).toFixed(2)}) | ${pct(media(b))} (t ${tDe(b).toFixed(2)}) | ${ok ? "**sí**" : "NO"} |`);
  }
}

console.log("\n" + "=".repeat(78));
console.log("  3. ¿ES MONÓTONA? — quintiles del cono");
console.log("=".repeat(78) + "\n");
for (const [campo, nom] of [["primaLejos", "prima lejos"], ["ivProxy", "IV cercana (control)"]]) {
  const acum = Array.from({ length: 5 }, () => []);
  const porMes = new Map();
  for (const f of filas) { if (!porMes.has(f.mes)) porMes.set(f.mes, []); porMes.get(f.mes).push(f); }
  for (const g of porMes.values()) {
    if (g.length < 10) continue;
    const o = [...g].sort((a, b) => a[campo] - b[campo]);
    o.forEach((x, i) => acum[Math.min(4, Math.floor((i / o.length) * 5))].push(x.cono));
  }
  console.log(`  ${nom}:  ` + acum.map((q, i) => `Q${i + 1} ${pct(media(q))}`).join("  ·  "));
}
console.log("");
