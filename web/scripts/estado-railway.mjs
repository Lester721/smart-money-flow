// ESTADO REAL DE LOS CRON DE RAILWAY — por lo que ESCRIBEN, no por lo que dice el log.
//
// Uso:  node --env-file=.env.local scripts/estado-railway.mjs
//   Sólo mira: no escribe nada en Redis y no imprime ninguna credencial.
//   Sale con código 1 si hay algún aviso, para poder encadenarlo.
//
// POR QUÉ NO BASTA CON MIRAR LOS LEDGERS. Un servicio que corre bien pero no tiene nada que
// añadir ese día NO ESCRIBE NADA. Desde fuera, "corrió y no había señal" y "lleva tres días
// muerto" se ven exactamente igual. El 2026-08-15 eso costó una mañana entera: la Wheel
// funcionaba, pero como el dedup no añadía operaciones no había forma de comprobar si el
// contenedor tenía el código actual — la única respuesta posible era "espera a las 18:00 a ver".
//
// Por eso cada cron deja ahora un LATIDO en CADA corrida, con el commit que Railway le inyectó.
// Este comprobador lo compara con `main` y dice, sin esperar a nada, si algún servicio se quedó
// en un despliegue viejo.

import { execFileSync } from "node:child_process";
import Redis from "ioredis";

// ── QUÉ COMMIT ESTÁ DESPLEGADO AHORA MISMO (API de Railway) ─────────────────
// El latido dice qué commit CORRIÓ; esto dice cuál está DESPLEGADO. No es lo mismo, y confundirlo
// da un aviso falso: el 2026-08-15 el Cóndor corrió a las 10:21 con 1273ff6, se redesplegó
// después a 393f79b, y el comprobador cantó "despliegue viejo" cuando no lo había. Con las dos
// cifras se distingue "se quedó atrás" de "aún no ha corrido desde el último despliegue".
// Sin RAILWAY_TOKEN esto se salta y todo lo demás sigue funcionando igual.
async function desplegados() {
  // RAILWAY_API=0 apaga el cruce a propósito: sirve para trabajar sin red y para que la auditoría
  // pueda comprobar que, SIN poder cruzar, el comprobador avisa en vez de callarse. Hace falta
  // una bandera explícita porque `--env-file` vuelve a poner el token aunque se borre del entorno.
  if (process.env.RAILWAY_API === "0") return null;
  if (!process.env.RAILWAY_TOKEN) return null;
  const Q = `query { projects { edges { node { name services { edges { node { name
    deployments(first: 1) { edges { node { status createdAt meta } } } } } } } } } }`;
  try {
    const r = await fetch("https://backboard.railway.com/graphql/v2", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.RAILWAY_TOKEN}` },
      body: JSON.stringify({ query: Q }), signal: AbortSignal.timeout(20_000),
    });
    const j = await r.json();
    if (j.errors?.length) return null;
    const m = new Map();
    for (const { node: p } of j.data.projects.edges)
      for (const { node: sv } of p.services.edges) {
        const d = sv.deployments.edges[0]?.node;
        if (d) m.set(sv.name, { commit: d.meta?.commitHash || "", estado: d.status, cuando: d.createdAt });
      }
    return m;
  } catch { return null; }
}
/** "gex-condor" ↔ "Forward · Cóndor 0DTE": el latido y Railway no usan el mismo nombre. */
const ALIAS = { "gex-condor": "Cóndor", "credit-spread": "Credit Spread", wheel: "Wheel", ideas: "Ideas" };
function buscarDespliegue(mapa, servicio) {
  if (!mapa) return null;
  const pista = (ALIAS[servicio] || servicio).toLowerCase();
  for (const [nombre, v] of mapa) if (nombre.toLowerCase().includes(pista)) return v;
  return null;
}

if (!process.env.REDIS_URL) { console.error("falta REDIS_URL en .env.local"); process.exit(1); }
const r = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 3 });

const DESDE_ORIGEN = "2026-08-13";   // el día que se añadió el campo `origen`
const hoyET = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const ahoraET = new Date().toLocaleString("sv-SE", { timeZone: "America/New_York" }).slice(0, 16);
const corto = (c) => (c || "").slice(0, 8) || "?";
/** ¿Es un SHA de git (40 hex) o el id de despliegue de Railway (un UUID)? Compararlos sería
 *  fabricar un aviso falso todos los días. */
const esSha = (c) => /^[0-9a-f]{40}$/i.test(String(c || ""));

/** El commit que Railway DEBERÍA estar corriendo = la punta de main en el remoto. */
function commitDeMain() {
  if (process.env.COMMIT_MAIN) return process.env.COMMIT_MAIN.trim();
  try { return execFileSync("git", ["rev-parse", "origin/main"], { encoding: "utf8" }).trim(); }
  catch { return ""; }
}

const DESPLIEGUES = await desplegados();
let avisos = 0;   // fallos del sistema: hay que arreglarlos
let notas = 0;    // observaciones del forward-test: información, no fallos
const COMMIT_MAIN = commitDeMain();

console.log(`AHORA (hora de Nueva York): ${ahoraET}`);
console.log(`main en el remoto: ${corto(COMMIT_MAIN) || "(no se pudo leer)"}`);

// ── 1. LATIDOS: qué commit corre cada servicio ──────────────────────────────
console.log("\n── SERVICIOS ────────────────────────────────────────────────────────");
// SE RECORRE LA LISTA DE SERVICIOS QUE DEBERÍA HABER, NO LAS CLAVES QUE HAY.
// Con `keys("latido:*")` un servicio que NUNCA ha escrito latido —porque su build falla y no
// llega a desplegarse— sencillamente no aparece: no sale en ninguna línea, no suma ningún aviso,
// y el comprobador remata en verde. Un servicio muerto se vería idéntico a uno sano, que es
// exactamente lo que esto existe para impedir.
// La lista se puede sustituir por entorno SÓLO para las pruebas: la auditoría necesita un
// servicio de mentira al que meterle latidos falsos, y antes usaba "ideas" —un servicio REAL—
// dejando basura en producción cuando su limpieza no acertaba. Una herramienta de diagnóstico
// no puede ensuciar lo que vigila.
const ESPERADOS = (process.env.SERVICIOS_ESPERADOS || "gex-condor,credit-spread,wheel,ideas")
  .split(",").map((x) => x.trim()).filter(Boolean);
const sueltos = (await r.keys("latido:*")).map((k) => k.replace("latido:", "")).filter((n) => !ESPERADOS.includes(n));
if (sueltos.length) {
  console.log(`  ⚠ latidos con un nombre que no es de ningún servicio esperado: ${sueltos.join(", ")}`);
  console.log(`    (alguien escribió bajo un nombre inventado; nadie lo va a actualizar nunca)`);
  avisos += sueltos.length;
}
{
  for (const servicio of ESPERADOS) {
    const crudoL = await r.get(`latido:${servicio}`);
    if (!crudoL) {
      const dep = buscarDespliegue(DESPLIEGUES, servicio);
      console.log(`  ${servicio.padEnd(14)} ⚠ NINGÚN LATIDO` +
                  (dep ? ` · desplegado ${corto(dep.commit)} (${dep.estado})` : ""));
      console.log(`                 o nunca ha corrido con el código nuevo, o el servicio está caído`);
      avisos++;
      continue;
    }
    let L; try { L = JSON.parse(crudoL); } catch {
      console.log(`  ${servicio.padEnd(14)} ⚠ su latido no es JSON válido`); avisos++; continue;
    }
    const horas = (Date.now() - Date.parse(L.cuandoISO)) / 3_600_000;
    console.log(`  ${String(L.servicio).padEnd(14)} ${String(L.origen).padEnd(8)} commit ${corto(L.commit)}` +
                `  ·  corrió ${L.cuandoET} (hace ${horas.toFixed(1)} h)`);
    console.log(`  ${" ".repeat(14)} ${L.resultado}`);
    // EL LATIDO DE FALLO NO SIRVE DE NADA SI NADIE LO LEE. La primera versión imprimía el
    // resultado y seguía: un cron que petara todos los días salía "✓ al día con main" y el
    // comprobador remataba en verde. Se escribió el latido de fallo justamente para esto.
    // UNA PAUSA DELIBERADA NO ES UNA AVERÍA. Ideas está parada a propósito desde el 2026-08-12
    // (valoraba con Black-Scholes); avisar de eso cada día sería ruido por algo que está BIEN.
    // Pero tampoco puede desaparecer del panel: se enseña como pausa, que es su estado real.
    if (/^EN PAUSA/i.test(String(L.resultado || ""))) {
      console.log(`                 ⏸  en pausa a propósito, no es una avería`);
    } else if (/^(FALLÓ|PARADO|NO CORRIÓ|ABORTADO)/i.test(String(L.resultado || ""))) {
      console.log(`                 ⚠ LA ÚLTIMA CORRIDA NO TERMINÓ BIEN`);
      avisos++;
    }
    if (horas > 26) { console.log(`                 ⚠ lleva ${horas.toFixed(0)} h sin correr`); avisos++; }
    if (L.origen !== "railway") {
      console.log(`                 ⚠ el último que corrió NO fue Railway, fue "${L.origen}"`); avisos++;
    } else if (L.commit === "desconocido") {
      console.log(`                 ⚠ el contenedor no expone ninguna variable de versión`); avisos++;
    } else if (!esSha(L.commit)) {
      // NO es un SHA de git (será el id de despliegue de Railway). Compararlo con main daría
      // "despliegue viejo" TODOS los días — un aviso inventado, que es peor que ninguno. Se
      // enseña tal cual: si cambia, es que hubo un redespliegue, y eso ya dice bastante.
      console.log(`                 · versión "${corto(L.commit)}" (no es un SHA de git: no se puede`);
      console.log(`                   comparar con main, pero si cambia es que se redesplegó)`);
    } else if (COMMIT_MAIN && corto(L.commit) !== corto(COMMIT_MAIN)) {
      // El latido va por detrás de main. Con la API se distingue el motivo, que es lo que importa.
      const dep = buscarDespliegue(DESPLIEGUES, L.servicio);
      if (dep && corto(dep.commit) === corto(COMMIT_MAIN)) {
        console.log(`                 · ya está desplegado ${corto(COMMIT_MAIN)}, pero aún no ha corrido con él`);
        console.log(`                   (el latido es de la corrida anterior). No hay nada que arreglar.`);
      } else if (dep) {
        console.log(`                 ⚠ DESPLIEGUE VIEJO: desplegado ${corto(dep.commit)} (${dep.estado}), ` +
                    `main en ${corto(COMMIT_MAIN)} → redesplegar`);
        avisos++;
      } else {
        console.log(`                 ⚠ corrió ${corto(L.commit)} y main está en ${corto(COMMIT_MAIN)}` +
                    `${DESPLIEGUES ? "" : " (sin RAILWAY_TOKEN no puedo mirar qué hay desplegado)"}`);
        avisos++;
      }
    } else if (COMMIT_MAIN) console.log(`                 ✓ al día con main`);
  }
}

// ── 2. LEDGERS ──────────────────────────────────────────────────────────────
console.log("\n── LEDGERS ──────────────────────────────────────────────────────────");
const claves = (await r.keys("*")).filter((k) => !k.startsWith("latido:")).sort();
for (const k of claves) {
  const tipo = await r.type(k);
  if (tipo !== "string") { console.log(`  ${k.padEnd(34)} (${tipo})`); continue; }
  const crudo = await r.get(k);

  if (k.endsWith(":report")) {
    // DOS COSAS DISTINTAS QUE ANTES SE MEZCLABAN, y mezclarlas hacía inútil el contador:
    //
    //   · SALUD DEL SISTEMA — "el servicio no corrió", "se quedó en un despliegue viejo". Se
    //     arreglan, y hasta que se arreglen hay algo que hacer.
    //   · NOTAS DEL FORWARD-TEST — "con 3 cierres esto no dice nada, hacen falta ~30", "el
    //     crédito está por debajo del p10". NO son fallos: es la prueba diciendo la verdad
    //     sobre sí misma, y la de los 30 cierres va a estar ahí durante meses.
    //
    // Si las dos suman al mismo contador, nunca sale verde aunque todo esté perfecto — y un
    // contador que nunca sale verde no se mira. Se cuentan aparte.
    const lineas = crudo.split("\n").filter((x) => x.includes("⚠"));
    console.log(`  ${k.padEnd(34)} ${lineas.length ? `${lineas.length} notas del forward-test` : "sin notas"}`);
    for (const l of lineas) console.log(`        · ${l.replace("⚠", "").trim()}`);
    notas += lineas.length;
    continue;
  }

  if (k === "lock:theta") {
    const ttl = await r.ttl(k);
    console.log(`  ${k.padEnd(34)} 🔒 la sesión de ThetaData la tiene "${crudo}" (caduca en ${ttl}s)`);
    console.log(`  ${" ".repeat(34)} eso significa que ESE servicio está corriendo ahora mismo.`);
    continue;
  }
  let v; try { v = JSON.parse(crudo); } catch { console.log(`  ${k.padEnd(34)} ${crudo.slice(0, 60)}`); continue; }
  if (!Array.isArray(v)) { console.log(`  ${k.padEnd(34)} ${JSON.stringify(v).slice(0, 90)}`); continue; }

  const dias = v.map((o) => o.dia ?? o.entryDate ?? o.fecha).filter(Boolean).sort();
  const orig = {};
  for (const o of v) orig[o.origen ?? "SIN ORIGEN"] = (orig[o.origen ?? "SIN ORIGEN"] ?? 0) + 1;
  console.log(`  ${k}`);
  console.log(`      ${v.length} operaciones · ${dias[0] ?? "?"} → ${dias[dias.length - 1] ?? "?"} · ` +
              `${v.filter((o) => o.estado === "abierta").length} abiertas`);
  console.log(`      origen: ${Object.entries(orig).map(([a, b]) => `${a}=${b}`).join(" · ")}`);
  const ultimo = dias[dias.length - 1];
  const atras = ultimo ? Math.round((Date.parse(hoyET()) - Date.parse(ultimo)) / 86_400_000) : null;
  if (atras != null && atras > 4) { console.log(`      ⚠ la última operación es de hace ${atras} días`); avisos++; }

  // ¿QUÉ ES HISTORIA Y QUÉ ES UN FALLO DE VERDAD?
  //
  // Una fecha fija no vale. Las 7 operaciones que la Wheel escribió el 2026-08-14 no llevan
  // firma porque su contenedor corría un despliegue anterior al campo — es un hecho pasado que
  // ya NO se puede cambiar, y avisar de ello todos los días para siempre convierte el contador
  // en ruido. Pero tampoco se pueden ignorar sin más: mientras el servicio siga sin firmar,
  // sigue siendo un problema vivo.
  //
  // LO INTENTÉ Y ERA UN AVISO FALSO, así que se quita. La idea era: la primera operación FIRMADA
  // marca la frontera, y lo posterior sin firmar es un fallo vivo. Pero eso ordena por la fecha
  // de la SEÑAL (`entryDate`), no por cuándo se escribió el registro — y la Wheel rellena señales
  // históricas: las 24 que firmó el 2026-08-15 llevan fecha de entrada del 4 de agosto. Resultado:
  // 54 operaciones viejas parecían "posteriores a una firmada" y saltaba un fallo inexistente.
  //
  // Es la trampa de las etiquetas de tiempo otra vez: confundir la fecha del DATO con el momento
  // de ESCRIBIRLO. Los registros antiguos no guardan cuándo se escribieron, así que desde aquí no
  // hay forma honesta de decidirlo. Una comprobación que no se puede hacer fiable se QUITA, no se
  // deja gritando: el ruido de un monitor cuesta más que su silencio.
  //
  // La pregunta "¿está firmando ahora?" ya la contesta el LATIDO, que sí lleva su propia hora.
  // Aquí sólo se cuenta, y se avisa de lo único inequívoco: que no haya firmado NUNCA nada.
  const firmadas = v.filter((o) => o.origen).length;
  const sinFirmar = v.length - firmadas;
  if (sinFirmar) console.log(`      ${sinFirmar} sin firmar (de antes del campo "origen") · ${firmadas} firmadas`);
  if (firmadas === 0 && v.length > 0) {
    console.log(`      ⚠ NINGUNA operación firmada: no ha escrito nunca con el código nuevo`);
    avisos++;
  }
}

// FALLAR CERRADO. Si no se pudo mirar —Redis vacío, sin token— NO se dice que todo va bien: se
// dice que no se pudo comprobar. Un monitor que ante la duda dice "verde" es peor que ninguno.
const sinDatos = claves.length === 0;
console.log("");
console.log(sinDatos
  ? "❓ NO SE PUDO COMPROBAR — Redis no tiene ni una clave. ¿Es el Redis correcto?"
  : avisos === 0
    ? "✅ SISTEMA SANO — ningún fallo que arreglar"
    : `⚠ ${avisos} FALLO${avisos > 1 ? "S" : ""} DEL SISTEMA — hay algo que hacer`);
if (notas) console.log(`   (+ ${notas} notas de los forward-tests: información sobre las pruebas, no fallos)`);
if (!DESPLIEGUES) console.log("   (sin RAILWAY_TOKEN no he podido cruzar con lo que hay desplegado)");
await r.quit();
process.exit(avisos === 0 && !sinDatos ? 0 : 1);
