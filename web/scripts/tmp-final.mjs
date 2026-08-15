// Cierre definitivo: espera el despliegue bueno de Ideas, la lanza, valida los cuatro y avisa.
import { execFileSync } from "node:child_process";
import Redis from "ioredis";
const T=process.env.RAILWAY_TOKEN, API="https://backboard.railway.com/graphql/v2", OBJ=process.argv[2];
const gql=async(q)=>{const r=await fetch(API,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${T}`},body:JSON.stringify({query:q}),signal:AbortSignal.timeout(30000)});
 const j=await r.json(); if(j.errors) throw new Error(j.errors.map(e=>e.message).join(" · ")); return j.data;};
const Q=`query { projects { edges { node { name services { edges { node { name deployments(first:1){edges{node{status meta}}} } } } } } } }`;
const esp=ms=>new Promise(x=>setTimeout(x,ms));
const ideas=async()=>{const d=await gql(Q);
 for(const {node:p} of d.projects.edges){ if(p.name!=="thriving-creation") continue;
  for(const {node:s} of p.services.edges) if(s.name.includes("Ideas")){const dp=s.deployments.edges[0]?.node;
   return {e:dp?.status,c:(dp?.meta?.commitHash||"").slice(0,8)};} } return null;};
const r=new Redis(process.env.REDIS_URL,{maxRetriesPerRequest:3});

const t0=Date.now();
while(Date.now()-t0 < 20*60000){
  const s=await ideas(); console.log(`  [${((Date.now()-t0)/60000).toFixed(1)}m] Ideas ${s?.e} ${s?.c}`);
  if(s?.e==="SUCCESS" && s.c===OBJ) break;
  await esp(30000);
}
while(await r.get("lock:theta")) { console.log("  esperando la sesion…"); await esp(20000); }
console.log("lanzando Ideas…");
try { execFileSync("node",["--env-file=.env.local","scripts/railway-run.mjs","Ideas"],{stdio:"inherit"}); } catch {}
const d0=Date.now();
while(Date.now()-d0 < 10*60000){ await esp(15000);
  const raw=await r.get("latido:ideas");
  if(raw && Date.parse(JSON.parse(raw).cuandoISO)>d0-60000) break; }

const filas=[];
for(const s of ["gex-condor","credit-spread","wheel","ideas"]){
  const raw=await r.get(`latido:${s}`); const L=raw?JSON.parse(raw):null;
  filas.push(L?`${s}: ${L.cuandoET} ${String(L.commit).slice(0,8)} [${L.origen}]\n   ${L.resultado.slice(0,92)}`:`${s}: SIN LATIDO`);
}
await r.quit();
let comp=""; try{comp=execFileSync("node",["--env-file=.env.local","scripts/estado-railway.mjs"],{encoding:"utf8"});}catch(e){comp=(e.stdout||"")+(e.stderr||"");}
const v=(comp.match(/(SISTEMA SANO[^\n]*|⚠ \d+ FALLOS?[^\n]*|NO SE PUDO COMPROBAR[^\n]*)/)||["(sin veredicto)"])[0];
const cuerpo=`LOS CUATRO CRON — CIERRE FINAL\n\n${filas.join("\n")}\n\n${v}`;
console.log(cuerpo);
try{execFileSync("node",["--env-file=.env.local","scripts/telegram.mjs","--enviar",cuerpo],{stdio:"inherit"});}catch{}
