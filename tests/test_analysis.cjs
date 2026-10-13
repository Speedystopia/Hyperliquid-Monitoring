'use strict';
const assert=require('node:assert/strict'),analysis=require('../web/analysis.js');
const {DAY,HOUR}=analysis;
function fixture({days=240,bMultiplier=1,rateA=.00001,rateB=-.000004,fundStart=0,legacyA=false,legacyB=false}={}){
 const history={markets:{A:{close1d:{rows:[]},fundingHourly:{rows:[]}},B:{close1d:{rows:[]},fundingHourly:{rows:[]}}}};
 let pa=100,pb=120;
 for(let i=0;i<=days;i++){
  if(i){const ret=.01*Math.sin(i*.71)+.005*Math.cos(i*.31);pa*=1+ret;pb*=1+bMultiplier*ret;}
  history.markets.A.close1d.rows.push({time:i*DAY,close:pa});history.markets.B.close1d.rows.push({time:i*DAY,close:pb});
 }
 for(const [key,rate,legacy] of [['A',rateA,legacyA],['B',rateB,legacyB]])for(let hour=fundStart*24+(legacy?8:1);hour<=days*24;hour+=legacy?8:1)history.markets[key].fundingHourly.rows.push({time:hour*HOUR,fundingRate:rate*(legacy?8:1),intervalHours:legacy?8:1});
 return history;
}
function near(a,b,tolerance=1e-8){assert.ok(Math.abs(a-b)<=tolerance,`${a} versus ${b}`);}
{
 const history=fixture({bMultiplier:.5}),prepared=analysis.prepare(history);assert.equal(analysis.prepare(history),prepared);
 const r=analysis.analyzePair(history,'A','B');near(r.correlation.full.percent,100);assert.equal(r.correlation.full.count,240);assert.equal(r.correlation.d30.count,30);
 assert.equal(analysis.analyzePair(history,'A','B'),r);
 near(r.hedge.ratio,2);assert.equal(r.hedge.directionA,'short');assert.equal(r.hedge.directionB,'long');assert.ok(r.hedge.equalVolPct>1);assert.ok(r.hedge.hedgedVolPct<1e-9);
 assert.equal(r.quality.missingDays,0);assert.equal(r.funding.full.hours,240*24);near(r.funding.d30.annualizedA,.00001*8760*100);near(r.funding.d30.annualizedB,-.000004*8760*100);
 near(r.funding.d30.estimatedNetOnLegAPct,(.00001+2*.000004)*8760*100);near(r.funding.d30.estimatedNetOnGrossPct,r.funding.d30.estimatedNetOnLegAPct/3);
 assert.equal(r.backtest.available,true);assert.ok(r.backtest.fundingUsdc>0);assert.ok(r.backtest.costsUsdc>0);assert.equal(r.backtest.fundingExcludedDays,0);assert.ok(r.backtest.rebalanceCount>0);
 near(r.backtest.costsUsdc,r.backtest.feeUsdc+r.backtest.slippageUsdc);near(r.backtest.netUsdc,r.backtest.grossPriceUsdc+r.backtest.fundingUsdc-r.backtest.costsUsdc);
 assert.equal(r.backtest.timeline.at(-1).netUsdc,r.backtest.netUsdc);assert.equal(r.backtest.directionA,'short');assert.equal(r.backtest.directionB,'long');
 console.log('Analysis: daily matched returns, common funding, ratio sizing, held-out cost accounting and cached preparation OK');
}
{
 const r=analysis.analyzePair(fixture({bMultiplier:-1,rateA:.00001,rateB:.000004}),'A','B');near(r.correlation.full.percent,-100);assert.equal(r.hedge.orientation,'short-short');assert.equal(r.backtest.directionA,'short');assert.equal(r.backtest.directionB,'short');assert.ok(r.backtest.fundingUsdc>0);assert.ok(r.hedge.hedgedVolPct<1e-9);
 const longs=analysis.analyzePair(fixture({bMultiplier:-1,rateA:-.00001,rateB:-.000004}),'A','B');assert.equal(longs.hedge.orientation,'long-long');assert.ok(longs.backtest.fundingUsdc>0);
 const weighted=analysis.analyzePair(fixture({bMultiplier:.5,rateA:.00001,rateB:.000008}),'A','B');assert.equal(weighted.hedge.directionA,'long');assert.equal(weighted.hedge.directionB,'short');assert.ok(weighted.backtest.fundingUsdc>0);assert.ok(weighted.funding.d30.estimatedNetOnLegAPct>0);
 const inverseWeighted=analysis.analyzePair(fixture({bMultiplier:-.5,rateA:.00001,rateB:-.000008}),'A','B');assert.equal(inverseWeighted.hedge.orientation,'long-long');assert.ok(inverseWeighted.backtest.fundingUsdc>0);
 const base=fixture(),before=analysis.analyzePair(base,'A','B'),changed=structuredClone(base);
 for(const key of ['A','B'])for(const row of changed.markets[key].fundingHourly.rows)if(row.time>before.backtest.start)row.fundingRate*=-1;
 const after=analysis.analyzePair(changed,'A','B');assert.deepEqual(after.backtest.model,before.backtest.model);assert.equal(after.backtest.directionA,before.backtest.directionA);assert.ok(after.backtest.fundingUsdc<0);assert.ok(after.backtest.maxDrawdownPct>before.backtest.maxDrawdownPct);
 const carryReversal=fixture();for(const key of ['A','B'])for(const row of carryReversal.markets[key].fundingHourly.rows)if(row.time>210*DAY)row.fundingRate*=-1;assert.ok(analysis.analyzePair(carryReversal,'A','B').flags.includes('NEGATIVE_RECENT_CARRY'));
 const mutated=structuredClone(base);for(const row of mutated.markets.B.close1d.rows)if(row.time>before.backtest.start)row.close*=1+(row.time-before.backtest.start)/DAY*.002;
 assert.deepEqual(analysis.analyzePair(mutated,'A','B').backtest.model,before.backtest.model);
 console.log('Analysis: inverse pair directions and funding receipt signs; future funding/prices cannot change training or opening directions OK');
}
{
 const mixed=analysis.analyzePair(fixture({legacyA:true}),'A','B');assert.equal(mixed.funding.full.count,0);assert.equal(mixed.backtest.available,false);assert.ok(mixed.flags.includes('INCOMPLETE_MATCHED_FUNDING'));
 const legacy=analysis.analyzePair(fixture({legacyA:true,legacyB:true}),'A','B');assert.equal(legacy.funding.full.count,240*3);assert.equal(legacy.funding.full.hours,240*24);assert.equal(legacy.backtest.fundingExcludedDays,0);near(legacy.funding.full.annualizedA,.00001*8760*100);
 const later=analysis.analyzePair(fixture({fundStart:150}),'A','B');assert.equal(later.backtest.available,true);assert.ok(later.backtest.start>=210*DAY);assert.equal(later.backtest.testDays,30);near(later.funding.full.coveragePct,100);assert.equal(later.quality.fundingDays,90);assert.ok(later.flags.includes('FUNDING_PRICE_PERIODS_DIFFER'));
 const latest=fixture();for(const key of ['A','B'])latest.markets[key].fundingHourly.rows.push({time:240*DAY+HOUR,fundingRate:key==='A'?.00001:-.000004,intervalHours:1});const fresh=analysis.analyzePair(latest,'A','B');assert.equal(fresh.funding.last,240*DAY+HOUR);assert.equal(fresh.quality.end,240*DAY);assert.equal(fresh.backtest.end,240*DAY);
 const incomplete=fixture();incomplete.markets.A.fundingHourly.rows=incomplete.markets.A.fundingHourly.rows.filter(r=>r.time!==235*DAY-HOUR);
 const missing=analysis.analyzePair(incomplete,'A','B');assert.equal(missing.backtest.fundingExcludedDays,1);assert.equal(missing.backtest.eligible,false);assert.ok(missing.flags.includes('BACKTEST_INCOMPLETE_FUNDING'));
 assert.equal(missing.backtest.cashflowComplete,false);assert.equal(missing.backtest.returnAnnualizedPct,null);assert.equal(missing.backtest.fundingKnownUsdc,missing.backtest.fundingUsdc);
 const negative=fixture(),negativeTime=235*DAY-HOUR;negative.markets.A.fundingHourly.rows.find(r=>r.time===negativeTime).fundingRate=-.001;
 const fullNegative=analysis.analyzePair(negative,'A','B',{rebalanceDays:10000}),partialNegative=structuredClone(negative);
 partialNegative.markets.A.fundingHourly.rows=partialNegative.markets.A.fundingHourly.rows.filter(r=>r.time!==negativeTime);
 const partial=analysis.analyzePair(partialNegative,'A','B',{rebalanceDays:10000}),opening=fullNegative.backtest.start;
 const openA=negative.markets.A.close1d.rows.find(r=>r.time===opening).close,openB=negative.markets.B.close1d.rows.find(r=>r.time===opening).close;
 const priorA=negative.markets.A.close1d.rows.find(r=>r.time===234*DAY).close,priorB=negative.markets.B.close1d.rows.find(r=>r.time===234*DAY).close;
 const omittedPayment=1000/openA*priorA*(-.001)-1000*fullNegative.backtest.model.ratio/openB*priorB*(-.000004);
 near(partial.backtest.fundingKnownUsdc,fullNegative.backtest.fundingUsdc-omittedPayment);assert.ok(partial.backtest.fundingKnownUsdc>fullNegative.backtest.fundingUsdc);assert.equal(partial.backtest.returnAnnualizedPct,null);assert.equal(partial.backtest.fundingIncompleteDays,1);assert.ok(partial.flags.includes('FUNDING_PRICE_PROXY'));
 const priceGap=fixture();priceGap.markets.B.close1d.rows.splice(100,1);const gap=analysis.analyzePair(priceGap,'A','B');assert.equal(gap.quality.missingDays,2);assert.equal(gap.correlation.full.count,238);assert.ok(gap.flags.includes('PRICE_GAPS'));
 const short=analysis.analyzePair(fixture({days:20}),'A','B');assert.ok(short.flags.includes('INSUFFICIENT_OUT_OF_SAMPLE'));assert.ok(short.flags.includes('INSUFFICIENT_PRICE_SAMPLE'));
 const five=analysis.analyzePair(fixture({days:5}),'A','B');assert.equal(five.funding.d30.hours,120);assert.ok(five.flags.includes('SHORT_RECENT_FUNDING_SAMPLE'));
 const trainingHole=fixture();trainingHole.markets.A.fundingHourly.rows=trainingHole.markets.A.fundingHourly.rows.filter(r=>r.time!==50*DAY-HOUR);const partialTraining=analysis.analyzePair(trainingHole,'A','B');assert.ok(partialTraining.flags.includes('TRAINING_INCOMPLETE_FUNDING'));assert.equal(partialTraining.backtest.trainingFundingComplete,false);assert.equal(partialTraining.backtest.eligible,false);assert.equal(partialTraining.backtest.returnAnnualizedPct,null);assert.equal(partialTraining.backtest.cashflowComplete,true);assert.ok(partialTraining.backtest.fundingKnownUsdc>0);
 const flat=fixture();for(const row of flat.markets.B.close1d.rows)row.close=100;const zero=analysis.analyzePair(flat,'A','B');assert.equal(zero.correlation.full.percent,null);assert.equal(zero.hedge.ratio,null);assert.ok(zero.flags.includes('ZERO_VARIANCE_OR_INSUFFICIENT_SAMPLE'));
 console.log('Analysis: actual 8h intervals, mismatched schedules, funding start chronology, missing data and insufficient samples OK');
}
function withExecution(history){
 const now=Date.now(),book=(mid,bid,ask)=>({time:now,collectedAt:now,available:true,source:'Hyperliquid l2Book fixture',mid,bids:[{px:bid,sz:10000}],asks:[{px:ask,sz:10000}]});
 history.marketReferences={execution:{time:now,source:'Verified fee fixture',markets:{A:{time:now,takerFeeBps:4.5,makerFeeBps:1.5,source:'Hyperliquid native userFees fixture'},B:{time:now,takerFeeBps:.9,makerFeeBps:.3,source:'Hyperliquid HIP3 growth userFees fixture'}}},depthBooks:{A:book(100,99,101),B:book(120,119.5,120.5)}};return history;
}
{
 const now=Date.now(),book={time:now,available:true,mid:100,bids:[{px:98,sz:20},{px:99,sz:3}],asks:[{px:103,sz:20},{px:101,sz:4}]};
 const buy=analysis.quoteBook(book,1000,'buy',now),sell=analysis.quoteBook(book,1000,'sell',now);assert.equal(buy.available,true);near(buy.vwap,102.2);near(buy.slippageUsdc,22);near(sell.vwap,98.3);near(sell.slippageUsdc,17);assert.equal(buy.levels,2);
 assert.equal(analysis.quoteBook(book,100000,'buy',now).reason,'DEPTH_BOOK_INSUFFICIENT');assert.equal(analysis.quoteBook({...book,time:now-3*HOUR},1000,'buy',now).reason,'DEPTH_BOOK_STALE');assert.equal(analysis.quoteBook(null,1000,'buy',now).reason,'DEPTH_BOOK_UNAVAILABLE');
 const history=withExecution(fixture()),o={costMode:'hyperliquid',feeMode:'taker',rebalanceMode:'none'},r=analysis.analyzePair(history,'A','B',o),sim=r.backtest;
 assert.equal(sim.available,true);assert.equal(sim.executionCosts.projection,true);assert.equal(sim.executionCosts.openingA.side,'sell');assert.equal(sim.executionCosts.openingB.side,'buy');assert.equal(sim.executionCosts.openingA.feeBps,4.5);assert.equal(sim.executionCosts.openingB.feeBps,.9);assert.equal(sim.rebalanceCount,0);assert.ok(sim.flags.includes('CURRENT_EXECUTION_PROJECTION'));
 near(sim.feeUsdc,sim.feeUsdcA+sim.feeUsdcB);near(sim.slippageUsdc,sim.slippageUsdcA+sim.slippageUsdcB);near(sim.costsUsdc,sim.feeUsdc+sim.slippageUsdc);
 const accountFees={time:Date.now(),source:'Account userFees fixture',markets:{A:{takerFeeBps:2,makerFeeBps:-.1,source:'Account A'},B:{takerFeeBps:.4,makerFeeBps:-.01,source:'Account B'}}};
 const account=analysis.analyzePair(history,'A','B',{...o,accountFees});assert.notEqual(account,r);assert.equal(account.backtest.executionCosts.openingA.feeBps,2);assert.ok(account.backtest.feeUsdc<sim.feeUsdc);assert.equal(account.backtest.executionCosts.accountFeesUsed,true);
 const maker=analysis.analyzePair(history,'A','B',{...o,feeMode:'maker',accountFees});assert.equal(maker.available,true);assert.equal(maker.backtest.available,false);assert.equal(maker.backtest.reason,'MAKER_FILL_UNMODELED');
 const missing=withExecution(fixture());delete missing.marketReferences.execution.markets.B;const noFees=analysis.analyzePair(missing,'A','B',o);assert.equal(noFees.available,true);assert.equal(noFees.backtest.available,false);assert.equal(noFees.backtest.reason,'EXECUTION_FEES_UNAVAILABLE');
 const thin=withExecution(fixture());thin.marketReferences.depthBooks.A.bids[0].sz=.01;assert.equal(analysis.analyzePair(thin,'A','B',o).backtest.reason,'DEPTH_BOOK_INSUFFICIENT');
 const noBook=withExecution(fixture());delete noBook.marketReferences.depthBooks.B;assert.equal(analysis.analyzePair(noBook,'A','B',o).backtest.reason,'DEPTH_BOOK_UNAVAILABLE');
 const failedAccount=analysis.analyzePair(history,'A','B',{...o,accountFees:{errorCode:'HTTP_429'}});assert.equal(failedAccount.backtest.reason,'EXECUTION_FEES_UNAVAILABLE');
 const unchanged=withExecution(fixture()),snapshot=unchanged.marketReferences.depthBooks.A.collectedAt;
 const timely=analysis.analyzePair(unchanged,'A','B',{...o,executionNow:snapshot}),stillFresh=analysis.analyzePair(unchanged,'A','B',{...o,executionNow:snapshot+HOUR});assert.equal(timely,stillFresh);
 const expired=analysis.analyzePair(unchanged,'A','B',{...o,executionNow:snapshot+2*HOUR+1});assert.notEqual(expired,timely);assert.equal(expired.available,true);assert.equal(expired.correlation.full.percent,timely.correlation.full.percent);assert.equal(expired.backtest.available,false);assert.equal(expired.backtest.reason,'DEPTH_BOOK_STALE');
 assert.equal(analysis.analyzePair(unchanged,'A','B',{...o,executionNow:snapshot+3*HOUR}),expired);
 const future=analysis.analyzePair(unchanged,'A','B',{...o,executionNow:snapshot-10*60*1000});assert.equal(future.backtest.reason,'DEPTH_BOOK_STALE');assert.equal(analysis.analyzePair(unchanged,'A','B',{...o,executionNow:snapshot-4*60*1000}),timely);
 console.log('Analysis: current L2 side/volume/VWAP, distinct native/HIP3 fees, account override cache, maker uncertainty and unavailable costs OK');
}
{
 const o={costMode:'hyperliquid',rebalanceMode:'adaptive',rebalanceThresholdPct:20,rebalanceMinObservations:30},calm=withExecution(fixture()),stable=analysis.analyzePair(calm,'A','B',o);
 assert.equal(stable.backtest.available,true);assert.equal(stable.backtest.rebalanceCount,0);assert.equal(stable.backtest.rebalanceChecks,stable.backtest.testDays-1);assert.ok(stable.backtest.rebalanceEvents.every(e=>e.observations>=30&&!e.changed&&e.driftPct<1e-6));
 const drifting=withExecution(fixture({bMultiplier:.5})),base=analysis.analyzePair(drifting,'A','B',o),opening=base.backtest.start;
 // A persistent change in relative volatility changes the hedge despite strong correlation.
 let last=drifting.markets.B.close1d.rows.find(r=>r.time===opening).close;
 for(const row of drifting.markets.B.close1d.rows)if(row.time>opening){const index=row.time/DAY,ret=.01*Math.sin(index*.71)+.005*Math.cos(index*.31);last*=1+ret;row.close=last;}
 const shifted=analysis.analyzePair(structuredClone(drifting),'A','B',o);assert.ok(shifted.backtest.rebalanceCount>0);assert.ok(shifted.backtest.rebalanceEvents.filter(e=>e.changed).every(e=>e.driftPct>20));assert.ok(shifted.backtest.rebalanceEvents.filter(e=>e.changed).every(e=>e.tradeNotionalA===0));
 const future=structuredClone(drifting),firstChange=shifted.backtest.lastRebalance.time;
 for(const row of future.markets.B.close1d.rows)if(row.time>firstChange)row.close*=1.05;
 const modified=analysis.analyzePair(future,'A','B',o);assert.deepEqual(modified.backtest.model,shifted.backtest.model);assert.deepEqual(modified.backtest.rebalanceEvents.filter(e=>e.time<=firstChange),shifted.backtest.rebalanceEvents.filter(e=>e.time<=firstChange));
 const reversed=withExecution(fixture()),split=stable.backtest.start;let previous=reversed.markets.B.close1d.rows.find(r=>r.time===split).close;
 for(const row of reversed.markets.B.close1d.rows)if(row.time>split){const index=row.time/DAY,ret=.01*Math.sin(index*.71)+.005*Math.cos(index*.31);previous*=1-ret;row.close=previous;}
 const unsafe=analysis.analyzePair(reversed,'A','B',o);assert.ok(unsafe.backtest.blockedRebalances>0);assert.ok(unsafe.backtest.flags.includes('REBALANCE_SIGNAL_UNCERTAIN'));assert.equal(unsafe.backtest.directionA,'short');assert.equal(unsafe.backtest.directionB,'long');
 console.log('Analysis: adaptive effective-ratio trigger, calm no-trade behavior, only prior observations and uncertain/reversed-sign blocking OK');
}
