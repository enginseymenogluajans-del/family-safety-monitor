# ⚡ SUPABASE REALTIME ENTEGRASYON PLANI

Bu kılavuz, **Sessiz Muhafız** ailesi güvenlik panelinde yer alan canlı özellikleri (Cihaz Bağlantı Durumu, Uzaktan Canlı Kontroller, Canlı GPS Konumu ve Canlı Ekran Görüntüleri) **Supabase Realtime (PostgreSQL CDC & Channels)** altyapısı ile canlandırmak için gereken veri şemasını ve kod şablonlarını içerir.

---

## 📊 1. Supabase PostgreSQL Veri Şeması

Supabase konsolunda (SQL Editor) çalıştırılması gereken SQL tablosu tanımları ve Realtime aktivasyon kodları:

```sql
-- 1. CİHAZ DURUM TABLOSU (device_status)
CREATE TABLE public.device_status (
    profile_id TEXT PRIMARY KEY,
    model TEXT DEFAULT 'Cihaz bulunamadı',
    os_version TEXT DEFAULT 'Bilinmiyor',
    serial_no TEXT DEFAULT '-',
    agent_active BOOLEAN DEFAULT false,
    wa_active BOOLEAN DEFAULT false,
    battery_level INT DEFAULT 100,
    is_charging BOOLEAN DEFAULT false,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. UZAKTAN KONTROL KOMUTLARI TABLOSU (remote_commands)
CREATE TABLE public.remote_commands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id TEXT NOT NULL REFERENCES public.device_status(profile_id) ON DELETE CASCADE,
    command_type TEXT NOT NULL, -- 'lock', 'beep', 'freeze', 'wipe'
    status TEXT DEFAULT 'pending', -- 'pending', 'sent', 'executed', 'failed'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. CANLI EKRAN GÖRÜNTÜLERİ TABLOSU (live_screenshots)
CREATE TABLE public.live_screenshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id TEXT NOT NULL REFERENCES public.device_status(profile_id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. GPS LOG TABLOSU (gps_logs)
CREATE TABLE public.gps_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id TEXT NOT NULL REFERENCES public.device_status(profile_id) ON DELETE CASCADE,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    accuracy DOUBLE PRECISION,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. REALTIME (CDC) AKTİVASYONU
ALTER PUBLICATION supabase_realtime ADD TABLE public.device_status;
ALTER PUBLICATION supabase_realtime ADD TABLE public.remote_commands;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_screenshots;
ALTER PUBLICATION supabase_realtime ADD TABLE public.gps_logs;
```

---

## 🔌 2. React Frontend Entegrasyon Şablonu

### `frontend-react/src/supabaseClient.js`
```javascript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase ortam değişkenleri (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) bulunamadı!");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

### Canlı Durum ve Komut Dinleme Mantığı
```javascript
import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

// 1. Cihaz Durumunu Gerçek Zamanlı Dinleme
export function useDeviceStatus(profileId) {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    // İlk veriyi çek
    supabase
      .from('device_status')
      .select('*')
      .eq('profile_id', profileId)
      .single()
      .then(({ data }) => data && setStatus(data));

    // Değişiklikleri realtime dinle
    const channel = supabase
      .channel(`device-status-${profileId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'device_status', filter: `profile_id=eq.${profileId}` },
        (payload) => setStatus(payload.new)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profileId]);

  return status;
}

// 2. Uzaktan Komut Gönderme
export async function sendRemoteCommand(profileId, commandType) {
  const { data, error } = await supabase
    .from('remote_commands')
    .insert([
      { profile_id: profileId, command_type: commandType, status: 'pending' }
    ]);
  if (error) throw error;
  return data;
}
```

---

## 🐍 3. Python Backend / Cihaz Simülatörü Entegrasyonu

Cihaz ajanı (veya backend servislerimiz) Supabase'deki komutları gerçek zamanlı dinleyerek tepki verir ve cihaz durumunu günceller:

```python
import httpx
from datetime import datetime

# Supabase REST API üzerinden durum güncelleme (API Anahtarları ile)
SUPABASE_URL = "https://your-project.supabase.co"
SUPABASE_KEY = "your-anon-or-service-role-key"

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json"
}

def update_device_heartbeat(profile_id: str, battery: int, is_charging: bool, agent_ok: bool, wa_ok: bool):
    url = f"{SUPABASE_URL}/rest/v1/device_status?profile_id=eq.{profile_id}"
    payload = {
        "profile_id": profile_id,
        "battery_level": battery,
        "is_charging": is_charging,
        "agent_active": agent_ok,
        "wa_active": wa_ok,
        "last_seen": datetime.utcnow().isoformat()
    }
    # upsert işlemi
    headers_with_upsert = {**headers, "Prefer": "resolution=merge-duplicates"}
    r = httpx.post(f"{SUPABASE_URL}/rest/v1/device_status", json=payload, headers=headers_with_upsert)
    return r.status_code
```

---

## 🎯 4. Entegrasyon Sonrası Elde Edeceğimiz Kazanımlar

1. **Sıfır Gecikmeli Komut İletimi:** "Cihazı Kilitle" veya "Ekranı Dondur" butonuna bastığınız anda, PostgreSQL CDC sayesinde komut milisaniyeler içinde hedef cihaza iletilecek.
2. **Canlı GPS Animasyonu:** Çocuk hareket ettikçe haritadaki mavi nokta (resimde görülen coğrafi konum takip dairesi) takılmadan, akıcı bir animasyonla yer değiştirecek.
3. **Canlı Cihaz Kimliği:** Orta paneldeki "Bağlantı bekleniyor" yazıları yerini gerçek zamanlı iPhone model, şarj durumu ve batarya seviyesine bırakacak.
