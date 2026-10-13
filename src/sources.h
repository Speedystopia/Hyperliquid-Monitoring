#ifndef OIL_SOURCES_H
#define OIL_SOURCES_H
#include "core.h"
/* Parsing guard only, not an exchange leverage limit. Actual permitted
   leverage always comes from the market's current universe.maxLeverage. */
#define SOURCES_LEVERAGE_PARSE_LIMIT 10000
/* Optional, public reference data. Failures never discard historical prices. */
void sources_sync(Database *db,int force);
int sources_context_apply(cJSON *markets,const cJSON *response,int64_t time,int xyz);
int sources_book_apply(cJSON *books,const cJSON *response,int market,int64_t collected_at);
cJSON *sources_fees_parse(const cJSON *response,int64_t time,int account);
cJSON *sources_market_fees(const cJSON *quote,const cJSON *base_fees);
cJSON *sources_account_fees(const char *address);
int sources_file_id_valid(const char *id);
int sources_auth_kind(const char *token,const char *id,const char *password);
void sources_cme_attempt(cJSON *state,int64_t time);
int sources_cme_progress(cJSON *state,const char *dataset,const char *next,int complete);
#endif
