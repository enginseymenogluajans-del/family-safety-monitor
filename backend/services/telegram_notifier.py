import httpx
import os
from dotenv import load_dotenv

load_dotenv()

TELEGRAM_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")

async def send_telegram_alert(message: str):
    """Telegram üzerinden anlık uyarı gönderir."""
    if not TELEGRAM_TOKEN or not TELEGRAM_CHAT_ID:
        print("[TELEGRAM] HATA: Token veya Chat ID eksik. Bildirim gönderilemedi.")
        return False
        
    url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
    payload = {
        "chat_id": TELEGRAM_CHAT_ID,
        "text": f"🛡️ **Sessiz Muhafız Uyarısı**\n\n{message}",
        "parse_mode": "Markdown"
    }
    
    try:
        async with httpx.AsyncClient() as client:
            r = await client.post(url, json=payload)
            return r.status_code == 200
    except Exception as e:
        print(f"[TELEGRAM] Gönderim hatası: {e}")
        return False

# Örnek Kullanım Alanları:
# - Riskli Mesaj: "Çocuğunuz [WhatsApp] üzerinden riskli bir kelime yazdı: 'kelime'"
# - Bağlantı: "DİKKAT: WhatsApp Takip Sunucusu Bağlantısı Koptu!"
# - Konum: "Çocuğunuz 'Okul' güvenli bölgesinden ayrıldı!"
