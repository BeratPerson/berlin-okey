// Berlin Okey - Ana Sayfa (Telegram Mini App uyumlu)
const socket = io({
    transports: ['websocket', 'polling']
});

socket.on('connect', () => {
    console.log('Socket connected:', socket.id);
});

socket.on('connect_error', (err) => {
    console.error('Socket connection error:', err);
    showError('Sunucuyla bağlantı kurulamadı! Lütfen sayfayı yenileyin.');
});

// DOM Elementleri
const nameSection = document.getElementById('nameSection');
const playerNameInput = document.getElementById('playerNameInput');
const errorToast = document.getElementById('errorToast');
const joinGameBtn = document.getElementById('joinGameBtn');
const teamModeToggle = document.getElementById('teamModeToggle');
const stackingModeToggle = document.getElementById('stackingModeToggle');
const penaltyModeToggle = document.getElementById('penaltyModeToggle');
const tgUserBadge = document.getElementById('tgUserBadge');

let playerName = '';
let selectedAvatar = 'alibicim.png';
let selectedIstaka = 'istaka.jpg';
let telegramUserId = null;

// Avatar seçimi
const avatarOptions = document.querySelectorAll('.avatar-option');
avatarOptions.forEach(option => {
    option.addEventListener('click', () => {
        avatarOptions.forEach(o => o.classList.remove('selected'));
        option.classList.add('selected');
        selectedAvatar = option.dataset.avatar;
        playSound('click');
        if (window.BerlinTelegram) BerlinTelegram.haptic('light');
    });
});

// Istaka renk seçimi
const istakaOptions = document.querySelectorAll('.istaka-option');
istakaOptions.forEach(option => {
    option.addEventListener('click', () => {
        istakaOptions.forEach(o => o.classList.remove('selected'));
        option.classList.add('selected');
        selectedIstaka = option.dataset.istaka;
        playSound('click');
        if (window.BerlinTelegram) BerlinTelegram.haptic('light');
    });
});

// Ses efektleri
function playSound(type) {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;

        const audioContext = new AudioContext();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        switch (type) {
            case 'click':
                oscillator.frequency.value = 800;
                gainNode.gain.value = 0.1;
                oscillator.type = 'sine';
                break;
            case 'join':
                oscillator.frequency.value = 600;
                gainNode.gain.value = 0.15;
                oscillator.type = 'triangle';
                break;
            case 'success':
                oscillator.frequency.value = 1000;
                gainNode.gain.value = 0.1;
                oscillator.type = 'sine';
                break;
        }

        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.1);
    } catch (e) {
        console.warn('Ses çalınamadı:', e);
    }
}

function generatePlayerId() {
    return 'Oyuncu' + Math.floor(Math.random() * 9000 + 1000);
}

document.addEventListener('DOMContentLoaded', () => {
    // Telegram Mini App
    if (window.BerlinTelegram) {
        BerlinTelegram.init();
        const tgUser = BerlinTelegram.getUser();
        if (tgUser) {
            telegramUserId = tgUser.id;
            playerName = tgUser.name;
            if (playerNameInput) {
                playerNameInput.value = playerName;
                playerNameInput.placeholder = 'Telegram ismin';
            }
            if (tgUserBadge) {
                tgUserBadge.textContent = tgUser.username
                    ? `@${tgUser.username} olarak oynuyorsun`
                    : `${tgUser.firstName} olarak oynuyorsun`;
                tgUserBadge.classList.remove('hidden');
            }
            sessionStorage.setItem('okeyPlayerId', playerName);
            sessionStorage.setItem('telegramUserId', String(tgUser.id));
        }
    }

    const savedAvatar = localStorage.getItem('okeyPlayerAvatar');
    const savedName = localStorage.getItem('okeyPlayerName');

    if (!playerName) {
        if (savedName && savedName.trim()) {
            playerName = savedName;
            if (playerNameInput) playerNameInput.value = savedName;
        } else {
            let savedId = sessionStorage.getItem('okeyPlayerId');
            if (!savedId) {
                playerName = generatePlayerId();
                sessionStorage.setItem('okeyPlayerId', playerName);
            } else {
                playerName = savedId;
            }
            if (playerNameInput && !playerNameInput.value) {
                playerNameInput.value = playerName;
            }
        }
    }

    if (savedAvatar) {
        selectedAvatar = savedAvatar;
        avatarOptions.forEach(o => {
            o.classList.remove('selected');
            if (o.dataset.avatar === savedAvatar) {
                o.classList.add('selected');
            }
        });
    }

    const savedIstaka = localStorage.getItem('okeyPlayerIstaka');
    if (savedIstaka) {
        selectedIstaka = savedIstaka;
        istakaOptions.forEach(o => {
            o.classList.remove('selected');
            if (o.dataset.istaka === savedIstaka) {
                o.classList.add('selected');
            }
        });
    }
});

joinGameBtn.addEventListener('click', () => {
    playSound('click');
    if (window.BerlinTelegram) BerlinTelegram.haptic('light');

    const inputName = playerNameInput ? playerNameInput.value.trim() : '';
    if (inputName) {
        playerName = inputName;
        localStorage.setItem('okeyPlayerName', playerName);
    } else {
        playerName = sessionStorage.getItem('okeyPlayerId') || generatePlayerId();
    }

    localStorage.setItem('okeyPlayerAvatar', selectedAvatar);
    localStorage.setItem('okeyPlayerIstaka', selectedIstaka);
    sessionStorage.setItem('selectedIstaka', selectedIstaka);

    const teamMode = teamModeToggle ? teamModeToggle.checked : false;
    const stackingMode = stackingModeToggle ? stackingModeToggle.checked : false;
    const penaltyMode = penaltyModeToggle ? penaltyModeToggle.checked : false;

    socket.emit('joinGame', {
        playerName,
        teamMode,
        stackingMode,
        penaltyMode,
        avatar: selectedAvatar,
        telegramUserId
    });
});

socket.on('joinedGame', (data) => {
    playSound('success');
    if (window.BerlinTelegram) BerlinTelegram.haptic('success');

    sessionStorage.setItem('lobbyData', JSON.stringify({
        roomCode: 'MAIN',
        teamMode: data.teamMode,
        players: data.players,
        playerName: playerName,
        isHost: false
    }));
    sessionStorage.setItem('playerName', playerName);

    window.location.href = '/game';
});

socket.on('gameStarted', (data) => {
    sessionStorage.setItem('gameData', JSON.stringify(data));
    sessionStorage.setItem('playerName', playerName);
    window.location.href = '/game';
});

socket.on('error', (data) => {
    showError(data.message);
    if (window.BerlinTelegram) BerlinTelegram.haptic('error');
});

function showError(message) {
    const toastMessage = errorToast.querySelector('.toast-message');
    toastMessage.textContent = message;
    errorToast.classList.remove('hidden');

    setTimeout(() => {
        errorToast.classList.add('hidden');
    }, 3000);
}
