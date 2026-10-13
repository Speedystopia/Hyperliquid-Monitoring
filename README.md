# Hyperliquid Monitoring

A portable Windows application for funding history, closing prices, positions and correlations across **fifteen Hyperliquid assets**. The collector, storage layer, and local server are written in **C17** and compiled with Microsoft Visual C. The local HTML/CSS/JavaScript interface uses no external libraries, CDN, or hosting service.

## Three views, any two assets

- **Home** provides cards opening the selected comparison or the global correlation map.
- **Monitoring** shows funding, prices, the four-curve combined chart, historical indicators and positions for the two assets chosen in the header. Both selectors contain all fifteen assets; identical selections are disabled. This allows 105 distinct comparisons.
- **Global correlations** compares every asset with every other one in a colored matrix. Red denotes opposite movements and green the same direction. Separate ranked tables show strong and weak correlations of either sign, plus three funding configurations; all exclude out-of-criteria results, self-correlations and duplicate pairs.

| Display name | Canonical API coin | Hyperliquid market |
| --- | --- | --- |
| Brent | `xyz:BRENTOIL` | [BRENTOIL](https://app.hyperliquid.xyz/trade/xyz:BRENTOIL) |
| WTI | `xyz:CL` | [WTIOIL](https://app.hyperliquid.xyz/trade/xyz:WTIOIL) |
| Diesel | `xyz:HO` | [DIESEL](https://app.hyperliquid.xyz/trade/xyz:DIESEL) |
| Natural Gas | `xyz:NATGAS` | [NATGAS](https://app.hyperliquid.xyz/trade/xyz:NATGAS) |
| BTC | `BTC` | [BTC](https://app.hyperliquid.xyz/trade/BTC) |
| MSTR | `xyz:MSTR` | [MSTR](https://app.hyperliquid.xyz/trade/xyz:MSTR) |
| Gold | `xyz:GOLD` | [GOLD](https://app.hyperliquid.xyz/trade/xyz:GOLD) |
| EUR/USD | `xyz:EUR` | [EURUSD](https://app.hyperliquid.xyz/trade/xyz:EURUSD) |
| S&P 500 | `xyz:SP500` | [SP500](https://app.hyperliquid.xyz/trade/xyz:SP500) |
| TLT | `xyz:TLT` | [TLT](https://app.hyperliquid.xyz/trade/xyz:TLT) |
| XYZ100 | `xyz:XYZ100` | [XYZ100](https://app.hyperliquid.xyz/trade/xyz:XYZ100) |
| Copper | `xyz:COPPER` | [COPPER](https://app.hyperliquid.xyz/trade/xyz:COPPER) |
| USD/JPY | `xyz:JPY` | [USDJPY](https://app.hyperliquid.xyz/trade/xyz:USDJPY) |
| ETH | `ETH` | [ETH](https://app.hyperliquid.xyz/trade/ETH) |
| Silver | `xyz:SILVER` | [SILVER](https://app.hyperliquid.xyz/trade/xyz:SILVER) |

Collection is shared: BTC, Brent and EUR/USD are downloaded once, regardless of the comparison. URL fragments select one of the three views. Existing two- or nine-market JSON files are migrated to schema version 3 without removing their recorded rows. The embedded seed supplies newly added assets immediately. The executable retains its OilPerps.exe filename for compatibility with existing installations.

## Run: one executable

Download **OilPerps.exe** from the [latest release](https://github.com/Speedystopia/Hyperliquid-Monitoring/releases/latest), place it in a writable folder, and double-click it. The executable includes the interface, seven languages, licenses, and an initial market history. No launcher script, installer, separate web folder, or compiler is needed to use the application.

On its first launch, it creates **data/history.json** beside the executable and retrieves any newer data. Updates preserve your existing JSON. The `data/` folder also contains the backup and collection log; it remains separate so your history can be retained and inspected.

The interface opens at `http://127.0.0.1:18764/`. In the footer, **Start with Windows** enables or disables automatic startup for your user session, without administrator privileges. This setting uses only a registry entry named **Oil Perps Hyperliquid** under the current user. The application's older startup shortcut is removed when this setting is changed.

**Automatic startup happens when you sign in to Windows**, after the PC starts. It does not run before sign-in. Windows may delay startup applications. Automatic startup runs the collector in the background without opening a browser tab.

Closing the tab does not stop the collector. Its system tray icon lets you open the interface, synchronize, or quit. `OilPerps.exe --stop` stops the collector. `--install-startup` and `--remove-startup` are command-line equivalents of the integrated startup setting.

Requirements: Windows 10/11 x64, an Internet connection for new data, and a modern browser. The C runtime is statically linked: Python, Node.js, and Visual Studio are not required to run the app. Local port 18764 must be available. Only one instance runs per Windows session. Embedded licenses can be viewed through **Licenses** in the interface.

## Background operation and resource usage

In normal background operation, the collector opens no console or browser window and plays no notification sounds. It stays available through its system tray icon. Collection failures are recorded in the log and shown in the interface; local startup problems, such as an unreadable history and backup or an unavailable port, can display an error dialog.

The collector waits for the next collection deadline or an explicit request, with a lightweight clock check at most once per minute. The account worker waits indefinitely when no address has been selected, and wakes immediately for a new scan or shutdown. Market data is fetched at startup and hourly, with additional requests for recovery, retries, or manual synchronization. Recent data is reread to catch late publication or corrections; missing ranges already covered by that reread are not requested twice. Funding pagination stops when the returned page is smaller than the API's 500-row limit.

While the tab is visible, the interface checks a small status response every 15 seconds when idle and every two seconds during collection or an account scan. It downloads and parses the history JSON only when the stored snapshot version changes. Conditional requests use an ETag; an unchanged response is HTTP 304 with no JSON body. Account results are downloaded only when their version changes.

When the tab is hidden, polling stops, in-flight requests are cancelled, and chart rendering is suspended. Returning to the tab checks for updates immediately. Funding aggregates are shared per asset and interval, rather than copied per comparison. Period statistics, position levels, and number/date formatters are reused until their inputs change. Only the visible view is recalculated; outdated history caches are released when the data changes. Canvas redraws are coalesced to animation frames, and backing buffers are resized only when chart dimensions change.

After scanning an address, the backend continues refreshing positions every minute until the address is cleared or the collector exits, including while the tab is hidden or closed. Market collection likewise continues independently of the interface. Browser memory and processing remain additional to the collector's own usage. Usage depends on history size, the browser, account scanning, and synchronization; there is no fixed CPU or memory guarantee.

## Data and schedule

- **data/history.json** stores the public market histories. An initial download is embedded in the executable and updated automatically.
- Collection runs at startup and every hour at **HH:01 UTC**. This is also minute 01 in time zones with whole-hour offsets, including Europe/Paris. A network failure or a latest payment that has not yet appeared triggers another attempt within five minutes.
- After shutdown, sleep, or a network interruption, missing intervals are requested again. All previously downloaded observations are retained.
- Current funding data is hourly; the API has no native 4H/1D funding endpoint. Pagination retrieves the available history from the first payment, without a local 500-observation limit. Early BTC and ETH history uses eight-hour settlements before 2023-06-08 01:00 UTC. Each payment includes `intervalHours` (8 or 1).
- **4H** and **Daily** funding charts sum payments covering 4 or 24 hours respectively. Legacy eight-hour BTC/ETH payments can form Daily periods but are never split into invented 4H rates. Chart values are not annualized or compounded. A period with a missing payment is not shown as complete.
- Prices are **native 4H and 1D closing prices**. Open candles are excluded. The API exposes the latest 5,000 candles per interval. BTC and ETH already have a longer recoverable Daily history than 4H history; older 4H prices cannot be downloaded through this endpoint. Diesel's currently available history starts in October 2026. Coverage is shown separately for each asset and interval; older local archives can retain data that a new installation cannot recover.
- Timestamps are UTC Unix milliseconds and represent the **end** of a period. The actual funding payment timestamp is also retained in `sourceTime`; `time` is rounded down to the hour to align payments with closes.
- Each series provides its observation count, coverage, and `missingRanges`. Missing values are never interpolated. Gaps older than the API's retention remain reported, without fabricated prices.

For example, at 04:01 UTC, the app retrieves the 04:00 funding payment and the 4H candle that closed at 04:00. Funding for 00:00–04:00 is the sum of the payments at 01:00, 02:00, 03:00, and 04:00. A daily period ends at 00:00 UTC the following day.

The JSON is written to a temporary file, flushed to disk, and replaced atomically. The previous version is retained as `history.backup.json`. If the primary file is corrupt, a valid backup is restored. If both are unreadable, the app refuses to overwrite them. Public collection errors are recorded in `data/collector.log`. Previously recorded funding payments and 4H/Daily closes are retained as new observations arrive, even when the API’s rolling window no longer exposes the old candles. This builds a local archive independent of that retrieval window; it cannot recreate prices that were unavailable before the first download.

The collector does not run while Windows is shut down or asleep. Recovery happens after wake-up or startup. The computer must remain awake for collection to occur at every scheduled HH:01.

**Sync now** requests an additional collection; it does not replace automatic startup and hourly synchronization. Failures display a code such as `HTTP_429`, `HTTP_503`, or `WINHTTP_12007`, retained in the JSON's `lastError` and in the log with a UTC timestamp and attempt number. Storage errors are also logged as `STORE_WIN32_...`.

## Languages

The interface defaults to English. The selector provides English, French, Simplified Chinese, Korean, Japanese, Italian, and Spanish. The selected language is saved locally in the browser and contains no account address. Dates and numbers also use the selected locale. Market identifiers, personal subaccount names, and error codes do not require translation.

## Charts

A light dashed **0% · zero funding** line appears on the funding chart and the combined chart.

The language selector is centered in the header. The manual synchronization button sits beside the collector status. The selected assets' price cards link to their Hyperliquid markets.

Three synchronized charts show funding for both markets, closing prices for both markets, and all four curves overlaid. The combined chart uses funding percentages on the left axis and quoted prices on the right; USD/JPY is quoted in yen per U.S. dollar, while other asset prices are shown in USD; price curves are dashed. Choose 4H/Daily, 7/30/90 days or full history, and UTC or local time. Scroll to zoom, drag to pan, hover to inspect values, and double-click to reset.

## Historical indicators

Cards and indicators recalculate whenever the JSON changes and whenever **7 / 30 / 90 days / full history** is selected. The period selector determines the data used by these cards; manual chart zoom only changes the charts. Funding includes hourly payments through the latest retrieved payment. Price cards retain the latest close and add the average close and price change for the selected period.

- **Realized funding annualized** = sum of funding rates ÷ hours covered by those payments × 8,760 × 100. For current hourly payments this equals the average hourly rate; legacy BTC/ETH payments cover eight hours each. It describes an annual pace calculated from past payments, not a payment actually received over an entire year. Positive market funding rates represent funding paid by a long and received by a short.
- **Funding sum over the last 12 months**, available under **Data coverage & methodology**, sums realized payments over the 365 days ending at the latest payment. Coverage shorter than one year is explicitly marked partial. The main cards show cumulative funding and observed duration for the selected period.
- **Price correlation** = Pearson's correlation coefficient × 100 for consecutive percentage changes in the selected assets' closes with matching timestamps in the selected period, using 4H or Daily according to the selection. Dates missing either asset's price are excluded. −100% is a perfect inverse linear relationship; +100% is a perfect positive relationship. This measures consecutive percentage returns. The sample size and matched dates are shown. Constant series or insufficient data return no value.

## Unified correlation analysis

Global analysis has one fixed method: **Daily percentage returns over the complete common Hyperliquid history**. The source and closing-level selectors have been removed. Each return uses adjacent complete candles; missing intervals are never interpolated. Hover or select a matrix cell to see its sample and dates.

External references are loaded automatically. Each pair's external confirmation uses exactly the return timestamps also available for both Hyperliquid assets. The app displays the external coefficient and the Hyperliquid coefficient on those same observations, plus provenance, sample size and disagreement flags. It does not average coefficients from different sources or periods into a reliability score. The full external histories remain archived and their counts and coverage are shown at the bottom of the page.

Five ranked tables exclude self-pairs, duplicates and out-of-criteria results, and display at most six qualifying pairs:

- **Strong correlation:** absolute correlation **at least 75%**, including positive and negative signs; sorted by descending strength.
- **Weak correlation:** absolute correlation **at most 25%**, including zero; sorted from the weakest relationship. Values between 25% and 75% are excluded from these two lists.
- **Same-direction moves · opposite funding signs:** correlation strictly **above +66%**, with one positive and one negative full-history mean funding rate.
- **Same-direction moves · same funding signs:** correlation strictly **above +66%**, with two positive or two negative full-history means. This includes Brent/WTI when their funding rates are both negative.
- **Opposite moves · same funding signs:** correlation strictly **below -66%**, with two positive or two negative means.

There is **no best-candidate fallback**. An empty qualifying set displays an empty-state message. General strength thresholds and strategy screening thresholds are different and are labeled explicitly.

For positive correlation, short the asset with the higher funding rate and long the lower one. Net funding is **higher minus lower**, including when both rates are negative. For negative correlation with same-sign funding, both positions are short when funding is positive or both long when negative; net funding is the sum of absolute rates. These ranking rates use **equal notionals** and are expressed relative to one leg's notional, before fees and price changes. They are distinct from the account simulation's leveraged margin-based results.

Funding rates are annualized as sum of recorded rates / covered hours x 8,760 x 100. Legacy eight-hour settlements retain their duration. Rates and correlations can cover different histories; each coverage is displayed. Colors compare ranking funding to the **TLT ETF 30-day SEC yield**: red at or below yield minus one percentage point, green at or above yield plus one, yellow in between. The official iShares yield, date, thresholds and retrieval errors remain visible and refresh with the collector.

All analytical sections have accessible collapse/expand controls. Collapsing preserves selected assets, account input and data; charts stop drawing while collapsed. The Daily archive table is at the bottom of the monitoring content, after the account analysis and source information.
## Combined analysis: account-gated simulation

The analysis is inactive until a valid public address has been scanned successfully and matches the input. Clearing or editing the address locks it again; no expensive account simulation runs without this proof. The account form is available on Monitoring and Global. Addresses, positions and account fee schedules remain in memory and are never saved in browser preferences or public archives.

The simplified simulation fixes **1,000 USDC of margin per leg**, uses **market/taker execution**, and chooses the largest currently allowed leverage at the resulting notional using Hyperliquid's published asset cap and [margin tiers](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/margin-tiers). Missing or stale cap/tier data makes the capital calculation unavailable. Notional is 1,000 x applicable leverage for each asset: equal margins can produce unequal notionals, and the exposure imbalance is displayed. These are hypothetical positions; the software sends no trading orders.

Each leg uses the scanned account's current taker fee and walks the observed L2 book according to its side and amount. Insufficient or stale depth, missing fees or missing leverage is explicit; no arbitrary fee/slippage fallback is substituted. Opening, reversal and closing costs are separate. The UI presents the two legs, recent funding on the **2,000 USDC total-margin basis**, the 90-day correlation, exposure imbalance and a limited historical projection. Detailed diagnostics and decision events are expandable.

There is no calendar or covariance-drift resizing. Historical controls use prior Daily observations and funding already known at that time. Funding that supports a different profitable orientation can reverse the simulated positions. A reversed or insufficient 90-day correlation (absolute value at most 66%), or a nonpositive net funding condition, closes the simulated strategy without automatic reopening. A stable valid strategy does not trade periodically. Live indicative hourly funding is distinct from the recorded settlement used by this policy.

A chronological training period still precedes the test; future data cannot choose opening directions or earlier decisions. Funding USDC is estimated with the preceding Daily close because historical intraday oracle prices are unavailable. The current leverage, tiers, fees and book are projected backward; historical leverage limits, fills and intraday liquidations are unknown. **The leveraged historical projection is explicitly unvalidated, with no certified annualized return or liquidation-safety result.** Daily controls can detect intraday reversals late. The calculation also omits collateral interest, frontend builder fees and actual execution. The original standalone analysis API remains available for compatibility; its editable modes are no longer exposed by the interface.
## Hyperliquid reference prices and funding explanation

For each selected asset, the interface shows Hyperliquid **mark price**, **mid price**, **oracle/reference price**, the mid/reference gap and the current indicative hourly funding rate. Two shared `metaAndAssetCtxs` requests cover native markets and the `xyz` DEX, together with one public fee-schedule request and fifteen L2 requests. They run during startup/hourly collection independently of the visible comparison. These are hourly snapshots, not a tick stream. Account-specific fees are read only when an address is selected.

Positive funding means longs pay shorts; negative funding means shorts pay longs. A perpetual premium generally favors positive funding, and a discount negative funding, but the interest component, sampled premium and HIP-3 parameters mean the sign is not an exact test of the current mid/oracle gap. Equal prices do not guarantee zero funding. The oracle is an underlying reference and is not labeled as an actual Hyperliquid spot quote for instruments without such a spot market. See the [official funding formula](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/funding).

`history.json/marketReferences` retains the latest contexts, `execution.markets` per-asset public fee rates, `depthBooks`, and 24 recent snapshots, source/error fields and archive metadata. The full reference snapshots append to **data/references-YYYY.jsonl**. Reference retrieval failures preserve previous prices and report a coded error; failed depth is explicitly unavailable. Archive files are excluded from Git to keep personal installations and growing data out of the public repository.

The ranking tables describe full-history, equal-notional funding. Account summaries use actual current leverage and equal 1,000 USDC margins, so their notionals and recent funding estimates can differ. The SEC color band evaluates only the displayed ranking funding rate, not the entire strategy.

## Public reference histories without registration

Global analysis automatically reads external references alongside the primary Hyperliquid returns. The archives and aligned comparisons require no new account or API key:

| Asset | Public reference | Important difference |
| --- | --- | --- |
| EUR/USD | [ECB euro reference rates](https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.xml) | USD per EUR reference fixing, not a UTC perp close |
| USD/JPY | Same ECB archive | Derived as JPY per EUR / USD per EUR, not a traded USD/JPY close |
| BTC, ETH | [Binance public market-data API](https://developers.binance.com/docs/binance-spot-api-docs/rest-api/general-api-information) | Spot BTCUSDT/ETHUSDT closed Daily candles; USDT is distinct from USD/USDC |
| WTI | [EIA Cushing WTI spot history](https://www.eia.gov/dnav/pet/hist/RWTCD.htm) | Spot reference, not a CME futures contract or perp |
| Brent | [EIA Europe Brent spot history](https://www.eia.gov/dnav/pet/hist/RBRTEd.htm) | Spot reference |
| Diesel | [EIA New York Harbor ULSD spot history](https://www.eia.gov/dnav/pet/hist/eer_epd2dxl0_pf4_y35ny_dpgD.htm) | Diesel/ULSD spot reference |
| Natural Gas | [EIA Henry Hub spot history](https://www.eia.gov/dnav/ng/hist/rngwhhdD.htm) | Spot reference |
| S&P 500 | [FRED SP500](https://fred.stlouisfed.org/series/SP500), S&P Dow Jones Indices | Exact cash index closes, a rolling ten-year retrieval limit; downloaded history is retained locally |
| XYZ100 | [FRED NASDAQ100](https://fred.stlouisfed.org/series/NASDAQ100), Nasdaq | Nasdaq-100 cash index since 1986, not the Hyperliquid perpetual |
| Gold | [BCRP PD04704XD](https://estadisticas.bcrp.gob.pe/estadisticas/series/diarias/resultados/PD04704XD/html), original source Reuters | London daily statistical quotation, USD/troy ounce, since 1997 |
| Silver | [BCRP PD04702XD](https://estadisticas.bcrp.gob.pe/estadisticas/series/diarias/resultados/PD04702XD/html), original source Reuters | Daily statistical quotation, USD/troy ounce, since 1997 |
| Copper | [BCRP PD04701XD](https://estadisticas.bcrp.gob.pe/estadisticas/series/diarias/resultados/PD04701XD/html), original source Reuters | Daily statistical quotation since 1997; cents USD/lb converted to USD/lb |
| MSTR, TLT | [DoltHub post-no-preference/stocks](https://www.dolthub.com/repositories/post-no-preference/stocks) | Community-maintained US stock/ETF closes since 2011; split-adjusted, no dividend adjustment |

All fifteen assets now have an external reference. A failed or unavailable reference is never silently replaced by a Hyperliquid price. EIA, ECB, Binance, FRED, BCRP and DoltHub have different calendars, observation times and market definitions. Calendar dates are normalized to the end of a Daily date bucket for matching, without claiming that a reference fixing occurred at UTC midnight. Returns spanning missing days are excluded. Raw zero/negative energy prices are retained in the archive but excluded from percentage-return calculations.

The separate **data/public-prices.json** archive retains downloaded rows and new observations, with an atomic backup and corruption recovery. Only small per-asset counts, dates, source/error metadata are stored in `history.json/externalData.publicPrices`. Collection runs at startup and daily after the 17:00 UTC collection slot, with a one-hour retry after a failure. Existing ECB history refreshes recent dates; Binance pagination starts from the first available candle and subsequently rereads the latest five days; EIA tables are deduplicated into the retained archive. FRED downloads its available daily CSV histories and merges them without deleting previously saved observations. BCRP downloads all three metals in one JSON request; `n.d.` observations are excluded without interpolation. US closes are included only after 16:00 US Eastern time (or later daily dates); statistical dates are not actual UTC trading closes.

DoltHub's public API requires no account. Its table has a composite date/ticker key: bounded exact-key requests avoid slow scans of the whole database. Initial collection can take several minutes because the public API is queried sequentially in small bounded windows. It downloads every available daily close; subsequent checks reread thirty days, with a full refresh every thirty days. **data/public-stocks-MSTR.raw.json** and **data/public-stocks-TLT.raw.json** retain raw closes and the source split response. Archived analysis closes are recomputed from raw prices using split factors; MSTR's 10-for-1 split on 2024-08-08 therefore does not introduce a false -90% return. Split data is updated monthly by this community publisher and can lag a new corporate action. Dividends are not included in this price-only comparison. Source errors preserve previous data and remain visible.

The browser downloads this additional JSON on Monitoring or Global only when its file version changes; ETag 304 and hidden-tab cancellation remain supported. These archives are excluded from Git and are not bundled in the executable. Funding, positions, execution costs and the detailed hedge simulation continue to use Hyperliquid; longer external price histories cannot recreate funding before a perp existed. External correlation and the detailed Hyperliquid diagnostic can therefore have different coverage and coefficients.

ECB reference-rate reuse is attributed to the [ECB](https://www.ecb.europa.eu/services/using-our-site/disclaimer/html/index.en.html); the derived USD/JPY cross is explicitly identified. EIA data reuse follows its [public-domain data policy](https://www.eia.gov/about/copyrights_reuse.php). FRED's index histories are copyrighted by S&P/Nasdaq and intended here for local personal, noncommercial research; they are not redistributed in the repository or executable. BCRP's [reuse terms](https://estadisticas.bcrp.gob.pe/estadisticas/series/ayuda/condiciones-de-uso) require source attribution, including Reuters. DoltHub [documents public read-only access without authentication](https://www.dolthub.com/docs/products/dolthub/api/v2/database/) and describes the publisher's freely accessible [open-data project](https://www.dolthub.com/blog/2024-09-27-dolt-post-no-preference/); this is community data, not an official exchange feed. All external archives, raw stock snapshots and temporary downloads are excluded from Git and from the executable. No Yahoo automated collection or Stooq verification bypass is included.

## CME connector: prepared, requires entitled access

The optional C connector uses the official [CME DataMine REST API](https://www.cmegroup.com/datamine/datamine-api.html) and [entitled-files List API](https://www.cmegroup.com/datamine/datamine-list-api.html). **This installation has no CME account or entitlement.** Without credentials it is now **disabled**, makes no CME requests, and displays `CME_DISABLED_NO_CREDENTIALS`. No purchase, account creation or alternative website scraping is performed. The public reference connector above works independently without registration. The earlier unauthenticated DataMine probe returned HTTP 401; preparing the connector never supplied licensed CME prices.

To use an **existing authorized access**, set local environment variables inherited by the collector, then restart it:

- `CME_API_ID` and `CME_API_PASSWORD` for Basic authentication, or `CME_BEARER_TOKEN` for an existing OAuth token. Tokens expire according to CME's policy; the app does not automatically acquire or refresh them.
- `CME_DATASET_CODES`: exact entitled dataset codes separated by semicolons. Product symbols alone do not imply a dataset subscription.

Credentials are never written to history, logs, the repository or interface. Authenticated requests use a fixed HTTPS CME host with redirects disabled. A successful entitlement-list response means API access was verified; it does **not** mean a normalized external price series exists.

Entitled files are stored atomically in **data/cme/{fileId}.dat**, retaining the original content/compression, and **data/cme/manifest.jsonl** records their source, contract-file identity, dataset, period and retrieval metadata. A bounded recent cache and counts appear in `history.json/externalData.cme`. Collection limits each cycle to 60 new files and 20 listing pages; unfinished pages resume on later cycles and are explicitly marked pending. Individual downloads currently have a 64 MiB limit; larger files report an error rather than being treated as complete. These potentially licensed files and their manifest are excluded from Git.

**CME prices are not yet used in the matrix or simulations.** Real entitled files must first be obtained and their format, contract expiries, roll rules, inverse FX quotes, closing session and dates normalized. The connector records candidate product mappings for relevant futures; MSTR and TLT have no identical CME instrument. No artificial CME series is substituted for missing data. The app continues collecting and analyzing the actual traded Hyperliquid instruments while displaying this limitation.

## Account positions

Enter a **public address** in the empty field and click **Scan account**. The app reads native Hyperliquid positions (including BTC and ETH) and positions on the `xyz` DEX for the main account and its subaccounts, then refreshes every minute. The monitor shows its two selected assets; changing assets reuses the scan and updates averages, funding and overlays.

- Average entry price is weighted by **absolute position size**. Long and short entry averages are also shown separately when both directions coexist. Their combined average is not a break-even price for a net position.
- Net funding in USDC is measured **since the opening of positions that are still open**, summed across accounts. Positive means received; negative means paid. The value comes from `-cumFunding.sinceOpen`; this convention was compared with `userFunding.delta.usdc` payments. It is separate from market funding rates and from funding for previously closed positions.
- Horizontal average-entry and liquidation lines appear on the price and combined charts. Actual liquidation thresholds remain visible for each account. When there are multiple thresholds, an additional weighted average is explicitly labeled **indicative**. It is not a price at which the accounts would liquidate together.
- Missing thresholds (`liquidationPx: null`) remain unavailable rather than being replaced with zero. They are excluded from the indicative average. Amounts and averages use decimal integers in JavaScript and are rounded only for display.
- The table lists position sizes, entries, liquidations, and funding by account. A failed subaccount read is reported as a partial result.

The address field is **always empty when the page starts**. The address and account results remain only in memory; they are not stored in the market JSON, logs, browser preferences, or repository. **Clear** removes the in-memory account data. The address is sent to Hyperliquid's public API for the requested lookup. No wallet connection, signature, private key, or trading order is required.

Automatic account scanning is limited to 100 subaccounts, with a warning if the limit is reached. API values can change while separate accounts are being read. Current horizontal position levels are references and do not reconstruct position history.

## Build and verify

Install Visual Studio 2022 Build Tools with the **Desktop development with C++** workload, then run **tools/build.cmd**. It detects MSVC, compiles an x64 C17 executable with `/MT`, and runs the C tests. If Node.js is installed, the interface calculation tests also run.

```powershell
.\tools\build.cmd
Start-Process .\OilPerps.exe -ArgumentList '--sync' -WindowStyle Hidden -Wait
```

`--sync` performs one collection, saves the JSON, and exits. Exit codes: 0 = success, 1 = partial failure, 2 = local error, 3 = collector already running. `--background` starts the collector without opening a tab. Stop the collector before copying the data folder to obtain a consistent snapshot.

Repository layout: `src/` contains the C collector and Windows integration; `src/sources.c` provides reference snapshots and the optional CME connector; `web/analysis.js` implements reproducible diagnostics and simulation; `web/research.js` displays their individual limits; `vendor/` contains cJSON 1.7.19 under the MIT license; `tests/` covers merging, deduplication, gaps, JSON round trips, funding aggregation, period selection, decimal precision, versioned loading, hidden-tab cancellation and resume, calculation caching, collection deadlines, source mapping and chronological simulations without future-data leakage. It also checks partial-payment accounting, cost turnover and all seven research translations. `.github/workflows/` provides automated Windows builds; `tools/build.cmd` is for development only. The Windows resource compiler embeds the interface, licenses, and initial JSON into the executable. The build also verifies that the resources are present and that the embedded JSON is readable.

## Sources

- [Hyperliquid info API: pagination, candles, and subaccounts](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint)
- [Hyperliquid perps API: funding and position state](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/perpetuals)
- [`meta` for the xyz DEX](https://api.hyperliquid.xyz/info): POST `{"type":"meta","dex":"xyz"}` returns canonical market names.
- [Reproducible funding cadence study](https://github.com/molinamanlio/perp-funding-study): its BTC/ETH eight-hour/hourly transition and three omitted historical hourly settlements are reproduced by the downloaded API timestamps.
- [cJSON v1.7.19](https://github.com/DaveGamble/cJSON/releases/tag/v1.7.19)

The repository and package distribute only software and public market data. The software uses the MIT license; the third-party license is retained in `vendor/LICENSE.cJSON` and embedded in the executable.
