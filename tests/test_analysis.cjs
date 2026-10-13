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
