# Dividend System — Requirements & Build Plan

The single place for the Dividend Manager + Dividend Analysis rework. Once built, this folds into `README.md`. Date: 2026-06-09.

## Goal
Make every dividend figure **correct, reviewable (by owner AND assistant), and cheap**. The owner controls the values; the system assists by surfacing what was actually received and flagging anything suspicious. Drives the Dividend Manager table and the Dividend Analysis charts.

## Locked decisions (owner, 2026-06-09)
- **Manual-first:** the owner maintains the per-share dividend values; the system assists, it does not silently auto-derive the primary number.
- **Latest-month reactive:** the "current monthly dividend / share" reflects the **most recent actual distribution** (changes monthly for variable covered-call ETFs).
- **Categories: keep the current model, manual** — no structural change, no auto-seeding from Questrade.
- **External data: free / manual only** — never a paid API. For flagged edge cases the assistant looks up a symbol's distribution from free sources on request and the owner sets an override.
- **Cost is priority #1:** stay fully pay-per-use; no new always-on services (Lambda + DynamoDB + existing schedules only).

## Resolved dividend-value model (please confirm)
Per-share value used for all yield math, in priority order:
1. **Manual override** (owner-entered) — always wins.
2. **Latest-month actual per share** — from the owner's `activities` (last dividend received ÷ shares held). Reactive; $0 cost. (This is the "manual-first with strong assist + latest-month reactive" reconciliation.)
3. **Questrade `dividendPerShare`** — fallback when there's no payment history yet.
4. **0 / "no dividend"** — none of the above.

> Note: this makes the owner's override primary (manual-first) while giving accurate reactive defaults for un-overridden symbols. Confirm this chain is what you want.

## Current state (baseline)
- Tables: `symbol-categories` (`symbolType` {DIVIDEND_ETF, INDEX_ETF, STOCK, COMMODITY, UNCATEGORIZED} + `symbolSubType` + `sector`), `symbol-dividends` (`dividendPerShare` stored **monthly**, `dividendFrequency`, `isManualOverride`, `overrideValue`), `yield-exclusions`.
- Calc (`sync-operations/.../syncService.js syncPositions`): override → Questrade `dividendPerShare` → historical; then `annual = monthly×12`, `YoC = annual/avgCost`, `currentYield = annual/currentPrice` (recomputed each sync).
- Analysis (`portfolio-analytics/.../portfolioAnalysis.js`, `GET /api/portfolio/analysis`): dividend-vs-non-dividend = `annualDividendPerShare>0`; category breakdown = `symbolType`; commodities = `symbolSubType`.
- UI: `aws-frontend/.../components/DividendManager.jsx` (editable: type, sub-type, frequency, include-in-YoC, annual override) and `pages/DividendAnalysis.jsx` (charts from `/api/portfolio/analysis`).

## Root cause of stale Questrade dividend values (found 2026-06-09)
Stored `symbol-dividends` were frozen at **January** values (e.g. AMAX $0.265) while Questrade's live `/v1/symbols/{id}` returns current data (AMAX **$0.30**, dividendDate 2026-06-05). Cause: the `monthly-dividend-sync` had been **failing on the token storm** (couldn't get a valid token), so Questrade dividend data hadn't refreshed since the last success (January). Fixed by stabilising tokens (cooldown) + re-running `POST /api/sync/questrade-dividends` → 40/54 symbols updated to current. The schedule now succeeds and was **bumped to weekly** (`cron(0 13 ? * MON *)`, Mondays — deployed 2026-06-09) to keep variable-ETF data fresh. NOT a Questrade API bug, and no parameter change needed.

## Frequency-aware monthly/yield/YoC fix (2026-06-09)
Changing a symbol's **frequency** did not recompute its value — `setSymbolDividend` preserved the old `dividendPerShare`, so Monthly/sh, Yield, YoC stayed wrong. Now: **annual = Questrade per-payment (`questradeData.dividend`) × payments-per-year(frequency)** (monthly 12, semi-monthly 24, quarterly 4, semi-annual 2, annual 1); **monthly/sh = annual ÷ 12**; **yield = annual ÷ price**, **YoC = annual ÷ avgCost**. Fixed in two places: (1) `setSymbolDividend` recomputes `dividendPerShare` from per-payment × multiplier(freq)/12 on save (verified: AMAX $0.30 per-payment → quarterly $0.10/mo, monthly $0.30/mo); (2) the **Manager computes Monthly/sh, Yield, YoC reactively in the frontend** from per-payment × selected-frequency + `currentPrice`/`averageEntryPrice`, so the figures update the instant the frequency dropdown changes. Override (monthly) still wins. Holdings/Analysis update on the next positions sync.

## Known correctness issues this addresses
1. `×12` from a single per-share + frequency multiplier breaks when frequency is wrong/`Unknown` → symbol wrongly shows $0 / "Non-Dividend".
2. Questrade's dividend is stale for variable covered-call ETFs (the heavily-held ones).
3. No visibility into *where a number came from* or *what was actually received* → not reviewable.
4. Displayed "Total Dividends" should equal the sum of actual receipts — reconcile (observed ~$2,151 shown vs $2,177+$374 actual).

## Requirements
- **R1 — Manual override is primary** and easy to set/clear per symbol (annual or monthly input, clearly labelled).
- **R2 — Surface actual receipts as assist:** for each symbol show **last actual distribution / share + date**, and **trailing-12-month income**, computed from `activities` (free). One-click "use last actual as override".
- **R3 — Source badge + review flag:** each row shows the value's source (Override / Actual / Questrade / None) and a ⚠ when sources disagree beyond a threshold (so owner + assistant can audit).
- **R4 — Latest-month reactive default:** non-overridden symbols use the last actual distribution/share; updates as new dividends sync.
- **R5 — Dividend-payer = received dividends in last 12 months** (not the possibly-zero computed field), so categorization can't hide a real payer.
- **R6 — Keep category model + manual classification** (type / sub-type / sector). No auto-seed. Used as-is by the Analysis breakdowns.
- **R7 — Analysis driven by Manager data:** dividend-vs-non-dividend (R5), category breakdown (`symbolType`), commodities (`symbolSubType`), plus reconcile header "Total Dividends" to actual receipts.
- **R8 — Free/manual lookup workflow:** flagged symbols → assistant looks up distribution from free sources on request → owner sets override. No automated/paid feed.
- **R9 — Cost:** no new always-on services; computations reuse the daily sync + monthly job; no paid data API.

## Calculation spec
- **monthlyPerShare(symbol)** = override (monthly) → else `lastActualAmount / sharesHeldAtPayment` → else Questrade monthly → else 0.
- **annualPerShare** = TTM actual (`sum(dividends received last 12 mo) / shares`) when available; else `monthlyPerShare × frequencyMultiplier`-derived annual; override may specify annual directly.
- **YoC** = `annualPerShare / avgCost × 100`; **currentYield** = `annualPerShare / currentPrice × 100` (recomputed each sync).
- **lastActual**: most recent dividend activity for the symbol → `{ perShare, amount, date }`.
- **TTM income(symbol)** = sum of dividend `netAmount` over last 365 days.

## Data model changes (additive only — no table replacement)
- `symbol-dividends`: add `lastActualPerShare`, `lastActualDate`, `lastActualAmount`, `ttmPerShare`, `valueSource` (override|actual|questrade|none), `isVariable` (bool, detected from payment variance). Refreshed by the monthly job + daily sync.
- `positions.dividendData`: add `valueSource` + `lastActualDate` so the Manager/Analysis can show provenance without extra lookups.

## UI changes
- **Dividend Manager:** add columns — **Last Actual /sh (date)**, **TTM income**, **Source badge**, **⚠ review flag**; "use last actual" action; keep type/sub-type/frequency/include-YoC/override.
- **Dividend Analysis:** R5/R7 robustness; reconcile Total Dividends; (optional) Stock-vs-ETF and sector views later.

## Build phases (one at a time)
- **D1 — Backend assist data:** ✅ DONE & deployed 2026-06-09. `GET /api/symbol-dividends/actuals[/{symbol}]` (dividend-management lambda; reads activities+positions). Returns per symbol: `lastActualDate`, `lastActualPerShare`, `lastActualAmount`, `sharesAtLastPayment`, `ttmIncome`, `ttmPerShare`, `paymentsLast12mo`, `isVariable`+`variability`, `valueSource`. Read-only; no calc/UI change.
  - **CRITICAL correctness fix (owner-flagged):** per-share must use shares held **at each payment's date**, not current shares (holder may buy/sell the same symbol later). Reconstructs share balance backward from current shares minus net Trades after each payment date: `sharesAsOf(d) = currentShares − Σ signedTradeQty(date > d)` (Buy +, Sell −). Per-payment per-share = `amount ÷ sharesAtThatDate`; `ttmPerShare = Σ per-payment per-share`. Verified: DLR.TO (held 1692 at payment, 1132 now) corrected from $0.149→$0.0999/sh; HMAX $0.167 @ 151.
  - **Edge case (open):** share **Transfers** (type 'Transfers', 33 rows) can also move shares but aren't yet reconstructed (only 'Trades'). Revisit if a transferred symbol's per-share looks off. Also: shares-at-EX-date is approximated by shares-at-payment-date (no ex-date in activities).
- **D2 — Calc model:** implement the R-spec value chain (override → actual → Questrade) + dividend-payer = TTM receipts (R5). Re-sync, verify yields/Total Dividends reconcile.
- **D3 — Manager UI:** ✅ DONE & deployed 2026-06-09. Redesigned `DividendManager.jsx` from a wide horizontal-scroll table to **compact rows + expandable detail** (theme-matching, no horizontal scroll). Each row: YoC checkbox, symbol, type badge, monthly /sh, **last actual /sh + date**, current yield, YoC, **source dot** (override/questrade/none) + **VAR** flag + **⚠ review** flag. Expand shows: last actual (+ shares-at-payment), TTM/sh (+ payments + TTM income), Variable/Stable, **"Use TTM actual as override"** action, and all edit controls (type/sub-type/frequency/override/include). New "Needs Review" stat = count where displayed value differs >20% from actual receipts. `fetchDividendActuals()` added to settingsApi. HHIS.TO logic verified against raw activities (shares-at-payment correct across 3 accounts).
- **D4 — Analysis robustness:** dividend-vs-non-dividend by receipts; reconcile header totals; breakdowns unchanged source-wise.
- **D5 — Monthly recompute + variability flag:** enhance `monthly-dividend-sync` to refresh actuals + flag variable symbols; surface in Manager.
- **D6 (optional) — Free/manual lookup tooling** for flagged symbols.

## Open items to confirm before building
1. The value-priority chain in "Resolved dividend-value model" (override → actual → Questrade → 0).
2. Override input unit: annual (current UI) vs monthly — keep annual?
3. "Variable" detection threshold (e.g. >X% month-to-month variance) — tune later.
4. Which phase to start with (recommend **D1**, pure backend assist data, lowest risk).
