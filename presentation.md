---
title: Family Safety Monitor - Proje Sunumu
author: Geliştirici Ekibi
---

# Family Safety Monitor
## Dijital Aile Güvenliği ve Risk Yönetim Platformu

---

# Projenin Amacı ve Temel Felsefesi

* **Amaç:** Çocukların ve rıza gösteren aile üyelerinin dijital dünyadaki güvenliklerini sağlamak.
* **Risk Yönetimi:** Siber zorbalık, müstehcen içerikler ve riskli iletişimleri erken tespit etmek.
* **Gizlilik ve Etik:** Finansal verileri toplamamak, verileri buluta göndermeden **tamamen yerel ağda (local)** şifreli olarak saklamak.

---

# Sistem Mimarisi ve Teknolojiler

Sistem modern ve çok katmanlı bir yapıda çalışmaktadır:

* **Backend (Veri İşleme):** Python (FastAPI) ile yüksek performanslı API ve risk motoru.
* **Mesajlaşma (WhatsApp Agent):** Node.js ve `whatsapp-web.js` ile bağımsız arka plan servisi.
* **Kullanıcı Arayüzü (Frontend):** Hızlı ve hafif Vanilla JS Dashboard (Tek sayfa mimarisi).
* **Veritabanı:** Bellek içi (In-memory) ve kalıcı SQLite (Local Storage).
* **Bağlantılar:** iCloud API, Gmail OAuth, Yerel iTunes Yedekleri.

---

# Temel Özellikler - 1 (Aktif Modüller)

* **Canlı WhatsApp İzleme:** Anlık mesaj takibi ve *Silinen Mesajları Yakalama* (ZDELETED loglaması).
* **Akıllı İçerik Filtreleme:** Kredi kartı, şifre ve banka verilerini anında redakte etme (sansürleme).
* **Tehlike Sınıflandırması:** Gelen mesajları HIGH, MEDIUM, LOW olarak risk seviyelerine ayırma.
* **Medya ve Dosya Kontrolü:** iCloud fotoğrafları ve Drive içeriklerini analiz etme.

---

# Temel Özellikler - 2 (Aktif Modüller)

* **Konum Takibi ve Geofencing:** Belirlenen "Güvenli Bölgelerden" (Okul, Ev) çıkıldığında e-posta ile otomatik bildirim.
* **Tarayıcı ve Uygulama Analizi:** Safari/Chrome geçmişi ve telefona yüklenen riskli (dating, adult) uygulamaların tespiti.
* **İletişim Kayıtları:** SMS ve arama (gelen/giden/cevapsız) kayıtlarının yerel yedekler üzerinden okunması.
* **Dinamik Risk Skorlaması:** Olay bazlı puanlama ile günlük risk haritası çıkartma (Örn: Gece mesajlaşması +15 Puan).

---

# Silinen Mesajları Yakalama Mimarisi

* **Nasıl Çalışıyor?** Özel Node.js Agent'ı, 3001 portunda bir tarayıcı gibi davranarak WhatsApp'a bağlanır.
* **Anti-Delete Özelliği:** Karşı taraf `Herkesten Sil` komutunu gönderdiğinde (`message_revoke_everyone`), sistem bunu algılar.
* **Veri Koruma:** Mesajın içeriği silinmek yerine sadece "Gönderici tarafından silindi" etiketi ile veritabanında muhafaza edilir.

---

# Gelecek Planları ve Yol Haritası (Roadmap)

* **Android Agent:** Bildirim dinleme (NotificationListener) ile telefon üzerinden offline mesaj yakalama.
* **Gelişmiş Raporlama:** Otomatik haftalık PDF raporlar oluşturma ve ebeveyne iletme.
* **Ekran Görüntüsü ve Anomali:** Şüpheli anlarda otomatik ekran kaydı (Erişilebilirlik servisleri ile) ve gece kullanımı tespitleri.
* **İletişim Haritası:** "Kiminle, ne sıklıkta konuşuluyor?" grafiksel analiz modülü.

---

# Güvenlik ve Şeffaflık İlkeleri

1. **Finansal Güvenlik:** Kart, CVV, OTP veya kripto şifreleri asla kaydedilmez.
2. **Uygulama Kısıtlamaları:** Bankacılık uygulamalarında takip ve ekran kaydı otomatik durdurulur.
3. **Veri Sahipliği:** Hiçbir veri dışarıdaki bir bulut sunucusuna gitmez; cihazda/evdeki sunucuda kalır.
4. **Rıza Önceliği:** Tüm takip işlemleri izlenen kişinin bilgisi ve rızası dahilinde yapılır.

---

# Teşekkürler
**Family Safety Monitor** - Güvenli Dijital Gelecek İçin...
