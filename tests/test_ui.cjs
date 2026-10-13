const assert=require('node:assert/strict');const M=require('../web/math.js');
const hours=Array.from({length:24},(_,i)=>({time:(i+1)*M.HOUR,fundingRate:.00001}));
assert.equal(M.aggregateFunding(hours,4).length,6);assert.equal(M.aggregateFunding(hours,24).length,1);
assert.ok(Math.abs(M.aggregateFunding(hours,24)[0].value-.024)<1e-12);
assert.equal(M.aggregateFunding(hours.filter((_,i)=>i!==6),4).length,5);
assert.equal(M.aggregateFunding(hours.filter((_,i)=>i!==6),24).length,0);
assert.equal(M.aggregateFunding([...hours,hours[0]],24).length,1);
const rows=[{size:'2',entryPrice:'100.12345678',liquidationPrice:'70',fundingPaidSinceOpen:'-2.123456'},{size:'1',entryPrice:'103.12345678',liquidationPrice:null,fundingPaidSinceOpen:'1'}];
assert.equal(M.fixed(M.weighted(rows,'entryPrice')),'101.12345678');assert.equal(M.fixed(M.received(rows),6),'1.123456');assert.equal(M.fixed(M.weighted(rows,'liquidationPrice')),'70.00000000');
assert.equal(M.received([{fundingPaidSinceOpen:null}]),null);
assert.equal(M.fixed(M.decimal('-0.123456789'),8),'-0.12345679');
const mixed=rows.map((r,i)=>({...r,market:'WTIOIL',size:i?'1':'-2'}));const s=M.positionSummary(mixed,'WTIOIL');assert.equal(M.fixed(s.entry),'101.12345678');assert.equal(M.fixed(s.long),'103.12345678');assert.equal(M.fixed(s.short),'100.12345678');
console.log('JS: UTC 4H/1D funding alignment, missing periods, deduplication, decimal weighting, funding sign, null liquidation, mixed directions OK');
const f=M.fundingStats(hours);assert.ok(Math.abs(f.annualized-8.76)<1e-10);assert.ok(Math.abs(f.rolling-.024)<1e-12);assert.equal(f.partial,true);
const a=[1,2,3].map((value,i)=>({time:i,value}));assert.equal(M.correlation(a,a.map(p=>({...p,value:p.value*2+100}))).percent,100);
assert.equal(M.correlation(a,a.map(p=>({...p,value:-p.value}))).percent,-100);assert.equal(M.correlation(a,a.map(p=>({...p,value:2}))).percent,null);
assert.equal(M.correlation(a,[{time:1,value:3},{time:2,value:4}]).count,2);
console.log('JS: realized annualized funding, partial annual history, Pearson alignment, constant series and sign OK');
const fs=require('node:fs'),vm=require('node:vm');const langContext={localStorage:{getItem:()=>null,setItem:()=>{}},NodeFilter:{SHOW_TEXT:4},document:{body:{},documentElement:{},createTreeWalker:()=>({nextNode:()=>null}),querySelectorAll:()=>[],querySelector:()=>({value:''})}};
vm.createContext(langContext);vm.runInContext(fs.readFileSync(require.resolve('../web/i18n.js'),'utf8')+';globalThis.testI18n=OilI18n;',langContext);
assert.equal(langContext.testI18n.lang,'en');const expected={en:'Realized funding',fr:'Funding réalisé',zh:'实际资金费率',ko:'실현 펀딩',ja:'確定資金調達率',it:'Funding realizzato',es:'Funding realizado'};
for(const [language,text] of Object.entries(expected)){langContext.testI18n.set(language);assert.equal(langContext.testI18n.translate('Funding réalisé'),text);}
console.log('JS: English default and all seven language translations OK');
const windowHours=Array.from({length:120*24},(_,i)=>({time:(i+1)*M.HOUR,fundingRate:i<100*24?.00001:-.00002}));
const end=windowHours.at(-1).time,seven=M.selectWindow(windowHours,end-7*24*M.HOUR,end),thirty=M.selectWindow(windowHours,end-30*24*M.HOUR,end),ninety=M.selectWindow(windowHours,end-90*24*M.HOUR,end);
assert.equal(seven.length,168);assert.equal(thirty.length,720);assert.equal(ninety.length,2160);assert.equal(M.selectWindow(windowHours,0,end).length,2880);
assert.notEqual(M.fundingStats(seven).annualized,M.fundingStats(thirty).annualized);assert.notEqual(M.fundingStats(seven).total,M.fundingStats(ninety).total);
const prices=Array.from({length:121},(_,i)=>({time:i*24*M.HOUR,value:100+i}));const ps=M.priceStats(prices,end-7*24*M.HOUR,end);
assert.equal(ps.count,7);assert.equal(ps.average,217);assert.equal(ps.latest.value,220);assert.ok(Math.abs(ps.change-(220/213-1)*100)<1e-10);
assert.equal(M.priceStats(prices,end+M.HOUR,end+2*M.HOUR).latest,null);
const paired=prices.map((p,i)=>({...p,value:i<110?p.value:440-p.value}));
assert.notEqual(M.correlation(M.selectWindow(prices,end-7*24*M.HOUR,end),M.selectWindow(paired,end-7*24*M.HOUR,end)).percent,M.correlation(prices,paired).percent);
console.log('JS: 7/30/90/full period selection updates funding, annualization, price average/change and correlation; empty windows handled OK');
const Catalog=require('../web/catalog.js');
assert.equal(Catalog.keys.length,15);assert.equal(new Set(Catalog.keys.map(k=>Catalog.assets[k].coin)).size,15);
assert.equal(Catalog.assets.BTC.coin,'BTC');assert.equal(Catalog.assets.DIESEL.coin,'xyz:HO');assert.equal(Catalog.assets.EURUSD.coin,'xyz:EUR');
assert.equal(Catalog.assets.USDJPY.coin,'xyz:JPY');assert.equal(Catalog.assets.USDJPY.unit,'JPY/USD');assert.equal(Catalog.assets.ETH.coin,'ETH');
for(const market of ['TLT','XYZ100','COPPER','SILVER'])assert.equal(Catalog.assets[market].coin,'xyz:'+market);
const rising=[100,110,99,118.8,95.04].map((value,i)=>({time:(i+1)*4*M.HOUR,value}));
const falling=[100,90,99,79.2,95.04].map((value,i)=>({time:(i+1)*4*M.HOUR,value}));
const matrix=M.correlationMatrix([{price:rising},{price:falling}],4*M.HOUR,0,99*M.HOUR);
assert.ok(Math.abs(matrix[0][1].percent+100)<1e-10);assert.equal(matrix[0][1].count,4);assert.equal(matrix[0][1],matrix[1][0]);
assert.equal(matrix[0][0].percent,100);
assert.equal(M.priceReturns([rising[0],rising[2],rising[3]],4*M.HOUR).length,1);
const sparse=M.correlationMatrix([{price:rising.slice(0,2)},{price:falling}],4*M.HOUR,0,99*M.HOUR);
assert.equal(sparse[0][1].percent,null);assert.equal(sparse[0][1].count,1);
const levels=M.correlationMatrix([{price:rising},{price:falling}],4*M.HOUR,0,99*M.HOUR,'levels');assert.equal(levels[0][1].count,5);
console.log('JS: fifteen shared assets and freely selectable comparisons, inverse returns, symmetric matrix, no missing-candle bridging, minimum sample and level/return modes OK');

const legacyFunding=[8,16,24].map(h=>({time:h*M.HOUR,fundingRate:.0008,intervalHours:8}));
assert.equal(M.aggregateFunding(legacyFunding,4).length,0);assert.equal(M.aggregateFunding(legacyFunding,24).length,1);assert.ok(Math.abs(M.aggregateFunding(legacyFunding,24)[0].value-.24)<1e-12);assert.ok(Math.abs(M.fundingStats(legacyFunding).annualized-87.6)<1e-10);assert.equal(M.fundingStats(legacyFunding).hours,24);
console.log("JS: legacy 8-hour BTC/ETH funding preserves payment sums, weights annualization by covered hours and never invents 4-hour rates OK");

const newLabels={en:"Strongest same-direction moves",fr:"Mouvements les plus similaires",zh:"最强同向变动",ko:"가장 강한 같은 방향 움직임",ja:"同方向の動きが強い組み合わせ",it:"Movimenti più simili",es:"Movimientos más similares"};
for(const [language,text] of Object.entries(newLabels)){langContext.testI18n.set(language);assert.equal(langContext.testI18n.translate("Mouvements les plus similaires"),text);}
console.log("JS: positive-ranking labels translated in all seven languages OK");

const fundingSigns=[{annualized:2},{annualized:-3},{annualized:0},{annualized:null},{annualized:4}];
const signCells=fundingSigns.map(()=>fundingSigns.map(()=>({percent:10,count:5,first:1,last:5})));
signCells[0][1]={percent:80,count:5};signCells[1][4]={percent:95,count:5};signCells[0][4]={percent:100,count:5};
assert.deepEqual(M.oppositeFundingPairs(signCells,fundingSigns).map(p=>[p.i,p.j]),[[1,4],[0,1]]);
assert.deepEqual(M.oppositeFundingPairs(signCells,fundingSigns).map(p=>[p.netAnnualized,p.shortIsA]),[[7,false],[5,true]]);
for(const [a,b,net,shortIsA] of [[10,4,6,true],[4,10,6,false],[10,-4,14,true],[-4,10,14,false],[-10,-4,6,false],[-4,-10,6,true],[3,3,0,true]]){assert.deepEqual(M.fundingCarry(a,b),{netAnnualized:net,shortIsA});const notional=1000;assert.equal(notional*(shortIsA?a-b:b-a)/100,notional*net/100);}
assert.equal(M.fundingCarry(null,4),null);assert.equal(M.fundingCarry(10,NaN),null);
for(const [net,benchmark,band] of [[6,7,'below'],[6.001,7,'near'],[7,7,'near'],[7.999,7,'near'],[8,7,'above'],[-6,-5,'below'],[-5,-5,'near'],[-4,-5,'above'],[0,0,'near'],[6,null,'unknown'],[NaN,7,'unknown']])assert.equal(M.fundingNetBand(net,benchmark),band);
const netCss=fs.readFileSync(require.resolve('../web/style.css'),'utf8');for(const style of ['.funding-net-below{color:#e995a1}', '.funding-net-near{color:#f4d35e}', '.funding-net-above{color:#8ee6ae}'])assert.ok(netCss.includes(style));
for(const language of ['en','fr','zh','ko','ja','it','es']){langContext.testI18n.set(language);for(const label of ['Funding net annualisé','Short A · Long B · montants égaux','Long A · Short B · montants égaux','Corrélation · tout l’historique','Référence TLT · rendement SEC à 30 jours','Date du taux','Dernière vérification','Rendement SEC indisponible'])assert.ok(language==='fr'||langContext.testI18n.translate(label)!==label);}
signCells[1][4]={percent:-95,count:5};signCells[0][1]={percent:80,count:2};assert.equal(M.oppositeFundingPairs(signCells,fundingSigns).length,0);
const mixedFunding=M.fundingStats([{time:M.HOUR,fundingRate:.0001},{time:9*M.HOUR,fundingRate:-.0004,intervalHours:8}]);assert.ok(mixedFunding.annualized<0);
console.log('JS: positive-correlation ranking filters strictly opposite annualized signs, excludes zero/missing/short samples and retains both orientations OK');
const inverseStats=[{annualized:2},{annualized:3},{annualized:-4},{annualized:-5},{annualized:0},{annualized:null}];
const inverseCells=inverseStats.map(()=>inverseStats.map(()=>({percent:-10,count:5,first:1,last:5})));
inverseCells[0][1]={percent:-70,count:5};inverseCells[2][3]={percent:-90,count:5};
assert.deepEqual(M.inverseFundingPairs(inverseCells,inverseStats).map(p=>[p.i,p.j,p.netAnnualized,p.bothShort]),[[2,3,9,false],[0,1,5,true]]);
inverseCells[0][1]={percent:70,count:5};inverseCells[2][3]={percent:-90,count:2};assert.equal(M.inverseFundingPairs(inverseCells,inverseStats).length,0);
// Opposite price returns: equal long/short directions reinforce them; equal same-side directions offset them in this idealized example.
const priceA=.01,priceB=-.01,notional=1000;assert.equal(notional*priceA-notional*priceB,20);assert.equal(notional*priceA+notional*priceB,0);
for(const language of ['en','fr','zh','ko','ja','it','es']){langContext.testI18n.set(language);for(const label of ['Mouvements opposés · fundings de même signe','Short A · Short B · montants égaux','Long A · Long B · montants égaux'])assert.ok(language==='fr'||langContext.testI18n.translate(label)!==label);}
console.log('JS: inverse-correlation ranking selects same funding signs, sums received rates, shows two longs/shorts, excludes invalid pairs and translates all labels OK');
const thresholdPairs=[{percent:66,count:5},{percent:66.001,count:5},{percent:-66,count:5},{percent:-66.001,count:5},{percent:95,count:5},{percent:NaN,count:5},{percent:99,count:2}];
assert.deepEqual(M.selectCorrelationPairs(thresholdPairs).pairs.map(p=>p.percent),[95,66.001,-66.001]);assert.equal(M.selectCorrelationPairs(thresholdPairs).fallback,false);
assert.deepEqual(M.selectCorrelationPairs([{percent:-62.9,count:208},{percent:-59.9,count:208}]),{pairs:[],fallback:false});
assert.deepEqual(M.selectCorrelationPairs([{percent:66,count:5}]),{pairs:[],fallback:false});
assert.deepEqual(M.selectCorrelationPairs([]),{pairs:[],fallback:false});assert.equal(M.selectCorrelationPairs([{percent:0,count:5},{percent:null,count:5}]).pairs.length,0);
assert.equal(M.selectCorrelationPairs(Array.from({length:8},(_,i)=>({percent:80+i,count:5}))).pairs.length,6);assert.equal(thresholdPairs[0].percent,66);
for(const language of ['en','fr','zh','ko','ja','it','es']){langContext.testI18n.set(language);for(const label of ['Seuil strict : corrélation < −66 %.','Seuil strict : corrélation > +66 %.'])assert.ok(language==='fr'||langContext.testI18n.translate(label)!==label);}
console.log('JS: strict absolute correlation >66 threshold, exact boundaries, no out-of-criteria fallback, invalid/empty inputs and ranking cap OK');

const sameStats=[{annualized:-24},{annualized:-17},{annualized:5},{annualized:9},{annualized:9},{annualized:0},{annualized:NaN},{annualized:null}];
const sameCells=sameStats.map(()=>sameStats.map(()=>({percent:-90,count:40,first:1,last:40})));
sameCells[0][1]={percent:88,count:40};sameCells[2][3]={percent:85,count:40};sameCells[2][4]={percent:90,count:40};sameCells[3][4]={percent:95,count:40};
for(const j of [5,6,7])sameCells[3][j]={percent:100,count:40};sameCells[0][2]={percent:99,count:40};
assert.deepEqual(M.sameFundingPairs(sameCells,sameStats).map(p=>[p.i,p.j,p.netAnnualized,p.shortIsA]),[[3,4,0,true],[2,4,4,false],[0,1,7,false],[2,3,4,false]]);
// Brent -24 / WTI -17: long Brent receives24 and short WTI pays17, net7.
const oilCarry=M.sameFundingPairs(sameCells,sameStats).find(p=>p.i===0&&p.j===1);assert.equal(oilCarry.shortIsA,false);assert.equal(-sameStats[0].annualized+sameStats[1].annualized,oilCarry.netAnnualized);
sameCells[0][1]={percent:88,count:2};assert.ok(!M.sameFundingPairs(sameCells,sameStats).some(p=>p.i===0));
sameCells[2][3]={percent:65,count:40};assert.ok(!M.selectCorrelationPairs(M.sameFundingPairs(sameCells,sameStats)).pairs.some(p=>p.i===2&&p.j===3));
console.log('JS: same-sign positive-correlation carry includes both-negative oil rates, positive rates and ties, and excludes zero/missing/short/out-of-threshold cases OK');

const strength=[{percent:-99,count:40},{percent:75,count:40},{percent:-75,count:40},{percent:74.99,count:40},{percent:-25,count:40},{percent:25,count:40},{percent:0,count:40},{percent:10,count:40},{percent:-2,count:40},{percent:25.001,count:40},{percent:NaN,count:40},{percent:100,count:2}];
assert.deepEqual(M.selectStrengthPairs(strength,true).map(p=>p.percent),[-99,75,-75]);
assert.deepEqual(M.selectStrengthPairs(strength,false).map(p=>p.percent),[0,-2,10,-25,25]);
assert.deepEqual(M.selectStrengthPairs([{percent:50,count:40}],true),[]);assert.deepEqual(M.selectStrengthPairs([{percent:50,count:40}],false),[]);
assert.equal(M.selectStrengthPairs(Array.from({length:8},(_,i)=>({percent:-80-i,count:40})),true).length,6);
console.log('JS: mixed-sign strong |r|>=75 and weak |r|<=25 classifications, inclusive boundaries, zero correlation, intermediate exclusion and ranking cap OK');

{
 const DAY=24*M.HOUR,keys=['A','B','C','D'],nodes=new Map();
 const node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',collapsed:false,classList:{toggle(){}},closest(){return this.collapsed?{}:null;},querySelectorAll(){return this.buttons=[...this.innerHTML.matchAll(/data-i="(\d+)" data-j="(\d+)"/g)].map(match=>({dataset:{i:match[1],j:match[2]}}));}});return nodes.get(id);};
 const document={hidden:false,querySelector:id=>{assert.ok(!['#matrix-source','#correlation-mode'].includes(id),'Removed source/method controls must never be accessed');return node(id);}};
 let matrixCalls=0,referenceCalls=0,summaryCalls=0;
 const math={...M,correlationMatrix(...args){matrixCalls++;return M.correlationMatrix(...args);},correlation(...args){referenceCalls++;return M.correlation(...args);}};
 const context={document,Date,Map,Number,Math,Array};vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../web/global.js'),'utf8')+';globalThis.factory=createGlobalView;',context);
 const catalog={keys,assets:Object.fromEntries(keys.map(key=>[key,{name:key}]))},view=context.factory({math,catalog,research:{summary(){summaryCalls++;return '<span>Account analysis notice</span>';}},translate:s=>s,format:(n,d=2)=>Number.isFinite(n)?n.toFixed(d):'—',date:n=>'T'+n,escape:s=>String(s)});
 const history={markets:Object.fromEntries(keys.map(key=>[key,{close1d:{rows:[]},fundingHourly:{rows:Array.from({length:40*24},(_,i)=>({time:(i+1)*M.HOUR,fundingRate:key==='D'?.00003:key==='B'?-.00001:key==='C'?-.00003:-.00002,intervalHours:1}))}}]))};
 let price=100,inverse=120;for(let i=0;i<=40;i++){if(i){const r=.01*Math.sin(i*.73)+.005*Math.cos(i*.37);price*=1+r;inverse*=1-r;}for(const key of keys)history.markets[key].close1d.rows.push({time:i*DAY,close:key==='C'?inverse:price});}
 const external={markets:{A:{provider:'Public A',quoteUnit:'USD',close1d:{rows:structuredClone(history.markets.A.close1d.rows)}},B:{provider:'Public B',quoteUnit:'USD',close1d:{rows:structuredClone(history.markets.C.close1d.rows).filter(r=>r.time!==10*DAY)}}}};
 view.render(history,'4h',7,external);assert.equal(matrixCalls,1);assert.ok(referenceCalls>0);assert.ok(node('#matrix-method').textContent.includes('Daily · Tout l’historique'));
 assert.ok(node('#same-funding-pairs').innerHTML.includes('Long A · Short B · montants égaux'));assert.ok(node('#same-funding-pairs').innerHTML.includes('Divergence de signe avec la référence externe'));
 const button=(i,j)=>node('#matrix').buttons.find(b=>+b.dataset.i===i&&+b.dataset.j===j);
 button(0,1).onfocus();assert.ok(node('#matrix-detail').textContent.includes('40 observations appariées'));assert.ok(node('#matrix-detail').textContent.includes('38 observations appariées'));assert.ok(node('#matrix-detail').textContent.includes('-100.00 %'));assert.ok(node('#matrix-detail').textContent.includes('Hyperliquid sur les mêmes dates : 100.00 %'));
 button(0,2).onfocus();assert.ok(node('#matrix-detail').textContent.includes('Référence externe indisponible'));assert.ok(node('#matrix-detail').textContent.includes('0 observations appariées'));
 const matrixInitial=matrixCalls,referenceInitial=referenceCalls,sameHtml=node('#same-funding-pairs').innerHTML;
 const fundingChanged=structuredClone(history);for(const r of fundingChanged.markets.A.fundingHourly.rows)r.fundingRate*=2;
 view.render(fundingChanged,'1d',0,external);assert.equal(matrixCalls,matrixInitial);assert.equal(referenceCalls,referenceInitial);assert.notEqual(node('#same-funding-pairs').innerHTML,sameHtml);
 const metadataChanged=structuredClone(external);metadataChanged.markets.A.provider='Updated public A';view.render(fundingChanged,'1d',0,metadataChanged);assert.equal(matrixCalls,matrixInitial);assert.equal(referenceCalls,referenceInitial);
 const externalChanged=structuredClone(metadataChanged);externalChanged.markets.B.close1d.rows[2].close*=1.03;view.render(fundingChanged,'1d',0,externalChanged);assert.equal(matrixCalls,matrixInitial);assert.ok(referenceCalls>referenceInitial);
 const beforeCorrection=referenceCalls,corrected=structuredClone(fundingChanged);corrected.markets.A.close1d.rows[2].close*=1.02;view.render(corrected,'1d',0,externalChanged);assert.equal(matrixCalls,matrixInitial+1);assert.ok(referenceCalls>beforeCorrection);
 for(const id of ['#funding-pairs','#same-funding-pairs','#inverse-funding-pairs'])node(id).collapsed=true;
 summaryCalls=0;const beforeCoverage=[matrixCalls,referenceCalls];view.render(corrected,'1d',0,externalChanged);assert.equal(summaryCalls,0);assert.deepEqual([matrixCalls,referenceCalls],beforeCoverage);
 view.renderCoverage(corrected,externalChanged);assert.ok(node('#matrix-coverage').innerHTML.includes('Updated public A'));assert.deepEqual([matrixCalls,referenceCalls],beforeCoverage);
 document.hidden=true;view.render(history,'1d',0,external);assert.deepEqual([matrixCalls,referenceCalls],beforeCoverage);
 console.log('JS: unified full Daily Hyperliquid matrix, aligned external confirmation without fallback, old-close corrections, funding-only cache reuse, collapsed-summary skipping and independent coverage rendering OK');
}
