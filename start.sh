#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "================================"
echo "Starting SRM Project"
echo "================================"

echo ""
echo "[1/4] Installing frontend dependencies..."
cd "$SCRIPT_DIR/frontend"
npm install

echo ""
echo "[2/4] Building frontend..."
npm run build

echo ""
echo "[3/4] Installing backend dependencies..."
cd "$SCRIPT_DIR/backend"
pip install -r requirements.txt

echo ""
echo "[4/4] Starting backend server on port 15000..."
cd "$SCRIPT_DIR/backend"
uvicorn main:app --host 0.0.0.0 --port 15000
