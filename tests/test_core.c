#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "../src/core.h"
int main(void) {
    Database db={0},copy={0};cJSON *json,*gaps;char *text;Point p={0};Series *s=&db.markets[0].funding;
    p.time=3*HOUR_MS;p.sourceTime=p.time+47;p.value=0.0001;p.premium=0;assert(series_put(s,p));
    p.time=HOUR_MS;p.sourceTime=p.time+12;assert(series_put(s,p));
    assert(s->count==2 && s->points[0].time==HOUR_MS);
    gaps=series_gaps(s,HOUR_MS,4*HOUR_MS);assert(cJSON_GetArraySize(gaps)==2);cJSON_Delete(gaps);
    p.time=2*HOUR_MS;p.sourceTime=p.time+19;p.value=-0.0002;assert(series_put(s,p));
    assert(series_put(s,p) && s->count==3);
    gaps=series_gaps(s,HOUR_MS,3*HOUR_MS);assert(cJSON_GetArraySize(gaps)==0);cJSON_Delete(gaps);
    json=database_json(&db);text=cJSON_PrintUnformatted(json);cJSON_Delete(json);
    assert(database_load(&copy,text));assert(copy.markets[0].funding.count==3);
    assert(copy.markets[0].funding.points[1].value==-0.0002);
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
