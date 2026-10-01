# Berlin Okey — Telegram Mini App

Bot: [@Berlinokeybot](https://t.me/Berlinokeybot)

## Güvenlik

Bot token'ını asla sohbete, GitHub'a veya ekran görüntüsüne koyma.  
Token sızdıysa [@BotFather](https://t.me/BotFather) → `/revoke` ile yenile ve `.env` içindeki `BOT_TOKEN`'ı güncelle.

## Kurulum

1. Bağımlılıklar
   ```bash
   npm install
   ```

2. `.env` dosyasını kontrol et
   ```env
   BOT_TOKEN=...
   BOT_USERNAME=Berlinokeybot
   WEBAPP_URL=https://SENIN-HTTPS-URLIN.com
   PORT=3000
   ```

3. Sunucuyu başlat
   ```bash
   npm start
   ```

## Mini App'in çalışması için HTTPS şart

Telegram WebView yalnızca **HTTPS** URL açar.

### Yerel test (ngrok)

```bash
npm start
ngrok http 3000
```

Çıkan `https://xxxx.ngrok-free.app` adresini `.env` → `WEBAPP_URL` yap, sunucuyu yeniden başlat.

### Canlı yayın (Render / Railway / benzeri)

1. Repoyu deploy et (`npm start`, Node 18+)
2. Environment variables ekle: `BOT_TOKEN`, `WEBAPP_URL` (deploy URL'in)
3. Deploy URL'inin `https://` olduğundan emin ol
4. Telegram'da `@Berlinokeybot` → `/start` → **Oyna**

## BotFather (isteğe bağlı)

BotFather'da da Web App bağlayabilirsin:

1. `/mybots` → Berlinokeybot → **Bot Settings** → **Menu Button**
2. URL: `WEBAPP_URL` ile aynı adres

Sunucu açılınca menü butonu API ile de otomatik ayarlanır.

## Oynanış

1. Telegram'da bota `/start`
2. **Oyna** → Mini App açılır
3. İsim (Telegram'dan otomatik), avatar, istaka, mod seç
4. 4 kişi dolunca el başlar

## Notlar

- Tek ortak oda (`MAIN`) — aynı anda bir masa
- Tarayıcıdan da `http://localhost:3000` ile test edilebilir
- Socket.IO WebSocket kullanır; reverse proxy'de WS desteklenmeli
