'use strict';
(function(root){
 const HOUR=3600000,DAY=24*HOUR,YEAR=365,cache=new WeakMap(),pairCache=new WeakMap();
 // Legacy cost/calendar defaults preserve the standalone API. The application
 // selects hyperliquid/adaptive explicitly; legacy assumptions are never a fallback.
 const defaults={anchorNotionalUsdc:1000,feeBps:4.5,slippageBps:2,trainingDays:180,minTrainingDays:60,minTestDays:30,rebalanceDays:7,hedgeLookbackDays:90,costMode:'legacy',feeMode:'taker',rebalanceMode:'calendar',rebalanceThresholdPct:20,rebalanceMinObservations:30,bookMaxAgeHours:2};
 function moment(rows){
  let n=0,x=0,y=0,xx=0,yy=0,xy=0;
  for(const r of rows){n++;const dx=r.a-x,dy=r.b-y;x+=dx/n;y+=dy/n;xx+=dx*(r.a-x);yy+=dy*(r.b-y);xy+=dx*(r.b-y);}
  return {n,x,y,xx,yy,xy};
 }
 function correlation(rows){
  const m=moment(rows),r=m.n>=3&&m.xx>0&&m.yy>0?Math.max(-1,Math.min(1,m.xy/Math.sqrt(m.xx*m.yy))):null;
  let confidence=null;if(r!==null&&m.n>3){const z=Math.atanh(Math.max(-.999999,Math.min(.999999,r))),d=1.96/Math.sqrt(m.n-3);confidence={low:100*Math.tanh(z-d),high:100*Math.tanh(z+d),assumption:'Approximate 95% Fisher interval assuming independent observations; serial dependence can make it too narrow.'};}
  return {percent:r===null?null:r*100,count:m.n,first:rows[0]?.time??null,last:rows.at(-1)?.time??null,confidence};
 }
 function volatility(values){if(values.length<2)return null;const mean=values.reduce((a,b)=>a+b,0)/values.length;return Math.sqrt(values.reduce((a,b)=>a+(b-mean)**2,0)/(values.length-1)*YEAR)*100;}
 function normalize(market){
  const prices=[...new Map((market?.close1d?.rows||[]).filter(r=>Number.isFinite(r.time)&&Number.isFinite(r.close)&&r.close>0).map(r=>[r.time,{time:r.time,value:r.close}])).values()].sort((a,b)=>a.time-b.time);
  const returns=[],byPrice=new Map(prices.map(r=>[r.time,r.value]));
  for(let i=1;i<prices.length;i++)if(prices[i].time-prices[i-1].time===DAY)returns.push({time:prices[i].time,value:prices[i].value/prices[i-1].value-1});
  const funding=[...new Map((market?.fundingHourly?.rows||[]).filter(r=>Number.isFinite(r.time)&&Number.isFinite(r.fundingRate)&&Number.isFinite(r.intervalHours??1)&&(r.intervalHours??1)>0).map(r=>[r.time,{time:r.time,rate:r.fundingRate,hours:r.intervalHours??1,start:r.time-(r.intervalHours??1)*HOUR}])).values()].sort((a,b)=>a.time-b.time);
  return {prices,returns,byPrice,funding,fundingByInterval:new Map(funding.map(r=>[r.start+':'+r.time,r])),metadata:market};
 }
 function prepare(history,catalog){
  if(!history||typeof history!=='object')return {history,markets:{}};if(cache.has(history))return cache.get(history);
  const markets={};for(const key of catalog?.keys||Object.keys(history.markets||{}))markets[key]=normalize(history.markets[key]);
  const out={history,markets};cache.set(history,out);return out;
 }
 function matchReturns(a,b){const map=new Map(b.returns.map(r=>[r.time,r.value]));return a.returns.filter(r=>map.has(r.time)).map(r=>({time:r.time,a:r.value,b:map.get(r.time)}));}
 function matchFunding(a,b){return a.funding.flatMap(r=>{const q=b.fundingByInterval.get(r.start+':'+r.time);return q?[{time:r.time,start:r.start,hours:r.hours,a:r.rate,b:q.rate}]:[];});}
 function fundingWindow(rows,start,end){
  const selected=rows.filter(r=>r.start>=start&&r.time<=end),hours=selected.reduce((n,r)=>n+r.hours,0),a=selected.reduce((n,r)=>n+r.a,0),b=selected.reduce((n,r)=>n+r.b,0);
  const positiveA=selected.filter(r=>r.a>0).reduce((n,r)=>n+r.hours,0),positiveB=selected.filter(r=>r.b>0).reduce((n,r)=>n+r.hours,0);
  return {annualizedA:hours?a/hours*8760*100:null,annualizedB:hours?b/hours*8760*100:null,count:selected.length,hours,coveragePct:Number.isFinite(start)&&Number.isFinite(end)&&end>start?Math.min(100,hours*HOUR/(end-start)*100):null,positiveShareA:hours?positiveA/hours*100:null,positiveShareB:hours?positiveB/hours*100:null,signChangesA:selected.slice(1).filter((r,i)=>Math.sign(r.a)!==Math.sign(selected[i].a)).length,signChangesB:selected.slice(1).filter((r,i)=>Math.sign(r.b)!==Math.sign(selected[i].b)).length,first:selected[0]?.start??null,last:selected.at(-1)?.time??null,start,end,eligible:hours>=30*24&&hours*HOUR>=(end-start)*.99};
 }
 function estimate(rows,fund){
  const m=moment(rows),rawRatio=m.yy>0?Math.abs(m.xy/m.yy):null,ratio=rawRatio===null?null:Math.max(.1,Math.min(10,rawRatio)),corr=correlation(rows),same=corr.percent!==null&&corr.percent>=0;
  let directionA=null,directionB=null;
  if(Number.isFinite(ratio)&&Number.isFinite(fund.annualizedA)&&Number.isFinite(fund.annualizedB)&&corr.percent!==null){if(same){directionA=fund.annualizedA-ratio*fund.annualizedB>=0?-1:1;directionB=-directionA;}else{directionA=directionB=fund.annualizedA+ratio*fund.annualizedB>=0?-1:1;}}
  return {ratio,rawRatio,directionA,directionB,correlation: corr.percent,count:rows.length};
 }
 function risk(rows,ratio,directionA,directionB){if(!Number.isFinite(ratio)||!directionA||!directionB)return null;return volatility(rows.map(r=>(directionA*r.a+ratio*directionB*r.b)/(1+ratio)));}
 function longestSegment(rows){let best=[],current=[];for(const row of rows){if(current.length&&row.time-current.at(-1).time!==DAY){if(current.length>=best.length)best=current;current=[];}current.push(row);}return current.length>=best.length?current:best;}
 function quoteBook(book,notionalUsdc,side,now=Date.now(),maxAgeHours=2){
  if(!book||book.available===false||book.errorCode)return {available:false,reason:'DEPTH_BOOK_UNAVAILABLE'};
  const time=book.collectedAt||book.time;if(!Number.isFinite(time)||now-time>maxAgeHours*HOUR||time>now+5*60*1000)return {available:false,reason:'DEPTH_BOOK_STALE',time};
  const bids=(book.bids||[]).filter(r=>Number.isFinite(r.px)&&r.px>0&&Number.isFinite(r.sz)&&r.sz>0).slice().sort((a,b)=>b.px-a.px),asks=(book.asks||[]).filter(r=>Number.isFinite(r.px)&&r.px>0&&Number.isFinite(r.sz)&&r.sz>0).slice().sort((a,b)=>a.px-b.px);
  const mid=Number.isFinite(book.mid)&&book.mid>0?book.mid:bids.length&&asks.length?(bids[0].px+asks[0].px)/2:null;
  if(!Number.isFinite(notionalUsdc)||notionalUsdc<0||!mid||!bids.length||!asks.length||bids[0].px>asks[0].px||!['buy','sell'].includes(side))return {available:false,reason:'DEPTH_BOOK_INVALID',time};
  const quantity=notionalUsdc/mid,levels=side==='buy'?asks:bids;let remaining=quantity,value=0,used=0;
  for(const level of levels){const take=Math.min(remaining,level.sz);if(take>0){value+=take*level.px;remaining-=take;used++;}if(remaining<=Math.max(1e-12,quantity*1e-10))break;}
  if(remaining>Math.max(1e-12,quantity*1e-10))return {available:false,reason:'DEPTH_BOOK_INSUFFICIENT',time,notionalUsdc,side,quantity,unfilledQuantity:remaining,levels:used};
  const vwap=quantity?value/quantity:mid,slippageUsdc=Math.max(0,(side==='buy'?vwap-mid:mid-vwap)*quantity);
  return {available:true,time,notionalUsdc,side,quantity,mid,vwap,executionNotionalUsdc:value,slippageUsdc,slippageBps:notionalUsdc?slippageUsdc/notionalUsdc*10000:0,levels:used,source:book.source||'Hyperliquid l2Book'};
 }
 function executionContext(history,marketA,marketB,options={}){
  const mode=options.costMode||defaults.costMode,feeMode=options.feeMode||defaults.feeMode,reference=history?.marketReferences,execution=reference?.execution,books=reference?.depthBooks;
  const override=options.accountFees||options.executionOverrides,fees={};for(const market of [marketA,marketB])fees[market]=override?(override.errorCode?null:override.markets?.[market]||null):execution?.markets?.[market]||null;
  return {mode,feeMode,marketA,marketB,legA:fees[marketA],legB:fees[marketB],fees,books:books||{},time:override?.time??execution?.time??null,source:override?.source??execution?.source??null,accountFeesUsed:!!options.accountFees,available:mode==='legacy'||[marketA,marketB].every(m=>Number.isFinite(fees[m]?.[feeMode+'FeeBps'])&&!fees[m]?.errorCode&&!!fees[m]?.source),now:options.executionNow??Date.now(),maxAgeHours:options.bookMaxAgeHours??defaults.bookMaxAgeHours};
 }
 function tradeCost(context,market,notionalUsdc,side,options){
  if(context.mode==='legacy'){const feeUsdc=notionalUsdc*options.feeBps/10000,slippageUsdc=notionalUsdc*options.slippageBps/10000;return {available:true,market,notionalUsdc,side,feeUsdc,slippageUsdc,costsUsdc:feeUsdc+slippageUsdc,source:'Explicit legacy cost assumptions'};}
  const fee=context.fees[market],feeBps=fee?.[context.feeMode+'FeeBps'];
  if(!Number.isFinite(feeBps)||fee?.errorCode||!fee?.source)return {available:false,reason:'EXECUTION_FEES_UNAVAILABLE',market};
  if(context.feeMode==='maker')return {available:false,reason:'MAKER_FILL_UNMODELED',market,feeBps,source:fee.source};
  const quote=quoteBook(context.books[market],notionalUsdc,side,context.now,context.maxAgeHours);if(!quote.available)return {...quote,market};
  const feeUsdc=quote.executionNotionalUsdc*feeBps/10000;return {...quote,market,feeBps,feeSource:fee.source,feeUsdc,costsUsdc:feeUsdc+quote.slippageUsdc};
 }
 function backtest(rows,funding,a,b,options={},context){
  const o={...defaults,...options};for(const key of Object.keys(defaults))if(typeof defaults[key]==='number'&&(!Number.isFinite(o[key])||o[key]<0))o[key]=defaults[key];o.anchorNotionalUsdc=Math.max(1,o.anchorNotionalUsdc);o.minTrainingDays=Math.max(30,Math.floor(o.minTrainingDays));o.minTestDays=Math.max(30,Math.floor(o.minTestDays));o.rebalanceDays=Math.max(1,Math.floor(o.rebalanceDays));o.hedgeLookbackDays=Math.max(30,Math.floor(o.hedgeLookbackDays));o.rebalanceMinObservations=Math.max(30,Math.floor(o.rebalanceMinObservations));
  if(!['legacy','hyperliquid'].includes(o.costMode))o.costMode='hyperliquid';if(!['taker','maker'].includes(o.feeMode))o.feeMode='taker';if(!['adaptive','calendar','none'].includes(o.rebalanceMode))o.rebalanceMode='adaptive';
  context=context||executionContext(null,'A','B',o);
  // Price-only history before the first common actual payment cannot be a funding backtest.
  const firstFunding=funding[0]?.start??Infinity,lastFunding=funding.at(-1)?.time??-Infinity;
  const segment=longestSegment(rows.filter(r=>r.time-DAY>=firstFunding&&r.time<=lastFunding)),trainCount=Math.max(0,Math.min(Math.max(o.minTrainingDays,Math.floor(o.trainingDays)),Math.max(o.minTrainingDays,Math.floor(segment.length*.7)),segment.length-o.minTestDays)),flags=[];
  const assumptions={...o,costs:o.costMode==='hyperliquid'?'Current verified Hyperliquid fees by leg and current L2 depth are projected onto hypothetical historical trades. They are not historical fills or historical fee tiers. No invented slippage fallback.':'Explicit legacy configurable cost assumptions; no verified exchange costs.',rebalance:'Adaptive checks use past covariance / variance and effective notional ratio; threshold is a configurable strategy assumption, not a Hyperliquid protocol rule. Uncertain or reversed correlation blocks resizing.',fundingValuation:'Each actual payment uses position quantity × preceding daily close; intraday mark prices are unavailable. No hourly rate interpolation.',capitalBasis:'User-selected hypothetical opening notional, without leverage; excludes liquidation, collateral interest and funding prediction.',validation:'Chronological hold-out; initial directions and hedge use training only. Resizing uses only past returns; directions stay fixed.'};
  if(trainCount<o.minTrainingDays||segment.length-trainCount<o.minTestDays)return {available:false,reason:'INSUFFICIENT_OUT_OF_SAMPLE',trainingDays:trainCount,testDays:Math.max(0,segment.length-trainCount),timeline:[],flags:['INSUFFICIENT_OUT_OF_SAMPLE'],assumptions};
  const training=segment.slice(0,trainCount),start=training.at(-1).time,end=segment.at(-1).time,trainFund=fundingWindow(funding,training[0].time-DAY,start),model=estimate(training,trainFund);
  const trainingIncomplete=trainFund.hours*HOUR!==trainCount*DAY;
  if(trainingIncomplete)flags.push('TRAINING_INCOMPLETE_FUNDING');
  if(!Number.isFinite(model.ratio)||!model.directionA)return {available:false,reason:'INVALID_TRAINING_MODEL',trainingDays:trainCount,testDays:segment.length-trainCount,timeline:[],flags:[...flags,'INVALID_TRAINING_MODEL'],assumptions};
  const anchor=o.anchorNotionalUsdc,totalNotional=anchor*(1+model.ratio),directionA=model.directionA,directionB=model.directionB;
  let costs=0,feeUsdc=0,slippageUsdc=0,feeUsdcA=0,feeUsdcB=0,slippageUsdcA=0,slippageUsdcB=0;const fills=[];
  const charge=(market,notional,side,time,kind)=>{const quote=tradeCost(context,market,notional,side,o);if(!quote.available)return quote;fills.push({...quote,historicalTime:time,kind});costs+=quote.costsUsdc;feeUsdc+=quote.feeUsdc;slippageUsdc+=quote.slippageUsdc;if(market===context.marketA){feeUsdcA+=quote.feeUsdc;slippageUsdcA+=quote.slippageUsdc;}else{feeUsdcB+=quote.feeUsdc;slippageUsdcB+=quote.slippageUsdc;}return quote;};
  const unavailable=quote=>({available:false,reason:quote.reason||'EXECUTION_COSTS_UNAVAILABLE',trainingDays:trainCount,testDays:segment.length-trainCount,start,end,model,timeline:[],flags:[...new Set([...flags,quote.reason||'EXECUTION_COSTS_UNAVAILABLE'])],executionCosts:{...context,available:false,failedQuote:quote,fills},assumptions});
  const openingA=charge(context.marketA,anchor,directionA>0?'buy':'sell',start,'open');if(!openingA.available)return unavailable(openingA);
  const openingB=charge(context.marketB,anchor*model.ratio,directionB>0?'buy':'sell',start,'open');if(!openingB.available)return unavailable(openingB);
  let ratio=model.ratio,qA=directionA*anchor/a.byPrice.get(start),qB=directionB*anchor*ratio/b.byPrice.get(start),pricePnl=0,fundingPnl=0,peak=totalNotional,maxDrawdown=costs/totalNotional*100,rebalances=0,blockedRebalances=0,rebalanceChecks=0;const rebalanceEvents=[];
  const timeline=[{time:start,grossPriceUsdc:0,fundingUsdc:0,costsUsdc:costs,netUsdc:-costs,equityUsdc:totalNotional-costs}],testRows=segment.slice(trainCount),fundByDay=new Map();
  for(const r of funding){const day=Math.ceil(r.time/DAY)*DAY;let list=fundByDay.get(day);if(!list){list=[];fundByDay.set(day,list);}list.push(r);}
  let missedFundingDays=0,turnover=totalNotional;
  for(let i=0;i<testRows.length;i++){
   const row=testRows[i],prior=row.time-DAY,pa=a.byPrice.get(prior),pb=b.byPrice.get(prior),ca=a.byPrice.get(row.time),cb=b.byPrice.get(row.time);
   if(i>0&&o.rebalanceMode!=='none'&&(o.rebalanceMode==='adaptive'||i%o.rebalanceDays===0)){
    rebalanceChecks++;const past=segment.filter(r=>r.time<=prior&&r.time>prior-o.hedgeLookbackDays*DAY),next=estimate(past,trainFund),confidence=correlation(past).confidence;
    const safe=past.length>=o.rebalanceMinObservations&&Number.isFinite(next.ratio)&&next.rawRatio===next.ratio&&Math.abs(next.correlation)>66&&Math.sign(next.correlation)===Math.sign(model.correlation)&&confidence&&(confidence.low>0||confidence.high<0);
    const effectiveRatio=Math.abs(qB)*pb/(Math.abs(qA)*pa),deviation=Number.isFinite(next.ratio)?Math.abs(next.ratio/effectiveRatio-1)*100:null,event={time:prior,targetRatio:next.ratio,effectiveRatio,driftPct:deviation,observations:past.length,correlation:next.correlation,changed:false,blocked:!safe,reason:safe?null:'REBALANCE_SIGNAL_UNCERTAIN'};rebalanceEvents.push(event);
    if(!safe){blockedRebalances++;flags.push('REBALANCE_SIGNAL_UNCERTAIN');}
    else{
     if(o.rebalanceMode==='calendar'||deviation>o.rebalanceThresholdPct){
      ratio=next.ratio;const qa=o.rebalanceMode==='calendar'?directionA*anchor/pa:qA,qb=directionB*Math.abs(qa)*pa*ratio/pb,changeA=(qa-qA)*pa,changeB=(qb-qB)*pb;
      if(Math.abs(changeA)>1e-8){const cost=charge(context.marketA,Math.abs(changeA),changeA>0?'buy':'sell',prior,'rebalance');if(!cost.available)return unavailable(cost);}
      if(Math.abs(changeB)>1e-8){const cost=charge(context.marketB,Math.abs(changeB),changeB>0?'buy':'sell',prior,'rebalance');if(!cost.available)return unavailable(cost);}
      turnover+=Math.abs(changeA)+Math.abs(changeB);qA=qa;qB=qb;rebalances++;event.changed=true;event.tradeNotionalA=Math.abs(changeA);event.tradeNotionalB=Math.abs(changeB);
     }
    }
   }
   pricePnl+=qA*(ca-pa)+qB*(cb-pb);
   const payments=(fundByDay.get(row.time)||[]).filter(f=>f.start>=prior),hours=payments.reduce((sum,f)=>sum+f.hours,0);
   // Retain every known synchronized payment even on an incomplete day. Missing
   // cash flows remain unknown, rather than being silently treated as zero.
   for(const f of payments)fundingPnl-=qA*pa*f.a+qB*pb*f.b;
   if(hours!==24)missedFundingDays++;
   if(i===testRows.length-1){const closeA=Math.abs(qA)*ca,closeB=Math.abs(qB)*cb,costA=charge(context.marketA,closeA,directionA>0?'sell':'buy',row.time,'close');if(!costA.available)return unavailable(costA);const costB=charge(context.marketB,closeB,directionB>0?'sell':'buy',row.time,'close');if(!costB.available)return unavailable(costB);turnover+=closeA+closeB;}
   const net=pricePnl+fundingPnl-costs,equity=totalNotional+net;peak=Math.max(peak,equity);maxDrawdown=Math.max(maxDrawdown,(peak-equity)/peak*100);
   timeline.push({time:row.time,grossPriceUsdc:pricePnl,fundingUsdc:fundingPnl,costsUsdc:costs,netUsdc:net,equityUsdc:equity,ratio,effectiveRatio:Math.abs(qB)*cb/(Math.abs(qA)*ca)});
  }
  if(missedFundingDays)flags.push('BACKTEST_INCOMPLETE_FUNDING');if(model.rawRatio!==model.ratio)flags.push('HEDGE_RATIO_CAPPED');flags.push('FUNDING_PRICE_PROXY');if(o.costMode==='hyperliquid')flags.push('CURRENT_EXECUTION_PROJECTION');
  const net=pricePnl+fundingPnl-costs,netPct=net/totalNotional*100;
  return {available:true,eligible:!missedFundingDays&&!trainingIncomplete&&model.rawRatio===model.ratio,cashflowComplete:!missedFundingDays,trainingFundingComplete:!trainingIncomplete,trainingFundingCoveragePct:trainFund.coveragePct,trainingFundingHours:trainFund.hours,fundingPriceProxy:true,completeness:missedFundingDays||trainingIncomplete?'partial':'estimated',trainingDays:trainCount,testDays:testRows.length,start,end,model,directionA:directionA>0?'long':'short',directionB:directionB>0?'long':'short',totalNotionalUsdc:totalNotional,grossPriceUsdc:pricePnl,fundingUsdc:fundingPnl,fundingKnownUsdc:fundingPnl,costsUsdc:costs,feeUsdc,slippageUsdc,feeUsdcA,feeUsdcB,slippageUsdcA,slippageUsdcB,executionCosts:{available:true,mode:o.costMode,feeMode:o.feeMode,time:context.time,legA:context.legA,legB:context.legB,openingA,openingB,fills,projection:o.costMode==='hyperliquid',accountFeesUsed:context.accountFeesUsed},netUsdc:net,netPct,maxDrawdownPct:maxDrawdown,returnAnnualizedPct:missedFundingDays||trainingIncomplete?null:netPct*YEAR/testRows.length,rebalanceCount:rebalances,rebalanceChecks,blockedRebalances,rebalanceEvents,lastRebalance:rebalanceEvents.filter(e=>e.changed).at(-1)||null,rebalanceMode:o.rebalanceMode,rebalanceThresholdPct:o.rebalanceThresholdPct,turnoverUsdc:turnover,fundingCompleteDays:testRows.length-missedFundingDays,fundingIncompleteDays:missedFundingDays,fundingExcludedDays:missedFundingDays,timeline,flags:[...new Set(flags)],assumptions};
 }
 function calculatePair(history,marketA,marketB,options={}){
  const prepared=prepare(history),a=prepared.markets[marketA],b=prepared.markets[marketB],flags=[];
  if(!a||!b||marketA===marketB)return {marketA,marketB,available:false,flags:['INVALID_PAIR']};
  const rows=matchReturns(a,b),funding=matchFunding(a,b),end=rows.at(-1)?.time??0,start=rows[0]?rows[0].time-DAY:0;
  const correlations={full:correlation(rows)};for(const days of [30,90,180])correlations['d'+days]=correlation(rows.filter(r=>r.time>end-days*DAY));
  const rolling=[];for(let i=29;i<rows.length;i+=7){const sample=rows.filter(r=>r.time<=rows[i].time&&r.time>rows[i].time-30*DAY);if(sample.length>=20){const c=correlation(sample);if(c.percent!==null)rolling.push(c.percent);}}
  correlations.signStability={count:rolling.length,sameSignPct:rolling.length&&correlations.full.percent!==null?rolling.filter(r=>Math.sign(r)===Math.sign(correlations.full.percent)).length/rolling.length*100:null,min:rolling.length?Math.min(...rolling):null,max:rolling.length?Math.max(...rolling):null,windowDays:30,stepDays:7};
  const fundingStart=funding[0]?.start??0,fundingEnd=funding.at(-1)?.time??0;
  const funds={full:fundingWindow(funding,fundingStart,fundingEnd),first:funding.length?fundingStart:null,last:funding.length?fundingEnd:null};for(const days of [7,30,90])funds['d'+days]=fundingWindow(funding,Math.max(fundingStart,fundingEnd-days*DAY),fundingEnd);
  funds.signStability={positiveShareA:funds.full.positiveShareA,positiveShareB:funds.full.positiveShareB,signChangesA:funds.full.signChangesA,signChangesB:funds.full.signChangesB};
  const recent=rows.filter(r=>r.time>end-90*DAY),model=estimate(recent,funds.d90),hedge={...model,directionA:model.directionA===null?null:model.directionA>0?'long':'short',directionB:model.directionB===null?null:model.directionB>0?'long':'short',orientation:model.directionA===null?'unavailable':model.directionA===model.directionB?(model.directionA>0?'long-long':'short-short'):(model.directionA>0?'long-short':'short-long'),equalVolPct:risk(rows,1,model.directionA,model.directionB),hedgedVolPct:risk(rows,model.ratio,model.directionA,model.directionB),legAVolPct:volatility(rows.map(r=>r.a)),legBVolPct:volatility(rows.map(r=>r.b)),trainingCount:recent.length,windowDays:90,basis:'Descriptive latest 90-day hedge; distinct from chronological held-out backtest model.'};
  const annualNet=f=>model.directionA&&Number.isFinite(model.ratio)&&Number.isFinite(f.annualizedA)&&Number.isFinite(f.annualizedB)?-model.directionA*f.annualizedA-model.ratio*model.directionB*f.annualizedB:null;
  for(const f of [funds.full,funds.d7,funds.d30,funds.d90]){f.estimatedNetOnLegAPct=annualNet(f);f.estimatedNetOnGrossPct=f.estimatedNetOnLegAPct===null?null:f.estimatedNetOnLegAPct/(1+model.ratio);f.estimatedRatio=model.ratio;}
  const expectedDays=end>start?Math.round((end-start)/DAY):0,missingDays=Math.max(0,expectedDays-rows.length),coverage=funds.full.coveragePct;
  if(rows.length<180)flags.push('SHORT_PRICE_HISTORY');if(rows.length<30)flags.push('INSUFFICIENT_PRICE_SAMPLE');if(missingDays)flags.push('PRICE_GAPS');if(correlations.full.percent===null)flags.push('ZERO_VARIANCE_OR_INSUFFICIENT_SAMPLE');else if(Math.abs(correlations.full.percent)<=66)flags.push('WEAK_CORRELATION');
  if(correlations.signStability.sameSignPct!==null&&correlations.signStability.sameSignPct<80)flags.push('UNSTABLE_CORRELATION_SIGN');
  if(correlations.full.percent!==null&&correlations.d30.percent!==null&&Math.sign(correlations.full.percent)!==Math.sign(correlations.d30.percent))flags.push('RECENT_CORRELATION_REVERSAL');
  if(correlations.full.percent!==null&&Math.abs(correlations.full.percent)>66&&correlations.d30.percent!==null&&Math.abs(correlations.d30.percent)<=66)flags.push('WEAK_RECENT_CORRELATION');
  if(correlations.d90.confidence&&correlations.d90.confidence.low<=0&&correlations.d90.confidence.high>=0)flags.push('HEDGE_DIRECTION_UNCERTAIN');
  if(funds.d30.estimatedNetOnLegAPct!==null&&funds.d30.estimatedNetOnLegAPct<0)flags.push('NEGATIVE_RECENT_CARRY');
  if(funding.length&&(fundingStart!==start||fundingEnd!==end))flags.push('FUNDING_PRICE_PERIODS_DIFFER');
  if(coverage===null||coverage<99)flags.push('INCOMPLETE_MATCHED_FUNDING');if(funds.d30.hours<720||!funds.d30.eligible)flags.push('SHORT_RECENT_FUNDING_SAMPLE');if(model.rawRatio!==null&&model.rawRatio!==model.ratio)flags.push('HEDGE_RATIO_CAPPED');
  const executionCosts=executionContext(history,marketA,marketB,options),simulation=backtest(rows,funding,a,b,options,executionCosts);flags.push(...simulation.flags);
  return {marketA,marketB,available:rows.length>0,correlation:correlations,hedge,funding:funds,executionCosts:simulation.executionCosts||executionCosts,quality:{matchedDays:rows.length,expectedDays,missingDays,start,end,fundingStart:funding.length?fundingStart:null,fundingEnd:funding.length?fundingEnd:null,fundingDays:funding.length?(fundingEnd-fundingStart)/DAY:0,fundingCoveragePct:coverage,matchedFundingPayments:funding.length,unmatchedFundingA:a.funding.length-funding.length,unmatchedFundingB:b.funding.length-funding.length,flags:[...new Set(flags)]},backtest:simulation,flags:[...new Set(flags)],method:'Adjacent daily percentage returns on common timestamps; no interpolation. Metrics are separate, without an aggregate reliability score.'};
 }
 function analyzePair(history,marketA,marketB,options={}){
  if(!history||typeof history!=='object')return {marketA,marketB,available:false,flags:['INVALID_PAIR']};
  // Time crosses only bounded validity states. Unchanged polls reuse the result,
  // but a cached success expires even if an unreachable source leaves JSON unchanged.
  const now=options.executionNow??Date.now(),maxAge=options.bookMaxAgeHours??defaults.bookMaxAgeHours;
  const bookValidity=[marketA,marketB].map(m=>{const book=history.marketReferences?.depthBooks?.[m],time=book?.collectedAt||book?.time;return Number.isFinite(time)?[now-time>maxAge*HOUR,time>now+5*60*1000]:null;});
  let pairs=pairCache.get(history);if(!pairs){pairs=new Map();pairCache.set(history,pairs);}const key=JSON.stringify([marketA,marketB,Object.keys(defaults).map(k=>options[k]??defaults[k]),options.accountFees??options.executionOverrides??null,bookValidity]);
  if(pairs.has(key))return pairs.get(key);const result=calculatePair(history,marketA,marketB,options);if(pairs.size>=24)pairs.delete(pairs.keys().next().value);pairs.set(key,result);return result;
 }
 const api={prepare,analyzePair,correlation,matchFunding,fundingWindow,backtest,executionContext,quoteBook,defaults,HOUR,DAY};if(typeof module!=='undefined')module.exports=api;else root.OilAnalysis=api;
})(globalThis);
