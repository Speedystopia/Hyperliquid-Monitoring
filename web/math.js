'use strict';
(function(root){
 const HOUR=3600000, SCALE=10n**24n;
 function decimal(s){
  if(typeof s!=='string'||!/^[-+]?\d+(\.\d+)?$/.test(s))return null;
  const neg=s.startsWith('-');s=s.replace(/^[-+]/,'');const [a,b='']=s.split('.');
  if(b.length>24)return null;
  const n=BigInt(a)*SCALE+BigInt(b.padEnd(24,'0'));return neg?-n:n;
 }
 function fixed(n,digits=8){
  if(n===null)return '—';const neg=n<0n;n=neg?-n:n;const divisor=10n**BigInt(24-digits);
  const rounded=(n+divisor/2n)/divisor, unit=10n**BigInt(digits);
  return (neg&&rounded?'-':'')+(rounded/unit).toString()+(digits?'.'+(rounded%unit).toString().padStart(digits,'0'):'');
 }
 function weighted(rows,key){let sum=0n,size=0n;for(const r of rows){const p=decimal(r[key]),s=decimal(r.size);if(p===null||s===null)continue;const w=s<0n?-s:s;sum+=p*w;size+=w;}return size?sum/size:null;}
 function received(rows){let sum=0n;for(const r of rows){const n=decimal(r.fundingPaidSinceOpen);if(n===null)return null;sum-=n;}return sum;}
 function aggregateFunding(rows,hours){
  const span=hours*HOUR,map=new Map();
  for(const r of rows){const end=Math.ceil(r.time/span)*span;let b=map.get(end);if(!b){b={time:end,value:0,seen:new Set()};map.set(end,b);}if(!b.seen.has(r.time)){b.value+=r.fundingRate;b.seen.add(r.time);}}
  return [...map.values()].filter(b=>b.seen.size===hours).map(b=>({time:b.time,value:b.value*100})).sort((a,b)=>a.time-b.time);
 }
 function positionSummary(positions,market){const rows=positions.filter(p=>p.market===market);return {rows,entry:weighted(rows,'entryPrice'),liquidation:weighted(rows,'liquidationPrice'),funding:received(rows),long:weighted(rows.filter(r=>decimal(r.size)>0n),'entryPrice'),short:weighted(rows.filter(r=>decimal(r.size)<0n),'entryPrice')};}
 function selectWindow(rows,start,end){return rows.filter(r=>r.time>start&&r.time<=end);}
 function priceStats(rows,start,end){
  const selected=selectWindow(rows,start,end),latest=selected.at(-1);
  if(!latest)return {latest:null,average:null,change:null,count:0};
  let baseline=selected[0];for(const r of rows){if(r.time<=start)baseline=r;else break;}
  return {latest,average:selected.reduce((total,r)=>total+r.value,0)/selected.length,change:baseline.value>0?(latest.value/baseline.value-1)*100:null,count:selected.length};
 }
 function fundingStats(rows){
  if(!rows.length)return {annualized:null,total:null,rolling:null,count:0,days:0,partial:true};
  const latest=rows.at(-1).time,cutoff=latest-365*24*HOUR;let total=0,rolling=0;
  for(const r of rows){total+=r.fundingRate;if(r.time>cutoff)rolling+=r.fundingRate;}
  const duration=latest-rows[0].time+HOUR;
  return {annualized:total/rows.length*365*24*100,total:total*100,rolling:rolling*100,count:rows.length,days:duration/(24*HOUR),partial:duration<365*24*HOUR};
 }
 function correlation(a,b){
  const byTime=new Map(b.map(p=>[p.time,p.value]));let n=0,meanX=0,meanY=0,xx=0,yy=0,xy=0,first=null,last=null;
  for(const p of a){const q=byTime.get(p.time);if(!Number.isFinite(p.value)||!Number.isFinite(q))continue;
   n++;const dx=p.value-meanX,dy=q-meanY;meanX+=dx/n;meanY+=dy/n;xx+=dx*(p.value-meanX);yy+=dy*(q-meanY);xy+=dx*(q-meanY);first??=p.time;last=p.time;
  }
  return {percent:n>=2&&xx>0&&yy>0?Math.max(-1,Math.min(1,xy/Math.sqrt(xx*yy)))*100:null,count:n,first,last};
 }
 const api={HOUR,SCALE,decimal,fixed,weighted,received,aggregateFunding,positionSummary,fundingStats,correlation,selectWindow,priceStats};
 if(typeof module!=='undefined')module.exports=api;else root.OilMath=api;
})(globalThis);
