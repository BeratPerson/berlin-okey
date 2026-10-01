// Berlin Okey - Ana Sayfa (oda oluştur / 6 haneli koda katıl)
const socket = (window.BerlinSocket && BerlinSocket.create)
    ? BerlinSocket.create()
    : io({ transports: ['websocket', 'polling'], reconnection: true });

socket.on('connect', () => {
    console.log('Socket connected:', socket.id);
});

socket.on('reconnect', () => {
    console.log('Socket reconnected:', socket.id);
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
const quickMatchBtn = document.getElementById('quickMatchBtn');
const capacityLine = document.getElementById('capacityLine');
const teamModeToggle = document.getElementById('teamModeToggle');
const stackingModeToggle = document.getElementById('stackingModeToggle');
const penaltyModeToggle = document.getElementById('penaltyModeToggle');
const profilePreviewName = document.getElementById('profilePreviewName');
const profilePreviewImg = document.getElementById('profilePreviewImg');
const profilePreviewInitial = document.getElementById('profilePreviewInitial');

let playerName = '';
let selectedAvatar = '';
let selectedIstaka = 'istaka.jpg';
let telegramUserId = null;
let telegramPhotoUrl = null;
let telegramLocked = false;

function getInitial(name) {
    const t = (name || 'O').trim();
    return (t.charAt(0) || 'O').toUpperCase();
}

function refreshProfilePreview() {
    const name = playerName
        || (playerNameInput && playerNameInput.value.trim())
        || 'Oyuncu';
    if (profilePreviewName) profilePreviewName.textContent = name;
    if (profilePreviewInitial) profilePreviewInitial.textContent = getInitial(name);

    const photo = telegramPhotoUrl
        || (telegramUserId ? `/api/avatar/${telegramUserId}` : '')
        || selectedAvatar;

    if (profilePreviewImg && photo) {
        profilePreviewImg.onload = () => {
            profilePreviewImg.classList.remove('hidden');
            if (profilePreviewInitial) profilePreviewInitial.classList.add('hidden');
        };
        profilePreviewImg.onerror = () => {
            profilePreviewImg.classList.add('hidden');
            if (profilePreviewInitial) profilePreviewInitial.classList.remove('hidden');
        };
        profilePreviewImg.src = photo;
        profilePreviewImg.alt = name;
    } else if (profilePreviewImg) {
        profilePreviewImg.classList.add('hidden');
        if (profilePreviewInitial) profilePreviewInitial.classList.remove('hidden');
    }
}

function lockTelegramIdentity(tgUser) {
    telegramLocked = true;
    telegramUserId = tgUser.id;
    telegramPhotoUrl = tgUser.photoUrl || null;
    playerName = tgUser.name;
    if (telegramPhotoUrl) selectedAvatar = telegramPhotoUrl;
    else if (telegramUserId) selectedAvatar = `/api/avatar/${telegramUserId}`;

    const nameBox = document.getElementById('nameInputContainer');
    if (nameBox) nameBox.classList.add('hidden');
    if (playerNameInput) {
        playerNameInput.value = playerName;
        playerNameInput.readOnly = true;
        playerNameInput.disabled = true;
    }

    sessionStorage.setItem('okeyPlayerId', playerName);
    sessionStorage.setItem('playerName', playerName);
    localStorage.setItem('okeyPlayerName', playerName);
    sessionStorage.setItem('telegramUserId', String(tgUser.id));
    if (telegramPhotoUrl) sessionStorage.setItem('telegramPhotoUrl', telegramPhotoUrl);
}

function resolvePlayerName() {
    // Telegram varsa her zaman onun ismi
    if (telegramLocked && playerName) {
        sessionStorage.setItem('okeyPlayerId', playerName);
        sessionStorage.setItem('playerName', playerName);
        localStorage.setItem('okeyPlayerName', playerName);
        return playerName;
    }

    const inputName = playerNameInput ? playerNameInput.value.trim() : '';
    if (inputName) {
        playerName = inputName;
        localStorage.setItem('okeyPlayerName', playerName);
    } else {
        playerName = sessionStorage.getItem('okeyPlayerId')
            || sessionStorage.getItem('playerName')
            || generatePlayerId();
    }
    sessionStorage.setItem('playerName', playerName);
    sessionStorage.setItem('okeyPlayerId', playerName);
    return playerName;
}

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

if (playerNameInput) {
    playerNameInput.addEventListener('input', refreshProfilePreview);
}

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

function saveSelections() {
    if (selectedAvatar) localStorage.setItem('okeyPlayerAvatar', selectedAvatar);
    localStorage.setItem('okeyPlayerIstaka', selectedIstaka);
    sessionStorage.setItem('selectedIstaka', selectedIstaka);
    if (telegramUserId) sessionStorage.setItem('telegramUserId', String(telegramUserId));
    if (telegramPhotoUrl) sessionStorage.setItem('telegramPhotoUrl', telegramPhotoUrl);
}

function emitJoin({ createRoom, roomCode, quickMatch }) {
    resolvePlayerName();
    saveSelections();
    playSound('click');
    if (window.BerlinTelegram) BerlinTelegram.haptic('light');

    const avatar = telegramPhotoUrl
        || (telegramUserId ? `/api/avatar/${telegramUserId}` : '')
        || selectedAvatar
        || '';

    socket.emit('joinGame', {
        playerName,
        createRoom: !!createRoom,
        quickMatch: !!quickMatch,
        roomCode: roomCode || undefined,
        teamMode: teamModeToggle ? teamModeToggle.checked : false,
        stackingMode: stackingModeToggle ? stackingModeToggle.checked : false,
        penaltyMode: penaltyModeToggle ? penaltyModeToggle.checked : false,
        avatar,
        photoUrl: telegramPhotoUrl || undefined,
        telegramUserId
    });
}

function updateCapacityUI(cap) {
    if (!capacityLine || !cap) return;
    const players = cap.players ?? 0;
    const max = cap.maxPlayers ?? 100;
    capacityLine.textContent = `Çevrimiçi: ${players}/${max}`;
    capacityLine.classList.toggle('capacity-full', !!cap.full);
}

async function fetchCapacity() {
    try {
        const res = await fetch('/api/capacity', { cache: 'no-store' });
        if (!res.ok) return;
        updateCapacityUI(await res.json());
    } catch (_) { /* ignore */ }
}

document.addEventListener('DOMContentLoaded', () => {
    if (window.BerlinTelegram) {
        BerlinTelegram.init();
        const tgUser = BerlinTelegram.getUser();
        if (tgUser) {
            lockTelegramIdentity(tgUser);
        }
    }

    if (!telegramLocked) {
        const savedName = localStorage.getItem('okeyPlayerName');
        if (savedName && savedName.trim()) {
            playerName = savedName;
            if (playerNameInput) playerNameInput.value = savedName;
        } else {
            let savedId = sessionStorage.getItem('okeyPlayerId') || sessionStorage.getItem('playerName');
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

        const savedTg = sessionStorage.getItem('telegramUserId');
        if (savedTg) telegramUserId = savedTg;
        telegramPhotoUrl = sessionStorage.getItem('telegramPhotoUrl') || null;
    }

    const savedIstaka = localStorage.getItem('okeyPlayerIstaka');
    if (savedIstaka) {
        selectedIstaka = savedIstaka;
        istakaOptions.forEach(o => {
            o.classList.toggle('selected', o.dataset.istaka === savedIstaka);
        });
    }

    refreshProfilePreview();
    fetchCapacity();
    setInterval(fetchCapacity, 15000);

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

if (quickMatchBtn) {
    quickMatchBtn.addEventListener('click', () => emitJoin({ quickMatch: true }));
}

if (createRoomBtn) {
    createRoomBtn.addEventListener('click', () => emitJoin({ createRoom: true }));
}

if (joinRoomBtn) {
    joinRoomBtn.addEventListener('click', () => {
        const code = (roomCodeInput.value || '').replace(/\D/g, '');
        if (code.length !== 6) {
            showError('Oda kodu 6 basamaklı olmalı!');
            return;
        }
        emitJoin({ createRoom: false, roomCode: code });
    });
}

if (roomCodeInput) {
    roomCodeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && joinRoomBtn) joinRoomBtn.click();
    });
}

socket.on('capacityUpdate', (cap) => updateCapacityUI(cap));

socket.on('joinedGame', (data) => {
    playSound('success');
    if (window.BerlinTelegram) BerlinTelegram.haptic('success');
    if (data.capacity) updateCapacityUI(data.capacity);

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
    showError(data.message || 'Bir hata oluştu');
    if (window.BerlinTelegram) BerlinTelegram.haptic('error');
});

function showError(message) {
    if (!errorToast) return;
    const toastMessage = errorToast.querySelector('.toast-message');
    if (toastMessage) toastMessage.textContent = message;
    errorToast.classList.remove('hidden');
    setTimeout(() => errorToast.classList.add('hidden'), 3000);
}
