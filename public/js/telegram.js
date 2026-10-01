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
        // Telegram / iOS: screen.width çoğu zaman dikey kısa kenar kalır — viewport kullan
        const vv = window.visualViewport;
        const w = Math.round(vv ? vv.width : window.innerWidth);
        const h = Math.round(vv ? vv.height : window.innerHeight);
        const landscape = w > h;

        document.body.classList.add('phone-layout');
        document.body.classList.toggle('landscape-phone', landscape);
        document.body.classList.toggle('portrait-phone', !landscape);
        root.classList.toggle('landscape-phone', landscape);
        root.classList.toggle('portrait-phone', !landscape);

        const sideChrome = landscape ? 156 : 188;
        const usableW = Math.max(180, w - sideChrome);
        let scale = Math.min(0.72, Math.max(0.34, usableW / (13 * 50)));

        if (landscape) {
            const maxByHeight = Math.max(0.32, (h - 48) / 150);
            scale = Math.min(scale, maxByHeight, 0.46);
        }

        root.style.setProperty('--rack-scale', String(Number(scale.toFixed(3))));
        const cueH = landscape
            ? Math.round(Math.min(h * 0.36, 50 * scale * 2 + 14))
            : Math.round(50 * scale * 2 + 28);
        root.style.setProperty('--cue-height', cueH + 'px');
        root.style.setProperty('--vvh', h + 'px');
        root.style.setProperty('--vvw', w + 'px');
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
            fitPhoneLayout();
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

        const displayName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim()
            || (user.username && String(user.username))
            || 'Oyuncu';

        return {
            id: user.id,
            name: String(displayName).slice(0, 15),
            firstName: user.first_name || '',
            lastName: user.last_name || '',
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
