# SecureFamily Windows Launcher (PowerShell)

Write-Host "🚀 SecureFamily Servisleri Baslatiliyor..." -ForegroundColor Cyan

# 1. Backend (Python FastAPI)
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd backend; uvicorn main:app --host 127.0.0.1 --port 8000 --reload" -WindowStyle Normal
Write-Host "[OK] Backend (Port 8000) baslatildi." -ForegroundColor Green

# 2. WhatsApp Agent (Node.js)
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd whatsapp-agent; node index.js" -WindowStyle Normal
Write-Host "[OK] WhatsApp Agent (Port 3001) baslatildi." -ForegroundColor Green

# 3. Sinyallesme Sunucusu (WebRTC)
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd WebRTC/server; node server.js" -WindowStyle Normal
Write-Host "[OK] Sinyallesme Sunucusu (Port 8001) baslatildi." -ForegroundColor Green

# 4. Frontend (Vite)
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd frontend-react; npm run dev" -WindowStyle Normal
Write-Host "[OK] Dashboard Arayuzu baslatildi." -ForegroundColor Green

Write-Host "`n✅ Tum servisler ayri pencerelerde acildi." -ForegroundColor Magenta
Write-Host "WhatsApp Agent penceresindeki QR kodu taramayi unutmayin!" -ForegroundColor Yellow
Write-Host "Kapatmak icin acilan pencereleri kapatabilirsin." -ForegroundColor Gray
