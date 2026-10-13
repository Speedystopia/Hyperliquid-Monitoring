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
  for(const r of rows){const interval=r.intervalHours||1,end=Math.ceil(r.time/span)*span;let b=map.get(end);if(!b){b={time:end,value:0,hours:0,seen:new Set(),valid:true};map.set(end,b);}if(!b.seen.has(r.time)){b.value+=r.fundingRate;b.hours+=interval;b.valid&&=r.time-interval*HOUR>=end-span;b.seen.add(r.time);}}
  return [...map.values()].filter(b=>b.valid&&b.hours===hours).map(b=>({time:b.time,value:b.value*100})).sort((a,b)=>a.time-b.time);
 }
 function positionSummary(positions,market){const rows=positions.filter(p=>p.market===market);return {rows,entry:weighted(rows,'entryPrice'),liquidation:weighted(rows,'liquidationPrice'),funding:received(rows),long:weighted(rows.filter(r=>decimal(r.size)>0n),'entryPrice'),short:weighted(rows.filter(r=>decimal(r.size)<0n),'entryPrice')};}
 function indexAfter(rows,time){let low=0,high=rows.length;while(low<high){const middle=(low+high)>>>1;if(rows[middle].time<=time)low=middle+1;else high=middle;}return low;}
 function selectWindow(rows,start,end){return rows.slice(indexAfter(rows,start),indexAfter(rows,end));}
 function priceStats(rows,start,end){
  const selected=selectWindow(rows,start,end),latest=selected.at(-1);
  if(!latest)return {latest:null,average:null,change:null,count:0};
  const baseline=rows[indexAfter(rows,start)-1]||selected[0];
  return {latest,average:selected.reduce((total,r)=>total+r.value,0)/selected.length,change:baseline.value>0?(latest.value/baseline.value-1)*100:null,count:selected.length};
 }
 function fundingStats(rows){
  if(!rows.length)return {annualized:null,total:null,rolling:null,count:0,hours:0,days:0,partial:true};
  const latest=rows.at(-1).time,cutoff=latest-365*24*HOUR;let total=0,rolling=0,hours=0;
  for(const r of rows){total+=r.fundingRate;hours+=r.intervalHours||1;if(r.time>cutoff)rolling+=r.fundingRate;}
  const duration=latest-rows[0].time+(rows[0].intervalHours||1)*HOUR;
  return {annualized:total/hours*365*24*100,total:total*100,rolling:rolling*100,count:rows.length,hours,days:duration/(24*HOUR),partial:duration<365*24*HOUR};
 }
 function correlation(a,b){
  const byTime=new Map(b.map(p=>[p.time,p.value]));let n=0,meanX=0,meanY=0,xx=0,yy=0,xy=0,first=null,last=null;
  for(const p of a){const q=byTime.get(p.time);if(!Number.isFinite(p.value)||!Number.isFinite(q))continue;
   n++;const dx=p.value-meanX,dy=q-meanY;meanX+=dx/n;meanY+=dy/n;xx+=dx*(p.value-meanX);yy+=dy*(q-meanY);xy+=dx*(q-meanY);first??=p.time;last=p.time;
  }
  return {percent:n>=2&&xx>0&&yy>0?Math.max(-1,Math.min(1,xy/Math.sqrt(xx*yy)))*100:null,count:n,first,last};
 }
 function priceReturns(rows,span){
  const out=[];for(let i=1;i<rows.length;i++){const a=rows[i-1],b=rows[i];
   if(b.time-a.time===span&&Number.isFinite(a.value)&&a.value>0&&Number.isFinite(b.value))out.push({time:b.time,value:(b.value/a.value-1)*100});
  }return out;
 }
 function correlationMatrix(series,span,start,end,mode='returns'){
  // A return uses only adjacent native candles, never bridges a missing interval.
  const selected=series.map(s=>selectWindow(mode==='returns'?priceReturns(s.price,span):s.price,start,end));
  const cells=series.map(()=>Array(series.length));
  for(let i=0;i<series.length;i++)for(let j=i;j<series.length;j++){
   const result=correlation(selected[i],selected[j]);if(result.count<3)result.percent=null;
   cells[i][j]=result;cells[j][i]=result;
  }
  return cells;
 }
 function oppositeFundingPairs(cells,stats){
  const pairs=[];
  for(let i=0;i<stats.length;i++)for(let j=i+1;j<stats.length;j++){
   const a=stats[i].annualized,b=stats[j].annualized,c=cells[i]?.[j];
   if(Number.isFinite(a)&&Number.isFinite(b)&&c&&Number.isFinite(c.percent)&&c.percent>0&&c.count>=3&&((a>0&&b<0)||(a<0&&b>0)))pairs.push({i,j,...c,netAnnualized:a-b});
  }
  return pairs.sort((a,b)=>b.percent-a.percent);
 }
 function fundingNetBand(net,benchmark){
  if(!Number.isFinite(net)||!Number.isFinite(benchmark))return 'unknown';
  const difference=net-benchmark;
  return difference<=-1?'below':difference>=1?'above':'near';
 }
 const api={HOUR,SCALE,decimal,fixed,weighted,received,aggregateFunding,positionSummary,fundingStats,correlation,selectWindow,priceStats,indexAfter,priceReturns,correlationMatrix,oppositeFundingPairs,fundingNetBand};
 if(typeof module!=='undefined')module.exports=api;else root.OilMath=api;
})(globalThis);
