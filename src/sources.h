#ifndef OIL_SOURCES_H
#define OIL_SOURCES_H
#include "core.h"
/* Optional, public reference data. Failures never discard historical prices. */
void sources_sync(Database *db,int force);
int sources_context_apply(cJSON *markets,const cJSON *response,int64_t time,int xyz);
int sources_file_id_valid(const char *id);
int sources_auth_kind(const char *token,const char *id,const char *password);
void sources_cme_attempt(cJSON *state,int64_t time);
int sources_cme_progress(cJSON *state,const char *dataset,const char *next,int complete);
#endif
