@echo off
echo Stopping all Node.js services...
echo.

REM Kill all node.exe processes
taskkill /F /IM node.exe /T 2>nul

if %errorlevel% equ 0 (
    echo Services stopped successfully!
) else (
    echo No Node.js services were running.
)

echo.
echo Press any key to exit...
pause >nul
