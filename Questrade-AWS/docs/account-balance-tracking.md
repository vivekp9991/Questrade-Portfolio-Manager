# Account Balance & Contribution Tracking — Design

Status: **DESIGN (no code yet)** · Date: 2026-06-09 · Owner-requested.

The single place for the "what did I actually put in vs. what is it worth now" feature. Build only after this is confirmed; then implement one phase at a time.

## Goal
For **each account, under each person**, show:
- **Net contributions** — the money the owner actually put in (the "starting balance" before any dividend/P&L). 
- **Current value** — what the account is worth now.
- **Total gain** = `current value − net contributions` (this captures capital gains **and** dividends together).

The owner must be able to **manually override the net-contributions baseline once per account** (because the auto-derived number won't be fully correct), after which it **auto-increments** as new money is added.

## Owner's intent (verbatim summary)
- Find the starting balance before any dividend/P&L using APIs, if possible.
- Add a **manual balance override** in Settings (like the Dividend Manager), **per person → per account**.
- The override is set **once**; afterwards, when money is added it should be picked up (from an **activity**, via the API) and **increment** the contribution automatically.
- Requires a new **DynamoDB table** that gets fetched/synced.

## Questrade API feasibility (investigated live 2026-06-09)
1. **`GET /v1/accounts` ** → the 6 accounts (Vivek & Angel × TFSA/RRSP/Cash) with `type`, `status`.
2. **`GET /v1/accounts/{id}/balances`** → per-currency and combined balances. Fields per currency: `cash`, `marketValue`, **`totalEquity`**, `buyingPower`, `maintenanceExcess`, `isRealTime`; plus `sodPerCurrencyBalances` (start-of-day). 
   - ✅ Gives **current account value** (`totalEquity`, per currency CAD/USD).
   - ❌ **No "net deposits / contributions / starting balance" field exists** — Questrade has no "cost-rate"/contributions endpoint. (Position-level `totalCost` exists for holdings book cost, but not account cash contributions.)
3. **`GET /v1/accounts/{id}/activities`** (already synced to `questrade-activities-dev`) → cash movements we can derive contributions from:
   - `Deposits` (46 rows), `Transfers` (33), `Withdrawals` (9). `netAmount` is **+ for cash in, − for cash out**; multi-currency (CAD/USD); has `accountId`, `personName`, `transactionDate`, `description`.
   - **Caveats that make pure auto-derivation unreliable** (→ justify the manual override):
     - Activities only go back ~3 years / to account open → **pre-window deposits are missing**.
     - **Not every deposit is a contribution** — e.g. a `REFERRAL REWARD` ($50) and interest are deposits but not owner money; in-kind `Transfers` move securities, not cash.
     - **Multi-currency** (CAD + USD) needs conversion or per-currency tracking.

**Conclusion:** the owner's model is the right one — **a one-time manual baseline** (to absorb missing history + non-contribution noise) **+ automatic increment from cash-movement activities after the baseline date**, with **current value from the balances API**.

## The model
Per account (optionally per currency):
```
netContributions = manualBaseline(as of baselineDate)
                 + Σ Deposits(after baselineDate)
                 + Σ Transfers-in(after baselineDate)
                 − Σ Withdrawals(after baselineDate)
                 − Σ Transfers-out(after baselineDate)
currentValue     = balances.totalEquity            (per currency, from the balances API)
totalGain        = currentValue − netContributions
totalGain%       = totalGain / netContributions × 100
```
- `manualBaseline` + `baselineDate` are owner-entered, **once**, **per currency (CAD and USD)**. The baseline represents net contributions as of that date; only activities **strictly after** it are auto-added (no double counting).
- If no override is set, fall back to **all** activity-derived contributions (clearly flagged "estimated — set a baseline").
- **Combined (display/report only):** roll up across accounts and currencies and present **two totals — one in CAD, one in USD** — using the top-bar USD/CAD rate. Example: `combinedCAD = Σ CAD figures + Σ USD figures × usdCad`; `combinedUSD = Σ USD figures + Σ CAD figures ÷ usdCad`. Per-currency stored numbers stay exact and untouched.

## Data model (new table — additive, no existing table touched)
**`questrade-account-balances-dev`** — PK `personName` (S), SK `accountId` (S).
| field | meaning |
|---|---|
| `accountType`, `accountStatus` | from accounts table (display) |
| `manualBaseline` | owner override = net contributions as of `baselineDate` (currency per open Q1) |
| `baselineDate` | date the baseline represents; auto-sum counts activities after this |
| `currency` / per-currency map | CAD / USD handling (see Q1) |
| `autoContributions` | Σ cash-movements after baselineDate (computed, cached) |
| `netContributions` | `manualBaseline + autoContributions` |
| `currentValue` | latest `totalEquity` from balances sync |
| `currentValueUpdatedAt` | when balances last fetched |
| `lastModifiedBy`, `updatedAt` | audit |

## Backend components
- **B1 — Balances sync** (new): a Lambda that calls `/v1/accounts/{id}/balances` for each account (per login, shared token service + cooldown) and writes `currentValue` (per currency) into the new table. Scheduled (reuse the daily Step Functions sync) + on-demand endpoint.
- **B2 — Contributions calc**: derive `autoContributions` per account from `questrade-activities-dev` (Deposits/Transfers/Withdrawals after `baselineDate`); combine with `manualBaseline`.
- **B3 — Override API + storage**: `GET /api/account-balances` (all, enriched) and `POST /api/account-balances/{personName}/{accountId}` to set/clear `manualBaseline` + `baselineDate`. New `account-balance-management` routes (or extend dividend-management lambda).
- **B4 — Settings UI**: new **"Account Balances"** tab (mirrors Dividend Manager): grouped by person → accounts; per row show **Current value · Net contributions (baseline + auto) · Gain $ / %**, with an **editable baseline override** per currency (CAD + USD) + date and a Save flow. Show per-currency rows, plus **per-person and portfolio totals in both CAD and USD** (combined view, top-bar rate).
- **B5 (optional)** — per-person and portfolio rollup; reconcile against the dashboard's total.

## Build phases (one at a time, after confirmation)
1. **B1** ✅ DONE & deployed 2026-06-09. New table `questrade-account-balances-dev` (PK personName + SK accountId, Retain). `POST /api/sync/balances[/{personName}]` fetches `/v1/accounts/{id}/balances` → stores per-currency `{cash, marketValue, totalEquity}` under `currentBalances`. `GET /api/account-balances` reads all. Writes via `updateItem` (SET merge) to preserve the future baseline. Verified: 6/6 accounts, per-currency values match live Questrade. *Follow-up:* hook `syncBalancesForPerson` into the daily Step Functions per-login sync so it refreshes automatically (currently on-demand).
2. **B2** ✅ DONE & deployed 2026-06-09. `POST /api/sync/contributions` scans cash-movement activities once and stores per account/currency `autoContributions` = Σ netAmount over Deposits+Transfers−Withdrawals (+ deposits/withdrawals/transfers breakdown), honoring any stored `baselineDate` (after-only). `GET /api/account-balances` now returns **enriched** `perCurrency`: `totalEquity`, `autoContributions`, `manualBaseline`, `netContributions`, `gain`, `gainPct`, `estimated` (true until a baseline is set). Verified across 6 accounts. **Caveat (expected):** FX conversions (CAD→USD) are NOT deposits/withdrawals, so per-currency contributions skew when the owner converts currency — and the 3-year activity window misses older contributions. Both are resolved by the **B3 manual baseline** + the **combined CAD/USD view**; until a baseline is set the figure is flagged `estimated`.
3. **B3** ✅ DONE & deployed 2026-06-09. `POST /api/account-balances/{personName}/{accountId}` body `{ manualBaseline: { CAD?, USD? } | null, baselineDate | null }` — merges via `updateItem` (preserves synced balances/contributions) then recomputes contributions honoring the new baseline. `syncAllContributions` now writes EVERY known account so an account whose activities are all pre-baseline resets to 0 (fixed a stale-value bug). Verified: Angel TFSA baseline CAD $1100 @ 2026-06-09 → net $1100, gain $26.44, estimated=false; clear → back to $24.44 estimate.
4. **B4** ✅ DONE & deployed 2026-06-09. New Settings tab **ACCOUNT BALANCES** (`AccountBalances.jsx`): portfolio summary (value / net contributions / gain in **both CAD and USD**), per-person sections with per-account, per-currency rows (current value · net contributions + `est` flag · gain $ / %), an inline **baseline editor** (date + CAD + USD → `POST .../{person}/{account}`), CLEAR, and a **SYNC BALANCES** button. Combined totals use `fetchExchangeRate()` (top-bar USD/CAD). settingsApi: `fetchAccountBalances`, `syncAccountBalances`, `setAccountBaseline`.
5. **B5** rollups / reconciliation (optional).

## Locked decisions (owner, 2026-06-09)
1. **Currency: per-currency (CAD + USD), combined shown in BOTH CAD and USD.** Track CAD and USD contributions + value **separately** (per-currency `totalEquity` and per-currency cash-movement sums) — these are the **exact, authoritative** numbers. The owner enters the baseline override **per currency: a CAD value and a USD value** (only these two currencies). The **combined totals are display/report-only**, shown in **both CAD and USD** (i.e. CAD-equivalent total *and* USD-equivalent total), converted at the **top-bar USD/CAD rate**. Conversions never feed back into the stored per-currency figures.
2. **Baseline semantics: baseline + auto-add after date.** Owner enters net contributions as of `baselineDate` (once); the system **auto-adds cash movements strictly after** `baselineDate`. No double counting.
3. **Which activities count: ALL `Deposits + Transfers-in − Withdrawals − Transfers-out`** — no exclusions (referral rewards / interest are included). The owner corrects any noise via the baseline.
4. **Current value source: balances API `totalEquity`** (per currency, live) — locked (recommended default).
5. **Scope:** all 6 accounts (Vivek & Angel × TFSA/RRSP/Cash) + a per-person and portfolio total in CAD.

> USD/CAD rate: reuse the rate already shown in the app's top bar (the same source the dashboard uses) for the combined-CAD figure; per-currency numbers stay exact.
