'use strict';
const M=OilMath,$=s=>document.querySelector(s),markets=['BRENTOIL','WTIOIL'],colors=['#f6b66b','#61c9ef'];
const L=OilI18n.translate;
let history=null,account=null,chosenAddress='',frame='4h',view=null,series=[],lastVersion=0,lastAccountVersion=0,statusTimerBusy=false;
const names={BRENTOIL:'Brent',WTIOIL:'WTI'},step=()=>frame==='4h'?4*M.HOUR:24*M.HOUR;
const fmt=(n,d=2)=>Number.isFinite(n)?n.toLocaleString(OilI18n.locale,{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const date=(t,short=false)=>new Date(t).toLocaleString(OilI18n.locale,{timeZone:$('#timezone').value==='UTC'?'UTC':undefined,day:'2-digit',month:'2-digit',year:short?undefined:'numeric',hour:'2-digit',minute:short?undefined:'2-digit'});
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function get(path){const r=await fetch(path,{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}
function buildSeries(){
 if(!history)return;
 series=markets.map((m,i)=>{const d=history.markets[m];return {name:names[m],market:m,color:colors[i],funding:M.aggregateFunding(d.fundingHourly.rows,frame==='4h'?4:24),price:d[frame==='4h'?'close4h':'close1d'].rows.map(r=>({time:r.time,value:r.close}))};});
 $('#funding-frame').textContent=L('/ '+(frame==='4h'?'4H':'1D'));
 $('#metrics').innerHTML=series.flatMap(s=>{const price=s.price.at(-1),funding=s.funding.at(-1),cls=s.market==='BRENTOIL'?'brent-text':'wti-text';return [`<div class="metric"><label><a class="market-link" href="https://app.hyperliquid.xyz/trade/${s.market==='BRENTOIL'?'xyz:BRENTOIL':'xyz:WTIOIL'}" target="_blank" rel="noopener noreferrer">${s.name} ↗</a> · clôture ${frame==='4h'?'4H':'daily'}</label><strong class="${cls}">${price?fmt(price.value):'—'} <small>USD</small></strong><small>${price?date(price.time):'Aucune donnée'}</small></div>`,`<div class="metric"><label>${s.name} · funding ${frame==='4h'?'4H':'daily'}</label><strong class="${cls}">${funding?fmt(funding.value,5):'—'} <small>%</small></strong><small>${funding?date(funding.time):'Période complète indisponible'}</small></div>`];}).join('');
 OilI18n.tree($('#metrics'));renderInsights();renderCoverage();
}
function renderInsights(){
 const cards=markets.map((m,i)=>{const f=M.fundingStats(history.markets[m].fundingHourly.rows);return `<div class="metric"><label>${names[m]} · funding annualisé réalisé</label><strong class="${i?'wti-text':'brent-text'}">${fmt(f.annualized,3)} <small>% / an</small></strong><p class="hint">Moyenne des ${f.count.toLocaleString(OilI18n.locale)} paiements horaires × 8 760<br>Funding cumulé sur 12 mois : <b>${fmt(f.rolling,3)} %</b>${f.partial?' · historique partiel':''}<br>Cumul total : ${fmt(f.total,3)} % · ${fmt(f.days,1)} jours observés</p></div>`;});
 const corr=M.correlation(series[0].price,series[1].price);cards.push(`<div class="metric correlation"><label>Corrélation des prix Brent / WTI · ${frame==='4h'?'4H':'Daily'}</label><strong>${fmt(corr.percent,2)} <small>%</small></strong><p class="hint">Pearson sur tout l’historique commun<br>${corr.count.toLocaleString(OilI18n.locale)} clôtures appariées${corr.first?'<br>'+date(corr.first)+' → '+date(corr.last):''}<br>−100 % : inverse · 0 % : linéaire nulle · +100 % : même sens</p></div>`);
 $('#insights').innerHTML=cards.join('');
 OilI18n.tree($('#insights'));
}
function resetView(){
 if(!series.length)return;const rows=series.flatMap(s=>[...s.price,...s.funding]);if(!rows.length)return;
 const end=Math.max(...rows.map(r=>r.time)),earliest=Math.min(...rows.map(r=>r.time)),days=Number($('#range').value);
 view={start:days?Math.max(earliest,end-days*24*M.HOUR):earliest,end:end+step()*.3};drawAll();
}
function renderCoverage(){
 let body='';for(const m of markets){const d=history.markets[m];for(const [key,label] of [['fundingHourly','Funding source 1H'],['close4h','Clôtures 4H'],['close1d','Clôtures 1D']]){const v=d[key],missing=v.missingRanges.reduce((sum,r)=>sum+r.count,0);body+=`<tr><td>${names[m]}</td><td>${label}</td><td>${v.count.toLocaleString(OilI18n.locale)}</td><td>${v.firstTime?date(v.firstTime):'—'}</td><td>${v.lastTime?date(v.lastTime):'—'}</td><td>${missing?'⚠ '+missing:'0'}</td></tr>`;}}
 $('#coverage').innerHTML=`<div class="position-detail"><table><thead><tr><th>Marché</th><th>Série</th><th>Observations</th><th>Première fin de période</th><th>Dernière</th><th>Manquantes</th></tr></thead><tbody>${body}</tbody></table></div><p>${markets.map(m=>`${names[m]} : ${history.markets[m].price4hReachesFundingStart?'les prix 4H atteignent le début du funding':'début des prix 4H postérieur au funding, historique plus ancien indisponible à cette granularité'}`).join(' · ')}</p>`;
 $('#updated').textContent=L('Dernière collecte : '+(history.lastSuccessfulSync?date(history.lastSuccessfulSync):'en attente'));
 OilI18n.tree($('#coverage'));
}
function summaries(){return markets.map(m=>({...M.positionSummary(account?.positions||[],m),market:m}));}
function renderPositions(){
 if(!account){$('#positions').innerHTML='';drawAll();return;}
 const ss=summaries();let cards=ss.map(s=>`<div class="position-market"><h4 class="${s.market==='BRENTOIL'?'brent-text':'wti-text'}">${names[s.market]} · ${s.rows.length} position${s.rows.length>1?'s':''}</h4>${s.rows.length?`<div class="position-data"><div><label>Entrée moyenne pondérée</label><b>${M.fixed(s.entry)} USD</b></div><div><label>Funding net depuis ouverture</label><b class="${s.funding!==null&&s.funding>=0n?'positive':'negative'}">${s.funding!==null&&s.funding>0n?'+':''}${M.fixed(s.funding,6)} USDC</b></div><div><label>Liquidation moyenne indicative</label><b>${M.fixed(s.liquidation)} USD</b></div></div><p class="hint">${s.long!==null?'Long · entrée '+M.fixed(s.long):''}${s.long!==null&&s.short!==null?' / ':''}${s.short!==null?'Short · entrée '+M.fixed(s.short):''} · + reçu / − payé${s.rows.some(r=>r.liquidationPrice===null)?' · certains seuils de liquidation indisponibles':''}</p>`:'<p class="hint">Aucune position ouverte sur ce marché.</p>'}</div>`).join('');
 const rows=(account.positions||[]).map(p=>`<tr><td>${esc(p.name)}<br><small>${esc(p.account.slice(0,6)+'…'+p.account.slice(-4))}</small></td><td>${names[p.market]}</td><td>${Number(p.size)>0?'Long':'Short'} ${esc(p.size)}</td><td>${esc(p.entryPrice??'—')}</td><td>${esc(p.liquidationPrice??'Indisponible')}</td><td>${M.fixed(M.received([p]),6)}</td></tr>`).join('');
 $('#positions').innerHTML=`<div class="position-summary">${cards}</div>${rows?`<div class="position-detail"><table><thead><tr><th>Compte</th><th>Marché</th><th>Position</th><th>Entrée USD</th><th>Liquidation USD</th><th>Funding net USDC</th></tr></thead><tbody>${rows}</tbody></table></div>`:''}`;
 $('#account-status').textContent=L(`${account.accountCount??0} compte(s) consulté(s) · actualisé ${date(account.scannedAt)} · adresse non enregistrée${account.errors?.length?' · ⚠ '+account.errors.join(' · '):''}`);drawAll();
 OilI18n.tree($('#positions'));
}
function levels(){
 if(!$('#overlays').checked||!account)return [];const out=[];
 for(const s of summaries()){
  const c=s.market==='BRENTOIL'?'#8ee6ae':'#c1d889';
  if(s.entry!==null)out.push({value:Number(M.fixed(s.entry,10)),color:c,label:`${names[s.market]} · entrée moy. ${M.fixed(s.entry)}`,dash:[8,4],average:true});
  const lc=s.market==='BRENTOIL'?'#e995ce':'#b1a2ff';
  if(s.rows.length>1&&s.liquidation!==null)out.push({value:Number(M.fixed(s.liquidation,10)),color:lc,label:`${names[s.market]} · liq. moyenne indicative ${M.fixed(s.liquidation)}`,dash:[2,4],average:true});
  for(const p of s.rows)if(p.liquidationPrice!==null)out.push({value:Number(p.liquidationPrice),color:lc,label:`${names[s.market]} · liq. ${p.name} ${p.liquidationPrice}`,dash:[3,4]});
 }
 return out;
}
class Chart{
 constructor(id,kind){this.canvas=$('#'+id);this.kind=kind;this.tip=this.canvas.nextElementSibling;this.hover=null;this.drag=null;const c=this.canvas;
  new ResizeObserver(()=>this.draw()).observe(c.parentElement);
  c.addEventListener('wheel',e=>{if(!view)return;e.preventDefault();const r=c.getBoundingClientRect(),fraction=Math.min(1,Math.max(0,(e.clientX-r.left-70)/(r.width-140))),old=view.end-view.start,factor=e.deltaY>0?1.2:1/1.2,span=Math.min(1200*24*M.HOUR,Math.max(4*step(),old*factor)),anchor=view.start+fraction*old;view={start:anchor-fraction*span,end:anchor+(1-fraction)*span};drawAll();},{passive:false});
  c.addEventListener('pointerdown',e=>{if(!view)return;this.drag={x:e.clientX,...view};c.setPointerCapture(e.pointerId);});
  c.addEventListener('pointermove',e=>{const r=c.getBoundingClientRect();if(this.drag){const shift=(e.clientX-this.drag.x)/(r.width-140)*(this.drag.end-this.drag.start);view={start:this.drag.start-shift,end:this.drag.end-shift};drawAll();return;}this.hover={x:e.clientX-r.left,y:e.clientY-r.top};this.draw();});
  c.addEventListener('pointerup',()=>this.drag=null);c.addEventListener('pointercancel',()=>this.drag=null);
  c.addEventListener('pointerleave',()=>{this.hover=null;this.tip.style.display='none';this.draw();});c.addEventListener('dblclick',resetView);
 }
 draw(){
  const c=this.canvas,r=c.getBoundingClientRect(),w=r.width,h=r.height,dpr=window.devicePixelRatio||1;if(!w||!h)return;
  c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);const ctx=c.getContext('2d');ctx.scale(dpr,dpr);ctx.font='11px Segoe UI';ctx.fillStyle='#8fa5b0';
  if(!view||!series.length){ctx.fillText(L('L’historique apparaîtra après la collecte.'),25,h/2);return;}
  const left=70,right=w-70,top=16,bottom=h-40,pw=right-left,ph=bottom-top,span=view.end-view.start;
  const curves=series.flatMap(s=>this.kind==='funding'?[{...s,key:'funding',axis:0,label:'Funding '+s.name}]:this.kind==='price'?[{...s,key:'price',axis:0,label:'Prix '+s.name}]:[{...s,key:'funding',axis:0,label:'Funding '+s.name},{...s,key:'price',axis:1,label:'Prix '+s.name,dash:[6,4]}]);
  const ls=this.kind==='funding'?[]:levels(),priceAxis=this.kind==='combined'?1:0,axes=[[],[]];
  for(const q of curves)for(const p of q[q.key])if(p.time>=view.start&&p.time<=view.end)axes[q.axis].push(p.value);
  for(const l of ls)axes[priceAxis].push(l.value);
  if(this.kind!=='price')axes[0].push(0);
  const ranges=axes.map(a=>{if(!a.length)return {min:0,max:1};const min=Math.min(...a),max=Math.max(...a),pad=(max-min||Math.abs(max)*.05||.01)*.12;return {min:min-pad,max:max+pad};});
  const x=t=>left+(t-view.start)/span*pw,y=(v,axis)=>bottom-(v-ranges[axis].min)/(ranges[axis].max-ranges[axis].min)*ph;
  for(let i=0;i<=4;i++){const yy=top+i*ph/4;ctx.strokeStyle='#23343c';ctx.lineWidth=1;ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(right,yy);ctx.stroke();ctx.textAlign='right';const v=ranges[0].max-i*(ranges[0].max-ranges[0].min)/4;ctx.fillStyle='#8fa5b0';ctx.fillText(fmt(v,this.kind==='price'?2:3),left-10,yy+4);if(this.kind==='combined'){const b=ranges[1].max-i*(ranges[1].max-ranges[1].min)/4;ctx.textAlign='left';ctx.fillText(fmt(b),right+10,yy+4);}}
  for(let i=0;i<=4;i++){const t=view.start+i*span/4,xx=x(t);ctx.strokeStyle='#1c2c33';ctx.beginPath();ctx.moveTo(xx,top);ctx.lineTo(xx,bottom);ctx.stroke();ctx.fillStyle='#78909c';ctx.textAlign=i===0?'left':i===4?'right':'center';ctx.fillText(date(t,true),xx,bottom+24);}
  ctx.save();ctx.beginPath();ctx.rect(left,top,pw,ph);ctx.clip();
  if(this.kind!=='price'){const zero=y(0,0);ctx.strokeStyle='#dce6eb';ctx.lineWidth=1.2;ctx.setLineDash([9,5]);ctx.beginPath();ctx.moveTo(left,zero);ctx.lineTo(right,zero);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#dce6eb';ctx.font='10px Segoe UI';ctx.textAlign='right';ctx.fillText(L('0 % · zéro funding'),right-5,zero-5);}
  for(const q of curves){ctx.strokeStyle=q.color;ctx.lineWidth=1.7;ctx.setLineDash(q.dash||[]);ctx.beginPath();let last=null;for(const p of q[q.key]){if(p.time<view.start-step()||p.time>view.end+step())continue;if(last===null||p.time-last>step()*1.1)ctx.moveTo(x(p.time),y(p.value,q.axis));else ctx.lineTo(x(p.time),y(p.value,q.axis));last=p.time;}ctx.stroke();}
  for(const l of ls){ctx.strokeStyle=l.color;ctx.lineWidth=1;ctx.setLineDash(l.dash);ctx.beginPath();ctx.moveTo(left,y(l.value,priceAxis));ctx.lineTo(right,y(l.value,priceAxis));ctx.stroke();}
  ctx.restore();ctx.setLineDash([]);
  const used=[];for(const l of ls){let yy=y(l.value,priceAxis)-5;while(used.some(t=>Math.abs(t-yy)<13))yy-=13;yy=Math.max(top+8,Math.min(bottom-5,yy));used.push(yy);ctx.font='10px Segoe UI';ctx.textAlign='left';ctx.fillStyle='#101c21dd';const width=ctx.measureText(l.label).width+9;ctx.fillRect(left+4,yy-10,Math.min(pw-8,width),13);ctx.fillStyle=l.color;ctx.fillText(L(l.label),left+8,yy,Math.max(0,pw-16));}
  if(this.hover&&!this.drag&&this.hover.x>=left&&this.hover.x<=right&&this.hover.y>=top&&this.hover.y<=bottom){const time=Math.round((view.start+(this.hover.x-left)/pw*span)/step())*step(),xx=x(time);ctx.strokeStyle='#8fa5b0';ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(xx,top);ctx.lineTo(xx,bottom);ctx.stroke();ctx.setLineDash([]);let html=`<b>${esc(date(time))}</b>`;
   for(const q of curves){const p=q[q.key].find(p=>p.time===time);html+=`<div><span class="${q.market==='BRENTOIL'?'brent-text':'wti-text'}">${q.label}</span> : ${p?fmt(p.value,q.key==='funding'?5:4):'Manquant'} ${q.key==='funding'?'%':'USD'}</div>`;}
   this.tip.innerHTML=html;OilI18n.tree(this.tip);this.tip.style.display='block';this.tip.style.left=Math.min(w-this.tip.offsetWidth-5,Math.max(5,this.hover.x+13))+'px';this.tip.style.top=Math.max(3,Math.min(h-this.tip.offsetHeight,this.hover.y+12))+'px';
  }else this.tip.style.display='none';
 }
}
const charts=[new Chart('funding','funding'),new Chart('price','price'),new Chart('combined','combined')];function drawAll(){charts.forEach(c=>c.draw());}
document.querySelectorAll('[data-frame]').forEach(button=>button.onclick=()=>{frame=button.dataset.frame;document.querySelectorAll('[data-frame]').forEach(b=>b.classList.toggle('active',b===button));buildSeries();resetView();});
$('#range').onchange=resetView;$('#timezone').onchange=()=>{buildSeries();renderPositions();drawAll();};$('#reset').onclick=resetView;$('#overlays').onchange=drawAll;
$('#sync').onclick=async()=>{try{const r=await fetch('/api/sync',{method:'POST',headers:{'X-Oil-Client':'1'}});if(!r.ok)throw Error('HTTP '+r.status);$('#status').textContent=L('Synchronisation demandée…');}catch(e){$('#status').textContent=L(e.message);}};
$('#account-form').onsubmit=async e=>{e.preventDefault();const address=$('#address').value.trim();if(!/^0x[0-9a-fA-F]{40}$/.test(address)){$('#account-status').textContent=L('Saisissez une adresse publique valide : 0x suivi de 40 caractères hexadécimaux.');return;}
 try{const r=await fetch('/api/account',{method:'POST',headers:{'X-Oil-Client':'1','X-Oil-Address':address}});if(!r.ok)throw Error('HTTP '+r.status);chosenAddress=address;account=null;lastAccountVersion=0;$('#positions').innerHTML='';drawAll();$('#account-status').textContent=L('Lecture du compte et des sous-comptes en cours…');}catch(e){$('#account-status').textContent=L('Échec du scan : '+e.message);}};
$('#clear').onclick=async()=>{chosenAddress='';account=null;$('#address').value='';$('#account-status').textContent=L('Adresse effacée. Aucune adresse enregistrée.');renderPositions();await fetch('/api/account',{method:'POST',headers:{'X-Oil-Client':'1','X-Oil-Address':'clear'}}).catch(()=>{});};
async function refresh(){
 if(statusTimerBusy)return;statusTimerBusy=true;
 try{const status=await get('/api/status');$('#light').className=status.lastOk?'ok':'error';$('#status').textContent=L(status.syncing?'Collecte en cours…':status.queued?'Collecte demandée…':status.lastOk?'Collecteur actif · prochain passage à HH:01':'Collecte incomplète · nouvelle tentative sous 5 min');$('#sync').disabled=status.syncing;$('#error-code').textContent=status.errorCode?L('Code erreur')+': '+status.errorCode+' · data/collector.log':'';
  if(!history||!status.syncing){const data=await get('/api/history');if(data.lastAttempt!==lastVersion){history=data;lastVersion=data.lastAttempt;const old=view;buildSeries();if(!old)resetView();else{view=old;drawAll();}}}
  if(chosenAddress){const a=await get('/api/account');if(!a.pending&&a.address?.toLowerCase()===chosenAddress.toLowerCase()&&a.scannedAt!==lastAccountVersion){account=a;lastAccountVersion=a.scannedAt;renderPositions();}}
 }catch(e){$('#light').className='error';$('#status').textContent=L(history?'Collecteur inaccessible · données affichées conservées':'En attente du premier JSON…');$('#error-code').textContent=L('Erreur de connexion')+': '+e.message;}finally{statusTimerBusy=false;}
}
$('#language').onchange=()=>{OilI18n.set($('#language').value);buildSeries();renderPositions();drawAll();refresh();};
$('#address').value='';refresh();setInterval(refresh,4000);
