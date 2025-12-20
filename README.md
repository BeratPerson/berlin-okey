# 🎴 101 Okey Online

Modern web teknolojileri ile geliştirilmiş, gerçek zamanlı, çok oyunculu 101 Okey oyunu.

## ✨ Özellikler

### 🎮 Oyun Deneyimi
- **Gerçek Zamanlı Multiplayer:** Socket.IO altyapısı ile 4 oyuncuya kadar anlık oyun
- **Gerçek 101 Okey Kuralları:** 
  - Her oyuncu sağına taş atar, solundan çeker
  - Ölü taş sistemi (yığından çekince soldaki taş ölür)
  - Seri (aynı renk ardışık) ve Per (farklı renk aynı sayı) açma
  - Gösterge ve Okey (joker) sistemi
  - Çift açma desteği
- **Sürükle & Bırak:** Taşları ıstaka üzerinde sürükleyerek istediğiniz sıraya koyun
- **Otomatik Grup Tespiti:** Yan yana dizilen geçerli gruplar otomatik tespit edilir ve renkli kenarlıkla vurgulanır
- **Canlı Puan Gösterimi:** Buton üzerinde anlık puan, 101+ puanda el açma aktif olur

### 🎨 Arayüz
- **Premium Tasarım:** Glassmorphism efektleri, modern gradientler, yumuşak animasyonlar
- **Gerçekçi Istaka:** Ahşap doku, 3D perspektif ile iki sıralı taş rafı
- **Responsive:** Masaüstü, tablet ve mobil cihazlarda çalışır
- **Sprite-based Taşlar:** Gerçek okey taşı görselleri

### 🛠 Teknik Özellikler
- **Node.js + Express + Socket.IO** backend
- **Vanilla JS + CSS** frontend (framework yok)
- **Sunucu Taraflı Doğrulama:** Tüm hamleler sunucuda doğrulanır
- **Yeniden Bağlanma:** Bağlantı kopsa bile oyuna devam edebilme

## 🚀 Kurulum

### Gereksinimler
- [Node.js](https://nodejs.org/) (v14 veya üzeri)

### Adımlar

```bash
# 1. Projeyi klonla
git clone https://github.com/boradmir/online-101-okey-demo.git
cd online-101-okey-demo

# 2. Bağımlılıkları yükle
npm install

# 3. Sunucuyu başlat
node server/index.js

# 4. Tarayıcıda aç
# http://localhost:3000
```

## 📂 Proje Yapısı

```
online-101-okey-demo/
├── public/                  # Frontend dosyaları
│   ├── css/style.css        # Tüm stiller (1500+ satır)
│   ├── js/
│   │   ├── main.js          # Lobi ve giriş ekranı
│   │   └── game.js          # Oyun mantığı (2000+ satır)
│   ├── asset/               # Görseller (taş sprite, avatarlar, ıstaka)
│   ├── index.html           # Ana sayfa / Lobi
│   └── game.html            # Oyun masası
├── server/
│   ├── index.js             # Express sunucusu + Socket.IO
│   ├── gameLogic.js         # Oyun kuralları (750+ satır)
│   └── logger.js            # Renkli konsol loglama
├── package.json
└── README.md
```

## 🎲 Oyun Kuralları

### Temel Akış
1. **Taş Çekme:** Sıra sizdeyken yığından veya solunuzdaki oyuncunun attığı taştan çekersiniz
2. **Taş Atma:** Bir taşı sağınıza atarsınız (sağınızdaki oyuncu çekebilir)
3. **El Açma:** En az 101 puan değerinde seri/per grupları oluşturup açabilirsiniz
4. **Bitirme:** Tüm taşlarınızı açıp son taşı atarak bitirirsiniz

### Ölü Taş Kuralı
Sıradaki oyuncu yığından çekerse, soldaki atık taş "ölür" ve artık çekilemez.

### Grup Türleri
- **Seri:** Aynı renk, ardışık sayılar (örn: 🔵5-6-7-8)
- **Per:** Farklı renk, aynı sayı (örn: 🔴7-🔵7-⚫7)

### Puanlama
| Bitiş Türü | Puan |
|------------|------|
| Normal | -101 |
| Okey ile | -202 |
| Elden | -202 |
| Okey + Elden | -404 |

## 🤝 Katkıda Bulunma

1. Fork'layın
2. Feature branch oluşturun: `git checkout -b feature/YeniOzellik`
3. Commit yapın: `git commit -m 'Yeni özellik eklendi'`
4. Push'layın: `git push origin feature/YeniOzellik`
5. Pull Request açın

## 📄 Lisans

MIT License - Detaylar için `LICENSE` dosyasına bakın.

## 📧 İletişim

- **GitHub:** [@boradmir](https://github.com/boradmir)
