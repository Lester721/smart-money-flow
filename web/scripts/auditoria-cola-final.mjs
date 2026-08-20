import { readFileSync } from "node:fs";
import { cargar, resumen, drawdown, eur, media } from "./anatomia3-lib.mjs";
import { tWelch, listonT } from "../lib/barreraHallazgos";
const { filas } = cargar();
filas.sort((a,b)=>a.fecha.localeCompare(b.fecha));
const N=filas.length;
const src=readFileSync("scripts/regimen-fomc.mjs","utf8"), i0=src.indexOf("const FOMC = new Set([");
const FOMC=new Set(src.slice(i0,src.indexOf("]);",i0)).match(/\d{4}-\d{2}-\d{2}/g)||[]);
const mes=f=>f.fecha.slice(0,7);
for(let i=0;i<N;i++){const f=filas[i];let u=0;for(let k=i+1;k<N&&mes(filas[k])===mes(f);k++)u++;
  f.posFin=filas.some(g=>mes(g)>mes(f))?u:null; f.cFomc=FOMC.has(f.fecha)?1:0;
  f.cUlt2=(f.posFin!=null&&f.posFin<=1)?1:0; f.marcado=(f.cUlt2||f.cFomc)?1:0; f.ano=f.fecha.slice(0,4);}
const pc=x=>(x*100).toFixed(0)+"%";

console.log("═".repeat(120));
console.log("A · LA COLA DEL ÚLTIMO DÍA DEL MES: los 6 días que sostienen el z=3,32");
console.log("═".repeat(120));
const colaFin = filas.filter(f=>f.posFin===0 && f.pl<-2000);
for (const f of colaFin) console.log(`   ${f.fecha}  ${eur(f.pl)}`);
console.log(`  reparto por año: ` + ["2024","2025","2026"].map(a=>`${a}: ${colaFin.filter(f=>f.ano===a).length}`).join(" · "));
console.log(`  últimos días del mes por año: ` + ["2024","2025","2026"].map(a=>`${a}: ${filas.filter(f=>f.posFin===0&&f.ano===a).length}`).join(" · "));
// z quitando los k eventos más recientes / más antiguos
for (const [nom, sub] of [["TODO", filas], ["sólo 2024-2025", filas.filter(f=>f.ano<"2026")], ["sólo 2025-2026", filas.filter(f=>f.ano>="2025")], ["sólo 2026", filas.filter(f=>f.ano==="2026")]]) {
  const si=sub.filter(f=>f.posFin===0), no=sub.filter(f=>f.posFin!==0);
  if(!si.length) continue;
  const kS=si.filter(f=>f.pl<-2000).length, p0=no.filter(f=>f.pl<-2000).length/no.length;
  const z=(kS/si.length-p0)/Math.sqrt(p0*(1-p0)/si.length);
  console.log(`  ${nom.padEnd(16)} n=${String(si.length).padStart(3)} cola ${kS} (${pc(kS/si.length)}) vs ${pc(p0)} → z=${z.toFixed(2)}`);
}

console.log("\n" + "═".repeat(120));
console.log("B · ¿REDUCE LA CAÍDA DENTRO DE CADA AÑO? (la caída es un estadístico de CAMINO)");
console.log("═".repeat(120));
console.log("| tramo | días | caída base | caída filtrada | caída eliminada | % |");
console.log("|---|---|---|---|---|---|");
for (const [nom,sub] of [["2024",filas.filter(f=>f.ano==="2024")],["2025",filas.filter(f=>f.ano==="2025")],["2026 (a 10-ago)",filas.filter(f=>f.ano==="2026")],
                          ["1ª mitad",filas.slice(0,Math.floor(N/2))],["2ª mitad",filas.slice(Math.floor(N/2))],["TODO",filas]]) {
  const b=drawdown(sub.map(f=>f.pl)), fl=drawdown(sub.map(f=>f.marcado?0:f.pl));
  console.log(`| ${nom} | ${sub.length} | ${eur(b)} | ${eur(fl)} | ${eur(Math.abs(b)-Math.abs(fl))} | ${((Math.abs(b)-Math.abs(fl))/Math.abs(b)*100).toFixed(0)}% |`);
}

console.log("\n" + "═".repeat(120));
console.log("C · ¿DE DÓNDE SALE LA CAÍDA ELIMINADA? el camino de la peor racha, día a día");
console.log("═".repeat(120));
let acc=0,pico=0,peor=0,iIni=0,iFin=0,picoI=0;
filas.forEach((f,i)=>{acc+=f.pl; if(acc>pico){pico=acc;picoI=i;} if(acc-pico<peor){peor=acc-pico;iIni=picoI;iFin=i;}});
console.log(`  la PEOR RACHA va de ${filas[iIni].fecha} a ${filas[iFin].fecha} (${iFin-iIni} días) y vale ${eur(peor)}`);
const tramo=filas.slice(iIni+1,iFin+1);
const marcTramo=tramo.filter(f=>f.marcado);
console.log(`  días marcados DENTRO de ese tramo: ${marcTramo.length} de ${tramo.length} · suman ${eur(marcTramo.reduce((a,f)=>a+f.pl,0))}`);
for (const f of marcTramo.sort((a,b)=>a.pl-b.pl).slice(0,6)) console.log(`     ${f.fecha}  ${eur(f.pl)}  ${f.cUlt2?"últimos2 ":""}${f.cFomc?"FOMC":""}`);

console.log("\n" + "═".repeat(120));
console.log("D · ¿AGUANTA EL 'SUBE EL INGRESO' SI SE QUITA UN AÑO?  (dejar-uno-fuera)");
console.log("═".repeat(120));
console.log("| se quita | $/año base | $/año filtrado | ganancia | t de la media |");
console.log("|---|---|---|---|---|");
for (const a of ["nada","2024","2025","2026"]) {
  const g = a==="nada"?filas:filas.filter(f=>f.ano!==a);
  const anos=g.length/251;
  const b=resumen(g,anos), fl=resumen(g.filter(f=>!f.marcado),anos);
  const t=tWelch(g.filter(f=>f.marcado).map(f=>f.pl), g.filter(f=>!f.marcado).map(f=>f.pl));
  console.log(`| ${a} | ${eur(b.alAno)} | ${eur(fl.alAno)} | ${eur(fl.alAno-b.alAno)} | ${t.toFixed(2)} |`);
}
console.log(`\n  listón |t| con 26 pruebas: ${listonT(26)} · con las ~200 del proyecto sobre estos mismos días: ${listonT(200)}`);
