// ═══════════════════════════════════════════════════════════════════════════════════════════
// EL GEX QUE CAMBIA DURANTE LA SESIÓN
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// LA PREGUNTA, EN CASTELLANO LLANO
//
// Todo lo que hemos medido del GEX usa el interés abierto del ARRANQUE del día: la foto de la
// noche anterior, que es la misma a las 09:35 que a las 15:00. Pero durante la sesión se
// negocian cientos de miles de contratos que mueven esa foto. Si lo que mira Eduardo es la foto
// ACTUALIZADA, y no la congelada, estaríamos midiendo el mapa equivocado.
//
// Aquí se contestan dos cosas:
//   (1) ¿CUÁNTO se mueve la silueta durante el día? Si apenas se mueve, actualizarla no puede
//       aportar nada y la pregunta queda cerrada sin más.
//   (2) ¿La silueta actualizada SORTEA los días mejor que la congelada? Se repite la escalera
//       de cinco montones del imán y del punto de giro con las dos versiones y se comparan.
//
// LA SUPOSICIÓN, DICHA EN VOZ ALTA
//
// El volumen NO dice si se abrió o se cerró posición, ni de qué lado. Sumarlo al OI como si
// todo fuera apertura es una suposición, y es falsa en parte. Por eso se miden LAS DOS
// lecturas extremas —sumar todo el volumen y restarlo todo— y el resultado real vive entre
// ellas. Si las dos dicen lo mismo, la suposición no cambia la respuesta.
//
// LA CUENTA DEL TIEMPO — dónde estaría un look-ahead
//
// Las barras de volumen se etiquetan por su INICIO: la barra «10:55» es lo negociado entre las
// 10:55 y las 11:00. Para decidir a las 11:00 se acumulan las barras con etiqueta ESTRICTAMENTE
// anterior a las 11:00, que es exactamente lo operado hasta ese instante. Ni un contrato
// posterior. (Este proyecto ya se comió un look-ahead por cruzar series con etiquetas de tiempo
// distintas, y la versión anterior de este mismo dato —el volumen del día entero— hacía que el
// «imán» predijese 2,35 puntos con t=49 porque llevaba dentro dónde acabó el precio.)
//
// AVISO DE COBERTURA: el volumen intradía sólo está descargado para una parte de la muestra.
// El script cuenta los ficheros que existen y lo dice; la descarga sigue en marcha.
//
// Uso:  node --import tsx scripts/p6-el-gex-que-cambia-en-el-dia.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  cargarDia, cargarDia21, perfilGex, distanciaSilueta, operar,
  idxHora, hayHora, rejilla, compraEn, resumen, CACHE,
} from "./lib0dte.mjs";

const DIRV = join(CACHE, "vol-intradia");
const DIAS_ANO = 244;
const f = (x, n = 3) => (x == null || Number.isNaN(x) ? "  —  " : x.toFixed(n));
const eur = (x) => (x == null || Number.isNaN(x) ? "—" : "$" + Math.round(x).toLocaleString("es-ES"));

// ── utilidades de acumulación ──────────────────────────────────────────────────────────────

/** Volumen acumulado del día hasta `hasta` (exclusivo). Sólo mira hacia atrás. */
function volHasta(vol, hasta) {
  const acc = {};
  for (const h of Object.keys(vol)) {
    if (h >= hasta) continue;                       // ESTRICTAMENTE anterior
    for (const [k, v] of Object.entries(vol[h])) acc[k] = (acc[k] ?? 0) + v;
  }
  return acc;
}

/** OI del arranque ± volumen acumulado. signo=+1 «todo fue apertura», −1 «todo fue cierre». */
function mezclar(oi, acc, signo) {
  const out = { ...oi };
  for (const [k, v] of Object.entries(acc)) out[k] = Math.max(0, (out[k] ?? 0) + signo * v);
  return out;
}

/** Escalera de N montones: ordena por x, parte en N y da la media de y en cada montón. */
function escalera(pares, nb = 5) {
  const v = pares.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)).sort((a, b) => a.x - b.x);
  const n = v.length;
  if (n < nb * 5) return null;
  const monts = [];
  for (let i = 0; i < nb; i++) {
    const a = Math.floor((i * n) / nb), b = Math.floor(((i + 1) * n) / nb);
    const tr = v.slice(a, b);
    const m = tr.reduce((s, p) => s + p.y, 0) / tr.length;
    monts.push({ n: tr.length, media: m, xMedio: tr.reduce((s, p) => s + p.x, 0) / tr.length });
  }
  const mx = v.reduce((s, p) => s + p.x, 0) / n, my = v.reduce((s, p) => s + p.y, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const p of v) { sxy += (p.x - mx) * (p.y - my); sxx += (p.x - mx) ** 2; syy += (p.y - my) ** 2; }
  const r = sxy / Math.sqrt(sxx * syy || Infinity);
  const t = (r * Math.sqrt(n - 2)) / Math.sqrt(1 - r * r || 1e-12);
  let sube = 0;
  for (let i = 1; i < nb; i++) if (monts[i].media > monts[i - 1].media) sube++;
  return { n, monts, r, t, sube, spread: monts[nb - 1].media - monts[0].media };
}

const pintaEsc = (etiq, e) => {
  if (!e) { console.log(`  ${etiq.padEnd(34)} muestra insuficiente`); return; }
  console.log(`  ${etiq.padEnd(34)} ${e.monts.map((m) => f(m.media, 3).padStart(7)).join(" ")}` +
    ` | salto ${f(e.spread, 3).padStart(7)}  r ${f(e.r, 3).padStart(6)}  t ${f(e.t, 2).padStart(6)}  sube ${e.sube}/4`);
};

// ═══ 0 · CARGA Y SANIDAD ═══════════════════════════════════════════════════════════════════

console.log("\n══════════════════════════════════════════════════════════════════════════════════");
console.log("  EL GEX QUE CAMBIA DURANTE LA SESIÓN");
console.log("══════════════════════════════════════════════════════════════════════════════════\n");

const fichVol = existsSync(DIRV) ? readdirSync(DIRV).filter((x) => x.endsWith(".json")).sort() : [];
console.log(`### 0 · SANIDAD\n`);
console.log(`  ficheros de volumen intradía: ${fichVol.length}` +
  (fichVol.length ? `  (de ${fichVol[0].slice(0, 10)} a ${fichVol[fichVol.length - 1].slice(0, 10)})` : ""));

const HORAS_ESC = ["11:00", "13:00"];
const HORAS_MOV = ["11:00", "13:00", "15:00"];

const D = [];
let sinCadena = 0, sinOI = 0, sinBarras = 0, volCero = 0;
const mediasSesiones = [];

for (const fv of fichVol) {
  const dia = fv.slice(0, 10);
  const d = cargarDia(dia);
  if (!d) { sinCadena++; continue; }
  if (!d.oi) { sinOI++; continue; }
  if (HORAS_ESC.concat(HORAS_MOV).some((h) => hayHora(d, h) < 0)) { sinBarras++; continue; }
  const vol = JSON.parse(readFileSync(join(DIRV, fv), "utf8"));
  const horas = Object.keys(vol).sort();
  let tot = 0;
  for (const h of horas) for (const v of Object.values(vol[h])) tot += v;
  if (!(tot > 0)) { volCero++; continue; }
  // MEDIA SESIÓN: el mercado cierra a las 13:00 y la cadena SIGUE dando 78 barras, rellenas con
  // la última cotización. El spot se queda clavado y el «movimiento hasta el cierre» sería falso.
  // Se detecta solo (pocas barras de volumen, o las 6 últimas barras con el spot idéntico) y fuera.
  const ult = d.barras.slice(-6).map((b) => b.spot.toFixed(2));
  if (horas.length < 70 || new Set(ult).size === 1) { mediasSesiones.push(dia); continue; }
  D.push({ d, vol, horas, volDia: tot, oiTot: Object.values(d.oi).reduce((a, b) => a + b, 0) });
}

console.log(`  días utilizables: ${D.length}   (sin cadena ${sinCadena} · sin OI ${sinOI} · ` +
  `sin alguna barra ${sinBarras} · volumen cero ${volCero} · media sesión ${mediasSesiones.length} ${JSON.stringify(mediasSesiones)})`);
if (!D.length) { console.log("\n  NO HAY DATOS. Fin."); process.exit(0); }
console.log(`  rango: ${D[0].d.dia} -> ${D[D.length - 1].d.dia}   =  ${(D.length / DIAS_ANO).toFixed(2)} años de mercado`);
{
  const bs = new Set(D.map((x) => x.d.barras.length));
  const hs = new Set(D.map((x) => x.horas.length));
  console.log(`  barras de cadena por día: ${[...bs].sort().join("/")}   ·   barras de volumen por día: ${[...hs].sort((a, b) => a - b).join("/")}`);
  console.log(`  primera/última barra de volumen: ${D[0].horas[0]} … ${D[0].horas[D[0].horas.length - 1]}   (etiquetadas por el INICIO del tramo)`);
  const rat = D.map((x) => x.volDia / x.oiTot).sort((a, b) => a - b);
  console.log(`  volumen del día / OI del arranque:  mediana ${f(rat[Math.floor(rat.length / 2)], 2)}` +
    `  ·  mínimo ${f(rat[0], 2)}  ·  máximo ${f(rat[rat.length - 1], 2)}`);
  const r11 = D.map((x) => {
    const a = volHasta(x.vol, "11:00");
    return Object.values(a).reduce((s, v) => s + v, 0) / x.oiTot;
  }).sort((a, b) => a - b);
  console.log(`  volumen hasta las 11:00 / OI del arranque: mediana ${f(r11[Math.floor(r11.length / 2)], 2)}`);
}

// ═══ 1 · ¿CUÁNTO SE MUEVE LA SILUETA? ══════════════════════════════════════════════════════

console.log(`\n### 1 · ¿CUÁNTO SE MUEVE LA SILUETA DURANTE EL DÍA?\n`);

const congeladas = [];
const mov = {};
for (const h of HORAS_MOV) mov[h] = { A: [], B: [], C: [], Amenos: [] };

for (const x of D) {
  const s0 = x.d.barras[0].spot;
  const cong0 = perfilGex(x.d.oi, s0);
  if (!cong0) continue;
  congeladas.push(cong0);
  for (const h of HORAS_MOV) {
    const sT = x.d.barras[idxHora(x.d, h)].spot;
    const acc = volHasta(x.vol, h);
    const mas = mezclar(x.d.oi, acc, +1);
    const menos = mezclar(x.d.oi, acc, -1);
    const pA = perfilGex(mas, s0), pAm = perfilGex(menos, s0);
    const congT = perfilGex(x.d.oi, sT), pB = perfilGex(mas, sT);
    if (pA) mov[h].A.push(distanciaSilueta(cong0, pA));
    if (pAm) mov[h].Amenos.push(distanciaSilueta(cong0, pAm));
    if (congT && pB) mov[h].B.push(distanciaSilueta(congT, pB));
    if (pB) mov[h].C.push(distanciaSilueta(cong0, pB));
  }
}

// LISTÓN: distancia entre días DISTINTOS (rotaciones fijas, sin Math.random)
const liston = [];
for (let i = 0; i < congeladas.length; i++) {
  liston.push(distanciaSilueta(congeladas[i], congeladas[(i + 37) % congeladas.length]));
  liston.push(distanciaSilueta(congeladas[i], congeladas[(i + 151) % congeladas.length]));
}
liston.sort((a, b) => a - b);
const medListon = liston[Math.floor(liston.length / 2)];

const med = (v) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
console.log(`  LISTÓN · distancia mediana entre dos días DISTINTOS (n=${liston.length}): ${f(medListon, 4)}`);
console.log(`           percentil 10 ${f(liston[Math.floor(liston.length * 0.1)], 4)} · percentil 90 ${f(liston[Math.floor(liston.length * 0.9)], 4)}\n`);
console.log(`  hora    A) sólo el OI          B) en pantalla   C) total desde 09:35     A con volumen RESTADO`);
for (const h of HORAS_MOV) {
  const m = mov[h];
  console.log(`  ${h}   ${f(med(m.A), 4).padStart(7)} (${f((med(m.A) / medListon) * 100, 0)}% del listón)` +
    `  ${f(med(m.B), 4).padStart(9)}        ${f(med(m.C), 4).padStart(7)} (${f((med(m.C) / medListon) * 100, 0)}%)` +
    `        ${f(med(m.Amenos), 4).padStart(7)}`);
}

// ═══ 2 · LA ESCALERA DE CINCO MONTONES ═════════════════════════════════════════════════════

console.log(`\n### 2 · LA ESCALERA DE CINCO MONTONES  ·  media del movimiento posterior del índice, en %\n`);

const porDia = new Map(D.map((x) => [x.d.dia, x.d]));
const filas = [];
for (const x of D) {
  for (const h of HORAS_ESC) {
    const i = idxHora(x.d, h);
    const sT = x.d.barras[i].spot;
    const acc = volHasta(x.vol, h);
    const vers = {
      congelada: x.d.oi,
      masVol: mezclar(x.d.oi, acc, +1),
      menosVol: mezclar(x.d.oi, acc, -1),
      // CONTROL POSITIVO — PROHIBIDO COMO SEÑAL: usa el volumen del DÍA ENTERO, o sea el
      // posterior a la decisión. Está aquí sólo para comprobar que esta escalera SÍ vería un
      // efecto si lo hubiera. Si ni con el futuro dentro se mueve, el fallo sería del medidor.
      futuroPROHIBIDO: mezclar(x.d.oi, volHasta(x.vol, "99:99"), +1),
    };
    const p = {};
    for (const [k, oi] of Object.entries(vers)) p[k] = perfilGex(oi, sT);
    const iCierre = x.d.barras.length - 1;
    const i1h = Math.min(i + 12, iCierre);
    const b0 = x.d.barras[0], K0 = rejilla(b0.spot);
    const c0 = compraEn(b0, K0, "C"), p0 = compraEn(b0, K0, "P");
    filas.push({
      dia: x.d.dia, hora: h, i, sT,
      retCierre: ((x.d.barras[iCierre].spot - sT) / sT) * 100,
      ret1h: ((x.d.barras[i1h].spot - sT) / sT) * 100,
      p, tam: p.congelada?.totalContratos ?? NaN,
      cuna: c0 != null && p0 != null ? ((c0 + p0) / b0.spot) * 100 : NaN,
    });
  }
}

for (const h of HORAS_ESC) {
  const F = filas.filter((r) => r.hora === h);
  for (const [nomY, campoY] of [["-> cierre", "retCierre"], ["-> 1 hora", "ret1h"]]) {
    console.log(`\n  DECISIÓN ${h}  ·  resultado ${nomY}   (montón 1 = imán/giro más ABAJO … montón 5 = más ARRIBA)`);
    for (const campo of ["imanPct", "giroPct"]) {
      for (const v of ["congelada", "masVol", "menosVol"]) {
        const pares = F.map((r) => ({ x: r.p[v]?.[campo], y: r[campoY] }));
        pintaEsc(`${campo === "imanPct" ? "imán" : "giro"} · ${v}`, escalera(pares));
      }
    }
    const rot = 137 % F.length;
    pintaEsc("CONTROL azar (imán rotado)", escalera(F.map((r, k) => ({ x: F[(k + rot) % F.length].p.masVol?.imanPct, y: r[campoY] }))));
    pintaEsc("CONTROL tamaño de la cadena", escalera(F.map((r) => ({ x: r.tam, y: r[campoY] }))));
    pintaEsc("CONTROL volatilidad (cuna ATM)", escalera(F.map((r) => ({ x: r.cuna, y: r[campoY] }))));
    pintaEsc("+CONTROL POSITIVO imán c/futuro", escalera(F.map((r) => ({ x: r.p.futuroPROHIBIDO?.imanPct, y: r[campoY] }))));
  }
}

// ═══ 3 · CONGELADA CONTRA ACTUALIZADA ══════════════════════════════════════════════════════

console.log(`\n### 3 · CONGELADA CONTRA ACTUALIZADA — el salto entre el montón 5 y el 1 (resultado -> cierre)\n`);
console.log(`  hora   variable   versión        n    salto(%)     t      sube`);
for (const h of HORAS_ESC) {
  const F = filas.filter((r) => r.hora === h);
  for (const campo of ["imanPct", "giroPct"]) {
    for (const v of ["congelada", "masVol", "menosVol"]) {
      const e = escalera(F.map((r) => ({ x: r.p[v]?.[campo], y: r.retCierre })));
      if (!e) continue;
      console.log(`  ${h}  ${(campo === "imanPct" ? "imán" : "giro").padEnd(8)} ${v.padEnd(10)} ${String(e.n).padStart(5)}` +
        `  ${f(e.spread, 3).padStart(8)}  ${f(e.t, 2).padStart(6)}   ${e.sube}/4`);
    }
  }
}

// ═══ 4 · EN DINERO, CON PRECIOS REALES ═════════════════════════════════════════════════════

console.log(`\n### 4 · EN DINERO, CON PRECIOS REALES  ·  1 contrato, comprar al ask y vender al bid`);
console.log(`  Regla: montón 5 -> compro CALL al dinero; montón 1 -> compro PUT al dinero; cierro 1 hora después.\n`);
console.log(`  hora   variable   versión      ops  huecos    media$   mediana$      peor$      $/año   sin los 5 mejores   media%%      t  aciertos`);

const anos = D.length / DIAS_ANO;
const porAno = {};
for (const h of HORAS_ESC) {
  const F = filas.filter((r) => r.hora === h);
  for (const campo of ["imanPct", "giroPct"]) {
    for (const v of ["congelada", "masVol", "menosVol"]) {
      const con = F.map((r) => ({ r, x: r.p[v]?.[campo] })).filter((o) => Number.isFinite(o.x));
      if (con.length < 50) continue;
      const orden = [...con].sort((a, b) => a.x - b.x);
      const n = orden.length, q = Math.floor(n / 5);
      const bajos = new Set(orden.slice(0, q).map((o) => o.r.dia + o.r.hora));
      const altos = new Set(orden.slice(n - q).map((o) => o.r.dia + o.r.hora));
      const res = [], rets = [], porYear = {};
      let huecos = 0;
      for (const o of con) {
        const clave = o.r.dia + o.r.hora;
        const lado = altos.has(clave) ? "C" : bajos.has(clave) ? "P" : null;
        if (!lado) continue;
        const dd = porDia.get(o.r.dia);
        const K = rejilla(o.r.sT);
        const iS = Math.min(o.r.i + 12, dd.barras.length - 1);
        const op = operar(dd, o.r.i, iS, K, lado);
        if (!op) { huecos++; continue; }
        res.push(op.dolares);
        rets.push(op.ret * 100);
        const y = o.r.dia.slice(0, 4);
        porYear[y] = (porYear[y] ?? 0) + op.dolares;
      }
      if (!res.length) continue;
      const s = [...res].sort((a, b) => a - b);
      const tot = res.reduce((a, b) => a + b, 0);
      const sin5 = s.slice(0, s.length - 5).reduce((a, b) => a + b, 0);
      const etiq = `${h} ${campo === "imanPct" ? "imán" : "giro"} ${v}`;
      porAno[etiq] = { anual: tot / anos, porYear, res };
      const rr = resumen(rets);
      console.log(`  ${h}  ${(campo === "imanPct" ? "imán" : "giro").padEnd(8)} ${v.padEnd(10)} ${String(res.length).padStart(4)}` +
        `  ${String(huecos).padStart(5)}  ${eur(tot / res.length).padStart(9)} ${eur(s[Math.floor(s.length / 2)]).padStart(9)}` +
        ` ${eur(s[0]).padStart(10)} ${eur(tot / anos).padStart(10)}  ${eur(sin5 / anos).padStart(10)}` +
        `  ${f(rr.media, 2).padStart(7)}% ${f(rr.t, 2).padStart(6)} ${f(rr.aciertos * 100, 1).padStart(5)}%`);
    }
  }
}

{
  const costes = [];
  for (const x of D) {
    const i = idxHora(x.d, "11:00");
    const c = compraEn(x.d.barras[i], rejilla(x.d.barras[i].spot), "C");
    if (c != null) costes.push(c);
  }
  costes.sort((a, b) => a - b);
  console.log(`\n  SANIDAD de costes · call al dinero a las 11:00 (n=${costes.length}): ` +
    `mínimo $${f(costes[0], 2)} · mediana $${f(costes[Math.floor(costes.length / 2)], 2)} · máximo $${f(costes[costes.length - 1], 2)}`);
}

console.log(`\n  AÑO A AÑO (dinero total de cada regla dentro de cada año natural de la muestra)`);
for (const [etiq, o] of Object.entries(porAno)) {
  console.log(`   ${etiq.padEnd(30)} ${Object.entries(o.porYear).sort().map(([y, v]) => `${y}: ${eur(v)}`).join("   ")}`);
}

// ═══ 5 · FUERA DE MUESTRA ══════════════════════════════════════════════════════════════════

console.log(`\n### 5 · FUERA DE MUESTRA\n`);
console.log(`  El control temporal pedido (construir con <2025 y comprobar en 2025-2026) NO SE PUEDE HACER:`);
console.log(`  el volumen intradía sólo está descargado de ${D[0].d.dia} a ${D[D.length - 1].d.dia}.`);
console.log(`  Lo que sí se puede: partir la muestra en dos mitades y en tres tercios.\n`);
const corte = D[Math.floor(D.length / 2)].d.dia;
const c1 = D[Math.floor(D.length / 3)].d.dia, c2 = D[Math.floor((2 * D.length) / 3)].d.dia;
console.log(`  corte de las mitades: ${corte}   ·   cortes de los tercios: ${c1} y ${c2}\n`);
console.log(`  hora  variable  versión      salto 1ª mitad   salto 2ª mitad   tercio1  tercio2  tercio3`);
for (const h of HORAS_ESC) {
  const F = filas.filter((r) => r.hora === h);
  const m1 = F.filter((r) => r.dia < corte), m2 = F.filter((r) => r.dia >= corte);
  const t1 = F.filter((r) => r.dia < c1);
  const t2 = F.filter((r) => r.dia >= c1 && r.dia < c2);
  const t3 = F.filter((r) => r.dia >= c2);
  for (const campo of ["imanPct", "giroPct"]) {
    for (const v of ["congelada", "masVol"]) {
      const sal = (G) => { const e = escalera(G.map((r) => ({ x: r.p[v]?.[campo], y: r.retCierre })), 5); return e ? e.spread : NaN; };
      console.log(`  ${h}  ${(campo === "imanPct" ? "imán" : "giro").padEnd(8)} ${v.padEnd(10)}` +
        ` ${f(sal(m1), 3).padStart(14)} ${f(sal(m2), 3).padStart(16)}   ${f(sal(t1), 3).padStart(7)} ${f(sal(t2), 3).padStart(7)} ${f(sal(t3), 3).padStart(7)}`);
    }
  }
}

// ═══ 6 · EL DÍA DE EDUARDO ═════════════════════════════════════════════════════════════════

console.log(`\n### 6 · EL 21 DE AGOSTO DE 2026\n`);
const d21 = cargarDia21();
if (!d21) console.log(`  no se pudo cargar.`);
else {
  const hayVol21 = existsSync(join(DIRV, "2026-08-21.json"));
  const p21 = perfilGex(d21.oi, d21.barras[0].spot);
  console.log(`  su silueta congelada existe (imán ${f(p21.imanPct)}% · giro ${f(p21.giroPct)}%).`);
  console.log(`  volumen intradía del 21 descargado: ${hayVol21 ? "SÍ" : "NO"}`);
  if (!hayVol21) console.log(`  -> NO se puede calcular su silueta ACTUALIZADA, ni comprobar si Eduardo miraba la foto viva.`);
  const todos = filas.filter((r) => r.hora === "11:00").map((r) => r.p.congelada?.imanPct).filter(Number.isFinite).sort((a, b) => a - b);
  const pos = todos.filter((x) => x < p21.imanPct).length / todos.length;
  console.log(`  su imán (${f(p21.imanPct)}%) cae en el percentil ${(pos * 100).toFixed(0)} de los ${todos.length} días de esta submuestra.`);
}

console.log(`\n══════════════════════════════════════════════════════════════════════════════════\n`);
