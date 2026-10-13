#ifndef OIL_CORE_H
#define OIL_CORE_H
#include <stdint.h>
#include "../vendor/cJSON.h"
#include "benchmark.h"
#define HOUR_MS INT64_C(3600000)
#define DAY_MS (24 * HOUR_MS)
#define OIL_MARKET_COUNT 15
#define NATIVE_HOURLY_START INT64_C(1686186000000)
typedef struct { int64_t time, sourceTime; double value, premium; } Point;
typedef struct { Point *points; size_t count, capacity; } Series;
typedef struct { Series funding, close4h, close1d; } Market;
typedef struct { Market markets[OIL_MARKET_COUNT]; int64_t attempted, successful; char lastError[256]; int loadedSchema, loadedFundingSchedule; SecYield tltSecYield; cJSON *marketReferences,*externalData; } Database;
extern const char *OIL_COINS[OIL_MARKET_COUNT];
extern const char *OIL_NAMES[OIL_MARKET_COUNT];
extern const char *OIL_REQUESTED[OIL_MARKET_COUNT];
int64_t now_ms(void);
uint32_t oil_collection_delay(int64_t time,int64_t last_hour,int64_t retry_at);
void oil_set_shutdown_event(void *event);
int series_put(Series *s, Point p);
size_t series_lower(const Series *s, int64_t time);
cJSON *series_gaps(const Series *s, int64_t step, int64_t end);
cJSON *funding_gaps(const Series *s, int64_t end, int native_btc);
cJSON *database_json(const Database *db);
int database_load(Database *db, const char *text);
void database_free(Database *db);
int database_sync(Database *db);
cJSON *account_scan(const char *address);
int address_valid(const char *address);
void oil_log(const char *format, ...);
extern volatile long oil_stop;
#endif
