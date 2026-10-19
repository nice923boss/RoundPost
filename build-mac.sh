#!/bin/bash
cd "$(dirname "$0")"
echo "========================================"
echo " RoundPost - macOS Build (.dmg)"
echo "========================================"
echo ""
echo "[1/2] Building with electron-vite..."
npx electron-vite build
if [ $? -ne 0 ]; then
    echo ""
    echo "ERROR: electron-vite build failed!"
    exit 1
fi
echo ""
echo "[2/2] Packaging with electron-builder..."
npx --yes electron-builder@26.15.3 --mac
if [ $? -ne 0 ]; then
    echo ""
    echo "ERROR: electron-builder failed!"
    exit 1
fi
echo ""
echo "========================================"
echo " Build complete!"
echo " Output: release/"
echo "========================================"
