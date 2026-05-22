# Phased Execution Skill

Bu skill çok dosyalı, çok fazlı görevlerde tekrar okuma ve kapsam kaymasını önler.

## Kullanım

`/phased-execution` komutunu çalıştırarak aktif edersin.

## Kurallar

### MEMORY.md Yönetimi

1. Görev başlarken `MEMORY.md` dosyası var mı kontrol et.
2. Yoksa oluştur — tamamlanacak dosya/faz listesini yaz.
3. Her dosya/faz tamamlandıktan hemen sonra `MEMORY.md`'ye `[x]` olarak işaretle.
4. Bir sonraki fazda `MEMORY.md`'yi oku — `[x]` olan dosyaları OKUMA, DEĞIŞTIRME.

### Dosya Okuma Disiplini

- Sadece o anda değiştireceğin dosyayı oku.
- Frontend ve backend değişikliklerini aynı anda okuma — birer birer yap.
- `context.md` veya `CLAUDE.md`'yi her turda okuma; sadece `/add` komutuyla istenirse bak.

### Faz Yapısı

```
FAZ N başlarken:
1. MEMORY.md oku
2. [x] işaretli olanları atla
3. Sadece [ ] olanları işle
4. Tamamlayınca [x] yap
5. Özet ver, devam sormadan dur
```

### Örnek MEMORY.md Formatı

```markdown
## Görev: [görev adı]

### Fazlar

- [x] FAZ 1 — backend/main.py güncellendi
- [ ] FAZ 2 — frontend/Views.jsx güncellendi
- [ ] FAZ 3 — AndroidManifest.xml güncellendi

### Tamamlanan Dosyalar

- [x] backend/main.py (2026-05-22)
- [ ] frontend/Views.jsx
```
