#ifndef OIL_BCRP_PRICES_H
#define OIL_BCRP_PRICES_H
#include "core.h"
/* BCRP group PD04701XD-PD04702XD-PD04704XD, JSON English dates.
   Copper cents USD/lb becomes USD/lb; silver/gold remain USD/troy oz.
   Observation dates label references, not UTC executable closes. Commit is
   atomic: malformed documents or allocation failure preserve all three Series.
   Missing counts refer to eligible published-date slots, without interpolation. */
int bcrp_prices_parse(const cJSON *json,Series *copper,Series *silver,Series *gold,int64_t now,size_t missing[3]);
#endif
