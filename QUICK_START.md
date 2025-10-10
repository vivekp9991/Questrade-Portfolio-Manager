# 🚀 Quick Start Guide

## Start Everything with One Command

```bash
cd d:\Project\3
npm run dev
```

That's it! This single command will start:
- ✅ **Auth API** (Port 4001)
- ✅ **Sync API** (Port 4002)
- ✅ **Portfolio API** (Port 4003)
- ✅ **Market API** (Port 4004)
- ✅ **Frontend UI** (Port 5173)

## Access Your Application

🌐 **Frontend:** http://localhost:5173

## First Time Setup

### 1. Install Dependencies

```bash
cd d:\Project\3
npm install
npm run install:all
```

### 2. Configure Environment Variables

Make sure each microservice has a `.env` file:
- `Backend/questrade-portfolio-microservices/questrade-auth-api/.env`
- `Backend/questrade-portfolio-microservices/questrade-sync-api/.env`
- `Backend/questrade-portfolio-microservices/questrade-portfolio-api/.env`
- `Backend/questrade-portfolio-microservices/questrade-market-api/.env`

And frontend:
- `Frontend/dividend-portfolio-manager/.env`

### 3. Sync Dividend Data (First Time)

```bash
npm run sync:dividends
```

## Daily Usage

### Start Everything
```bash
npm run dev
```

### Start Only Backend
```bash
npm run backend:only
```

### Start Only Frontend
```bash
npm run frontend:only
```

### Sync Dividends
```bash
# All stocks
npm run sync:dividends

# Specific person
npm run sync:dividends:person Vivek

# Specific stock
npm run sync:dividends:symbol HHIS.TO
```

## Health Check

```bash
npm run test:backend
```

Should show healthy responses from all 4 backend services.

## Ports

| Service | Port | URL |
|---------|------|-----|
| Auth API | 4001 | http://localhost:4001 |
| Sync API | 4002 | http://localhost:4002 |
| Portfolio API | 4003 | http://localhost:4003 |
| Market API | 4004 | http://localhost:4004 |
| Frontend | 5173 | http://localhost:5173 |

## Stopping Services

Press `Ctrl+C` in the terminal where `npm run dev` is running. This will stop all services.

## Troubleshooting

### Port Already in Use

If you get port conflicts, find and kill existing processes:

**Windows:**
```bash
netstat -ano | findstr :4001
netstat -ano | findstr :4002
netstat -ano | findstr :4003
netstat -ano | findstr :5173
taskkill /PID <PID> /F
```

**Linux/Mac:**
```bash
lsof -i :4001
kill -9 <PID>
```

### MongoDB Connection Error

Make sure MongoDB is running:
```bash
# Windows
net start MongoDB

# Linux/Mac
sudo systemctl start mongodb
```

### Frontend Not Loading

1. Check backend is running: `npm run test:backend`
2. Check frontend .env has correct API URLs
3. Check browser console for errors

## Next Steps

- [Complete Setup Guide](COMPLETE_SETUP_GUIDE.md) - Detailed documentation
- [README](README.md) - Full project overview
- [Dividend Sync Guide](Backend/questrade-portfolio-microservices/questrade-sync-api/DIVIDEND_SYNC_GUIDE.md) - Dividend management

---

**Happy tracking!** 📈💰
