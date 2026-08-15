// Espera al despliegue de Ideas, la lanza, y avisa por Telegram con el estado FINAL de los cuatro.
import { execFileSync } from "node:child_process";
import Redis from "ioredis";
const T=process.env.RAILWAY_TOKEN, API="https://backboard.railway.com/graphql/v2";
const OBJ=process.argv[2];
const gql=async(q)=>{const r=await fetch(API,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${T}`},body:JSON.stringify({query:q}),signal:AbortSignal.timeout(30000)});
 const j=await r.json(); if(j.errors) throw new Error(j.errors.map(e=>e.message).join(" · ")); return j.data;};
const Q=`query { projects { edges { node { name services { edges { node { name deployments(first:1){edges{node{status meta}}} } } } } } } }`;
const espera=ms=>new Promise(x=>setTimeout(x,ms));
const estadoIdeas=async()=>{const d=await gql(Q);
 for(const {node:p} of d.projects.edges){ if(p.name!=="thriving-creation") continue;
  for(const {node:s} of p.services.edges) if(s.name.includes("Ideas")){const dep=s.deployments.edges[0]?.node;
   return {estado:dep?.status, commit:(dep?.meta?.commitHash||"").slice(0,8)};} } return null;};

console.log(`esperando que Ideas despliegue ${OBJ}…`);
const t0=Date.now();
while(Date.now()-t0 < 20*60000){
  const e=await estadoIdeas();
  console.log(`  [${((Date.now()-t0)/60000).toFixed(1)} min] ${e?.estado} ${e?.commit}`);
  if(e?.estado==="SUCCESS" && e.commit===OBJ) break;
  await espera(30000);
}
console.log("lanzando Ideas…");
try { execFileSync("node",["--env-file=.env.local","scripts/railway-run.mjs","Ideas"],{stdio:"inherit"}); } catch(e){ console.log("no se pudo lanzar"); }

const r=new Redis(process.env.REDIS_URL,{maxRetriesPerRequest:3});
const desde=Date.now();
while(Date.now()-desde < 15*60000){
  await espera(15000);
  const raw=await r.get("latido:ideas");
  if(raw && Date.parse(JSON.parse(raw).cuandoISO)>desde-60000) break;
}
const filas=[];
for(const s of ["gex-condor","credit-spread","wheel","ideas"]){
  const raw=await r.get(`latido:${s}`);
  filas.push(raw ? `${s}: ${JSON.parse(raw).cuandoET} ${String(JSON.parse(raw).commit).slice(0,8)}\n   ${JSON.parse(raw).resultado.slice(0,90)}` : `${s}: SIN LATIDO`);
}
await r.quit();
let comp=""; try { comp=execFileSync("node",["--env-file=.env.local","scripts/estado-railway.mjs"],{encoding:"utf8"}); }
catch(e){ comp=(e.stdout||"")+(e.stderr||""); }
const veredicto=(comp.match(/(SISTEMA SANO.*|FALLOS? DEL SISTEMA.*|NO SE PUDO COMPROBAR.*)/)||["(sin veredicto)"])[0];
const cuerpo=`LOS CUATRO CRON, ESTADO FINAL\n\n${filas.join("\n")}\n\nVEREDICTO: ${veredicto}`;
console.log(cuerpo);
try { execFileSync("node",["--env-file=.env.local","scripts/telegram.mjs","--enviar",cuerpo],{stdio:"inherit"}); } catch {}
