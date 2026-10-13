#define _CRT_SECURE_NO_WARNINGS
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include "../src/open_stocks.h"
int main(int argc,char **argv){Series raw={0},adjusted={0};cJSON *json,*splits;int64_t next=0,now=INT64_C(1791900000000);
 if(argc==2&&!strcmp(argv[1],"--live")){const char *symbols[]={"MSTR","TLT"};int i,ok=1;for(i=0;i<2;i++){Series prices={0};unsigned long http,error;int success=open_stocks_fetch(symbols[i],&prices,now_ms(),&http,&error);printf("%s success=%d HTTP=%lu error=%lu count=%zu first=%lld last=%lld\n",symbols[i],success,http,error,prices.count,prices.count?(long long)prices.points[0].sourceTime:0,prices.count?(long long)prices.points[prices.count-1].sourceTime:0);fflush(stdout);if(!success)ok=0;free(prices.points);}return ok?0:1;}
 json=cJSON_Parse("{\"data\":{\"status\":\"success\",\"columns\":[{\"name\":\"date\"},{\"name\":\"close\"}],\"rows\":[[\"2024-08-07\",\"1246.8500\"],[\"2024-08-08\",\"135.9900\"],[\"2026-10-13\",\"150\"]]}}");assert(open_stocks_parse(json,&raw,now,&next));assert(raw.count==2);cJSON_Delete(json);
 splits=cJSON_Parse("{\"data\":{\"status\":\"success\",\"columns\":[{\"name\":\"ex_date\"},{\"name\":\"to_factor\"},{\"name\":\"for_factor\"}],\"rows\":[[\"2024-08-08\",\"10\",\"1\"]]}}");assert(open_stocks_adjust(splits,"MSTR",&raw,&adjusted,now));assert(adjusted.count==2&&fabs(adjusted.points[0].value-124.685)<1e-9&&adjusted.points[1].value==135.99);assert(raw.points[0].value==1246.85);cJSON_Delete(splits);free(adjusted.points);memset(&adjusted,0,sizeof(adjusted));
 json=cJSON_Parse("{\"data\":{\"status\":\"timeout\",\"columns\":[{\"name\":\"date\"},{\"name\":\"close\"}],\"rows\":[]}}");assert(!open_stocks_parse(json,&raw,now,&next));cJSON_Delete(json);
 json=cJSON_Parse("{\"data\":{\"status\":\"success\",\"columns\":[{\"name\":\"close\"},{\"name\":\"date\"}],\"rows\":[[\"2026-10-12\",\"2\"]]}}");assert(!open_stocks_parse(json,&raw,now,&next));cJSON_Delete(json);
 json=cJSON_Parse("{\"data\":{\"status\":\"success\",\"columns\":[{\"name\":\"date\"},{\"name\":\"close\"}],\"rows\":[[\"2026-02-30\",\"2\"]]}}");assert(!open_stocks_parse(json,&raw,now,&next));cJSON_Delete(json);
 splits=cJSON_Parse("{\"data\":{\"status\":\"success\",\"columns\":[{\"name\":\"ex_date\"},{\"name\":\"to_factor\"},{\"name\":\"for_factor\"}],\"rows\":[[\"2024-08-08\",\"0\",\"1\"]]}}");assert(!open_stocks_adjust(splits,"MSTR",&raw,&adjusted,now));cJSON_Delete(splits);
 free(raw.points);puts("Dolt: exact schema/status, closed US sessions, split adjustment with raw preservation and invalid response rejection OK");return 0;
}
