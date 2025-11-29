# Portfolio Manager V2 - Project Plan

## Status: IN PROGRESS ✅
- ✅ Project scaffolded (Vite + SolidJS)
- ✅ Dependencies installed (Kobalte + lucide-solid)
- ✅ Vite config updated (port 5174, API proxy)
- ✅ Folder structure created
- ✅ Theme CSS created (dark/light mode)
- ✅ Theme service created

## Next Steps - Files to Create

### 1. API Service (`src/services/api.js`)
Copy from current Frontend with same endpoints:
- /api/portfolio/positions
- /api/portfolio/cash-balances
- /api/persons
- Same data fetching logic

### 2. Layout Components

**Sidebar** (`src/components/layout/Sidebar.jsx`)
- 60px width, fixed
- Logo (D icon)
- 4 Nav buttons (Holdings, Analysis, Backtesting, Settings)
- Theme toggle at bottom
- Active state styling

**Topbar** (`src/components/layout/Topbar.jsx`)
- Title: "portfolio-manager"
- Breadcrumb: "/ vivek / holdings"
- User chip, Currency chip, Exchange rate
- Live indicator with pulse animation
- Sync button

### 3. Metrics Components

**MetricsGrid** (`src/components/metrics/MetricsGrid.jsx`)
- 6-column grid
- Responsive (3 cols on tablet, 2 on mobile)

**MetricCard** (`src/components/metrics/MetricCard.jsx`)
- Name (uppercase, small)
- Value (large, bold)
- Info text
- Optional success tag
- Hover effect

### 4. Holdings Components

**HoldingsTable** (`src/components/holdings/HoldingsTable.jsx`)
- Search input
- Filter/Export buttons
- Table with columns: STOCK, QTY, COST, PRICE, CHG, YLD, YOC, VAL
- Footer with pagination

**HoldingRow** (`src/components/holdings/HoldingRow.jsx`)
- Stock cell with icon + ticker + company name
- Tag (CAD/USD)
- Formatted numbers
- Color coding (green for gains, red for losses)

**StockCell** (`src/components/holdings/StockCell.jsx`)
- Circular icon with initials
- Ticker (clickable/accent color)
- Currency tag
- Company name (small, gray)

### 5. Pages

**Holdings** (`src/pages/Holdings.jsx`)
- Main page component
- Combines all above components
- Data fetching and state management

### 6. Main App

**App.jsx** (`src/App.jsx`)
- Layout with Sidebar + Main content
- Route setup (Holdings page)
- Theme initialization

**index.jsx** (`src/index.jsx`)
- Mount point
- Import theme CSS

## Design Specs

### Colors (from theme.css)
Dark Mode:
- Background: #0d1117, #161b22, #21262d
- Text: #c9d1d9, #8b949e, #6e7681
- Accent: #58a6ff, #1f6feb
- Success: #3fb950, #7ee787
- Error: #f85149

Light Mode:
- Background: #ffffff, #f6f8fa, #e1e4e8
- Text: #24292f, #57606a, #6e7781
- Accent: #0969da, #0550ae
- Success: #1a7f37, #2da44e
- Error: #cf222e

### Typography
- Font: 'SF Mono', 'Roboto Mono', 'Consolas', monospace
- Sizes: 9px (labels), 10-12px (text), 14px (titles), 18px (metrics)

### Spacing
- Sidebar: 60px width
- Padding: 8-20px
- Gaps: 4-16px
- Border radius: 4-8px

## Backend API (No Changes)
- Base URL: http://localhost:4003/api
- Vite proxy: /api -> http://localhost:4003
- Same data format as current app

## Port Configuration
- Frontend V1: http://localhost:5173
- Frontend V2: http://localhost:5174 ← NEW
- Backend: http://localhost:4003

## Icons (lucide-solid)
- BarChart3 (Holdings)
- TrendingUp (Analysis)
- RefreshCw (Backtesting)
- Settings (Settings)
- Sun/Moon (Theme toggle)

## Commands
```bash
# Development
cd d:\Project\3\Frontend-v2\portfolio-manager-v2
npm run dev

# Build
npm run build

# Compare
# Open both:
# http://localhost:5173 (current)
# http://localhost:5174 (new)
```

## Features
✅ Dark/Light theme with persistence
✅ Same data as current app
✅ GitHub-style monospace aesthetic
✅ Smooth animations and transitions
✅ Responsive design
✅ Hover effects and interactions
✅ Live data updates (5s polling)
✅ Search, filter, export (UI ready)
