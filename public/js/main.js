// Berlin Okey - Ana Sayfa (oda oluştur / 6 haneli koda katıl)
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

const playerNameInput = document.getElementById('playerNameInput');
const roomCodeInput = document.getElementById('roomCodeInput');
const errorToast = document.getElementById('errorToast');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const teamModeToggle = document.getElementById('teamModeToggle');
const stackingModeToggle = document.getElementById('stackingModeToggle');
const penaltyModeToggle = document.getElementById('penaltyModeToggle');
const tgUserBadge = document.getElementById('tgUserBadge');

let playerName = '';
let selectedAvatar = 'alibicim.png';
let selectedIstaka = 'istaka.jpg';
let telegramUserId = null;

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

if (roomCodeInput) {
    roomCodeInput.addEventListener('input', () => {
        roomCodeInput.value = roomCodeInput.value.replace(/\D/g, '').slice(0, 6);
    });
}

function playSound(type) {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const audioContext = new AudioContext();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.frequency.value = type === 'success' ? 1000 : 800;
        gainNode.gain.value = 0.1;
        oscillator.type = 'sine';
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.1);
    } catch (e) { /* ignore */ }
}

function generatePlayerId() {
    return 'Oyuncu' + Math.floor(Math.random() * 9000 + 1000);
}

function resolvePlayerName() {
    const inputName = playerNameInput ? playerNameInput.value.trim() : '';
    if (inputName) {
        playerName = inputName;
        localStorage.setItem('okeyPlayerName', playerName);
    } else {
        playerName = sessionStorage.getItem('okeyPlayerId') || generatePlayerId();
    }
    return playerName;
}

function saveSelections() {
    localStorage.setItem('okeyPlayerAvatar', selectedAvatar);
    localStorage.setItem('okeyPlayerIstaka', selectedIstaka);
    sessionStorage.setItem('selectedIstaka', selectedIstaka);
}

function emitJoin({ createRoom, roomCode }) {
    resolvePlayerName();
    saveSelections();
    playSound('click');
    if (window.BerlinTelegram) BerlinTelegram.haptic('light');

    socket.emit('joinGame', {
        playerName,
        createRoom: !!createRoom,
        roomCode: roomCode || undefined,
        teamMode: teamModeToggle ? teamModeToggle.checked : false,
        stackingMode: stackingModeToggle ? stackingModeToggle.checked : false,
        penaltyMode: penaltyModeToggle ? penaltyModeToggle.checked : false,
        avatar: selectedAvatar,
        telegramUserId
    });
}

document.addEventListener('DOMContentLoaded', () => {
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
            if (o.dataset.avatar === savedAvatar) o.classList.add('selected');
        });
    }

    const savedIstaka = localStorage.getItem('okeyPlayerIstaka');
    if (savedIstaka) {
        selectedIstaka = savedIstaka;
        istakaOptions.forEach(o => {
            o.classList.remove('selected');
            if (o.dataset.istaka === savedIstaka) o.classList.add('selected');
        });
    }

    // Deep link / Telegram start_param: ?room=123456
    const urlParams = new URLSearchParams(window.location.search);
    let roomFromUrl = urlParams.get('room');
    if (!roomFromUrl && window.BerlinTelegram && BerlinTelegram.tg) {
        const startParam = BerlinTelegram.tg.initDataUnsafe && BerlinTelegram.tg.initDataUnsafe.start_param;
        if (startParam && /^\d{6}$/.test(startParam)) {
            roomFromUrl = startParam;
        }
    }
    if (roomFromUrl && /^\d{6}$/.test(roomFromUrl) && roomCodeInput) {
        roomCodeInput.value = roomFromUrl;
    }
});

createRoomBtn.addEventListener('click', () => {
    emitJoin({ createRoom: true });
});

joinRoomBtn.addEventListener('click', () => {
    const code = (roomCodeInput.value || '').replace(/\D/g, '');
    if (code.length !== 6) {
        showError('Oda kodu 6 basamaklı olmalı!');
        return;
    }
    emitJoin({ createRoom: false, roomCode: code });
});

roomCodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') joinRoomBtn.click();
});

socket.on('joinedGame', (data) => {
    playSound('success');
    if (window.BerlinTelegram) BerlinTelegram.haptic('success');

    sessionStorage.setItem('lobbyData', JSON.stringify({
        roomCode: data.roomCode,
        teamMode: data.teamMode,
        players: data.players,
        playerName: playerName,
        isHost: true
    }));
    sessionStorage.setItem('playerName', playerName);
    sessionStorage.setItem('roomCode', data.roomCode);

    window.location.href = '/game?room=' + encodeURIComponent(data.roomCode);
});

socket.on('gameStarted', (data) => {
    sessionStorage.setItem('gameData', JSON.stringify(data));
    sessionStorage.setItem('playerName', playerName);
    if (data.roomCode) sessionStorage.setItem('roomCode', data.roomCode);
    window.location.href = '/game?room=' + encodeURIComponent(data.roomCode || '');
});

socket.on('error', (data) => {
    showError(data.message);
    if (window.BerlinTelegram) BerlinTelegram.haptic('error');
});

function showError(message) {
    const toastMessage = errorToast.querySelector('.toast-message');
    toastMessage.textContent = message;
    errorToast.classList.remove('hidden');
    setTimeout(() => errorToast.classList.add('hidden'), 3000);
}
