# 🚀 Anthropic Hızlı Başvuru & NotebookLM Tasarruf Rehberi

Bu dosya, hem terminalinizde çalışan **Claude Code (`claude` CLI)** hem de **Antigravity** için ortak bir kılavuz görevi görür. Kod yazarken ve prompt hazırlarken token harcamamızı **%80 oranında azaltmak** için en kritik kuralları içerir.

---

## 📚 Bölüm 1: Google NotebookLM Kaynak Listesi

Google NotebookLM'in web tarayıcısı, GitHub'ın `/tree/master/...` gibi derin alt klasör yollarını tararken hata verebilir. Bu sorunu aşmak için aşağıdaki **iki kolay ve kusursuz yöntemden birini** kullanabilirsiniz:

### Yöntem A: Doğrudan Depo URL'lerini Ekleme (En Pratik Yol)
NotebookLM'e kaynak eklerken aşağıdaki basitleştirilmiş ana bağlantıları **"Link/URL"** seçeneğiyle ekleyin. Tarayıcı bu bağlantıları başarıyla tarayacaktır:

1. **Anthropic Kurslar Ana Deposu (Tüm Prompt & API Kursları):**
   `https://github.com/anthropics/courses`
2. **Anthropic Resmi Kod Tarif Kitabı (Cookbook - Ajan Şablonları):**
   `https://github.com/anthropics/anthropic-cookbook`
3. **Claude Resmi Prompt Geliştirme Dokümantasyonu:**
   `https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview`

---

### Yöntem B: Depoları ZIP Olarak Yükleme (En Kusursuz Yol - Önerilen)
Web tarama sorunlarını %100 aşmak ve tüm dersleri/örnek kodları tam metin olarak NotebookLM'e öğretmek için:

1. Aşağıdaki bağlantılara tıklayarak depoları bilgisayarınıza **ZIP olarak indirin**:
   * [Courses Deposu (ZIP İndir)](https://github.com/anthropics/courses/archive/refs/heads/master.zip)
   * [Cookbook Deposu (ZIP İndir)](https://github.com/anthropics/anthropic-cookbook/archive/refs/heads/main.zip)
2. İndirdiğiniz ZIP dosyalarını klasöre çıkarın.
3. NotebookLM'de kaynak ekleme menüsünden **"Dosya Yükleme (Dosyalar)"** seçeneğini seçin.
4. Klasörlerin içindeki `.md` (Markdown) ve `.txt` dosyalarını doğrudan NotebookLM'e yükleyin. Bu dosyalar ham metin olduğu için NotebookLM hepsini anında okur ve kusursuz hafızaya alır.

> 💡 **Nasıl Kullanılır?** NotebookLM'e *"Uygulama geliştirirken veya web sitesi yaparken yüklediğim kaynaklardaki en iyi prompt veya kod şablonlarını bana çıkar"* diyebilir ve aldığınız nokta atışı kodları doğrudan bize verebilirsiniz.

---

## ⚡ Bölüm 2: Altın Prompt Mühendisliği Kuralları (Hafif Yerel Kart)

Claude modelleri ile çalışırken en iyi sonucu en az token ile almak için kullanılan altın standartlar:

### 1. XML Etiketleri (XML Tags) Kullanımı
Claude, XML etiketlerini (`<kod>`, `<talimat>`, `<veri>`) okumak üzere optimize edilmiştir.
* **Kural:** Girdilerinizi, değişkenlerinizi veya kod parçalarını mutlaka XML etiketleri içine alın.
* **Örnek:**
  ```markdown
  Lütfen aşağıdaki kod parçasını incele:
  <hedef_kod>
  const x = 5;
  </hedef_kod>
  ```

### 2. Düşünce Zinciri (Chain of Thought - CoT)
Karmaşık işlemlerde Claude'a analiz yaptırmak mantık hatalarını sıfıra indirir.
* **Kural:** Claude'dan cevabı vermeden önce düşünmesini isteyin.
* **Örnek:** `"Önce <dusunce_asamasi> etiketleri içinde adım adım analiz et, ardından sonucu ver."`

### 3. Değişken ve Şablon Yapısı (System Prompting)
* **Kural:** Rol tanımlamalarını her zaman sistem seviyesinde (System Prompt) yapın. Claude'a bir kişilik vermek performansını katlar.
* **Örnek:** `"Sen Google DeepMind standartlarında çalışan kıdemli bir React ve Python geliştiricisisin."`

---

## 💻 Bölüm 3: Claude Code & Antigravity Kodlama Disiplini

Proje geliştirirken token tasarrufunu maksimuma çıkarmak için bizim uymavamız gereken kurallar:

1. **Plan Modu:** Değişiklik yapmadan önce her zaman en fazla 3 satırlık bir plan sunulur ve onay alınır (Gereksiz dosya okuma ve yazma işlemlerini engeller).
2. **Minimal-Diff Fixes:** Kod dosyalarının tamamı yeniden yazılmaz; sadece değiştirilecek satırlar hedef alınarak minimal kod farkları uygulanır.
3. **Gereksiz Okumaları Engelleme:** Daha önce okunan dosyalar aynı oturumda tekrar okunmaz. Token harcamasını önlemek için sadece değiştirilecek hedef dosyaya odaklanılır.

---

*Bu kılavuz, projenin token ekonomisini korurken en üst düzey yapay zeka gücünü kullanmanızı sağlar.*
