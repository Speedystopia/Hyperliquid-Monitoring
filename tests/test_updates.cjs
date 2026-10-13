'use strict';
const assert=require('node:assert/strict');
const {createHistoryClient,createPoller}=require('../web/updates.js');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const response=(status,data,tag,jsonFn)=>({status,ok:status>=200&&status<300,headers:{get:()=>tag},json:jsonFn||async function(){return data;}});
async function testHistory(){
 let requests=0,parses=0,mode='ok',tag='v1';const headers=[];
 const client=createHistoryClient(async(path,options)=>{requests++;headers.push(options.headers);assert.equal(path,'/api/history');
  if(mode==='304')return response(304,null,'"v1"',()=>{throw Error('304 must not be parsed');});
  if(mode==='error')return response(503,null,null);
  return response(200,{version:tag},'"'+tag+'"',async()=>{parses++;return {version:tag};});
 });
 assert.equal((await client.load('v1')).changed,true);
 for(let i=0;i<100;i++)assert.equal((await client.load('v1')).changed,false);
 assert.equal(requests,1);assert.equal(parses,1);
 mode='304';assert.equal((await client.load('other-file-stamp')).changed,false);assert.equal(parses,1);assert.equal(headers.at(-1)['If-None-Match'],'"v1"');
 mode='error';await assert.rejects(client.load('v2'),/503/);assert.equal((await client.load('other-file-stamp')).changed,false);
 mode='ok';tag='v2';assert.equal((await client.load('v2')).data.version,'v2');assert.equal(parses,2);
 const controller=new AbortController();controller.abort();const before=requests;await assert.rejects(client.load('v3',controller.signal),{name:'AbortError'});assert.equal(requests,before);
 let abortParses=0;const abortClient=createHistoryClient(async()=>response(200,{ok:true},'"v1"',async()=>{abortParses++;return {ok:true};}));
 const pendingController=new AbortController(),pending=abortClient.load('v1',pendingController.signal);pendingController.abort();await assert.rejects(pending,{name:'AbortError'});assert.equal(abortParses,0);
 assert.equal((await abortClient.load('v1')).changed,true);
 let finishBody,decodeRequests=0;const decodedClient=createHistoryClient(async()=>{
  decodeRequests++;return response(200,{ok:true},'"decoded"',decodeRequests===1?()=>new Promise(resolve=>finishBody=resolve):async()=>({ok:true}));
 });
 const decodeController=new AbortController(),decoding=decodedClient.load('decoded',decodeController.signal);await settle();decodeController.abort();finishBody({ok:true});
 await assert.rejects(decoding,{name:'AbortError'});assert.equal((await decodedClient.load('decoded')).changed,true);assert.equal(decodeRequests,2);
 let accept=false;const validated=createHistoryClient(async()=>response(200,{ok:true},'"v1"'),()=>accept);
 await assert.rejects(validated.load('v1'),/Invalid history/);accept=true;assert.equal((await validated.load('v1')).changed,true);
 console.log('Updates: unchanged versions skip all JSON fetch/parse; ETag 304, errors, validation and cancelled cache loads OK');
}
async function testPoller(){
 const timers=new Map();let timerId=0,hidden=true,calls=0,active=0,maxActive=0,delayed=false,lastSignal;
 const poller=createPoller({hidden:()=>hidden,timeout:(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms});return id;},cancel:id=>timers.delete(id),
  check:async signal=>{calls++;active++;maxActive=Math.max(maxActive,active);lastSignal=signal;try{
   if(delayed)await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));
   return 2000;
  }finally{active--;}}
 });
 poller.resume();await settle();assert.equal(calls,0);assert.equal(timers.size,0);
 hidden=false;poller.resume();await settle();assert.equal(calls,1);assert.equal([...timers.values()][0].ms,2000);
 const stale=[...timers.values()][0].fn;hidden=true;poller.pause();assert.equal(timers.size,0);await stale();assert.equal(calls,1);
 hidden=false;poller.resume();await settle();assert.equal(calls,2);
 delayed=true;poller.request();poller.request();assert.equal(calls,3);assert.equal(maxActive,1);
 hidden=true;poller.pause();assert.equal(lastSignal.aborted,true);hidden=false;poller.resume();delayed=false;await settle();
 assert.equal(timers.size,1);const next=[...timers.values()][0];assert.equal(next.ms,0);await next.fn();await settle();assert.equal(calls,4);assert.equal(maxActive,1);
 hidden=true;poller.pause();await settle();assert.equal(timers.size,0);
 console.log('Updates: hidden tabs stop timers and abort requests; return refreshes immediately without overlapping requests OK');
}
async function testInterface(){
 const fs=require('node:fs'),vm=require('node:vm'),math=require('../web/math.js');
 const timers=new Map(),rafs=new Map(),elements=new Map(),documentEvents={},windowEvents={},resizeCallbacks=[];
 const requests={},calculations={},writes={};let timerId=0,rafId=0,canvasResizes=0,revision=1,hours=120,fundingNegative=true,fundingMultiplier=1,tltFundingRate=.0001,secPercent=87.6,secError='',weakCorrelations=false,accountReady=false,accountVersion=0;
 const context2d=new Proxy({measureText:text=>({width:text.length*6})},{get:(target,key)=>target[key]||(()=>{})});
 function element(id){if(elements.has(id))return elements.get(id);let html='',width=0,height=0;
  const el={id,value:'',checked:false,disabled:false,style:{},dataset:{},events:{},parentElement:{},textContent:'',offsetWidth:180,offsetHeight:100,className:'',hidden:false,classList:{toggle(){},contains(){return false;}},
   getBoundingClientRect:()=>({x:0,y:0,left:0,top:0,width:600,height:300}),addEventListener:(name,fn)=>el.events[name]=fn,setPointerCapture(){},getContext:()=>context2d,append(){},setAttribute(){},closest:()=>element('chart-card'),querySelector:()=>element('legend-item'),querySelectorAll:()=>[]};
  Object.defineProperty(el,'innerHTML',{get:()=>html,set:value=>{html=value;writes[id]=(writes[id]||0)+1;}});
  Object.defineProperty(el,'width',{get:()=>width,set:value=>{width=value;canvasResizes++;}});Object.defineProperty(el,'height',{get:()=>height,set:value=>{height=value;canvasResizes++;}});
  elements.set(id,el);if(['funding','price','combined'].includes(id))el.nextElementSibling=element(id+'-tip');return el;
 }
 for(const id of ['range','timezone','language','overlays','funding','price','combined'])element(id);
 element('range').value='30';element('timezone').value='UTC';element('language').value='en';element('overlays').checked=true;
 const frames=['4h','1d'].map(frame=>{const el=element('frame-'+frame);el.dataset.frame=frame;return el;});
 function fixture(){const data={schemaVersion:3,lastSuccessfulSync:hours*math.HOUR,benchmarks:{tltSecYield:{percent:secPercent,asOf:'2026-10-09',lastSuccessfulCheck:hours*math.HOUR,errorCode:secError}},markets:{}};
  for(const [i,m] of require('../web/catalog.js').keys.entries()){const market={price4hReachesFundingStart:true};
   for(const [name,span] of [['fundingHourly',1],['close4h',4],['close1d',24]]){const rows=Array.from({length:Math.floor(hours/span)},(_,j)=>({time:(j+1)*span*math.HOUR,...(name==='fundingHourly'?{fundingRate:m==='TLT'?tltFundingRate:.00001*(i+1)*(i===1?fundingMultiplier*(fundingNegative?-1:1):1)}:{close:100+i*10+j*.3+(i===8?-10:10)*Math.sin(j)})}));market[name]={rows,count:rows.length,firstTime:rows[0]?.time||0,lastTime:rows.at(-1)?.time||0,missingRanges:[]};}
   data.markets[m]=market;
  }return data;
 }
 const fakeFetch=async(path,options={})=>{requests[path]=(requests[path]||0)+1;
  if(path==='/api/status')return response(200,{syncing:false,queued:false,lastOk:true,errorCode:'',historyVersion:'v'+revision,lastSuccessfulSync:hours*math.HOUR,accountVersion,accountReady,accountBusy:false});
  if(path==='/api/history')return options.headers?.['If-None-Match']==='"v'+revision+'"'?response(304,null,'"v'+revision+'"'):response(200,fixture(),'"v'+revision+'"');
  if(path==='/api/startup')return response(200,{enabled:true});
  if(path==='/api/account'&&options.method==='POST'){accountReady=options.headers['X-Oil-Address']!=='clear';accountVersion++;return response(202,{queued:true});}
  if(path==='/api/account')return response(200,{address:'0x1111111111111111111111111111111111111111',scannedAt:hours*math.HOUR,accountCount:1,errors:[],positions:[{market:'BRENTOIL',name:'Test account',account:'0x1111111111111111111111111111111111111111',size:'1',entryPrice:'100',liquidationPrice:'80',fundingPaidSinceOpen:'-2'}]});
  throw Error('Unexpected request '+path);
 };
 const instrumented={...math};for(const name of ['aggregateFunding','fundingStats','correlation','positionSummary','correlationMatrix'])instrumented[name]=(...args)=>{calculations[name]=(calculations[name]||0)+1;const result=math[name](...args);return name==='correlationMatrix'&&weakCorrelations?result.map(row=>row.map(c=>({...c,percent:c.percent===null?null:c.percent*.5}))):result;};
 const document={hidden:false,querySelector:selector=>element(selector.slice(1)),querySelectorAll:selector=>selector==='[data-frame]'?frames:[],createElement:()=>element('created-'+Math.random()),addEventListener:(name,fn)=>documentEvents[name]=fn};
 const i18n={lang:'en',locale:'en-GB',translate:text=>String(text),tree(){},set(value){this.lang=value;this.locale=value==='fr'?'fr-FR':'en-GB';}};
 const context={OilMath:instrumented,OilUpdates:{createHistoryClient,createPoller},OilI18n:i18n,fetch:fakeFetch,document,window:{location:{hash:'#monitor/BRENTOIL/WTIOIL'},scrollTo(){},devicePixelRatio:1,addEventListener:(name,fn)=>windowEvents[name]=fn},
  ResizeObserver:class{constructor(fn){this.fn=fn;resizeCallbacks.push(fn);}observe(){this.fn();}},requestAnimationFrame:fn=>{const id=++rafId;rafs.set(id,fn);return id;},cancelAnimationFrame:id=>rafs.delete(id),
  setTimeout:(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),AbortController,DOMException,console};
 vm.createContext(context);for(const script of ['updates','catalog','analysis','research','global','app'])vm.runInContext(fs.readFileSync(require.resolve('../web/'+script+'.js'),'utf8'),context);
 function draw(){const batch=[...rafs.values()];rafs.clear();for(const callback of batch)callback();}
 async function tick(){assert.equal(timers.size,1);const timer=[...timers.values()][0];await timer.fn();await settle();draw();}
 await settle();draw();assert.equal(requests['/api/history'],1);assert.equal(requests['/api/startup'],1);
 const baseline={...calculations},cardWrites={...writes},resizes=canvasResizes;
 for(let i=0;i<10;i++)await tick();assert.equal(requests['/api/history'],1);assert.deepEqual(calculations,baseline);assert.equal(writes.metrics,cardWrites.metrics);assert.equal(writes.insights,cardWrites.insights);assert.equal(writes['research-results'],cardWrites['research-results']);assert.equal(writes['reference-cards'],cardWrites['reference-cards']);
 for(let i=0;i<20;i++)element('funding').events.pointermove({clientX:200+i,clientY:100});assert.equal(rafs.size,1);draw();assert.equal(canvasResizes,resizes);
 document.hidden=true;documentEvents.visibilitychange();assert.equal(timers.size,0);assert.equal(rafs.size,0);const hiddenRequests={...requests};revision++;hours++;
 for(const fn of resizeCallbacks)fn();await settle();assert.deepEqual(requests,hiddenRequests);assert.equal(rafs.size,0);
 document.hidden=false;documentEvents.visibilitychange();await settle();draw();assert.equal(requests['/api/history'],2);assert.equal(calculations.aggregateFunding,baseline.aggregateFunding+2);
 element('language').value='fr';const beforeLanguage={...calculations};element('language').onchange();await settle();draw();assert.deepEqual(calculations,beforeLanguage);assert.equal(requests['/api/history'],2);
 frames[1].onclick();draw();const afterDaily=calculations.aggregateFunding;frames[0].onclick();draw();assert.equal(calculations.aggregateFunding,afterDaily);
 element('address').value='0x1111111111111111111111111111111111111111';await element('account-form').onsubmit({preventDefault(){}});await settle();draw();assert.equal(requests['/api/account'],2);
 const positionCalculations=calculations.positionSummary;await tick();draw();assert.equal(requests['/api/account'],2);assert.equal(calculations.positionSummary,positionCalculations);
 await element('clear').onclick();await settle();draw();assert.equal(element('positions').innerHTML,'');
 const catalog=require('../web/catalog.js');let transfers=requests['/api/history'];
 for(let i=0;i<catalog.keys.length;i++)for(let j=i+1;j<catalog.keys.length;j++){const chosen=[catalog.keys[i],catalog.keys[j]];context.window.location.hash='#monitor/'+chosen.join('/');windowEvents.hashchange();draw();for(const market of chosen)assert.ok(element('metrics').innerHTML.includes(catalog.assets[market].name));assert.equal(element('home-view').hidden,true);}
 context.window.location.hash='#global';windowEvents.hashchange();draw();assert.equal(element('global-view').hidden,false);for(const asset of catalog.keys)assert.ok(element('matrix').innerHTML.includes(catalog.assets[asset].name.replace(/&/g,'&amp;')));
 assert.ok(element('positive-pairs').innerHTML.includes('same-direction'));assert.ok(element('inverse-pairs').innerHTML.includes('inverse-row'));assert.ok(!element('matrix').innerHTML.includes('style='));assert.equal(element('monitor-toolbar').hidden,true);assert.ok(element('matrix-method').textContent.includes('Daily'));assert.ok(element('matrix-method').textContent.includes('Tout l’historique'));const matrixCalls=calculations.correlationMatrix;await tick();assert.equal(calculations.correlationMatrix,matrixCalls);assert.equal(requests['/api/history'],transfers);element('correlation-mode').value='levels';element('correlation-mode').onchange();assert.equal(calculations.correlationMatrix,matrixCalls+1);
 assert.ok(element('funding-pairs').innerHTML.includes('negative'));assert.ok(element('funding-pairs').innerHTML.includes('WTI'));const annualCalls=calculations.fundingStats;await tick();assert.equal(calculations.fundingStats,annualCalls);
 let fundingHtml=element('funding-pairs').innerHTML;assert.ok(fundingHtml.includes('Corrélation · tout l’historique'));assert.ok(fundingHtml.includes('Funding net annualisé'));assert.ok(fundingHtml.includes('Short A · Long B · montants égaux'));assert.ok(fundingHtml.includes('Long A · Short B · montants égaux'));assert.ok(!/class="funding-net funding-net-\w+">-/.test(fundingHtml));assert.ok(/class="funding-net funding-net-below">\+/.test(fundingHtml));assert.ok(fundingHtml.includes('Référence TLT'));
 const netValues=html=>[...html.matchAll(/class="funding-net funding-net-\w+">([^<]+)/g)].map(m=>m[1]);const previousNet=netValues(fundingHtml);
 const dataRows=html=>((html.split('<tbody>')[1]||'').match(/<tr(?:>| )/g)||[]).length;
 assert.ok(dataRows(fundingHtml)>1);assert.ok(!fundingHtml.includes('correlation-danger'));
 weakCorrelations=true;revision++;await tick();assert.equal(dataRows(element('funding-pairs').innerHTML),1);assert.ok(element('funding-pairs').innerHTML.includes('Dangereux'));assert.ok(element('funding-pairs').innerHTML.includes('correlation-risk'));assert.equal((element('positive-pairs').innerHTML.match(/class="inverse-row/g)||[]).length,1);
 weakCorrelations=false;revision++;await tick();assert.ok(dataRows(element('funding-pairs').innerHTML)>1);assert.ok(!element('funding-pairs').innerHTML.includes('correlation-danger'));
 secPercent=26.28;revision++;await tick();assert.ok(element('funding-pairs').innerHTML.includes('funding-net-near'));assert.deepEqual(netValues(element('funding-pairs').innerHTML),previousNet);
 secPercent=0;revision++;await tick();assert.ok(element('funding-pairs').innerHTML.includes('funding-net-above'));
 secError='TLT_SEC_HTTP_503';revision++;await tick();assert.ok(element('funding-pairs').innerHTML.includes(secError));assert.ok(element('funding-pairs').innerHTML.includes('dernier taux connu conservé'));assert.ok(element('funding-pairs').innerHTML.includes('funding-net-above'));
 secPercent=null;revision++;await tick();assert.ok(element('funding-pairs').innerHTML.includes('funding-net-unknown'));assert.ok(!element('funding-pairs').innerHTML.includes('funding-net-above'));assert.ok(element('funding-pairs').innerHTML.includes('Rendement SEC indisponible'));
 secPercent=26.28;secError='';revision++;await tick();const beforePerp=[...element('funding-pairs').innerHTML.matchAll(/class="funding-net funding-net-\w+">/g)].map(m=>m[0]);tltFundingRate=.00003;revision++;await tick();assert.deepEqual([...element('funding-pairs').innerHTML.matchAll(/class="funding-net funding-net-\w+">/g)].map(m=>m[0]),beforePerp);
 fundingMultiplier=2;revision++;await tick();assert.notDeepEqual(netValues(element('funding-pairs').innerHTML),previousNet);
 fundingNegative=false;revision++;await tick();assert.ok(element('funding-pairs').innerHTML.includes('Aucune paire'));
 element('correlation-mode').value='returns';element('correlation-mode').onchange();assert.ok(element('inverse-funding-pairs').innerHTML.includes('Short A · Short B · montants égaux'));assert.ok(element('inverse-funding-pairs').innerHTML.includes('negative'));assert.ok(element('inverse-funding-pairs').innerHTML.includes('rendement SEC à 30 jours'));
 const inverseBefore=element('inverse-funding-pairs').innerHTML;tltFundingRate=.00002;revision++;await tick();assert.notEqual(element('inverse-funding-pairs').innerHTML,inverseBefore);transfers=requests['/api/history'];
 weakCorrelations=true;revision++;await tick();assert.equal(dataRows(element('inverse-funding-pairs').innerHTML),1);assert.ok(element('inverse-funding-pairs').innerHTML.includes('Dangereux'));assert.equal((element('inverse-pairs').innerHTML.match(/class="inverse-row/g)||[]).length,1);transfers=requests['/api/history'];
 context.window.location.hash='#home';windowEvents.hashchange();draw();assert.equal(element('home-view').hidden,false);assert.equal(element('monitor-content').hidden,true);assert.equal((element('market-cards').innerHTML.match(/class=\"market-card/g)||[]).length,2);
 const homeCalculations={...calculations};await tick();assert.deepEqual(calculations,homeCalculations);assert.equal(requests['/api/history'],transfers);
 document.hidden=true;documentEvents.visibilitychange();
 console.log('Interface: all 105 comparisons, four ranking tables, SEC-only/funding-only refresh, source failure/neutral colors and independent TLT funding OK');
 console.log('Interface: ten idle polls cause no history transfer, statistics recalculation or card rewrites; hidden tab/return, cached frame/locale/positions and coalesced canvas drawing OK');
}
(async()=>{await testHistory();await testPoller();await testInterface();})().catch(error=>{console.error(error);process.exitCode=1;});
