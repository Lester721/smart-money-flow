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
process.exit(malos ? 1 : 0);
