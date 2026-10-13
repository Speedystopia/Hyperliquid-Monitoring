'use strict';
function createGlobalView({math,catalog,research,translate,format,date,escape}){
 const $=s=>document.querySelector(s),span=24*math.HOUR;
 let mainCache=null,publicCache=null,referenceCache=null,cells=null,series=[],fundingSource=null,funding=[];
 // Compare actual prices after a new JSON arrives. Metadata/funding changes
 // do not rerun Pearson, but a corrected historical close still invalidates it.
 function pricesCache(previous,source){
  if(previous&&previous.source===source)return previous;
  const next=catalog.keys.map(m=>({market:m,name:catalog.assets[m].name,metadata:source?.markets?.[m],price:[...new Map((source?.markets?.[m]?.close1d?.rows||[]).filter(r=>Number.isFinite(r.time)&&Number.isFinite(r.close)&&r.close>0).map(r=>[r.time,{time:r.time,value:r.close}])).values()].sort((a,b)=>a.time-b.time)}));
  const changed=!previous||next.some((s,i)=>s.price.length!==previous.series[i].price.length||s.price.some((r,j)=>r.time!==previous.series[i].price[j].time||r.value!==previous.series[i].price[j].value));
  if(!changed)return {...previous,source,series:next};
  const nonempty=next.filter(s=>s.price.length),end=nonempty.length?Math.max(...nonempty.map(s=>s.price.at(-1).time)):0,start=nonempty.length?Math.min(...nonempty.map(s=>s.price[0].time))-1:0;
  return {source,series:next,version:(previous?.version||0)+1,start,end,returns:next.map(s=>math.priceReturns(s.price,span)),cells:null};
 }
 function checkedCorrelation(a,b){const c=math.correlation(a,b);return c.count<3?{...c,percent:null}:c;}
 function references(){
  if(referenceCache?.mainVersion===mainCache.version&&referenceCache.publicVersion===publicCache.version)return referenceCache.cells;
  const hl=mainCache.returns.map(rows=>new Map(rows.map(r=>[r.time,r.value]))),pub=publicCache.returns.map(rows=>new Map(rows.map(r=>[r.time,r.value]))),out=series.map(()=>Array(series.length));
  for(let i=0;i<series.length;i++)for(let j=i;j<series.length;j++){
   const ha=[],hb=[],pa=[],pb=[];
   // Both reference correlations use the same actual daily return timestamps.
   // Different sessions stay distinct; missing candles are never interpolated.
   for(const [time,value] of hl[i])if(hl[j].has(time)&&pub[i].has(time)&&pub[j].has(time)){
    ha.push({time,value});hb.push({time,value:hl[j].get(time)});pa.push({time,value:pub[i].get(time)});pb.push({time,value:pub[j].get(time)});
   }
   const result={public:checkedCorrelation(pa,pb),hyperliquid:checkedCorrelation(ha,hb)};out[i][j]=result;out[j][i]=result;
  }
  referenceCache={mainVersion:mainCache.version,publicVersion:publicCache.version,cells:out};return out;
 }
 const observationText=c=>c.count+' '+translate('observations appariées')+(c.first?' · '+date(c.first)+' → '+date(c.last):'');
 function referenceText(i,j){
  const proof=referenceCache?.cells[i]?.[j],c=proof?.public,paired=proof?.hyperliquid;
  if(!c||c.percent===null)return translate('Référence externe indisponible')+' · '+(c?observationText(c):'0');
  const providers=[publicCache.series[i].metadata?.provider,publicCache.series[j].metadata?.provider].filter(Boolean).join(' / '),main=cells[i][j];
  const status=paired.percent===null?translate('Comparaison Hyperliquid alignée indisponible'):c.count<30?translate('Moins de 30 observations externes'):Math.sign(c.percent)!==Math.sign(paired.percent)||Math.sign(c.percent)!==Math.sign(main.percent)?translate('Divergence de signe avec la référence externe'):Math.abs(c.percent)<=66||Math.abs(paired.percent)<=66?translate('Référence ou comparaison alignée sous le seuil de 66 %'):translate('Même signe et seuil dépassé sur les dates alignées');
  return translate('Référence externe')+' : '+format(c.percent,2)+' % · '+providers+' · '+observationText(c)+' · '+translate('Hyperliquid sur les mêmes dates')+' : '+format(paired.percent,2)+' % · '+status;
 }
 function showCell(i,j){
  if(!cells)return;const c=cells[i][j],names=series[i].name+' / '+series[j].name;
  $('#matrix-detail').textContent=names+' · Hyperliquid : '+(c.percent===null?translate('Données insuffisantes'):format(c.percent,2)+' %')+' · '+observationText(c)+' · '+referenceText(i,j);
 }
 function renderCoverage(history,publicHistory=null){
  if(!history||document.hidden)return;
  const period=rows=>rows.length?date(rows[0].time)+' → '+date(rows.at(-1).time):'—';
  $('#matrix-coverage').innerHTML='<table><thead><tr><th>'+translate('Actif')+'</th><th>'+translate('Clôtures Daily Hyperliquid')+'</th><th>'+translate('Référence externe archivée')+'</th><th>'+translate('Source publique')+'</th></tr></thead><tbody>'+catalog.keys.map(m=>{
   const h=history.markets?.[m]?.close1d?.rows||[],p=publicHistory?.markets?.[m],rows=p?.close1d?.rows||[];
   return '<tr><td>'+escape(catalog.assets[m].name)+'</td><td>'+h.length+'<small class="hint">'+period(h)+'</small></td><td>'+rows.length+'<small class="hint">'+period(rows)+'</small></td><td>'+escape(p?.provider||translate('Indisponible'))+(p?'<small class="hint">'+escape(p.quoteUnit||'')+'</small><details><summary>'+translate('Précisions sur la source')+'</summary><p class="hint">'+escape(p.sessionNote||'')+'</p></details>':'')+'</td></tr>';
  }).join('')+'</tbody></table><p class="hint">'+translate('Les prix nuls ou négatifs sont conservés dans les archives brutes, mais exclus des variations en pourcentage. Un actif sans référence externe reste indisponible ; aucun prix Hyperliquid ne le remplace dans cette vue.')+'</p>';
 }
 function render(history,_frame,_days,publicHistory=null,publicError=''){
  if(!history||document.hidden)return;
  if(fundingSource!==history){funding=catalog.keys.map(m=>math.fundingStats(history.markets[m].fundingHourly.rows));fundingSource=history;}
  mainCache=pricesCache(mainCache,history);publicCache=pricesCache(publicCache,publicHistory);series=mainCache.series;
  if(!mainCache.cells)mainCache.cells=math.correlationMatrix(series,span,mainCache.start,mainCache.end,'returns');cells=mainCache.cells;references();
  $('#matrix-source-note').textContent=translate('Analyse unique : prix négociés Hyperliquid pour la matrice et les classements ; références externes complémentaires sur les mêmes dates disponibles. Les sources restent distinctes, sans interpolation ni score moyen qui masque les limites.')+(publicError?' · '+translate('Code erreur')+' : '+publicError:'');
  const label=translate('Variations de prix (%)');
  $('#matrix-method').textContent=label+' · Daily · '+translate('Tout l’historique')+' · Hyperliquid';
  $('#matrix-explanation').textContent=translate('Pearson sur les variations entre clôtures consécutives. Rouge : mouvements opposés ; vert : même sens.')+' '+translate('La comparaison externe affiche aussi la corrélation Hyperliquid sur exactement les mêmes observations. Accord de signe et échantillon suffisant sont des diagnostics, pas une garantie future.');
  let html='<table class="matrix-table"><caption class="sr-only">'+escape(label)+'</caption><thead><tr><th scope="col">'+translate('Actif')+'</th>'+series.map(s=>'<th scope="col">'+escape(s.name)+'</th>').join('')+'</tr></thead><tbody>';
  for(let i=0;i<series.length;i++){
   html+='<tr><th scope="row">'+escape(series[i].name)+'</th>';
   for(let j=0;j<series.length;j++){
    const c=cells[i][j],p=c.percent,shade=p===null?'matrix-na':(p<0?'matrix-negative-':'matrix-positive-')+Math.round(Math.abs(p)/10),text=p===null?'—':format(p,1)+' %',title=series[i].name+' / '+series[j].name+' · Hyperliquid · '+text+' · '+observationText(c);
    html+='<td><button class="matrix-cell '+shade+'" data-i="'+i+'" data-j="'+j+'" title="'+escape(title)+'" aria-label="'+escape(title)+'">'+text+'<small>'+(i===j?'—':c.count+' '+translate('points'))+'</small></button></td>';
   }html+='</tr>';
  }
  $('#matrix').classList.toggle('large-matrix',series.length>12);$('#matrix').innerHTML=html+'</tbody></table>';
  $('#matrix').querySelectorAll('button').forEach(b=>{const show=()=>showCell(Number(b.dataset.i),Number(b.dataset.j));b.onfocus=show;b.onmouseenter=show;b.onclick=show;});
  const all=[];for(let i=0;i<series.length;i++)for(let j=i+1;j<series.length;j++)all.push({i,j,...cells[i][j]});
  const thresholdInfo=inverse=>'<p class="hint">'+translate(inverse?'Seuil strict : corrélation < −66 %.':'Seuil strict : corrélation > +66 %.')+'</p>';
  const ranking=strong=>{const selected=math.selectStrengthPairs(all,strong);return '<p class="hint">'+translate(strong?'Corrélation forte : |r| ≥ 75 %, signes positifs et négatifs inclus.':'Corrélation faible : |r| ≤ 25 %, signes positifs et négatifs inclus.')+'</p>'+(selected.length?selected.map(c=>'<div class="inverse-row'+(c.percent>=0?' same-direction':'')+'"><span>'+escape(series[c.i].name+' / '+series[c.j].name)+'</span><div class="inverse-track"><svg viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true"><rect width="'+Math.abs(c.percent)+'" height="10" rx="3"/></svg></div><b>'+(c.percent>0?'+':'')+format(c.percent,1)+' %</b><small>'+c.count+' '+translate('points')+'</small></div>').join(''):'<p class="hint">'+translate(strong?'Aucune paire ne remplit le seuil de corrélation forte.':'Aucune paire ne remplit le seuil de corrélation faible.')+'</p>');};
  $('#positive-pairs').innerHTML=ranking(true);$('#inverse-pairs').innerHTML=ranking(false);
  const sec=history.benchmarks?.tltSecYield,benchmark=sec?.percent;
  const benchmarkLabel=translate('Référence TLT · rendement SEC à 30 jours')+' : '+(Number.isFinite(benchmark)?format(benchmark,2)+' '+translate('% / an')+' · '+translate('Date du taux')+' : '+sec.asOf:translate('Données insuffisantes'));
  const benchmarkDetails=Number.isFinite(benchmark)?translate('Rouge ≤')+' '+format(benchmark-1,2)+' % · '+translate('Jaune entre les seuils')+' · '+translate('Vert ≥')+' '+format(benchmark+1,2)+' %':'';
  const benchmarkWarning=sec?.errorCode?translate(Number.isFinite(benchmark)?'Actualisation du taux échouée · dernier taux connu conservé':'Rendement SEC indisponible')+' · '+translate('Code erreur')+' : '+sec.errorCode:Number.isFinite(benchmark)&&Date.now()-Date.parse(sec.asOf+'T00:00:00Z')>7*24*math.HOUR?translate('Date du taux ancienne · vérifier la publication iShares'):'';
  const benchmarkHtml='<p class="hint">'+escape(benchmarkLabel)+' · <a class="market-link" href="https://www.ishares.com/us/products/239454/ishares-20-year-treasury-bond-etf" target="_blank" rel="noopener noreferrer">iShares ↗</a>'+(sec?.lastSuccessfulCheck?' · '+translate('Dernière vérification')+' : '+date(sec.lastSuccessfulCheck):'')+'</p><p class="hint">'+escape(benchmarkDetails)+'</p>'+(benchmarkWarning?'<p class="hint negative">'+escape(benchmarkWarning)+'</p>':'');
  const fundingCell=i=>{const s=series[i],f=funding[i],rows=history.markets[s.market].fundingHourly.rows;return '<td><span>'+escape(s.name)+'</span><b class="'+(f.annualized>0?'positive':'negative')+'">'+(f.annualized>0?'+':'')+format(f.annualized,3)+' '+translate('% / an')+'</b><small>'+format(f.count,0)+' '+translate('paiements')+' · '+format(f.days,1)+' '+translate('jours observés')+'<br>'+(rows.length?date(rows[0].time)+' → '+date(rows.at(-1).time):'—')+'</small></td>';};
  const fundingTable=(list,inverse,kind)=>{
   const selected=math.selectCorrelationPairs(list),container=$(kind==='same'?'#same-funding-pairs':inverse?'#inverse-funding-pairs':'#funding-pairs'),showSummary=research&&!container.closest?.('.block-collapsed');
   return thresholdInfo(inverse)+(selected.pairs.length?'<table class="funding-pair-table"><thead><tr><th>'+translate('Actif A · funding annualisé')+'</th><th>'+translate('Actif B · funding annualisé')+'</th><th>'+translate('Corrélation · tout l’historique')+'</th><th>'+translate('Funding net annualisé')+'</th></tr></thead><tbody>'+selected.pairs.map(c=>'<tr>'+fundingCell(c.i)+fundingCell(c.j)+'<td><b class="'+(inverse?'negative':'positive')+'">'+(c.percent>0?'+':'')+format(c.percent,1)+' %</b><small>Hyperliquid · '+c.count+' '+translate('points')+'<br>'+date(c.first)+' → '+date(c.last)+'</small><small>'+escape(referenceText(c.i,c.j))+'</small></td><td><b class="funding-net funding-net-'+math.fundingNetBand(c.netAnnualized,benchmark)+'">+'+format(c.netAnnualized,3)+' '+translate('% / an')+'</b><small>'+translate(inverse?(c.bothShort?'Short A · Short B · montants égaux':'Long A · Long B · montants égaux'):(c.shortIsA?'Short A · Long B · montants égaux':'Long A · Short B · montants égaux'))+'</small>'+(showSummary?research.summary(history,series[c.i].market,series[c.j].market,{directionA:inverse?(c.bothShort?-1:1):(c.shortIsA?-1:1),directionB:inverse?(c.bothShort?-1:1):(c.shortIsA?1:-1)}):'')+'</td></tr>').join('')+'</tbody></table>':'<p class="hint">'+translate(kind==='same'?'Aucune paire avec corrélation > +66 % et fundings moyens de même signe.':inverse?'Aucune paire avec corrélation < −66 % et fundings moyens de même signe.':'Aucune paire avec corrélation > +66 % et fundings moyens de signes opposés.')+'</p>');
  };
  const difference=translate('Net = taux le plus élevé − taux le plus faible. Short au taux le plus élevé, long au plus faible ; notionnels égaux. Taux rapporté au notionnel d’une jambe, calculé sur les moyennes historiques, avant frais et variation des prix.');
  $('#funding-pairs').innerHTML='<p class="hint">'+translate('Ce classement exige des fundings moyens de signes opposés. Une paire avec deux fundings négatifs ou deux positifs est exclue, même avec une meilleure corrélation.')+'</p>'+benchmarkHtml+'<p class="hint">'+difference+'</p>'+fundingTable(math.oppositeFundingPairs(cells,funding),false,'opposite');
  $('#same-funding-pairs').innerHTML=benchmarkHtml+'<p class="hint">'+difference+'</p>'+fundingTable(math.sameFundingPairs(cells,funding),false,'same');
  $('#inverse-funding-pairs').innerHTML=benchmarkHtml+'<p class="hint">'+translate('Net = somme des valeurs absolues des deux taux. Deux shorts si les taux sont positifs, deux longs s’ils sont négatifs ; notionnels égaux. Taux rapporté au notionnel d’une jambe, moyennes historiques avant frais et variation des prix. La corrélation ne garantit pas une compensation exacte des positions.')+'</p>'+fundingTable(math.inverseFundingPairs(cells,funding),true,'inverse');
  renderCoverage(history,publicHistory);$('#matrix-detail').textContent=translate('Survolez ou sélectionnez une case pour voir sa couverture.');
 }
 return {render,renderCoverage,setChange(){},invalidate(){mainCache=null;publicCache=null;referenceCache=null;cells=null;series=[];fundingSource=null;funding=[];}};
}
