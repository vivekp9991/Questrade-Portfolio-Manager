# 📋 Commands Reference

All commands should be run from the project root: `d:\Project\3\`

## 🚀 Main Commands

### Start Everything
```bash
npm run dev
```
Starts all 4 backend microservices + frontend in one command with color-coded output.

### Production Mode
```bash
npm start
```
Starts all services in production mode.

---

## 🔧 Individual Services

### Backend Only
```bash
npm run backend:only
```
Starts all 4 backend microservices (Auth, Sync, Portfolio, Market).

### Frontend Only
```bash
npm run frontend:only
```
Starts only the SolidJS frontend on port 5173.

---

## 💾 Installation

### Install All Dependencies
```bash
npm run install:all
```
Installs dependencies for:
- Root project (concurrently)
- All 4 backend microservices
- Frontend

### Install Backend Only
```bash
npm run install:backend
```

### Install Frontend Only
```bash
npm run install:frontend
```

---

## 📊 Dividend Sync

### Sync All Dividend Data
```bash
npm run sync:dividends
```
Syncs dividend data for all positions across all persons.

### Sync Specific Person
```bash
npm run sync:dividends:person Vivek
```
Replace `Vivek` with the person's name.

### Sync Specific Symbol
```bash
npm run sync:dividends:symbol HHIS.TO
```
Replace `HHIS.TO` with the stock symbol.

---

## 🧪 Testing & Health Checks

### Test Backend Health
```bash
npm run test:backend
```
Checks health endpoints for all 4 backend services.

### Test Frontend
```bash
npm run test:frontend
```
Checks if frontend is accessible.

### Manual API Testing
```bash
# Auth API
curl http://localhost:4001/health

# Sync API
curl http://localhost:4002/health
curl http://localhost:4002/api/positions

# Portfolio API
curl http://localhost:4003/health
curl http://localhost:4003/api/portfolio/summary

# Market API
curl http://localhost:4004/health
```

---

## 📁 Backend-Specific Commands

Navigate to backend first:
```bash
cd Backend/questrade-portfolio-microservices
```

### Start All Backend Services (Dev Mode)
```bash
npm run dev
```

### Start Individual Microservices
```bash
npm run dev:auth       # Auth API - Port 4001
npm run dev:sync       # Sync API - Port 4002
npm run dev:portfolio  # Portfolio API - Port 4003
npm run dev:market     # Market API - Port 4004
```

### Stop All Backend Services
```bash
npm run stop
```

---

## 🎨 Frontend-Specific Commands

Navigate to frontend first:
```bash
cd Frontend/dividend-portfolio-manager
```

### Development Server
```bash
npm run dev
```
Starts Vite dev server on port 5173 with hot reload.

### Build for Production
```bash
npm run build
```

### Preview Production Build
```bash
npm run preview
```

---

## 🔄 Sync API Commands

Navigate to sync API:
```bash
cd Backend/questrade-portfolio-microservices/questrade-sync-api
```

### Sync Operations
```bash
# One-time full sync
npm run sync:once

# Sync dividends (all)
npm run sync:dividends

# Sync dividends for person
npm run sync:dividends:person Vivek

# Sync dividends for symbol
npm run sync:dividends:symbol HHIS.TO
```

---

## 🔍 Useful Queries

### Check Positions with Dividends
```bash
curl "http://localhost:4002/api/positions?symbol=HHIS.TO" | jq
```

### Get Portfolio Summary
```bash
curl "http://localhost:4003/api/portfolio/summary?viewMode=all" | jq
```

### Get All Accounts
```bash
curl "http://localhost:4002/api/accounts" | jq
```

### Get Dividend Stocks Only
```bash
curl "http://localhost:4002/api/positions" | jq '.data[] | select(.isDividendStock == true)'
```

### Top 5 by Yield on Cost
```bash
curl "http://localhost:4002/api/positions?aggregated=false" | jq '.data | sort_by(-.dividendData.yieldOnCost) | .[:5] | .[] | {symbol, yoc: .dividendData.yieldOnCost, account: .accountType}'
```

---

## 🛑 Stopping Services

### Stop npm run dev
Press `Ctrl+C` in the terminal where the process is running.

### Kill Specific Port (Windows)
```bash
# Find process on port
netstat -ano | findstr :4002

# Kill process
taskkill /PID <PID> /F
```

### Kill Specific Port (Linux/Mac)
```bash
# Find process
lsof -i :4002

# Kill process
kill -9 <PID>
```

---

## 📊 Project Structure Commands

### List All Microservices
```bash
ls Backend/questrade-portfolio-microservices/
```

### Check All package.json Files
```bash
# Root
cat package.json

# Backend root
cat Backend/questrade-portfolio-microservices/package.json

# Individual services
cat Backend/questrade-portfolio-microservices/questrade-auth-api/package.json
cat Backend/questrade-portfolio-microservices/questrade-sync-api/package.json
cat Backend/questrade-portfolio-microservices/questrade-portfolio-api/package.json
cat Backend/questrade-portfolio-microservices/questrade-market-api/package.json

# Frontend
cat Frontend/dividend-portfolio-manager/package.json
```

---

## 🎯 Quick Reference

| What Do You Want? | Command |
|-------------------|---------|
| Start everything | `npm run dev` |
| Just backend | `npm run backend:only` |
| Just frontend | `npm run frontend:only` |
| Install all deps | `npm run install:all` |
| Sync dividends | `npm run sync:dividends` |
| Health check | `npm run test:backend` |
| View frontend | http://localhost:5173 |

---

## 📚 Documentation

- [Quick Start Guide](QUICK_START.md) - Get up and running fast
- [README](README.md) - Full project overview
- [Complete Setup Guide](COMPLETE_SETUP_GUIDE.md) - Detailed setup
- [Dividend Sync Guide](Backend/questrade-portfolio-microservices/questrade-sync-api/DIVIDEND_SYNC_GUIDE.md)
- [Positions API Docs](Backend/POSITIONS_API_WITH_DIVIDENDS.md)

---

**Last Updated:** October 2025
