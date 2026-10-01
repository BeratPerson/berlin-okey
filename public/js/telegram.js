/**
 * Berlin Okey — Telegram Mini App yardımcıları (telefon)
 */
(function (global) {
    const tg = global.Telegram && global.Telegram.WebApp;

    function isTelegram() {
        return !!(tg && tg.initData);
    }

    function fitPhoneLayout() {
        const root = document.documentElement;
        const w = Math.min(window.innerWidth, screen.width || window.innerWidth);
        const h = Math.min(window.innerHeight, window.visualViewport ? window.visualViewport.height : window.innerHeight);

        // Istaka: 13 taş * 50px + yan butonlar (~100px) + çek/at (~100px)
        const sideChrome = 188;
        const usable = Math.max(200, w - sideChrome);
        const scale = Math.min(0.72, Math.max(0.38, usable / (13 * 50)));

        root.style.setProperty('--rack-scale', String(scale));
        // İki sıra + padding
        const cueH = Math.round(50 * scale * 2 + 28);
        root.style.setProperty('--cue-height', cueH + 'px');

        document.body.classList.add('phone-layout');
        document.body.classList.toggle('landscape-phone', w > h && h < 520);
        document.body.classList.toggle('portrait-phone', h >= w);
    }

    function init() {
        fitPhoneLayout();
        window.addEventListener('resize', fitPhoneLayout);
        window.addEventListener('orientationchange', () => setTimeout(fitPhoneLayout, 120));
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', fitPhoneLayout);
        }

        if (!tg) {
            document.body.classList.add('phone-layout');
            return null;
        }

        tg.ready();
        tg.expand();

        try {
            if (typeof tg.requestFullscreen === 'function') {
                tg.requestFullscreen();
            }
        } catch (_) { /* destek yok */ }

        try {
            if (typeof tg.disableVerticalSwipes === 'function') {
                tg.disableVerticalSwipes();
            }
        } catch (_) { /* eski istemciler */ }

        try {
            if (typeof tg.lockOrientation === 'function') {
                // Telefon okey: dikey de yatay da çalışır; kilitleme yok
            }
        } catch (_) {}

        if (tg.themeParams) {
            const root = document.documentElement;
            if (tg.themeParams.bg_color) root.style.setProperty('--tg-bg', tg.themeParams.bg_color);
            if (tg.themeParams.button_color) root.style.setProperty('--tg-button', tg.themeParams.button_color);
            if (tg.themeParams.text_color) root.style.setProperty('--tg-text', tg.themeParams.text_color);
        }

        try { if (tg.setHeaderColor) tg.setHeaderColor('#0c2d4a'); } catch (_) {}
        try { if (tg.setBackgroundColor) tg.setBackgroundColor('#081828'); } catch (_) {}

        document.body.classList.add('telegram-mini-app', 'phone-layout');
        setTimeout(fitPhoneLayout, 50);
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
        close,
        fitPhoneLayout
    };
})(window);
