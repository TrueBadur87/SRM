@echo off
echo ================================
echo Starting SRM Project
echo ================================

echo.
echo [1/4] Installing frontend dependencies...
cd /d "%~dp0frontend"
call npm install

echo.
echo [2/4] Building frontend...
call npm run build

echo.
echo [3/4] Navigating to backend...
cd /d "%~dp0backend"

echo.
echo [4/4] Starting backend server on port 15000...
.\.venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 15000

pause
