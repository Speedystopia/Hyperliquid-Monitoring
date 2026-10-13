'use strict';
function createGlobalView({math,catalog,translate,format,date,escape}){
 const $=s=>document.querySelector(s);let cache=null,cells=null,series=[],mode='returns',fundingSource=null,funding=[];
 function showCell(i,j){
  if(!cells)return;const c=cells[i][j],names=series[i].name+' / '+series[j].name;
  $('#matrix-detail').textContent=names+' · '+(c.percent===null?translate('Données insuffisantes'):format(c.percent,2)+' %')+' · '+c.count+' '+translate('observations appariées')+(c.first?' · '+date(c.first)+' → '+date(c.last):'');
 }
 function render(history,frame,days){
  if(!history||document.hidden)return;
  if(fundingSource!==history){funding=catalog.keys.map(m=>math.fundingStats(history.markets[m].fundingHourly.rows));fundingSource=history;}
  const span=frame==='4h'?4*math.HOUR:24*math.HOUR;
  if(!cache||cache.history!==history||cache.frame!==frame||cache.days!==days||cache.mode!==mode){
   series=catalog.keys.map(m=>({market:m,name:catalog.assets[m].name,price:history.markets[m][frame==='4h'?'close4h':'close1d'].rows.map(r=>({time:r.time,value:r.close}))}));
   const nonempty=series.filter(s=>s.price.length),end=nonempty.length?Math.max(...nonempty.map(s=>s.price.at(-1).time)):0;
   const start=days?end-days*24*math.HOUR:nonempty.length?Math.min(...nonempty.map(s=>s.price[0].time))-1:0;
   cells=math.correlationMatrix(series,span,start,end,mode);cache={history,frame,days,mode};
  }
  const label=translate(mode==='returns'?'Variations de prix (%)':'Niveaux de clôture');
  $('#matrix-method').textContent=label+' · '+(frame==='4h'?'4H':'Daily')+' · '+translate(days?days+' jours':'Tout l’historique');
  $('#matrix-explanation').textContent=translate(mode==='returns'?'Pearson sur les variations entre clôtures consécutives. Rouge : mouvements opposés ; vert : même sens.':'Pearson sur les niveaux de clôture. Des tendances communes peuvent dominer ce résultat.')+' '+translate(mode==='returns'?'Méthode à privilégier pour analyser la compensation des gains et pertes liés aux prix.':'Vue des tendances historiques ; une forte corrélation des niveaux ne suffit pas à valider la compensation des gains et pertes.');
  let html='<table class="matrix-table"><caption class="sr-only">'+escape(label)+'</caption><thead><tr><th scope="col">'+translate('Actif')+'</th>'+series.map(s=>'<th scope="col">'+escape(s.name)+'</th>').join('')+'</tr></thead><tbody>';
  for(let i=0;i<series.length;i++){
   html+='<tr><th scope="row">'+escape(series[i].name)+'</th>';
   for(let j=0;j<series.length;j++){
    const c=cells[i][j],p=c.percent,shade=p===null?'matrix-na':(p<0?'matrix-negative-':'matrix-positive-')+Math.round(Math.abs(p)/10);
    const text=p===null?'—':format(p,1)+' %',title=series[i].name+' / '+series[j].name+' · '+text+' · '+c.count+' '+translate('observations appariées')+(c.first?' · '+date(c.first)+' → '+date(c.last):'');
    html+=`<td><button class="matrix-cell ${shade}" data-i="${i}" data-j="${j}" title="${escape(title)}" aria-label="${escape(title)}">${text}<small>${i===j?'—':c.count+' '+translate('points')}</small></button></td>`;
   }html+='</tr>';
  }
  $('#matrix').classList.toggle('large-matrix',series.length>12);$('#matrix').innerHTML=html+'</tbody></table>';
  $('#matrix').querySelectorAll('button').forEach(b=>{const show=()=>showCell(Number(b.dataset.i),Number(b.dataset.j));b.onfocus=show;b.onmouseenter=show;b.onclick=show;});
  const negative=[],positive=[];for(let i=0;i<series.length;i++)for(let j=i+1;j<series.length;j++)if(cells[i][j].percent!==null){const c={i,j,...cells[i][j]};if(c.percent<0)negative.push(c);else if(c.percent>0)positive.push(c);}
  negative.sort((a,b)=>a.percent-b.percent);positive.sort((a,b)=>b.percent-a.percent);
  const thresholdInfo=inverse=>'<p class="hint">'+translate(inverse?'Seuil strict : corrélation < −66 %.':'Seuil strict : corrélation > +66 %.')+'</p>';
  const danger=selection=>selection.fallback?'<p class="correlation-danger" role="status">⚠ '+translate('Dangereux · corrélation insuffisante (|r| ≤ 66 %). Aucune paire ne dépasse le seuil ; seul le meilleur score est affiché. La compensation des prix n’est pas assurée.')+'</p>':'';
  const ranking=(list,same)=>{const selected=math.selectCorrelationPairs(list);return thresholdInfo(!same)+danger(selected)+(selected.pairs.length?selected.pairs.map(c=>`<div class="inverse-row${same?' same-direction':''}${selected.fallback?' correlation-fallback':''}"><span>${escape(series[c.i].name+' / '+series[c.j].name)}</span><div class="inverse-track"><svg viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true"><rect width="${Math.abs(c.percent)}" height="10" rx="3"/></svg></div><b>${same?'+':''}${format(c.percent,1)} %</b><small>${c.count} ${translate('points')}</small></div>`).join(''):'<p class="hint">'+translate(same?'Aucune corrélation positive mesurée sur cette période.':'Aucune corrélation négative mesurée sur cette période.')+'</p>');};
  $('#inverse-pairs').innerHTML=ranking(negative,false);$('#positive-pairs').innerHTML=ranking(positive,true);
  const filtered=math.oppositeFundingPairs(cells,funding);
  const sec=history.benchmarks?.tltSecYield,benchmark=sec?.percent;
  const benchmarkLabel=translate('Référence TLT · rendement SEC à 30 jours')+' : '+(Number.isFinite(benchmark)?format(benchmark,2)+' '+translate('% / an')+' · '+translate('Date du taux')+' : '+sec.asOf:translate('Données insuffisantes'));
  const benchmarkDetails=Number.isFinite(benchmark)?translate('Rouge ≤')+' '+format(benchmark-1,2)+' % · '+translate('Jaune entre les seuils')+' · '+translate('Vert ≥')+' '+format(benchmark+1,2)+' %':'';
  const benchmarkWarning=sec?.errorCode?translate(Number.isFinite(benchmark)?'Actualisation du taux échouée · dernier taux connu conservé':'Rendement SEC indisponible')+' · '+translate('Code erreur')+' : '+sec.errorCode:Number.isFinite(benchmark)&&Date.now()-Date.parse(sec.asOf+'T00:00:00Z')>7*24*math.HOUR?translate('Date du taux ancienne · vérifier la publication iShares'):'';
  const benchmarkHtml='<p class="hint">'+escape(benchmarkLabel)+' · <a class="market-link" href="https://www.ishares.com/us/products/239454/ishares-20-year-treasury-bond-etf" target="_blank" rel="noopener noreferrer">iShares ↗</a>'+(sec?.lastSuccessfulCheck?' · '+translate('Dernière vérification')+' : '+date(sec.lastSuccessfulCheck):'')+'</p><p class="hint">'+escape(benchmarkDetails)+'</p>'+(benchmarkWarning?'<p class="hint negative">'+escape(benchmarkWarning)+'</p>':'');
  const fundingCell=i=>{const s=series[i],f=funding[i],rows=history.markets[s.market].fundingHourly.rows;return `<td><span>${escape(s.name)}</span><b class="${f.annualized>0?'positive':'negative'}">${f.annualized>0?'+':''}${format(f.annualized,3)} ${translate('% / an')}</b><small>${format(f.count,0)} ${translate('paiements')} · ${format(f.days,1)} ${translate('jours observés')}<br>${date(rows[0].time)} → ${date(rows.at(-1).time)}</small></td>`;};
  const fundingTable=(list,inverse)=>{const selected=math.selectCorrelationPairs(list);return thresholdInfo(inverse)+danger(selected)+(selected.pairs.length?'<table class="funding-pair-table"><thead><tr><th>'+translate('Actif A · funding annualisé')+'</th><th>'+translate('Actif B · funding annualisé')+'</th><th>'+translate('Corrélation · tout l’historique')+'</th><th>'+translate('Funding net annualisé')+'</th></tr></thead><tbody>'+selected.pairs.map(c=>'<tr'+(selected.fallback?' class="correlation-fallback"':'')+'>'+fundingCell(c.i)+fundingCell(c.j)+'<td><b class="'+(selected.fallback?'correlation-risk':inverse?'negative':'positive')+'">'+(c.percent>0?'+':'')+format(c.percent,1)+' %</b><small>'+c.count+' '+translate('points')+'<br>'+date(c.first)+' → '+date(c.last)+'</small></td><td><b class="funding-net funding-net-'+math.fundingNetBand(c.netAnnualized,benchmark)+'">+'+format(c.netAnnualized,3)+' '+translate('% / an')+'</b><small>'+translate(inverse?(c.bothShort?'Short A · Short B · montants égaux':'Long A · Long B · montants égaux'):(c.shortIsA?'Short A · Long B · montants égaux':'Long A · Short B · montants égaux'))+'</small></td></tr>').join('')+'</tbody></table>':'<p class="hint">'+translate(inverse?'Aucune paire avec corrélation négative et fundings annualisés de même signe.':'Aucune paire avec corrélation positive et fundings annualisés de signes opposés.')+'</p>');};
  $('#funding-pairs').innerHTML=benchmarkHtml+'<p class="hint">'+translate('Net = taux le plus élevé − taux le plus faible. Short au taux le plus élevé, long au plus faible ; notionnels égaux. Taux rapporté au notionnel d’une jambe, calculé sur les moyennes historiques, avant frais et variation des prix.')+'</p>'+fundingTable(filtered,false);
  $('#inverse-funding-pairs').innerHTML=benchmarkHtml+'<p class="hint">'+translate('Net = somme des valeurs absolues des deux taux. Deux shorts si les taux sont positifs, deux longs s’ils sont négatifs ; notionnels égaux. Taux rapporté au notionnel d’une jambe, moyennes historiques avant frais et variation des prix. La corrélation ne garantit pas une compensation exacte des positions.')+'</p>'+fundingTable(math.inverseFundingPairs(cells,funding),true);
  $('#matrix-coverage').innerHTML='<table><thead><tr><th>'+translate('Actif')+'</th><th>'+translate('Clôtures daily enregistrées')+'</th><th>'+translate('Première fin de période')+'</th><th>'+translate('Dernière')+'</th></tr></thead><tbody>'+series.map(s=>'<tr><td>'+escape(s.name)+'</td><td>'+s.price.length+'</td><td>'+(s.price.length?date(s.price[0].time):'—')+'</td><td>'+(s.price.length?date(s.price.at(-1).time):'—')+'</td></tr>').join('')+'</tbody></table>';
  $('#matrix-detail').textContent=translate('Survolez ou sélectionnez une case pour voir sa couverture.');
 }
 $('#correlation-mode').onchange=()=>{mode=$('#correlation-mode').value;onChange();};
 let onChange=()=>{};return {render,setChange(fn){onChange=fn;},invalidate(){cache=null;cells=null;series=[];fundingSource=null;funding=[];}};
}
