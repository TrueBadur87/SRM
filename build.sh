#!/bin/bash
set -e

echo "================================"
echo "Building Frontend"
echo "================================"

echo ""
echo "Installing frontend dependencies..."
cd frontend
npm install

echo ""
echo "Building frontend..."
npm run build

echo ""
echo "Build complete! Frontend is ready in frontend/dist/"
