#define WIN32_LEAN_AND_MEAN
#define _CRT_SECURE_NO_WARNINGS
#include <windows.h>
#include <winhttp.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <ctype.h>
#include "sources.h"
#define CME_HOST L"datamine.new.cmegroup.com"
#define CME_LIST L"/api/list_entitlements_files"
#define CME_SOURCE "https://datamine.new.cmegroup.com/api/list_entitlements_files"
typedef struct { char *bytes;size_t length;DWORD status,error; } Reply;
static void put(cJSON *o,const char *key,cJSON *value){cJSON_DeleteItemFromObjectCaseSensitive(o,key);cJSON_AddItemToObject(o,key,value);}
static void text(cJSON *o,const char *key,const char *value){put(o,key,cJSON_CreateString(value));}
static void num(cJSON *o,const char *key,double value){put(o,key,cJSON_CreateNumber(value));}
static double value(const cJSON *o,const char *key){
    const cJSON *v=cJSON_GetObjectItemCaseSensitive(o,key);char *end;double d;
    if(cJSON_IsNumber(v))return v->valuedouble;
    if(!cJSON_IsString(v))return NAN;d=strtod(v->valuestring,&end);
    return end!=v->valuestring && !*end && isfinite(d)?d:NAN;
}
static cJSON *object(cJSON *o,const char *key){cJSON *v=cJSON_GetObjectItemCaseSensitive(o,key);if(cJSON_IsObject(v))return v;v=cJSON_CreateObject();put(o,key,v);return v;}
static cJSON *array(cJSON *o,const char *key){cJSON *v=cJSON_GetObjectItemCaseSensitive(o,key);if(cJSON_IsArray(v))return v;v=cJSON_CreateArray();put(o,key,v);return v;}
static int due(cJSON *state,int64_t now,int force){double previous=value(state,"lastAttempt");return force || !isfinite(previous) || now<(int64_t)previous || now/HOUR_MS!=(int64_t)previous/HOUR_MS;}
static void error(cJSON *state,const char *code,DWORD status,DWORD winerror){
    text(state,"errorCode",code);num(state,"httpStatus",status);num(state,"winhttpError",winerror);
    oil_log("Reference source error=%s HTTP=%lu WINHTTP=%lu",code,(unsigned long)status,(unsigned long)winerror);
}
static int wide(const char *s,wchar_t *out,int cap){return s && MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,s,-1,out,cap)>0;}
int sources_auth_kind(const char *token,const char *id,const char *password){return token&&*token?2:id&&*id&&password&&*password?1:0;}
void sources_cme_attempt(cJSON *state,int64_t time){num(state,"lastAttempt",(double)time);put(state,"connected",cJSON_CreateBool(0));}
/* Redirects disabled: authorization must never be forwarded to another host.
   HTTP gzip/deflate handled by WinHTTP; .csv.gz payloads stay in their native format. */
static Reply request(const wchar_t *host,const wchar_t *path,const char *body,const char *token,const char *id,const char *password,size_t limit){
    Reply r={0};HINTERNET session=NULL,connection=NULL,http=NULL;DWORD size=sizeof(DWORD),policy=WINHTTP_OPTION_REDIRECT_POLICY_NEVER,decompress=WINHTTP_DECOMPRESSION_FLAG_GZIP|WINHTTP_DECOMPRESSION_FLAG_DEFLATE;
    wchar_t user[1024],secret[2048],authorization[8192];int valid=1;
    if(oil_stop){r.error=ERROR_OPERATION_ABORTED;return r;}
    session=WinHttpOpen(L"HyperliquidMonitoring/3.0",WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,WINHTTP_NO_PROXY_NAME,WINHTTP_NO_PROXY_BYPASS,0);
    if(session){WinHttpSetTimeouts(session,5000,5000,10000,15000);connection=WinHttpConnect(session,host,443,0);}
    if(connection)http=WinHttpOpenRequest(connection,body?L"POST":L"GET",path,NULL,WINHTTP_NO_REFERER,WINHTTP_DEFAULT_ACCEPT_TYPES,WINHTTP_FLAG_SECURE);
    if(!http){r.error=GetLastError();goto done;}
    WinHttpSetOption(http,WINHTTP_OPTION_REDIRECT_POLICY,&policy,sizeof(policy));WinHttpSetOption(http,WINHTTP_OPTION_DECOMPRESSION,&decompress,sizeof(decompress));
    if(sources_auth_kind(token,id,password)==2){wchar_t bearer[8000];if(!wide(token,bearer,8000)||wcspbrk(bearer,L"\r\n")){r.error=ERROR_INVALID_DATA;goto done;}
        swprintf_s(authorization,8192,L"Authorization: Bearer %s\r\n",bearer);WinHttpAddRequestHeaders(http,authorization,(DWORD)-1,WINHTTP_ADDREQ_FLAG_ADD);SecureZeroMemory(bearer,sizeof(bearer));SecureZeroMemory(authorization,sizeof(authorization));}
    else if(sources_auth_kind(token,id,password)==1){if(!wide(id,user,1024)||!wide(password,secret,2048)){r.error=ERROR_INVALID_DATA;goto done;}
        if(!WinHttpSetCredentials(http,WINHTTP_AUTH_TARGET_SERVER,WINHTTP_AUTH_SCHEME_BASIC,user,secret,NULL)){r.error=GetLastError();goto done;}}
    if(body)WinHttpAddRequestHeaders(http,L"Content-Type: application/json\r\n",(DWORD)-1,WINHTTP_ADDREQ_FLAG_ADD);
    if(!WinHttpSendRequest(http,WINHTTP_NO_ADDITIONAL_HEADERS,0,(void*)body,body?(DWORD)strlen(body):0,body?(DWORD)strlen(body):0,0)||!WinHttpReceiveResponse(http,NULL)){r.error=GetLastError();goto done;}
    if(!WinHttpQueryHeaders(http,WINHTTP_QUERY_STATUS_CODE|WINHTTP_QUERY_FLAG_NUMBER,NULL,&r.status,&size,NULL)){r.error=GetLastError();goto done;}
    if(r.status!=200)goto done;
    while(!oil_stop){DWORD available=0,received=0;char *next;
        if(!WinHttpQueryDataAvailable(http,&available)){valid=0;r.error=GetLastError();break;}if(!available)break;
        if(r.length+available>limit){valid=0;r.error=ERROR_FILE_TOO_LARGE;break;}
        next=(char*)realloc(r.bytes,r.length+available+1);if(!next){valid=0;r.error=ERROR_OUTOFMEMORY;break;}r.bytes=next;
        if(!WinHttpReadData(http,r.bytes+r.length,available,&received)||!received){valid=0;r.error=GetLastError();break;}
        r.length+=received;r.bytes[r.length]=0;
    }
    if(oil_stop){valid=0;r.error=ERROR_OPERATION_ABORTED;}if(!valid){free(r.bytes);r.bytes=NULL;r.length=0;}
done:
    SecureZeroMemory(user,sizeof(user));SecureZeroMemory(secret,sizeof(secret));
    if(http)WinHttpCloseHandle(http);if(connection)WinHttpCloseHandle(connection);if(session)WinHttpCloseHandle(session);return r;
}
cJSON *sources_fees_parse(const cJSON *response,int64_t time,int account){
    cJSON *fees=cJSON_CreateObject();double taker=value(response,"userCrossRate"),maker=value(response,"userAddRate"),referral=value(response,"activeReferralDiscount");
    num(fees,"time",(double)time);text(fees,"source","Hyperliquid userFees");text(fees,"feeScheduleBasis",account?"Account-specific current rates":"Public base tier; zero-address userFees, no user discounts");put(fees,"accountSpecific",cJSON_CreateBool(account));
    if(isfinite(taker)&&taker>=0&&taker<=0.01&&isfinite(maker)&&maker>=-0.01&&maker<=0.01&&isfinite(referral)&&referral>=0&&referral<=1){
        num(fees,"baseTakerRate",taker);num(fees,"baseMakerRate",maker);num(fees,"activeReferralDiscount",referral);text(fees,"errorCode","");
    }else{put(fees,"baseTakerRate",cJSON_CreateNull());put(fees,"baseMakerRate",cJSON_CreateNull());put(fees,"activeReferralDiscount",cJSON_CreateNull());text(fees,"errorCode","HL_USER_FEES_INVALID_RESPONSE");}
    return fees;
}
cJSON *sources_market_fees(const cJSON *quote,const cJSON *base_fees){
    cJSON *out=cJSON_CreateObject();double taker=value(base_fees,"baseTakerRate"),maker=value(base_fees,"baseMakerRate"),referral=value(base_fees,"activeReferralDiscount"),scale=value(quote,"deployerFeeScale"),share,hip,growth;
    const cJSON *mode=cJSON_GetObjectItemCaseSensitive(quote,"growthMode"),*aligned=cJSON_GetObjectItemCaseSensitive(quote,"alignedFeeDiscount");
    static const char *keys[]={"deployerFeeScale","growthMode","collateralToken","alignedFeeDiscount","isHip3"};int i;
    num(out,"time",value(base_fees,"time"));num(out,"metadataTime",value(quote,"time"));text(out,"source","Hyperliquid userFees + metaAndAssetCtxs; official perp fee formula");text(out,"formulaSource","https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees");
    for(i=0;i<(int)(sizeof(keys)/sizeof(keys[0]));i++){const cJSON *field=cJSON_GetObjectItemCaseSensitive(quote,keys[i]);put(out,keys[i],field?cJSON_Duplicate(field,1):cJSON_CreateNull());}
    num(out,"baseTakerRate",taker);num(out,"baseMakerRate",maker);num(out,"activeReferralDiscount",referral);
    if(!isfinite(taker)||taker<0||taker>0.01||!isfinite(maker)||maker<-.01||maker>.01||!isfinite(referral)||referral<0||referral>1||!isfinite(scale)||scale<0||scale>10||!cJSON_IsBool(mode)||!cJSON_IsBool(aligned)){
        put(out,"takerFeeBps",cJSON_CreateNull());put(out,"makerFeeBps",cJSON_CreateNull());text(out,"errorCode","HL_FEE_PARAMETERS_UNAVAILABLE");return out;
    }
    hip=scale<1?1+scale:2*scale;share=scale<1?scale/(1+scale):0.5;growth=cJSON_IsTrue(mode)?0.1:1;
    taker*=hip*growth*(1-referral);if(cJSON_IsTrue(aligned))taker*=(1-share)*0.8+share;
    maker*=growth;if(maker>0)maker*=hip*(1-referral);else if(cJSON_IsTrue(aligned))maker*=(1-share)*1.5+share;
    num(out,"takerFeeBps",taker*10000);num(out,"makerFeeBps",maker*10000);text(out,"errorCode","");return out;
}
int sources_book_apply(cJSON *books,const cJSON *response,int market,int64_t collected_at){
    const cJSON *coin=cJSON_GetObjectItemCaseSensitive(response,"coin"),*levels=cJSON_GetObjectItemCaseSensitive(response,"levels");cJSON *book,*sides[2];double timestamp=value(response,"time"),top[2]={0,0};int side;
    if(market<0||market>=OIL_MARKET_COUNT||!cJSON_IsString(coin)||strcmp(coin->valuestring,OIL_COINS[market])||!isfinite(timestamp)||timestamp<=0||timestamp>collected_at+60000||floor(timestamp)!=timestamp||!cJSON_IsArray(levels)||cJSON_GetArraySize(levels)!=2)return 0;
    book=cJSON_CreateObject();sides[0]=cJSON_CreateArray();sides[1]=cJSON_CreateArray();put(book,"bids",sides[0]);put(book,"asks",sides[1]);
    for(side=0;side<2;side++){const cJSON *rows=cJSON_GetArrayItem(levels,side),*row;double previous=0;int count=0;
        if(!cJSON_IsArray(rows)||cJSON_GetArraySize(rows)<1||cJSON_GetArraySize(rows)>20){cJSON_Delete(book);return 0;}
        cJSON_ArrayForEach(row,rows){double price=value(row,"px"),size=value(row,"sz");cJSON *level;
            if(!isfinite(price)||price<=0||!isfinite(size)||size<=0||(count&&(side==0?price>previous:price<previous))){cJSON_Delete(book);return 0;}
            if(!count)top[side]=price;previous=price;count++;level=cJSON_CreateObject();num(level,"px",price);num(level,"sz",size);cJSON_AddItemToArray(sides[side],level);
        }
    }
    if(top[0]>=top[1]){cJSON_Delete(book);return 0;}
    num(book,"time",timestamp);num(book,"collectedAt",(double)collected_at);text(book,"coin",OIL_COINS[market]);text(book,"source","Hyperliquid l2Book, full price precision, max 20 levels per side");
    num(book,"bid",top[0]);num(book,"ask",top[1]);num(book,"mid",(top[0]+top[1])/2);num(book,"spreadBps",(top[1]-top[0])/((top[1]+top[0])/2)*10000);text(book,"errorCode","");put(book,"available",cJSON_CreateBool(1));put(books,OIL_NAMES[market],book);return 1;
}
static cJSON *fees_request(const char *address,int account){
    char body[192],code[80];Reply reply;cJSON *response,*fees;int64_t time=now_ms();
    if(!address_valid(address)){fees=sources_fees_parse(NULL,time,account);text(fees,"errorCode","HL_USER_FEES_INVALID_ADDRESS");return fees;}
    snprintf(body,sizeof(body),"{\"type\":\"userFees\",\"user\":\"%s\"}",address);reply=request(L"api.hyperliquid.xyz",L"/info",body,NULL,NULL,NULL,1024*1024);response=reply.bytes?cJSON_Parse(reply.bytes):NULL;fees=sources_fees_parse(response,time,account);
    if(reply.status!=200){snprintf(code,sizeof(code),"HL_USER_FEES_%s_%lu",reply.status?"HTTP":"WINHTTP",(unsigned long)(reply.status?reply.status:reply.error));text(fees,"errorCode",code);num(fees,"httpStatus",reply.status);}
    cJSON_Delete(response);free(reply.bytes);return fees;
}
cJSON *sources_account_fees(const char *address){
    cJSON *fees=fees_request(address,1),*quotes=cJSON_CreateObject(),*markets=cJSON_CreateObject();int xyz,i;
    put(fees,"markets",markets);if(!cJSON_IsNumber(cJSON_GetObjectItemCaseSensitive(fees,"baseTakerRate"))){cJSON_Delete(quotes);return fees;}
    for(xyz=0;xyz<2&&!oil_stop;xyz++){
        Reply reply=request(L"api.hyperliquid.xyz",L"/info",xyz?"{\"type\":\"metaAndAssetCtxs\",\"dex\":\"xyz\"}":"{\"type\":\"metaAndAssetCtxs\"}",NULL,NULL,NULL,4*1024*1024);cJSON *response=reply.bytes?cJSON_Parse(reply.bytes):NULL;
        if(reply.status!=200||!sources_context_apply(quotes,response,now_ms(),xyz))text(fees,"errorCode","HL_ACCOUNT_FEE_METADATA_UNAVAILABLE");cJSON_Delete(response);free(reply.bytes);
    }
    for(i=0;i<OIL_MARKET_COUNT;i++)put(markets,OIL_NAMES[i],sources_market_fees(cJSON_GetObjectItemCaseSensitive(quotes,OIL_NAMES[i]),fees));cJSON_Delete(quotes);return fees;
}
int sources_context_apply(cJSON *markets,const cJSON *response,int64_t time,int xyz){
    static const char *fields[]={"oraclePx","markPx","midPx","funding","premium","openInterest","dayNtlVlm","prevDayPx"};
    const cJSON *meta=cJSON_GetArrayItem(response,0),*universe=cJSON_GetObjectItemCaseSensitive(meta,"universe"),*contexts=cJSON_GetArrayItem(response,1);int i,j,n,found=0;
    if(!cJSON_IsArray(universe)||!cJSON_IsArray(contexts)||cJSON_GetArraySize(universe)!=cJSON_GetArraySize(contexts))return 0;
    for(i=0;i<OIL_MARKET_COUNT;i++){
        int expected_xyz=strncmp(OIL_COINS[i],"xyz:",4)==0;if(expected_xyz!=xyz)continue;
        for(n=0;n<cJSON_GetArraySize(universe);n++){
            const cJSON *name=cJSON_GetObjectItemCaseSensitive(cJSON_GetArrayItem(universe,n),"name"),*context;cJSON *quote,*missing;
            if(!cJSON_IsString(name)||strcmp(name->valuestring,OIL_COINS[i]))continue;
            context=cJSON_GetArrayItem(contexts,n);if(!cJSON_IsObject(context))return 0;
            quote=cJSON_CreateObject();missing=cJSON_CreateArray();num(quote,"time",(double)time);text(quote,"apiCoin",OIL_COINS[i]);text(quote,"source","Hyperliquid metaAndAssetCtxs");
            {const cJSON *asset=cJSON_GetArrayItem(universe,n),*growth=cJSON_GetObjectItemCaseSensitive(asset,"growthMode");double scale=xyz?value(asset,"deployerFeeScale"):0,collateral=value(meta,"collateralToken"),size_decimals=value(asset,"szDecimals"),leverage=value(asset,"maxLeverage");
            put(quote,"isHip3",cJSON_CreateBool(xyz));num(quote,"szDecimals",size_decimals);num(quote,"maxLeverage",leverage);num(quote,"collateralToken",collateral);
            if(isfinite(scale)&&scale>=0&&scale<=10)num(quote,"deployerFeeScale",scale);else put(quote,"deployerFeeScale",cJSON_CreateNull());
            if(!xyz)put(quote,"growthMode",cJSON_CreateBool(0));
            else if(cJSON_IsString(growth)&&(!strcmp(growth->valuestring,"enabled")||!strcmp(growth->valuestring,"disabled")))put(quote,"growthMode",cJSON_CreateBool(!strcmp(growth->valuestring,"enabled")));
            else if(!growth){put(quote,"growthMode",cJSON_CreateBool(0));text(quote,"growthModeSource","meta field absent: growth reduction not active; GOLD and crypto-treasury wrappers are ineligible under the current official fee rules");}
            else put(quote,"growthMode",cJSON_CreateNull());
            {const cJSON *changed=cJSON_GetObjectItemCaseSensitive(asset,"lastFeeScaleChangeTime");if(cJSON_IsString(changed))text(quote,"lastFeeScaleChangeTime",changed->valuestring);}
            /* USDC collateral 0 uses AQAv2. The official current AQAv2 spec
               explicitly provides no fee discount; do not confuse with AQAv1. */
            if(collateral==0){text(quote,"collateralName","USDC");put(quote,"alignedFeeDiscount",cJSON_CreateBool(0));text(quote,"alignmentRule","USDC AQAv2: no trading-fee benefit");}
            else{put(quote,"collateralName",cJSON_CreateNull());put(quote,"alignedFeeDiscount",cJSON_CreateNull());text(quote,"alignmentRule","Collateral alignment fee eligibility not verified");}
            text(quote,"alignmentSource","https://hyperliquid.gitbook.io/hyperliquid-docs/hypercore/aligned-quote-assets");}
            text(quote,"referenceType",xyz?"deployer_oracle_reference":"external_spot_oracle_reference");
            for(j=0;j<(int)(sizeof(fields)/sizeof(fields[0]));j++){double d=value(context,fields[j]);int price=j<=2||j==7;
                if(isfinite(d) && (!price||d>0) && ((j!=5 && j!=6)||d>=0))num(quote,fields[j],d);
                else{put(quote,fields[j],cJSON_CreateNull());cJSON_AddItemToArray(missing,cJSON_CreateString(fields[j]));}}
            put(quote,"missingFields",missing);put(markets,OIL_NAMES[i],quote);found++;break;
        }
    }
    return found==(xyz?13:2);
}
static void execution_sync(cJSON *state,cJSON *quotes,int64_t time){
    cJSON *execution=fees_request("0x0000000000000000000000000000000000000000",0),*markets=cJSON_CreateObject(),*books=object(state,"depthBooks");int i;
    put(execution,"markets",markets);num(execution,"lastAttempt",(double)time);
    if(cJSON_IsNumber(cJSON_GetObjectItemCaseSensitive(execution,"baseTakerRate")))num(execution,"lastSuccessfulCheck",(double)time);
    for(i=0;i<OIL_MARKET_COUNT&&!oil_stop;i++){
        char body[192],code[80];Reply reply;cJSON *response,*book;
        put(markets,OIL_NAMES[i],sources_market_fees(cJSON_GetObjectItemCaseSensitive(quotes,OIL_NAMES[i]),execution));
        snprintf(body,sizeof(body),"{\"type\":\"l2Book\",\"coin\":\"%s\"}",OIL_COINS[i]);reply=request(L"api.hyperliquid.xyz",L"/info",body,NULL,NULL,NULL,256*1024);response=reply.bytes?cJSON_Parse(reply.bytes):NULL;
        if(reply.status!=200||!sources_book_apply(books,response,i,now_ms())){
            book=object(books,OIL_NAMES[i]);put(book,"available",cJSON_CreateBool(0));num(book,"lastAttempt",(double)time);
            snprintf(code,sizeof(code),"HL_L2_BOOK_%s_%lu",reply.status==200?"INVALID_OR_EMPTY":reply.status?"HTTP":"WINHTTP",(unsigned long)(reply.status?reply.status:reply.error));text(book,"errorCode",code);num(book,"httpStatus",reply.status);
            oil_log("Market book error=%s market=%s",code,OIL_NAMES[i]);
        }
        cJSON_Delete(response);free(reply.bytes);
    }
    text(execution,"historicalCostNotice","Current fees and L2 depth are observed Hyperliquid values. Applying them to older candles is a current-cost scenario, not reconstructed historical executions. Maker fills are not guaranteed; extra frontend builder fees are not included.");
    put(state,"execution",execution);
}
static void quotes_sync(Database *db,int force){
    cJSON *state,*markets,*snapshot,*snapshots;int64_t time=now_ms();int xyz,ok=1;
    if(!db->marketReferences)db->marketReferences=cJSON_CreateObject();state=db->marketReferences;
    if(!due(state,time,force))return;
    num(state,"lastAttempt",(double)time);text(state,"source","https://api.hyperliquid.xyz/info");
    text(state,"priceConvention","oraclePx is a reference/index, not a Hyperliquid spot execution price; current funding is an estimate, not a historical payment");
    markets=object(state,"markets");
    for(xyz=0;xyz<=1 && !oil_stop;xyz++){
        Reply reply=request(L"api.hyperliquid.xyz",L"/info",xyz?"{\"type\":\"metaAndAssetCtxs\",\"dex\":\"xyz\"}":"{\"type\":\"metaAndAssetCtxs\"}",NULL,NULL,NULL,4*1024*1024);
        cJSON *response=reply.bytes?cJSON_Parse(reply.bytes):NULL;char code[80];
        if(reply.status!=200||!response||!sources_context_apply(markets,response,time,xyz)){
            snprintf(code,sizeof(code),"HL_CONTEXT_%s_%lu",reply.status==200?"INVALID":reply.status?"HTTP":"WINHTTP",(unsigned long)(reply.status?reply.status:reply.error));error(state,code,reply.status,reply.error);ok=0;}
        cJSON_Delete(response);free(reply.bytes);
    }
    if(!oil_stop)execution_sync(state,markets,time);
    if(ok && !oil_stop){num(state,"lastSuccessfulCheck",(double)time);text(state,"errorCode","");num(state,"httpStatus",200);}
    snapshots=array(state,"snapshots");snapshot=cJSON_CreateObject();num(snapshot,"time",(double)time);text(snapshot,"errorCode",cJSON_GetStringValue(cJSON_GetObjectItemCaseSensitive(state,"errorCode"))?cJSON_GetStringValue(cJSON_GetObjectItemCaseSensitive(state,"errorCode")):"");
    put(snapshot,"markets",cJSON_Duplicate(markets,1));
    put(snapshot,"execution",cJSON_Duplicate(cJSON_GetObjectItemCaseSensitive(state,"execution"),1));put(snapshot,"depthBooks",cJSON_Duplicate(cJSON_GetObjectItemCaseSensitive(state,"depthBooks"),1));
    {SYSTEMTIME date;char path[64],*line=cJSON_PrintUnformatted(snapshot);FILE *file;int stored=0;GetSystemTime(&date);snprintf(path,sizeof(path),"data/references-%04u.jsonl",date.wYear);CreateDirectoryW(L"data",NULL);
    file=line?fopen(path,"ab"):NULL;if(file){size_t length=strlen(line);stored=fwrite(line,1,length,file)==length && fputc('\n',file)!=EOF;if(fclose(file))stored=0;}
    if(stored){double count=value(state,"archiveCount");num(state,"archiveCount",isfinite(count)?count+1:1);text(state,"archivePath",path);}else error(state,"HL_CONTEXT_ARCHIVE_STORE",0,GetLastError());free(line);}
    cJSON_AddItemToArray(snapshots,snapshot);while(cJSON_GetArraySize(snapshots)>24)cJSON_DeleteItemFromArray(snapshots,0);
}
int sources_file_id_valid(const char *id){size_t i,n=id?strlen(id):0;if(!n||n>180)return 0;for(i=0;i<n;i++)if(!isalnum((unsigned char)id[i])&&id[i]!='_'&&id[i]!='-')return 0;return 1;}
static const char *string(const cJSON *o,const char *key){const cJSON *v=cJSON_GetObjectItemCaseSensitive(o,key);return cJSON_IsString(v)?v->valuestring:"";}
int sources_cme_progress(cJSON *state,const char *dataset,const char *next,int complete){
    cJSON *entry;const char *prefix="/api/list_entitlements_files?";
    if(!sources_file_id_valid(dataset)||(!complete && (!next||strncmp(next,prefix,strlen(prefix))||strpbrk(next,"\r\n")||strlen(next)>2000)))return 0;
    entry=object(object(state,"resume"),dataset);text(entry,"nextPage",complete?"":next);put(entry,"pending",cJSON_CreateBool(!complete));
    if(!complete){put(state,"backfillPending",cJSON_CreateBool(1));text(state,"errorCode","CME_BACKFILL_PENDING");}return 1;
}
static int archived(const char *id){char path[256];wchar_t wide_path[256];WIN32_FILE_ATTRIBUTE_DATA attributes;
    snprintf(path,sizeof(path),"data/cme/%s.dat",id);return wide(path,wide_path,256)&&GetFileAttributesExW(wide_path,GetFileExInfoStandard,&attributes)&&!(attributes.dwFileAttributes&FILE_ATTRIBUTE_DIRECTORY)&&((attributes.nFileSizeHigh!=0)||(attributes.nFileSizeLow!=0));}
static int write_archive(const char *path,const Reply *reply){char temporary[280];wchar_t from[280],to[280];FILE *file;int ok;
    snprintf(temporary,sizeof(temporary),"%s.tmp",path);file=fopen(temporary,"wb");if(!file)return 0;
    ok=fwrite(reply->bytes,1,reply->length,file)==reply->length;if(fflush(file))ok=0;if(fclose(file))ok=0;
    if(ok)ok=wide(temporary,from,280)&&wide(path,to,280)&&MoveFileExW(from,to,MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH);return ok;}
static int manifest(cJSON *metadata){char *line=cJSON_PrintUnformatted(metadata);FILE *file=line?fopen("data/cme/manifest.jsonl","ab"):NULL;int ok=0;
    if(file){size_t n=strlen(line);ok=fwrite(line,1,n,file)==n && fputc('\n',file)!=EOF;if(fclose(file))ok=0;}free(line);return ok;}
static void mappings(cJSON *state){
    static const char *symbols[]={"BZ","CL","HO","NG","BTC","","GC","6E","ES","","NQ","HG","6J","ETH","SI"};
    static const char *units[]={"USD/barrel","USD/barrel","USD/gallon","USD/MMBtu","USD/BTC","","USD/troy oz","USD/EUR","index points","","index points","USD/lb","USD/JPY","USD/ETH","USD/troy oz"};
    cJSON *arr=cJSON_CreateArray();int i;for(i=0;i<OIL_MARKET_COUNT;i++){cJSON *o=cJSON_CreateObject();text(o,"asset",OIL_NAMES[i]);text(o,"product",symbols[i]);text(o,"quoteUnit",units[i]);
        text(o,"comparisonNote",i==12?"CME 6J is USD per JPY; invert to compare to Hyperliquid JPY per USD. Do not equate percentage returns after inversion.":i==9?"TLT ETF has no exact CME contract equivalent; Treasury futures are not TLT.":i==5?"MSTR equity has no exact equivalent in this connector.":"Futures expire. Retain original contracts; no synthetic continuous-price stitching. Session closes differ from UTC perpetual closes.");cJSON_AddItemToArray(arr,o);}put(state,"mappings",arr);
}
static void cme_sync(Database *db,int force){
    const char *id=getenv("CME_API_ID"),*password=getenv("CME_API_PASSWORD"),*token=getenv("CME_BEARER_TOKEN"),*configured=getenv("CME_DATASET_CODES");
    cJSON *state,*files,*events;int64_t time=now_ms();int credentials=sources_auth_kind(token,id,password)!=0;char *datasets=NULL,*cursor,*context=NULL;int completed=1,downloads=0;
    if(!db->externalData)db->externalData=cJSON_CreateObject();state=object(db->externalData,"cme");
    if(!credentials){put(state,"enabled",cJSON_CreateBool(0));put(state,"connected",cJSON_CreateBool(0));text(state,"errorCode","CME_DISABLED_NO_CREDENTIALS");num(state,"httpStatus",0);text(state,"source",CME_SOURCE);text(state,"documentation","https://www.cmegroup.com/datamine/datamine-api.html");text(state,"analysisStatus","Optional authenticated connector disabled; no CME requests, account creation or purchase. Public reference data uses ECB, Binance and EIA separately.");return;}
    put(state,"enabled",cJSON_CreateBool(1));
    if(!due(state,time,force))return;sources_cme_attempt(state,time);text(state,"source",CME_SOURCE);text(state,"documentation","https://www.cmegroup.com/datamine/datamine-api.html");
    text(state,"connectionMeaning","connected means authenticated DataMine list access verified in this cycle; it does not mean prices have been normalized or are available for correlation.");
    mappings(state);files=array(state,"files");events=array(state,"attempts");put(state,"backfillPending",cJSON_CreateBool(0));
    text(state,"websiteStatus","Automated public website access denied by CME; no scraping or bypass. DataMine requires an entitled API ID even for free daily settlement files.");
    if(!configured||!*configured){error(state,"CME_DATASET_CONFIG_REQUIRED",0,0);completed=0;goto done;}
    datasets=_strdup(configured);if(!datasets){error(state,"CME_OUT_OF_MEMORY",0,ERROR_OUTOFMEMORY);completed=0;goto done;}
    CreateDirectoryW(L"data",NULL);CreateDirectoryW(L"data/cme",NULL);
    for(cursor=strtok_s(datasets,";",&context);cursor&&!oil_stop;cursor=strtok_s(NULL,";",&context)){
        int page;wchar_t path[2048];const char *resume;if(!sources_file_id_valid(cursor)){error(state,"CME_INVALID_DATASET_CODE",0,0);completed=0;break;}
        resume=string(cJSON_GetObjectItemCaseSensitive(cJSON_GetObjectItemCaseSensitive(state,"resume"),cursor),"nextPage");
        if(*resume&&!strncmp(resume,"/api/list_entitlements_files?",strlen("/api/list_entitlements_files?"))&&!strpbrk(resume,"\r\n")&&wide(resume,path,2048)){}
        else swprintf_s(path,2048,L"/api/list_entitlements_files?limit=1000&dataset_code=%S",cursor);
        for(page=0;page<20&&!oil_stop;page++){
            char current_page[8192];int page_ok=1;Reply list;cJSON *json,*data,*row;char code[80];const char *next;
            if(!WideCharToMultiByte(CP_UTF8,0,path,-1,current_page,sizeof(current_page),NULL,NULL)){error(state,"CME_INVALID_PAGE_PATH",0,0);completed=0;break;}
            list=request(CME_HOST,path,NULL,token,id,password,8*1024*1024);json=list.bytes?cJSON_Parse(list.bytes):NULL;data=cJSON_GetObjectItemCaseSensitive(json,"data");
            if(list.status!=200||!cJSON_IsArray(data)){snprintf(code,sizeof(code),"CME_LIST_%s_%lu",list.status==200?"INVALID":list.status?"HTTP":"WINHTTP",(unsigned long)(list.status?list.status:list.error));error(state,code,list.status,list.error);completed=0;free(list.bytes);cJSON_Delete(json);break;}
            put(state,"connected",cJSON_CreateBool(1));num(state,"lastSuccessfulCheck",(double)time);
            cJSON_ArrayForEach(row,data){cJSON *entry,*available=cJSON_GetObjectItemCaseSensitive(row,"files");cJSON_ArrayForEach(entry,available){
                const char *fid=string(entry,"file_id");char filename[256];Reply download;cJSON *metadata;
                if(!sources_file_id_valid(fid)){error(state,"CME_INVALID_FILE_ID",200,0);completed=0;page_ok=0;continue;}
                if(archived(fid))continue;if(downloads>=60){completed=0;text(state,"errorCode","CME_BACKFILL_IN_PROGRESS");break;}
                swprintf_s(path,2048,L"/cme/api/v2/download?fid=%S",fid);download=request(CME_HOST,path,NULL,token,id,password,64*1024*1024);downloads++;
                snprintf(filename,sizeof(filename),"data/cme/%s.dat",fid);
                if(download.status==200 && download.bytes && write_archive(filename,&download)){
                    metadata=cJSON_CreateObject();text(metadata,"fileId",fid);text(metadata,"path",filename);text(metadata,"fileName",string(entry,"file_name"));text(metadata,"dataset",string(row,"dataset_code"));text(metadata,"periodDate",string(row,"period_date"));
                    text(metadata,"exchange",string(row,"exchange_code"));text(metadata,"product",string(row,"product_code"));text(metadata,"source",CME_SOURCE);num(metadata,"downloadedAt",(double)time);num(metadata,"bytes",(double)download.length);text(metadata,"format","Original CME file; .gz contents retained. Contract identity and expiry remain in the original file. Not mixed into Hyperliquid rows.");
                    if(!manifest(metadata)){error(state,"CME_MANIFEST_STORE",200,0);completed=0;page_ok=0;}
                    {double count=value(state,"fileCount");num(state,"fileCount",isfinite(count)?count+1:1);}cJSON_AddItemToArray(files,metadata);while(cJSON_GetArraySize(files)>24)cJSON_DeleteItemFromArray(files,0);
                }else{snprintf(code,sizeof(code),"CME_DOWNLOAD_%s_%lu",download.status==200?"STORE":download.status?"HTTP":"WINHTTP",(unsigned long)(download.status?download.status:download.error));error(state,code,download.status,download.error);completed=0;page_ok=0;}
                free(download.bytes);
            }if(downloads>=60)break;}
            next=string(cJSON_GetObjectItemCaseSensitive(json,"paging"),"next");
            if(downloads>=60||!page_ok){sources_cme_progress(state,cursor,current_page,0);completed=0;free(list.bytes);cJSON_Delete(json);break;}
            if(!*next){sources_cme_progress(state,cursor,NULL,1);free(list.bytes);cJSON_Delete(json);break;}
            {const char *prefix="https://datamine.new.cmegroup.com";size_t n=strlen(prefix);
            if(strncmp(next,prefix,n)||strncmp(next+n,"/api/list_entitlements_files?",strlen("/api/list_entitlements_files?"))||!wide(next+n,path,2048)){error(state,"CME_UNTRUSTED_PAGINATION",200,0);completed=0;free(list.bytes);cJSON_Delete(json);break;}}
            sources_cme_progress(state,cursor,next+strlen("https://datamine.new.cmegroup.com"),0);
            free(list.bytes);cJSON_Delete(json);if(page==19){completed=0;}
        }
    }
    if(oil_stop){completed=0;put(state,"backfillPending",cJSON_CreateBool(1));text(state,"errorCode","CME_COLLECTION_STOPPED");}
    if(completed){text(state,"errorCode","");num(state,"httpStatus",200);put(state,"backfillPending",cJSON_CreateBool(0));}
done:
    {cJSON *event=cJSON_CreateObject();num(event,"time",(double)time);text(event,"errorCode",string(state,"errorCode"));num(event,"httpStatus",value(state,"httpStatus"));num(event,"filesArchived",value(state,"fileCount"));cJSON_AddItemToArray(events,event);}
    while(cJSON_GetArraySize(events)>24)cJSON_DeleteItemFromArray(events,0);
    free(datasets);if(!cJSON_GetObjectItemCaseSensitive(state,"fileCount"))num(state,"fileCount",0);text(state,"manifestPath","data/cme/manifest.jsonl");text(state,"analysisStatus","Raw contract archive only; external correlation is unavailable until matching contract/session/date series are explicitly normalized.");
}
void sources_sync(Database *db,int force){quotes_sync(db,force);if(!oil_stop)cme_sync(db,force);}
