# Minimal Diff Fix Skill

Sadece hatalı satırı değiştir. Dosyayı yeniden yazma, kapsam genişletme.

## Kullanım

`/minimal-diff-fix` komutunu çalıştırarak aktif edersin.

## Kurallar

### Değişiklik Disiplini

1. Değiştireceğin dosyayı oku.
2. Sadece hata olan satırı/bloğu tespit et.
3. `Edit` (str_replace) kullan — dosyayı baştan yazma.
4. Çevre kodu, yorum satırları, boşluklar dokunulmaz kalmalı.

### Neyi Yapma

- Var olmayan bir sorunu düzeltme.
- Kullanıcının söylemediği dosyaları açma veya değiştirme.
- Hata düzeltirken refactor yapma.
- Tek satır değişiklik için tüm fonksiyonu yeniden yazma.

### Doğrulama Adımları

1. Değişiklik öncesi: mevcut kodu 3 satır context ile göster.
2. Değişiklik sonrası: sadece değişen satırı göster.
3. Yan etki yok mu kontrol et — aynı fonksiyon/class başka yerde kullanılıyor mu?

### Kapsam Kontrolü

Kullanıcı şunu istedi mi kontrol et:

- [ ] Bu dosya mı, yoksa başka bir dosya mı?
- [ ] Bu satır gerçekten hatalı mı, yoksa sadece farklı mı?
- [ ] Düzeltme istenmiyor, sadece açıklama mı isteniyor?

Emin değilsen sormadan önce düzeltme yapma.
