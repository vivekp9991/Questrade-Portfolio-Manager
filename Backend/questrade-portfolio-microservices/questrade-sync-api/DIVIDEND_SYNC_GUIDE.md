# Dividend Sync Guide

This guide explains how to sync dividend data for your portfolio stocks.

## Overview

Dividend data is automatically calculated from dividend activities and stored in the Position collection. This includes:
- Yield on Cost (YOC)
- Annual dividend per share
- Monthly dividend per share
- Total dividends received
- Dividend frequency (monthly, quarterly, etc.)
- Dividend history

## Automatic Sync (Default) ⏰

**Dividend data syncs automatically** after every position sync. No action required!

When you run position sync, dividend data is calculated and updated for all stocks automatically.

## Manual Sync Options

### Option 1: NPM Scripts (Recommended) 🚀

From the `questrade-sync-api` directory:

```bash
# Sync all stocks
npm run sync:dividends

# Sync specific person
npm run sync:dividends:person Vivek

# Sync specific symbol
npm run sync:dividends:symbol HHIS.TO
```

### Option 2: Node.js Script

```bash
cd questrade-sync-api

# Sync all
node scripts/sync-dividends.js all

# Sync person
node scripts/sync-dividends.js person Vivek

# Sync symbol
node scripts/sync-dividends.js symbol HHIS.TO
```

### Option 3: Direct API Calls

```bash
# Using cURL

# Sync all stocks
curl -X POST http://localhost:4002/api/dividends/sync/all

# Sync specific person
curl -X POST http://localhost:4002/api/dividends/sync/person/Vivek

# Sync specific symbol
curl -X POST http://localhost:4002/api/dividends/sync/symbol/HHIS.TO
```

### Option 4: From Code

```javascript
const axios = require('axios');

// Sync all
await axios.post('http://localhost:4002/api/dividends/sync/all');

// Sync person
await axios.post('http://localhost:4002/api/dividends/sync/person/Vivek');

// Sync symbol
await axios.post('http://localhost:4002/api/dividends/sync/symbol/HHIS.TO');
```

## API Endpoints

| Endpoint | Method | Description | Response |
|----------|--------|-------------|----------|
| `/api/dividends/sync/all` | POST | Sync all positions | `{success, data: {total, updated, errors}}` |
| `/api/dividends/sync/person/:name` | POST | Sync for specific person | `{success, data: {total, updated}}` |
| `/api/dividends/sync/symbol/:symbol` | POST | Sync for specific symbol | `{success, data: {total, updated}}` |

## Calculated Data

For each position with dividends, the following is calculated and stored:

### Fields in `dividendData`:
- `totalReceived` - Total dividends received (all time)
- `lastDividendAmount` - Most recent dividend payment amount
- `lastDividendDate` - Date of last dividend
- `dividendReturnPercent` - Total dividends / total cost * 100
- `yieldOnCost` - (Annual dividend / avg cost per share) * 100
- `currentYield` - (Annual dividend / current price) * 100
- `dividendAdjustedCost` - Total cost minus dividends received
- `dividendAdjustedCostPerShare` - Adjusted cost per share
- `monthlyDividend` - Total monthly dividend amount
- `monthlyDividendPerShare` - Monthly dividend per share
- `annualDividend` - Total annual dividend amount
- `annualDividendPerShare` - Annual dividend per share
- `dividendFrequency` - Payments per year (12=monthly, 4=quarterly, etc.)
- `dividendHistory` - Array of last 10 dividend payments

## Yield on Cost Formula

```
YOC = ((dividend_per_share * frequency) / avg_cost_per_share) * 100
```

For monthly paying stocks (frequency = 12):
```
YOC = ((dividend_per_share * 12) / avg_cost_per_share) * 100
```

### Example (HHIS.TO):
- Monthly dividend: $0.25
- Frequency: 12 (monthly)
- Avg cost: $10.95
- **YOC = ($0.25 × 12) / $10.95 × 100 = 27.41%**

## When to Run Manual Sync

You typically don't need to run manual sync because it happens automatically. However, you might want to run it manually if:

1. **After bulk data import** - If you manually imported activity data
2. **Data correction** - If you fixed dividend activity data
3. **On-demand update** - If you want fresh calculations immediately
4. **Testing** - To verify dividend calculations

## Troubleshooting

### Issue: No dividend data showing

**Solution:**
1. Verify dividend activities exist:
   ```bash
   # Check activities
   curl http://localhost:4002/api/activities?type=Dividend&symbol=HHIS.TO
   ```
2. Run manual sync:
   ```bash
   npm run sync:dividends
   ```

### Issue: Incorrect yield calculations

**Solution:**
1. Verify position data (shares, avg cost):
   ```bash
   curl http://localhost:4002/api/positions?symbol=HHIS.TO
   ```
2. Re-sync dividend data:
   ```bash
   npm run sync:dividends:symbol HHIS.TO
   ```

### Issue: Old dividend data

**Solution:**
- Dividend data updates automatically with each position sync
- For immediate update: `npm run sync:dividends`

## Logs

Check sync logs in the console or log files:
```bash
# Sync-api logs show dividend sync progress
[DIVIDEND SYNC] Processing HHIS.TO for Vivek (53413547)
[DIVIDEND SYNC] Found 6 dividend activities for HHIS.TO
[DIVIDEND SYNC] Updated HHIS.TO (Vivek): Annual dividend $3, YOC: 27.41%
```

## Integration with Scheduled Sync

The dividend sync is integrated into the scheduled sync job:
1. Position sync runs (syncs from Questrade)
2. Dividend sync runs automatically (calculates from activities)
3. All data is up-to-date

No configuration needed - it just works! ✅
