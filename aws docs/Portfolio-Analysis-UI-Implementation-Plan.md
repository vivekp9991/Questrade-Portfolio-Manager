# Portfolio Analysis UI - Implementation Plan

## Overview

This document outlines the implementation plan for adding a **Portfolio Analysis** feature to the Questrade Portfolio Manager application.

### Goals
1. Add a new "Dividend Analysis" page with visualization charts
2. Keep Holdings page table as-is (red box area) with same 7 metric cards
3. Add category/type management in Dividend Manager settings
4. Share the same 7 metric cards between Holdings and Dividend Analysis pages

---

## Data Categorization Model

| Level | Options | Example |
|-------|---------|---------|
| **Type** | Dividend ETF, Index ETF, Stock, Commodity | GLD = Commodity |
| **Sub-Type** | Gold, Silver, Platinum, Other (for commodities) | GLD = Gold |
| **Sector** | (Future) Technology, Healthcare, Financials, etc. | - |
| **Sub-Sector** | (Future) Configured in Dividend Manager | - |

### Current vs Proposed Architecture

```
Current Flow:
Position → Symbol → (no category data)

Proposed Flow:
Position → Symbol → Type → Sub-Type (optional)
                  ↓
            Stored in SymbolsMaster or new CategoryConfig table
```

---

## FRONTEND TODO LIST

### Phase 1: Shared Components & Infrastructure

| # | Task | Description | Files Affected |
|---|------|-------------|----------------|
| F1 | **Extract MetricsGrid** | Move the 7 metric cards (INVEST, CURRENT, P&L, etc.) into a reusable shared component | `components/metrics/` |
| F2 | **Create DonutChart component** | Reusable donut/ring chart with center label, configurable colors, legend | `components/charts/DonutChart.jsx` |
| F3 | **Create TopHoldingsList component** | List component showing symbol icon, name, value, percentage bar | `components/charts/TopHoldingsList.jsx` |
| F4 | **Add chart library** | Install lightweight chart library (Chart.js or D3.js) or build SVG-based charts | `package.json` |

### Phase 2: Dividend Analysis Page

| # | Task | Description | Files Affected |
|---|------|-------------|----------------|
| F5 | **Create DividendAnalysis page** | New page at `/dividend-analysis` route | `pages/DividendAnalysis.jsx` |
| F6 | **Add navigation tab** | Add "Holdings" / "Dividend Analysis" toggle in header (like screenshot 1) | `components/layout/Topbar.jsx` |
| F7 | **Dividend vs Non-Dividend card** | Donut chart showing dividend-paying vs non-dividend breakdown by investment value | `components/analysis/DividendBreakdownCard.jsx` |
| F8 | **ETF Category Breakdown card** | Donut chart showing Dividend ETFs, Index ETFs, Commodities, Stocks breakdown | `components/analysis/CategoryBreakdownCard.jsx` |
| F9 | **Commodities Breakdown card** | Donut chart showing Gold, Silver, Platinum breakdown (filtered view) | `components/analysis/CommodityBreakdownCard.jsx` |
| F10 | **Holdings by Position card** | Large donut chart with all positions + top holdings list | `components/analysis/HoldingsByPositionCard.jsx` |
| F11 | **Dropdown filters** | "Investment" / "Market Value" toggle on each card | Integrated in each card |
| F12 | **Responsive layout** | 3-column grid for top row, 2-column for bottom row | `pages/DividendAnalysis.css` |

### Phase 3: Holdings Page Updates

| # | Task | Description | Files Affected |
|---|------|-------------|----------------|
| F13 | **Verify MetricsGrid integration** | Ensure Holdings page uses shared MetricsGrid component | `pages/Holdings.jsx` |
| F14 | **No table changes** | Keep existing HoldingsTable exactly as-is (red box area) | No changes |
| F15 | **Add tab navigation** | Same "Holdings" / "Dividend Analysis" tabs as analysis page | `pages/Holdings.jsx` |

### Phase 4: Dividend Manager - Category Configuration

| # | Task | Description | Files Affected |
|---|------|-------------|----------------|
| F16 | **Add "Category Management" section** | New section in Dividend Manager settings | `components/DividendManager.jsx` |
| F17 | **Symbol Type Editor** | Dropdown to assign Type (Dividend ETF, Index ETF, Stock, Commodity) per symbol | `components/settings/SymbolTypeEditor.jsx` |
| F18 | **Symbol Sub-Type Editor** | Conditional dropdown for sub-type (Gold, Silver, etc.) when Type=Commodity | `components/settings/SymbolSubTypeEditor.jsx` |
| F19 | **Bulk category assignment** | Allow selecting multiple symbols and assigning type at once | `components/settings/BulkCategoryAssign.jsx` |
| F20 | **Category stats summary** | Show counts: "X Dividend ETFs, Y Index ETFs, Z Commodities, W Stocks" | Integrated in DividendManager |

### Phase 5: API Integration

| # | Task | Description | Files Affected |
|---|------|-------------|----------------|
| F21 | **Add category API calls** | `GET /api/symbol-categories`, `POST /api/symbol-categories/{symbol}` | `services/api.js` |
| F22 | **Add analysis API calls** | `GET /api/portfolio/analysis` for pre-calculated breakdowns | `services/api.js` |
| F23 | **Update positions fetch** | Include category data in positions response | `services/api.js` |

---

## BACKEND TODO LIST

### Phase 1: Database Schema Updates

| # | Task | Description | Table/Files Affected |
|---|------|-------------|----------------------|
| B1 | **Add category fields to SymbolsMaster** | Add `symbolType`, `symbolSubType` fields | `SymbolsMaster` table |
| B2 | **OR Create SymbolCategories table** | New table: `symbol (PK)`, `type`, `subType`, `sector`, `subSector` | New DynamoDB table |
| B3 | **Update CloudFormation** | Add new table or modify existing schema | `template.yaml` |

### Phase 2: Category Management API

| # | Task | Description | Lambda/Files Affected |
|---|------|-------------|----------------------|
| B4 | **GET /api/symbol-categories** | Return all symbols with their categories | `dividend-management` or new handler |
| B5 | **GET /api/symbol-categories/{symbol}** | Return category for specific symbol | Same as above |
| B6 | **POST /api/symbol-categories/{symbol}** | Set/update type and subType for symbol | Same as above |
| B7 | **POST /api/symbol-categories/bulk** | Bulk update categories for multiple symbols | Same as above |
| B8 | **GET /api/category-options** | Return available types and subtypes | Same as above |

### Phase 3: Portfolio Analysis API

| # | Task | Description | Lambda/Files Affected |
|---|------|-------------|----------------------|
| B9 | **GET /api/portfolio/analysis** | Return pre-calculated analysis data | `portfolio-analytics` |
| B10 | **Dividend vs Non-Dividend calculation** | Group positions by dividend-paying status | `portfolioService.js` |
| B11 | **Category breakdown calculation** | Group positions by type (ETF, Stock, Commodity) | `portfolioService.js` |
| B12 | **Commodity breakdown calculation** | Group commodity positions by subType | `portfolioService.js` |
| B13 | **Top holdings calculation** | Return top N positions by value with percentages | `portfolioService.js` |

### Phase 4: Data Enrichment

| # | Task | Description | Lambda/Files Affected |
|---|------|-------------|----------------------|
| B14 | **Auto-categorize existing symbols** | Script/endpoint to suggest categories based on symbol names | Utility script |
| B15 | **Include category in sync** | When syncing positions, include category data in response | `sync-operations` |
| B16 | **Cache analysis results** | Store calculated analysis in CacheTable (15-min TTL) | `cacheService.js` |

### Phase 5: API Gateway Routes

| # | Task | Description | Files Affected |
|---|------|-------------|----------------|
| B17 | **Add routes for category APIs** | Register new endpoints in API Gateway | `template.yaml` or manual |
| B18 | **Add routes for analysis API** | Register `/api/portfolio/analysis` endpoint | Same as above |
| B19 | **Update CORS** | Ensure new endpoints have proper CORS headers | Lambda handlers |

---

## Data Structure Proposal

### Symbol Category Schema

```json
{
  "symbol": "GLD",           // Partition Key
  "symbolType": "Commodity", // Dividend ETF | Index ETF | Stock | Commodity
  "symbolSubType": "Gold",   // Gold | Silver | Platinum | Other (only for Commodity)
  "sector": null,            // Future: Technology, Healthcare, Financials, etc.
  "subSector": null,         // Future: configurable
  "updatedAt": 1732800000000,
  "updatedBy": "manual"      // manual | auto-detected
}
```

### Analysis Response Schema

```json
{
  "dividendBreakdown": {
    "dividendPaying": { "value": 60539.03, "percentage": 74.4, "count": 35 },
    "nonDividend": { "value": 20884.17, "percentage": 25.6, "count": 12 }
  },
  "categoryBreakdown": {
    "dividendETF": { "value": 42156.32, "percentage": 51.7, "count": 20 },
    "indexETF": { "value": 18432.71, "percentage": 22.6, "count": 8 },
    "commodities": { "value": 20884.17, "percentage": 25.6, "count": 9 },
    "stocks": { "value": 0, "percentage": 0, "count": 0 }
  },
  "commodityBreakdown": {
    "gold": { "value": 10854.91, "percentage": 52.0 },
    "silver": { "value": 8604.26, "percentage": 41.2 },
    "platinum": { "value": 1425.00, "percentage": 6.8 }
  },
  "topHoldings": [
    { "symbol": "GLD", "value": 10854.91, "percentage": 13.3 },
    { "symbol": "SLV", "value": 5836.15, "percentage": 7.2 }
  ],
  "totalInvestment": 81473,
  "holdingsCount": 47
}
```

---

## Implementation Order Recommendation

### Stage 1: Backend Foundation
```
B1 → B3 → B4-B8 → B17
(Schema → CloudFormation → Category APIs → Routes)
```

### Stage 2: Frontend Category Management
```
F16 → F17 → F18 → F21
(Dividend Manager UI → Type Editor → SubType Editor → API calls)
```

### Stage 3: Backend Analysis
```
B9-B13 → B16 → B18
(Analysis calculations → Caching → Routes)
```

### Stage 4: Frontend Analysis Page
```
F1-F4 → F5-F12 → F22
(Shared components → Charts → Analysis page → API integration)
```

### Stage 5: Integration & Polish
```
F13-F15 → F23
(Holdings integration → Final testing)
```

---

## Questions to Clarify

1. **Default category assignment**: Should uncategorized symbols default to "Stock" or remain "Uncategorized"?

2. **Sub-type for non-commodities**: Do you want sub-types for other categories (e.g., for Dividend ETFs: "Canadian", "US", "International")?

3. **Sector/Sub-sector priority**: Should sector configuration be included in Phase 1 or deferred to later?

4. **Auto-detection**: Want me to build logic to auto-suggest categories based on symbol patterns (e.g., `.TO` suffix = Canadian, `GLD/SLV/SIVR` = Commodities)?

5. **Holdings count link**: In screenshot 1, "47 Holdings" and "8 Holdings" are clickable - should these filter/navigate somewhere?

---

## UI Reference

### Page Layout - Dividend Analysis

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  [Holdings]  [Dividend Analysis]                    Filters... SYNC LOGOUT  │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  │ INVEST  │ │ CURRENT │ │  P&L    │ │TODAY P&L│ │ RETURN  │ │   YOC   │   │
│  │ $81,473 │ │ $91,604 │ │$10,131  │ │  +$9.15 │ │$13,605  │ │ 14.36%  │   │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘   │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐            │
│  │ Dividend vs      │ │ ETF Category     │ │ Commodities      │            │
│  │ Non-Dividend     │ │ Breakdown        │ │ 8 Holdings       │            │
│  │    [DONUT]       │ │    [DONUT]       │ │    [DONUT]       │            │
│  │  74.4% / 25.6%   │ │ 51.7%/22.6%/25.6%│ │ Gold/Silver/Plat │            │
│  └──────────────────┘ └──────────────────┘ └──────────────────┘            │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────┐ ┌─────────────────────────────────┐│
│  │ Holdings by Position               │ │ Top Holdings                    ││
│  │ 47 Holdings                        │ │                                 ││
│  │                                    │ │ GLD      $10,854  ████████ 13.3%││
│  │         [LARGE DONUT]              │ │ SLV       $5,836  ████    7.2% ││
│  │           $81,473                  │ │ HMAX.TO   $2,859  ██      3.5% ││
│  │                                    │ │ USCI.TO   $2,619  ██      3.2% ││
│  │                                    │ │ HYLD.TO   $2,480  ██      3.0% ││
│  └────────────────────────────────────┘ └─────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

### Page Layout - Holdings (No Changes to Table)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  [Holdings]  [Dividend Analysis]                    Filters... SYNC LOGOUT  │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  │ INVEST  │ │ CURRENT │ │  P&L    │ │TODAY P&L│ │ RETURN  │ │   YOC   │   │
│  │ $81,473 │ │ $91,604 │ │$10,131  │ │  +$9.15 │ │$13,605  │ │ 14.36%  │   │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘   │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ STOCK | SHARES | AVG COST | PREV CLOSE | CURRENT PRICE | TODAY CHANGE  ││
│  │ ... EXISTING HOLDINGS TABLE - NO CHANGES ...                           ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## File Locations

- **Frontend**: `D:\Project\3\aws-frontend`
- **Backend**: `D:\Project\3\AWS-Backend`

---

*Document Created: November 28, 2025*
