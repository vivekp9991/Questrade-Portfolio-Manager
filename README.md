# Questrade Dividend Portfolio Manager

Full-stack dividend portfolio tracking application with microservices backend and SolidJS frontend.

## 🚀 Quick Start

### **Option 1: Single Command (Recommended)**

```bash
# From project root - starts EVERYTHING
npm run dev
```

This starts all 4 backend microservices + frontend in one command!

### **Option 2: Manual Setup**

```bash
# Terminal 1 - Backend (all 4 microservices)
cd Backend/questrade-portfolio-microservices
npm run dev

# Terminal 2 - Frontend
cd Frontend/dividend-portfolio-manager
npm run dev

# Terminal 3 - One-time dividend sync
cd Backend/questrade-portfolio-microservices/questrade-sync-api
npm run sync:dividends
```

**Access:** http://localhost:5173

## 📋 Features

- ✅ **Real-time Portfolio Tracking** - Live positions, P&L, and market data
- ✅ **Dividend Management** - Track yield on cost, monthly/annual income
- ✅ **Multi-Account Support** - TFSA, RRSP, FHSA, Cash accounts
- ✅ **Accurate YOC Calculation** - `((dividend × 12) / avg_cost) × 100`
- ✅ **Automatic Sync** - Scheduled syncs from Questrade API
- ✅ **Account Aggregation** - View per-account or aggregated data

## 🏗️ Architecture

### Backend Microservices
- **Auth API** (Port 4001) - Token management & authentication
- **Sync API** (Port 4002) - Data sync & dividend calculations
- **Portfolio API** (Port 4003) - Portfolio metrics & analysis

### Frontend
- **SolidJS** - Reactive UI framework
- **Vite** - Build tool and dev server

## 📊 Dividend Data

Each position includes comprehensive dividend metrics:

```javascript
{
  yieldOnCost: 24.8,              // Yield on original cost
  currentYield: 21.65,            // Current market yield
  annualDividend: 333,            // Total annual income
  monthlyDividend: 27.75,         // Monthly income
  totalReceived: 58,              // All-time dividends
  dividendFrequency: 12,          // Payment frequency
  lastDividendDate: "2025-09-09"
}
```

## 📚 Documentation

- [Complete Setup Guide](COMPLETE_SETUP_GUIDE.md) - Full setup instructions
- [Dividend Sync Guide](Backend/questrade-portfolio-microservices/questrade-sync-api/DIVIDEND_SYNC_GUIDE.md) - Dividend sync details
- [Positions API](Backend/POSITIONS_API_WITH_DIVIDENDS.md) - API response structure

## 📋 Available Commands

From the **project root** (`d:\Project\3\`):

| Command | Description |
|---------|-------------|
| `npm run dev` | Start everything (Backend + Frontend) |
| `npm run backend:only` | Start only backend microservices |
| `npm run frontend:only` | Start only frontend |
| `npm run sync:dividends` | Sync all dividend data |
| `npm run sync:dividends:person` | Sync specific person's dividends |
| `npm run sync:dividends:symbol` | Sync specific stock's dividends |
| `npm run install:all` | Install all dependencies (Backend + Frontend) |
| `npm run test:backend` | Check backend health endpoints |

## 🔧 Configuration

### Backend
Each microservice has `.env` file with MongoDB and API configuration.

### Frontend
`Frontend/dividend-portfolio-manager/.env`:
```env
VITE_AUTH_API_URL=http://localhost:4001
VITE_SYNC_API_URL=http://localhost:4002
VITE_PORTFOLIO_API_URL=http://localhost:4003
```

## 🧪 Testing

```bash
# Verify backend
curl http://localhost:4002/health
curl http://localhost:4003/health

# Test dividend data
curl "http://localhost:4002/api/positions?symbol=HHIS.TO"

# Manual dividend sync
cd Backend/questrade-portfolio-microservices/questrade-sync-api
npm run sync:dividends
```

## 📈 Example Output

**HHIS.TO - Hamilton High Income Shares ETF**
- Total Shares: 111 (33 TFSA + 78 FHSA)
- Weighted Avg Cost: $12.10
- Annual Dividend/Share: $3.00 (monthly: $0.25)
- **Yield on Cost: 24.8%** ✅

## 🛠️ Tech Stack

**Backend:**
- Node.js + Express
- MongoDB + Mongoose
- Axios (API calls)
- Node-cron (scheduled tasks)

**Frontend:**
- SolidJS
- Vite
- Chart.js
- TwelveData API (exchange rates)

## 🎯 Status

✅ All systems operational
- Backend: Accurate dividend sync & YOC calculation
- Frontend: Displaying correct dividend data
- 67 positions, 42 dividend stocks tracked

## 📝 Recent Fixes

1. ✅ Fixed dividend data not syncing to database
2. ✅ Fixed incorrect YOC calculation in Sync API
3. ✅ Fixed Portfolio API recalculating dividends incorrectly
4. ✅ Fixed aggregation missing dividend data
5. ✅ Added automatic dividend sync after position sync

## 📞 Support

For issues or questions:
1. Check [COMPLETE_SETUP_GUIDE.md](COMPLETE_SETUP_GUIDE.md)
2. Review logs in backend services
3. Verify all services are running on correct ports

---

**Last Updated:** October 9, 2025
**Status:** ✅ Production Ready
