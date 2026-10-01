/**
 * Berlin Okey — Telegram Mini App yardımcıları
 */
(function (global) {
    const tg = global.Telegram && global.Telegram.WebApp;

    function isTelegram() {
        return !!(tg && tg.initData);
    }

    function init() {
        if (!tg) return null;

        tg.ready();
        tg.expand();

        try {
            if (typeof tg.disableVerticalSwipes === 'function') {
                tg.disableVerticalSwipes();
            }
        } catch (_) { /* eski istemciler */ }

        // Telegram tema renklerini uygula
        if (tg.themeParams) {
            const root = document.documentElement;
            if (tg.themeParams.bg_color) {
                root.style.setProperty('--tg-bg', tg.themeParams.bg_color);
            }
            if (tg.themeParams.button_color) {
                root.style.setProperty('--tg-button', tg.themeParams.button_color);
            }
            if (tg.themeParams.text_color) {
                root.style.setProperty('--tg-text', tg.themeParams.text_color);
            }
        }

        if (tg.setHeaderColor) {
            try { tg.setHeaderColor('#0f172a'); } catch (_) {}
        }
        if (tg.setBackgroundColor) {
            try { tg.setBackgroundColor('#0f172a'); } catch (_) {}
        }

        document.body.classList.add('telegram-mini-app');
        return tg;
    }

    function getUser() {
        if (!tg) return null;
        const user = tg.initDataUnsafe && tg.initDataUnsafe.user;
        if (!user) return null;

        const name =
            (user.username && String(user.username).slice(0, 15)) ||
            [user.first_name, user.last_name].filter(Boolean).join(' ').slice(0, 15) ||
            'Oyuncu';

        return {
            id: user.id,
            name,
            firstName: user.first_name || '',
            username: user.username || '',
            photoUrl: user.photo_url || null,
            languageCode: user.language_code || 'tr'
        };
    }

    function haptic(type) {
        try {
            if (tg && tg.HapticFeedback) {
                if (type === 'success') tg.HapticFeedback.notificationOccurred('success');
                else if (type === 'error') tg.HapticFeedback.notificationOccurred('error');
                else tg.HapticFeedback.impactOccurred('light');
            }
        } catch (_) {}
    }

    function close() {
        if (tg) tg.close();
    }

    global.BerlinTelegram = {
        tg,
        isTelegram,
        init,
        getUser,
        haptic,
        close
    };
})(window);
