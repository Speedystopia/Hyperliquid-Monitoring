#define _CRT_SECURE_NO_WARNINGS
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include "../src/public_prices.h"
static void free_series(Series *s){free(s->points);memset(s,0,sizeof(*s));}
int main(int argc,char **argv){
 Series eur={0},jpy={0},energy={0},crypto={0};cJSON *rows;int64_t next=0,time=INT64_C(1791900000000);
 if(argc==2&&!strcmp(argv[1],"--live")){Database db={0};cJSON *json;char *text;public_prices_sync(&db,1);json=cJSON_Duplicate(cJSON_GetObjectItemCaseSensitive(db.externalData,"publicPrices"),1);text=cJSON_PrintUnformatted(json);puts(text);free(text);cJSON_Delete(json);database_free(&db);return 0;}
 if(argc==2&&!strcmp(argv[1],"--live-fred")){const char *names[]={"SP500","NASDAQ100"};int i,ok=1;for(i=0;i<2;i++){Series s={0};unsigned long http=0,error=0;int success=public_prices_fred_fetch(names[i],&s,now_ms(),&http,&error);printf("%s valid=%d HTTP=%lu transport=%lu count=%zu firstSource=%lld lastSource=%lld\n",names[i],success,http,error,s.count,s.count?(long long)s.points[0].sourceTime:0,s.count?(long long)s.points[s.count-1].sourceTime:0);if(!success)ok=0;free_series(&s);}return ok?0:1;}
 assert(public_prices_ecb_parse("<gesmes:Envelope><subject>eurofxref</subject><Cube><Cube time='2026-10-12'><Cube currency='USD' rate='1.12'/><Cube currency='JPY' rate='175.84'/></Cube><Cube time='2026-10-09'><Cube currency='USD' rate='1.1'/><Cube currency='JPY' rate='174.9'/></Cube></Cube></gesmes:Envelope>",&eur,&jpy));
 assert(eur.count==2&&eur.points[0].time<eur.points[1].time);assert(fabs(jpy.points[1].value-157)<1e-10);assert(eur.points[1].time-eur.points[1].sourceTime==DAY_MS);
 assert(!public_prices_ecb_parse("<eurofxref><Cube time='2026-02-30'><Cube currency='USD' rate='1.1'/><Cube currency='JPY' rate='170'/></Cube></eurofxref>",&eur,&jpy));assert(!public_prices_ecb_parse("<html>blocked</html>",&eur,&jpy));
 assert(public_prices_eia_parse("<table><th>Week Of Mon Tue Wed Thu Fri</th><tr><td class='B6'>&nbsp;&nbsp;2019 Dec-30 to Jan- 3</td><td class='B3'>60</td><td class='B3'>61</td><td class='B3'></td><td class='B3'>62</td><td class='B3'>63</td></tr><tr><td class='B6'>2020 Apr-20 to Apr-24</td><td class='B3'>-36.98</td><td class='B3'>8.91</td><td class='B3'>NA</td><td class='B3'>--</td><td class='B3'>W</td></tr></table>",&energy));
 assert(energy.count==6&&energy.points[4].value==-36.98);assert(energy.points[2].time-energy.points[1].time==2*DAY_MS);assert(!public_prices_eia_parse("<html>challenge</html>",&energy));
 rows=cJSON_Parse("[[1791676800000,\"1\",\"2\",\"1\",\"2.5\",\"5\",1791763199999],[1791849600000,\"1\",\"2\",\"1\",\"3\",\"5\",1791935999999]]");assert(public_prices_binance_parse(rows,&crypto,time,&next));assert(crypto.count==1&&crypto.points[0].value==2.5);assert(next==INT64_C(1791936000000));cJSON_Delete(rows);
 {Series mixed={0};size_t partial=0;rows=cJSON_Parse("[[1518048000000,\"7599\",\"7844\",\"7572\",\"7784.02\",\"1521\",1518049694788],[1518134400000,\"7784\",\"8000\",\"7700\",\"7900\",\"100\",1518220799999],[1502942400000,\"4000\",\"4500\",\"3900\",\"4285\",\"100\",1503014399999]]");assert(public_prices_binance_parse_checked(rows,&mixed,time,&next,&partial));assert(mixed.count==1&&partial==2&&mixed.points[0].value==7900);assert(next==INT64_C(1518220800000));cJSON_Delete(rows);free_series(&mixed);}
 {Series index={0};assert(public_prices_fred_parse("observation_date,SP500\r\n2026-10-09,7811.54\r\n2026-10-10,\r\n2026-10-11,.\r\n2026-10-12,7807.24\r\n2026-10-13,7900\r\n","SP500",&index,time));assert(index.count==2&&index.points[1].value==7807.24);assert(!public_prices_fred_parse("<html>HTTP200error</html>","SP500",&index,time));assert(!public_prices_fred_parse("observation_date,NASDAQ100\n2026-10-12,30664.7\n","SP500",&index,time));assert(!public_prices_fred_parse("observation_date,SP500\n2026-02-30,7811\n","SP500",&index,time));assert(!public_prices_fred_parse("observation_date,SP500\n2026-10-09,0\n","SP500",&index,time));free_series(&index);}
 {PublicPriceDownload blocked=public_prices_download("https://evil.test/feed.csv","test");assert(!blocked.bytes&&!blocked.status&&blocked.error);blocked=public_prices_download("https://fred.stlouisfed.org/graph/fredgraph.csv?id=SP500","../bad");assert(!blocked.bytes&&blocked.error);}
 assert(public_prices_due(3*DAY_MS+18*HOUR_MS,3*DAY_MS+16*HOUR_MS,0,0));assert(!public_prices_due(3*DAY_MS+19*HOUR_MS,3*DAY_MS+18*HOUR_MS,0,0));assert(public_prices_due(3*DAY_MS+19*HOUR_MS,3*DAY_MS+18*HOUR_MS,0,1));assert(public_prices_due(time,0,0,0));
 free_series(&eur);free_series(&jpy);free_series(&energy);free_series(&crypto);puts("C: ECB exact dates/cross-rate, EIA week rollover/negative prices/missing observations, closed Binance UTC candles, daily slot and failure retry OK");return 0;
}
