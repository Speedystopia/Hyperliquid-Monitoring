#define WIN32_LEAN_AND_MEAN
#define _CRT_SECURE_NO_WARNINGS
#include <windows.h>
#include <winhttp.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <ctype.h>
#include "public_prices.h"
#include "bcrp_prices.h"
#include "open_stocks.h"
#define PUBLIC_PATH "data/public-prices.json"
#define PUBLIC_COUNT 15
typedef struct {const char *key,*provider,*symbol,*source,*kind,*unit,*session;} Reference;
static const Reference references[PUBLIC_COUNT]={
 {"EURUSD","ECB","EUR/USD","https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.xml","central_bank_reference_fixing","USD/EUR","ECB daily fixing around 14:10 CET, published around 16:00 CET; tradeDate is fixing date, time is its following UTC midnight for daily-date alignment, not a UTC trading close."},
 {"USDJPY","ECB","USD/JPY","https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.xml","derived_central_bank_reference_fixing","JPY/USD","Derived JPY per EUR divided by USD per EUR from the same ECB fixing. Following UTC midnight labels the fixing date; not an executable spot or perpetual close."},
 {"BTC","Binance","BTCUSDT","https://data-api.binance.vision/api/v3/klines","external_spot_usdt","USDT/BTC","Binance spot BTC/USDT, closed 1d UTC candles. USDT is not USD or USDC. Not a Hyperliquid execution price."},
 {"ETH","Binance","ETHUSDT","https://data-api.binance.vision/api/v3/klines","external_spot_usdt","USDT/ETH","Binance spot ETH/USDT, closed 1d UTC candles. USDT is not USD or USDC. Not a Hyperliquid execution price."},
 {"WTIOIL","EIA","RWTC","https://www.eia.gov/dnav/pet/hist/RWTCD.htm","physical_spot_assessment","USD/barrel","EIA Cushing WTI spot assessment, reporting date mapped to following UTC midnight; not NYMEX settlement or UTC perp close. Negative historical assessments are retained; percentage returns through nonpositive prices are unusable."},
 {"BRENTOIL","EIA","RBRTE","https://www.eia.gov/dnav/pet/hist/RBRTEd.htm","physical_spot_assessment","USD/barrel","EIA Europe Brent spot assessment; reporting date mapped to following UTC midnight, not a futures settlement or UTC perp close."},
 {"NATGAS","EIA","RNGWHHD","https://www.eia.gov/dnav/ng/hist/rngwhhdD.htm","physical_spot_assessment","USD/MMBtu","EIA Henry Hub spot assessment; reporting date mapped to following UTC midnight, not a futures settlement or UTC perp close."},
 {"DIESEL","EIA","EER_EPD2DXL0_PF4_Y35NY_DPG","https://www.eia.gov/dnav/pet/hist/eer_epd2dxl0_pf4_y35ny_dpgD.htm","physical_spot_proxy","USD/gallon","EIA New York Harbor ultra-low-sulfur No.2 diesel spot assessment; explicit proxy for HO/DIESEL perpetual, not its futures contract. Reporting date mapped to following UTC midnight."},
 {"SP500","FRED / S&P Dow Jones Indices","SP500","https://fred.stlouisfed.org/series/SP500","official_cash_price_index","index points","S&P 500 price index, no dividends. Daily New York market close, usually 16:00 ET; tradeDate mapped to following UTC midnight only for date alignment. FRED exposes rolling 10 years; downloaded local observations are retained. Copyrighted: personal noncommercial research only, no redistribution without owner permission."},
 {"XYZ100","FRED / Nasdaq","NASDAQ100","https://fred.stlouisfed.org/series/NASDAQ100","official_cash_price_index","index points","Nasdaq-100 cash price index (reference for XYZ100 perpetual). Daily New York market close, usually 16:00 ET; following UTC midnight labels the trade date, not its actual close time. Copyrighted: personal noncommercial research only, no redistribution without owner permission."},
 {"COPPER","BCRP","PD04701XD","https://estadisticas.bcrp.gob.pe/estadisticas/series/diarias/resultados/PD04701XD/html","official_daily_commodity_reference","USD/lb","BCRP published daily copper reference, converted from US cents/lb to USD/lb. Observation date mapped to following UTC midnight; no CME settlement or executable Hyperliquid price. Source BCRP; original quotations Reuters. Publication may lag several days; no interpolation."},
 {"SILVER","BCRP","PD04702XD","https://estadisticas.bcrp.gob.pe/estadisticas/series/diarias/resultados/PD04702XD/html","official_daily_commodity_reference","USD/troy oz","BCRP published daily silver reference. Observation date mapped to following UTC midnight; no CME settlement or executable Hyperliquid price. Source BCRP; original quotations Reuters. Publication may lag several days; no interpolation."},
 {"GOLD","BCRP","PD04704XD","https://estadisticas.bcrp.gob.pe/estadisticas/series/diarias/resultados/PD04704XD/html","official_daily_commodity_reference","USD/troy oz","BCRP published daily gold reference. Observation date mapped to following UTC midnight; no CME settlement or executable Hyperliquid price. Source BCRP; original quotations Reuters. Publication may lag several days; no interpolation."},
 {"MSTR","DoltHub / post-no-preference","MSTR","https://www.dolthub.com/repositories/post-no-preference/stocks","community_split_adjusted_equity_close","USD/share","Community stock-price archive, daily New York equity close with stock splits normalized, no dividend adjustment. Following UTC midnight labels the observation date. The publisher updates split data monthly, so corporate-action adjustments can lag. Not an official exchange feed or a Hyperliquid execution price."},
 {"TLT","DoltHub / post-no-preference","TLT","https://www.dolthub.com/repositories/post-no-preference/stocks","community_split_adjusted_etf_close","USD/share","Community ETF stock-price archive, daily New York close with stock splits normalized, no dividend adjustment. Following UTC midnight labels the observation date. The publisher updates split data monthly. Not Treasury bond yield, NAV or a Hyperliquid execution price."}
};
typedef PublicPriceDownload PublicReply;
static void replace(cJSON *o,const char *key,cJSON *v){cJSON_DeleteItemFromObjectCaseSensitive(o,key);cJSON_AddItemToObject(o,key,v);}
static void settext(cJSON *o,const char *key,const char *v){replace(o,key,cJSON_CreateString(v));}
static void setnumber(cJSON *o,const char *key,double v){replace(o,key,cJSON_CreateNumber(v));}
static cJSON *getobject(cJSON *o,const char *key){cJSON *v=cJSON_GetObjectItemCaseSensitive(o,key);if(cJSON_IsObject(v))return v;v=cJSON_CreateObject();replace(o,key,v);return v;}
static double numeric(const cJSON *v){char *end;double n;if(cJSON_IsNumber(v))return v->valuedouble;if(!cJSON_IsString(v))return NAN;n=strtod(v->valuestring,&end);return end!=v->valuestring&&!*end&&isfinite(n)?n:NAN;}
static const char *gettext(const cJSON *o,const char *key){const cJSON *v=cJSON_GetObjectItemCaseSensitive(o,key);return cJSON_IsString(v)?v->valuestring:"";}
static int64_t iso_day(const char *date){SYSTEMTIME in={0},back;FILETIME ft;ULARGE_INTEGER ticks;int year,month,day;char text[11];
 if(!date||strlen(date)!=10||sscanf(date,"%4d-%2d-%2d",&year,&month,&day)!=3||year<1970||year>2100||month<1||month>12||day<1||day>31)return 0;
 snprintf(text,sizeof(text),"%04d-%02d-%02d",year,month,day);if(strcmp(date,text))return 0;in.wYear=(WORD)year;in.wMonth=(WORD)month;in.wDay=(WORD)day;
 if(!SystemTimeToFileTime(&in,&ft)||!FileTimeToSystemTime(&ft,&back)||back.wMonth!=in.wMonth||back.wDay!=in.wDay)return 0;ticks.LowPart=ft.dwLowDateTime;ticks.HighPart=ft.dwHighDateTime;return (int64_t)(ticks.QuadPart/10000-UINT64_C(11644473600000));}
static void day_text(int64_t time,char out[11]){ULARGE_INTEGER v;FILETIME ft;SYSTEMTIME date;v.QuadPart=((uint64_t)time+UINT64_C(11644473600000))*10000;ft.dwLowDateTime=v.LowPart;ft.dwHighDateTime=v.HighPart;FileTimeToSystemTime(&ft,&date);snprintf(out,11,"%04u-%02u-%02u",date.wYear,date.wMonth,date.wDay);}
static int add_price(Series *s,int64_t day,double close){Point p={0};if(day<=0||day%DAY_MS||!isfinite(close))return 0;p.time=day+DAY_MS;p.sourceTime=day;p.value=close;return series_put(s,p);}
static int attribute(const char *start,const char *end,const char *name,char *out,size_t capacity){char pattern[64];const char *p,*q;char quote;size_t n;
 snprintf(pattern,sizeof(pattern),"%s=",name);p=strstr(start,pattern);if(!p||p>=end)return 0;p+=strlen(pattern);quote=*p++;if(quote!='\''&&quote!='"')return 0;q=strchr(p,quote);if(!q||q>end||(n=(size_t)(q-p))>=capacity)return 0;memcpy(out,p,n);out[n]=0;return 1;}
int public_prices_ecb_parse(const char *xml,Series *eurusd,Series *usdjpy){const char *cursor=xml;int count=0;
 if(!xml||!strstr(xml,"eurofxref"))return 0;
 while((cursor=strstr(cursor,"<Cube time="))!=NULL){const char *start_end=strchr(cursor,'>'),*end;char date[11];int64_t day;double usd=NAN,jpy=NAN;const char *p;
  if(!start_end||(end=strstr(start_end,"</Cube>"))==NULL||!attribute(cursor,start_end,"time",date,sizeof(date))||(day=iso_day(date))==0)return 0;
  p=start_end;while((p=strstr(p,"<Cube currency="))!=NULL&&p<end){const char *tag_end=strchr(p,'>');char currency[8],rate[80],*tail;double n;
   if(!tag_end||tag_end>end||!attribute(p,tag_end,"currency",currency,sizeof(currency))||!attribute(p,tag_end,"rate",rate,sizeof(rate)))return 0;
   n=strtod(rate,&tail);if(tail==rate||*tail||!isfinite(n)||n<=0)return 0;if(!strcmp(currency,"USD"))usd=n;if(!strcmp(currency,"JPY"))jpy=n;p=tag_end+1;
  }
  if(!isfinite(usd)||!isfinite(jpy)||!add_price(eurusd,day,usd)||!add_price(usdjpy,day,jpy/usd))return 0;count++;cursor=end+7;
 }return count>0;
}
int public_prices_eia_parse(const char *html,Series *prices){static const char *months[]={"Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"};const char *cursor=html;int count=0;
 if(!html||!strstr(html,"Week Of")||!strstr(html,"Mon")||!strstr(html,"Fri"))return 0;
 while((cursor=strstr(cursor,"class='B6'"))!=NULL){const char *label=strchr(cursor,'>'),*end,*p;char month[4],date[11];int year,day,mi,weekday;int64_t monday;
  if(!label||(end=strstr(label,"</td>"))==NULL)return 0;label++;while(label<end){if(!strncmp(label,"&nbsp;",6)){label+=6;continue;}if(isspace((unsigned char)*label)){label++;continue;}break;}
  if(sscanf(label,"%d %3s-%d",&year,month,&day)!=3)return 0;for(mi=0;mi<12;mi++)if(!strcmp(month,months[mi]))break;if(mi==12)return 0;
  snprintf(date,sizeof(date),"%04d-%02d-%02d",year,mi+1,day);monday=iso_day(date);if(!monday)return 0;p=end+5;
  for(weekday=0;weekday<5;weekday++){const char *tag=strstr(p,"class='B3'"),*value_start,*value_end;char number[80],*tail;size_t n;double close;
   {const char *row_end=strstr(p,"</tr>");if(!tag||!row_end||row_end<tag)return 0;}value_start=strchr(tag,'>');value_end=value_start?strstr(value_start,"</td>"):NULL;if(!value_start||!value_end)return 0;value_start++;n=(size_t)(value_end-value_start);if(n>=sizeof(number))return 0;memcpy(number,value_start,n);number[n]=0;
   if(n && strcmp(number,"&nbsp;") && strcmp(number,"NA") && strcmp(number,"W") && strcmp(number,"-") && strcmp(number,"--")){close=strtod(number,&tail);while(isspace((unsigned char)*tail))tail++;if(tail==number||*tail||!isfinite(close)||!add_price(prices,monday+weekday*DAY_MS,close))return 0;count++;}
   p=value_end+5;
  }cursor=p;
 }return count>0;
}
int public_prices_binance_parse_checked(const cJSON *rows,Series *prices,int64_t now,int64_t *next,size_t *partial_candles){const cJSON *row;int64_t latest=-1;if(!cJSON_IsArray(rows))return 0;
 cJSON_ArrayForEach(row,rows){double open=numeric(cJSON_GetArrayItem(row,0)),close=numeric(cJSON_GetArrayItem(row,4)),end=numeric(cJSON_GetArrayItem(row,6));int64_t day;
  if(!cJSON_IsArray(row)||cJSON_GetArraySize(row)<7||!isfinite(open)||!isfinite(end)||open<=0||floor(open)!=open||floor(end)!=end||open>9007199254740991.0||end>9007199254740991.0||end<open||end>=open+DAY_MS||!isfinite(close)||close<=0)return 0;
  day=(int64_t)open;if(day>latest)latest=day;
  /* Binance has historical maintenance candles with an early closeTime
     (e.g. 2018-02-08 00:28 UTC). These are not full daily observations.
     Preserve the pagination cursor, exclude them, and disclose the count. */
  if(day%DAY_MS || end!=open+DAY_MS-1){if(partial_candles)(*partial_candles)++;continue;}
  if(end+1<=now&&!add_price(prices,day,close))return 0;
 }*next=latest<0?0:(latest/DAY_MS+1)*DAY_MS;return 1;
}
int public_prices_binance_parse(const cJSON *rows,Series *prices,int64_t now,int64_t *next){return public_prices_binance_parse_checked(rows,prices,now,next,NULL);}
int public_prices_us_session_closed(int64_t day,int64_t now){DYNAMIC_TIME_ZONE_INFORMATION zone;TIME_ZONE_INFORMATION eastern;SYSTEMTIME local={0},utc;FILETIME ft;ULARGE_INTEGER ticks;DWORD i;
 if(day<=0||day%DAY_MS)return 0;
 if(day<now/DAY_MS*DAY_MS)return 1;if(day>now/DAY_MS*DAY_MS)return 0;
 for(i=0;EnumDynamicTimeZoneInformation(i,&zone)==ERROR_SUCCESS;i++)if(!wcscmp(zone.TimeZoneKeyName,L"Eastern Standard Time")){
  ULARGE_INTEGER date;FILETIME date_ft;date.QuadPart=((uint64_t)day+UINT64_C(11644473600000))*10000;date_ft.dwLowDateTime=date.LowPart;date_ft.dwHighDateTime=date.HighPart;if(!FileTimeToSystemTime(&date_ft,&local))return 0;local.wHour=16;
  if(!GetTimeZoneInformationForYear(local.wYear,&zone,&eastern)||!TzSpecificLocalTimeToSystemTime(&eastern,&local,&utc)||!SystemTimeToFileTime(&utc,&ft))return 0;
  ticks.LowPart=ft.dwLowDateTime;ticks.HighPart=ft.dwHighDateTime;return (int64_t)(ticks.QuadPart/10000-UINT64_C(11644473600000))<=now;
 }return 0;
}
int public_prices_fred_parse(const char *csv,const char *column,Series *prices,int64_t now){const char *p,*end;char expected[80],header[80];size_t n;int count=0;int64_t previous=0;
 if(!csv||!column||(strcmp(column,"SP500")&&strcmp(column,"NASDAQ100")))return 0;if(!strncmp(csv,"\xef\xbb\xbf",3))csv+=3;
 end=strchr(csv,'\n');if(!end||(n=(size_t)(end-csv))>=sizeof(header))return 0;if(n&&csv[n-1]=='\r')n--;memcpy(header,csv,n);header[n]=0;snprintf(expected,sizeof(expected),"observation_date,%s",column);if(strcmp(header,expected))return 0;p=end+1;
 while(*p){char date[11],number[80],*tail;const char *comma;int64_t day;double close;end=strchr(p,'\n');if(!end)end=p+strlen(p);if(end==p){p=*end?end+1:end;continue;}comma=memchr(p,',',(size_t)(end-p));if(!comma||comma-p!=10)return 0;memcpy(date,p,10);date[10]=0;day=iso_day(date);if(!day||day<=previous)return 0;previous=day;
  n=(size_t)(end-comma-1);if(n&&comma[1+n-1]=='\r')n--;if(n>=sizeof(number))return 0;memcpy(number,comma+1,n);number[n]=0;
  if(n&&strcmp(number,".")){close=strtod(number,&tail);if(tail==number||*tail||!isfinite(close)||close<=0)return 0;if(public_prices_us_session_closed(day,now)){if(!add_price(prices,day,close))return 0;count++;}}
  p=*end?end+1:end;
 }return count>0;
}
int public_prices_due(int64_t now,int64_t last_attempt,int force,int failed){if(force||last_attempt<=0||now<last_attempt)return 1;if(failed&&now-last_attempt>=HOUR_MS)return 1;return (now-17*HOUR_MS)/DAY_MS!=(last_attempt-17*HOUR_MS)/DAY_MS;}
static PublicReply get(const wchar_t *host,const wchar_t *path){PublicReply r={0};HINTERNET session=NULL,connection=NULL,request=NULL;size_t length=0;DWORD size=sizeof(DWORD),decompress=WINHTTP_DECOMPRESSION_FLAG_GZIP|WINHTTP_DECOMPRESSION_FLAG_DEFLATE,redirect=WINHTTP_OPTION_REDIRECT_POLICY_NEVER;
 session=WinHttpOpen(L"HyperliquidMonitoring-PublicReferences/1.0",WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,WINHTTP_NO_PROXY_NAME,WINHTTP_NO_PROXY_BYPASS,0);if(session){WinHttpSetTimeouts(session,5000,10000,15000,25000);connection=WinHttpConnect(session,host,443,0);}if(connection)request=WinHttpOpenRequest(connection,L"GET",path,NULL,WINHTTP_NO_REFERER,WINHTTP_DEFAULT_ACCEPT_TYPES,WINHTTP_FLAG_SECURE);
 if(!request){r.error=GetLastError();goto done;}WinHttpSetOption(request,WINHTTP_OPTION_DECOMPRESSION,&decompress,sizeof(decompress));WinHttpSetOption(request,WINHTTP_OPTION_REDIRECT_POLICY,&redirect,sizeof(redirect));
 if(!WinHttpSendRequest(request,WINHTTP_NO_ADDITIONAL_HEADERS,0,NULL,0,0,0)||!WinHttpReceiveResponse(request,NULL)){r.error=GetLastError();goto done;}WinHttpQueryHeaders(request,WINHTTP_QUERY_STATUS_CODE|WINHTTP_QUERY_FLAG_NUMBER,NULL,&r.status,&size,NULL);if(r.status!=200)goto done;
 while(!oil_stop){DWORD available=0,received=0;char *next;if(!WinHttpQueryDataAvailable(request,&available)){r.error=GetLastError();break;}if(!available)break;if(length+available>16*1024*1024){r.error=ERROR_FILE_TOO_LARGE;break;}next=(char*)realloc(r.bytes,length+available+1);if(!next){r.error=ERROR_OUTOFMEMORY;break;}r.bytes=next;if(!WinHttpReadData(request,r.bytes+length,available,&received)||!received){r.error=GetLastError();break;}length+=received;r.bytes[length]=0;}
 if(oil_stop)r.error=ERROR_OPERATION_ABORTED;if(r.error){free(r.bytes);r.bytes=NULL;}
done:if(request)WinHttpCloseHandle(request);if(connection)WinHttpCloseHandle(connection);if(session)WinHttpCloseHandle(session);return r;
}
static char *read(const char *path){FILE *f=fopen(path,"rb");long size;char *s;if(!f)return NULL;if(fseek(f,0,SEEK_END)||(size=ftell(f))<0||size>16*1024*1024){fclose(f);return NULL;}rewind(f);s=(char*)malloc((size_t)size+1);if(!s){fclose(f);return NULL;}if(fread(s,1,(size_t)size,f)!=(size_t)size){free(s);fclose(f);return NULL;}s[size]=0;fclose(f);return s;}
/* The documented FRED CSV export is public. On this Windows machine its
   HTTPS transport times out in WinHTTP while system curl HTTP/1.1 succeeds.
   Keep normal TLS verification, our own User-Agent, no cookies/auth or shell. */
PublicPriceDownload public_prices_download(const char *url,const char *tag){PublicReply reply={0};wchar_t executable[MAX_PATH],command[16384],body_path[MAX_PATH]={0},status_path[MAX_PATH]={0},body_relative[100],status_relative[100],wide_url[8193];char body_local[100],status_local[100],*status=NULL;HANDLE status_file=INVALID_HANDLE_VALUE,null_file=INVALID_HANDLE_VALUE;SECURITY_ATTRIBUTES security={sizeof(SECURITY_ATTRIBUTES),NULL,TRUE};STARTUPINFOEXW startup={0};PROCESS_INFORMATION process={0};SIZE_T attribute_size=0;HANDLE allowed[2];DWORD exit_code=0,elapsed=0,wait,body_length,status_length;int started=0;UINT length;size_t n;
 if(!url||!tag||!strlen(tag)||strlen(tag)>40||strlen(url)>8192){reply.error=ERROR_INVALID_PARAMETER;return reply;}
 if(strcmp(url,"https://fred.stlouisfed.org/graph/fredgraph.csv?id=SP500")&&strcmp(url,"https://fred.stlouisfed.org/graph/fredgraph.csv?id=NASDAQ100")&&strncmp(url,"https://www.dolthub.com/api/v2/databases/post-no-preference/stocks/sql?",strlen("https://www.dolthub.com/api/v2/databases/post-no-preference/stocks/sql?"))){reply.error=ERROR_ACCESS_DENIED;return reply;}
 for(n=0;tag[n];n++)if(!isalnum((unsigned char)tag[n])&&tag[n]!='_'&&tag[n]!='-'){reply.error=ERROR_INVALID_NAME;return reply;}
 for(n=0;url[n];n++)if((unsigned char)url[n]<=32||(unsigned char)url[n]>=127||url[n]=='"'){reply.error=ERROR_INVALID_PARAMETER;return reply;}
 if(!MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,url,-1,wide_url,8193)){reply.error=ERROR_INVALID_PARAMETER;return reply;}
 length=GetSystemDirectoryW(executable,MAX_PATH);if(!length||length>=MAX_PATH-10){reply.error=ERROR_PATH_NOT_FOUND;return reply;}wcscat_s(executable,MAX_PATH,L"\\curl.exe");if(GetFileAttributesW(executable)==INVALID_FILE_ATTRIBUTES){reply.error=ERROR_FILE_NOT_FOUND;return reply;}
 CreateDirectoryW(L"data",NULL);swprintf_s(body_relative,100,L"data\\public-download-%S.tmp",tag);swprintf_s(status_relative,100,L"data\\public-download-%S.status",tag);
 body_length=GetFullPathNameW(body_relative,MAX_PATH,body_path,NULL);status_length=GetFullPathNameW(status_relative,MAX_PATH,status_path,NULL);if(!body_length||!status_length||body_length>=MAX_PATH||status_length>=MAX_PATH){reply.error=ERROR_FILENAME_EXCED_RANGE;return reply;}
 snprintf(body_local,sizeof(body_local),"data/public-download-%s.tmp",tag);snprintf(status_local,sizeof(status_local),"data/public-download-%s.status",tag);
 status_file=CreateFileW(status_path,GENERIC_WRITE,FILE_SHARE_READ,&security,CREATE_ALWAYS,FILE_ATTRIBUTE_NORMAL,NULL);null_file=CreateFileW(L"NUL",GENERIC_READ|GENERIC_WRITE,FILE_SHARE_READ|FILE_SHARE_WRITE,&security,OPEN_EXISTING,0,NULL);if(status_file==INVALID_HANDLE_VALUE||null_file==INVALID_HANDLE_VALUE){reply.error=GetLastError();goto done;}
 memset(&startup,0,sizeof(startup));startup.StartupInfo.cb=sizeof(startup);startup.StartupInfo.dwFlags=STARTF_USESTDHANDLES;startup.StartupInfo.hStdOutput=status_file;startup.StartupInfo.hStdError=null_file;startup.StartupInfo.hStdInput=null_file;allowed[0]=status_file;allowed[1]=null_file;
 InitializeProcThreadAttributeList(NULL,1,0,&attribute_size);startup.lpAttributeList=(LPPROC_THREAD_ATTRIBUTE_LIST)malloc(attribute_size);if(!startup.lpAttributeList){reply.error=ERROR_OUTOFMEMORY;goto done;}
 if(!InitializeProcThreadAttributeList(startup.lpAttributeList,1,0,&attribute_size)){reply.error=GetLastError();free(startup.lpAttributeList);startup.lpAttributeList=NULL;goto done;}
 if(!UpdateProcThreadAttribute(startup.lpAttributeList,0,PROC_THREAD_ATTRIBUTE_HANDLE_LIST,allowed,sizeof(allowed),NULL,NULL)){reply.error=GetLastError();goto done;}
 swprintf_s(command,16384,L"\"%s\" --silent --show-error --http1.1 --user-agent \"HyperliquidMonitoring-PublicReferences/1.0\" --fail --connect-timeout 10 --max-time 35 --max-filesize 16777216 --output \"%s\" --write-out \"%%{http_code}\" \"%s\"",executable,body_path,wide_url);
 if(!CreateProcessW(executable,command,NULL,NULL,TRUE,CREATE_NO_WINDOW|EXTENDED_STARTUPINFO_PRESENT,NULL,NULL,&startup.StartupInfo,&process)){reply.error=GetLastError();goto done;}started=1;
 do{wait=WaitForSingleObject(process.hProcess,100);elapsed+=100;}while(wait==WAIT_TIMEOUT&&!oil_stop&&elapsed<40000);
 if(wait!=WAIT_OBJECT_0){reply.error=oil_stop?ERROR_OPERATION_ABORTED:ERROR_TIMEOUT;TerminateProcess(process.hProcess,reply.error);WaitForSingleObject(process.hProcess,1000);}else if(!GetExitCodeProcess(process.hProcess,&exit_code))reply.error=GetLastError();
done:
 if(started){CloseHandle(process.hThread);CloseHandle(process.hProcess);}if(startup.lpAttributeList){DeleteProcThreadAttributeList(startup.lpAttributeList);free(startup.lpAttributeList);}if(status_file!=INVALID_HANDLE_VALUE)CloseHandle(status_file);if(null_file!=INVALID_HANDLE_VALUE)CloseHandle(null_file);
 status=read(status_local);if(status){char *tail;unsigned long code=strtoul(status,&tail,10);if(tail!=status&&!*tail&&code<=599)reply.status=(DWORD)code;free(status);}if(!reply.error&&exit_code)reply.error=exit_code;
 if(!reply.error&&reply.status==200)reply.bytes=read(body_local);DeleteFileW(body_path);DeleteFileW(status_path);return reply;
}
static PublicReply fred_get(const char *series){char url[160];PublicReply reply={0};if(!series||(strcmp(series,"SP500")&&strcmp(series,"NASDAQ100"))){reply.error=ERROR_INVALID_PARAMETER;return reply;}snprintf(url,sizeof(url),"https://fred.stlouisfed.org/graph/fredgraph.csv?id=%s",series);return public_prices_download(url,series);}
int public_prices_fred_fetch(const char *column,Series *prices,int64_t now,unsigned long *http_status,unsigned long *transport_error){PublicReply reply=fred_get(column);int valid=reply.status==200&&reply.bytes&&public_prices_fred_parse(reply.bytes,column,prices,now);if(http_status)*http_status=reply.status;if(transport_error)*transport_error=reply.error;free(reply.bytes);return valid;}
static int load(cJSON *root,Series *series){int i;double changed=numeric(cJSON_GetObjectItemCaseSensitive(root,"lastChanged"));if(numeric(cJSON_GetObjectItemCaseSensitive(root,"schemaVersion"))!=1||!isfinite(changed)||changed<=0||changed>9007199254740991.0||floor(changed)!=changed||!cJSON_IsObject(cJSON_GetObjectItemCaseSensitive(root,"markets")))return 0;
 for(i=0;i<PUBLIC_COUNT;i++){const cJSON *market=cJSON_GetObjectItemCaseSensitive(cJSON_GetObjectItemCaseSensitive(root,"markets"),references[i].key),*rows,*row;int64_t previous=0;if(!market)continue;rows=cJSON_GetObjectItemCaseSensitive(cJSON_GetObjectItemCaseSensitive(market,"close1d"),"rows");if(!cJSON_IsArray(rows))return 0;
  if(strcmp(gettext(market,"provider"),references[i].provider)||strcmp(gettext(market,"symbol"),references[i].symbol))return 0;
  cJSON_ArrayForEach(row,rows){double time=numeric(cJSON_GetObjectItemCaseSensitive(row,"time")),close=numeric(cJSON_GetObjectItemCaseSensitive(row,"close"));Point p={0};if(!isfinite(time)||time<=previous||time>9007199254740991.0||floor(time)!=time||(int64_t)time%DAY_MS||!isfinite(close))return 0;p.time=(int64_t)time;p.sourceTime=p.time-DAY_MS;p.value=close;if(!series_put(&series[i],p))return 0;previous=p.time;}
 }return 1;
}
static void release(Series *series){int i;for(i=0;i<PUBLIC_COUNT;i++){free(series[i].points);memset(&series[i],0,sizeof(series[i]));}}
static cJSON *market_json(const Reference *reference,const Series *series,int rows){cJSON *market=cJSON_CreateObject(),*prices=cJSON_CreateObject(),*arr;size_t i,nonpositive=0;
 settext(market,"provider",reference->provider);settext(market,"symbol",reference->symbol);settext(market,"source",reference->source);settext(market,"referenceType",reference->kind);settext(market,"quoteUnit",reference->unit);settext(market,"sessionNote",reference->session);
 setnumber(prices,"count",(double)series->count);setnumber(prices,"firstTime",series->count?(double)series->points[0].time:0);setnumber(prices,"lastTime",series->count?(double)series->points[series->count-1].time:0);
 if(rows){arr=cJSON_CreateArray();for(i=0;i<series->count;i++){cJSON *row=cJSON_CreateObject();char date[11];const Point *p=&series->points[i];day_text(p->sourceTime,date);setnumber(row,"time",(double)p->time);setnumber(row,"sourceTime",(double)p->sourceTime);settext(row,"tradeDate",date);setnumber(row,"close",p->value);cJSON_AddItemToArray(arr,row);}replace(prices,"rows",arr);}
 for(i=0;i<series->count;i++)if(series->points[i].value<=0)nonpositive++;setnumber(market,"invalidReturnPrices",(double)nonpositive);replace(market,"close1d",prices);return market;
}
static int save(const char *serialized,int existing){FILE *f;int ok;size_t n=strlen(serialized);CreateDirectoryW(L"data",NULL);f=fopen("data/public-prices.tmp.json","wb");if(!f)return 0;ok=fwrite(serialized,1,n,f)==n;if(fflush(f))ok=0;if(fclose(f))ok=0;if(!ok)return 0;
 if(existing)return ReplaceFileW(L"data/public-prices.json",L"data/public-prices.tmp.json",L"data/public-prices.backup.json",0,NULL,NULL)!=0;
 return MoveFileExW(L"data/public-prices.tmp.json",L"data/public-prices.json",MOVEFILE_WRITE_THROUGH)!=0;
}
static int series_equal(const Series *a,const Series *b){return a->count==b->count&&(!a->count||!memcmp(a->points,b->points,a->count*sizeof(Point)));}
static int merge(Series *target,const Series *source){size_t i;for(i=0;i<source->count;i++)if(!series_put(target,source->points[i]))return 0;return 1;}
void public_prices_sync(Database *db,int force){
 static const wchar_t *eia_paths[]={L"/dnav/pet/hist/RWTCD.htm",L"/dnav/pet/hist/RBRTEd.htm",L"/dnav/ng/hist/rngwhhdD.htm",L"/dnav/pet/hist/eer_epd2dxl0_pf4_y35ny_dpgD.htm"};
 Series series[PUBLIC_COUNT]={{0}},before[PUBLIC_COUNT]={{0}};cJSON *state,*statuses,*root=NULL,*markets;char *original=NULL,*serialized=NULL;int64_t time=now_ms(),last;int existing,changed=0,ok=1,i,recovered=0;
 if(!db->externalData)db->externalData=cJSON_CreateObject();state=getobject(db->externalData,"publicPrices");{double previous=numeric(cJSON_GetObjectItemCaseSensitive(state,"lastAttempt"));last=isfinite(previous)&&previous>0&&previous<9007199254740991.0?(int64_t)previous:0;}if(!public_prices_due(time,last,force,*gettext(state,"errorCode")!=0))return;
 setnumber(state,"lastAttempt",(double)time);settext(state,"path",PUBLIC_PATH);settext(state,"source","ECB / Binance / EIA / FRED / BCRP / DoltHub external references; no credentials required");statuses=getobject(state,"markets");
 existing=GetFileAttributesW(L"data/public-prices.json")!=INVALID_FILE_ATTRIBUTES;original=read(PUBLIC_PATH);root=original?cJSON_Parse(original):NULL;
 if((existing&&!load(root,series))||(!existing&&GetFileAttributesW(L"data/public-prices.backup.json")!=INVALID_FILE_ATTRIBUTES)){release(series);cJSON_Delete(root);root=NULL;free(original);original=read("data/public-prices.backup.json");root=original?cJSON_Parse(original):NULL;
  if(!load(root,series)){settext(state,"errorCode","PUBLIC_PRICES_CORRUPT_NO_VALID_BACKUP");goto done;}
  if(existing&&!MoveFileExW(L"data/public-prices.json",L"data/public-prices.corrupt.json",MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH)){settext(state,"errorCode","PUBLIC_PRICES_CORRUPT_PRESERVE_FAILED");goto done;}existing=0;recovered=1;
 }
 for(i=0;i<PUBLIC_COUNT;i++){size_t n=series[i].count;if(n){before[i].points=(Point*)malloc(n*sizeof(Point));if(!before[i].points){settext(state,"errorCode","PUBLIC_PRICES_OUT_OF_MEMORY");goto done;}memcpy(before[i].points,series[i].points,n*sizeof(Point));before[i].count=before[i].capacity=n;}}
 {Series parsed[2]={{0}};PublicReply reply=get(L"www.ecb.europa.eu",series[0].count&&series[1].count?L"/stats/eurofxref/eurofxref-hist-90d.xml":L"/stats/eurofxref/eurofxref-hist.xml");int success=reply.status==200&&reply.bytes&&public_prices_ecb_parse(reply.bytes,&parsed[0],&parsed[1]);char code[80];if(success)success=merge(&series[0],&parsed[0])&&merge(&series[1],&parsed[1]);free(parsed[0].points);free(parsed[1].points);snprintf(code,sizeof(code),"PUBLIC_ECB_%s_%lu",reply.status==200?"INVALID":reply.status?"HTTP":"WINHTTP",(unsigned long)(reply.status?reply.status:reply.error));
  for(i=0;i<2;i++)settext(getobject(statuses,references[i].key),"errorCode",success?"":code);if(!success)ok=0;free(reply.bytes);
 }
 for(i=2;i<4&&!oil_stop;i++){int64_t start=series[i].count?series[i].points[series[i].count-1].time-5*DAY_MS:0;int page,success=1;char code[80]="PUBLIC_BINANCE_INVALID_RESPONSE";size_t partial=0;
  for(page=0;page<20&&!oil_stop;page++){wchar_t path[512];PublicReply reply;cJSON *rows;int64_t next=0;int count;
   swprintf_s(path,512,L"/api/v3/klines?symbol=%S&interval=1d&startTime=%lld&limit=1000",references[i].symbol,(long long)start);reply=get(L"data-api.binance.vision",path);rows=reply.bytes?cJSON_Parse(reply.bytes):NULL;count=cJSON_GetArraySize(rows);
   {Series parsed={0};int valid=reply.status==200&&public_prices_binance_parse_checked(rows,&parsed,time,&next,&partial);if(valid)valid=merge(&series[i],&parsed);free(parsed.points);
   if(!valid){snprintf(code,sizeof(code),"PUBLIC_BINANCE_%s_%lu",reply.status==200?"INVALID":reply.status?"HTTP":"WINHTTP",(unsigned long)(reply.status?reply.status:reply.error));success=0;cJSON_Delete(rows);free(reply.bytes);break;}}
   cJSON_Delete(rows);free(reply.bytes);if(count<1000||next>time)break;if(next<=start){success=0;break;}start=next;if(page==19){strcpy_s(code,sizeof(code),"PUBLIC_BINANCE_BACKFILL_PENDING");success=0;}
  }
  {cJSON *status=getobject(statuses,references[i].key);double previous=numeric(cJSON_GetObjectItemCaseSensitive(status,"skippedPartialCandles"));if(partial||!isfinite(previous))setnumber(status,"skippedPartialCandles",(double)partial);settext(status,"observationFilter","Only full closed UTC daily candles; historical early-close maintenance candles excluded and gaps retained.");settext(status,"errorCode",success?"":code);}if(!success)ok=0;
 }
 for(i=4;i<8&&!oil_stop;i++){Series parsed={0};PublicReply reply=get(L"www.eia.gov",eia_paths[i-4]);int success=reply.status==200&&reply.bytes&&public_prices_eia_parse(reply.bytes,&parsed);char code[80];if(success)success=merge(&series[i],&parsed);free(parsed.points);snprintf(code,sizeof(code),"PUBLIC_EIA_%s_%lu",reply.status==200?"INVALID":reply.status?"HTTP":"WINHTTP",(unsigned long)(reply.status?reply.status:reply.error));settext(getobject(statuses,references[i].key),"errorCode",success?"":code);if(!success)ok=0;free(reply.bytes);}
 for(i=8;i<10&&!oil_stop;i++){Series parsed={0};PublicReply reply=fred_get(references[i].symbol);int success=reply.status==200&&reply.bytes&&public_prices_fred_parse(reply.bytes,references[i].symbol,&parsed,time);char code[80];cJSON *status=getobject(statuses,references[i].key);if(success)success=merge(&series[i],&parsed);free(parsed.points);snprintf(code,sizeof(code),"PUBLIC_FRED_%s_%lu",reply.status==200?"INVALID":reply.status?"HTTP":"TRANSPORT",(unsigned long)(reply.status?reply.status:reply.error));settext(status,"errorCode",success?"":code);setnumber(status,"httpStatus",reply.status);settext(status,"transport","Windows system curl; HTTPS verification enabled, HTTP/1.1, application User-Agent, no authentication");settext(status,"license","Copyrighted, personal/noncommercial research only; no data redistribution without source-owner permission.");settext(status,"copyrightSource",i==8?"S&P Dow Jones Indices LLC via FRED":"Nasdaq, Inc. via FRED");if(!success)ok=0;free(reply.bytes);}
 if(!oil_stop){Series parsed[3]={{0}};size_t missing[3]={0};char date[11],code[96];wchar_t path[512];PublicReply reply;cJSON *json;int success,j;
  day_text(time/DAY_MS*DAY_MS,date);swprintf_s(path,512,L"/estadisticas/series/api/PD04701XD-PD04702XD-PD04704XD/json/1997-01-01/%S/ing",date);reply=get(L"estadisticas.bcrp.gob.pe",path);json=reply.bytes?cJSON_Parse(reply.bytes):NULL;
  success=reply.status==200&&json&&bcrp_prices_parse(json,&parsed[0],&parsed[1],&parsed[2],time,missing);if(success)for(j=0;j<3;j++)if(!merge(&series[10+j],&parsed[j]))success=0;
  snprintf(code,sizeof(code),"PUBLIC_BCRP_%s_%lu",reply.status==200?"INVALID":reply.status?"HTTP":"TRANSPORT",(unsigned long)(reply.status?reply.status:reply.error));
  for(j=0;j<3;j++){cJSON *status=getobject(statuses,references[10+j].key);settext(status,"errorCode",success?"":code);setnumber(status,"httpStatus",reply.status);setnumber(status,"missingPublishedObservations",(double)missing[j]);settext(status,"licenseSource","https://estadisticas.bcrp.gob.pe/estadisticas/series/ayuda/condiciones-de-uso");free(parsed[j].points);}if(!success)ok=0;cJSON_Delete(json);free(reply.bytes);
 }
 for(i=13;i<PUBLIC_COUNT&&!oil_stop;i++){Series parsed={0};unsigned long http=0,transport=0;int success=open_stocks_fetch(references[i].symbol,&parsed,time,&http,&transport);char code[80];cJSON *status=getobject(statuses,references[i].key);if(success)success=merge(&series[i],&parsed);free(parsed.points);snprintf(code,sizeof(code),"PUBLIC_DOLT_%s_%lu",http==200?"INVALID":http?"HTTP":"TRANSPORT",http?http:transport);settext(status,"errorCode",success?"":code);setnumber(status,"httpStatus",http);setnumber(status,"transportError",transport);settext(status,"closeAdjustment","Split-adjusted closes; no dividend adjustment. Community-maintained data, not official exchange data.");if(!success)ok=0;}
 if(oil_stop)ok=0;
 for(i=0;i<PUBLIC_COUNT;i++){cJSON *status=getobject(statuses,references[i].key),*metadata=market_json(&references[i],&series[i],0),*field;
  cJSON_ArrayForEach(field,metadata)replace(status,field->string,cJSON_Duplicate(field,1));cJSON_Delete(metadata);setnumber(status,"count",(double)series[i].count);setnumber(status,"firstTime",series[i].count?(double)series[i].points[0].time:0);setnumber(status,"lastTime",series[i].count?(double)series[i].points[series[i].count-1].time:0);if(!series_equal(&series[i],&before[i]))changed=1;
 }
 if(changed||recovered||!existing){cJSON_Delete(root);root=cJSON_CreateObject();markets=cJSON_CreateObject();setnumber(root,"schemaVersion",1);settext(root,"source","Public external references: ECB / Binance / EIA / FRED / BCRP / DoltHub; separate from Hyperliquid execution data");setnumber(root,"lastChanged",(double)time);for(i=0;i<PUBLIC_COUNT;i++)replace(markets,references[i].key,market_json(&references[i],&series[i],1));replace(root,"markets",markets);serialized=cJSON_PrintUnformatted(root);
  if(!serialized||!save(serialized,existing)){settext(state,"errorCode","PUBLIC_PRICES_STORE_FAILED");goto done;}setnumber(state,"lastChanged",(double)time);
 }else setnumber(state,"lastChanged",numeric(cJSON_GetObjectItemCaseSensitive(root,"lastChanged")));
 settext(state,"errorCode",ok?"":"PUBLIC_PRICES_PARTIAL_SOURCE_ERRORS");if(ok)setnumber(state,"lastSuccessfulCheck",(double)time);
done: if(*gettext(state,"errorCode"))oil_log("Public prices error=%s",gettext(state,"errorCode"));release(series);release(before);cJSON_Delete(root);free(original);free(serialized);
}
