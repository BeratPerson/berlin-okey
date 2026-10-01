# Berlin Okey — Online Telegram Mini App

Bot: [@Berlinokeybot](https://t.me/Berlinokeybot)  
Canlı: [https://berlin-okey.onrender.com](https://berlin-okey.onrender.com)

## Online nasıl oynanır

1. Telegram’da [@Berlinokeybot](https://t.me/Berlinokeybot) aç  
2. `/start` → **Oyna**  
3. **Hızlı Oyna** (veya özel oda / kod)  
4. 4 kişi dolunca masa başlar  

Aynı anda en fazla **100 oyuncu** (~25 masa).

## Render (canlı) ortam değişkenleri

| Key | Değer |
|-----|--------|
| `BOT_TOKEN` | BotFather token |
| `BOT_USERNAME` | `Berlinokeybot` |
| `WEBAPP_URL` | `https://berlin-okey.onrender.com` |
| `ENABLE_TELEGRAM_BOT` | `true` |
| `MAX_PLAYERS` | `100` |
| `MAX_ROOMS` | `40` |

## Lokal geliştirme

```env
BOT_TOKEN=...
BOT_USERNAME=Berlinokeybot
WEBAPP_URL=https://berlin-okey.onrender.com
ENABLE_TELEGRAM_BOT=false
PORT=3000
```

`ENABLE_TELEGRAM_BOT=false` tut — yoksa lokal + Render çift `/start` cevabı verir.

```bash
npm install
npm start
```

Tarayıcı: `http://localhost:3000`

## BotFather

1. `/mybots` → Berlinokeybot → **Bot Settings** → **Menu Button**  
2. URL: `https://berlin-okey.onrender.com`  

Sunucu açılınca menü butonu API ile de ayarlanır.

## Notlar

- Free Render uyku: ilk açılış 30–60 sn sürebilir  
- Socket.IO WebSocket kullanır  
- Token’ı asla GitHub’a koyma; sızdıysa BotFather → `/revoke`
