#define WIN32_LEAN_AND_MEAN
#define _CRT_SECURE_NO_WARNINGS
#include <winsock2.h>
#include <windows.h>
#include <shellapi.h>
#include <shlobj.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "core.h"
#include "sources.h"
#include "public_prices.h"
#include "resources.h"
#define PORT 18764
#define TRAY_MSG (WM_APP+1)
#define APP_URL L"http://127.0.0.1:18764/"
static Database db;
static CRITICAL_SECTION file_lock;
static CRITICAL_SECTION account_lock;
static char account_address[43]={0};
static char *account_cache=NULL;
static LONG account_generation=0,account_pending=0,account_busy=0;
static volatile LONG syncing=0,requested=0,last_ok=1;
static char status_error[256]={0};
static int64_t status_successful=0,status_attempted=0;
static uint64_t account_revision=0;
static HANDLE shutdown_event=NULL,collector_event=NULL,account_event=NULL;
static SOCKET listener=INVALID_SOCKET;
static NOTIFYICONDATAW tray;
static void request_collection(void){InterlockedExchange(&requested,1);if(collector_event)SetEvent(collector_event);}
static void request_shutdown(void){InterlockedExchange(&oil_stop,1);if(shutdown_event)SetEvent(shutdown_event);}
static void file_stamp(const wchar_t *path,char *out,size_t capacity){
    WIN32_FILE_ATTRIBUTE_DATA attributes;ULARGE_INTEGER time,size;
    out[0]=0;if(!GetFileAttributesExW(path,GetFileExInfoStandard,&attributes))return;
    time.LowPart=attributes.ftLastWriteTime.dwLowDateTime;time.HighPart=attributes.ftLastWriteTime.dwHighDateTime;
    size.LowPart=attributes.nFileSizeLow;size.HighPart=attributes.nFileSizeHigh;
    snprintf(out,capacity,"%llx-%llx",(unsigned long long)time.QuadPart,(unsigned long long)size.QuadPart);
}
static void history_stamp(char *out,size_t capacity){file_stamp(L"data/history.json",out,capacity);}
static int header_equals(const char *request,const char *name,const char *value){
    const char *line=strstr(request,"\r\n");size_t name_len=strlen(name),value_len=strlen(value);
    while(line && line[2]){
        const char *start=line+2,*end=strstr(start,"\r\n"),*text;
        if(!end)return 0;
        if((size_t)(end-start)>name_len && !_strnicmp(start,name,name_len) && start[name_len]==':'){
            text=start+name_len+1;while(text<end && (*text==' '||*text=='\t'))text++;
            while(end>text && (end[-1]==' '||end[-1]=='\t'))end--;
            return (size_t)(end-text)==value_len && !memcmp(text,value,value_len);
        }
        line=end;
    }
    return 0;
}
static int save_data(void);
static char *resource_text(int id,size_t *length) {
    HMODULE module=GetModuleHandleW(NULL);HRSRC res=FindResourceW(module,MAKEINTRESOURCEW(id),RT_RCDATA);
    HGLOBAL loaded;DWORD size;const char *bytes;char *text;
    if(!res)return NULL;size=SizeofResource(module,res);loaded=LoadResource(module,res);if(!loaded)return NULL;
    bytes=(const char*)LockResource(loaded);if(!bytes||!size)return NULL;
    text=(char*)malloc((size_t)size+1);if(!text)return NULL;memcpy(text,bytes,size);text[size]=0;
    if(length)*length=size;return text;
}
static int legacy_startup_path(wchar_t *path,size_t capacity) {
    wchar_t folder[MAX_PATH];
    if(FAILED(SHGetFolderPathW(NULL,CSIDL_STARTUP,NULL,SHGFP_TYPE_CURRENT,folder)))return 0;
    return swprintf_s(path,capacity,L"%s\\Oil Perps Hyperliquid.lnk",folder)>0;
}
static int load_benchmark_seed(void){
    char *text; cJSON *json; SecYield seed={0};
    if(db.tltSecYield.available || db.tltSecYield.attempted || db.tltSecYield.error[0])return 0;
    text=resource_text(OIL_SEC_SEED,NULL);json=text?cJSON_Parse(text):NULL;tlt_sec_load(&seed,json);free(text);cJSON_Delete(json);
    if(!seed.available)return 0;db.tltSecYield=seed;return 1;
}
static int startup_enabled(void) {
    HKEY key;DWORD size=0;LONG result;wchar_t legacy[MAX_PATH+64];
    result=RegOpenKeyExW(HKEY_CURRENT_USER,L"Software\\Microsoft\\Windows\\CurrentVersion\\Run",0,KEY_QUERY_VALUE,&key);
    if(result==ERROR_SUCCESS){result=RegQueryValueExW(key,L"Oil Perps Hyperliquid",NULL,NULL,NULL,&size);RegCloseKey(key);if(result==ERROR_SUCCESS&&size)return 1;}
    return legacy_startup_path(legacy,sizeof(legacy)/sizeof(*legacy)) && GetFileAttributesW(legacy)!=INVALID_FILE_ATTRIBUTES;
}
static LONG startup_set(int enabled) {
    HKEY key;LONG result;wchar_t executable[MAX_PATH],command[MAX_PATH+32],legacy[MAX_PATH+64];
    if(enabled){
        DWORD len=GetModuleFileNameW(NULL,executable,MAX_PATH);if(!len||len>=MAX_PATH)return ERROR_FILENAME_EXCED_RANGE;
        if(swprintf_s(command,sizeof(command)/sizeof(*command),L"\"%s\" --background",executable)<=0 || wcslen(command)>=260)return ERROR_FILENAME_EXCED_RANGE;
        result=RegCreateKeyExW(HKEY_CURRENT_USER,L"Software\\Microsoft\\Windows\\CurrentVersion\\Run",0,NULL,0,KEY_SET_VALUE,NULL,&key,NULL);
        if(result!=ERROR_SUCCESS)return result;
        result=RegSetValueExW(key,L"Oil Perps Hyperliquid",0,REG_SZ,(const BYTE*)command,(DWORD)((wcslen(command)+1)*sizeof(wchar_t)));RegCloseKey(key);
    }else{
        result=RegOpenKeyExW(HKEY_CURRENT_USER,L"Software\\Microsoft\\Windows\\CurrentVersion\\Run",0,KEY_SET_VALUE,&key);
        if(result==ERROR_SUCCESS){result=RegDeleteValueW(key,L"Oil Perps Hyperliquid");RegCloseKey(key);}
        if(result==ERROR_FILE_NOT_FOUND)result=ERROR_SUCCESS;
    }
    if(result!=ERROR_SUCCESS)return result;
    if(legacy_startup_path(legacy,sizeof(legacy)/sizeof(*legacy)) && GetFileAttributesW(legacy)!=INVALID_FILE_ATTRIBUTES && !DeleteFileW(legacy))return (LONG)GetLastError();
    return ERROR_SUCCESS;
}
static char *read_file(const char *path,size_t *length) {
    FILE *f=fopen(path,"rb");long n;char *s;
    if(!f)return NULL;
    if(fseek(f,0,SEEK_END) || (n=ftell(f))<0 || n>64*1024*1024){fclose(f);return NULL;}
    rewind(f);s=(char*)malloc((size_t)n+1);if(!s){fclose(f);return NULL;}
    if(fread(s,1,(size_t)n,f)!=(size_t)n){free(s);fclose(f);return NULL;}
    fclose(f);s[n]=0;if(length)*length=(size_t)n;return s;
}
static int load_data(void) {
    char *s=read_file("data/history.json",NULL);int existed=GetFileAttributesW(L"data/history.json")!=INVALID_FILE_ATTRIBUTES;
    if(s && database_load(&db,s)){
        int legacy=db.loadedSchema<3,upgrade=legacy || db.loadedFundingSchedule!=1;
        if(load_benchmark_seed())upgrade=1;
        free(s);
        if(legacy){
            Database seed={0};int i;char *embedded=resource_text(OIL_SEED,NULL);
            if(embedded && database_load(&seed,embedded))for(i=2;i<OIL_MARKET_COUNT;i++){
                Market *m=&db.markets[i];
                if(!m->funding.count && !m->close4h.count && !m->close1d.count){*m=seed.markets[i];memset(&seed.markets[i],0,sizeof(Market));}
            }
            free(embedded);database_free(&seed);return save_data();
        }
        return upgrade?save_data():1;
    }free(s);
    s=read_file("data/history.backup.json",NULL);
    if(s && database_load(&db,s)){
        load_benchmark_seed();
        free(s);oil_log("Recovered valid backup; corrupt primary retained as history.corrupt.json");
        if(existed && !MoveFileExW(L"data/history.json",L"data/history.corrupt.json",MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH)) return 0;
        return save_data();
    }
    free(s);
    if(existed || GetFileAttributesW(L"data/history.backup.json")!=INVALID_FILE_ATTRIBUTES)return 0;
    s=resource_text(OIL_SEED,NULL);if(!s)return 0;
    {int ok=database_load(&db,s);free(s);if(ok)load_benchmark_seed();return ok && save_data();}
}
static int save_data(void) {
    cJSON *root=database_json(&db);char *s=cJSON_PrintUnformatted(root);HANDLE f;DWORD written;BOOL ok=FALSE;
    cJSON_Delete(root);if(!s)return 0;
    EnterCriticalSection(&file_lock);
    f=CreateFileW(L"data/history.tmp.json",GENERIC_WRITE,0,NULL,CREATE_ALWAYS,FILE_ATTRIBUTE_NORMAL,NULL);
    if(f!=INVALID_HANDLE_VALUE){
        DWORD len=(DWORD)strlen(s);ok=WriteFile(f,s,len,&written,NULL)&&written==len&&FlushFileBuffers(f);CloseHandle(f);
        if(ok) {
            if(GetFileAttributesW(L"data/history.json")!=INVALID_FILE_ATTRIBUTES)
                ok=ReplaceFileW(L"data/history.json",L"data/history.tmp.json",L"data/history.backup.json",0,NULL,NULL);
            else ok=MoveFileExW(L"data/history.tmp.json",L"data/history.json",MOVEFILE_WRITE_THROUGH);
        }
    }
    LeaveCriticalSection(&file_lock);free(s);if(!ok){DWORD error=GetLastError();snprintf(db.lastError,sizeof(db.lastError),"STORE_WIN32_%lu",(unsigned long)error);oil_log("ERROR saving history code=%s",db.lastError);}return ok;
}
static int sync_once(void) {
    static int benchmark_started=0,source_started=0,public_started=0;
    int ok;InterlockedExchange(&syncing,1);oil_log("Synchronization started");
    tlt_sec_sync(&db.tltSecYield,!benchmark_started);benchmark_started=1;
    sources_sync(&db,!source_started);source_started=1;
    public_prices_sync(&db,!public_started);public_started=1;
    ok=database_sync(&db);if(!save_data())ok=0;
    EnterCriticalSection(&file_lock);strcpy_s(status_error,sizeof(status_error),db.lastError);status_successful=db.successful;status_attempted=db.attempted;LeaveCriticalSection(&file_lock);
    InterlockedExchange(&last_ok,ok);InterlockedExchange(&syncing,0);
    oil_log("Synchronization finished ok=%d",ok);return ok;
}
static DWORD WINAPI collector_thread(void *unused) {
    int64_t last_hour=-1,retry_at=0;HANDLE events[2]={shutdown_event,collector_event};(void)unused;
    InterlockedExchange(&requested,1);
    while(!oil_stop) {
        int64_t t=now_ms(),hour=t/HOUR_MS;int minute=(int)((t%HOUR_MS)/60000);
        if(InterlockedExchange(&requested,0) || (minute>=1 && hour!=last_hour) || (retry_at && t>=retry_at)) {
            int ok=sync_once(),fresh=1,i;
            for(i=0;i<OIL_MARKET_COUNT;i++) {
                Market *m=&db.markets[i];
                if(!m->funding.count || m->funding.points[m->funding.count-1].time<hour*HOUR_MS)fresh=0;
                if(!m->close4h.count || m->close4h.points[m->close4h.count-1].time<t/(4*HOUR_MS)*(4*HOUR_MS))fresh=0;
                if(!m->close1d.count || m->close1d.points[m->close1d.count-1].time<t/DAY_MS*DAY_MS)fresh=0;
            }
            last_hour=minute>=1?hour:hour-1;retry_at=ok&&fresh?0:now_ms()+300000;
        }
        {
            DWORD delay=oil_collection_delay(now_ms(),last_hour,retry_at);
            if(WaitForMultipleObjects(2,events,FALSE,delay)==WAIT_OBJECT_0)break;
        }
    }
    return 0;
}
static DWORD WINAPI account_thread(void *unused) {
    int64_t next=0;HANDLE events[2]={shutdown_event,account_event};(void)unused;
    while(!oil_stop) {
        char address[43];LONG generation;int pending;
        EnterCriticalSection(&account_lock);strcpy_s(address,43,account_address);generation=account_generation;
        pending=account_pending;account_pending=0;LeaveCriticalSection(&account_lock);
        if(address[0] && (pending || now_ms()>=next)) {
            cJSON *result;char *text;InterlockedExchange(&account_busy,1);
            result=account_scan(address);text=cJSON_PrintUnformatted(result);cJSON_Delete(result);
            EnterCriticalSection(&account_lock);
            if(generation==account_generation){free(account_cache);account_cache=text;text=NULL;account_revision++;}
            LeaveCriticalSection(&account_lock);free(text);InterlockedExchange(&account_busy,0);next=now_ms()+60000;
        }
        {
            int64_t delay=next-now_ms();DWORD timeout;
            if(delay<0)delay=0;if(delay>60000)delay=60000;
            timeout=address[0]?(DWORD)delay:INFINITE;
            if(WaitForMultipleObjects(2,events,FALSE,timeout)==WAIT_OBJECT_0)break;
        }
    }
    return 0;
}
static int send_all(SOCKET s,const char *p,size_t n) {
    while(n) {int sent=send(s,p,(int)(n>1048576?1048576:n),0);if(sent<=0)return 0;p+=sent;n-=sent;}return 1;
}
static void respond(SOCKET s,int status,const char *type,const char *body,size_t len) {
    char header[1024];int n=snprintf(header,sizeof(header),
        "HTTP/1.1 %d %s\r\nContent-Type: %s\r\nContent-Length: %zu\r\nCache-Control: no-store\r\nConnection: close\r\nX-Content-Type-Options: nosniff\r\nContent-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'\r\n\r\n",status,status==200?"OK":status==202?"Accepted":"Error",type,len);
    if(send_all(s,header,(size_t)n))send_all(s,body,len);
}
static void handle_client(SOCKET s) {
    char req[8192]={0},method[12],path[256],version[16];size_t total=0,length=0;char *body=NULL;int n;DWORD timeout=4000;
    setsockopt(s,SOL_SOCKET,SO_RCVTIMEO,(const char*)&timeout,sizeof(timeout));
    setsockopt(s,SOL_SOCKET,SO_SNDTIMEO,(const char*)&timeout,sizeof(timeout));
    while(total<sizeof(req)-1 && !strstr(req,"\r\n\r\n")) {
        n=recv(s,req+total,(int)(sizeof(req)-1-total),0);if(n<=0)return;total+=(size_t)n;req[total]=0;
    }
    if(!strstr(req,"\r\n\r\n") || sscanf(req,"%11s %255s %15s",method,path,version)!=3)return;
    if(!strstr(req,"\r\nHost: 127.0.0.1:18764\r\n") && !strstr(req,"\r\nhost: 127.0.0.1:18764\r\n")) {
        respond(s,403,"text/plain","Host refuse",11);return;
    }
    if(!strcmp(method,"POST") && !strcmp(path,"/api/sync")) {
        if(!strstr(req,"\r\nX-Oil-Client: 1\r\n") && !strstr(req,"\r\nx-oil-client: 1\r\n")){respond(s,403,"text/plain","Refuse",6);return;}
        request_collection();respond(s,202,"application/json","{\"queued\":true}",15);return;
    }
    if(!strcmp(method,"POST") && !strcmp(path,"/api/startup")) {
        LONG error;char status[128];int len,enabled;
        if(!strstr(req,"\r\nX-Oil-Client: 1\r\n") && !strstr(req,"\r\nx-oil-client: 1\r\n")){respond(s,403,"text/plain","Refuse",6);return;}
        if(strstr(req,"\r\nX-Oil-Startup: on\r\n") || strstr(req,"\r\nx-oil-startup: on\r\n"))enabled=1;
        else if(strstr(req,"\r\nX-Oil-Startup: off\r\n") || strstr(req,"\r\nx-oil-startup: off\r\n"))enabled=0;
        else {respond(s,400,"text/plain","Invalid setting",15);return;}
        error=startup_set(enabled);if(error)oil_log("Startup setting error=STARTUP_WIN32_%ld",error);
        len=snprintf(status,sizeof(status),"{\"enabled\":%s,\"errorCode\":%ld}",startup_enabled()?"true":"false",error);
        respond(s,error?500:200,"application/json",status,(size_t)len);return;
    }
    if(!strcmp(method,"POST") && !strcmp(path,"/api/account")) {
        char address[43]={0};const char *head;
        if(!strstr(req,"\r\nX-Oil-Client: 1\r\n") && !strstr(req,"\r\nx-oil-client: 1\r\n")){respond(s,403,"text/plain","Refuse",6);return;}
        head=strstr(req,"\r\nX-Oil-Address: ");if(!head)head=strstr(req,"\r\nx-oil-address: ");
        if(head){head+=17;if(strncmp(head,"clear\r\n",7)){if(strlen(head)<44){respond(s,400,"text/plain","Adresse invalide",16);return;}memcpy(address,head,42);if(head[42]!='\r'||head[43]!='\n'||!address_valid(address)){respond(s,400,"text/plain","Adresse invalide",16);return;}}}
        else {respond(s,400,"text/plain","Adresse requise",15);return;}
        EnterCriticalSection(&account_lock);strcpy_s(account_address,43,address);account_generation++;account_pending=address[0]?1:0;free(account_cache);account_cache=NULL;account_revision++;LeaveCriticalSection(&account_lock);
        SetEvent(account_event);
        respond(s,202,"application/json","{\"queued\":true}",15);return;
    }
    if(strcmp(method,"GET")){respond(s,405,"text/plain","GET requis",10);return;}
    if(!strcmp(path,"/api/startup")){const char *status=startup_enabled()?"{\"enabled\":true}":"{\"enabled\":false}";respond(s,200,"application/json",status,strlen(status));return;}
    if(!strcmp(path,"/api/status")) {
        char status[900],stamp[80],public_stamp[80];int len,ready,busy;uint64_t revision;
        EnterCriticalSection(&account_lock);revision=account_revision;ready=account_cache!=NULL;busy=account_busy||account_pending;LeaveCriticalSection(&account_lock);
        EnterCriticalSection(&file_lock);history_stamp(stamp,sizeof(stamp));file_stamp(L"data/public-prices.json",public_stamp,sizeof(public_stamp));
        len=snprintf(status,sizeof(status),"{\"syncing\":%s,\"queued\":%s,\"lastOk\":%s,\"now\":%lld,\"errorCode\":\"%s\",\"historyVersion\":\"%s\",\"publicPricesVersion\":\"%s\",\"lastSuccessfulSync\":%lld,\"lastAttempt\":%lld,\"accountVersion\":%llu,\"accountReady\":%s,\"accountBusy\":%s}",syncing?"true":"false",requested?"true":"false",last_ok?"true":"false",(long long)now_ms(),status_error,stamp,public_stamp,(long long)status_successful,(long long)status_attempted,(unsigned long long)revision,ready?"true":"false",busy?"true":"false");
        LeaveCriticalSection(&file_lock);
        respond(s,200,"application/json",status,(size_t)len);return;
    }
    if(!strcmp(path,"/api/account")) {
        EnterCriticalSection(&account_lock);
        if(account_cache){length=strlen(account_cache);body=(char*)malloc(length+1);if(body)memcpy(body,account_cache,length+1);}
        LeaveCriticalSection(&account_lock);
        if(body){respond(s,200,"application/json",body,length);free(body);}
        else respond(s,200,"application/json", "{\"pending\":true}",16);return;
    }
    if(!strcmp(path,"/api/history") || !strcmp(path,"/api/public-prices")) {
        char stamp[80],tag[84],header[512];int header_len;
        int external=!strcmp(path,"/api/public-prices");
        EnterCriticalSection(&file_lock);file_stamp(external?L"data/public-prices.json":L"data/history.json",stamp,sizeof(stamp));snprintf(tag,sizeof(tag),"\"%s\"",stamp);
        if(stamp[0] && header_equals(req,"If-None-Match",tag)){
            LeaveCriticalSection(&file_lock);header_len=snprintf(header,sizeof(header),"HTTP/1.1 304 Not Modified\r\nETag: %s\r\nCache-Control: no-cache\r\nConnection: close\r\n\r\n",tag);send_all(s,header,(size_t)header_len);return;
        }
        body=read_file(external?"data/public-prices.json":"data/history.json",&length);LeaveCriticalSection(&file_lock);
        if(!body){respond(s,404,"text/plain","Indisponible",12);return;}
        header_len=snprintf(header,sizeof(header),"HTTP/1.1 200 OK\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: %zu\r\nETag: %s\r\nCache-Control: no-cache\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n",length,tag);
        if(send_all(s,header,(size_t)header_len))send_all(s,body,length);free(body);return;
    }
    else if(!strcmp(path,"/") || !strcmp(path,"/index.html"))body=resource_text(OIL_HTML,&length);
    else if(!strcmp(path,"/app.js"))body=resource_text(OIL_APP_JS,&length);
    else if(!strcmp(path,"/math.js"))body=resource_text(OIL_MATH_JS,&length);
    else if(!strcmp(path,"/analysis.js"))body=resource_text(OIL_ANALYSIS_JS,&length);
    else if(!strcmp(path,"/research.js"))body=resource_text(OIL_RESEARCH_JS,&length);
    else if(!strcmp(path,"/i18n.js"))body=resource_text(OIL_I18N_JS,&length);
    else if(!strcmp(path,"/updates.js"))body=resource_text(OIL_UPDATES_JS,&length);
    else if(!strcmp(path,"/catalog.js"))body=resource_text(OIL_CATALOG_JS,&length);
    else if(!strcmp(path,"/global.js"))body=resource_text(OIL_GLOBAL_JS,&length);
    else if(!strcmp(path,"/style.css"))body=resource_text(OIL_CSS,&length);
    else if(!strcmp(path,"/licenses")){
        size_t aLen=0,bLen=0;char *a=resource_text(OIL_LICENSE,&aLen),*b=resource_text(OIL_CJSON_LICENSE,&bLen);
        if(a&&b){length=aLen+bLen+9;body=(char*)malloc(length+1);if(body){memcpy(body,a,aLen);memcpy(body+aLen,"\n\ncJSON\n\n",9);memcpy(body+aLen+9,b,bLen);body[length]=0;}}free(a);free(b);
    }
    else if(!strcmp(path,"/favicon.ico")){respond(s,200,"image/x-icon","",0);return;}
    if(body) {
        const char *type=!strcmp(path,"/licenses")?"text/plain; charset=utf-8":!strcmp(path,"/api/history")?"application/json; charset=utf-8":strstr(path,".js")?"application/javascript; charset=utf-8":strstr(path,".css")?"text/css; charset=utf-8":"text/html; charset=utf-8";
        respond(s,200,type,body,length);free(body);
    } else respond(s,404,"text/plain","Indisponible",12);
}
static DWORD WINAPI http_thread(void *unused) {
    (void)unused;
    while(!oil_stop) {SOCKET client=accept(listener,NULL,NULL);if(client==INVALID_SOCKET)break;handle_client(client);closesocket(client);}return 0;
}
static void show_ui(void) {ShellExecuteW(NULL,L"open",APP_URL,NULL,NULL,SW_SHOWNORMAL);}
static LRESULT CALLBACK window_proc(HWND window,UINT message,WPARAM wp,LPARAM lp) {
    if(message==TRAY_MSG) {
        if(lp==WM_LBUTTONUP || lp==WM_LBUTTONDBLCLK)show_ui();
        if(lp==WM_RBUTTONUP) {
            POINT p;HMENU menu=CreatePopupMenu();int chosen;GetCursorPos(&p);
            AppendMenuW(menu,MF_STRING,1,L"Ouvrir les graphiques");AppendMenuW(menu,MF_STRING,2,L"Synchroniser maintenant");AppendMenuW(menu,MF_STRING,3,L"Quitter le collecteur");
            SetForegroundWindow(window);chosen=TrackPopupMenu(menu,TPM_RETURNCMD|TPM_RIGHTBUTTON,p.x,p.y,0,window,NULL);DestroyMenu(menu);
            if(chosen==1)show_ui();if(chosen==2)request_collection();if(chosen==3)DestroyWindow(window);
        }
        return 0;
    }
    if(message==WM_DESTROY){request_shutdown();Shell_NotifyIconW(NIM_DELETE,&tray);PostQuitMessage(0);return 0;}
    if(message==WM_APP+2){DestroyWindow(window);return 0;}
    return DefWindowProcW(window,message,wp,lp);
}
static int run(int argc,wchar_t **argv) {
    wchar_t directory[32768];HANDLE mutex,worker=NULL,server=NULL,accountWorker=NULL;HWND window;WNDCLASSW wc={0};MSG msg;WSADATA wsa;
    struct sockaddr_in addr={0};int once=0,background=0,i,result=0;
    for(i=1;i<argc;i++){if(!wcscmp(argv[i],L"--sync"))once=1;else if(!wcscmp(argv[i],L"--background"))background=1;
        else if(!wcscmp(argv[i],L"--verify-bundle")){
            Database check={0};char *seed;int id,ok;
            for(id=OIL_HTML;id<=OIL_RESEARCH_JS;id++){char *asset=resource_text(id,NULL);if(!asset)return 4;free(asset);}
            seed=resource_text(OIL_SEED,NULL);ok=seed&&database_load(&check,seed);free(seed);database_free(&check);return ok?0:4;
        }
        else if(!wcscmp(argv[i],L"--install-startup"))return (int)startup_set(1);
        else if(!wcscmp(argv[i],L"--remove-startup"))return (int)startup_set(0);
        else if(!wcscmp(argv[i],L"--stop")){HWND old=FindWindowW(L"OilPerpsCollector",NULL);if(old)PostMessageW(old,WM_APP+2,0,0);return 0;}}
    GetModuleFileNameW(NULL,directory,32768);{wchar_t *end=wcsrchr(directory,L'\\');if(end)*end=0;}SetCurrentDirectoryW(directory);
    mutex=CreateMutexW(NULL,FALSE,L"Local\\OilPerpsHyperliquidCollectorV1");
    if(!mutex)return 2;
    if(GetLastError()==ERROR_ALREADY_EXISTS){if(!once&&!background)show_ui();CloseHandle(mutex);return once?3:0;}
    CreateDirectoryW(L"data",NULL);InitializeCriticalSection(&file_lock);InitializeCriticalSection(&account_lock);
    shutdown_event=CreateEventW(NULL,TRUE,FALSE,NULL);collector_event=CreateEventW(NULL,FALSE,FALSE,NULL);account_event=CreateEventW(NULL,FALSE,FALSE,NULL);
    if(!shutdown_event||!collector_event||!account_event){result=2;goto done;}oil_set_shutdown_event(shutdown_event);
    if(!load_data()){oil_log("ERROR: history and backup invalid; refused to overwrite");MessageBoxW(NULL,L"Le JSON et sa sauvegarde sont illisibles. Les fichiers ont ete preserves.",L"Oil Perps Hyperliquid",MB_ICONERROR);result=2;goto done;}
    status_successful=db.successful;status_attempted=db.attempted;strcpy_s(status_error,sizeof(status_error),db.lastError);last_ok=db.lastError[0]?0:1;
    if(once){result=sync_once()?0:1;goto done;}
    if(WSAStartup(MAKEWORD(2,2),&wsa)){result=2;goto done;}
    listener=socket(AF_INET,SOCK_STREAM,IPPROTO_TCP);addr.sin_family=AF_INET;addr.sin_port=htons(PORT);addr.sin_addr.s_addr=htonl(INADDR_LOOPBACK);
    {BOOL exclusive=TRUE;setsockopt(listener,SOL_SOCKET,SO_EXCLUSIVEADDRUSE,(char*)&exclusive,sizeof(exclusive));}
    if(listener==INVALID_SOCKET || bind(listener,(struct sockaddr*)&addr,sizeof(addr)) || listen(listener,16)){
        MessageBoxW(NULL,L"Le port local 18764 est indisponible.",L"Oil Perps Hyperliquid",MB_ICONERROR);result=2;goto net_done;}
    wc.lpfnWndProc=window_proc;wc.hInstance=GetModuleHandleW(NULL);wc.lpszClassName=L"OilPerpsCollector";RegisterClassW(&wc);
    window=CreateWindowW(wc.lpszClassName,L"Oil Perps Hyperliquid",0,0,0,0,0,NULL,NULL,wc.hInstance,NULL);
    if(!window){result=2;goto net_done;}
    tray.cbSize=sizeof(tray);tray.hWnd=window;tray.uID=1;tray.uFlags=NIF_ICON|NIF_MESSAGE|NIF_TIP;tray.uCallbackMessage=TRAY_MSG;
    tray.hIcon=LoadIconW(NULL,IDI_APPLICATION);wcscpy_s(tray.szTip,128,L"Oil Perps Hyperliquid - collecte a HH:01");Shell_NotifyIconW(NIM_ADD,&tray);
    worker=CreateThread(NULL,0,collector_thread,NULL,0,NULL);server=CreateThread(NULL,0,http_thread,NULL,0,NULL);accountWorker=CreateThread(NULL,0,account_thread,NULL,0,NULL);
    if(!worker||!server||!accountWorker){DestroyWindow(window);result=2;}
    else {if(!background)show_ui();while(GetMessageW(&msg,NULL,0,0)>0){TranslateMessage(&msg);DispatchMessageW(&msg);}}
    request_shutdown();
net_done:
    if(listener!=INVALID_SOCKET){closesocket(listener);listener=INVALID_SOCKET;}
    if(server){WaitForSingleObject(server,5000);CloseHandle(server);}
    if(worker){WaitForSingleObject(worker,45000);CloseHandle(worker);}
    if(accountWorker){WaitForSingleObject(accountWorker,45000);CloseHandle(accountWorker);}
    WSACleanup();
done:
    oil_set_shutdown_event(NULL);if(shutdown_event)CloseHandle(shutdown_event);if(collector_event)CloseHandle(collector_event);if(account_event)CloseHandle(account_event);
    database_free(&db);free(account_cache);DeleteCriticalSection(&account_lock);DeleteCriticalSection(&file_lock);CloseHandle(mutex);return result;
}
int WINAPI wWinMain(HINSTANCE instance,HINSTANCE previous,PWSTR command,int show) {
    int argc,result;wchar_t **argv=CommandLineToArgvW(GetCommandLineW(),&argc);
    (void)instance;(void)previous;(void)command;(void)show;if(!argv)return 2;result=run(argc,argv);LocalFree(argv);return result;
}
