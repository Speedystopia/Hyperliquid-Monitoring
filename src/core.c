#define WIN32_LEAN_AND_MEAN
#define _CRT_SECURE_NO_WARNINGS
#include <windows.h>
#include <winhttp.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>
#include <math.h>
#include <ctype.h>
#include "core.h"
const char *OIL_COINS[OIL_MARKET_COUNT] = {"xyz:BRENTOIL","xyz:CL","xyz:HO","xyz:NATGAS","BTC","xyz:MSTR","xyz:GOLD","xyz:EUR","xyz:SP500","xyz:TLT","xyz:XYZ100","xyz:COPPER","xyz:JPY","ETH","xyz:SILVER"};
const char *OIL_NAMES[OIL_MARKET_COUNT] = {"BRENTOIL","WTIOIL","DIESEL","NATGAS","BTC","MSTR","GOLD","EURUSD","SP500","TLT","XYZ100","COPPER","USDJPY","ETH","SILVER"};
const char *OIL_REQUESTED[OIL_MARKET_COUNT] = {"xyz:BRENTOIL","xyz:WTIOIL","xyz:DIESEL","xyz:NATGAS","BTC","xyz:MSTR","xyz:GOLD","xyz:EURUSD","xyz:SP500","xyz:TLT","xyz:XYZ100","xyz:COPPER","xyz:USDJPY","ETH","xyz:SILVER"};
static int legacy_native(int market){return !strcmp(OIL_COINS[market],"BTC") || !strcmp(OIL_COINS[market],"ETH");}
volatile long oil_stop = 0;
static char current_error[256]={0};
static HANDLE shutdown_event=NULL;
void oil_set_shutdown_event(void *event){shutdown_event=(HANDLE)event;}
int64_t now_ms(void) {
    FILETIME ft; ULARGE_INTEGER v;
    GetSystemTimeAsFileTime(&ft); v.LowPart=ft.dwLowDateTime; v.HighPart=ft.dwHighDateTime;
    return (int64_t)(v.QuadPart / 10000 - UINT64_C(11644473600000));
}
uint32_t oil_collection_delay(int64_t time,int64_t last_hour,int64_t retry_at){
    int64_t hour=time/HOUR_MS,target,delay;
    if(time%HOUR_MS>=60000 && hour!=last_hour)return 0;
    target=(hour+(time%HOUR_MS>=60000?1:0))*HOUR_MS+60000;
    if(retry_at && retry_at<target)target=retry_at;
    delay=target-time;if(delay<0)delay=0;if(delay>60000)delay=60000;
    return (uint32_t)delay;
}
void oil_log(const char *format, ...) {
    FILE *f; SYSTEMTIME t; va_list args;
    CreateDirectoryW(L"data",NULL); f=fopen("data/collector.log","ab"); if(!f) return;
    GetSystemTime(&t);
    fprintf(f,"%04u-%02u-%02uT%02u:%02u:%02uZ ",t.wYear,t.wMonth,t.wDay,t.wHour,t.wMinute,t.wSecond);
    va_start(args,format); vfprintf(f,format,args); va_end(args); fputc('\n',f); fclose(f);
}
size_t series_lower(const Series *s, int64_t time) {
    size_t l=0,r=s->count;
    while(l<r) {size_t m=l+(r-l)/2; if(s->points[m].time<time) l=m+1; else r=m;}
    return l;
}
int series_put(Series *s, Point p) {
    size_t i;
    if(p.time<=0 || !isfinite(p.value) || !isfinite(p.premium)) return 0;
    i=series_lower(s,p.time);
    if(i<s->count && s->points[i].time==p.time) {s->points[i]=p; return 1;}
    if(s->count==s->capacity) {
        size_t cap=s->capacity ? s->capacity*2 : 512;
        Point *v=(Point*)realloc(s->points,cap*sizeof(Point)); if(!v) return 0;
        s->points=v; s->capacity=cap;
    }
    memmove(s->points+i+1,s->points+i,(s->count-i)*sizeof(Point));
    s->points[i]=p; s->count++; return 1;
}
static double number(const cJSON *obj,const char *key) {
    const cJSON *v=cJSON_GetObjectItemCaseSensitive(obj,key);
    if(cJSON_IsNumber(v)) return v->valuedouble;
    if(cJSON_IsString(v)) {char *e; double d=strtod(v->valuestring,&e); if(e!=v->valuestring && !*e) return d;}
    return NAN;
}
static void gap_add(cJSON *arr,int64_t a,int64_t b,int64_t step) {
    cJSON *g=cJSON_CreateObject(); cJSON_AddNumberToObject(g,"from",(double)a);
    cJSON_AddNumberToObject(g,"to",(double)b); cJSON_AddNumberToObject(g,"count",(double)((b-a)/step+1)); cJSON_AddItemToArray(arr,g);
}
cJSON *series_gaps(const Series *s,int64_t step,int64_t end) {
    cJSON *arr=cJSON_CreateArray(); size_t i;
    if(!s->count) return arr;
    for(i=1;i<s->count;i++) if(s->points[i].time-s->points[i-1].time>step)
        gap_add(arr,s->points[i-1].time+step,s->points[i].time-step,step);
    if(end>s->points[s->count-1].time) gap_add(arr,s->points[s->count-1].time+step,end,step);
    return arr;
}
static void funding_gap_add(cJSON *arr,int64_t previous,int64_t next,int native_btc){
    int64_t legacy_last=NATIVE_HOURLY_START-HOUR_MS;
    if(native_btc && previous<legacy_last){
        int64_t last=next<=legacy_last?next-8*HOUR_MS:legacy_last;
        if(last>=previous+8*HOUR_MS)gap_add(arr,previous+8*HOUR_MS,last,8*HOUR_MS);
        if(next<=legacy_last)return;previous=legacy_last;
    }
    if(next>previous+HOUR_MS)gap_add(arr,previous+HOUR_MS,next-HOUR_MS,HOUR_MS);
}
cJSON *funding_gaps(const Series *s,int64_t end,int native_btc){
    cJSON *arr=cJSON_CreateArray();size_t i;if(!s->count)return arr;
    for(i=1;i<s->count;i++)funding_gap_add(arr,s->points[i-1].time,s->points[i].time,native_btc);
    if(end>s->points[s->count-1].time)funding_gap_add(arr,s->points[s->count-1].time,end+HOUR_MS,native_btc);
    return arr;
}
static cJSON *serialize_series(const Series *s,int funding,int64_t step,int64_t end,int native_btc) {
    cJSON *obj=cJSON_CreateObject(),*arr=cJSON_CreateArray(); size_t i;
    cJSON_AddNumberToObject(obj,"count",(double)s->count);
    cJSON_AddNumberToObject(obj,"firstTime",s->count?(double)s->points[0].time:0);
    cJSON_AddNumberToObject(obj,"lastTime",s->count?(double)s->points[s->count-1].time:0);
    cJSON_AddItemToObject(obj,"missingRanges",funding?funding_gaps(s,end,native_btc):series_gaps(s,step,end));
    for(i=0;i<s->count;i++) {
        Point p=s->points[i]; cJSON *row=cJSON_CreateObject();
        cJSON_AddNumberToObject(row,"time",(double)p.time);
        if(funding) {
            cJSON_AddNumberToObject(row,"sourceTime",(double)p.sourceTime);
            cJSON_AddNumberToObject(row,"intervalHours",native_btc && p.time<NATIVE_HOURLY_START?8:1);
            cJSON_AddNumberToObject(row,"fundingRate",p.value); cJSON_AddNumberToObject(row,"premium",p.premium);
        } else cJSON_AddNumberToObject(row,"close",p.value);
        cJSON_AddItemToArray(arr,row);
    }
    cJSON_AddItemToObject(obj,"rows",arr); return obj;
}
cJSON *database_json(const Database *db) {
    cJSON *root=cJSON_CreateObject(),*markets=cJSON_CreateObject(); int i; int64_t t=now_ms();
    cJSON_AddNumberToObject(root,"schemaVersion",3);
    cJSON_AddNumberToObject(root,"fundingScheduleVersion",1);
    cJSON_AddStringToObject(root,"source","https://api.hyperliquid.xyz/info");
    cJSON_AddStringToObject(root,"timeConvention","UTC Unix milliseconds; time is period end, funding payment floored to hour");
    cJSON_AddStringToObject(root,"fundingAggregation","Sum of actual rates for complete UTC 4h / 1d periods; intervalHours is 8 for BTC/ETH before 2023-06-08T01:00Z, otherwise 1; no splitting or compounding");
    cJSON_AddStringToObject(root,"priceRetention","API exposes only latest 5000 candles per interval. Local rows are retained indefinitely.");
    cJSON_AddNumberToObject(root,"lastAttempt",(double)db->attempted);
    cJSON_AddNumberToObject(root,"lastSuccessfulSync",(double)db->successful);
    cJSON_AddStringToObject(root,"lastError",db->lastError);
    {cJSON *benchmarks=cJSON_CreateObject();cJSON_AddItemToObject(benchmarks,"tltSecYield",tlt_sec_json(&db->tltSecYield));cJSON_AddItemToObject(root,"benchmarks",benchmarks);}
    if(db->marketReferences)cJSON_AddItemToObject(root,"marketReferences",cJSON_Duplicate(db->marketReferences,1));
    if(db->externalData)cJSON_AddItemToObject(root,"externalData",cJSON_Duplicate(db->externalData,1));
    for(i=0;i<OIL_MARKET_COUNT;i++) {
        const Market *m=&db->markets[i]; cJSON *o=cJSON_CreateObject();
        int64_t a=m->funding.count?m->funding.points[0].time:0;
        int64_t b=m->close4h.count?m->close4h.points[0].time:0;
        cJSON_AddStringToObject(o,"apiCoin",OIL_COINS[i]);
        cJSON_AddStringToObject(o,"requestedCoin",OIL_REQUESTED[i]);
        cJSON_AddItemToObject(o,"fundingHourly",serialize_series(&m->funding,1,HOUR_MS,t/HOUR_MS*HOUR_MS,legacy_native(i)));
        cJSON_AddItemToObject(o,"close4h",serialize_series(&m->close4h,0,4*HOUR_MS,t/(4*HOUR_MS)*(4*HOUR_MS),0));
        cJSON_AddItemToObject(o,"close1d",serialize_series(&m->close1d,0,DAY_MS,t/DAY_MS*DAY_MS,0));
        /* A first listing candle can start before the first funding payment. */
        cJSON_AddBoolToObject(o,"price4hReachesFundingStart",a && b && b-4*HOUR_MS<=a);
        cJSON_AddItemToObject(markets,OIL_NAMES[i],o);
    }
    cJSON_AddItemToObject(root,"markets",markets); return root;
}
static int load_series(Series *s,const cJSON *obj,int funding,int64_t step,int native_btc) {
    const cJSON *r,*arr=cJSON_GetObjectItemCaseSensitive(obj,"rows");
    if(!cJSON_IsArray(arr)) return 0;
    cJSON_ArrayForEach(r,arr) {
        double t=number(r,"time"),v=number(r,funding?"fundingRate":"close"); Point p;
        if(!isfinite(t) || t<=0 || t>9007199254740991.0 || floor(t)!=t || (int64_t)t%step || !isfinite(v)) return 0;
        p.time=(int64_t)t; p.sourceTime=p.time;
        if(funding){double source=number(r,"sourceTime");const cJSON *interval=cJSON_GetObjectItemCaseSensitive(r,"intervalHours");
            if(!isfinite(source)||source<t||source>=t+HOUR_MS)return 0;p.sourceTime=(int64_t)source;
            if(interval && (!cJSON_IsNumber(interval)||interval->valuedouble!=(native_btc && p.time<NATIVE_HOURLY_START?8:1)))return 0;
        }
        p.value=v; p.premium=funding?number(r,"premium"):0;
        if(!isfinite(p.premium) || (!funding && v<=0) || !series_put(s,p)) return 0;
    }
    return 1;
}
int database_load(Database *db,const char *text) {
    Database tmp={0}; cJSON *root=cJSON_Parse(text),*markets; int i,ok=0;
    double version=number(root,"schemaVersion");
    if(!root || (version!=1 && version!=2 && version!=3)) goto done;
    tmp.loadedSchema=(int)version;
    {cJSON *schedule=cJSON_GetObjectItemCaseSensitive(root,"fundingScheduleVersion");
    if(schedule && (!cJSON_IsNumber(schedule)||schedule->valuedouble!=1))goto done;
    tmp.loadedFundingSchedule=schedule?1:0;}
    markets=cJSON_GetObjectItemCaseSensitive(root,"markets");
    if(!cJSON_IsObject(markets))goto done;
    for(i=0;i<OIL_MARKET_COUNT;i++) {
        cJSON *m=cJSON_GetObjectItemCaseSensitive(markets,OIL_NAMES[i]);
        cJSON *coin=cJSON_GetObjectItemCaseSensitive(m,"apiCoin");
        /* A legacy two-market file is expanded without losing its rows. */
        if(((version==1 && i>=2)||(version==2 && i>=9)) && !m)continue;
        if(!cJSON_IsString(coin) || strcmp(coin->valuestring,OIL_COINS[i])) goto done;
        if(!load_series(&tmp.markets[i].funding,cJSON_GetObjectItemCaseSensitive(m,"fundingHourly"),1,HOUR_MS,legacy_native(i)) ||
           !load_series(&tmp.markets[i].close4h,cJSON_GetObjectItemCaseSensitive(m,"close4h"),0,4*HOUR_MS,0) ||
           !load_series(&tmp.markets[i].close1d,cJSON_GetObjectItemCaseSensitive(m,"close1d"),0,DAY_MS,0)) goto done;
    }
    {double attempt=number(root,"lastAttempt"),success=number(root,"lastSuccessfulSync");
    if(!isfinite(attempt)||!isfinite(success)||attempt<0||success<0)goto done;
    tmp.attempted=(int64_t)attempt;tmp.successful=(int64_t)success;}
    {cJSON *error=cJSON_GetObjectItemCaseSensitive(root,"lastError");if(cJSON_IsString(error))strncpy_s(tmp.lastError,sizeof(tmp.lastError),error->valuestring,_TRUNCATE);}
    tlt_sec_load(&tmp.tltSecYield,cJSON_GetObjectItemCaseSensitive(cJSON_GetObjectItemCaseSensitive(root,"benchmarks"),"tltSecYield"));
    {cJSON *quotes=cJSON_GetObjectItemCaseSensitive(root,"marketReferences"),*external=cJSON_GetObjectItemCaseSensitive(root,"externalData");
    if(cJSON_IsObject(quotes))tmp.marketReferences=cJSON_Duplicate(quotes,1);
    if(cJSON_IsObject(external))tmp.externalData=cJSON_Duplicate(external,1);}
    database_free(db); *db=tmp; memset(&tmp,0,sizeof(tmp)); ok=1;
done: cJSON_Delete(root); database_free(&tmp); return ok;
}
void database_free(Database *db) {
    int i; for(i=0;i<OIL_MARKET_COUNT;i++) {free(db->markets[i].funding.points);free(db->markets[i].close4h.points);free(db->markets[i].close1d.points);}
    cJSON_Delete(db->marketReferences);cJSON_Delete(db->externalData);
    memset(db,0,sizeof(*db));
}
static int pause_ms(DWORD duration) {
    if(shutdown_event)return WaitForSingleObject(shutdown_event,duration)==WAIT_TIMEOUT && !oil_stop;
    DWORD elapsed=0; while(elapsed<duration && !oil_stop) {Sleep(100);elapsed+=100;} return !oil_stop;
}
static cJSON *api_request(const char *body,int quiet) {
    int attempt;
#ifdef OIL_TEST
    if(getenv("OIL_TEST_HTTP_ERROR")){strcpy_s(current_error,sizeof(current_error),"HTTP_503");oil_log("API error=HTTP_503 (test injection)");return NULL;}
#endif
    for(attempt=0;attempt<4 && !oil_stop;attempt++) {
        SetLastError(0);
        HINTERNET session=NULL,connection=NULL,request=NULL;
        char *buf=NULL; size_t length=0; DWORD status=0,size=sizeof(status),winerror=0; cJSON *json=NULL;
        session=WinHttpOpen(L"OilPerps/1.0",WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,WINHTTP_NO_PROXY_NAME,WINHTTP_NO_PROXY_BYPASS,0);
        if(session) {WinHttpSetTimeouts(session,10000,10000,15000,25000);connection=WinHttpConnect(session,L"api.hyperliquid.xyz",443,0);}
        if(connection) request=WinHttpOpenRequest(connection,L"POST",L"/info",NULL,WINHTTP_NO_REFERER,WINHTTP_DEFAULT_ACCEPT_TYPES,WINHTTP_FLAG_SECURE);
        if(request && WinHttpSendRequest(request,L"Content-Type: application/json\r\n",(DWORD)-1,(void*)body,(DWORD)strlen(body),(DWORD)strlen(body),0) && WinHttpReceiveResponse(request,NULL)) {
            WinHttpQueryHeaders(request,WINHTTP_QUERY_STATUS_CODE|WINHTTP_QUERY_FLAG_NUMBER,NULL,&status,&size,NULL);
            if(status==200) {
                DWORD available=0,got=0; int valid=1;
                while(1) {
                    char *next;
                    if(!WinHttpQueryDataAvailable(request,&available)) {valid=0;break;}
                    if(!available) break;
                    if(length+available>16*1024*1024) {valid=0;break;}
                    next=(char*)realloc(buf,length+available+1);if(!next){valid=0;break;}buf=next;
                    if(!WinHttpReadData(request,buf+length,available,&got) || !got) {valid=0;break;}
                    length+=got;buf[length]=0;
                }
                if(valid && buf) json=cJSON_Parse(buf);
                if(!cJSON_IsArray(json) && !cJSON_IsObject(json) && !cJSON_IsNull(json)) {cJSON_Delete(json);json=NULL;}
            }
        }
        if(!json)winerror=GetLastError();
        free(buf);if(request)WinHttpCloseHandle(request);if(connection)WinHttpCloseHandle(connection);if(session)WinHttpCloseHandle(session);
        if(json) {pause_ms(1400);return json;}
        if(!quiet){
            if(status && status!=200)snprintf(current_error,sizeof(current_error),"HTTP_%lu",(unsigned long)status);
            else if(status==200)strcpy_s(current_error,sizeof(current_error),"INVALID_API_RESPONSE");
            else snprintf(current_error,sizeof(current_error),"WINHTTP_%lu",(unsigned long)winerror);
            oil_log("API error=%s attempt=%d HTTP=%lu WINHTTP=%lu request=%s",current_error,attempt+1,(unsigned long)status,(unsigned long)winerror,body);
        }
        else oil_log("Account API error HTTP=%lu WINHTTP=%lu attempt=%d",(unsigned long)status,(unsigned long)winerror,attempt+1);
        if(status>=400 && status<500 && status!=429) break;
        if(!pause_ms((DWORD)(5000*(attempt+1)))) break;
    }
    return NULL;
}
static cJSON *api(const char *body) {return api_request(body,0);}
static int fetch_funding(Series *s,const char *coin,int64_t start,int64_t end) {
    while(start<=end && !oil_stop) {
        char body[512];cJSON *arr,*row;int64_t maxTime=-1;int count;
        snprintf(body,sizeof(body),"{\"type\":\"fundingHistory\",\"coin\":\"%s\",\"startTime\":%lld,\"endTime\":%lld}",coin,(long long)start,(long long)end);
        arr=api(body);if(!cJSON_IsArray(arr)){cJSON_Delete(arr);return 0;}count=cJSON_GetArraySize(arr);
        cJSON_ArrayForEach(row,arr) {
            double tv=number(row,"time"),v=number(row,"fundingRate"),premium=number(row,"premium");Point p;
            if(!isfinite(tv) || tv<start || tv>end || !isfinite(v) || !isfinite(premium)) {cJSON_Delete(arr);return 0;}
            p.sourceTime=(int64_t)tv;p.time=p.sourceTime/HOUR_MS*HOUR_MS;p.value=v;p.premium=premium;
            if(!series_put(s,p)){cJSON_Delete(arr);return 0;}if(p.sourceTime>maxTime)maxTime=p.sourceTime;
        }
        cJSON_Delete(arr);oil_log("funding %s page=%d total=%zu",coin,count,s->count);
        if(count<500) return 1;
        if(maxTime<start) return 0;start=maxTime+1;
    }
    return !oil_stop;
}
static int fetch_prices(Series *s,const char *coin,const char *interval,int64_t start,int64_t end,int64_t now,int64_t step) {
    char body[512]; cJSON *arr,*row;
    snprintf(body,sizeof(body),"{\"type\":\"candleSnapshot\",\"req\":{\"coin\":\"%s\",\"interval\":\"%s\",\"startTime\":%lld,\"endTime\":%lld}}",coin,interval,(long long)start,(long long)end);
    arr=api(body);if(!cJSON_IsArray(arr)){cJSON_Delete(arr);return 0;}
    cJSON_ArrayForEach(row,arr) {
        double tv=number(row,"T"),open=number(row,"t"),close=number(row,"c");Point p;
        if(!isfinite(tv)||!isfinite(open)||!isfinite(close)||close<=0){cJSON_Delete(arr);return 0;}
        p.time=(int64_t)tv+1;p.sourceTime=p.time;p.value=close;p.premium=0;
        if(p.time>now || p.time%step || (int64_t)open+step!=p.time) continue;
        if(!series_put(s,p)){cJSON_Delete(arr);return 0;}
    }
    cJSON_Delete(arr);oil_log("prices %s %s total=%zu",coin,interval,s->count);return 1;
}
static int sync_funding(Series *s,const char *coin,int64_t now,int native_btc) {
    cJSON *gaps,*g;int64_t boundary=now/HOUR_MS*HOUR_MS,recent_start=boundary-2*HOUR_MS;
    if(!s->count) return fetch_funding(s,coin,0,now);
    gaps=funding_gaps(s,boundary,native_btc);
    cJSON_ArrayForEach(g,gaps) {
        int64_t a=(int64_t)number(g,"from"),b=(int64_t)number(g,"to");
        /* The recent re-read below also fills gaps in this tail. */
        if(a>=recent_start)continue;if(b>=recent_start)b=recent_start-HOUR_MS;
        if(!fetch_funding(s,coin,a,b+HOUR_MS-1)){cJSON_Delete(gaps);return 0;}
    }
    cJSON_Delete(gaps);
    /* Re-read recent payments to absorb late publications or corrections. */
    return fetch_funding(s,coin,boundary-2*HOUR_MS,now);
}
static int sync_prices(Series *s,const char *coin,const char *iv,int64_t step,int64_t now) {
    cJSON *gaps,*g;int64_t boundary=now/step*step,retention=boundary-4999*step,recent_first=boundary-step;
    if(!s->count) return fetch_prices(s,coin,iv,0,now,now,step);
    gaps=series_gaps(s,step,boundary);
    cJSON_ArrayForEach(g,gaps) {
        int64_t a=(int64_t)number(g,"from"),b=(int64_t)number(g,"to");
        if(a>=recent_first)continue;if(b>=recent_first)b=recent_first-step;
        if(b<retention) continue;
        if(a<retention)a=retention;
        if(!fetch_prices(s,coin,iv,a-step,b-1,now,step)){cJSON_Delete(gaps);return 0;}
    }
    cJSON_Delete(gaps);
    return fetch_prices(s,coin,iv,boundary-2*step,now,now,step);
}
int database_sync(Database *db) {
    int i,ok=1;int64_t t=now_ms();db->attempted=t;current_error[0]=0;
    for(i=0;i<OIL_MARKET_COUNT && !oil_stop;i++) {
        Market *m=&db->markets[i];
        if(!sync_funding(&m->funding,OIL_COINS[i],t,legacy_native(i))) {ok=0;continue;}
        if(!sync_prices(&m->close4h,OIL_COINS[i],"4h",4*HOUR_MS,t))ok=0;
        if(!sync_prices(&m->close1d,OIL_COINS[i],"1d",DAY_MS,t))ok=0;
    }
    if(oil_stop)ok=0;
    if(ok){db->successful=now_ms();db->lastError[0]=0;}
    else strcpy_s(db->lastError,sizeof(db->lastError),current_error[0]?current_error:oil_stop?"COLLECTOR_STOPPED":"INVALID_DATA_OR_OUT_OF_MEMORY");
    return ok;
}
int address_valid(const char *address) {
    size_t i;if(!address || strlen(address)!=42 || address[0]!='0' || address[1]!='x')return 0;
    for(i=2;i<42;i++)if(!isxdigit((unsigned char)address[i]))return 0;return 1;
}
static void copy_decimal(cJSON *dest,const char *key,const cJSON *source,const char *sourceKey) {
    const cJSON *v=cJSON_GetObjectItemCaseSensitive(source,sourceKey);
    if(cJSON_IsString(v) && isfinite(number(source,sourceKey)))cJSON_AddStringToObject(dest,key,v->valuestring);
    else cJSON_AddNullToObject(dest,key);
}
static int scan_dex(cJSON *positions,const char *address,const char *name,const char *dex) {
    char body[256];cJSON *state,*list,*row;int i;
    snprintf(body,sizeof(body),"{\"type\":\"clearinghouseState\",\"user\":\"%s\",\"dex\":\"%s\"}",address,dex);
    state=api_request(body,1);list=cJSON_GetObjectItemCaseSensitive(state,"assetPositions");
    if(!cJSON_IsArray(list)){cJSON_Delete(state);return 0;}
    cJSON_ArrayForEach(row,list) {
        cJSON *p=cJSON_GetObjectItemCaseSensitive(row,"position"),*coin=cJSON_GetObjectItemCaseSensitive(p,"coin");double size=number(p,"szi");
        if(!cJSON_IsString(coin) || !isfinite(size) || size==0)continue;
        for(i=0;i<OIL_MARKET_COUNT;i++)if(!strcmp(coin->valuestring,OIL_COINS[i])) {
            cJSON *out=cJSON_CreateObject(),*funding=cJSON_GetObjectItemCaseSensitive(p,"cumFunding");
            cJSON_AddStringToObject(out,"account",address);cJSON_AddStringToObject(out,"name",name);cJSON_AddStringToObject(out,"market",OIL_NAMES[i]);
            copy_decimal(out,"size",p,"szi");copy_decimal(out,"entryPrice",p,"entryPx");copy_decimal(out,"liquidationPrice",p,"liquidationPx");
            copy_decimal(out,"fundingPaidSinceOpen",funding,"sinceOpen");copy_decimal(out,"fundingPaidAllTime",funding,"allTime");
            cJSON_AddItemToArray(positions,out);
        }
    }
    cJSON_Delete(state);return 1;
}
static int scan_one(cJSON *positions,const char *address,const char *name){
    /* Native BTC and builder assets use separate clearinghouse states. */
    int native_ok=scan_dex(positions,address,name,"");
    int xyz_ok=scan_dex(positions,address,name,"xyz");
    return native_ok && xyz_ok;
}
cJSON *account_scan(const char *address) {
    char body[256];cJSON *root=cJSON_CreateObject(),*positions=cJSON_CreateArray(),*errors=cJSON_CreateArray(),*subs,*s;int count=1;
    cJSON_AddItemToObject(root,"positions",positions);cJSON_AddItemToObject(root,"errors",errors);
    cJSON_AddNumberToObject(root,"scannedAt",(double)now_ms());
    if(!address_valid(address)){cJSON_AddItemToArray(errors,cJSON_CreateString("Adresse invalide"));return root;}
    cJSON_AddStringToObject(root,"address",address);
    if(!scan_one(positions,address,"Compte principal"))cJSON_AddItemToArray(errors,cJSON_CreateString("Lecture du compte principal impossible"));
    snprintf(body,sizeof(body),"{\"type\":\"subAccounts\",\"user\":\"%s\"}",address);subs=api_request(body,1);
    if(!subs || (!cJSON_IsArray(subs)&&!cJSON_IsNull(subs)))cJSON_AddItemToArray(errors,cJSON_CreateString("Liste des sous-comptes indisponible : resultats partiels"));
    if(cJSON_IsArray(subs))cJSON_ArrayForEach(s,subs) {
        cJSON *a=cJSON_GetObjectItemCaseSensitive(s,"subAccountUser"),*name=cJSON_GetObjectItemCaseSensitive(s,"name");
        if(!cJSON_IsString(a)||!address_valid(a->valuestring)||!_stricmp(a->valuestring,address))continue;
        if(count>=101){cJSON_AddItemToArray(errors,cJSON_CreateString("Limite de 100 sous-comptes atteinte"));break;}
        count++;if(!scan_one(positions,a->valuestring,cJSON_IsString(name)?name->valuestring:"Sous-compte"))cJSON_AddItemToArray(errors,cJSON_CreateString("Un sous-compte est indisponible : resultats partiels"));
    }
    cJSON_Delete(subs);cJSON_AddNumberToObject(root,"accountCount",count);return root;
}
