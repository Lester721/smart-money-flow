// ══════════════════════════════════════════════════════════════════════════════════════════════
// LENTE 1 — AUDITORÍA DE «LA CALMA ANTES DEL MOVIMIENTO» (scripts/y3-la-calma-antes.mjs)
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// QUÉ HACE ESTE FICHERO, EN CRISTIANO
// Reconstruye EXACTAMENTE la señal ganadora del hallazgo — «compra sólo si AYER el subyacente se
// movió más del 2%» — y le pasa por encima las comprobaciones que el script original no hace.
// No cambia el envase (10% fuera / 60 días / salir a los 30 de bolsa, al ASK y al BID).
//
// LO QUE SE COMPRUEBA, UNA POR UNA
//   1. ¿Alguna ventana mira al día de la compra o después? Se recalculan las medidas desplazando
//      la ventana un día MÁS atrás y se compara.
//   2. ¿Un HUECO se está leyendo como un movimiento del 2%? En el original, si falta el retorno de
//      ayer el bucle rompe y la cuenta queda en 0 — o sea, «hueco» = «se movió». Se separan.
//   3. ¿«Ayer» es de verdad ayer? Los días vienen del listado de ficheros de cadena. Si falta un
//      día de descarga, «ayer» puede ser de hace una semana y el 2% es de varios días juntos.
//   4. ¿La señal es un movimiento REAL o ruido del precio deducido? El precio sale de la paridad
//      put-call, no de la cinta. Se recalcula la señal con los CIERRES REALES de disco (2021-2026).
//   5. ¿Cuántos DÍAS DE CALENDARIO distintos hay detrás de las 1,357 operaciones? Las entradas son
//      a principio de mes y un día de caída general dispara los 28 tickers a la vez.
//   6. Barajado que CONSERVA LA FECHA (se cambia de ticker dentro del mismo día).
//   7. ¿Cuesta más la opción cuando la señal dispara?
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/z-lente1-calma-antes.mjs
// ══════════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, existsSync, readdirSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const CIERRES = "scripts/cache-theta/cierres";
const CACHE_SPOT = "scripts/cache-theta/_y3-spots.json";

const APUESTA = 1000, ASKMIN = 0.10, TOLK = 0.50, SALIDA = 30;
const MIN_DIAS_TICKER = 400, CALENT = 120;
const ENVASES = [
  { id: "A", dist: 0.10, dte: 60, et: "10% fuera · 60 dias" },
  { id: "B", dist: 0.05, dte: 90, et: " 5% fuera · 90 dias" },
];

const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const dteDe = (a, b) => Math.round((ms(b) - ms(a)) / 86_400_000);
const tolDte = (d) => Math.max(6, Math.round(d * 0.28));
const num = (n, d = 0) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (x) => (100 * x).toFixed(1) + "%";
const dol = (n) => "$" + num(Math.round(n));

// ── indice de dias ────────────────────────────────────────────────────────────────────────────
const diasPorSim = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/);
  if (!m) continue;
  if (!diasPorSim.has(m[1])) diasPorSim.set(m[1], []);
  diasPorSim.get(m[1]).push(m[2]);
}
for (const v of diasPorSim.values()) v.sort();
const TICKERS = [...diasPorSim.keys()].sort().filter((t) => diasPorSim.get(t).length >= MIN_DIAS_TICKER);

const SPOT = JSON.parse(readFileSync(CACHE_SPOT, "utf8"));
console.log(`\n${"═".repeat(100)}`);
console.log("  LENTE 1 — auditoria de «la calma antes del movimiento»");
console.log(`${"═".repeat(100)}`);
console.log(`  ${TICKERS.length} tickers · precios leidos del cache del propio script (${CACHE_SPOT})`);

const REAL = {};
for (const sym of TICKERS) {
  const p = `${CIERRES}/${sym}.json`;
  REAL[sym] = existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LAS MEDIDAS — copia literal del original, mas las banderas que el original no guarda
// desfase = 0 -> ventana original (termina en i-1).  desfase = 1 -> un dia MAS atras.
// ══════════════════════════════════════════════════════════════════════════════════════════════
function medidas(sym, desfase) {
  const s = SPOT[sym], n = s.length;
  const dias = diasPorSim.get(sym);
  const r = new Array(n).fill(null);
  for (let i = 1; i < n; i++) {
    if (!(s[i] > 0) || !(s[i - 1] > 0)) continue;
    let x = s[i] / s[i - 1] - 1;
    if (Math.abs(x) > 0.35) x = 0;
    r[i] = x;
  }
  const cum = new Array(n).fill(null); cum[0] = 1;
  for (let i = 1; i < n; i++) cum[i] = r[i] == null ? cum[i - 1] : cum[i - 1] * (1 + r[i]);

  const out = new Array(n).fill(null);
  for (let i = CALENT + 1 + desfase; i < n; i++) {
    const e = i - desfase;
    const w20 = cum.slice(e - 20, e), w120 = cum.slice(e - 120, e);
    const r20 = r.slice(e - 20, e).filter((x) => x != null);
    const r120 = r.slice(e - 120, e).filter((x) => x != null);
    if (w20.some((x) => !(x > 0)) || w120.some((x) => !(x > 0))) continue;
    if (r20.length < 18 || r120.length < 110) continue;
    let d2 = 0, porHueco = false;
    for (let j = e - 1; j >= 1 && d2 < 250; j--) {
      if (r[j] == null) { if (d2 === 0) porHueco = true; break; }
      if (Math.abs(r[j]) > 0.02) break;
      d2++;
    }
    out[i] = {
      diasSin2: d2,
      porHueco,
      rAyer: r[e - 1],
      diaAyer: dias[e - 1],
      diaAnteayer: dias[e - 2],
    };
  }
  return out;
}

const MED0 = {}, MED1 = {};
for (const sym of TICKERS) { MED0[sym] = medidas(sym, 0); MED1[sym] = medidas(sym, 1); }

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LAS OPERACIONES — copia literal del original
// ══════════════════════════════════════════════════════════════════════════════════════════════
const cacheCad = new Map(); const MAXC = 200;
function cadena(sym, dia) {
  const k = `${sym}|${dia}`;
  if (cacheCad.has(k)) { const v = cacheCad.get(k); cacheCad.delete(k); cacheCad.set(k, v); return v; }
  const f = `${CDIR}/${sym}_d${dia}.json`;
  let v = null;
  if (existsSync(f)) { try { v = JSON.parse(readFileSync(f, "utf8")); } catch { v = null; } }
  if (cacheCad.size >= MAXC) cacheCad.delete(cacheCad.keys().next().value);
  cacheCad.set(k, v); return v;
}

const filas = [];
for (const sym of TICKERS) {
  const dias = diasPorSim.get(sym);
  const vistos = new Set();
  for (let i = 0; i < dias.length; i++) {
    const dia = dias[i], mes = dia.slice(0, 6);
    if (vistos.has(mes)) continue;
    vistos.add(mes);
    const S = SPOT[sym][i];
    if (!(S > 0)) continue;
    const m = MED0[sym][i]; if (!m) continue;
    const m1 = MED1[sym][i];
    const c = cadena(sym, dia); if (!c) continue;
    for (const env of ENVASES) {
      let exp = null, md = Infinity;
      for (const e of Object.keys(c)) { const dt = dteDe(dia, e); if (dt < 1) continue; const x = Math.abs(dt - env.dte); if (x < md) { md = x; exp = e; } }
      if (!exp || md > tolDte(env.dte)) continue;
      const g = c[exp];
      for (const tipo of ["C", "P"]) {
        const objetivo = tipo === "C" ? S * (1 + env.dist) : S * (1 - env.dist);
        let mejor = null, dd = Infinity;
        for (const [clave, ba] of Object.entries(g)) {
          if (clave.slice(-1) !== tipo) continue;
          if (!(ba[1] >= ASKMIN)) continue;
          const K = Number(clave.slice(0, -2));
          const d = Math.abs(K - objetivo);
          if (d < dd) { dd = d; mejor = { K, clave, bid: ba[0], ask: ba[1] }; }
        }
        if (!mejor) continue;
        const distReal = tipo === "C" ? mejor.K / S - 1 : 1 - mejor.K / S;
        if (Math.abs(distReal - env.dist) > env.dist * TOLK) continue;
        let ds = dias[i + SALIDA] ?? null; if (!ds) continue;
        if (ds >= exp) ds = exp;
        const cs = cadena(sym, ds); if (!cs) continue;
        const grupo = cs[exp]; if (!grupo) continue;
        const salida = grupo[mejor.clave]?.[0] ?? 0;
        filas.push({
          env: env.id, sym, dia, ano: dia.slice(0, 4), tipo, i,
          ret: (salida - mejor.ask) / mejor.ask,
          costeRel: mejor.ask / S, horq: (mejor.ask - mejor.bid) / mejor.ask,
          m, m1,
        });
      }
    }
  }
  cacheCad.clear();
}
console.log(`  ${num(filas.length)} operaciones reconstruidas (el original da 6,504 en A y 6,214 en B)`);

const acc = () => ({ n: 0, win: 0, gan: 0, per: 0 });
function suma(a, d) { a.n++; if (d > 0) { a.win++; a.gan += d; } else a.per += -d; }
const ratio = (a) => (a.per > 0 ? a.gan / a.per : NaN);
const acierto = (a) => (a.n ? a.win / a.n : NaN);
function mide(pred, envId) { const a = acc(); for (const f of filas) if (f.env === envId && pred(f)) suma(a, APUESTA * f.ret); return a; }
const linea = (et, a) => `  ${et.padEnd(52)} n=${String(num(a.n)).padStart(6)} · ratio ${ratio(a).toFixed(2)} · acierta ${pct(acierto(a))}`;

const SENAL = (f) => f.m.diasSin2 < 1;

console.log(`\n${"═".repeat(100)}`);
console.log("  0) EL PUNTO DE PARTIDA — la senal tal cual, reconstruida");
console.log(`${"═".repeat(100)}`);
for (const env of ENVASES) {
  console.log(`  ENVASE ${env.id}`);
  console.log(linea("sin senal (liston)", mide(() => true, env.id)));
  console.log(linea("con senal «ayer se movio mas del 2%»", mide(SENAL, env.id)));
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1) ¿MIRA LA VENTANA AL FUTURO?
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(100)}`);
console.log("  1) ¿LA VENTANA MIRA AL DIA DE LA COMPRA? — la misma senal, pero mirando ANTEAYER");
console.log(`${"═".repeat(100)}`);
for (const env of ENVASES) {
  console.log(`  ENVASE ${env.id}`);
  console.log(linea("ayer se movio >2%  (la del hallazgo)", mide(SENAL, env.id)));
  console.log(linea("anteayer se movio >2% (un dia mas atras)", mide((f) => f.m1 && f.m1.diasSin2 < 1, env.id)));
}
{
  let usanDiaCompra = 0, total = 0;
  for (const f of filas) {
    if (f.env !== "A") continue;
    total++;
    if (f.m.diaAyer && f.m.diaAyer >= f.dia) usanDiaCompra++;
  }
  console.log(`\n  Comprobacion directa: operaciones cuyo «ayer» cae en el dia de la compra o despues: ${usanDiaCompra} de ${num(total)}`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2) ¿UN HUECO SE LEE COMO UN MOVIMIENTO DEL 2%?
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(100)}`);
console.log("  2) EL HUECO LEIDO COMO MOVIMIENTO — si falta el retorno de ayer, el contador se queda");
console.log("     en 0 y la senal DISPARA igual");
console.log(`${"═".repeat(100)}`);
for (const env of ENVASES) {
  const conH = mide((f) => SENAL(f) && f.m.porHueco, env.id);
  const sinH = mide((f) => SENAL(f) && !f.m.porHueco, env.id);
  console.log(`  ENVASE ${env.id}`);
  console.log(linea("disparos por HUECO (falta el precio de ayer)", conH));
  console.log(linea("disparos por MOVIMIENTO real (>2%)", sinH));
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 3) ¿«AYER» ES DE VERDAD AYER?
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(100)}`);
console.log("  3) ¿«AYER» ES AYER? — distancia de calendario entre el dia de la compra y su «ayer»");
console.log(`${"═".repeat(100)}`);
{
  const cubos = new Map();
  for (const f of filas) {
    if (f.env !== "A" || !f.m.diaAyer) continue;
    const g = dteDe(f.m.diaAyer, f.dia);
    const k = g <= 1 ? "1 dia" : g <= 3 ? "2-3 dias (fin de semana)" : g <= 5 ? "4-5 dias (festivo)" : g <= 10 ? "6-10 dias" : "mas de 10 dias";
    if (!cubos.has(k)) cubos.set(k, { t: 0, s: 0 });
    cubos.get(k).t++; if (SENAL(f)) cubos.get(k).s++;
  }
  for (const [k, v] of cubos) console.log(`  ${k.padEnd(28)} ${String(num(v.t)).padStart(6)} operaciones · disparan la senal ${num(v.s)} (${pct(v.s / v.t)})`);
  console.log(linea("A · senal con «ayer» a mas de 5 dias (salto real)", mide((f) => SENAL(f) && f.m.diaAyer && dteDe(f.m.diaAyer, f.dia) > 5, "A")));
  console.log(linea("A · senal con «ayer» pegado (<=5 dias)", mide((f) => SENAL(f) && f.m.diaAyer && dteDe(f.m.diaAyer, f.dia) <= 5, "A")));
  let multi = 0, tot = 0;
  for (const f of filas) { if (f.env !== "A" || !SENAL(f) || !f.m.diaAnteayer) continue; tot++; if (dteDe(f.m.diaAnteayer, f.m.diaAyer) > 5) multi++; }
  console.log(`  El propio «movimiento de un dia» abarca mas de 5 dias de calendario en ${multi} de ${num(tot)} disparos`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 4) ¿EL 2% ES REAL? — la misma senal con los CIERRES REALES (2021-2026)
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(100)}`);
console.log("  4) EL 2%, CONTRASTADO CON LOS CIERRES REALES (solo 2021-2026: antes no hay cierres)");
console.log(`${"═".repeat(100)}`);
{
  let coinciden = 0, soloDeducido = 0, soloReal = 0, ninguna = 0, sinDato = 0;
  const cSi = acc(), cNo = acc(), rSi = acc(), rNo = acc();
  for (const f of filas) {
    if (f.env !== "A") continue;
    if (f.ano < "2021") continue;
    const cl = REAL[f.sym];
    const a = cl?.[f.m.diaAyer], b = cl?.[f.m.diaAnteayer];
    if (!(a > 0) || !(b > 0)) { sinDato++; continue; }
    const sReal = Math.abs(a / b - 1) > 0.02;
    const sDed = SENAL(f);
    if (sDed && sReal) coinciden++; else if (sDed) soloDeducido++; else if (sReal) soloReal++; else ninguna++;
    suma(sDed ? cSi : cNo, APUESTA * f.ret);
    suma(sReal ? rSi : rNo, APUESTA * f.ret);
  }
  console.log(`  operaciones de 2021 en adelante con cierre real de ayer y anteayer: ${num(coinciden + soloDeducido + soloReal + ninguna)} (sin dato: ${sinDato})`);
  console.log(`  deducida y real dicen LO MISMO en ${num(coinciden + ninguna)} · solo la deducida dispara en ${soloDeducido} · solo la real en ${soloReal}`);
  console.log(linea("A 2021+ · senal del precio DEDUCIDO (paridad)", cSi));
  console.log(linea("A 2021+ · senal de los CIERRES REALES", rSi));
  console.log(linea("A 2021+ · sin senal (los otros dias, deducido)", cNo));
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 5) ¿CUANTOS DIAS DE CALENDARIO DISTINTOS HAY DETRAS?
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(100)}`);
console.log("  5) LA FRECUENCIA DE VERDAD — cuantos DIAS distintos, y cuanto pesa el mas cargado");
console.log(`${"═".repeat(100)}`);
{
  const porDia = new Map();
  for (const f of filas) {
    if (f.env !== "A" || !SENAL(f)) continue;
    if (!porDia.has(f.dia)) porDia.set(f.dia, acc());
    suma(porDia.get(f.dia), APUESTA * f.ret);
  }
  const tot = mide(SENAL, "A");
  const lista = [...porDia.entries()].map(([d, a]) => ({ d, a })).sort((x, y) => y.a.gan - x.a.gan);
  console.log(`  ${num(tot.n)} operaciones repartidas en solo ${porDia.size} DIAS de calendario distintos`);
  console.log(`  -> ${num(porDia.size / 11, 1)} dias de compra al ano; en cada uno se abren de media ${(tot.n / porDia.size).toFixed(1)} contratos a la vez`);
  let ac = 0, cuantos = 0;
  for (const x of lista) { if (x.a.gan <= 0) break; ac += x.a.gan; cuantos++; if (ac >= tot.gan / 2) break; }
  console.log(`  DIAS necesarios para juntar la mitad de todo lo ganado: ${cuantos} de ${porDia.size}`);
  console.log(`  los 5 dias que mas aportan: ${lista.slice(0, 5).map((x) => `${x.d} ${dol(x.a.gan)} (${x.a.n} ops)`).join(" · ")}`);
  const g5 = tot.gan - lista.slice(0, 5).reduce((s, x) => s + x.a.gan, 0);
  const p5 = tot.per - lista.slice(0, 5).reduce((s, x) => s + x.a.per, 0);
  console.log(`  ratio quitando esos 5 dias: ${(g5 / p5).toFixed(2)}`);
  const porDiaB = new Map();
  for (const f of filas) { if (f.env !== "A") continue; if (!porDiaB.has(f.dia)) porDiaB.set(f.dia, acc()); suma(porDiaB.get(f.dia), APUESTA * f.ret); }
  const totB = mide(() => true, "A");
  const listaB = [...porDiaB.entries()].map(([d, a]) => ({ d, a })).sort((x, y) => y.a.gan - x.a.gan);
  let acB = 0, cB = 0;
  for (const x of listaB) { if (x.a.gan <= 0) break; acB += x.a.gan; cB++; if (acB >= totB.gan / 2) break; }
  console.log(`  (sin senal: ${num(totB.n)} operaciones en ${porDiaB.size} dias · ${cB} dias para la mitad de lo ganado)`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 6) BARAJADO QUE CONSERVA LA FECHA
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(100)}`);
console.log("  6) EL BARAJADO POR TICKER — misma fecha, la senal de OTRO ticker (desplazamiento fijo)");
console.log(`${"═".repeat(100)}`);
{
  const porDia = new Map();
  for (const f of filas) { if (!porDia.has(f.dia)) porDia.set(f.dia, []); porDia.get(f.dia).push(f); }
  for (const [, v] of porDia) {
    const syms = [...new Set(v.map((f) => f.sym))].sort();
    const senalDe = new Map(); for (const f of v) senalDe.set(f.sym, SENAL(f));
    const idx = new Map(syms.map((s, i) => [s, i]));
    for (const f of v) f.senalOtro = senalDe.get(syms[(idx.get(f.sym) + 3) % syms.length]);
  }
  for (const env of ENVASES) {
    console.log(`  ENVASE ${env.id}`);
    console.log(linea("senal de verdad", mide(SENAL, env.id)));
    console.log(linea("senal de OTRO ticker del mismo dia", mide((f) => f.senalOtro, env.id)));
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 7) ¿SALE MAS CARA LA OPCION CUANDO LA SENAL DISPARA?
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(100)}`);
console.log("  7) EL PRECIO DE ENTRADA");
console.log(`${"═".repeat(100)}`);
for (const env of ENVASES) {
  for (const [et, pred] of [["con senal", SENAL], ["sin senal", (f) => !SENAL(f)]]) {
    const v = filas.filter((f) => f.env === env.id && pred(f));
    const c = v.reduce((a, f) => a + f.costeRel, 0) / v.length;
    const h = v.reduce((a, f) => a + f.horq, 0) / v.length;
    console.log(`  ${env.id} · ${et.padEnd(10)} coste medio ${pct(c)} del subyacente · horquilla ${pct(h)} de la prima · n=${num(v.length)}`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 8) EL EXAMEN CON LA SENAL LIMPIA (sin los disparos por hueco)
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(100)}`);
console.log("  8) EL EXAMEN, CON LA SENAL LIMPIA (quitando los disparos que vienen de un hueco)");
console.log(`${"═".repeat(100)}`);
const LIMPIA = (f) => f.m.diasSin2 < 1 && !f.m.porHueco;
const ANOS = [...new Set(filas.map((f) => f.ano))].sort();
for (const env of ENVASES) {
  const t = mide(LIMPIA, env.id);
  console.log(`\n  ENVASE ${env.id}: ${linea("", t).trim()}`);
  console.log(`  | ano | ${ANOS.join(" | ")} |`);
  console.log(`  | n | ${ANOS.map((a) => mide((f) => LIMPIA(f) && f.ano === a, env.id).n).join(" | ")} |`);
  console.log(`  | ratio | ${ANOS.map((a) => { const y = mide((f) => LIMPIA(f) && f.ano === a, env.id); return y.n >= 10 ? ratio(y).toFixed(2) : "n/d"; }).join(" | ")} |`);
  const s20 = mide((f) => LIMPIA(f) && !(f.dia >= "20200201" && f.dia <= "20200531"), env.id);
  console.log(`  sin febrero-mayo de 2020: ratio ${ratio(s20).toFixed(2)} (n=${num(s20.n)})`);
}
console.log(`\n${"═".repeat(100)}\n`);
