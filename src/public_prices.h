#ifndef OIL_PUBLIC_PRICES_H
#define OIL_PUBLIC_PRICES_H
#include "core.h"
void public_prices_sync(Database *db,int force);
int public_prices_ecb_parse(const char *xml,Series *eurusd,Series *usdjpy);
int public_prices_eia_parse(const char *html,Series *prices);
int public_prices_binance_parse(const cJSON *rows,Series *prices,int64_t now,int64_t *next);
int public_prices_binance_parse_checked(const cJSON *rows,Series *prices,int64_t now,int64_t *next,size_t *partial_candles);
int public_prices_due(int64_t now,int64_t last_attempt,int force,int failed);
#endif
