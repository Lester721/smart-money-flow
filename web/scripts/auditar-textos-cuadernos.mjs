// ══ ¿ALGÚN TEXTO CONTRADICE LOS DATOS? ══ Lester, 31-ago-2026.
//
// Vio en pantalla que la tabla decía "7 cerradas" y la nota de debajo, en la MISMA vista, decía
// "NINGUNA cerrada". La prosa se escribe una vez y los cuadernos siguen escribiendo: se separan,
// igual que se separó la lista de /estado. Rellenar a mano no arregla nada; comprobarlo, sí.
//
// Uso:  node --env-file=.env.local scripts/auditar-textos-cuadernos.mjs
const BASE = process.env.WEB_BASE || "http://localhost:8000";
const r = await fetch(BASE + "/api/forward-tests").catch(() => null);
if (!r) { console.log("\n  ⛔ no responde " + BASE + " — arranca la web primero\n"); process.exit(1); }
const j = await r.json();
if (!j.ok) { console.log("\n  ⛔ " + (j.motivo || "la API dice que no") + "\n"); process.exit(1); }
const CHEQUEOS = [
  { nombre: "dice NINGUNA cerrada teniendo cerradas",
    mal: (t, c) => /ninguna cerrada/i.test(t) && (c.cerradas ?? 0) > 0 },
  { nombre: "dice que no ha operado teniendo operaciones",
    mal: (t, c) => /(aún|aun) no ha operado|no ha operado ni una/i.test(t) && (c.cerradas ?? 0) > 0 },
  { nombre: "cita un número de posiciones que ya no cuadra",
    mal: (t, c) => { const m = t.match(/(\d+)\s+posiciones/); return !!m && Math.abs(+m[1] - (c.abiertas ?? 0)) > 5; } },
  { nombre: "dice que aún no ha arrancado teniendo filas",
    mal: (t, c) => /todavía no ha empezado|aún no ha arrancado/i.test(t) && (c.filas ?? 0) > 0 },
];
let malos = 0;
console.log("");
for (const c of j.cuadernos) {
  const t = c.enContra || "";
  const fallos = CHEQUEOS.filter((q) => q.mal(t, c)).map((q) => q.nombre);
  if (fallos.length) { malos++;
    console.log("  ⚠ " + c.nombre);
    for (const f of fallos) console.log("      " + f);
    console.log("      datos de hoy: " + (c.cerradas ?? 0) + " cerradas · " + (c.abiertas ?? 0) + " abiertas · " + (c.filas ?? 0) + " filas"); }
}
console.log(malos ? `\n  ⛔ ${malos} textos contradicen los datos\n` : "  ✅ ningún texto contradice los datos\n");

// ── y que los contadores de /estado no se hayan quedado viejos ──────────────────────────────
// Lester, 31-ago-2026: "asegurate que esto siempre esta actualizado". Los contadores YA se
// calculan solos desde ITEMS, pero ACTUALIZADO estaba escrito a mano y decia 2026-08-22 con la
// ficha mas nueva del 31: nueve dias de retraso justo en la frase que dice cuando se actualizo.
try {
  const m = await import("../lib/estadoProyecto.ts");
  const porEstado = (e) => m.ITEMS.filter((i) => i.estado === e).length;
  const mal = [];
  if (m.RESUMEN.enPrueba !== porEstado("en-prueba")) mal.push("enPrueba");
  if (m.RESUMEN.loQueFunciona !== porEstado("funciona")) mal.push("loQueFunciona");
  if (m.RESUMEN.pendiente !== porEstado("pendiente")) mal.push("pendiente");
  if (m.RESUMEN.cerrado !== porEstado("cerrado")) mal.push("cerrado");
  const masNueva = m.ITEMS.map((i) => i.actualizado).filter(Boolean).sort().pop();
  if (m.ACTUALIZADO !== masNueva) mal.push(`ACTUALIZADO dice ${m.ACTUALIZADO} y la ficha mas nueva es ${masNueva}`);
  if (mal.length) { malos++; console.log(`  contadores de /estado NO cuadran: ${mal.join(", ")}`); }
  else console.log(`  contadores al dia: ${porEstado("en-prueba")} ideas en prueba, ${porEstado("funciona")} ideas en pie, ${porEstado("pendiente")} ideas pendientes, ${porEstado("cerrado")} ideas descartadas, actualizado ${m.ACTUALIZADO}`);
} catch (e) { console.log("  no se pudo comprobar estadoProyecto: " + e.message); }

// ── CIFRAS ESCRITAS A MANO EN UNA FICHA QUE TIENE TABLA VIVA ────────────────────────────────
// La causa raiz de TODAS las veces que la web ha mentido: el texto y la tabla salen de fuentes
// distintas, asi que el texto se queda viejo sin que nada chille. La ficha del Wheel llego a
// decir "274 puts vendidos · 7 cerrados · 267 vivos" con su propia tabla, dos centimetros mas
// abajo, marcando 296 · 19 · 277.
//
// Dos cosas aprendidas escribiendo ESTA comprobacion, las dos a base de probarla:
//   1. La primera version llevaba /(d[d.,]*)s*cerrad/ — sin las barras invertidas, comidas al
//      generar el fichero. Buscaba la letra "d" y no encontraba nada: pasaba en VERDE. Por eso
//      abajo hay una autoprueba que la obliga a cazar un caso conocido.
//   2. Solo se avisa si el numero no cuadra con NINGUN recuento vivo y ademas la frase no habla
//      del backtest. Sin eso saltaba con "19.465 operaciones" (el historico) y con "16
//      operaciones" (que si eran las cerradas): un auditor que grita sin motivo se ignora.
const QUE_CUENTA = [
  /(\d[\d.,]*)\s*(?:puts vendidos|spreads|operaciones|filas|señales)/gi,
  /(\d[\d.,]*)\s*(?:cerrad\w*|vivos|vivas|abiertas|abiertos)/gi,
];
// Una frase que nombra un AÑO ("el 2022 que parece salvarlo son 13 operaciones") habla del
// historico, no del cuaderno vivo que arranco hace tres semanas.
const DEL_PASADO = /backtest|histórico|historico|fuera de muestra|al año|medido y cerrado|en el examen|(?<![0-9])(?:19|20)[0-9]{2}(?![0-9])/i;

function cifrasQueMienten(texto, vivo) {
  const bien = new Set();
  for (const c of vivo) for (const k of ["filas", "cerradas", "abiertas", "sinSenal"]) if (c[k] != null) bien.add(c[k]);
  for (const k of ["filas", "cerradas", "abiertas"]) bien.add(vivo.reduce((a, c) => a + (c[k] ?? 0), 0));
  const malas = [];
  for (const re of QUE_CUENTA) {
    for (const g of texto.matchAll(re)) {
      const dicho = +String(g[1]).replace(/[.,]/g, "");
      if (!Number.isFinite(dicho) || bien.has(dicho)) continue;
      const desde = texto.lastIndexOf(".", g.index) + 1;
      const hasta = texto.indexOf(".", g.index + g[0].length);
      const frase = texto.slice(desde, hasta < 0 ? texto.length : hasta);
      if (DEL_PASADO.test(frase)) continue;          // es una cifra del pasado, no del cuaderno vivo
      malas.push({ dicho, trozo: g[0].trim(), vivos: [...bien].sort((a, b) => a - b) });
    }
  }
  return malas;
}

// AUTOPRUEBA: si esta comprobacion deja de cazar el caso que la origino, es que se ha roto.
{
  const caso = cifrasQueMienten("274 puts vendidos · 7 cerrados · 267 vivos", [{ filas: 296, cerradas: 19, abiertas: 277 }]);
  const historico = cifrasQueMienten("El 2022 que parece salvarlo son 13 operaciones", [{ filas: 7 }]);
  if (historico.length) {
    console.log(String.fromCharCode(10) + "  ⛔ EL AUDITOR ESTA ROTO: DEL_PASADO no reconoce una frase con año");
    process.exit(2);
  }
  if (caso.length < 3) {
    console.log("\n  ⛔ EL AUDITOR ESTA ROTO: no caza su propio caso de prueba (" + caso.length + " de 3)\n");
    process.exit(2);
  }
}

try {
  const m = await import("../lib/estadoProyecto.ts");
  const porClave = new Map(j.cuadernos.map((c) => [c.id, c]));
  for (const it of m.ITEMS) {
    const vivo = (it.cuadernos ?? []).map((k) => porClave.get(k)).filter(Boolean);
    if (!vivo.length) continue;
    // Si el cuaderno todavia no ha operado, no hay tabla viva que pueda contradecir nada: lo que
    // cite la ficha sera del backtest. Sin esta linea saltaba con "281 operaciones" de LA PALANCA
    // y "34 señales" del Missile, que son del historico y son correctas.
    if (!vivo.some((c) => (c.filas ?? 0) > 0)) continue;
    const texto = [it.numero, it.queEs, it.enContra, ...(it.evidencia ?? [])].filter(Boolean).join(". ");
    for (const x of cifrasQueMienten(texto, vivo)) {
      malos++;
      console.log("  ⛔ " + it.titulo + ": «" + x.trozo + "» no cuadra con ningun recuento vivo (" + x.vivos.join(" · ") + ")");
      console.log("      quita la cifra del texto — la pone la banda de abajo, que sale de Redis");
    }
  }
} catch (e) { console.log("  no se pudo comprobar las fichas: " + e.message); }

process.exit(malos ? 1 : 0);
