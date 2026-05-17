#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
WA_DIR="$SCRIPT_DIR/whatsapp-agent"
WEBRTC_DIR="$SCRIPT_DIR/WebRTC/server"
FRONTEND_DIR="$SCRIPT_DIR/frontend-react"

echo "=== Aile Güvenliği Paneli ==="
echo ""

# .env kontrol
if [ ! -f "$BACKEND_DIR/.env" ]; then
  echo "[!] backend/.env bulunamadı."
  echo "    cp backend/.env.example backend/.env  # sonra düzenle"
  exit 1
fi

cleanup() {
  echo ""
  echo "[*] Tüm servisler durduruluyor..."
  kill "$PID_BACKEND" "$PID_WA" "$PID_WEBRTC" 2>/dev/null || true
  wait "$PID_BACKEND" "$PID_WA" "$PID_WEBRTC" 2>/dev/null || true
  echo "[*] Çıkış."
}
trap cleanup INT TERM

# 1. Python backend
echo "[1/3] Python backend başlatılıyor (port 8000)..."
pip install -q -r "$BACKEND_DIR/requirements.txt"
cd "$BACKEND_DIR"
uvicorn main:app --host 127.0.0.1 --port 8000 --reload &
PID_BACKEND=$!
cd "$SCRIPT_DIR"

# 2. WhatsApp Agent
echo "[2/3] WhatsApp Agent başlatılıyor (port 3001)..."
if [ ! -d "$WA_DIR/node_modules" ]; then
  echo "    npm install çalıştırılıyor..."
  cd "$WA_DIR" && npm install --silent && cd "$SCRIPT_DIR"
fi
if [ ! -f "$WA_DIR/.env" ]; then
  cp "$WA_DIR/.env.example" "$WA_DIR/.env"
fi
cd "$WA_DIR" && node index.js &
PID_WA=$!
cd "$SCRIPT_DIR"

# 3. WebRTC Signaling Server
echo "[3/3] WebRTC Signaling Server başlatılıyor (port 8001)..."
if [ ! -d "$WEBRTC_DIR/node_modules" ]; then
  echo "    npm install çalıştırılıyor..."
  cd "$WEBRTC_DIR" && npm install --silent && cd "$SCRIPT_DIR"
fi
cd "$WEBRTC_DIR" && WEBRTC_PORT=8001 node server.js &
PID_WEBRTC=$!
cd "$SCRIPT_DIR"

echo ""
echo "┌─────────────────────────────────────────────────────┐"
echo "│  Servis              URL                             │"
echo "│  ──────────────────  ────────────────────────────── │"
echo "│  Python Backend      http://localhost:8000           │"
echo "│  API Docs            http://localhost:8000/docs      │"
echo "│  WhatsApp Agent      http://localhost:3001/health    │"
echo "│  WebRTC Signaling    http://localhost:8001           │"
echo "└─────────────────────────────────────────────────────┘"
echo ""
echo "  Frontend geliştirme sunucusu için ayrı terminalde:"
echo "    cd frontend-react && npm run dev"
echo ""
echo "  WhatsApp bağlamak için terminal çıktısındaki QR kodu tarayın."
echo "  Durdurmak için: Ctrl+C"
echo ""

wait
