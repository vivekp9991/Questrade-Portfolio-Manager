# Questrade Dividend Portfolio Manager

**Full-stack dividend portfolio tracking application with microservices backend and SolidJS frontend - All in one monorepo!**

[![Status](https://img.shields.io/badge/status-production--ready-brightgreen)]()
[![License](https://img.shields.io/badge/license-MIT-blue)]()

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

# Terminal 2 - Frontend v2 (New Improved UI)
cd Frontend-v2/portfolio-manager-v2
npm run dev

# Terminal 3 - Backtesting Backend
cd Backend/candle-based-backend
npm start

# Terminal 4 - One-time dividend sync
cd Backend/questrade-portfolio-microservices/questrade-sync-api
npm run sync:dividends
```

**Access:**
- Portfolio Manager: http://localhost:5173
- Backtesting Analytics: http://localhost:5173/backtesting

## 📋 Features

### Portfolio Management
- ✅ **Real-time Portfolio Tracking** - Live positions, P&L, and market data
- ✅ **Dividend Management** - Track yield on cost, monthly/annual income
- ✅ **Multi-Account Support** - TFSA, RRSP, FHSA, Cash accounts
- ✅ **Accurate YOC Calculation** - `((dividend × 12) / avg_cost) × 100`
- ✅ **Automatic Sync** - Scheduled syncs from Questrade API
- ✅ **Account Aggregation** - View per-account or aggregated data
- ✅ **Dark/Light Mode** - Theme switcher with persistent settings

### Backtesting Analytics
- ✅ **Red Candle Strategy** - Dollar-cost averaging on price dips
- ✅ **Historical Analysis** - Backtest with 1D, 1W, 1M candles
- ✅ **Dividend Tracking** - Dividend-adjusted returns & cost basis
- ✅ **Performance Metrics** - Success rate, total return, yearly average
- ✅ **Payment History** - Visual dividend payment timeline

## 🏗️ Repository Structure

```
Questrade-Portfolio-Manager/
├── Backend/
│   ├── questrade-portfolio-microservices/
│   │   ├── questrade-auth-api/         # Token management (Port 4001)
│   │   ├── questrade-sync-api/         # Data sync & dividends (Port 4002)
│   │   ├── questrade-portfolio-api/    # Portfolio metrics (Port 4003)
│   │   └── questrade-websocket-server/ # WebSocket server (Port 4004)
│   └── candle-based-backend/           # Backtesting backend (Port 3000)
│
├── Frontend/
│   └── dividend-portfolio-manager/     # Original Solid UI (Legacy)
│
├── Frontend-v2/
│   └── portfolio-manager-v2/           # New improved UI (Active)
│       ├── src/
│       │   ├── pages/
│       │   │   ├── Holdings.jsx        # Main portfolio view
│       │   │   ├── Analysis.jsx        # Portfolio analysis
│       │   │   ├── Backtesting.jsx     # Backtesting analytics
│       │   │   └── Settings.jsx        # App settings
│       │   ├── components/             # Reusable components
│       │   ├── services/               # API services
│       │   └── styles/                 # Theme & styles
│       └── vite.config.js
│
├── scripts/                            # Utility scripts
├── aws-config/                         # AWS deployment config
├── terraform/                          # Infrastructure as code
└── serverless/                         # Serverless framework
```

## 🎨 Frontend Applications

### Frontend-v2 (Active - Recommended)
Modern, polished UI with:
- Clean, minimal design
- GitHub-inspired dark theme
- Responsive layout
- Real-time data updates
- Advanced backtesting features

### Frontend (Legacy)
Original UI - kept for reference

## 📊 Backend Services

### Portfolio Microservices
1. **Auth API** (Port 4001) - Token management & authentication
2. **Sync API** (Port 4002) - Data sync & dividend calculations
3. **Portfolio API** (Port 4003) - Portfolio metrics & analysis
4. **WebSocket Server** (Port 4004) - Real-time updates

### Backtesting Service
- **Candle-Based Backend** (Port 3000) - Historical analysis & backtesting

## 📚 Dividend Data

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

## 📋 Available Commands

From the **project root** (`d:\Project\3\`):

| Command | Description |
|---------|-------------|
| `npm run dev` | Start everything (Backend + Frontend) |
| `npm run dev:v2` | Start backend + Frontend-v2 (Recommended) |
| `npm run backend:only` | Start only backend microservices |
| `npm run frontend:only` | Start only frontend |
| `npm run sync:dividends` | Sync all dividend data |
| `npm run sync:dividends:person` | Sync specific person's dividends |
| `npm run sync:dividends:symbol` | Sync specific stock's dividends |
| `npm run install:all` | Install all dependencies |
| `npm run test:backend` | Check backend health endpoints |

## 🔧 Configuration

### Backend Microservices
Each service has `.env` file with MongoDB and API configuration:

```env
PORT=4002
MONGODB_URI=mongodb://localhost:27017/questrade_portfolio
QUESTRADE_API_BASE_URL=https://api01.iq.questrade.com
```

### Backtesting Backend
`Backend/candle-based-backend/.env`:
```env
PORT=3000
MONGODB_URI=mongodb://localhost:27017/backtesting
QUESTRADE_API_KEY=your_api_key
```

### Frontend
`Frontend-v2/portfolio-manager-v2/.env`:
```env
VITE_AUTH_API_URL=http://localhost:4001
VITE_SYNC_API_URL=http://localhost:4002
VITE_PORTFOLIO_API_URL=http://localhost:4003
VITE_BACKTESTING_API_URL=http://localhost:3000
```

## 🧪 Testing

```bash
# Verify backend health
curl http://localhost:4002/health
curl http://localhost:4003/health
curl http://localhost:3000/api/v1/health

# Test dividend data
curl "http://localhost:4002/api/positions?symbol=HHIS.TO"

# Test backtesting
curl -X POST http://localhost:3000/api/v1/backtest \
  -H "Content-Type: application/json" \
  -d '{"ticker":"AAPL","timeframe":"1W","quantity":10,"startDate":"2024-01-01","endDate":"2025-07-29"}'
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
- WebSocket (real-time updates)

**Frontend:**
- SolidJS (reactive framework)
- Vite (build tool)
- CSS Variables (theming)
- Chart.js (visualizations)

**Infrastructure:**
- AWS (deployment ready)
- Terraform (IaC)
- Serverless Framework

## 🎯 Deployment

This monorepo is ready for deployment to:
- AWS (Lambda, API Gateway, DynamoDB)
- Vercel/Netlify (Frontend)
- MongoDB Atlas (Database)

See deployment guides in respective directories.

## 📝 Recent Updates

### Repository Consolidation
- ✅ Merged all 4 separate repositories into monorepo
- ✅ Removed submodules (candle-based-backend)
- ✅ Unified version control
- ✅ Simplified deployment process

### Features Added
- ✅ Backtesting Analytics page
- ✅ Dark/Light theme support
- ✅ Improved UI/UX in Frontend-v2
- ✅ WebSocket real-time updates
- ✅ Enhanced dividend tracking

### Bug Fixes
- ✅ Fixed dividend data not syncing to database
- ✅ Fixed incorrect YOC calculation
- ✅ Fixed Portfolio API recalculating dividends
- ✅ Fixed aggregation missing dividend data
- ✅ Fixed search bar UI issues

## 📞 Support

For issues or questions:
1. Check documentation in respective directories
2. Review logs in backend services
3. Verify all services are running on correct ports
4. Check `.env` files are configured correctly

## 📄 License

MIT License - See LICENSE file for details

---

**Repository:** https://github.com/vivekp9991/Questrade-Portfolio-Manager
**Last Updated:** October 24, 2025
**Status:** ✅ Production Ready - Monorepo Consolidated
