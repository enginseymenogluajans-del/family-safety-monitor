import sqlite3
import json
from datetime import datetime, timedelta

db_path = 'backend/data/family_safety.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Temizlik: Önceki verileri temizle (opsiyonel ama daha temiz olur)
cursor.execute("DELETE FROM profiles")
cursor.execute("DELETE FROM locations")
cursor.execute("DELETE FROM messages")
cursor.execute("DELETE FROM keystrokes")
cursor.execute("DELETE FROM alerts")

# 1. Profile ekle
cursor.execute("INSERT OR REPLACE INTO profiles (id, name, apple_id, has_gmail, connected, requires_2fa, daily_risk_score) VALUES (?, ?, ?, ?, ?, ?, ?)",
               ('default', 'Sessiz Koruma', 'koruma@sessiz.com', 1, 1, 0, 15))

# 2. Örnek Konumlar (İstanbul)
now = datetime.now()
locations = [
    ('default', 41.085, 29.015, 10, 'iPhone 15 Pro', 85, (now - timedelta(minutes=5)).isoformat()),
    ('default', 41.015, 28.975, 15, 'iPhone 15 Pro', 87, (now - timedelta(hours=2)).isoformat()),
    ('default', 40.990, 29.025, 20, 'iPhone 15 Pro', 90, (now - timedelta(hours=4)).isoformat())
]
for loc in locations:
    cursor.execute("INSERT INTO locations (profile_id, latitude, longitude, accuracy, device_name, battery, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)", loc)

# 3. Örnek Mesajlar
# ID formatı: profil-zaman-gönderen-chat
messages = [
    ('default-1-Anne', 'default', 'Anne', '+905321112233', 'Eve geliyorum.', (now - timedelta(minutes=10)).isoformat(), 0, 0, 0, 'none', 0, 'sms'),
    ('default-2-Anne', 'default', 'Anne', '+905321112233', 'Tamam canım.', (now - timedelta(minutes=12)).isoformat(), 0, 0, 1, 'none', 0, 'sms'),
    ('default-3-Arda', 'default', 'Arkadaş Arda', '+905443334455', 'Akşam halı saha var mı?', (now - timedelta(hours=1)).isoformat(), 0, 0, 0, 'none', 0, 'whatsapp'),
    ('default-4-Kripto', 'default', 'Bilinmeyen', '+905009998877', 'Kripto fırsatını kaçırma! link.com', (now - timedelta(hours=3)).isoformat(), 0, 0, 0, 'high', 50, 'sms'),
    ('default-5-Silinen', 'default', 'Gizli Gönderici', '+905550001122', 'Bu mesaj silindi.', (now - timedelta(hours=5)).isoformat(), 1, 1, 0, 'medium', 30, 'whatsapp'),
]
for msg in messages:
    cursor.execute("""INSERT INTO messages 
        (id, profile_id, chat_name, sender, text, timestamp, is_deleted, has_media, is_from_me, risk_level, risk_score, source) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""", msg)

# 4. Klavye Kayıtları
keystrokes = [
    ('default', 'WhatsApp', 'Neredesin?', (now - timedelta(minutes=2)).isoformat()),
    ('default', 'Instagram', 'Bu fotoğraf çok güzel çıkmış', (now - timedelta(minutes=7)).isoformat()),
    ('default', 'Google Search', 'en yakın hastane nerede', (now - timedelta(minutes=15)).isoformat()),
    ('default', 'WhatsApp', 'Tamam, 10 dakikaya oradayım.', (now - timedelta(minutes=20)).isoformat()),
]
for ks in keystrokes:
    cursor.execute("INSERT INTO keystrokes (profile_id, app_name, text, timestamp) VALUES (?, ?, ?, ?)", ks)

# 5. Alarmlar
# ID formatı: profil-alert_id
alerts = [
    ('default-risk_content', 'default', 'high', 'Şüpheli Mesaj', 'Bilinmeyen bir numaradan riskli içerik alındı.', 'SMS', 1),
    ('default-deleted_wa', 'default', 'medium', 'Silinen WhatsApp Mesajı', 'Bir adet medyalı mesaj silindi.', 'WhatsApp', 1),
]
for alt in alerts:
    cursor.execute("INSERT INTO alerts (id, profile_id, level, title, description, source, count) VALUES (?, ?, ?, ?, ?, ?, ?)", alt)

# 6. Uygulama Kullanımı
usage = [
    ('default', 'WhatsApp', 'com.whatsapp', now.strftime('%Y-%m-%d'), 120, 45, 'android'),
    ('default', 'Instagram', 'com.instagram.android', now.strftime('%Y-%m-%d'), 85, 20, 'android'),
    ('default', 'YouTube', 'com.google.android.youtube', now.strftime('%Y-%m-%d'), 200, 10, 'android'),
]
for u in usage:
    cursor.execute("""INSERT INTO app_usage 
        (profile_id, app_name, package, date, minutes, launches, platform) 
        VALUES (?, ?, ?, ?, ?, ?, ?)""", u)

conn.commit()
conn.close()
print("Veritabanı başarıyla gerçekçi TÜRKÇE verilerle dolduruldu.")
