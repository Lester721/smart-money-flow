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
// EL FALLO DEL 2026-08-15: `RAILWAY_TOKEN` en el .env.local del portátil hacía que todo lo local
// se firmara como "railway". Un token es una credencial que uno pega, no una marca de contenedor.
ok("aquí, en el portátil, el origen es LOCAL", origenEjecucion() === "local",
   `RAILWAY_TOKEN ${process.env.RAILWAY_TOKEN ? "SÍ" : "no"} está en el entorno`);
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
// OJO: el comprobador ya no lee cualquier clave `latido:*`, sino los servicios ESPERADOS. Así
// que para probarlo hay que usar el nombre de uno de verdad. Se usa "ideas" y se deja como
// estaba al terminar (se guarda su valor previo unas líneas más abajo).
// Un servicio de MENTIRA, no uno real. La versión anterior usaba "ideas" y le metía latidos
// falsos: si la limpieza fallaba —y falló— quedaba basura en producción, y el comprobador
// enseñaba un commit inventado como si fuera el de un servicio de verdad.
const SERV_PRUEBA = "__auditoria-servicio__";
const CLAVE_PRUEBA = `latido:${SERV_PRUEBA}`;
const previoIdeas = null;
const falso = {
  servicio: SERV_PRUEBA, origen: "railway", commit: "0000000000000000000000000000000000000000",
  cuandoISO: new Date().toISOString(),
  cuandoET: new Date().toLocaleString("sv-SE", { timeZone: "America/New_York" }).slice(0, 16),
  resultado: "latido FALSO de la auditoría, con un commit que no es el de main",
};
await r.set(CLAVE_PRUEBA, JSON.stringify(falso));
let salida = "", codigo = 0;
try {
  salida = execFileSync("node", ["--env-file=.env.local", "scripts/estado-railway.mjs"], { encoding: "utf8", env: { ...process.env, SERVICIOS_ESPERADOS: SERV_PRUEBA } });
} catch (e) { salida = (e.stdout || "") + (e.stderr || ""); codigo = e.status ?? -1; }
// CON el token, el comprobador cruza el latido con lo que hay DESPLEGADO. Un latido viejo cuando
// el despliegue está al día NO es "despliegue viejo": es "aún no ha corrido con él". Distinguir
// las dos cosas es justo lo que se arregló, así que aquí se comprueba que NO grita de más.
// El servicio de prueba no existe en Railway, así que la API no puede decir qué tiene desplegado.
// Lo CORRECTO ahí es avisar —fallar cerrado—, no callarse ni afirmar "despliegue viejo" como si
// se supiera. Se comprueba que avisa y que NO inventa un diagnóstico que no puede sostener.
ok("con un servicio que la API no conoce, avisa en vez de callarse",
   /main está en/.test(salida) && !/DESPLIEGUE VIEJO/.test(salida));
ok("nombra el commit de main correcto", salida.includes(mainSha.slice(0, 8)), mainSha.slice(0, 8));

// SIN token no puede cruzar, y entonces sí tiene que avisar en vez de callarse.
let salidaSinToken = "", codSinToken = 0;
try {
  const env = { ...process.env, RAILWAY_API: "0", SERVICIOS_ESPERADOS: SERV_PRUEBA };
  salidaSinToken = execFileSync("node", ["--env-file=.env.local", "scripts/estado-railway.mjs"],
    { encoding: "utf8", env });
} catch (e) { salidaSinToken = (e.stdout || "") + (e.stderr || ""); codSinToken = e.status ?? -1; }
ok("sin RAILWAY_TOKEN avisa del latido desfasado en vez de callarse",
   /main está en/.test(salidaSinToken) && codSinToken !== 0);
ok("y dice que no pudo cruzar con lo desplegado", /sin RAILWAY_TOKEN/.test(salidaSinToken));

// ── 5bis. un id de despliegue NO se compara con main ────────────────────────
// Si Railway inyecta un UUID de despliegue en vez de un SHA de git, compararlo con main daría
// "DESPLIEGUE VIEJO" todos los días. Un aviso inventado es peor que ninguno: enseña a ignorarlos.
console.log("\n5bis. un id de despliegue no se confunde con un commit viejo");
await r.set(CLAVE_PRUEBA, JSON.stringify({
  ...falso, commit: "7f3a1c9e-4b2d-4e8a-9c1f-2a6b8d0e5f31",
  resultado: "latido con id de despliegue, no con SHA de git",
}));
let salida2 = "";
try { salida2 = execFileSync("node", ["--env-file=.env.local", "scripts/estado-railway.mjs"], { encoding: "utf8", env: { ...process.env, SERVICIOS_ESPERADOS: SERV_PRUEBA } }); }
catch (e) { salida2 = (e.stdout || "") + (e.stderr || ""); }
const bloque = salida2.split("\n").slice(
  salida2.split("\n").findIndex((l) => l.includes("__auditoria__")), 4).join(" ");
ok("NO dice 'DESPLIEGUE VIEJO' por un UUID", !/DESPLIEGUE VIEJO/.test(bloque), bloque.trim().slice(0, 88));
ok("avisa de que no se puede comparar", /no es un SHA de git/.test(salida2));

// ── 5ter. los cuatro servicios están cableados ──────────────────────────────
console.log("\n5ter. los CUATRO cron escriben latido");
for (const [ruta, nombre] of [
  ["scripts/forward-wheel.ts", "wheel"],
  ["scripts/forward-test.ts", "credit-spread"],
  ["scripts/forward-gex-condor.mjs", "gex-condor"],
  ["scripts/forward-ideas.ts", "ideas"],
]) {
  const txt = readFileSync(ruta, "utf8");
  ok(`${nombre}: escribe latido en la corrida normal`, txt.includes("escribirLatido("));
  ok(`${nombre}: escribe latido si revienta`, txt.includes("escribirLatidoDirecto("));
}

// ── 5quater. el candado de ThetaData impide dos Terminales a la vez ─────────
// Es lo que tumbó el Cóndor y el Credit Spread el 2026-08-15: los dos arrancaron su Terminal a
// las 13:36:58 y ninguno pudo servir datos. ThetaData permite UNA sesión por cuenta.
console.log("\n5quater. el candado impide dos sesiones de ThetaData a la vez");
await r.set("lock:__auditoria__", "Otro Servicio:999", "EX", 12);
let salidaLock = "";
try {
  salidaLock = execFileSync("node", ["--env-file=.env.local", "scripts/with-theta.mjs",
    "node", "-e", "console.log('el trabajo corrió')"],
    { encoding: "utf8", env: { ...process.env, DATA_PROVIDER: "theta",
      // SIN Terminal: si la auditoría arrancara Java se conectaría a ThetaData con la misma clave
      // y le robaría la sesión a lo que estuviera corriendo en Railway. La herramienta que
      // comprueba que no hay colisiones NO puede ser la que las provoque.
      THETA_SIN_TERMINAL: "1",
      THETA_LOCK_KEY: "lock:__auditoria__", THETA_LOCK_ESPERA: "40", THETA_BOOT_TIMEOUT: "1" } });
} catch (e) { salidaLock = (e.stdout || "") + (e.stderr || ""); }
ok("detecta que otro servicio tiene la sesión", /otro servicio tiene la sesión/.test(salidaLock));
ok("dice quién la tiene", /Otro Servicio:999/.test(salidaLock));
ok("ESPERA en vez de arrancar un segundo Terminal", /esperando hasta 40s/.test(salidaLock));
ok("lo coge cuando el otro lo suelta", /candado de ThetaData cogido/.test(salidaLock));
ok("y lo suelta al terminar", /candado soltado/.test(salidaLock));
await r.del("lock:__auditoria__");
ok("no deja el candado puesto", (await r.get("lock:__auditoria__")) === null);

// ── 6. sale con código ≠ 0 cuando hay avisos ────────────────────────────────
console.log("\n6. el código de salida sirve para encadenar");
ok("sale ≠ 0 habiendo avisos", codigo !== 0, `código ${codigo}`);

// ── 7. limpieza ─────────────────────────────────────────────────────────────
console.log("\n7. limpieza");
// SE BORRA TODO LO QUE EMPIECE POR __auditoria, no sólo la primera clave. La versión anterior
// borraba `latido:__auditoria__` y se dejaba `latido:__auditoria-servicio__` colgada en
// producción, donde el comprobador la contaba como "latido con un nombre inventado". Una
// herramienta de diagnóstico que deja basura es una herramienta que genera trabajo.
for (const k of await r.keys("*__auditoria*")) await r.del(k);
const quedan = (await r.keys("*__auditoria*")).length;
ok("no queda NINGUNA clave de auditoría en Redis", quedan === 0, `${quedan} encontradas`);

console.log(`\n${fallan === 0 ? "✅" : "❌"}  ${pasan} pasan · ${fallan} fallan`);
await r.quit();
process.exit(fallan === 0 ? 0 : 1);
