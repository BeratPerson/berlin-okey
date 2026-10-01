/**
 * Berlin Okey — Telegram Bot + Mini App launcher
 * /start → Web App butonu ile oyunu açar
 */

const Logger = require('./logger');

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = (process.env.WEBAPP_URL || '').replace(/\/$/, '');
const BOT_USERNAME = process.env.BOT_USERNAME || 'Berlinokeybot';

let bot = null;
let polling = false;

async function telegramApi(method, body = {}) {
    if (!BOT_TOKEN) throw new Error('BOT_TOKEN tanımlı değil');
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!data.ok) {
        throw new Error(`Telegram API ${method}: ${data.description || 'hata'}`);
    }
    return data.result;
}

function buildStartKeyboard() {
    if (!WEBAPP_URL) {
        return {
            keyboard: [[{ text: '⚙️ WEBAPP_URL ayarla' }]],
            resize_keyboard: true
        };
    }
    return {
        keyboard: [[{ text: '🎴 Oyna', web_app: { url: WEBAPP_URL } }]],
        resize_keyboard: true
    };
}

function buildStartMessage() {
    if (!WEBAPP_URL) {
        return (
            `🎴 *Berlin Okey*\n\n` +
            `Bot hazır, ama Mini App URL henüz ayarlanmamış.\n\n` +
            `1. Uygulamayı HTTPS ile yayınla (Render / Railway / ngrok)\n` +
            `2. \`.env\` içine \`WEBAPP_URL=https://...\` yaz\n` +
            `3. Sunucuyu yeniden başlat\n\n` +
            `Bot: @${BOT_USERNAME}`
        );
    }
    return (
        `🎴 *Berlin Okey*\n\n` +
        `4 arkadaşınla gerçek zamanlı 101 Okey!\n\n` +
        `Aşağıdaki *Oyna* butonuna basarak Mini App'i aç.\n\n` +
        `_Takım · Katlamalı · Cezalı modlar desteklenir._`
    );
}

async function handleUpdate(update) {
    const msg = update.message;
    if (!msg || !msg.text) return;

    const text = msg.text.trim();
    const chatId = msg.chat.id;

    if (text.startsWith('/start') || text === '🎴 Oyna' || text === '⚙️ WEBAPP_URL ayarla') {
        await telegramApi('sendMessage', {
            chat_id: chatId,
            text: buildStartMessage(),
            parse_mode: 'Markdown',
            reply_markup: buildStartKeyboard()
        });
        return;
    }

    if (text.startsWith('/help')) {
        await telegramApi('sendMessage', {
            chat_id: chatId,
            text:
                `*Berlin Okey Yardım*\n\n` +
                `/start — Oyunu aç\n` +
                `/help — Bu mesaj\n\n` +
                `Mini App Telegram içinde açılır; 4 oyuncu dolunca el başlar.`,
            parse_mode: 'Markdown',
            reply_markup: buildStartKeyboard()
        });
    }
}

async function setupMenuButton() {
    if (!WEBAPP_URL) {
        Logger.warn('WEBAPP_URL yok — menü butonu atlandı');
        return;
    }

    await telegramApi('setChatMenuButton', {
        menu_button: {
            type: 'web_app',
            text: 'Oyna',
            web_app: { url: WEBAPP_URL }
        }
    });
    Logger.success(`Telegram menü butonu ayarlandı → ${WEBAPP_URL}`);
}

async function pollUpdates(offset = 0) {
    if (!polling) return;
    try {
        const updates = await telegramApi('getUpdates', {
            offset,
            timeout: 30,
            allowed_updates: ['message']
        });

        let nextOffset = offset;
        for (const update of updates) {
            nextOffset = update.update_id + 1;
            try {
                await handleUpdate(update);
            } catch (err) {
                Logger.error(`Update işlenemedi: ${err.message}`);
            }
        }
        setImmediate(() => pollUpdates(nextOffset));
    } catch (err) {
        Logger.error(`Telegram polling: ${err.message}`);
        setTimeout(() => pollUpdates(offset), 3000);
    }
}

async function startTelegramBot() {
    if (!BOT_TOKEN) {
        Logger.warn('BOT_TOKEN yok — Telegram bot başlatılmadı');
        return null;
    }

    try {
        const me = await telegramApi('getMe');
        Logger.success(`Telegram bot aktif: @${me.username} (${me.first_name})`);

        // Eski webhook varsa temizle (polling için)
        await telegramApi('deleteWebhook', { drop_pending_updates: false });

        await setupMenuButton();

        polling = true;
        pollUpdates(0);
        bot = { username: me.username, stop };

        return bot;
    } catch (err) {
        Logger.error(`Telegram bot başlatılamadı: ${err.message}`);
        return null;
    }
}

function stop() {
    polling = false;
}

module.exports = {
    startTelegramBot,
    stopTelegramBot: stop,
    setupMenuButton,
    WEBAPP_URL,
    BOT_USERNAME
};
