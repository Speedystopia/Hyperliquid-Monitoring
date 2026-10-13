#define WIN32_LEAN_AND_MEAN
#define _CRT_SECURE_NO_WARNINGS
#include <windows.h>
#include <winhttp.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <ctype.h>
#include "core.h"
static int yield_date(const char *text,char out[11]){
    static const char *months[]={"Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"};
    char month[4],extra;int day,year,i;SYSTEMTIME date={0},roundtrip;FILETIME time;
    if(!text || sscanf(text,"%3s %d, %d %c",month,&day,&year,&extra)!=3)return 0;
    for(i=0;i<12;i++)if(!strcmp(month,months[i]))break;
    if(i==12 || day<1 || day>31 || year<2000 || year>2100)return 0;
    date.wYear=(WORD)year;date.wMonth=(WORD)(i+1);date.wDay=(WORD)day;
    if(!SystemTimeToFileTime(&date,&time) || !FileTimeToSystemTime(&time,&roundtrip) || roundtrip.wMonth!=date.wMonth || roundtrip.wDay!=date.wDay)return 0;
    snprintf(out,11,"%04d-%02d-%02d",year,i+1,day);return 1;
}
static int iso_date(const char *text){
    static const char *months[]={"Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"};
    int year,month,day;char english[32],converted[11];
    if(!text || strlen(text)!=10 || sscanf(text,"%4d-%2d-%2d",&year,&month,&day)!=3 || month<1 || month>12)return 0;
    snprintf(english,sizeof(english),"%s %02d, %04d",months[month-1],day,year);
    return yield_date(english,converted) && !strcmp(text,converted);
}
int tlt_sec_parse(const char *html,double *percent,char asOf[11]){
    const char *cursor=html;int found=0;double result=0;char result_date[11]={0};
    if(!html)return 0;
    while((cursor=strstr(cursor,"<script"))!=NULL){
        const char *start=strchr(cursor,'>'),*end,*type;char *text;cJSON *root,*graph,*node;int tlt=0;
        if(!start)break;end=strstr(start,"</script>");if(!end)break;
        type=strstr(cursor,"application/ld+json");cursor=end+9;
        if(!type || type>start || end-start>512*1024)continue;
        text=(char*)malloc((size_t)(end-start));if(!text)return 0;
        memcpy(text,start+1,(size_t)(end-start-1));text[end-start-1]=0;root=cJSON_Parse(text);free(text);
        graph=cJSON_GetObjectItemCaseSensitive(root,"@graph");
        cJSON_ArrayForEach(node,graph){cJSON *ticker=cJSON_GetObjectItemCaseSensitive(node,"alternateName");if(cJSON_IsString(ticker)&&!strcmp(ticker->valuestring,"TLT"))tlt=1;}
        if(tlt)cJSON_ArrayForEach(node,graph){
            cJSON *property,*properties=cJSON_GetObjectItemCaseSensitive(node,"additionalProperty");
            cJSON_ArrayForEach(property,properties){
                cJSON *name=cJSON_GetObjectItemCaseSensitive(property,"name"),*value,*reference,*date;char *tail;double rate;char date_text[11];
                if(!cJSON_IsString(name) || (strcmp(name->valuestring,"30 Day SEC Yield as of") && strcmp(name->valuestring,"30 Day SEC Yield")))continue;
                value=cJSON_GetObjectItemCaseSensitive(property,"value");reference=cJSON_GetObjectItemCaseSensitive(property,"valueReference");date=cJSON_GetObjectItemCaseSensitive(reference,"value");
                if(!cJSON_IsString(value)||!cJSON_IsString(date))continue;
                rate=strtod(value->valuestring,&tail);while(isspace((unsigned char)*tail))tail++;
                if(tail==value->valuestring || *tail!='%' || tail[1] || !isfinite(rate) || rate<0 || rate>100 || !yield_date(date->valuestring,date_text)){cJSON_Delete(root);return 0;}
                if(found && (rate!=result || strcmp(date_text,result_date))){cJSON_Delete(root);return 0;}
                found=1;result=rate;strcpy_s(result_date,11,date_text);
            }
        }
        cJSON_Delete(root);
    }
    if(found){*percent=result;strcpy_s(asOf,11,result_date);}return found;
}
static int yield_failure(SecYield *yield,const char *code){
    strcpy_s(yield->error,sizeof(yield->error),code);oil_log("TLT SEC yield error=%s cached=%d asOf=%s",code,yield->available,yield->asOf);return 0;
}
int tlt_sec_apply(SecYield *yield,int status,const char *html,int64_t time,const char *etag,const char *modified){
    double percent;char asOf[11],code[64];yield->attempted=time;
    if(status==304){if(!yield->available)return yield_failure(yield,"TLT_SEC_304_WITHOUT_CACHE");}
    else if(status==200){
        if(!tlt_sec_parse(html,&percent,asOf))return yield_failure(yield,"TLT_SEC_INVALID_RESPONSE");
        {int year,month,day;SYSTEMTIME date={0};FILETIME ft;ULARGE_INTEGER ticks;int64_t published;
        sscanf(asOf,"%d-%d-%d",&year,&month,&day);date.wYear=(WORD)year;date.wMonth=(WORD)month;date.wDay=(WORD)day;
        if(!SystemTimeToFileTime(&date,&ft))return yield_failure(yield,"TLT_SEC_INVALID_DATE");
        ticks.LowPart=ft.dwLowDateTime;ticks.HighPart=ft.dwHighDateTime;published=(int64_t)(ticks.QuadPart/10000-UINT64_C(11644473600000));
        if(published>time+DAY_MS || (yield->available && strcmp(asOf,yield->asOf)<0))return yield_failure(yield,"TLT_SEC_DATE_REGRESSION");}
        yield->available=1;yield->percent=percent;strcpy_s(yield->asOf,11,asOf);
        strcpy_s(yield->etag,sizeof(yield->etag),etag?etag:"");strcpy_s(yield->modified,sizeof(yield->modified),modified?modified:"");
    }else{snprintf(code,sizeof(code),"TLT_SEC_HTTP_%d",status);return yield_failure(yield,code);}
    yield->checked=time;yield->error[0]=0;return 1;
}
cJSON *tlt_sec_json(const SecYield *yield){
    cJSON *json=cJSON_CreateObject();
    cJSON_AddStringToObject(json,"source",TLT_SEC_SOURCE);cJSON_AddStringToObject(json,"metric","30 Day SEC Yield");
    if(yield->available)cJSON_AddNumberToObject(json,"percent",yield->percent);else cJSON_AddNullToObject(json,"percent");
    cJSON_AddStringToObject(json,"asOf",yield->asOf);cJSON_AddNumberToObject(json,"lastAttempt",(double)yield->attempted);
    cJSON_AddNumberToObject(json,"lastSuccessfulCheck",(double)yield->checked);cJSON_AddStringToObject(json,"errorCode",yield->error);
    cJSON_AddStringToObject(json,"etag",yield->etag);cJSON_AddStringToObject(json,"lastModified",yield->modified);return json;
}
void tlt_sec_load(SecYield *yield,const cJSON *json){
    cJSON *percent,*date,*attempt,*checked,*error,*etag,*modified;
    memset(yield,0,sizeof(*yield));if(!json)return;
    percent=cJSON_GetObjectItemCaseSensitive(json,"percent");date=cJSON_GetObjectItemCaseSensitive(json,"asOf");
    attempt=cJSON_GetObjectItemCaseSensitive(json,"lastAttempt");checked=cJSON_GetObjectItemCaseSensitive(json,"lastSuccessfulCheck");
    error=cJSON_GetObjectItemCaseSensitive(json,"errorCode");etag=cJSON_GetObjectItemCaseSensitive(json,"etag");modified=cJSON_GetObjectItemCaseSensitive(json,"lastModified");
    if(!cJSON_IsObject(json) || !cJSON_IsNumber(attempt)||!cJSON_IsNumber(checked)||!isfinite(attempt->valuedouble)||!isfinite(checked->valuedouble)||attempt->valuedouble<0||checked->valuedouble<0||attempt->valuedouble>9007199254740991.0||checked->valuedouble>9007199254740991.0 || !cJSON_IsString(date) || (cJSON_IsNumber(percent)?!isfinite(percent->valuedouble)||percent->valuedouble<0||percent->valuedouble>100||!iso_date(date->valuestring):!cJSON_IsNull(percent))){strcpy_s(yield->error,sizeof(yield->error),"TLT_SEC_CACHE_INVALID");return;}
    yield->attempted=(int64_t)attempt->valuedouble;yield->checked=(int64_t)checked->valuedouble;
    if(cJSON_IsNumber(percent)){yield->available=1;yield->percent=percent->valuedouble;strcpy_s(yield->asOf,11,date->valuestring);}
    if(cJSON_IsString(error))strncpy_s(yield->error,sizeof(yield->error),error->valuestring,_TRUNCATE);
    if(cJSON_IsString(etag)&&strlen(etag->valuestring)<sizeof(yield->etag)&&!strpbrk(etag->valuestring,"\r\n"))strcpy_s(yield->etag,sizeof(yield->etag),etag->valuestring);
    if(cJSON_IsString(modified)&&strlen(modified->valuestring)<sizeof(yield->modified)&&!strpbrk(modified->valuestring,"\r\n"))strcpy_s(yield->modified,sizeof(yield->modified),modified->valuestring);
}
static void response_header(HINTERNET request,DWORD key,char *out,size_t capacity){
    wchar_t text[256];DWORD size=sizeof(text);out[0]=0;
    if(WinHttpQueryHeaders(request,key,NULL,text,&size,NULL)){
        int length=WideCharToMultiByte(CP_UTF8,0,text,-1,out,(int)capacity,NULL,NULL);
        if(!length || strpbrk(out,"\r\n"))out[0]=0;
    }
}
int tlt_sec_due(const SecYield *yield,int64_t time,int force){
    return force || !yield->attempted || time<yield->attempted || time/HOUR_MS!=yield->attempted/HOUR_MS || (yield->error[0] && time-yield->attempted>=300000);
}
int tlt_sec_sync(SecYield *yield,int force){
    HINTERNET session=NULL,connection=NULL,request=NULL;DWORD status=0,size=sizeof(status),decompress=WINHTTP_DECOMPRESSION_FLAG_GZIP|WINHTTP_DECOMPRESSION_FLAG_DEFLATE,winerror=0;
    char *body=NULL,etag[256]={0},modified[80]={0};size_t length=0;int valid=1,ok=0;int64_t time=now_ms();
    if(!tlt_sec_due(yield,time,force))return !yield->error[0];
    yield->attempted=time;if(oil_stop)return yield_failure(yield,"TLT_SEC_STOPPED");
    session=WinHttpOpen(L"HyperliquidMonitoring/2.3",WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,WINHTTP_NO_PROXY_NAME,WINHTTP_NO_PROXY_BYPASS,0);
    if(session){WinHttpSetTimeouts(session,5000,5000,10000,15000);connection=WinHttpConnect(session,L"www.ishares.com",443,0);}
    if(connection)request=WinHttpOpenRequest(connection,L"GET",L"/us/products/239454/ishares-20-year-treasury-bond-etf",NULL,WINHTTP_NO_REFERER,WINHTTP_DEFAULT_ACCEPT_TYPES,WINHTTP_FLAG_SECURE);
    if(request){
        wchar_t header[384];WinHttpSetOption(request,WINHTTP_OPTION_DECOMPRESSION,&decompress,sizeof(decompress));
        if(yield->available&&yield->etag[0]){swprintf_s(header,384,L"If-None-Match: %S",yield->etag);WinHttpAddRequestHeaders(request,header,(DWORD)-1,WINHTTP_ADDREQ_FLAG_ADD);}
        if(yield->available&&yield->modified[0]){swprintf_s(header,384,L"If-Modified-Since: %S",yield->modified);WinHttpAddRequestHeaders(request,header,(DWORD)-1,WINHTTP_ADDREQ_FLAG_ADD);}
        if(WinHttpSendRequest(request,WINHTTP_NO_ADDITIONAL_HEADERS,0,WINHTTP_NO_REQUEST_DATA,0,0,0)&&WinHttpReceiveResponse(request,NULL)){
            WinHttpQueryHeaders(request,WINHTTP_QUERY_STATUS_CODE|WINHTTP_QUERY_FLAG_NUMBER,NULL,&status,&size,NULL);
            response_header(request,WINHTTP_QUERY_ETAG,etag,sizeof(etag));response_header(request,WINHTTP_QUERY_LAST_MODIFIED,modified,sizeof(modified));
            if(status==200)while(!oil_stop){
                DWORD available=0,got=0;char *next;
                if(!WinHttpQueryDataAvailable(request,&available)){valid=0;break;}if(!available)break;
                if(length+available>4*1024*1024){valid=0;break;}next=(char*)realloc(body,length+available+1);if(!next){valid=0;break;}body=next;
                if(!WinHttpReadData(request,body+length,available,&got)||!got){valid=0;break;}length+=got;body[length]=0;
            }
        }else winerror=GetLastError();
    }else winerror=GetLastError();
    if(oil_stop)ok=yield_failure(yield,"TLT_SEC_STOPPED");
    else if(!status){char code[64];snprintf(code,sizeof(code),"TLT_SEC_WINHTTP_%lu",(unsigned long)winerror);ok=yield_failure(yield,code);}
    else if(!valid)ok=yield_failure(yield,"TLT_SEC_READ_FAILED");
    else ok=tlt_sec_apply(yield,(int)status,body,time,etag,modified);
    if(ok)oil_log("TLT SEC yield HTTP=%lu percent=%.6f asOf=%s",(unsigned long)status,yield->percent,yield->asOf);
    free(body);if(request)WinHttpCloseHandle(request);if(connection)WinHttpCloseHandle(connection);if(session)WinHttpCloseHandle(session);return ok;
}
