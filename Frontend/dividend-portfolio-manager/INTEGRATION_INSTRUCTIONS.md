# YoC Exclusion Manager Integration Instructions

## What We Built

We've created a complete **Yield on Cost (YoC) Exclusion Management** system that allows you to select which stocks should be excluded from portfolio-level YoC calculations.

### Backend Components (✅ Complete):
1. **Database Model**: `YieldExclusion.js` - Stores exclusion settings per person
2. **API Routes**: `/api/yield-exclusions/*` endpoints for managing exclusions
3. **API Functions in frontend**: Added to `api.js`

### Frontend Component (✅ Complete):
- **YieldExclusionManager.jsx** - Full UI component with stock selection

## How to Integrate into Settings Page

### Option 1: Add as a New Tab in Settings (Recommended)

The YoC Exclusion tab has already been added to the `subTabs` array in `SettingsTab.jsx`. Now you just need to add the tab content.

**Add this import at the top of `SettingsTab.jsx`:**
```javascript
import YieldExclusionManager from './YieldExclusionManager';
```

**Then add this tab content section in `SettingsTab.jsx` (around line 663, before the System Health tab):**
```javascript
{/* YoC Exclusion Management Tab */}
<div class={`sub-tab-content ${activeSubTab() === 'yocExclusion' ? '' : 'hidden'}`}>
    <YieldExclusionManager />
</div>
```

### Option 2: Use as Standalone Component

You can also import and use it anywhere:
```javascript
import YieldExclusionManager from './components/YieldExclusionManager';

// Then use it in your component:
<YieldExclusionManager />
```

## Features

✅ **Person Selection** - Select which person's exclusions to manage
✅ **Stock List** - Shows all stocks in the portfolio with checkboxes
✅ **Search** - Filter stocks by symbol or company name
✅ **Visual Status** - Green for included, Red for excluded
✅ **YoC Display** - Shows current Yield on Cost for each stock
✅ **Real-time Updates** - Changes reflect immediately
✅ **Notifications** - Success/error messages for all actions

## API Endpoints Created

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/yield-exclusions/person/:personName` | Get all exclusions for a person |
| POST | `/api/yield-exclusions/person/:personName` | Add a symbol to exclusions |
| DELETE | `/api/yield-exclusions/person/:personName/:symbol` | Remove a symbol from exclusions |
| POST | `/api/yield-exclusions/person/:personName/bulk` | Add multiple symbols |
| DELETE | `/api/yield-exclusions/person/:personName/bulk` | Remove multiple symbols |

## Next Steps (To Complete the Feature)

### 1. Update Portfolio Calculator to Respect Exclusions

The backend portfolio calculator needs to be updated to filter out excluded stocks from YoC calculations. This requires modifying:

**File**: `d:\Project\3\Backend\questrade-portfolio-microservices\questrade-portfolio-api\src\services\portfolioCalculator.js`

**What to add**: Before calculating portfolio-level YoC, fetch excluded symbols and filter them out:

```javascript
// In the portfolio summary calculation method:
const YieldExclusion = require('../models/YieldExclusion');

// Get excluded symbols for this person
const excludedSymbols = await YieldExclusion.getExcludedSymbols(personName);

// Filter out excluded stocks when calculating YoC
const includedDividendStocks = dividendStocks.filter(stock =>
    !excludedSymbols.includes(stock.symbol)
);

// Use includedDividendStocks for YoC calculation instead of dividendStocks
```

### 2. Test the Integration

1. Go to Settings → Yield on Cost Exclusions tab
2. Select a person (e.g., "Vivek")
3. Uncheck some high-yield stocks to exclude them
4. Refresh the portfolio page
5. Verify the portfolio-level YoC percentage has changed

## Files Modified/Created

### Backend:
- ✅ `src/models/YieldExclusion.js` - Database model
- ✅ `src/routes/yieldExclusion.js` - API routes
- ✅ `src/server.js` - Route registration
- ⏳ `src/services/portfolioCalculator.js` - **Needs update to use exclusions**

### Frontend:
- ✅ `src/api.js` - API functions added
- ✅ `src/components/YieldExclusionManager.jsx` - Main UI component
- ✅ `src/components/SettingsTab.jsx` - Tab added to subTabs array
- ⏳ **Need to add tab content** (see Option 1 above)

## Troubleshooting

**If API calls fail:**
- Make sure backend is running on port 4003
- Check browser console for errors
- Verify routes are registered in server.js

**If stocks don't show:**
- Ensure you have positions data synced
- Check that person name is correct
- Verify fetchPositionsAggregated() is working

**If exclusions don't persist:**
- Check MongoDB connection
- Verify YieldExclusion model is imported correctly
- Check backend logs for errors
