# Oil Perps Hyperliquid

A portable Windows application for Brent (`xyz:BRENTOIL`) and WTI (`xyz:CL`, displayed as **WTIOIL**) funding history and closing prices. The collector, storage layer, and local server are written in **C17** and compiled with Microsoft Visual C. The local HTML/CSS/JavaScript interface uses no external libraries, CDN, or hosting service.

## Run: one executable

Download **OilPerps.exe** from the [latest release](https://github.com/Speedystopia/Oil-Perps-Hyperliquid/releases/latest), place it in a writable folder, and double-click it. The executable includes the interface, seven languages, licenses, and an initial market history. No launcher script, installer, separate web folder, or compiler is needed to use the application.

On its first launch, it creates **data/history.json** beside the executable and retrieves any newer data. Updates preserve your existing JSON. The `data/` folder also contains the backup and collection log; it remains separate so your history can be retained and inspected.

The interface opens at `http://127.0.0.1:18764/`. In the footer, **Start with Windows** enables or disables automatic startup for your user session, without administrator privileges. This setting uses only a registry entry named **Oil Perps Hyperliquid** under the current user. The application's older startup shortcut is removed when this setting is changed.

**Automatic startup happens when you sign in to Windows**, after the PC starts. It does not run before sign-in. Windows may delay startup applications. Automatic startup runs the collector in the background without opening a browser tab.

Closing the tab does not stop the collector. Its system tray icon lets you open the interface, synchronize, or quit. `OilPerps.exe --stop` stops the collector. `--install-startup` and `--remove-startup` are command-line equivalents of the integrated startup setting.

Requirements: Windows 10/11 x64, an Internet connection for new data, and a modern browser. The C runtime is statically linked: Python, Node.js, and Visual Studio are not required to run the app. Local port 18764 must be available. Only one instance runs per Windows session. Embedded licenses can be viewed through **Licenses** in the interface.

## Background operation and resource usage

In normal background operation, the collector opens no console or browser window and plays no notification sounds. It stays available through its system tray icon. Collection failures are recorded in the log and shown in the interface; local startup problems, such as an unreadable history and backup or an unavailable port, can display an error dialog.

Worker threads sleep or wait between tasks. Market data is fetched at startup and hourly, with additional requests for recovery, retries, or manual synchronization. After scanning an address, account positions are refreshed every minute until the address is cleared or the collector exits. This account refresh continues if the browser tab is closed.

The browser interface currently checks for updates every four seconds and can retrieve and parse the history JSON even when the data has not changed. Browser memory and processing are additional to the collector's own usage. Closing the interface reduces this work while automatic collection continues. Usage depends on history size, the browser, account scanning, and whether synchronization is running; there is no fixed CPU or memory guarantee.

## Data and schedule

- **data/history.json** stores the public market histories. An initial download is embedded in the executable and updated automatically.
- Collection runs at startup and every hour at **HH:01 UTC**. This is also minute 01 in time zones with whole-hour offsets, including Europe/Paris. A network failure or a latest payment that has not yet appeared triggers another attempt within five minutes.
- After shutdown, sleep, or a network interruption, missing intervals are requested again. All previously downloaded observations are retained.
- The source funding data is hourly because the API has no native 4H/1D funding endpoint. Pagination retrieves the available history from the first payment, without a local 500-observation limit.
- **4H** and **Daily** funding charts sum 4 or 24 hourly rates respectively. Chart values are not annualized or compounded. A period with a missing payment is not shown as complete.
- Prices are **native 4H and 1D closing prices**. Open candles are excluded. The API exposes the latest 5,000 candles per interval. At the initial download, 4H prices reached the beginning of both markets' funding histories. A future installation more than 5,000 periods after market launch may have a shorter recoverable price history.
- Timestamps are UTC Unix milliseconds and represent the **end** of a period. The actual funding payment timestamp is also retained in `sourceTime`; `time` is rounded down to the hour to align payments with closes.
- Each series provides its observation count, coverage, and `missingRanges`. Missing values are never interpolated. Gaps older than the API's retention remain reported, without fabricated prices.

For example, at 04:01 UTC, the app retrieves the 04:00 funding payment and the 4H candle that closed at 04:00. Funding for 00:00–04:00 is the sum of the payments at 01:00, 02:00, 03:00, and 04:00. A daily period ends at 00:00 UTC the following day.

The JSON is written to a temporary file, flushed to disk, and replaced atomically. The previous version is retained as `history.backup.json`. If the primary file is corrupt, a valid backup is restored. If both are unreadable, the app refuses to overwrite them. Public collection errors are recorded in `data/collector.log`.

The collector does not run while Windows is shut down or asleep. Recovery happens after wake-up or startup. The computer must remain awake for collection to occur at every scheduled HH:01.

**Sync now** requests an additional collection; it does not replace automatic startup and hourly synchronization. Failures display a code such as `HTTP_429`, `HTTP_503`, or `WINHTTP_12007`, retained in the JSON's `lastError` and in the log with a UTC timestamp and attempt number. Storage errors are also logged as `STORE_WIN32_...`.

## Languages

The interface defaults to English. The selector provides English, French, Simplified Chinese, Korean, Japanese, Italian, and Spanish. The selected language is saved locally in the browser and contains no account address. Dates and numbers also use the selected locale. Market identifiers, personal subaccount names, and error codes do not require translation.

## Charts

A light dashed **0% · zero funding** line appears on the funding chart and the combined chart.

The language selector is centered in the header. The manual synchronization button sits beside the collector status. **Brent ↗** and **WTI ↗** in the price cards link to their Hyperliquid markets.

Three synchronized charts show funding for both markets, closing prices for both markets, and all four curves overlaid. The combined chart uses funding percentages on the left axis and USD prices on the right; price curves are dashed. Choose 4H/Daily, 7/30/90 days or full history, and UTC or local time. Scroll to zoom, drag to pan, hover to inspect values, and double-click to reset.

## Historical indicators

Cards and indicators recalculate whenever the JSON changes and whenever **7 / 30 / 90 days / full history** is selected. The period selector determines the data used by these cards; manual chart zoom only changes the charts. Funding includes hourly payments through the latest retrieved payment. Price cards retain the latest close and add the average close and price change for the selected period.

- **Realized funding annualized** = the average hourly funding rate over the selected period × 8,760 × 100. It describes an annual pace calculated from past payments, not a payment actually received over an entire year. Positive market funding rates represent funding paid by a long and received by a short.
- **Funding sum over the last 12 months**, available under **Data coverage & methodology**, sums realized hourly rates over the 365 days ending at the latest payment. Initial history is shorter than one year, so coverage is explicitly marked partial. The main cards show cumulative funding and observed duration for the selected period.
- **Price correlation** = Pearson's correlation coefficient × 100 for Brent/WTI closes with matching timestamps in the selected period, using 4H or Daily according to the selection. Periods before Brent's launch are excluded because there is no Brent price. −100% is a perfect inverse linear relationship; +100% is a perfect positive relationship. This measures price levels, not returns. The sample size and matched dates are shown. Constant series or insufficient data return no value.

## Account positions

Enter a **public address** in the empty field and click **Scan account**. The app reads open positions on the `xyz` DEX for the main account and its subaccounts, then refreshes every minute. Position funding is shown only for the two oil markets.

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

Repository layout: `src/` contains the C collector and Windows integration; `web/` contains the interface sources; `vendor/` contains cJSON 1.7.19 under the MIT license; `tests/` covers merging, deduplication, gaps, JSON round trips, funding aggregation, period selection, and decimal precision; `.github/workflows/` provides automated Windows builds; `tools/build.cmd` is for development only. The Windows resource compiler embeds the interface, licenses, and initial JSON into the executable. The build also verifies that the resources are present and that the embedded JSON is readable.

## Sources

- [Hyperliquid info API: pagination, candles, and subaccounts](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint)
- [Hyperliquid perps API: funding and position state](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/perpetuals)
- [`meta` for the xyz DEX](https://api.hyperliquid.xyz/info): POST `{"type":"meta","dex":"xyz"}` returns canonical market names.
- [cJSON v1.7.19](https://github.com/DaveGamble/cJSON/releases/tag/v1.7.19)

The repository and package distribute only software and public market data. The software uses the MIT license; the third-party license is retained in `vendor/LICENSE.cJSON` and embedded in the executable.
