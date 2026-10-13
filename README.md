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

Its **Annualized net funding** column computes **the higher annualized funding rate minus the lower rate**, with the direction selected from the displayed historical averages: **short the higher-rate asset and long the lower-rate asset**, using equal USDC notionals. Each row explicitly shows which asset is long and which is short. This is a spread, not the arithmetic average. It is relative to the notional of **one leg**: rates of +10% and −4% imply a historical annualized net of 14%, or 140 USDC for 1,000 USDC per leg; relative to the combined 2,000 USDC notional, this is 7%. It is not a return on posted margin. Results are red at or below **TLT's annualized funding − 1 percentage point**, green at or above **TLT + 1 percentage point**, and yellow strictly between those thresholds. The TLT benchmark uses its full recorded funding history and is displayed above the table; if unavailable, results are neutral. Both the spread and color refresh with funding changes, including changes to TLT alone. The calculation uses the two displayed full-history averages before fees or price P&L and does not guarantee future receipts; actual funding depends on future hourly rates and oracle notionals. **Correlation · full history** uses all matching dates; daily closes are the observations, rather than a one-day analysis window.

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

Repository layout: `src/` contains the C collector and Windows integration; `web/` contains the interface sources; `vendor/` contains cJSON 1.7.19 under the MIT license; `tests/` covers merging, deduplication, gaps, JSON round trips, funding aggregation, period selection, decimal precision, versioned loading, hidden-tab cancellation and resume, calculation caching, and collection deadlines; `.github/workflows/` provides automated Windows builds; `tools/build.cmd` is for development only. The Windows resource compiler embeds the interface, licenses, and initial JSON into the executable. The build also verifies that the resources are present and that the embedded JSON is readable.

## Sources

- [Hyperliquid info API: pagination, candles, and subaccounts](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint)
- [Hyperliquid perps API: funding and position state](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/perpetuals)
- [`meta` for the xyz DEX](https://api.hyperliquid.xyz/info): POST `{"type":"meta","dex":"xyz"}` returns canonical market names.
- [Reproducible funding cadence study](https://github.com/molinamanlio/perp-funding-study): its BTC/ETH eight-hour/hourly transition and three omitted historical hourly settlements are reproduced by the downloaded API timestamps.
- [cJSON v1.7.19](https://github.com/DaveGamble/cJSON/releases/tag/v1.7.19)

The repository and package distribute only software and public market data. The software uses the MIT license; the third-party license is retained in `vendor/LICENSE.cJSON` and embedded in the executable.
