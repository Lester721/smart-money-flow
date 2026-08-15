// Espera al despliegue de un commit y luego lanza los cron uno a uno, validando cada uno.
import { execFileSync } from "node:child_process";
import Redis from "ioredis";
const T=process.env.RAILWAY_TOKEN, API="https://backboard.railway.com/graphql/v2";
const OBJ=process.argv[2];
const gql=async(q,v={})=>{const r=await fetch(API,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${T}`},body:JSON.stringify({query:q,variables:v}),signal:AbortSignal.timeout(30000)});
 const j=await r.json(); if(j.errors) throw new Error(j.errors.map(e=>e.message).join(" · ")); return j.data;};
const Q=`query { projects { edges { node { name services { edges { node { name
  serviceInstances { edges { node { id cronSchedule } } }
  deployments(first:1){edges{node{status meta}}} } } } } } } }`;
const crones=async()=>{const d=await gql(Q); const out=[];
 for(const {node:p} of d.projects.edges){ if(p.name!=="thriving-creation") continue;
  for(const {node:s} of p.services.edges){ const i=s.serviceInstances.edges[0]?.node; if(!i?.cronSchedule) continue;
   const dep=s.deployments.edges[0]?.node;
   out.push({nombre:s.name, inst:i.id, estado:dep?.status, commit:(dep?.meta?.commitHash||"").slice(0,8)}); } }
 return out;};
const r=new Redis(process.env.REDIS_URL,{maxRetriesPerRequest:3});
const espera=ms=>new Promise(x=>setTimeout(x,ms));

// 1) esperar a que los cuatro estén en OBJ
console.log(`esperando a que los 4 desplieguen ${OBJ}…`);
const t0=Date.now();
while(Date.now()-t0 < 25*60000){
  const c=await crones();
  const listos=c.filter(x=>x.estado==="SUCCESS"&&x.commit===OBJ);
  console.log(`  [${((Date.now()-t0)/60000).toFixed(1)} min] ${listos.length}/4 · `+c.map(x=>`${x.nombre.split("·").pop().trim()}=${x.estado==="SUCCESS"?x.commit:x.estado}`).join(" "));
  if(listos.length===4){ console.log("  todos desplegados\n"); break; }
  await espera(30000);
}

// 2) lanzarlos uno a uno
const ORDEN=[["Credit Spread","credit-spread"],["Ideas","ideas"],["Cóndor","gex-condor"],["Wheel","wheel"]];
for(const [busca,servicio] of ORDEN){
  // esperar candado libre
  while(await r.get("lock:theta")) { console.log(`  (esperando: candado de ${await r.get("lock:theta")})`); await espera(20000); }
  const antes=await r.get(`latido:${servicio}`);
  const tsAntes=antes?Date.parse(JSON.parse(antes).cuandoISO):0;
  console.log(`\n▶ lanzando ${busca}…`);
  try { execFileSync("node",["--env-file=.env.local","scripts/railway-run.mjs",busca],{encoding:"utf8",stdio:"inherit"}); }
  catch(e){ console.log(`  ✗ no se pudo lanzar: ${e.message.slice(0,80)}`); continue; }
  const t1=Date.now(); let ok=false;
  while(Date.now()-t1 < 40*60000){
    await espera(15000);
    const raw=await r.get(`latido:${servicio}`);
    if(raw){ const L=JSON.parse(raw);
      if(Date.parse(L.cuandoISO)>tsAntes){ console.log(`  ✅ ${servicio}: ${L.origen} ${String(L.commit).slice(0,8)} · ${L.resultado}`); ok=true; break; } }
  }
  if(!ok) console.log(`  ✗ ${servicio}: sin latido nuevo en 40 min`);
}
await r.quit();
console.log("\n=== CICLO COMPLETO ===");
