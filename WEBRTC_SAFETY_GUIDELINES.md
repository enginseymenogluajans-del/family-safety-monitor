# WebRTC Remote Monitoring & Safety Guidelines

Bu belge, "Family Safety Monitor" projesinin uzaktan izleme özelliklerine dair etik ve teknik standartları belirler.

## 1. Şeffaflık ve Kullanıcı Farkındalığı
- **Donanım Göstergeleri:** Uygulama, kamera veya mikrofon kullanımını gizlemeye çalışmaz. Apple iOS ve Android işletim sistemlerinin sunduğu donanımsal bildirim ışıkları (Yeşil ve Turuncu noktalar) her zaman aktif kalacaktır.
- **Gizli Mod Yoktur:** Bu proje bir "spyware" (casus yazılım) değildir. Amacı, kullanıcıların kendi cihazlarına veya izinli aile üyelerine şeffaf bir şekilde uzaktan destek sağlamasıdır.

## 2. Teknik Uygulama
- **WebRTC Protokolü:** Veriler uçtan uca şeffaf bir şekilde WebRTC üzerinden iletilir.
- **İzinler:** Kamera ve Mikrofon erişimi için işletim sisteminden standart kullanıcı izinleri talep edilir.

## 3. Kullanım Amacı
- Ebeveyn denetimi ve yaşlı bakımı için anlık durum kontrolü.
- Kendi ikincil cihazına uzaktan erişim ve yönetim.
- Kayıp veya çalıntı durumunda cihazdan görüntü/ses alarak güvenliği sağlama.

Bu rehber, projenin tüm geliştirme aşamalarında (Yapay Zeka asistanları dahil) temel kural seti olarak kabul edilir.
