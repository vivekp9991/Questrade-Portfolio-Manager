# Personal Net-Worth Report — Design & Requirements

Status: **DESIGN (no code yet)** · Date: 2026-06-09 · Owner-requested. Build only after confirmation; one phase at a time.

A single, **printable (A4, multi-page)** report that rolls up everything the owner holds — **bank cash + Questrade investments + custom/manual investments** — per person, in **both CAD and USD**, with a **category percentage breakdown**. Builds on the account-balances feature (`account-balance-tracking.md`, B1–B4).

## Owner's intent (from the 5 attached spreadsheet images)
1. **Image 1 — Bank / cash balances (manual):** per person (Vivek, Dharati), per bank (AB/J/V/T bank…), two tables **Cash CAD** and **Cash USD**, per-person totals, and a combined total in CAD (and USD). Rate cell `USDCAD = 1.39`.
2. **Image 2 — Questrade CAD summary:** per person, per account (Cash/TFSA/RRSP): **Contribution · Invested · P&L · Cash · Total**, with per-person totals + a CAD grand total. (Plus an extra manually-added line, e.g. "Parle G".)
3. **Image 3 — Questrade USD summary:** same shape, USD.
4. **Image 4 — Custom investment ("Something"):** add an asset by **lots (Quantity + Price)** → Total qty, **Total cost**, **Average price**; enter **Current price** → **Current value** and **Final P&L**. (This "Parle G"/"Something" asset also appears as a manual line in the Questrade summary.)
5. **Image 5 — Grand total:** combine Cash (CAD+USD) + Questrade (Invested + With-P&L) + custom → **total in CAD and USD**.
- Plus: **category % breakdown** (cash, gold, silver, equity, dividend ETF, …); ability to **add arbitrary manual lines** anywhere; **printable A4, ~2 pages**. (Owner will share a sample layout screenshot.)

## Sections of the report
| # | Section | Source | Editable |
|---|---|---|---|
| A | **Bank / Cash balances** | 100% manual | add/edit/delete rows (person, bank, currency, amount) |
| B | **Questrade Investment Summary** (CAD + USD) | **auto** from Questrade (account-balances + positions) | + manual extra lines |
| C | **Custom Investments** | manual (lot-based) | add lots, set current price, category |
| D | **Grand Total** (CAD + USD) | computed from A+B+C | — |
| E | **Category breakdown %** | computed from B (by symbol category) + C (by category) + cash | — |

## Data sources & what's new
- **Section B is mostly already built.** From the account-balances feature we have per account/currency: `contribution` (net contributions), `cash`, `totalEquity`. **New backend work:** add **`invested` = Σ position `totalCost`** and **`marketValue` = Σ position `currentMarketValue`** per account/currency, then **`P&L = marketValue − invested`**, **`total = totalEquity`** (= marketValue + cash). Verified against Image 2 (e.g. Vivek TFSA: invested 12000, P&L 4724.01, cash 348.40 ⇒ total ≈ 17072.81). So **Invested = cost basis, P&L = unrealized gain on holdings** (NOT total − contribution).
- **Section A (bank balances)** — new manual data → new table.
- **Section C (custom investments)** — new manual data (lots) → new table.
- **Category breakdown (E)** — reuse the existing **`symbol-categories`** (type/sub-type: equity, dividend ETF, commodity→gold/silver/…) for Questrade holdings; custom investments carry their own category; cash is its own bucket.

## Data model (new tables — additive)
**`questrade-bank-balances-{env}`** — PK `person` (S), SK `entryId` (S).
`bankName`, `currency` (CAD|USD), `amount`, `updatedAt`. (Section A.)

**`questrade-custom-investments-{env}`** — PK `person` (S), SK `investmentId` (S).
`name`, `category` (reuse category list, e.g. COMMODITY/GOLD, EQUITY, DIVIDEND_ETF…), `currency` (CAD|USD), `account` (optional label, e.g. TFSA / "Parle G"), `lots`: `[{ quantity, price }]`, `currentPrice`. Computed (not stored): `totalQty=Σqty`, `cost=Σ(qty×price)`, `avgPrice=cost/totalQty`, `currentValue=totalQty×currentPrice`, `pnl=currentValue−cost`. Also support a **simple line** (no lots): just `cost` + `currentValue` entered directly, for "add any manual line."

> Both new tables `DeletionPolicy: Retain` (owner data).

## Computations
- **Questrade per account/ccy:** invested=Σ`totalCost`, marketValue=Σ`currentMarketValue`, P&L=marketValue−invested, cash (from balances), total=totalEquity, contribution (from account-balances).
- **Custom:** as above (lot-based or simple line).
- **Per person & grand totals** per currency, then **combined**: `CAD-total = Σ CAD + Σ USD × rate`; `USD-total = Σ USD + Σ CAD ÷ rate` (top-bar USD/CAD rate, display-only).
- **Category breakdown %:** bucket every dollar of net worth → Cash | Equity | Dividend ETF | Gold | Silver | … (Questrade holdings by `symbolType`/`symbolSubType`; custom by its category; bank balances → Cash), as % of grand total (in one display currency).

## UI / report
- **Location:** a new top-level page/tab — proposed name **"Net Worth"** (or "Report") — near Holdings / Dividend Analysis. Contains the 5 sections + edit controls for A & C + manual-line adds for B.
- **Editing:** inline add/edit/delete for bank balances and custom investments (+ lots); Questrade section auto-loads with optional manual extra lines.
- **Print:** a dedicated print stylesheet — **A4 page size, ~2 pages**, clean tables, page breaks between logical sections, hides app chrome (sidebar/topbar/buttons). "Print / Save PDF" button (uses the browser print dialog).

## Build phases (one at a time, after confirmation)
1. **R1** ✅ DONE & deployed 2026-06-09. `GET /api/account-balances` enriched `perCurrency` now also returns `invested` (Σ position `totalCost` = cost basis), `marketValue` + `cash` + `totalEquity` (real-time, from balances → `marketValue+cash=total` always ties), and `pnl = marketValue − invested`. Verified across all accounts; USD invested matches the owner's spreadsheet (e.g. Vivek TFSA USD $9,687.89). Report shows BOTH `contribution` (money in) and `invested` (cost basis) — they differ when gains/dividends are reinvested.
2. **R2** ✅ DONE & deployed 2026-06-09. Table `questrade-bank-balances` (PK person + SK entryId, Retain). Endpoints: `GET /api/bank-balances`, `POST /api/bank-balances` (create if no entryId / update if present), `DELETE /api/bank-balances/{person}/{entryId}`. Fields: free-form `person`, `bankName`, `currency` (CAD|USD), `amount`. Full CRUD verified. UI section lands in R4.
3. **R3** ✅ DONE & deployed 2026-06-09. Table `questrade-custom-investments` (PK person + SK investmentId, Retain). `GET/POST/DELETE /api/custom-investments[/{person}/{investmentId}]`. Modes: `lots` (lots[{quantity,price}] + currentPrice) and `simple` (cost + currentValue). Read computes `totalQty, cost, avgPrice, currentValue, pnl, pnlPct`. Fields: person, name, category, currency, account. Verified: lot-based "Parle G" = Image 4 exactly (cost $50,269.88, value $76,788, pnl $26,518.12); simple line works. UI lands in R4.
4. **R4** ✅ DONE & deployed 2026-06-09. New sidebar page **Net Worth** (`NetWorthReport.jsx` + CSS), a faithful port of the owner's mockup (`sample report/net-worth-report.html`): header + rate, A bank (two-up CAD/USD, people side by side), B Questrade (CAD+USD bands: Contribution/Invested/P&L/Cash/Total from `account-balances`), C custom investments, D grand-total cards (CAD + USD), E category breakdown. Live from real APIs; screen-only editor to add/delete bank + custom and set the **login→report-name mapping** (e.g. Angel→Dharati, localStorage). **Print/Save-PDF** opens a clean A4 popup (covers R6). settingsApi: bank + custom CRUD added.
5. **R5** — Category breakdown %.
6. **R6** — Print A4 / multi-page stylesheet + Print button.

## Locked decisions (owner, 2026-06-09)
1. **People = free-form names.** Bank balances & custom investments use a free-form `person` label (Vivek, Dharati, anyone — including people with no Questrade login). The Questrade section maps each login → a report-person display name via a small **login→name mapping** (e.g. `Vivek→Vivek`, `Angel→Dharati`); store the mapping in a tiny config (settings/table) editable by the owner. Default: login name as-is.
2. **Report location = a tab under Analysis / Dividend Analysis** (NOT a new top-level page). Add a new tab (e.g. "Net Worth") to the existing analysis tab strip.
3. **Custom investments = both lot-based AND simple line.** Lot-based (qty+price lots → cost/avg, enter current price → value+P&L, per Image 4) and a simple manual line (enter cost + current value). Each has `person`, `currency`, `category`.
4. **Category buckets = reuse existing categories + Cash.** Questrade holdings bucket by `symbolType`/`symbolSubType` (Equity, Dividend ETF, Index ETF, Commodity→Gold/Silver/Platinum/Copper/Aluminum/…); custom investments by their own `category`; bank balances → Cash. No new taxonomy.
5. **Questrade summary = auto + manual lines.** Auto from account-balances + positions; allow manual extra lines (e.g. "Parle G"). Invested = cost basis, P&L = market − cost (confirmed via Image 2).
6. **Print = A4 portrait, ~2 pages** (owner will share a sample layout screenshot to finalize which sections land on which page; print stylesheet hides app chrome).
