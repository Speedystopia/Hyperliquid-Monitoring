#ifndef OIL_BENCHMARK_H
#define OIL_BENCHMARK_H
#include <stdint.h>
#include "../vendor/cJSON.h"
#define TLT_SEC_SOURCE "https://www.ishares.com/us/products/239454/ishares-20-year-treasury-bond-etf"
typedef struct {
    int available;
    double percent;
    char asOf[11],error[64],etag[256],modified[80];
    int64_t attempted,checked;
} SecYield;
int tlt_sec_parse(const char *html,double *percent,char asOf[11]);
int tlt_sec_apply(SecYield *yield,int status,const char *html,int64_t time,const char *etag,const char *modified);
int tlt_sec_sync(SecYield *yield,int force);
cJSON *tlt_sec_json(const SecYield *yield);
void tlt_sec_load(SecYield *yield,const cJSON *json);
#endif
