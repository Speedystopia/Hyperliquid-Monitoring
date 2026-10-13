#define _CRT_SECURE_NO_WARNINGS
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "../src/sources.h"
static cJSON *fixture(int xyz){
    cJSON *response=cJSON_CreateArray(),*meta=cJSON_CreateObject(),*universe=cJSON_CreateArray(),*contexts=cJSON_CreateArray();int i;
    cJSON_AddItemToObject(meta,"universe",universe);cJSON_AddItemToArray(response,meta);cJSON_AddItemToArray(response,contexts);
    for(i=OIL_MARKET_COUNT-1;i>=0;i--){cJSON *m,*q;if((strncmp(OIL_COINS[i],"xyz:",4)==0)!=xyz)continue;
        m=cJSON_CreateObject();cJSON_AddStringToObject(m,"name",OIL_COINS[i]);cJSON_AddItemToArray(universe,m);q=cJSON_CreateObject();
        cJSON_AddStringToObject(q,"oraclePx","100");cJSON_AddStringToObject(q,"markPx","101");cJSON_AddStringToObject(q,"midPx",i==0?"not a price":"101.1");
        cJSON_AddStringToObject(q,"funding","-0.00001");cJSON_AddStringToObject(q,"premium","0.01");cJSON_AddStringToObject(q,"openInterest","42");cJSON_AddStringToObject(q,"dayNtlVlm","12000");cJSON_AddItemToArray(contexts,q);
    }return response;
}
int main(int argc,char **argv){
    Database db={0},loaded={0};cJSON *markets=cJSON_CreateObject(),*response,*quote,*json;char *serialized;int64_t time=INT64_C(1791900000000);
    if(argc==2&&!strcmp(argv[1],"--live")){sources_sync(&db,1);json=db.marketReferences;printf("Quotes count=%d error=%s\n",cJSON_GetArraySize(cJSON_GetObjectItemCaseSensitive(json,"markets")),cJSON_GetStringValue(cJSON_GetObjectItemCaseSensitive(json,"errorCode")));
        json=cJSON_GetObjectItemCaseSensitive(db.externalData,"cme");printf("CME HTTP=%g error=%s\n",cJSON_GetObjectItemCaseSensitive(json,"httpStatus")->valuedouble,cJSON_GetStringValue(cJSON_GetObjectItemCaseSensitive(json,"errorCode")));database_free(&db);cJSON_Delete(markets);return 0;}
    response=fixture(1);assert(sources_context_apply(markets,response,time,1));cJSON_Delete(response);
    response=fixture(0);assert(sources_context_apply(markets,response,time,0));cJSON_Delete(response);assert(cJSON_GetArraySize(markets)==15);
    quote=cJSON_GetObjectItemCaseSensitive(markets,"BRENTOIL");assert(cJSON_IsNull(cJSON_GetObjectItemCaseSensitive(quote,"midPx")));assert(cJSON_GetObjectItemCaseSensitive(quote,"funding")->valuedouble==-0.00001);assert(cJSON_GetArraySize(cJSON_GetObjectItemCaseSensitive(quote,"missingFields"))==2);
    response=fixture(1);cJSON_DeleteItemFromArray(cJSON_GetArrayItem(response,1),0);assert(!sources_context_apply(markets,response,time,1));cJSON_Delete(response);
    assert(sources_file_id_valid("20250611-EOD_XCEC_GC_FUT_0_ETH_P"));assert(!sources_file_id_valid("../secrets"));assert(!sources_file_id_valid("id?evil=1"));assert(!sources_file_id_valid(""));assert(!sources_file_id_valid(NULL));
    assert(sources_auth_kind("","id","password")==1);assert(sources_auth_kind(NULL,"id","password")==1);assert(sources_auth_kind("token","id","password")==2);assert(!sources_auth_kind("",NULL,NULL));assert(!sources_auth_kind(NULL,"id",""));
    {cJSON *state=cJSON_CreateObject();cJSON_AddBoolToObject(state,"connected",1);cJSON_AddNumberToObject(state,"lastSuccessfulCheck",(double)(time-3600000));
    sources_cme_attempt(state,time);assert(cJSON_IsFalse(cJSON_GetObjectItemCaseSensitive(state,"connected")));assert(cJSON_GetObjectItemCaseSensitive(state,"lastAttempt")->valuedouble==(double)time);assert(cJSON_GetObjectItemCaseSensitive(state,"lastSuccessfulCheck")->valuedouble==(double)(time-3600000));cJSON_Delete(state);}
    {cJSON *state=cJSON_CreateObject(),*entry;assert(sources_cme_progress(state,"EOD_XCEC_GC_FUT_0","/api/list_entitlements_files?offset=20000&limit=1000",0));
    assert(cJSON_IsTrue(cJSON_GetObjectItemCaseSensitive(state,"backfillPending")));assert(!strcmp(cJSON_GetStringValue(cJSON_GetObjectItemCaseSensitive(state,"errorCode")),"CME_BACKFILL_PENDING"));
    entry=cJSON_GetObjectItemCaseSensitive(cJSON_GetObjectItemCaseSensitive(state,"resume"),"EOD_XCEC_GC_FUT_0");assert(strstr(cJSON_GetStringValue(cJSON_GetObjectItemCaseSensitive(entry,"nextPage")),"offset=20000"));
    assert(!sources_cme_progress(state,"EOD_XCEC_GC_FUT_0","https://evil.test/",0));assert(sources_cme_progress(state,"EOD_XCEC_GC_FUT_0",NULL,1));assert(cJSON_IsFalse(cJSON_GetObjectItemCaseSensitive(entry,"pending")));cJSON_Delete(state);}
    db.marketReferences=cJSON_CreateObject();cJSON_AddItemToObject(db.marketReferences,"markets",markets);db.externalData=cJSON_CreateObject();cJSON_AddItemToObject(db.externalData,"cme",cJSON_CreateObject());
    json=database_json(&db);serialized=cJSON_PrintUnformatted(json);cJSON_Delete(json);assert(database_load(&loaded,serialized));free(serialized);assert(cJSON_GetArraySize(cJSON_GetObjectItemCaseSensitive(loaded.marketReferences,"markets"))==15);assert(cJSON_IsObject(cJSON_GetObjectItemCaseSensitive(loaded.externalData,"cme")));
    database_free(&db);database_free(&loaded);puts("C: reference context index matching, nullable fields, malformed response rejection, safe file IDs and schema3 optional source roundtrip OK");return 0;
}
