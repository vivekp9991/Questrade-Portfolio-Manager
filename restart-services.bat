@echo off
echo Restarting all services...
echo.

REM Stop all services
call stop-services.bat

echo.
echo Waiting 3 seconds before restarting...
timeout /t 3 /nobreak >nul

echo.
echo Starting services...
npm run dev

pause
