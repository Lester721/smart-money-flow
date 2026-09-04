// RELLENAR UN DIA PERDIDO EN UN FORWARD TEST DE RAILWAY.
//
//   node --env-file=.env.local scripts/rellenar-dias.mjs --ver
//   node --env-file=.env.local scripts/rellenar-dias.mjs --aplicar
//
// DOS TRAMPAS QUE ME COMI EL 2026-09-04, LAS DOS EN LA MISMA TARDE:
//
// 1. "Run now" (deploymentInstanceExecutionCreate) ejecuta el comando en el contenedor QUE YA
//    ESTA VIVO, con el entorno con el que arranco. Una variable puesta por API NO llega al
//    proceso. Once corridas dijeron OK y las once procesaron el mismo dia. Hay que REDESPLEGAR
//    (serviceInstanceRedeploy): eso arranca un contenedor nuevo que si lee la variable.
//
// 2. Di once corridas por buenas porque el LATIDO CAMBIO y no empezaba por "NO CORRIO". Cambiar
//    no es acertar. Ahora se comprueba EL DIA: se lee el estado del cuaderno en Redis y se exige
//    que haya avanzado al dia PEDIDO. Si no, es un fallo, por muy verde que se vea el latido.

const T = process.env.RAILWAY_TOKEN, API = "https://backboard.railway.com/graphql/v2";
const APLICAR = process.argv.includes("--aplicar");
if (!T) { console.error("Falta RAILWAY_TOKEN en web/.env.local"); process.exit(1); }

async function gql(q, v = {}) {
  const r = await fetch(API, { method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + T },
    body: JSON.stringify({ query: q, variables: v }), signal: AbortSignal.timeout(60000) });
  const t = await r.text(); let j;
  try { j = JSON.parse(t); } catch { throw new Error("no-JSON: " + t.slice(0, 200)); }
  if (j.errors?.length) throw new Error(j.errors.map((e) => e.message).join(" · "));
  return j.data;
}

const Redis = (await import("ioredis")).default;
const rd = new Redis(process.env.REDIS_URL); rd.on("error", () => {});
const dormir = (s) => new Promise((r) => setTimeout(r, s * 1000));

// Cada cuaderno guarda el dia a su manera: leerlo con el nombre del vecino devuelve VACIO, no un
// error. Por eso cada uno trae su propio lector, y se prueba con el estado de antes de tocar nada.
const PLAN = [
  // VACIO A PROPOSITO. El 2026-09-02 se perdio en el Missile y en los dos combinados, y NO se
  // puede rellenar: sus punteros ya van por el 03, y procesar el 02 ahora gestionaria posiciones
  // abiertas el 03 con precios del 02. Saldrian numeros, y serian inventados. Un dia de menos,
  // dicho, vale mas que un dia de mas, falso. Los cuadernos ya lo rechazan solos.
  //
  // Formato, para cuando haga falta de verdad (y solo hacia ADELANTE):
  //   { svc: "Forward · Combinado 6x4", vr: "COMBI_DIA", clave: "forward:combinado-6x4",
  //     dias: ["20260908"], tiene: (e, d) => String(e.ultimoDia ?? "") === d },
];

const d0 = await gql(`query { projects { edges { node { id name environments { edges { node { id name } } }
  services { edges { node { id name } } } } } } }`);
const P = d0.projects.edges.map((e) => e.node).find((p) => p.name === "thriving-creation");
const ENV = P.environments.edges.map((e) => e.node).find((e) => e.name === "production");
const SV = P.services.edges.map((e) => e.node);

const leer = async (k) => { const r = await rd.get(k); try { return JSON.parse(r); } catch { return null; } };

console.log("\n  RELLENO DE DIAS PERDIDOS" + (APLICAR ? "" : "   (ensayo)"));
for (const p of PLAN) {
  const e = await leer(p.clave);
  const ya = p.dias.every((d) => e && p.tiene(e, d));
  console.log("   " + p.svc.padEnd(26) + p.vr.padEnd(13) + p.dias.join(" ") + (ya ? "   (ya lo tiene)" : ""));
}
if (!APLICAR) { console.log("\n  De verdad: --aplicar\n"); await rd.quit(); process.exit(0); }

async function estado(sid) {
  const q = await gql(`query($p:String!,$s:String!){ deployments(first:1, input:{projectId:$p, serviceId:$s}){ edges { node { status } } } }`, { p: P.id, s: sid });
  return q.deployments.edges[0]?.node?.status ?? "?";
}
async function esperarDespliegue(sid, maxS = 900) {
  await dormir(15);
  for (let t = 0; t < maxS; t += 15) {
    const e = await estado(sid);
    if (e === "SUCCESS") return true;
    if (e === "CRASHED" || e === "FAILED") return false;
    await dormir(15);
  }
  return false;
}
async function redesplegar(sid) {
  await gql(`mutation($e:String!,$s:String!){ serviceInstanceRedeploy(environmentId:$e, serviceId:$s) }`,
    { e: ENV.id, s: sid });
}

let bien = 0; const mal = [];
for (const p of PLAN) {
  const s = SV.find((x) => x.name === p.svc);
  if (!s) { mal.push(p.svc + ": no existe"); continue; }

  for (const dia of p.dias) {
    console.log("\n  ── " + p.svc + "  ·  dia " + dia + " ──");
    const antes = await leer(p.clave);
    if (antes && p.tiene(antes, dia)) { console.log("     ya lo tenia, no toco nada"); bien++; continue; }

    await gql(`mutation($in: VariableUpsertInput!){ variableUpsert(input:$in) }`,
      { in: { projectId: P.id, environmentId: ENV.id, serviceId: s.id, name: p.vr, value: dia } });
    console.log("     " + p.vr + "=" + dia + " puesta; redesplegando (el contenedor nuevo SI la lee)");

    try {
      await redesplegar(s.id);
      const ok = await esperarDespliegue(s.id);
      console.log("     despliegue: " + (ok ? "SUCCESS" : "FALLO"));

      // LA COMPROBACION QUE IMPORTA: ¿avanzo al dia PEDIDO?
      let logrado = false;
      for (let t = 0; t < 600; t += 15) {
        await dormir(15);
        const e = await leer(p.clave);
        if (e && p.tiene(e, dia)) { logrado = true; break; }
      }
      if (logrado) { console.log("     ✅ el cuaderno YA tiene el dia " + dia); bien++; }
      else { console.log("     ⛔ el dia " + dia + " NO entro"); mal.push(p.svc + " " + dia + ": no entro"); }
    } finally {
      await gql(`mutation($in: VariableDeleteInput!){ variableDelete(input:$in) }`,
        { in: { projectId: P.id, environmentId: ENV.id, serviceId: s.id, name: p.vr } }).catch(() => {});
      console.log("     " + p.vr + " quitada, redesplegando limpio");
      await redesplegar(s.id).catch(() => {});
      await esperarDespliegue(s.id);
    }
  }
}

console.log("\n  ══ RESULTADO ══\n  dias metidos: " + bien);
if (mal.length) { console.log("  ⛔ " + mal.length + " fallos:"); for (const m of mal) console.log("     " + m); }
else console.log("  ✅ sin fallos");
await rd.quit();
