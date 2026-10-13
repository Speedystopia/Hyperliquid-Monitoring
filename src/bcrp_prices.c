#define _CRT_SECURE_NO_WARNINGS
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include "bcrp_prices.h"
static int leap(int year){return year%4==0&&(year%100!=0||year%400==0);}
static int64_t observation_day(const char *text){
 static const char *months[]={"Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"};
 static const int lengths[]={31,28,31,30,31,30,31,31,30,31,30,31};
 int day,year,month,y,m;int64_t days=0;
 if(!text||strlen(text)!=9||text[2]!='.'||text[6]!='.'||text[0]<'0'||text[0]>'9'||text[1]<'0'||text[1]>'9'||text[7]<'0'||text[7]>'9'||text[8]<'0'||text[8]>'9')return 0;
 day=(text[0]-'0')*10+text[1]-'0';year=(text[7]-'0')*10+text[8]-'0';year+=year>=70?1900:2000;
 for(month=0;month<12;month++)if(!strncmp(text+3,months[month],3))break;
 /* BCRP uses Peruvian "Set" for September even with the /ing API option. */
 if(month==12&&!strncmp(text+3,"Set",3))month=8;
 if(year<1997||month==12||day<1||day>lengths[month]+(month==1&&leap(year)))return 0;
 for(y=1970;y<year;y++)days+=365+leap(y);for(m=0;m<month;m++)days+=lengths[m]+(m==1&&leap(year));days+=day-1;return days*DAY_MS;
}
static int number(const cJSON *item,double *out){
 char *end;double value;if(cJSON_IsNumber(item))value=item->valuedouble;
 else if(cJSON_IsString(item)){value=strtod(item->valuestring,&end);if(end==item->valuestring||*end)return 0;}
 else return 0;if(!isfinite(value)||value<=0)return 0;*out=value;return 1;
}
static void release(Series arrays[3]){int i;for(i=0;i<3;i++){free(arrays[i].points);memset(&arrays[i],0,sizeof(arrays[i]));}}
int bcrp_prices_parse(const cJSON *json,Series *copper,Series *silver,Series *gold,int64_t now,size_t missing[3]){
 static const char *names[]={"Cobre (Londres, cUS$ por libras)","Plata (H.Harman, US$ por onzas troy)","Oro (Londres, US$ por onzas troy)"};
 Series staged[3]={{0}},merged[3]={{0}},*outputs[]={copper,silver,gold};size_t absent[3]={0};
 const cJSON *config,*series,*periods,*row;int i,ok=0;int64_t previous=0;
 if(!cJSON_IsObject(json)||!copper||!silver||!gold||copper==silver||copper==gold||silver==gold||now<=0)return 0;
 config=cJSON_GetObjectItemCaseSensitive(json,"config");series=cJSON_GetObjectItemCaseSensitive(config,"series");periods=cJSON_GetObjectItemCaseSensitive(json,"periods");
 if(!cJSON_IsArray(series)||cJSON_GetArraySize(series)!=3||!cJSON_IsArray(periods)||!cJSON_GetArraySize(periods))return 0;
 for(i=0;i<3;i++){const cJSON *name=cJSON_GetObjectItemCaseSensitive(cJSON_GetArrayItem(series,i),"name");if(!cJSON_IsString(name)||!strstr(name->valuestring,names[i]))return 0;}
 cJSON_ArrayForEach(row,periods){
  const cJSON *name=cJSON_GetObjectItemCaseSensitive(row,"name"),*values=cJSON_GetObjectItemCaseSensitive(row,"values");int64_t day;
  if(!cJSON_IsObject(row)||!cJSON_IsString(name)||!cJSON_IsArray(values)||cJSON_GetArraySize(values)!=3||(day=observation_day(name->valuestring))==0||day<=previous)goto done;
  previous=day;if(day+DAY_MS>now)continue;
  for(i=0;i<3;i++){const cJSON *value=cJSON_GetArrayItem(values,i);double close;Point point={0};
   if(cJSON_IsString(value)&&!strcmp(value->valuestring,"n.d.")){absent[i]++;continue;}
   if(!number(value,&close))goto done;if(i==0)close/=100;point.time=day+DAY_MS;point.sourceTime=day;point.value=close;if(!series_put(&staged[i],point))goto done;
  }
 }
 /* Merge on copies; errors must not leave a partially updated public archive. */
 for(i=0;i<3;i++){size_t capacity,j;
  if(outputs[i]->count>SIZE_MAX-staged[i].count)goto done;capacity=outputs[i]->count+staged[i].count;
  if(capacity>SIZE_MAX/sizeof(Point))goto done;
  if(capacity){merged[i].points=(Point*)malloc(capacity*sizeof(Point));if(!merged[i].points)goto done;merged[i].capacity=capacity;merged[i].count=outputs[i]->count;if(outputs[i]->count)memcpy(merged[i].points,outputs[i]->points,outputs[i]->count*sizeof(Point));}
  for(j=0;j<staged[i].count;j++)if(!series_put(&merged[i],staged[i].points[j]))goto done;
 }
 for(i=0;i<3;i++){free(outputs[i]->points);*outputs[i]=merged[i];memset(&merged[i],0,sizeof(merged[i]));}if(missing)memcpy(missing,absent,sizeof(absent));ok=1;
done:release(staged);release(merged);return ok;
}
