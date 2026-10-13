#ifndef OIL_OPEN_STOCKS_H
#define OIL_OPEN_STOCKS_H
#include "core.h"
int open_stocks_parse(const cJSON *json,Series *raw,int64_t now,int64_t *next);
int open_stocks_adjust(const cJSON *json,const char *symbol,const Series *raw,Series *adjusted,int64_t now);
int open_stocks_fetch(const char *symbol,Series *prices,int64_t now,unsigned long *http,unsigned long *error);
#endif
