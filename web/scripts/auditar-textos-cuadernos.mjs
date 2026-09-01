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
  else console.log(`  contadores al dia: ${porEstado("en-prueba")} en prueba, ${porEstado("funciona")} en pie, ${porEstado("pendiente")} pendientes, ${porEstado("cerrado")} cerrados, actualizado ${m.ACTUALIZADO}`);
} catch (e) { console.log("  no se pudo comprobar estadoProyecto: " + e.message); }

process.exit(malos ? 1 : 0);
