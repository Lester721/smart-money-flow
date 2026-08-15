// AUDITORÍA DEL LATIDO — comprueba que lo que acabo de montar funciona de verdad.
//
// Uso: node --env-file=.env.local scripts/auditar-latido.mjs
//
// No basta con que compile. Cada prueba de aquí EJECUTA el camino real y comprueba el resultado.
// Usa claves `latido:__auditoria__*` y las borra al final: no toca ni un dato de producción.
//
// Lo que se comprueba, y por qué cada cosa:
//   1. La librería construye el latido con los campos que el comprobador espera.
//   2. Se escribe en Redis DE VERDAD y se puede leer igual.
//   3. El import dinámico desde el .mjs del cóndor resuelve en tiempo de ejecución.
//      (Es el punto más frágil: un .mjs importando un .ts. Si esto falla, el cóndor no
//       escribiría latido y no daría error — otro fallo silencioso.)
//   4. Si Redis falla, escribirLatido NO tumba el proceso.
//   5. El comprobador DETECTA un despliegue viejo (se le mete uno falso a propósito).
//   6. El comprobador sale con código ≠ 0 cuando hay avisos.
//   7. Las claves de prueba quedan borradas.

import { execFileSync } from "node:child_process";
import Redis from "ioredis";
import { construirLatido, escribirLatido, escribirLatidoDirecto, versionEjecucion, origenEjecucion } from "../lib/origenEjecucion.ts";
import { readFileSync } from "node:fs";

if (!process.env.REDIS_URL) { console.error("falta REDIS_URL"); process.exit(1); }
const r = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 3 });

let pasan = 0, fallan = 0;
const ok = (n, cond, detalle = "") => {
  if (cond) { pasan++; console.log(`  ✓ ${n}${detalle ? ` — ${detalle}` : ""}`); }
  else { fallan++; console.log(`  ✗ ${n}${detalle ? ` — ${detalle}` : ""}`); }
};

console.log("AUDITORÍA DEL LATIDO\n");

// ── 1. la librería construye lo que el comprobador espera ───────────────────
console.log("1. la librería construye el latido");
const L = construirLatido("__auditoria__", "prueba");
for (const campo of ["servicio", "origen", "commit", "cuandoISO", "cuandoET", "resultado"])
  ok(`tiene el campo "${campo}"`, L[campo] != null && L[campo] !== "", String(L[campo]).slice(0, 24));
ok("cuandoISO es una fecha parseable", Number.isFinite(Date.parse(L.cuandoISO)));
ok("origen coincide con el entorno", L.origen === origenEjecucion(), L.origen);
ok("commit coincide con versionEjecucion()", L.commit === versionEjecucion(), L.commit);

// ── 2. se escribe y se lee de Redis de verdad ───────────────────────────────
console.log("\n2. va y vuelve de Redis");
await escribirLatido(r, "__auditoria__", "escrito por la auditoría");
const leido = await r.get("latido:__auditoria__");
ok("la clave existe después de escribir", leido != null);
let P = null; try { P = JSON.parse(leido); } catch { /* */ }
ok("lo leído es JSON válido", P != null);
ok("el resultado sobrevive el viaje", P?.resultado === "escrito por la auditoría", P?.resultado);

// ── 3. el import dinámico del cóndor (.mjs → .ts) resuelve ──────────────────
console.log("\n3. el .mjs del cóndor puede importar la librería .ts");
let importOk = false, importErr = "";
try {
  const m = await import("../lib/origenEjecucion.ts");
  importOk = typeof m.escribirLatido === "function";
} catch (e) { importErr = e.message; }
ok("import dinámico de origenEjecucion.ts", importOk, importErr || "escribirLatido disponible");

// ── 4. un Redis roto NO tumba el forward-test ───────────────────────────────
console.log("\n4. si Redis falla, el latido no tumba nada");
let sobrevive = true;
try {
  await escribirLatido({ set: async () => { throw new Error("redis caído (simulado)"); } }, "__auditoria__", "x");
} catch { sobrevive = false; }
ok("escribirLatido traga el error y sigue", sobrevive);
let sobreviveNull = true;
try { await escribirLatido(null, "__auditoria__", "x"); } catch { sobreviveNull = false; }
ok("con redis=null tampoco revienta", sobreviveNull);

// ── 4bis. el latido DIRECTO abre su propia conexión ─────────────────────────
// Es el que corre cuando un servicio revienta ANTES de crear su cliente de Redis: si esto no
// funciona, un fallo de arranque volvería a ser invisible.
console.log("\n4bis. el latido directo (para cuando el script pete al arrancar)");
await r.del("latido:__auditoria__");
await escribirLatidoDirecto("__auditoria__", "FALLÓ: error simulado de la auditoría");
const directo = await r.get("latido:__auditoria__");
ok("escribe sin que se le pase cliente", directo != null);
ok("conserva el mensaje de fallo", JSON.parse(directo ?? "{}").resultado?.startsWith("FALLÓ:"));

// ── 4ter. persist/guardar NO están dentro de un condicional ─────────────────
// Si la llamada que escribe el latido viviera dentro de un `if`, los días sin novedad no
// dejarían rastro — que es exactamente el agujero que se está tapando.
console.log("\n4ter. la llamada que escribe el latido se ejecuta siempre");
for (const [ruta, patron, nombre] of [
  ["scripts/forward-wheel.ts", "await persist(", "wheel"],
  ["scripts/forward-test.ts", "await persist(", "credit-spread"],
  ["scripts/forward-gex-condor.mjs", "await guardar(", "gex-condor"],
]) {
  const lin = readFileSync(ruta, "utf8").split("\n");
  const i = lin.findIndex((l) => l.includes(patron));
  let prof = 0; const encierran = [];
  for (let j = i - 1; j >= 0 && encierran.length < 4; j--) {
    const c = lin[j].split("//")[0];
    prof += (c.match(/\}/g) || []).length - (c.match(/\{/g) || []).length;
    if (prof < 0) { encierran.push(c.trim().slice(0, 40)); prof = 0; if (/^\(async/.test(c.trim())) break; }
  }
  const dentroDeIf = encierran.some((b) => /^(if|for|while|switch|else|\}\s*else)/.test(b));
  ok(`${nombre}: la llamada no está dentro de un condicional`, i >= 0 && !dentroDeIf, encierran.join(" <- "));
  ok(`${nombre}: tiene manejador de fallo con latido`, readFileSync(ruta, "utf8").includes("escribirLatidoDirecto"));
}

// ── 5. el comprobador DETECTA un despliegue viejo ───────────────────────────
console.log("\n5. el comprobador detecta un despliegue viejo");
const mainSha = execFileSync("git", ["rev-parse", "origin/main"], { encoding: "utf8" }).trim();
const falso = {
  servicio: "__auditoria__", origen: "railway", commit: "0000000000000000000000000000000000000000",
  cuandoISO: new Date().toISOString(),
  cuandoET: new Date().toLocaleString("sv-SE", { timeZone: "America/New_York" }).slice(0, 16),
  resultado: "latido FALSO de la auditoría, con un commit que no es el de main",
};
await r.set("latido:__auditoria__", JSON.stringify(falso));
let salida = "", codigo = 0;
try {
  salida = execFileSync("node", ["--env-file=.env.local", "scripts/estado-railway.mjs"], { encoding: "utf8" });
} catch (e) { salida = (e.stdout || "") + (e.stderr || ""); codigo = e.status ?? -1; }
ok("avisa DESPLIEGUE VIEJO", /DESPLIEGUE VIEJO/.test(salida),
   (salida.split("\n").find((l) => l.includes("DESPLIEGUE VIEJO")) || "").trim().slice(0, 96));
ok("nombra el commit de main correcto", salida.includes(mainSha.slice(0, 8)), mainSha.slice(0, 8));

// ── 6. sale con código ≠ 0 cuando hay avisos ────────────────────────────────
console.log("\n6. el código de salida sirve para encadenar");
ok("sale ≠ 0 habiendo avisos", codigo !== 0, `código ${codigo}`);

// ── 7. limpieza ─────────────────────────────────────────────────────────────
console.log("\n7. limpieza");
await r.del("latido:__auditoria__");
ok("la clave de prueba queda borrada", (await r.get("latido:__auditoria__")) === null);
const quedan = (await r.keys("*__auditoria__*")).length;
ok("no queda ninguna clave de auditoría", quedan === 0, `${quedan} encontradas`);

console.log(`\n${fallan === 0 ? "✅" : "❌"}  ${pasan} pasan · ${fallan} fallan`);
await r.quit();
process.exit(fallan === 0 ? 0 : 1);
