#define _CRT_SECURE_NO_WARNINGS
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include "../src/bcrp_prices.h"
static const char *prefix="{\"config\":{\"series\":[{\"name\":\"Cotizaciones internacionales - Cobre (Londres, cUS$ por libras)\"},{\"name\":\"Cotizaciones internacionales - Plata (H.Harman, US$ por onzas troy)\"},{\"name\":\"Cotizaciones internacionales - Oro (Londres, US$ por onzas troy)\"}]},\"periods\":";
static cJSON *fixture(const char *periods){char text[4096];snprintf(text,sizeof(text),"%s%s}",prefix,periods);return cJSON_Parse(text);}
static void free_series(Series *s){free(s->points);memset(s,0,sizeof(*s));}
int main(int argc,char **argv){
 Series copper={0},silver={0},gold={0};size_t missing[3]={999,999,999};cJSON *json;int64_t now=INT64_C(1791900000000),last;
 if(argc==2){FILE *file=fopen(argv[1],"rb");long length;char *text;int ok,i;Series *all[]={&copper,&silver,&gold};const char *labels[]={"COPPER","SILVER","GOLD"};assert(file);assert(!fseek(file,0,SEEK_END));length=ftell(file);assert(length>0&&length<16*1024*1024);rewind(file);text=(char*)malloc((size_t)length+1);assert(text);assert(fread(text,1,(size_t)length,file)==(size_t)length);text[length]=0;fclose(file);json=cJSON_Parse(text);assert(json);free(text);ok=bcrp_prices_parse(json,&copper,&silver,&gold,now_ms(),missing);printf("Full BCRP document valid=%d\n",ok);for(i=0;i<3;i++){printf("%s count=%zu missing=%zu firstSource=%lld lastSource=%lld\n",labels[i],all[i]->count,missing[i],all[i]->count?(long long)all[i]->points[0].sourceTime:0,all[i]->count?(long long)all[i]->points[all[i]->count-1].sourceTime:0);free_series(all[i]);}cJSON_Delete(json);return ok?0:1;}
 json=fixture("[{\"name\":\"02.Jan.97\",\"values\":[\"102.285079427984\",\"4.73\",\"366.1\"]},{\"name\":\"08.Oct.26\",\"values\":[\"658.888283191871\",\"59.3425\",\"4132.5\"]},{\"name\":\"09.Oct.26\",\"values\":[\"n.d.\",\"60\",\"n.d.\"]},{\"name\":\"13.Oct.26\",\"values\":[\"999\",\"999\",\"999\"]},{\"name\":\"14.Oct.26\",\"values\":[\"n.d.\",\"n.d.\",\"n.d.\"]}]");
 assert(bcrp_prices_parse(json,&copper,&silver,&gold,now,missing));cJSON_Delete(json);
 assert(copper.count==2&&silver.count==3&&gold.count==2);assert(fabs(copper.points[0].value-1.02285079427984)<1e-12);assert(fabs(copper.points[1].value-6.58888283191871)<1e-12);assert(gold.points[1].value==4132.5);
 assert(copper.points[0].sourceTime==INT64_C(852163200000));assert(copper.points[0].time-copper.points[0].sourceTime==DAY_MS);assert(missing[0]==1&&missing[1]==0&&missing[2]==1);last=gold.points[1].time;assert(last<=now);
 json=fixture("[{\"name\":\"08.Oct.26\",\"values\":[\"660\",\"61\",\"4140\"]}]");assert(bcrp_prices_parse(json,&copper,&silver,&gold,now,NULL));cJSON_Delete(json);assert(copper.count==2&&gold.points[1].value==4140);assert(copper.points[0].sourceTime==INT64_C(852163200000));
 json=fixture("[{\"name\":\"29.Feb.00\",\"values\":[\"100\",\"5\",\"280\"]}]");assert(bcrp_prices_parse(json,&copper,&silver,&gold,now,NULL));cJSON_Delete(json);assert(gold.count==3);
 {Series c={0},s={0},g={0};json=fixture("[{\"name\":\"01.Set.26\",\"values\":[\"600\",\"60\",\"4000\"]},{\"name\":\"02.Sep.26\",\"values\":[\"601\",\"61\",\"4001\"]}]");assert(bcrp_prices_parse(json,&c,&s,&g,now,NULL));assert(g.count==2&&g.points[1].sourceTime-g.points[0].sourceTime==DAY_MS);cJSON_Delete(json);free_series(&c);free_series(&s);free_series(&g);}
 {const char *invalid[]={
  "[{\"name\":\"29.Feb.01\",\"values\":[\"100\",\"5\",\"280\"]}]",
  "[{\"name\":\"02.Jan.96\",\"values\":[\"100\",\"5\",\"280\"]}]",
  "[{\"name\":\"01.Foo.26\",\"values\":[\"100\",\"5\",\"280\"]}]",
  "[{\"name\":\"02.Jan.97\",\"values\":[\"110\",\"6\",\"370\"]},{\"name\":\"08.Oct.26\",\"values\":[\"bad\",\"61\",\"4140\"]}]",
  "[{\"name\":\"08.Oct.26\",\"values\":[\"660\",\"61\"]}]",
  "[{\"name\":\"08.Oct.26\",\"values\":[\"-1\",\"61\",\"4140\"]}]",
  "[{\"name\":\"08.Oct.26\",\"values\":[\"Infinity\",\"61\",\"4140\"]}]",
  "[{\"name\":\"08.Oct.26\",\"values\":[\"660\",\"61\",\"4140\"]},{\"name\":\"08.Oct.26\",\"values\":[\"660\",\"61\",\"4140\"]}]"};size_t i;double old=copper.points[0].value;
  for(i=0;i<sizeof(invalid)/sizeof(invalid[0]);i++){json=fixture(invalid[i]);assert(!bcrp_prices_parse(json,&copper,&silver,&gold,now,missing));cJSON_Delete(json);assert(gold.count==3&&gold.points[2].value==4140&&copper.points[0].value==old);}
 }
 json=fixture("[{\"name\":\"08.Oct.26\",\"values\":[\"660\",\"61\",\"4140\"]}]");{cJSON *name=cJSON_GetObjectItemCaseSensitive(cJSON_GetArrayItem(cJSON_GetObjectItemCaseSensitive(cJSON_GetObjectItemCaseSensitive(json,"config"),"series"),0),"name");cJSON_SetValuestring(name,"Oro (Londres, US$ por onzas troy)");}assert(!bcrp_prices_parse(json,&copper,&silver,&gold,now,NULL));cJSON_Delete(json);
 free_series(&copper);free_series(&silver);free_series(&gold);puts("C: BCRP exact series order/dates, cents conversion, missing values, no future observations, merge preservation and atomic invalid-document rejection OK");return 0;
}
