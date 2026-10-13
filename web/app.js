'use strict';
const M=OilMath,C=OilCatalog,$=s=>document.querySelector(s),colors=['#f6b66b','#61c9ef'];
let markets=['BRENTOIL','WTIOIL'],route='home';
const L=OilI18n.translate;
let history=null,account=null,chosenAddress='',frame='4h',view=null,series=[],lastAccountVersion=null,startupLoaded=false;
let publicPrices=null,publicError='';
let seriesSource=null,analysisCache=null,summarySource=null,summaryCache=[],levelSource=null,levelCache=[],lastStatusText=null,lastSuccess=null,annualStats=[];
const frameCache=new Map(),historyClient=OilUpdates.createHistoryClient(fetch,data=>data?.schemaVersion===3&&C.keys.every(m=>['fundingHourly','close4h','close1d'].every(k=>Array.isArray(data.markets?.[m]?.[k]?.rows))));
const publicPriceClient=OilUpdates.createHistoryClient((path,options)=>fetch('/api/public-prices',options),data=>data?.schemaVersion===1&&data.markets&&Object.values(data.markets).every(m=>Array.isArray(m.close1d?.rows)));
const names=Object.fromEntries(C.keys.map(m=>[m,C.assets[m].name])),unit=m=>C.assets[m].unit||'USD',precision=m=>C.assets[m].precision||(m==='EURUSD'?5:2),step=()=>frame==='4h'?4*M.HOUR:24*M.HOUR;
let formatterLocale='';const numberFormats=new Map(),dateFormats=new Map();
function prepareFormats(){if(formatterLocale!==OilI18n.locale){formatterLocale=OilI18n.locale;numberFormats.clear();dateFormats.clear();}}
const fmt=(n,d=2)=>{if(!Number.isFinite(n))return '—';prepareFormats();if(!numberFormats.has(d))numberFormats.set(d,new Intl.NumberFormat(formatterLocale,{minimumFractionDigits:d,maximumFractionDigits:d}));return numberFormats.get(d).format(n);};
const date=(t,short=false)=>{prepareFormats();const zone=$('#timezone').value,key=zone+short;if(!dateFormats.has(key))dateFormats.set(key,new Intl.DateTimeFormat(formatterLocale,{timeZone:zone==='UTC'?'UTC':undefined,day:'2-digit',month:'2-digit',year:short?undefined:'numeric',hour:'2-digit',minute:short?undefined:'2-digit'}));return dateFormats.get(key).format(t);};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function get(path,signal){const r=await fetch(path,{cache:'no-store',signal});if(!r.ok)throw new Error('HTTP '+r.status);if(signal?.aborted)throw new DOMException('Aborted','AbortError');return r.json();}
function buildSeries(){
 if(!history||route==='home'||route==='global')return;
 if(seriesSource!==history){seriesSource=history;frameCache.clear();analysisCache=null;annualStats=[];}
 series=markets.map((m,i)=>{const key=m+'|'+frame;if(!frameCache.has(key)){const d=history.markets[m];frameCache.set(key,{name:names[m],market:m,funding:M.aggregateFunding(d.fundingHourly.rows,frame==='4h'?4:24),price:d[frame==='4h'?'close4h':'close1d'].rows.map(r=>({time:r.time,value:r.close}))});}return {...frameCache.get(key),color:colors[i]};});if(!annualStats.length)annualStats=markets.map(m=>M.fundingStats(history.markets[m].fundingHourly.rows));
 $('#funding-frame').textContent=L('/ '+(frame==='4h'?'4H':'1D'));const units=[...new Set(markets.map(unit))].join(' · ');$('#price-unit').textContent=units;$('#combined-unit').textContent=L('Gauche : funding % · Droite : prix ')+units;
 renderMetrics();renderInsights();renderCoverage();
}
function selectedWindow(){
 const all=markets.flatMap(m=>[history.markets[m].fundingHourly.rows,history.markets[m][frame==='4h'?'close4h':'close1d'].rows]);
 const nonempty=all.filter(r=>r.length),end=nonempty.length?Math.max(...nonempty.map(r=>r.at(-1).time)):Date.now(),first=nonempty.length?Math.min(...nonempty.map(r=>r[0].time)):end,days=Number($('#range').value);
 return {start:days?end-days*24*M.HOUR:first-M.HOUR,end,label:days?days+' jours':'Tout l’historique'};
}
function selectedAnalysis(){
 const days=$('#range').value;if(analysisCache?.source===history&&analysisCache.frame===frame&&analysisCache.days===days)return analysisCache;
 const window=selectedWindow(),data=series.map(s=>{const rows=M.selectWindow(history.markets[s.market].fundingHourly.rows,window.start,window.end);return {funding:M.fundingStats(rows),first:rows[0]?.time,last:rows.at(-1)?.time,price:M.priceStats(s.price,window.start,window.end)};});
 const correlation=M.correlation(M.selectWindow(series[0].price,window.start,window.end),M.selectWindow(series[1].price,window.start,window.end));
 analysisCache={source:history,frame,days,window,data,correlation};return analysisCache;
}
function renderMetrics(){
 if(!history||!series.length)return;const analysis=selectedAnalysis(),window=analysis.window;
 $('#metrics').innerHTML=series.flatMap((s,i)=>{
  const {price,funding,first,last}=analysis.data[i],digits=precision(s.market),quoteUnit=unit(s.market),cls=i===0?'brent-text':'wti-text';
  return [`<div class="metric"><label><a class="market-link" href="https://app.hyperliquid.xyz/trade/${C.assets[s.market].link}" target="_blank" rel="noopener noreferrer">${s.name} ↗</a> · clôture ${frame==='4h'?'4H':'daily'}</label><strong class="${cls}">${price.latest?fmt(price.latest.value,digits):'—'} <small>${quoteUnit}</small></strong><small>${price.latest?date(price.latest.time):'Aucune donnée'}</small><p class="hint">${window.label} · Moyenne des clôtures : ${fmt(price.average,digits)} ${quoteUnit}<br>Variation du prix : ${fmt(price.change)} %</p></div>`,
   `<div class="metric"><label>${s.name} · funding cumulé · ${window.label}</label><strong class="${cls}">${fmt(funding.total,5)} <small>%</small></strong><small>${first?date(first)+' → '+date(last):'Aucune donnée'}</small><p class="hint">${funding.count.toLocaleString(OilI18n.locale)} paiements · ${funding.hours.toLocaleString(OilI18n.locale)} heures couvertes · ${fmt(funding.days,1)} jours observés</p></div>`];
 }).join('');OilI18n.tree($('#metrics'));
}
function renderInsights(){
 if(!history||!series.length)return;const analysis=selectedAnalysis(),window=analysis.window;
 const cards=markets.map((m,i)=>{const f=analysis.data[i].funding;return `<div class="metric"><label>${names[m]} · funding annualisé réalisé</label><strong class="${i?'wti-text':'brent-text'}">${fmt(f.annualized,3)} <small>% / an</small></strong><p class="hint">Période sélectionnée : ${window.label}<br>Somme des paiements / ${f.hours.toLocaleString(OilI18n.locale)} heures couvertes × 8 760<br>Funding cumulé sur la période : <b>${fmt(f.total,3)} %</b><br>${fmt(f.days,1)} jours observés</p></div>`;});
 const corr=analysis.correlation;cards.push(`<div class="metric correlation"><label>Corrélation des prix ${names[markets[0]]} / ${names[markets[1]]} · ${frame==='4h'?'4H':'Daily'}</label><strong>${fmt(corr.percent,2)} <small>%</small></strong><p class="hint">Période sélectionnée : ${window.label}<br>Pearson sur les clôtures communes de la période<br>${corr.count.toLocaleString(OilI18n.locale)} clôtures appariées${corr.first?'<br>'+date(corr.first)+' → '+date(corr.last):''}<br>−100 % : inverse · 0 % : linéaire nulle · +100 % : même sens</p></div>`);
 $('#insights').innerHTML=cards.join('');
 OilI18n.tree($('#insights'));
}
function resetView(){
 if(!series.length)return;const rows=series.flatMap(s=>[...s.price,...s.funding]);if(!rows.length)return;
 const window=selectedWindow();view={start:window.start,end:window.end+step()*.3};drawAll();
}
function renderCoverage(){
 let body='';for(const m of markets){const d=history.markets[m];for(const [key,label] of [['fundingHourly','Funding source'],['close4h','Clôtures 4H'],['close1d','Clôtures 1D']]){const v=d[key],missing=v.missingRanges.reduce((sum,r)=>sum+r.count,0);body+=`<tr><td>${names[m]}</td><td>${label}</td><td>${v.count.toLocaleString(OilI18n.locale)}</td><td>${v.firstTime?date(v.firstTime):'—'}</td><td>${v.lastTime?date(v.lastTime):'—'}</td><td>${missing?'⚠ '+missing:'0'}</td></tr>`;}}
 $('#coverage').innerHTML=`<div class="position-detail"><table><thead><tr><th>Marché</th><th>Série</th><th>Observations</th><th>Première fin de période</th><th>Dernière</th><th>Manquantes</th></tr></thead><tbody>${body}</tbody></table></div><p>${markets.map(m=>`${names[m]} : ${history.markets[m].price4hReachesFundingStart?'les prix 4H atteignent le début du funding':'début des prix 4H postérieur au funding, historique plus ancien indisponible à cette granularité'}`).join(' · ')}</p>`;
 updateCollectionTime();
 OilI18n.tree($('#coverage'));
 const annual=document.createElement('p');annual.textContent=L(markets.map((m,i)=>{const f=annualStats[i];return names[m]+' · Funding cumulé sur 12 mois : '+fmt(f.rolling,3)+' %'+(f.partial?' · historique partiel':'');}).join(' · '));$('#coverage').append(annual);
}
function clearAccountCaches(){summarySource=null;summaryCache=[];levelSource=null;levelCache=[];}
function summaries(){if(summarySource!==account){summarySource=account;summaryCache=markets.map(m=>({...M.positionSummary(account?.positions||[],m),market:m}));}return summaryCache;}
function renderPositions(){
 if(!account){clearAccountCaches();$('#positions').innerHTML='';drawAll();return;}
 const ss=summaries();let cards=ss.map(s=>`<div class="position-market"><h4 class="${s.market===markets[0]?'brent-text':'wti-text'}">${names[s.market]} · ${s.rows.length} position${s.rows.length>1?'s':''}</h4>${s.rows.length?`<div class="position-data"><div><label>Entrée moyenne pondérée</label><b>${M.fixed(s.entry)} ${unit(s.market)}</b></div><div><label>Funding net depuis ouverture</label><b class="${s.funding!==null&&s.funding>=0n?'positive':'negative'}">${s.funding!==null&&s.funding>0n?'+':''}${M.fixed(s.funding,6)} USDC</b></div><div><label>Liquidation moyenne indicative</label><b>${M.fixed(s.liquidation)} ${unit(s.market)}</b></div></div><p class="hint">${s.long!==null?'Long · entrée '+M.fixed(s.long):''}${s.long!==null&&s.short!==null?' / ':''}${s.short!==null?'Short · entrée '+M.fixed(s.short):''} · + reçu / − payé${s.rows.some(r=>r.liquidationPrice===null)?' · certains seuils de liquidation indisponibles':''}</p>`:'<p class="hint">Aucune position ouverte sur ce marché.</p>'}</div>`).join('');
 const rows=(account.positions||[]).filter(p=>markets.includes(p.market)).map(p=>`<tr><td>${esc(p.name)}<br><small>${esc(p.account.slice(0,6)+'…'+p.account.slice(-4))}</small></td><td>${names[p.market]}</td><td>${Number(p.size)>0?'Long':'Short'} ${esc(p.size)}</td><td>${esc(p.entryPrice??'—')}</td><td>${esc(p.liquidationPrice??'Indisponible')}</td><td>${M.fixed(M.received([p]),6)}</td></tr>`).join('');
 $('#positions').innerHTML=`<div class="position-summary">${cards}</div>${rows?`<div class="position-detail"><table><thead><tr><th>Compte</th><th>Marché</th><th>Position</th><th>Entrée</th><th>Liquidation</th><th>Funding net USDC</th></tr></thead><tbody>${rows}</tbody></table></div>`:''}`;
 $('#account-status').textContent=L(`${account.accountCount??0} compte(s) consulté(s) · actualisé ${date(account.scannedAt)} · adresse non enregistrée${account.errors?.length?' · ⚠ '+account.errors.join(' · '):''}`);drawAll();
 OilI18n.tree($('#positions'));
}
function levels(){
 if(!$('#overlays').checked||!account)return [];if(levelSource===account)return levelCache;const out=[];
 for(const s of summaries()){
  const c=s.market===markets[0]?'#8ee6ae':'#c1d889';
  if(s.entry!==null)out.push({value:Number(M.fixed(s.entry,10)),color:c,label:`${names[s.market]} · entrée moy. ${M.fixed(s.entry)}`,dash:[8,4],average:true});
  const lc=s.market===markets[0]?'#e995ce':'#b1a2ff';
  if(s.rows.length>1&&s.liquidation!==null)out.push({value:Number(M.fixed(s.liquidation,10)),color:lc,label:`${names[s.market]} · liq. moyenne indicative ${M.fixed(s.liquidation)}`,dash:[2,4],average:true});
  for(const p of s.rows)if(p.liquidationPrice!==null)out.push({value:Number(p.liquidationPrice),color:lc,label:`${names[s.market]} · liq. ${p.name} ${p.liquidationPrice}`,dash:[3,4]});
 }
 levelSource=account;levelCache=out;return out;
}
class Chart{
 constructor(id,kind){this.canvas=$('#'+id);this.kind=kind;this.tip=this.canvas.nextElementSibling;this.hover=null;this.drag=null;this.raf=null;this.layout=null;this.hoverBucket=null;const c=this.canvas;
  new ResizeObserver(()=>this.requestDraw()).observe(c.parentElement);
  c.addEventListener('wheel',e=>{if(!view)return;e.preventDefault();const r=c.getBoundingClientRect(),fraction=Math.min(1,Math.max(0,(e.clientX-r.left-70)/(r.width-140))),old=view.end-view.start,factor=e.deltaY>0?1.2:1/1.2,span=Math.min(1200*24*M.HOUR,Math.max(4*step(),old*factor)),anchor=view.start+fraction*old;view={start:anchor-fraction*span,end:anchor+(1-fraction)*span};drawAll();},{passive:false});
  c.addEventListener('pointerdown',e=>{if(!view)return;this.drag={x:e.clientX,...view};c.setPointerCapture(e.pointerId);});
  c.addEventListener('pointermove',e=>{const r=c.getBoundingClientRect();if(this.drag){const shift=(e.clientX-this.drag.x)/(r.width-140)*(this.drag.end-this.drag.start);view={start:this.drag.start-shift,end:this.drag.end-shift};drawAll();return;}this.hover={x:e.clientX-r.left,y:e.clientY-r.top};const p=this.layout;if(p&&view&&this.hover.x>=p.left&&this.hover.x<=p.right&&this.hover.y>=p.top&&this.hover.y<=p.bottom){const bucket=Math.round((view.start+(this.hover.x-p.left)/p.pw*(view.end-view.start))/step())*step();if(bucket===this.hoverBucket&&this.tip.style.display==='block'){this.positionTooltip();return;}}this.requestDraw();});
  c.addEventListener('pointerup',()=>this.drag=null);c.addEventListener('pointercancel',()=>this.drag=null);
  c.addEventListener('pointerleave',()=>{this.hover=null;this.tip.style.display='none';this.requestDraw();});c.addEventListener('dblclick',resetView);
 }
 requestDraw(){if(this.raf!==null||document.hidden||route!=='monitor')return;this.raf=requestAnimationFrame(()=>{this.raf=null;if(!document.hidden)this.draw();});}
 suspend(){if(this.raf!==null)cancelAnimationFrame(this.raf);this.raf=null;this.hover=null;this.hoverBucket=null;this.tip.style.display='none';}
 positionTooltip(){if(!this.layout||!this.hover)return;const {w,h}=this.layout;this.tip.style.left=Math.min(w-this.tip.offsetWidth-5,Math.max(5,this.hover.x+13))+'px';this.tip.style.top=Math.max(3,Math.min(h-this.tip.offsetHeight,this.hover.y+12))+'px';}
 draw(){
  if(document.hidden||route==='home'||route==='global')return;
  const c=this.canvas,r=c.getBoundingClientRect(),w=r.width,h=r.height,dpr=window.devicePixelRatio||1;if(!w||!h)return;
  const pixelWidth=Math.round(w*dpr),pixelHeight=Math.round(h*dpr);if(c.width!==pixelWidth)c.width=pixelWidth;if(c.height!==pixelHeight)c.height=pixelHeight;
  const ctx=c.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,c.width/dpr,c.height/dpr);ctx.font='11px Segoe UI';ctx.fillStyle='#8fa5b0';
  if(!view||!series.length){ctx.fillText(L('L’historique apparaîtra après la collecte.'),25,h/2);return;}
  const left=70,right=w-70,top=16,bottom=h-40,pw=right-left,ph=bottom-top,span=view.end-view.start;
  this.layout={left,right,top,bottom,pw,w,h};
  const curves=series.flatMap(s=>this.kind==='funding'?[{...s,key:'funding',axis:0,label:'Funding '+s.name}]:this.kind==='price'?[{...s,key:'price',axis:0,label:'Prix '+s.name}]:[{...s,key:'funding',axis:0,label:'Funding '+s.name},{...s,key:'price',axis:1,label:'Prix '+s.name,dash:[6,4]}]);
  const ls=this.kind==='funding'?[]:levels(),priceAxis=this.kind==='combined'?1:0,axes=[[],[]];
  for(const q of curves){const rows=q[q.key];for(let i=M.indexAfter(rows,view.start-1);i<rows.length&&rows[i].time<=view.end;i++)if(rows[i].time>=view.start)axes[q.axis].push(rows[i].value);}
  for(const l of ls)axes[priceAxis].push(l.value);
  if(this.kind!=='price')axes[0].push(0);
  const ranges=axes.map(a=>{if(!a.length)return {min:0,max:1};const min=Math.min(...a),max=Math.max(...a),pad=(max-min||Math.abs(max)*.05||.01)*.12;return {min:min-pad,max:max+pad};});
  const x=t=>left+(t-view.start)/span*pw,y=(v,axis)=>bottom-(v-ranges[axis].min)/(ranges[axis].max-ranges[axis].min)*ph;
  for(let i=0;i<=4;i++){const yy=top+i*ph/4;ctx.strokeStyle='#23343c';ctx.lineWidth=1;ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(right,yy);ctx.stroke();ctx.textAlign='right';const v=ranges[0].max-i*(ranges[0].max-ranges[0].min)/4;ctx.fillStyle='#8fa5b0';ctx.fillText(fmt(v,this.kind==='price'?2:3),left-10,yy+4);if(this.kind==='combined'){const b=ranges[1].max-i*(ranges[1].max-ranges[1].min)/4;ctx.textAlign='left';ctx.fillText(fmt(b),right+10,yy+4);}}
  for(let i=0;i<=4;i++){const t=view.start+i*span/4,xx=x(t);ctx.strokeStyle='#1c2c33';ctx.beginPath();ctx.moveTo(xx,top);ctx.lineTo(xx,bottom);ctx.stroke();ctx.fillStyle='#78909c';ctx.textAlign=i===0?'left':i===4?'right':'center';ctx.fillText(date(t,true),xx,bottom+24);}
  ctx.save();ctx.beginPath();ctx.rect(left,top,pw,ph);ctx.clip();
  if(this.kind!=='price'){const zero=y(0,0);ctx.strokeStyle='#dce6eb';ctx.lineWidth=1.2;ctx.setLineDash([9,5]);ctx.beginPath();ctx.moveTo(left,zero);ctx.lineTo(right,zero);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#dce6eb';ctx.font='10px Segoe UI';ctx.textAlign='right';ctx.fillText(L('0 % · zéro funding'),right-5,zero-5);}
  for(const q of curves){ctx.strokeStyle=q.color;ctx.lineWidth=1.7;ctx.setLineDash(q.dash||[]);ctx.beginPath();let last=null;const rows=q[q.key];for(let i=M.indexAfter(rows,view.start-step()-1);i<rows.length&&rows[i].time<=view.end+step();i++){const p=rows[i];if(p.time<view.start-step())continue;if(last===null||p.time-last>step()*1.1)ctx.moveTo(x(p.time),y(p.value,q.axis));else ctx.lineTo(x(p.time),y(p.value,q.axis));last=p.time;}ctx.stroke();}
  for(const l of ls){ctx.strokeStyle=l.color;ctx.lineWidth=1;ctx.setLineDash(l.dash);ctx.beginPath();ctx.moveTo(left,y(l.value,priceAxis));ctx.lineTo(right,y(l.value,priceAxis));ctx.stroke();}
  ctx.restore();ctx.setLineDash([]);
  const used=[];for(const l of ls){let yy=y(l.value,priceAxis)-5;while(used.some(t=>Math.abs(t-yy)<13))yy-=13;yy=Math.max(top+8,Math.min(bottom-5,yy));used.push(yy);ctx.font='10px Segoe UI';ctx.textAlign='left';ctx.fillStyle='#101c21dd';const width=ctx.measureText(l.label).width+9;ctx.fillRect(left+4,yy-10,Math.min(pw-8,width),13);ctx.fillStyle=l.color;ctx.fillText(L(l.label),left+8,yy,Math.max(0,pw-16));}
  if(this.hover&&!this.drag&&this.hover.x>=left&&this.hover.x<=right&&this.hover.y>=top&&this.hover.y<=bottom){const time=Math.round((view.start+(this.hover.x-left)/pw*span)/step())*step(),xx=x(time);ctx.strokeStyle='#8fa5b0';ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(xx,top);ctx.lineTo(xx,bottom);ctx.stroke();ctx.setLineDash([]);let html=`<b>${esc(date(time))}</b>`;
   for(const q of curves){const candidate=q[q.key][M.indexAfter(q[q.key],time)-1],p=candidate?.time===time?candidate:null;html+=`<div><span class="${q.market===markets[0]?'brent-text':'wti-text'}">${q.label}</span> : ${p?fmt(p.value,q.key==='funding'?5:4):'Manquant'} ${q.key==='funding'?'%':unit(q.market)}</div>`;}
   this.hoverBucket=time;this.tip.innerHTML=html;OilI18n.tree(this.tip);this.tip.style.display='block';this.positionTooltip();
  }else{this.hoverBucket=null;this.tip.style.display='none';}
 }
}
const charts=[new Chart('funding','funding'),new Chart('price','price'),new Chart('combined','combined')];function drawAll(){if(route!=='home'&&route!=='global')charts.forEach(c=>c.requestDraw());}
const researchView=createResearchView({analysis:OilAnalysis,catalog:C,translate:L,format:fmt,date,escape:esc});
const globalView=createGlobalView({math:M,catalog:C,research:researchView,translate:L,format:fmt,date,escape:esc});
globalView.setChange(()=>{renderGlobal();if(globalView.source==='public')poller.request();});
researchView.setChange(()=>{if(route==='global')renderGlobal();});
function renderGlobal(){globalView.render(history,'1d',0,publicPrices,publicError);researchView.render(history,markets);}
function updateResearchAccount(value){if(researchView.setAccount(value)&&route!=='home'){if(route==='global')renderGlobal();else researchView.render(history,markets);}}
function renderNavigation(){
 for(const [i,id] of ['asset-a','asset-b'].entries()){
  $('#'+id).innerHTML=C.keys.map(m=>'<option value="'+m+'"'+(m===markets[1-i]?' disabled':'')+'>'+esc(names[m])+'</option>').join('');$('#'+id).value=markets[i];
 }
 $('#monitor-link').href='#monitor/'+markets.join('/');$('#page-count').textContent=L(C.keys.length+' actifs · '+(C.keys.length*(C.keys.length-1)/2)+' comparaisons');
}
function renderHome(){
 const quote=m=>{const p=history?.markets[m]?.close4h.rows.at(-1);return '<div><span>'+esc(names[m])+'</span><b>'+fmt(p?.close,precision(m))+' <small>'+unit(m)+'</small></b><small>'+(p?date(p.time):L('Collecte en cours…'))+'</small></div>';};
 $('#market-cards').innerHTML=`<a class="market-card" href="#monitor/${markets.join('/')}"><span class="eyebrow">01 / MONITORING</span><h3>${esc(C.title(markets))}<span>↗</span></h3><div class="card-quotes">${markets.map(quote).join('')}</div><p>${L('Funding · prix · positions')}<span>${L('Ouvrir')} →</span></p></a><a class="market-card global-card" href="#global"><span class="eyebrow">02 / ${L('VUE GLOBALE')}</span><h3>${L('Tous les actifs')}<span>↗</span></h3><div class="mini-matrix" aria-hidden="true">${Array.from({length:24},(_,i)=>'<i class="'+(i%3===0?'inverse':i%5===0?'neutral':'')+'"></i>').join('')}</div><p>${L('Corrélations globales')}<span>${L('Ouvrir')} →</span></p></a>`;
}
function renderPageLabels(){
 const global=route==='global';
 $('#page-title').textContent=global?L('Corrélations globales'):C.title(markets);
 $('#page-description').textContent=L(global?'Repérez les actifs qui évoluent ensemble ou en sens opposés.':'Funding réalisé, clôtures et positions. Historique conservé sur votre ordinateur.');
 if(route==='monitor'){
  document.querySelectorAll('.legend .brent').forEach(el=>{el.textContent=L(el.classList.contains('dashed')?'Prix ':'')+names[markets[0]];});
  document.querySelectorAll('.legend .wti').forEach(el=>{el.textContent=L(el.classList.contains('dashed')?'Prix ':'')+names[markets[1]];});
  const legend=$('#combined').closest('.chart-card').querySelector('.legend');
  legend.querySelector('.brent:not(.dashed)').textContent='Funding '+names[markets[0]];legend.querySelector('.wti:not(.dashed)').textContent='Funding '+names[markets[1]];
  for(const c of charts)c.canvas.setAttribute('aria-label',L(c.kind==='funding'?'Funding réalisé':c.kind==='price'?'Prix de clôture':'Funding & prix superposés')+' · '+C.title(markets));
 }
 document.title=(route==='monitor'?C.title(markets):global?L('Corrélations globales'):L('Accueil'))+' · Perps Monitor';
}
function switchPage(){
 const hash=window.location.hash.slice(1),parts=hash.split('/');let chosen=markets;
 if(parts[0]==='monitor'&&C.assets[parts[1]]&&C.assets[parts[2]]&&parts[1]!==parts[2])chosen=parts.slice(1,3);
 const next=parts[0]==='monitor'?'monitor':hash==='global'?'global':'home';
 if(next!==route||chosen.join('|')!==markets.join('|')){charts.forEach(c=>c.suspend());route=next;markets=chosen;analysisCache=null;annualStats=[];clearAccountCaches();view=null;series=[];}
 $('#home-view').hidden=route!=='home';$('#monitor-content').hidden=route==='home';$('#page-intro').hidden=route==='home';$('#pair-view').hidden=route==='global';$('#global-view').hidden=route!=='global';$('#reset').hidden=route==='global';$('#monitor-toolbar').hidden=route==='global';
 renderNavigation();renderPageLabels();
 if(route==='home')renderHome();else if(route==='global')renderGlobal();else{buildSeries();resetView();renderPositions();researchView.render(history,markets);}
 window.scrollTo({top:0,behavior:'instant'});
}
for(const [i,id] of ['asset-a','asset-b'].entries())$('#'+id).onchange=()=>{
 const chosen=[...markets];chosen[i]=$('#'+id).value;if(chosen[0]===chosen[1])return;if(route==='global'){markets=chosen;analysisCache=null;annualStats=[];clearAccountCaches();renderNavigation();renderGlobal();}else window.location.hash='monitor/'+chosen.join('/');
};
window.addEventListener('hashchange',switchPage);
function updateCollectionTime(){const time=lastSuccess??history?.lastSuccessfulSync;$('#updated').textContent=L('Dernière collecte : '+(time?date(time):'en attente'));}
document.querySelectorAll('[data-frame]').forEach(button=>button.onclick=()=>{frame=button.dataset.frame;document.querySelectorAll('[data-frame]').forEach(b=>b.classList.toggle('active',b===button));if(route==='global')renderGlobal();else{buildSeries();resetView();}});
$('#range').onchange=()=>{if(route==='global')renderGlobal();else{renderMetrics();renderInsights();resetView();}};$('#timezone').onchange=()=>{if(route==='global')renderGlobal();else{buildSeries();renderPositions();researchView.render(history,markets);drawAll();}};$('#reset').onclick=resetView;$('#overlays').onchange=drawAll;
$('#sync').onclick=async()=>{try{const r=await fetch('/api/sync',{method:'POST',headers:{'X-Oil-Client':'1'}});if(!r.ok)throw Error('HTTP '+r.status);lastStatusText=null;$('#status').textContent=L('Synchronisation demandée…');poller.request();}catch(e){lastStatusText=null;$('#status').textContent=L(e.message);}};
$('#account-form').onsubmit=async e=>{e.preventDefault();const address=$('#address').value.trim();if(!/^0x[0-9a-fA-F]{40}$/.test(address)){$('#account-status').textContent=L('Saisissez une adresse publique valide : 0x suivi de 40 caractères hexadécimaux.');return;}
 try{const r=await fetch('/api/account',{method:'POST',headers:{'X-Oil-Client':'1','X-Oil-Address':address}});if(!r.ok)throw Error('HTTP '+r.status);chosenAddress=address;account=null;updateResearchAccount(null);clearAccountCaches();lastAccountVersion=null;$('#positions').innerHTML='';drawAll();$('#account-status').textContent=L('Lecture du compte et des sous-comptes en cours…');poller.request();}catch(e){$('#account-status').textContent=L('Échec du scan : '+e.message);}};
$('#clear').onclick=async()=>{chosenAddress='';account=null;updateResearchAccount(null);$('#address').value='';$('#account-status').textContent=L('Adresse effacée. Aucune adresse enregistrée.');renderPositions();await fetch('/api/account',{method:'POST',headers:{'X-Oil-Client':'1','X-Oil-Address':'clear'}}).catch(()=>{});};
async function refresh(signal){
 if(document.hidden||signal.aborted)return;
 try{
  const status=await get('/api/status',signal);if(document.hidden||signal.aborted)return;
  const stateKey=[status.syncing,status.queued,status.lastOk,status.errorCode,OilI18n.lang].join('|');
  if(stateKey!==lastStatusText){lastStatusText=stateKey;$('#light').className=status.lastOk?'ok':'error';$('#status').textContent=L(status.syncing?'Collecte en cours…':status.queued?'Collecte demandée…':status.lastOk?'Collecteur actif · prochain passage à HH:01':'Collecte incomplète · nouvelle tentative sous 5 min');$('#sync').disabled=status.syncing;$('#error-code').textContent=status.errorCode?L('Code erreur')+': '+status.errorCode+' · data/collector.log':'';}
  if(status.lastSuccessfulSync!==lastSuccess){lastSuccess=status.lastSuccessfulSync;updateCollectionTime();}
  {const snapshot=await historyClient.load(status.historyVersion,signal);if(document.hidden||signal.aborted)return;
   if(snapshot.changed){history=snapshot.data;seriesSource=null;frameCache.clear();analysisCache=null;annualStats=[];globalView.invalidate();if(route==='home')renderHome();else if(route==='global')renderGlobal();else{const old=view;buildSeries();researchView.render(history,markets);if(!old)resetView();else{view=old;drawAll();}}}}
  if(route==='global'&&globalView.source==='public'){
   try{const snapshot=await publicPriceClient.load(status.publicPricesVersion,signal);if(document.hidden||signal.aborted)return;const priorError=publicError;publicPrices=snapshot.data;publicError='';if(snapshot.changed||priorError){globalView.invalidate();renderGlobal();}}
   catch(error){if(error.name==='AbortError'||document.hidden)return;const message=L('Références publiques indisponibles')+' · '+error.message;if(message!==publicError){publicError=message;renderGlobal();}}
  }
  if(chosenAddress&&status.accountReady&&status.accountVersion!==lastAccountVersion){const a=await get('/api/account',signal);if(document.hidden||signal.aborted)return;
   if(!a.pending&&a.address?.toLowerCase()===chosenAddress.toLowerCase()){account=a;updateResearchAccount(a);lastAccountVersion=status.accountVersion;clearAccountCaches();if(route!=='home'&&route!=='global')renderPositions();}}
  if(!startupLoaded){await refreshStartup(signal);if(document.hidden||signal.aborted)return;}
  return status.syncing||status.queued||(chosenAddress&&(!account||status.accountBusy))?2000:15000;
 }catch(e){if(e.name==='AbortError'||document.hidden)return;lastStatusText=null;$('#light').className='error';$('#status').textContent=L(history?'Collecteur inaccessible · données affichées conservées':'En attente du premier JSON…');$('#error-code').textContent=L('Erreur de connexion')+': '+e.message;return 15000;}
}
const poller=OilUpdates.createPoller({check:refresh,hidden:()=>document.hidden});
$('#language').onchange=()=>{OilI18n.set($('#language').value);renderNavigation();renderPageLabels();if(route==='home')renderHome();else if(route==='global')renderGlobal();else{buildSeries();renderPositions();researchView.render(history,markets);drawAll();}poller.request();};
async function refreshStartup(signal){try{const state=await get('/api/startup',signal);if(document.hidden||signal?.aborted)return;$('#startup').checked=state.enabled;$('#startup').disabled=false;startupLoaded=true;}catch(error){if(error.name!=='AbortError'&&!document.hidden)$('#startup').disabled=true;}}
$('#startup').onchange=async()=>{
 const control=$('#startup'),wanted=control.checked;control.disabled=true;
 try{const response=await fetch('/api/startup',{method:'POST',headers:{'X-Oil-Client':'1','X-Oil-Startup':wanted?'on':'off'}}),state=await response.json();control.checked=state.enabled;if(!response.ok||state.errorCode)throw Error('STARTUP_WIN32_'+state.errorCode);}
 catch(error){$('#error-code').textContent=L('Réglage du démarrage impossible')+' · '+error.message;await refreshStartup();}finally{control.disabled=false;}
};
function pauseInterface(){poller.pause();charts.forEach(c=>c.suspend());}
function resumeInterface(){if(document.hidden)return;drawAll();poller.resume();}
document.addEventListener('visibilitychange',()=>document.hidden?pauseInterface():resumeInterface());
window.addEventListener('pagehide',pauseInterface);window.addEventListener('pageshow',resumeInterface);
$('#address').value='';renderNavigation();switchPage();poller.resume();
