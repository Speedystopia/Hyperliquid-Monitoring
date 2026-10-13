#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "../src/core.h"
int main(int argc,char **argv) {
    Database db={0},copy={0};cJSON *json,*gaps;char *text;Point p={0};Series *s=&db.markets[0].funding;
    if(argc==2 && !strcmp(argv[1],"--live-sec")){
        SecYield live={0};int ok=tlt_sec_sync(&live,1);char *result=cJSON_PrintUnformatted(json=tlt_sec_json(&live));
        puts(result);free(result);cJSON_Delete(json);return ok?0:1;
    }
    {
        FILE *file=fopen("tests/fixtures/tlt-sec.html","rb");char fixture[4096],asOf[11];size_t length;double percent;SecYield yield={0},loaded={0};int64_t time=INT64_C(1791892800000);
        assert(file);length=fread(fixture,1,sizeof(fixture)-1,file);fclose(file);fixture[length]=0;
        assert(tlt_sec_parse(fixture,&percent,asOf));assert(percent==5.54 && !strcmp(asOf,"2026-10-09"));
        assert(!tlt_sec_parse("<html>30 Day SEC Yield 5.54%</html>",&percent,asOf));
        assert(!tlt_sec_parse("<script type='application/ld+json'>{\"@graph\":[{\"alternateName\":\"OTHER\"},{\"additionalProperty\":[{\"name\":\"30 Day SEC Yield\",\"value\":\"5.54%\",\"valueReference\":{\"value\":\"Oct 09, 2026\"}}]}]}</script>",&percent,asOf));
        assert(tlt_sec_apply(&yield,200,fixture,time,"\"v1\"","Fri, 09 Oct 2026 20:00:00 GMT"));
        assert(tlt_sec_apply(&yield,304,NULL,time+HOUR_MS,NULL,NULL));assert(yield.percent==5.54 && yield.checked==time+HOUR_MS);
        assert(!tlt_sec_apply(&yield,503,NULL,time+2*HOUR_MS,NULL,NULL));assert(yield.available && yield.percent==5.54 && !strcmp(yield.error,"TLT_SEC_HTTP_503"));
        assert(!tlt_sec_apply(&yield,200,"<html>blocked</html>",time+3*HOUR_MS,NULL,NULL));assert(yield.percent==5.54 && !strcmp(yield.error,"TLT_SEC_INVALID_RESPONSE"));
        json=tlt_sec_json(&yield);tlt_sec_load(&loaded,json);cJSON_Delete(json);assert(loaded.percent==5.54 && !strcmp(loaded.error,yield.error) && !strcmp(loaded.etag,"\"v1\""));
        assert(tlt_sec_apply(&loaded,304,NULL,time+4*HOUR_MS,NULL,NULL));assert(!loaded.error[0]);
        {SecYield missing={0};assert(!tlt_sec_apply(&missing,304,NULL,time,NULL,NULL));assert(!missing.available);}
        {SecYield schedule={0};assert(tlt_sec_due(&schedule,time,0));schedule.attempted=5*HOUR_MS+61500;
        assert(!tlt_sec_due(&schedule,5*HOUR_MS+300000,0));assert(tlt_sec_due(&schedule,6*HOUR_MS+60000,0));
        assert(tlt_sec_due(&schedule,5*HOUR_MS+62000,1));assert(tlt_sec_due(&schedule,4*HOUR_MS,0));
        strcpy_s(schedule.error,sizeof(schedule.error),"TLT_SEC_HTTP_503");assert(!tlt_sec_due(&schedule,schedule.attempted+299999,0));assert(tlt_sec_due(&schedule,schedule.attempted+300000,0));}
        {char *where=strstr(fixture,"Oct 09, 2026");assert(where);memcpy(where,"Feb 30, 2026",12);where=strstr(where+12,"Oct 09, 2026");assert(where);memcpy(where,"Feb 30, 2026",12);assert(!tlt_sec_parse(fixture,&percent,asOf));}
        db.tltSecYield=loaded;
        puts("C: exact SEC metric/date parsing, decoy rejection, 304 cache, error retention/recovery and invalid dates OK");
    }
    p.time=3*HOUR_MS;p.sourceTime=p.time+47;p.value=0.0001;p.premium=0;assert(series_put(s,p));
    p.time=HOUR_MS;p.sourceTime=p.time+12;assert(series_put(s,p));
    assert(s->count==2 && s->points[0].time==HOUR_MS);
    gaps=series_gaps(s,HOUR_MS,4*HOUR_MS);assert(cJSON_GetArraySize(gaps)==2);cJSON_Delete(gaps);
    p.time=2*HOUR_MS;p.sourceTime=p.time+19;p.value=-0.0002;assert(series_put(s,p));
    assert(series_put(s,p) && s->count==3);
    gaps=series_gaps(s,HOUR_MS,3*HOUR_MS);assert(cJSON_GetArraySize(gaps)==0);cJSON_Delete(gaps);
    {Point close={4*HOUR_MS,4*HOUR_MS,4800,0},eth={NATIVE_HOURLY_START-9*HOUR_MS,NATIVE_HOURLY_START-9*HOUR_MS,0.0008,0};
    assert(series_put(&db.markets[8].close4h,close));assert(series_put(&db.markets[13].funding,eth));}
    json=database_json(&db);text=cJSON_PrintUnformatted(json);cJSON_Delete(json);
    assert(database_load(&copy,text));assert(copy.markets[0].funding.count==3);
    assert(copy.tltSecYield.available && copy.tltSecYield.percent==5.54 && !strcmp(copy.tltSecYield.asOf,"2026-10-09"));
    {cJSON *old=cJSON_Parse(text);char *without;cJSON_DeleteItemFromObjectCaseSensitive(old,"benchmarks");without=cJSON_PrintUnformatted(old);assert(database_load(&copy,without));assert(!copy.tltSecYield.available && copy.markets[0].funding.count==3);free(without);cJSON_Delete(old);}
    assert(copy.markets[0].funding.points[1].value==-0.0002);
    assert(OIL_MARKET_COUNT==15 && !strcmp(OIL_COINS[4],"BTC"));
    assert(copy.markets[13].funding.count==1 && !strcmp(OIL_COINS[13],"ETH"));
    json=cJSON_Parse(text);
    {cJSON *market=cJSON_GetObjectItemCaseSensitive(cJSON_GetObjectItemCaseSensitive(json,"markets"),"ETH");
    cJSON *funding=cJSON_GetObjectItemCaseSensitive(market,"fundingHourly");
    cJSON *row=cJSON_GetArrayItem(cJSON_GetObjectItemCaseSensitive(funding,"rows"),0);
    assert(cJSON_GetObjectItemCaseSensitive(row,"intervalHours")->valuedouble==8);}
    cJSON_SetNumberValue(cJSON_GetObjectItemCaseSensitive(json,"schemaVersion"),2);
    {int i;cJSON *m=cJSON_GetObjectItemCaseSensitive(json,"markets");for(i=9;i<OIL_MARKET_COUNT;i++)cJSON_DeleteItemFromObjectCaseSensitive(m,OIL_NAMES[i]);}
    {char *legacy=cJSON_PrintUnformatted(json);assert(database_load(&copy,legacy));free(legacy);}
    assert(copy.loadedSchema==2 && copy.markets[8].close4h.count==1 && !copy.markets[13].funding.count);cJSON_Delete(json);
    puts("C: schema-2 migration preserves all nine existing assets and supports ETH legacy funding cadence OK");
    json=cJSON_Parse(text);cJSON_SetNumberValue(cJSON_GetObjectItemCaseSensitive(json,"schemaVersion"),1);
    {int i;cJSON *m=cJSON_GetObjectItemCaseSensitive(json,"markets");for(i=2;i<OIL_MARKET_COUNT;i++)cJSON_DeleteItemFromObjectCaseSensitive(m,OIL_NAMES[i]);}
    {char *legacy=cJSON_PrintUnformatted(json);assert(database_load(&copy,legacy));free(legacy);}
    assert(copy.markets[0].funding.count==3 && !copy.markets[4].funding.count);cJSON_Delete(json);
    json=database_json(&copy);assert(cJSON_GetArraySize(cJSON_GetObjectItemCaseSensitive(json,"markets"))==OIL_MARKET_COUNT);cJSON_Delete(json);
    puts("C: lossless legacy migration to fifteen shared assets, native BTC and canonical API aliases OK");
    {Series native={0};Point n={0};n.value=0.0008;n.time=NATIVE_HOURLY_START-9*HOUR_MS;n.sourceTime=n.time;assert(series_put(&native,n));
    n.time+=8*HOUR_MS;n.sourceTime=n.time;assert(series_put(&native,n));n.time+=HOUR_MS;n.sourceTime=n.time;assert(series_put(&native,n));
    gaps=funding_gaps(&native,n.time,1);assert(!cJSON_GetArraySize(gaps));cJSON_Delete(gaps);
    n.time+=2*HOUR_MS;n.sourceTime=n.time;assert(series_put(&native,n));gaps=funding_gaps(&native,n.time,1);assert(cJSON_GetArraySize(gaps)==1);
    assert(cJSON_GetObjectItemCaseSensitive(cJSON_GetArrayItem(gaps,0),"count")->valuedouble==1);cJSON_Delete(gaps);free(native.points);
    puts("C: BTC historical 8h/hourly transition produces no invented gaps; a real missing hourly payment remains recoverable OK");}
    free(text);assert(!database_load(&copy,"{\"schemaVersion\":9}"));assert(copy.markets[0].funding.count==3);
    assert(address_valid("0x1111111111111111111111111111111111111111"));assert(!address_valid("0xnot-an-address"));
    assert(oil_collection_delay(5*HOUR_MS+59000,4,0)==1000);
    assert(oil_collection_delay(5*HOUR_MS+60000,4,0)==0);
    assert(oil_collection_delay(5*HOUR_MS+68000,4,0)==0);
    assert(oil_collection_delay(5*HOUR_MS+68000,5,0)==60000);
    assert(oil_collection_delay(5*HOUR_MS+68000,5,5*HOUR_MS+71000)==3000);
    assert(oil_collection_delay(5*HOUR_MS+68000,5,5*HOUR_MS+65000)==0);
    assert(oil_collection_delay(6*HOUR_MS+60000,5,0)==0);
    puts("C: hourly deadline, startup crossing HH:01, retry timing and clock jump recovery OK");
#ifdef OIL_TEST
    {Database failure={0};_putenv_s("OIL_TEST_HTTP_ERROR","503");assert(!database_sync(&failure));
    assert(!strcmp(failure.lastError,"HTTP_503") && !failure.successful);
    json=database_json(&failure);assert(!strcmp(cJSON_GetObjectItemCaseSensitive(json,"lastError")->valuestring,"HTTP_503"));cJSON_Delete(json);
    _putenv_s("OIL_TEST_HTTP_ERROR","");database_free(&failure);puts("C: injected HTTP failure, error code persistence and success timestamp preservation OK");}
#endif
    database_free(&db);database_free(&copy);puts("C: merge, deduplication, gaps, round-trip, invalid-schema preservation, address validation OK");return 0;
}
