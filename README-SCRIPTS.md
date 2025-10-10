# Service Management Scripts

This document explains how to start, stop, and restart your Questrade Portfolio microservices.

## Quick Reference

### Using NPM Scripts (Recommended)

```bash
# Start all services (Backend + Frontend)
npm run dev

# Start backend only
npm run backend:only

# Start frontend only
npm run frontend:only

# Stop all Node.js services
npm run stop

# Restart all services
npm run restart

# Restart backend only
npm run restart:backend

# Restart frontend only
npm run restart:frontend
```

### Using Batch Scripts (Windows)

```bash
# Stop all services
stop-services.bat

# Restart all services
restart-services.bat
```

### Using PowerShell Script (Advanced - More Targeted)

```powershell
# Stop only Questrade-related services
.\stop-services.ps1
```

## Service Ports

- **Auth API**: http://localhost:4001
- **Sync API**: http://localhost:4002
- **Portfolio API**: http://localhost:4003
- **Market API**: http://localhost:4004
- **Frontend**: http://localhost:5000

## Detailed Descriptions

### `npm run dev`
Starts all backend microservices (4 services) and the frontend in development mode with hot-reload enabled.

### `npm run stop`
Kills all running Node.js processes. **Warning**: This will stop ALL Node.js processes on your system, not just Questrade services.

### `npm run restart`
Stops all services, waits 2 seconds, then restarts everything in development mode.

### `stop-services.ps1` (PowerShell)
A more intelligent script that:
- Only stops Node.js processes related to Questrade/portfolio projects
- Checks and frees specific ports (4001-4004, 5000, 5173)
- Provides detailed output about what it's stopping

**Usage**:
```powershell
powershell -ExecutionPolicy Bypass -File .\stop-services.ps1
```

### `stop-services.bat` (Batch)
Simple Windows batch script that kills all Node.js processes.

**Usage**:
```cmd
stop-services.bat
```

### `restart-services.bat` (Batch)
Stops all services and automatically restarts them.

**Usage**:
```cmd
restart-services.bat
```

## Checking Service Health

Test if all backend services are running:
```bash
npm run test:backend
```

This will make health check requests to all 4 microservices.

## Troubleshooting

### Port Already in Use
If you get "port already in use" errors:

1. **Option 1**: Run the stop script
   ```bash
   npm run stop
   ```

2. **Option 2**: Find and kill the specific process
   ```powershell
   # Find what's using port 4001 (replace with your port)
   netstat -ano | findstr :4001

   # Kill the process (replace PID with the number from above)
   taskkill /F /PID <PID>
   ```

3. **Option 3**: Use the PowerShell script for targeted cleanup
   ```powershell
   .\stop-services.ps1
   ```

### Services Won't Stop
If `npm run stop` doesn't work:

1. Open Task Manager (Ctrl + Shift + Esc)
2. Find all "Node.js" processes
3. Right-click → End Task

Or use PowerShell as Administrator:
```powershell
Get-Process -Name node | Stop-Process -Force
```

## Best Practices

1. **Always stop services properly** before making code changes that affect startup
2. **Use `npm run restart`** instead of manually stopping and starting
3. **Check health endpoints** after restart to ensure all services are up
4. **Use the PowerShell script** if you have other Node.js projects running that you don't want to affect

## Individual Service Control

To start/stop individual microservices, navigate to their directory:

```bash
# Start individual service
cd Backend/questrade-portfolio-microservices/questrade-auth-api
npm run dev

# Stop: Press Ctrl+C in the terminal running the service
```

## Environment Setup

Before starting services for the first time:

```bash
# Install all dependencies
npm run install:all

# Set up your environment variables in each service's .env file
```
