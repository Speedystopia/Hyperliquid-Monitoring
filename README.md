# Hyperliquid Monitoring

A portable Windows application for funding history, closing prices, positions and correlations across **fifteen Hyperliquid assets**. The collector, storage layer, and local server are written in **C17** and compiled with Microsoft Visual C. The local HTML/CSS/JavaScript interface uses no external libraries, CDN, or hosting service.

## Three views, any two assets

- **Home** provides cards opening the selected comparison or the global correlation map.
- **Monitoring** shows funding, prices, the four-curve combined chart, historical indicators and positions for the two assets chosen in the header. Both selectors contain all fifteen assets; identical selections are disabled. This allows 105 distinct comparisons.
- **Global correlations** compares every asset with every other one in a colored matrix. Red denotes opposite movements and green the same direction. Separate ranked tables show the strongest negative and positive correlations, excluding self-correlations and duplicate pairs.

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
- **Price correlation** = Pearson's correlation coefficient × 100 for the selected assets' closes with matching timestamps in the selected period, using 4H or Daily according to the selection. Dates missing either asset's price are excluded. −100% is a perfect inverse linear relationship; +100% is a perfect positive relationship. This measures price levels, not returns. The sample size and matched dates are shown. Constant series or insufficient data return no value.

## Global correlation method

The global page is fixed to **Daily + full history**, with no interval or period selectors. These two settings are displayed explicitly. Monitoring retains its separate candle-interval and analysis-period controls. Its default **Price changes (%)** mode computes Pearson correlation on percentage changes between consecutive native closes. Changes spanning a missing candle are excluded. Optional **Closing price levels** mode matches the monitor's correlation card; common trends can dominate correlations of price levels.

Every matrix cell uses only timestamps shared by its two assets, with at least three matched observations and nonconstant values. Hover, focus or select a cell to see its sample count and dates. Coverage can differ between cells, especially for recent listings. Both ranked tables use the selected method over the full available Daily history and update with new daily closes. An expandable archive table shows each asset’s recorded daily closes and date coverage. They exclude diagonal/self comparisons and duplicate pairs. Correlation describes the retrieved historical data and does not predict future movements.

The **Strongest same-direction moves · opposite funding signs** panel ranks the six strongest positive correlations whose two assets have strictly opposite annualized average funding signs. Zero or unavailable averages are excluded. Funding is calculated over each asset's full recorded payment history: sum of rates / covered hours × 8,760 × 100, including legacy eight-hour settlements. Both averages, funding sample counts and date coverage are displayed alongside the daily correlation and its matched sample coverage. The funding histories may differ from each other and from the correlation window. This panel updates when new funding is stored, even without a new daily close, and follows the selected correlation method.

Its **Annualized net funding** column computes **the higher annualized funding rate minus the lower rate**, with the direction selected from the displayed historical averages: **short the higher-rate asset and long the lower-rate asset**, using equal USDC notionals. Each row explicitly shows which asset is long and which is short. This is a spread, not the arithmetic average. It is relative to the notional of **one leg**: rates of +10% and −4% imply a historical annualized net of 14%, or 140 USDC for 1,000 USDC per leg; relative to the combined 2,000 USDC notional, this is 7%. It is not a return on posted margin. The calculation uses the two displayed full-history averages before fees or price P&L and does not guarantee future receipts; actual funding depends on future hourly rates and oracle notionals. **Correlation · full history** uses all matching dates; daily closes are the observations, rather than a one-day analysis window.

Net funding colors use the **iShares TLT ETF's 30-day SEC yield**, separate from Hyperliquid's `xyz:TLT` funding rate. Red is at or below **SEC yield − 1 percentage point**, green at or above **SEC yield + 1 percentage point**, and yellow strictly between these thresholds. The yield, publication date, last successful check, exact thresholds and [official iShares source](https://www.ishares.com/us/products/239454/ishares-20-year-treasury-bond-etf) are displayed above the table. The SEC yield is already annualized; the application does not multiply it by twelve.

The C collector checks iShares at startup and during hourly collection, using compressed HTTPS and conditional requests when the source supplies cache validators. This does not depend on the browser being open and makes no requests per asset pair. Parsed structured data must identify TLT and the exact SEC metric with a valid publication date. The reference is saved in `history.json` under `benchmarks.tltSecYield`; its cache is also restored after restarting. A verified initial reference is bundled in the executable. Retrieval or parsing failures are coded in `data/collector.log` and the JSON; the table shows the failure and retains the last known yield. Without a valid reference, results use neutral colors. A publication older than seven days is flagged. Reference failures do not stop the independent Hyperliquid collection. New stored reference data refreshes the table automatically, even without new market candles or funding.

The **Opposite moves · same funding signs** panel shows the six most negative correlations with strictly same-sign annualized funding rates. Positive rates imply **short both assets**; negative rates imply **long both assets**. The displayed historical funding net is the sum of the two absolute annualized rates, relative to one leg's equal notional. It shares the SEC benchmark, automatic updates and sample-coverage display. A long/short pair on negatively correlated assets reinforces their price moves; taking the same side can offset them approximately. Historical correlation does not establish delta neutrality or an exact hedge at equal notionals.

All four ranked lists require **strictly more than 66% absolute correlation**: positive pairs above +66%, inverse pairs below −66%. Each list first applies its own correlation/funding criteria, then keeps up to six qualifying pairs. If none qualify, only its strongest eligible pair is displayed with a prominent **Danger · insufficient correlation (|r| ≤ 66%)** warning and a highlighted row. Exactly ±66% does not pass the threshold. An empty eligible list stays empty; no invalid or wrong-sign pair is invented. The matrix continues to display all correlations. The threshold is a screening preference, not a statistical guarantee; sample counts and shared dates remain visible.

For analyzing the offset of price gains and losses, prefer **Price changes (%)**, the default daily-return method. **Closing price levels** describes historical price trajectories and can be dominated by shared trends; the UI explicitly identifies this limitation. Neither correlation sign alone establishes which funding configuration is more reliable, and equal notionals do not equalize volatility or market sensitivity.

## Combined analysis: separate diagnostics

The selected pair now has a **Combined analysis** section on both Monitoring and Global correlations. Funding strategy rows also link to it and show recent correlation, shared funding coverage and individual warnings. Changing the header's assets on Global updates the selected analysis without leaving the matrix. These diagnostics always use **Daily returns**; changing the exploratory matrix to price levels does not change the diagnostic method. They are recalculated when stored data, assets or simulation assumptions change, and remain idle while the tab is hidden.

- **Correlation and stability:** full-history, 30-, 90- and 180-day matched returns; 30-day rolling correlations sampled every seven days; sign stability; sample counts; and approximate Fisher confidence intervals. Returns crossing a missing candle are excluded. The confidence intervals assume independent observations, which serial dependence and changing market conditions can violate.
- **Position sizing:** the magnitude of covariance(A,B) / variance(B), estimated on the latest 90 days, gives B's USDC notional relative to A. The ratio is bounded to 0.1–10 and a bound is explicitly flagged. Historical correlation determines whether the positions oppose each other or take the same side; weighted recent funding determines which direction receives the estimated carry. Equal-notional and adjusted residual annualized price volatility use the combined notional as their base.
- **Common funding:** only actual payments with matching timestamps and interval lengths are compared. Full-history and 7/30/90-day annualized rates share a funding window, including the latest hourly payment beyond the last Daily close. Rate signs, changes of sign and coverage are visible. Net estimates distinguish A's notional from the sum of both notionals. The current directions and ratio come from the recent estimation window and can produce negative carry in another historical window.
- **Chronological simulation:** an initial training period of at least 60 days chooses directions and sizing before a separate test of at least 30 days. Training uses up to 180 days. Directions are fixed from that training period; later ratio adjustments use only previously known returns. Daily price P&L, known funding, opening/closing/rebalancing costs, net P&L and maximum drawdown are shown separately, with cumulative curves. Costs are a projection of today's observed Hyperliquid fees and depth, not a reconstruction of historical executions.
- **Hyperliquid execution costs:** the default is immediate **taker** execution. Each leg uses its own observed fee parameters, including HIP-3 deployer scale and per-asset growth mode. Without an account scan, the public base schedule is clearly labeled. Scanning a public address supplies that account's `userFees`, referral discount and current per-asset rates; sanitized account fee results remain in memory. No address or account fees are added to public market history or browser preferences. Fees are assessed on executed turnover. Additional frontend builder fees are not modeled.
- **Observed depth and slippage:** hourly L2 snapshots retain up to 20 levels per side for all fifteen assets. The simulation walks bids or asks according to the trade's direction and amount, computes a volume-weighted execution price and measures the cost relative to mid. Opening, resizing and closing legs have separate costs. Missing fees, an old or invalid book, or inadequate depth makes the net simulation unavailable; no arbitrary 2-basis-point fallback is used. Maker fee rates are visible, but passive fills cannot be established from a current snapshot, so selecting Maker leaves the net simulation unavailable.
- **Adaptive rebalancing:** the default checks at each Daily close, using only prior observations. It adjusts B only when the target covariance/variance hedge ratio differs by strictly more than **20%** from the effective ratio of the existing quantities at the previous close. The signal needs at least 30 observations and a sufficiently strong, non-reversing correlation with a confidence interval excluding zero; otherwise adjustment is blocked and flagged. This responds to correlation, volatility and position drift together. There is no mandatory seven-day trade. Calendar and no-rebalancing modes remain available for comparison, with trigger events and counts displayed.
- **User assumptions:** 1,000 USDC for A and the 20% adaptive trigger are editable hypothetical choices, not exchange requirements or optimized settings. One basis point is 0.01%. Only the notional, execution mode and rebalance preferences are saved locally. Legacy fixed-cost defaults remain in the standalone calculation API for backwards-compatible tests; the application explicitly selects Hyperliquid costs and adaptive rebalancing.
- **Data quality:** missing prices or funding, short samples, weak/reversing correlation, extreme sizing and negative recent carry are exposed separately. The existing >66% ranking filter remains a screening rule, not a validation of profitability. There is no combined reliability score that conceals a failed diagnostic.

Historical funding cash flows in USDC are **estimated using the preceding Daily close** because the app does not have a full archive of intraday oracle prices. Hyperliquid's actual payments use position size × oracle price × funding rate. Every known payment is retained in the estimate even when another payment is missing that day; incomplete training or test funding makes the simulation explicitly partial/unvalidated and prevents publishing an annualized test return. The simulation does not model leverage, intraday liquidation, collateral interest, borrow costs, actual execution or future regime changes. A complete calculation can still show a loss and does not certify a hedge.

## Hyperliquid reference prices and funding explanation

For each selected asset, the interface shows Hyperliquid **mark price**, **mid price**, **oracle/reference price**, the mid/reference gap and the current indicative hourly funding rate. Two shared `metaAndAssetCtxs` requests cover native markets and the `xyz` DEX, together with one public fee-schedule request and fifteen L2 requests. They run during startup/hourly collection independently of the visible comparison. These are hourly snapshots, not a tick stream. Account-specific fees are read only when an address is selected.

Positive funding means longs pay shorts; negative funding means shorts pay longs. A perpetual premium generally favors positive funding, and a discount negative funding, but the interest component, sampled premium and HIP-3 parameters mean the sign is not an exact test of the current mid/oracle gap. Equal prices do not guarantee zero funding. The oracle is an underlying reference and is not labeled as an actual Hyperliquid spot quote for instruments without such a spot market. See the [official funding formula](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/funding).

`history.json/marketReferences` retains the latest contexts, `execution.markets` per-asset public fee rates, `depthBooks`, and 24 recent snapshots, source/error fields and archive metadata. The full reference snapshots append to **data/references-YYYY.jsonl**. Reference retrieval failures preserve previous prices and report a coded error; failed depth is explicitly unavailable. Archive files are excluded from Git to keep personal installations and growing data out of the public repository.

Funding ranking rows distinguish the full-history equal-notional rate from the last 30 days' equal-notional rate and the last 30 days' adjusted-ratio rate. The adjusted ratio and directions are explicit. An adjusted negative-carry warning can coexist with a positive full-history equal-notional rate: the periods and sizes differ. The green SEC band evaluates the displayed historical funding rate, not all diagnostics. A correlation-strength warning means |r| does not exceed 66%, independently of how many days are recorded.

## Public reference histories without registration

Global correlations has a **Price source** selector. Hyperliquid perp prices remain the default. **Public references · no account** provides a separate long-history comparison from sources requiring no new account or API key:

| Asset | Public reference | Important difference |
| --- | --- | --- |
| EUR/USD | [ECB euro reference rates](https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.xml) | USD per EUR reference fixing, not a UTC perp close |
| USD/JPY | Same ECB archive | Derived as JPY per EUR / USD per EUR, not a traded USD/JPY close |
| BTC, ETH | [Binance public market-data API](https://developers.binance.com/docs/binance-spot-api-docs/rest-api/general-api-information) | Spot BTCUSDT/ETHUSDT closed Daily candles; USDT is distinct from USD/USDC |
| WTI | [EIA Cushing WTI spot history](https://www.eia.gov/dnav/pet/hist/RWTCD.htm) | Spot reference, not a CME futures contract or perp |
| Brent | [EIA Europe Brent spot history](https://www.eia.gov/dnav/pet/hist/RBRTEd.htm) | Spot reference |
| Diesel | [EIA New York Harbor ULSD spot history](https://www.eia.gov/dnav/pet/hist/eer_epd2dxl0_pf4_y35ny_dpgD.htm) | Diesel/ULSD spot reference |
| Natural Gas | [EIA Henry Hub spot history](https://www.eia.gov/dnav/ng/hist/rngwhhdD.htm) | Spot reference |

Other assets remain **unavailable in the external view**; Hyperliquid values are not silently mixed into it. EIA, ECB and Binance have different calendars, observation times and market definitions. Calendar dates are normalized to the end of a Daily date bucket for matching, without claiming that a reference fixing occurred at UTC midnight. Returns spanning missing days are excluded. Raw zero/negative energy prices are retained in the archive but excluded from percentage-return calculations.

The separate **data/public-prices.json** archive retains downloaded rows and new observations, with an atomic backup and corruption recovery. Only small per-asset counts, dates, source/error metadata are stored in `history.json/externalData.publicPrices`. Collection runs at startup and daily after the 17:00 UTC collection slot, with a one-hour retry after a failure. Existing ECB history refreshes recent dates; Binance pagination starts from the first available candle and subsequently rereads the latest five days; EIA tables are deduplicated into the retained archive. Source errors preserve previous data and remain visible.

The browser downloads this additional JSON only while the Global view has the external source selected, and only when its file version changes; ETag 304 and hidden-tab cancellation remain supported. These archives are excluded from Git and are not bundled in the executable. Funding, positions, execution costs and the detailed hedge simulation continue to use Hyperliquid; longer external price histories cannot recreate funding before a perp existed. External correlation and the detailed Hyperliquid diagnostic can therefore have different coverage and coefficients.

ECB reference-rate reuse is attributed to the [ECB](https://www.ecb.europa.eu/services/using-our-site/disclaimer/html/index.en.html); the derived USD/JPY cross is explicitly identified. EIA data reuse follows its [public-domain data policy](https://www.eia.gov/about/copyrights_reuse.php). No Yahoo automated collection or Stooq verification bypass is included.

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
