// 101 Okey - Oyun JavaScript
const socket = io();

// Oyun Durumu
let gameState = {
    tiles: [],
    indicator: null,
    okey: null,
    currentPlayer: 0,
    playerIndex: 0,
    players: [],
    teamMode: false,
    scores: {},
    selectedTile: null,
    hasDrawn: false
};

// Sprite sheet koordinatları
const SPRITE_MAP = {
    'Mavi': { row: 4, offset: 0 },
    'Siyah': { row: 3, offset: 0 },
    'Kirmizi': { row: 2, offset: 0 },
    'Yesil': { row: 1, offset: 0 },
    'Sahte': { row: 0, offset: 0 }
};

const TILE_WIDTH = 70;
const TILE_HEIGHT = 100;
const DISPLAY_WIDTH = 50;
const DISPLAY_HEIGHT = 72;

// DOM Elementleri
const playerHandTop = document.getElementById('playerHandTop');
const playerHandBottom = document.getElementById('playerHandBottom');
const cueContainer = document.querySelector('.cue-container');
const drawPile = document.getElementById('drawPile');
const discardPile = document.getElementById('discardPile');
const pileCountCenter = document.getElementById('pileCountCenter');
const pileCount = document.getElementById('pileCount');
const turnIndicator = document.getElementById('turnIndicator');
const currentPlayerName = document.getElementById('currentPlayerName');
const finishBtn = document.getElementById('finishBtn');
const gameEndModal = document.getElementById('gameEndModal');
const gameToast = document.getElementById('gameToast');
const scoreList = document.getElementById('scoreList');

// Ses efektleri - AudioContext Singleton
let audioContext = null;
function getAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioContext;
}

function playSound(type) {
    try {
        const ctx = getAudioContext();
        if (ctx.state === 'suspended') ctx.resume();

        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        switch (type) {
            case 'draw':
                oscillator.frequency.value = 400;
                gainNode.gain.value = 0.1;
                oscillator.type = 'sine';
                break;
            case 'discard':
                oscillator.frequency.value = 300;
                gainNode.gain.value = 0.1;
                oscillator.type = 'triangle';
                break;
            case 'win':
                oscillator.frequency.value = 800;
                gainNode.gain.value = 0.15;
                oscillator.type = 'sine';
                break;
            case 'error':
                oscillator.frequency.value = 200;
                gainNode.gain.value = 0.1;
                oscillator.type = 'square';
                break;
            case 'turn':
                oscillator.frequency.value = 600;
                gainNode.gain.value = 0.08;
                oscillator.type = 'sine';
                break;
        }

        oscillator.start();
        oscillator.stop(ctx.currentTime + 0.15);
    } catch (e) {
        console.warn('Ses çalınamadı:', e);
    }
}

// Sayfa yüklendiğinde
document.addEventListener('DOMContentLoaded', () => {
    // URL'den room parametresini al
    const urlParams = new URLSearchParams(window.location.search);
    const roomFromUrl = urlParams.get('room');

    // SessionStorage'dan verileri al
    const gameData = sessionStorage.getItem('gameData');
    const lobbyData = sessionStorage.getItem('lobbyData');
    const playerName = sessionStorage.getItem('playerName');

    if (gameData) {
        // Oyun zaten başladı, oyunu göster
        const data = JSON.parse(gameData);
        hideLobby();
        initializeGame(data);
    } else if (lobbyData) {
        // Lobide bekleniyor
        const data = JSON.parse(lobbyData);
        showLobby(data);
        connectToLobby(data);
    } else if (roomFromUrl && playerName) {
        // URL'den gelen oda koduna katıl
        const data = {
            roomCode: roomFromUrl,
            playerName: playerName,
            teamMode: false,
            players: [],
            isHost: false
        };
        sessionStorage.setItem('lobbyData', JSON.stringify(data));
        showLobby(data);
        connectToLobby(data);
    } else {
        // Veri yoksa ana sayfaya yönlendir
        window.location.href = '/';
    }
});

// Lobi ekranını göster
function showLobby(data) {
    const lobbyOverlay = document.getElementById('lobbyOverlay');
    const gameContainer = document.getElementById('gameContainer');
    const lobbyRoomCode = document.getElementById('lobbyRoomCode');
    const lobbyTeamBadge = document.getElementById('lobbyTeamBadge');

    lobbyOverlay.classList.remove('hidden');
    gameContainer.classList.add('hidden');

    lobbyRoomCode.textContent = data.roomCode;

    if (data.teamMode) {
        lobbyTeamBadge.classList.remove('hidden');
    }

    updateLobbyPlayers(data.players, data.teamMode);
}

// Lobi ekranını gizle
function hideLobby() {
    const lobbyOverlay = document.getElementById('lobbyOverlay');
    const gameContainer = document.getElementById('gameContainer');

    lobbyOverlay.classList.add('hidden');
    gameContainer.classList.remove('hidden');
}

// Lobi oyuncu listesini güncelle
function updateLobbyPlayers(players, teamMode) {
    const slots = document.querySelectorAll('.lobby-player-slot');
    const playerCount = document.getElementById('lobbyPlayerCount');

    playerCount.textContent = `(${players.length}/4)`;

    // Önce tüm slotları temizle
    slots.forEach(slot => {
        slot.classList.remove('filled', 'team1', 'team2');
        slot.classList.add('empty');
        slot.querySelector('.player-name').textContent = 'Bekleniyor...';
    });

    // Oyuncuları yerleştir
    players.forEach((player, index) => {
        const slot = slots[index];
        if (slot) {
            slot.classList.remove('empty');
            slot.classList.add('filled');
            slot.querySelector('.player-name').textContent = player.name;

            if (teamMode && player.team) {
                slot.classList.add(`team${player.team}`);
            }
        }
    });
}

// Lobiye bağlan
function connectToLobby(data) {
    // Odaya yeniden katıl (sayfa yenilenmiş olabilir)
    socket.emit('rejoinRoom', {
        roomCode: data.roomCode,
        playerName: data.playerName
    });

    // Lobi butonları
    const lobbyCopyBtn = document.getElementById('lobbyCopyBtn');
    const lobbyLeaveBtn = document.getElementById('lobbyLeaveBtn');

    lobbyCopyBtn.onclick = () => {
        navigator.clipboard.writeText(data.roomCode);
        lobbyCopyBtn.innerHTML = '✅ Kopyalandı!';
        setTimeout(() => {
            lobbyCopyBtn.innerHTML = '📋 Kopyala';
        }, 2000);
    };

    lobbyLeaveBtn.onclick = () => {
        sessionStorage.removeItem('lobbyData');
        sessionStorage.removeItem('gameData');
        window.location.href = '/';
    };
}

// Socket lobi olayları
socket.on('playerJoined', (data) => {
    updateLobbyPlayers(data.players, data.teamMode || false);
    playSound('turn');
});

socket.on('playerLeft', (data) => {
    updateLobbyPlayers(data.players, false);
    // Oyun içindeyse oyuncuları güncelle
    if (gameState.players && gameState.players.length > 0) {
        showToast(`${data.playerName} oyundan ayrıldı`, 'error');
    }
});

// Düşen oyuncunun yerine yeni oyuncu geldi
socket.on('playerReplaced', (data) => {
    gameState.players = data.players;
    updatePlayersDisplay();
    showToast(`Yeni oyuncu katıldı: ${data.newPlayerName}`, 'success');
    playSound('turn');
});

socket.on('gameStarted', (data) => {
    // Lobi verilerini temizle
    sessionStorage.removeItem('lobbyData');
    sessionStorage.setItem('gameData', JSON.stringify(data));

    // Lobiyi gizle, oyunu göster
    hideLobby();
    initializeGame(data);

    playSound('win');
});

// Oyunu başlat
function initializeGame(data) {
    gameState.tiles = data.tiles || [];
    gameState.indicator = data.indicator;
    gameState.okey = data.okey;
    gameState.currentPlayer = data.currentPlayer;
    gameState.playerIndex = data.playerIndex;
    gameState.players = data.players;
    gameState.teamMode = data.teamMode;
    gameState.scores = data.scores;
    gameState.hasDrawn = gameState.playerIndex === gameState.currentPlayer;

    // UI güncelle
    updateIndicatorDisplay();
    updatePlayersDisplay();
    updateScoreboard();
    renderPlayerHand();
    updateTurnIndicator();

    // Kalan taş sayısını güncelle
    if (data.pileCount !== undefined) {
        pileCountCenter.textContent = data.pileCount;
        pileCount.textContent = data.pileCount;
    }

    // İlk oyuncu zaten taş çekmiş sayılıyor (22 taş aldı)
    if (gameState.playerIndex === gameState.currentPlayer) {
        gameState.hasDrawn = true;
    }
}

// Gösterge ve Okey gösterimi
function updateIndicatorDisplay() {
    const indicatorTile = document.getElementById('indicatorTile');
    const okeyTile = document.getElementById('okeyTile');

    if (gameState.indicator) {
        indicatorTile.innerHTML = createMiniTileHTML(gameState.indicator);
    }

    if (gameState.okey) {
        okeyTile.innerHTML = createMiniTileHTML(gameState.okey);
    }
}

function createMiniTileHTML(tile) {
    const colorClass = tile.color.toLowerCase();
    return `<span class="mini-tile-inner ${colorClass}">${tile.number}</span>`;
}

// Her oyuncunun atık alanını güncelle
function updateDiscardDisplay(playerIndex, tile) {
    // Oyuncunun ekrandaki konumunu bul
    const relativePos = (playerIndex - gameState.playerIndex + 4) % 4;
    const positionMap = { 0: 'bottom', 1: 'right', 2: 'top', 3: 'left' };
    const position = positionMap[relativePos];

    // Bu oyuncu BİZSEK, attığımız taş sağımıza gidiyor (discardPile = sağ taraf)
    // BAŞKASIYSA, onun atık alanına
    if (relativePos === 0) {
        // Biz attık - sağ tarafa (rightDiscard) göster
        // Şimdilik merkezdeki discardPile'ı kullan
        discardPile.innerHTML = createMiniTileHTML(tile);
    } else {
        // Başka oyuncu attı - onun konumunda göster
        // Şimdilik sadece log
        console.log(`${position} oyuncu taş attı:`, tile);
    }
}

// Solumuzdan çekebileceğimiz taşı göster (önceki oyuncunun attığı)
function updateLeftDiscardDisplay(tile) {
    // Merkezdeki discardPile'ı "çekebileceğimiz" taş olarak kullan
    if (tile) {
        discardPile.innerHTML = createMiniTileHTML(tile);
        discardPile.classList.add('has-tile');
    } else {
        discardPile.innerHTML = '';
        discardPile.classList.remove('has-tile');
    }
}

// Oyuncuları göster
function updatePlayersDisplay() {
    const positions = ['bottom', 'right', 'top', 'left'];
    const displayOrder = [];

    // Oyuncuyu alta koy, diğerlerini saat yönünde sırala
    for (let i = 0; i < 4; i++) {
        const playerPos = (gameState.playerIndex + i) % 4;
        displayOrder.push(playerPos);
    }

    const positionMap = {
        0: 'bottom',
        1: 'right',
        2: 'top',
        3: 'left'
    };

    gameState.players.forEach((player, index) => {
        const relativePos = (index - gameState.playerIndex + 4) % 4;
        const displayPos = positionMap[relativePos];

        const nameEl = document.getElementById(`${displayPos}PlayerName`);
        const countEl = document.getElementById(`${displayPos}TileCount`);
        const infoEl = document.getElementById(`${displayPos}PlayerInfo`);
        const avatarEl = document.getElementById(`${displayPos}PlayerAvatar`);

        if (nameEl) {
            nameEl.textContent = relativePos === 0 ? 'Sen' : player.name;
        }
        if (countEl) {
            countEl.textContent = player.tileCount || (relativePos === 0 ? gameState.tiles.length : 21);
        }
        if (infoEl && gameState.teamMode && player.team) {
            infoEl.classList.add(`team${player.team}`);
        }
        if (avatarEl && player.avatar) {
            avatarEl.src = `asset/avatars/${player.avatar}`;
            avatarEl.style.display = 'block';
        }
    });
}

// Skor tablosunu güncelle
function updateScoreboard() {
    const scoreList = document.getElementById('scoreList');
    if (!scoreList) return;

    scoreList.innerHTML = '';

    if (gameState.teamMode) {
        const scores = gameState.scores;
        scoreList.innerHTML = `
            <div class="stat-row">
                <span class="score-name" style="color: var(--accent)">🟡 Takım 1</span>
                <span class="stat-score ${scores.team1 < 0 ? 'negative' : ''}">${scores.team1 || 0}</span>
            </div>
            <div class="stat-row">
                <span class="score-name" style="color: #a855f7">🟣 Takım 2</span>
                <span class="stat-score ${scores.team2 < 0 ? 'negative' : ''}">${scores.team2 || 0}</span>
            </div>
        `;
    } else {
        gameState.players.forEach(player => {
            const score = gameState.scores[player.name] || 0;
            const row = document.createElement('div');
            row.className = 'stat-row';
            row.innerHTML = `
                <span class="score-name" style="flex:1">${player.name}</span>
                <span class="stat-score ${score < 0 ? 'negative' : ''}">${score}</span>
            `;
            scoreList.appendChild(row);
        });
    }
}

// Oyuncu elini render et (Çift sıralı ıstaka)
function renderPlayerHand() {
    const topRow = document.getElementById('playerHandTop');
    const bottomRow = document.getElementById('playerHandBottom');

    if (topRow) topRow.innerHTML = '';
    if (bottomRow) bottomRow.innerHTML = '';

    // Taşları sıralara dağıt (Maksimum 11 taş üstte)
    // Eğer taş sayısı çoksa veya sürükle bırak yaparken taşın sırasını korumak için
    // basit bir bölme mantığı kullanıyoruz.
    const splitIndex = 11; // Üst sıra kapasitesi

    gameState.tiles.forEach((tile, index) => {
        const tileEl = createTileElement(tile, index);

        if (index < splitIndex) {
            if (topRow) topRow.appendChild(tileEl);
        } else {
            if (bottomRow) bottomRow.appendChild(tileEl);
        }
    });

    // Taş sayısını güncelle
    const countBadge = document.getElementById('bottomTileCount');
    if (countBadge) countBadge.textContent = gameState.tiles.length;

    // Otomatik grup analizi ve puan gösterimi
    const analysis = analyzeHandGroups();
    updateAutoScoreDisplay(analysis);

    // El Aç butonunu güncelle (101+ puan varsa aktif)
    if (openHandBtn && !gameState.hasOpened) {
        if (analysis.totalScore >= 101) {
            openHandBtn.disabled = false;
            openHandBtn.classList.add('ready');
            openHandBtn.textContent = `📖 Aç (${analysis.totalScore}p)`;
        } else {
            openHandBtn.disabled = true;
            openHandBtn.classList.remove('ready');
            openHandBtn.textContent = `📖 El Aç (${analysis.totalScore}/101)`;
        }
    }

    // Bitir butonu kontrolü
    if (finishBtn) {
        finishBtn.disabled = gameState.tiles.length !== 14 || !gameState.hasDrawn || gameState.currentPlayer !== gameState.playerIndex;
    }

    // Istaka zeminlerine de drop event ekle (boş alana bırakma için)
    setupCueDropZones([topRow, bottomRow]);
}

// ============================================
// 🔍 OTOMATİK GRUP TESPİTİ
// ============================================

// Istaka üzerindeki taşları analiz et ve geçerli grupları bul
function analyzeHandGroups() {
    const tiles = gameState.tiles;
    const groups = [];
    let i = 0;

    while (i < tiles.length) {
        // 3+ ardışık taş için geçerli grup ara
        let bestGroup = null;

        // 3'lü ile başla, mümkün olan en uzun grubu bul
        for (let len = 3; len <= tiles.length - i && len <= 13; len++) {
            const groupTiles = tiles.slice(i, i + len);

            if (isValidSequence(groupTiles) || isValidSet(groupTiles)) {
                const indices = [];
                for (let j = i; j < i + len; j++) indices.push(j);

                bestGroup = {
                    startIndex: i,
                    endIndex: i + len - 1,
                    length: len,
                    indices: indices,
                    tiles: groupTiles,
                    score: calculateGroupScoreFromTiles(groupTiles)
                };
            } else {
                // Artık geçerli değilse, en son geçerli olanı kullan
                break;
            }
        }

        if (bestGroup) {
            groups.push(bestGroup);
            i = bestGroup.endIndex + 1; // Bir sonraki taşa geç
        } else {
            i++; // Geçerli grup bulunamadı, sonraki taşa
        }
    }

    // Toplam puanı hesapla
    const totalScore = groups.reduce((sum, g) => sum + g.score, 0);

    return {
        groups: groups,
        totalScore: totalScore,
        isValid: totalScore >= 101
    };
}

// Taş dizisinden puan hesapla (index yerine direkt taşlarla)
function calculateGroupScoreFromTiles(tiles) {
    const nonOkeys = tiles.filter(t => !isOkey(t));
    const okeyCount = tiles.length - nonOkeys.length;

    if (nonOkeys.length === 0) return okeyCount * 11;

    const isSet = nonOkeys.every(t => t.number === nonOkeys[0].number);

    if (isSet) {
        return tiles.length * nonOkeys[0].number;
    } else {
        let score = 0;
        nonOkeys.forEach(t => score += t.number);

        const numbers = nonOkeys.map(t => t.number).sort((a, b) => a - b);
        let lastNum = numbers[numbers.length - 1];

        if (numbers.includes(1) && numbers.includes(13)) {
            lastNum = 14;
        }

        for (let i = 0; i < okeyCount; i++) {
            let val = lastNum + 1 + i;
            if (val > 13) val = val % 13 || 13;
            score += val;
        }

        return score;
    }
}

// Otomatik puan göstergesini güncelle
function updateAutoScoreDisplay(analysis) {
    // Geçerli grupları ıstakada vurgula
    const allTiles = document.querySelectorAll('.cue-row .tile-sprite');
    allTiles.forEach(el => {
        el.classList.remove('in-valid-group');
        el.style.borderColor = '';
    });

    // Grupları farklı renklerle vurgula
    const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];
    analysis.groups.forEach((group, gIdx) => {
        const color = colors[gIdx % colors.length];
        group.indices.forEach(idx => {
            const tileEl = allTiles[idx];
            if (tileEl) {
                tileEl.classList.add('in-valid-group');
                tileEl.style.borderColor = color;
                tileEl.style.borderWidth = '3px';
                tileEl.style.borderStyle = 'solid';
            }
        });
    });
}

// ============================================
// 🔄 DRAG & DROP (Taş Sıralama)
// ============================================

let draggedIndex = null;

function handleDragStart(e, index) {
    draggedIndex = index;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index);
    e.target.classList.add('dragging');
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function handleDrop(e, targetIndex) {
    e.preventDefault();
    e.stopPropagation();

    if (draggedIndex === null || draggedIndex === targetIndex) return;

    moveTile(draggedIndex, targetIndex);
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
    draggedIndex = null;
}

// Taşı bir konumdan diğerine taşı
function moveTile(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;

    const tile = gameState.tiles.splice(fromIndex, 1)[0];

    // Eğer fromIndex < toIndex ise, splice sonrası index bir azalır
    if (fromIndex < toIndex) {
        toIndex--;
    }

    gameState.tiles.splice(toIndex, 0, tile);

    renderPlayerHand();

    // Sunucuya sıralama değişikliğini bildir
    socket.emit('sortTiles', { tiles: gameState.tiles });
}

function setupCueDropZones(rows) {
    rows.forEach(row => {
        if (!row) return;

        row.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        });

        row.addEventListener('drop', (e) => {
            e.preventDefault();
            const targetRow = e.target.closest('.cue-row');
            if (targetRow && draggedIndex !== null) {
                // Eğer doğrudan boş alana bırakıldıysa
                // Üst sıra ise en başa veya 11. sıraya, alt sıra ise sona ekle

                const isTop = targetRow.classList.contains('top-row');

                // Basit mantık: Alt sıraya bırakırsa sona ekle
                // Üst sıraya bırakırsa (boşsa) başa ekle gibi çalışabilir
                // Ama karışıklık olmaması için: Sona ekle

                // Ancak kullanıcı araya girmek istiyorsa tile drop handler çalışır.
                // Burası sadece boş alana bırakınca çalışır.

                let targetIndex = gameState.tiles.length; // Varsayılan: en son

                if (isTop) {
                    // Üst sıranın sonu (11. index civarı)
                    // Ama array düz olduğu için, üst sıraya "sona" eklemek demek
                    // aslında 10. index ile 11. index arasına girmek demek olabilir.
                    // Şimdilik sona ekleme yapalım (alt satıra düşer)
                    // Kullanıcı zaten taş üzerine bırakarak sıralama yapıyor.
                    targetIndex = gameState.tiles.length;
                }

                moveTile(draggedIndex, targetIndex);
            }
        });
    });
}

// Taş elementi oluştur
function createTileElement(tile, index) {
    const tileEl = document.createElement('div');
    tileEl.className = 'tile-sprite';
    tileEl.dataset.index = index;
    tileEl.dataset.tileId = tile.id;

    // Sabit boyutlar - sprite rendering için gerekli
    tileEl.style.width = '70px';
    tileEl.style.height = '100px';
    tileEl.style.backgroundSize = '910px 500px';

    const spriteInfo = SPRITE_MAP[tile.color];

    if (spriteInfo) {
        let xPos = 0;
        let yPos = 0;

        if (tile.isJoker) {
            xPos = 0;
            yPos = 0;
        } else {
            // Her taş 70px genişliğinde (ölçekleme CSS'te yapılıyor)
            xPos = (tile.number - 1) * 70;

            // Satır yüksekliği 100px
            yPos = (4 - spriteInfo.row) * 100;
        }

        tileEl.style.backgroundPosition = `-${xPos}px -${yPos}px`;
    }

    // Okey mi kontrol et
    if (isOkey(tile)) {
        tileEl.classList.add('okey');
    }

    // Click event
    tileEl.addEventListener('click', () => selectTile(index));

    // Drag & Drop
    tileEl.draggable = true;
    tileEl.addEventListener('dragstart', (e) => handleDragStart(e, index));
    tileEl.addEventListener('dragover', handleDragOver);
    tileEl.addEventListener('drop', (e) => handleDrop(e, index));
    tileEl.addEventListener('dragend', handleDragEnd);

    return tileEl;
}

// Okey kontrolü (Okey taşı Joker mi?)
function isOkey(tile) {
    if (!gameState.okey) return false;
    // Sahte okey joker değildir
    if (tile.isFakeJoker) return false;
    // Joker taşı
    return tile.color === gameState.okey.color && tile.number === gameState.okey.number;
}

// Efektif taş değeri (Sahte okey için)
function getEffectiveTile(tile) {
    if (tile.isFakeJoker && gameState.okey) {
        return { ...tile, color: gameState.okey.color, number: gameState.okey.number };
    }
    return tile;
}

// Seri kontrolü
function isValidSequence(tiles) {
    if (tiles.length < 3) return false;

    const effectiveTiles = tiles.map(t => getEffectiveTile(t));
    const nonJokers = effectiveTiles.filter(t => !isOkey(t));

    if (nonJokers.length === 0) return true;

    const color = nonJokers[0].color;
    if (!nonJokers.every(t => t.color === color)) return false;

    const numbers = nonJokers.map(t => t.number).sort((a, b) => a - b);
    const jokerCount = tiles.length - nonJokers.length;

    // 13-1 geçişi kontrolü
    if (numbers.includes(1)) {
        if (checkConsecutive(numbers, jokerCount)) return true;

        const highNumbers = numbers.map(n => n === 1 ? 14 : n).sort((a, b) => a - b);
        return checkConsecutive(highNumbers, jokerCount);
    }

    return checkConsecutive(numbers, jokerCount);
}

function checkConsecutive(numbers, jokerCount) {
    let gaps = 0;
    for (let i = 1; i < numbers.length; i++) {
        const diff = numbers[i] - numbers[i - 1];
        if (diff === 0) return false;
        if (diff > 1) {
            gaps += diff - 1;
        }
    }
    return gaps <= jokerCount;
}

// Per kontrolü
function isValidSet(tiles) {
    if (tiles.length < 3 || tiles.length > 4) return false;

    const effectiveTiles = tiles.map(t => getEffectiveTile(t));
    const nonJokers = effectiveTiles.filter(t => !isOkey(t));

    if (nonJokers.length === 0) return true;

    const number = nonJokers[0].number;
    if (!nonJokers.every(t => t.number === number)) return false;

    const colors = new Set(nonJokers.map(t => t.color));
    return colors.size === nonJokers.length;
}

// Grup skoru hesapla (Akıllı versiyon)
function calculateGroupScore(indices) {
    const rawTiles = indices.map(i => gameState.tiles[i]);
    // Skor hesaplarken de efektif taşları kullanmalıyız (sahte okeyin değeri için)
    const tiles = rawTiles.map(t => getEffectiveTile(t));

    // isOkey(tile) orijinal taşa bakmalı mı? getEffectiveTile ile döne yapıda isFakeJoker korunuyor mu?
    // Evet, spread operator ile korunur. Ancak isOkey(tile) fonksiyonu orijinal tile.isFakeJoker'a bakar.
    // effectiveTile.isFakeJoker hala true olur. Sorun yok.

    // Ama DİKKAT: isOkey fonksiyonu, getEffectiveTile'dan dönen objeyi parametre alırsa..
    // getEffectiveTile, ...tile yapıyor. Yani isFakeJoker property'si kopyalanıyor.
    // isOkey de buna bakıp false dönüyor. Doğru.

    const nonOkeys = tiles.filter(t => !isOkey(t));
    const okeyCount = tiles.length - nonOkeys.length;

    // Sadece okeyler varsa
    if (nonOkeys.length === 0) return okeyCount * 11;

    // Seri mi Per mi?
    const isSet = nonOkeys.every(t => t.number === nonOkeys[0].number);

    if (isSet) {
        return tiles.length * nonOkeys[0].number;
    } else {
        let score = 0;
        nonOkeys.forEach(t => score += t.number);

        const numbers = nonOkeys.map(t => t.number).sort((a, b) => a - b);
        let lastNum = numbers[numbers.length - 1];

        if (numbers.includes(1) && numbers.includes(13)) lastNum = 14;

        for (let i = 0; i < okeyCount; i++) {
            let val = lastNum + 1 + i;
            if (val > 13) val = val % 13;
            // Eğer 1 döndüyse ve aslında 14 olarak hesaplanıyorsa (seri devamı)
            // 101 Okey'de 1, yerine göre değer alır. 12-13-1 serisinde 1'in değeri 1 değildir, 14 müdür?
            // Kurala göre: Perlerde o taşın sayısı. 
            // Serilerde taşın kendi sayı değeri toplanır. 1, 1'dir.
            // ANCAK: 12-13-1 serisinde 1, seriyi tamamladığı için kabul edilir ama puanı 1'dir.
            // 101 Okey puanlama kuralı: Taşların üzerindeki sayıların toplamı. Okey ise yerine geçtiği taşın değeri.
            // Eğer 13-1-2 ise, 1'in değeri 1'dir.
            // Eğer 12-13-1 ise, 1'in değeri 1'dir.
            // O yüzden lastNum mantığı sadece okey'in değerini bulmak için.
            // Okey yerine 1 geçiyorsa, değeri 1'dir.
            // Okey yerine 14 geçiyorsa (13'ten sonra), değeri 1'dir (çünkü taş 1).

            if (val === 14) val = 1; // Okey 1 yerine geçtiyse 1 puandır.
            score += val;
        }

        return score;
    }
}

// Taş seçimi
function selectTile(index) {
    const tiles = document.querySelectorAll('.tile-sprite');

    if (gameState.selectedTile === index) {
        // Aynı taşa tıklandı, seçimi kaldır
        tiles[index].classList.remove('selected');
        gameState.selectedTile = null;
    } else {
        // Önceki seçimi kaldır
        if (gameState.selectedTile !== null && tiles[gameState.selectedTile]) {
            tiles[gameState.selectedTile].classList.remove('selected');
        }

        // Yeni taşı seç
        tiles[index].classList.add('selected');
        gameState.selectedTile = index;
        playSound('draw');
    }
}

// Sıra göstergesini güncelle
function updateTurnIndicator() {
    const isMyTurn = gameState.currentPlayer === gameState.playerIndex;
    const currentPlayer = gameState.players[gameState.currentPlayer];

    currentPlayerName.textContent = isMyTurn ? 'Senin Sıran!' : currentPlayer?.name || '-';
    turnIndicator.classList.toggle('my-turn', isMyTurn);

    // Tüm oyuncu info'larını güncelle
    document.querySelectorAll('.player-info').forEach(el => {
        el.classList.remove('current-turn');
    });

    const positionMap = {
        0: 'bottom',
        1: 'right',
        2: 'top',
        3: 'left'
    };

    const relativePos = (gameState.currentPlayer - gameState.playerIndex + 4) % 4;
    const displayPos = positionMap[relativePos];
    const currentPlayerInfo = document.getElementById(`${displayPos}PlayerInfo`);
    if (currentPlayerInfo) {
        currentPlayerInfo.classList.add('current-turn');
    }

    if (isMyTurn) {
        playSound('turn');
    }
}

// Yığından taş çek
drawPile.addEventListener('click', () => {
    if (gameState.currentPlayer !== gameState.playerIndex) {
        showToast('Sıra sizde değil!', 'error');
        return;
    }

    if (gameState.hasDrawn) {
        showToast('Zaten taş çektiniz!', 'error');
        return;
    }

    socket.emit('drawTile', { fromDiscard: false });
});

// Atılan taştan çek
discardPile.addEventListener('click', () => {
    if (gameState.currentPlayer !== gameState.playerIndex) {
        showToast('Sıra sizde değil!', 'error');
        return;
    }

    if (gameState.hasDrawn) {
        showToast('Zaten taş çektiniz!', 'error');
        return;
    }

    socket.emit('drawTile', { fromDiscard: true });
});

// Taş at (seçili taşı)
document.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
        discardSelectedTile();
    }
});

// Taşa çift tıklayınca at (Istaka üzerinden)
if (cueContainer) {
    cueContainer.addEventListener('dblclick', (e) => {
        const tileEl = e.target.closest('.tile-sprite');
        if (tileEl) {
            const index = parseInt(tileEl.dataset.index);
            discardTile(index);
        }
    });
}

function discardSelectedTile() {
    if (gameState.selectedTile === null) {
        showToast('Önce bir taş seçin!', 'error');
        return;
    }
    discardTile(gameState.selectedTile);
}

function discardTile(index) {
    if (gameState.currentPlayer !== gameState.playerIndex) {
        showToast('Sıra sizde değil!', 'error');
        return;
    }

    if (!gameState.hasDrawn) {
        showToast('Önce taş çekmelisiniz!', 'error');
        return;
    }

    socket.emit('discardTile', { tileIndex: index });
}

// Sıralama butonları kaldırıldı

// Bitir butonu
finishBtn.addEventListener('click', () => {
    socket.emit('finishGame', {});
});

// ============================================
// 📖 EL AÇMA SİSTEMİ
// ============================================

const openHandBtn = document.getElementById('openHandBtn');
const openHandModal = document.getElementById('openHandModal');
const openHandTiles = document.getElementById('openHandTiles');
const selectedGroupsDisplay = document.getElementById('selectedGroupsDisplay');
const selectedScoreEl = document.getElementById('selectedScore');
const scoreProgress = document.getElementById('scoreProgress');
const addGroupBtn = document.getElementById('addGroupBtn');
const confirmOpenBtn = document.getElementById('confirmOpenBtn');
const cancelOpenBtn = document.getElementById('cancelOpenBtn');

let openHandState = {
    selectedIndices: [],    // Şu an seçili taş indeksleri
    groups: [],             // Onaylanmış gruplar [[indices], [indices], ...]
    usedIndices: new Set(), // Kullanılmış taş indeksleri
    totalScore: 0
};

// El aç butonuna tıklama - Artık modal yerine otomatik gruplarla
openHandBtn.addEventListener('click', () => {
    if (gameState.hasOpened) {
        showToast('Zaten el açtınız!', 'error');
        return;
    }

    if (gameState.currentPlayer !== gameState.playerIndex) {
        showToast('Sıra sizde değil!', 'error');
        return;
    }

    // Otomatik analizi kullan
    const analysis = analyzeHandGroups();

    if (analysis.totalScore < 101) {
        showToast(`Yetersiz puan: ${analysis.totalScore}/101. Taşları seri/per oluşturacak şekilde dizin!`, 'error');
        return;
    }

    // Sunucuya gönder
    const groupIndices = analysis.groups.map(g => g.indices);

    socket.emit('openHand', {
        groups: groupIndices,
        score: analysis.totalScore
    });

    playSound('win');
});

// El açma modalını aç
function openOpenHandModal() {
    openHandState = {
        selectedIndices: [],
        groups: [],
        usedIndices: new Set(),
        totalScore: 0
    };

    renderOpenHandTiles();
    updateOpenHandUI();
    openHandModal.classList.remove('hidden');
}

// Seçilebilir taşları render et
function renderOpenHandTiles() {
    openHandTiles.innerHTML = '';

    gameState.tiles.forEach((tile, index) => {
        const tileEl = createTileElement(tile, index);
        tileEl.classList.remove('selected'); // Oyun seçimini kaldır

        // Kullanılmış mı?
        if (openHandState.usedIndices.has(index)) {
            tileEl.classList.add('in-group');
        }

        // Şu an seçili mi?
        if (openHandState.selectedIndices.includes(index)) {
            tileEl.classList.add('selected-for-group');
        }

        tileEl.onclick = () => toggleTileSelection(index);
        openHandTiles.appendChild(tileEl);
    });
}

// Taş seçimini değiştir
function toggleTileSelection(index) {
    if (openHandState.usedIndices.has(index)) return;

    const idx = openHandState.selectedIndices.indexOf(index);
    if (idx === -1) {
        openHandState.selectedIndices.push(index);
    } else {
        openHandState.selectedIndices.splice(idx, 1);
    }

    renderOpenHandTiles();
    updateAddGroupButton();
}

// Grup ekle butonunu güncelle
function updateAddGroupButton() {
    const isValid = validateCurrentGroup();
    addGroupBtn.disabled = !isValid;
}

// Mevcut seçimin geçerli bir grup olup olmadığını kontrol et
function validateCurrentGroup() {
    if (openHandState.selectedIndices.length < 3) return false;

    const tiles = openHandState.selectedIndices.map(i => gameState.tiles[i]);

    // Seri mi?
    if (isValidSequence(tiles)) return true;

    // Per mi?
    if (isValidSet(tiles)) return true;

    return false;
}

// Seri kontrolü
// Seri kontrolü
function isValidSequence(tiles) {
    if (tiles.length < 3) return false;

    const nonJokers = tiles.filter(t => !isOkey(t));
    if (nonJokers.length === 0) return true;

    const color = nonJokers[0].color;
    if (!nonJokers.every(t => t.color === color)) return false;

    const numbers = nonJokers.map(t => t.number).sort((a, b) => a - b);
    const jokerCount = tiles.length - nonJokers.length;

    // 13-1 geçişi kontrolü
    if (numbers.includes(1)) {
        if (checkConsecutive(numbers, jokerCount)) return true;

        // 1'i 14 yapıp kontrol et
        const highNumbers = numbers.map(n => n === 1 ? 14 : n).sort((a, b) => a - b);
        return checkConsecutive(highNumbers, jokerCount);
    }

    return checkConsecutive(numbers, jokerCount);
}

function checkConsecutive(numbers, jokerCount) {
    let gaps = 0;
    for (let i = 1; i < numbers.length; i++) {
        const diff = numbers[i] - numbers[i - 1];
        if (diff === 0) return false;
        if (diff > 1) {
            gaps += diff - 1;
        }
    }
    return gaps <= jokerCount;
}

// Per kontrolü
function isValidSet(tiles) {
    if (tiles.length < 3 || tiles.length > 4) return false;

    const nonJokers = tiles.filter(t => !isOkey(t));
    if (nonJokers.length === 0) return false;

    const number = nonJokers[0].number;
    if (!nonJokers.every(t => t.number === number)) return false;

    const colors = new Set(nonJokers.map(t => t.color));
    return colors.size === nonJokers.length;
}

// Grup skoru hesapla (Akıllı versiyon)
function calculateGroupScore(indices) {
    const tiles = indices.map(i => gameState.tiles[i]);
    const nonOkeys = tiles.filter(t => !isOkey(t));
    const okeyCount = tiles.length - nonOkeys.length;

    // Sadece okeyler varsa (nadir durum ama mümkün)
    if (nonOkeys.length === 0) return okeyCount * 11; // Varsayılan değer

    // Seri mi Per mi?
    const isSet = nonOkeys.every(t => t.number === nonOkeys[0].number);

    if (isSet) {
        // Per ise, okeylerin değeri o sayıdır
        return tiles.length * nonOkeys[0].number;
    } else {
        // Seri ise
        let score = 0;
        nonOkeys.forEach(t => score += t.number);

        // Eksik sayıları veya uçları okey ile doldur
        const numbers = nonOkeys.map(t => t.number).sort((a, b) => a - b);

        // Basit yaklaşım: Okeyler serinin en yüksek sayısından sonrasını tamamlar
        // (Daha karmaşık boşluk doldurma mantığı server'da var ama client için bu yeterli)
        let lastNum = numbers[numbers.length - 1];

        // 13-1 durumu
        if (numbers.includes(1) && numbers.includes(13)) {
            // 1 aslında 14
            lastNum = 14;
        }

        for (let i = 0; i < okeyCount; i++) {
            let val = lastNum + 1 + i;
            if (val > 13) val = val % 13; // 14 -> 1
            score += val;
        }

        return score;
    }
}

// Modal kapatma güvenliği
function safeCloseModals() {
    openHandModal.classList.add('hidden');
    // State'i sıfırla
    openHandState = {
        selectedIndices: [],
        groups: [],
        usedIndices: new Set(),
        totalScore: 0
    };
}

// Grup ekle
addGroupBtn.addEventListener('click', () => {
    if (openHandState.selectedIndices.length < 3) return;

    const score = calculateGroupScore(openHandState.selectedIndices);

    openHandState.groups.push({
        indices: [...openHandState.selectedIndices],
        score: score
    });

    openHandState.selectedIndices.forEach(idx => {
        openHandState.usedIndices.add(idx);
    });

    openHandState.totalScore += score;
    openHandState.selectedIndices = [];

    renderOpenHandTiles();
    updateOpenHandUI();
    playSound('draw');
});

// El açma UI'ını güncelle
function updateOpenHandUI() {
    // Skor göstergesi
    selectedScoreEl.textContent = openHandState.totalScore;

    const progress = Math.min(100, (openHandState.totalScore / 101) * 100);
    scoreProgress.style.width = progress + '%';

    if (openHandState.totalScore >= 101) {
        scoreProgress.classList.add('complete');
        confirmOpenBtn.disabled = false;
    } else {
        scoreProgress.classList.remove('complete');
        confirmOpenBtn.disabled = true;
    }

    // Seçilen grupları göster
    selectedGroupsDisplay.innerHTML = '';

    openHandState.groups.forEach((group, groupIdx) => {
        const groupEl = document.createElement('div');
        groupEl.className = 'selected-group';

        group.indices.forEach(tileIdx => {
            const tile = gameState.tiles[tileIdx];
            const miniTile = document.createElement('div');
            miniTile.className = 'mini-tile';
            miniTile.innerHTML = createMiniTileHTML(tile);
            groupEl.appendChild(miniTile);
        });

        // Puan rozeti
        const scoreBadge = document.createElement('span');
        scoreBadge.className = 'group-score';
        scoreBadge.textContent = group.score;
        groupEl.appendChild(scoreBadge);

        // Silme butonu
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-group';
        removeBtn.textContent = '×';
        removeBtn.onclick = () => removeGroup(groupIdx);
        groupEl.appendChild(removeBtn);

        selectedGroupsDisplay.appendChild(groupEl);
    });

    // Grup ekle butonunu güncelle
    updateAddGroupButton();
}

// Grubu kaldır
function removeGroup(groupIdx) {
    const group = openHandState.groups[groupIdx];

    openHandState.totalScore -= group.score;

    group.indices.forEach(idx => {
        openHandState.usedIndices.delete(idx);
    });

    openHandState.groups.splice(groupIdx, 1);

    renderOpenHandTiles();
    updateOpenHandUI();
}

// El aç onayla
confirmOpenBtn.addEventListener('click', () => {
    if (openHandState.totalScore < 101) return;

    // Sunucuya gönder
    const groupIndices = openHandState.groups.map(g => g.indices);

    socket.emit('openHand', {
        groups: groupIndices,
        score: openHandState.totalScore
    });

    openHandModal.classList.add('hidden');
});

// İptal
cancelOpenBtn.addEventListener('click', () => {
    openHandModal.classList.add('hidden');
});

// Socket: El açma başarılı
socket.on('handOpened', (data) => {
    if (data.playerIndex === gameState.playerIndex) {
        gameState.hasOpened = true;
        openHandBtn.classList.add('opened');
        openHandBtn.textContent = '✅ Açıldı';

        // Sunucudan güncel taş listesini al (index kayması sorununu önler)
        if (data.remainingTiles) {
            gameState.tiles = data.remainingTiles;
        }

        renderPlayerHand();
        showToast(`El açıldı! (${data.score} puan)`, 'info');
    }

    // Oyuncu durumunu güncelle
    if (gameState.players[data.playerIndex]) {
        gameState.players[data.playerIndex].hasOpened = true;
        gameState.players[data.playerIndex].tileCount = data.tileCount;
    }

    updatePlayersDisplay();
    updateOpenedTilesPanel(data);
    playSound('win');
});

// Açılmış taşlar panelini güncelle
function updateOpenedTilesPanel(data) {
    const panel = document.getElementById('openedTilesPanel');
    const list = document.getElementById('openedTilesList');

    if (!data.openedGroups || data.openedGroups.length === 0) return;

    panel.classList.remove('hidden');

    // Yeni grupları ekle
    data.openedGroups.forEach(group => {
        const groupEl = document.createElement('div');
        groupEl.className = 'opened-group';

        group.forEach(tile => {
            const miniTile = document.createElement('div');
            miniTile.className = 'mini-tile';
            miniTile.innerHTML = createMiniTileHTML(tile);
            groupEl.appendChild(miniTile);
        });

        list.appendChild(groupEl);
    });
}

// Yeni el butonu
document.getElementById('newRoundBtn').addEventListener('click', () => {
    gameEndModal.classList.add('hidden');
    gameState.hasOpened = false;
    openHandBtn.classList.remove('opened');
    openHandBtn.textContent = '📖 El Aç';
    socket.emit('newRound');
});

// Socket Olayları
socket.on('tileDrawn', (data) => {
    safeCloseModals(); // Yeni taş geldiğinde modalı kapat (sıralama bozulabilir)
    gameState.tiles.push(data.tile);
    gameState.hasDrawn = true;
    gameState.mustOpenHand = data.mustOpenHand || false;

    renderPlayerHand();
    playSound('draw');

    if (data.mustOpenHand && !gameState.hasOpened) {
        showToast('⚠️ Yerden taş aldınız! El açmak ZORUNLU, yoksa 101 ceza!', 'error');
    } else {
        showToast(data.fromDiscard ? 'Atılandan taş çekildi!' : 'Yığından taş çekildi!', 'info');
    }
});

// Çift açma socket olayı
socket.on('pairsOpened', (data) => {
    if (data.playerIndex === gameState.playerIndex) {
        gameState.hasOpened = true;
        gameState.openType = 'pairs';
        showToast(`Çift açtınız! (${data.pairsCount} çift)`, 'info');
    } else {
        showToast(`${data.playerName} çift açtı! (${data.pairsCount} çift)`, 'info');
    }

    if (gameState.players[data.playerIndex]) {
        gameState.players[data.playerIndex].hasOpened = true;
        gameState.players[data.playerIndex].openType = 'pairs';
        gameState.players[data.playerIndex].tileCount = data.tileCount;
    }

    updatePlayersDisplay();
    playSound('win');
});

// Taş işleme socket olayı
socket.on('groupUpdated', (data) => {
    // Masadaki grupları güncelle
    updateOpenedTilesPanel({
        openedGroups: [data.group.tiles],
        playerIndex: data.playerIndex
    });

    if (data.playerIndex === gameState.playerIndex) {
        // Kendi taş sayımızı güncelle
        gameState.tiles = gameState.tiles.filter((_, idx) =>
            !data.tileIndices || !data.tileIndices.includes(idx)
        );
        renderPlayerHand();
        showToast('Taşlar sete eklendi!', 'info');
    }

    if (gameState.players[data.playerIndex]) {
        gameState.players[data.playerIndex].tileCount = data.playerTileCount;
    }

    updatePlayersDisplay();
    playSound('draw');
});

socket.on('playerDrewTile', (data) => {
    // Diğer oyuncunun taş sayısını güncelle
    if (gameState.players[data.playerIndex]) {
        gameState.players[data.playerIndex].tileCount = data.tileCount;
    }
    updatePlayersDisplay();
});

socket.on('tileDiscarded', (data) => {
    if (data.playerIndex === gameState.playerIndex) {
        // Kendi taşımızı attık - tile.id ile bul ve sil
        const tileIndex = gameState.tiles.findIndex(t => t.id === data.tile.id);
        if (tileIndex !== -1) {
            gameState.tiles.splice(tileIndex, 1);
        }
        gameState.selectedTile = null;
        safeCloseModals(); // Taş atıldığında modalı kapat
    }

    // Atılan taşı atan oyuncunun konumunda göster
    updateDiscardDisplay(data.playerIndex, data.tile);

    // Sıra bizdeyse, solumuzdan çekebileceğimiz taşı göster
    if (data.nextPlayer === gameState.playerIndex && data.leftDiscard) {
        updateLeftDiscardDisplay(data.leftDiscard);
    }

    // Sırayı güncelle
    gameState.currentPlayer = data.nextPlayer;
    gameState.hasDrawn = false;

    // Oyuncu taş sayılarını güncelle
    if (gameState.players[data.playerIndex]) {
        gameState.players[data.playerIndex].tileCount = data.tileCount;
    }

    renderPlayerHand();
    updatePlayersDisplay();
    updateTurnIndicator();
    playSound('discard');
});

socket.on('tilesSorted', (data) => {
    gameState.tiles = data.tiles;
    renderPlayerHand();
});

socket.on('gameFinished', (data) => {
    playSound('win');

    // Skorları güncelle
    gameState.scores = data.scores;
    updateScoreboard();

    // Modal göster
    const winnerText = document.getElementById('winnerText');
    const finalScores = document.getElementById('finalScores');

    const isWinner = data.winner === gameState.playerIndex;
    winnerText.textContent = isWinner ? '🎉 Kazandın!' : `🏆 ${data.winnerName} Kazandı!`;

    // Puanları göster
    let scoresHTML = '<div class="round-scores">';

    if (data.teamMode) {
        const team1Points = data.points[0] + data.points[2];
        const team2Points = data.points[1] + data.points[3];
        scoresHTML += `
            <div class="score-row">
                <span>Takım 1</span>
                <span class="${team1Points >= 0 ? 'positive' : 'negative'}">${team1Points >= 0 ? '+' : ''}${team1Points}</span>
            </div>
            <div class="score-row">
                <span>Takım 2</span>
                <span class="${team2Points >= 0 ? 'positive' : 'negative'}">${team2Points >= 0 ? '+' : ''}${team2Points}</span>
            </div>
        `;
    } else {
        data.points.forEach((points, i) => {
            const player = gameState.players[i];
            scoresHTML += `
                <div class="score-row">
                    <span>${player?.name || 'Oyuncu'}</span>
                    <span class="${points >= 0 ? 'positive' : 'negative'}">${points >= 0 ? '+' : ''}${points}</span>
                </div>
            `;
        });
    }

    scoresHTML += '</div>';
    finalScores.innerHTML = scoresHTML;

    gameEndModal.classList.remove('hidden');
});

socket.on('gameStarted', (data) => {
    // Yeni el başladı
    initializeGame(data);
    gameEndModal.classList.add('hidden');
    showToast('Yeni el başladı!', 'info');
});

socket.on('playerLeft', (data) => {
    showToast(`${data.playerName} oyundan ayrıldı!`, 'error');
});

socket.on('error', (data) => {
    showToast(data.message, 'error');
    playSound('error');
});

// Yardımcı fonksiyonlar
function showToast(message, type = 'info') {
    const toastIcon = gameToast.querySelector('.toast-icon');
    const toastMessage = gameToast.querySelector('.toast-message');

    toastIcon.textContent = type === 'error' ? '⚠️' : 'ℹ️';
    toastMessage.textContent = message;

    gameToast.classList.remove('hidden');
    gameToast.style.background = type === 'error' ? 'rgba(239, 68, 68, 0.9)' : 'rgba(99, 102, 241, 0.9)';

    setTimeout(() => {
        gameToast.classList.add('hidden');
    }, 3000);
}

// Pile count güncelleme (socket'ten gelecek)
socket.on('pileUpdate', (data) => {
    pileCountCenter.textContent = data.count;
    pileCount.textContent = `Kalan: ${data.count}`;
});

// ============================================
// 🍅 DOMATES FIRLATMA SİSTEMİ
// ============================================

let tomatoCount = 3; // Her oyuncu 3 domates ile başlar

const tomatoBtn = document.getElementById('tomatoBtn');
const tomatoCounter = document.getElementById('tomatoCounter');
const tomatoSelectOverlay = document.getElementById('tomatoSelectOverlay');
const targetButtons = document.getElementById('targetButtons');
const cancelThrowBtn = document.getElementById('cancelThrowBtn');

// Domates sesi
function playTomatoSound(type) {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    if (type === 'throw') {
        // Fırlama sesi - swoosh
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(200, audioContext.currentTime + 0.3);
        gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        oscillator.type = 'sine';
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.3);
    } else if (type === 'splat') {
        // Patlama sesi - splat
        const noise = audioContext.createBufferSource();
        const bufferSize = audioContext.sampleRate * 0.2;
        const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
        }

        noise.buffer = buffer;
        const noiseGain = audioContext.createGain();
        noiseGain.gain.value = 0.3;
        noise.connect(noiseGain);
        noiseGain.connect(audioContext.destination);
        noise.start();
    }
}

// Domates butonuna tıklama
tomatoBtn.addEventListener('click', () => {
    if (tomatoCount <= 0) {
        showToast('Domatesin kalmadı! 🍅', 'error');
        return;
    }

    // Hedef seçim panelini aç
    showTomatoTargetPanel();
});

// Hedef seçim panelini göster
function showTomatoTargetPanel() {
    targetButtons.innerHTML = '';

    const positionMap = {
        0: 'bottom',
        1: 'right',
        2: 'top',
        3: 'left'
    };

    const positionIcons = {
        'top': '⬆️',
        'right': '➡️',
        'left': '⬅️'
    };

    gameState.players.forEach((player, index) => {
        const relativePos = (index - gameState.playerIndex + 4) % 4;
        const displayPos = positionMap[relativePos];

        // Kendine domates atılamaz
        if (relativePos === 0) return;

        const btn = document.createElement('button');
        btn.className = 'target-btn';
        btn.innerHTML = `
            <span class="position-icon">${positionIcons[displayPos]}</span>
            <span>${player.name}</span>
        `;
        btn.onclick = () => throwTomato(index, displayPos);
        targetButtons.appendChild(btn);
    });

    tomatoSelectOverlay.classList.remove('hidden');
}

// İptal butonu
cancelThrowBtn.addEventListener('click', () => {
    tomatoSelectOverlay.classList.add('hidden');
});

// Domates fırlat!
function throwTomato(targetPlayerIndex, targetPosition) {
    tomatoSelectOverlay.classList.add('hidden');

    // Domates sayısını azalt
    tomatoCount--;
    tomatoCounter.textContent = tomatoCount;

    // Domates emojisi oluştur ve animasyonla fırlat
    const tomato = document.createElement('div');
    tomato.className = 'flying-tomato';
    tomato.textContent = '🍅';
    document.body.appendChild(tomato);

    // Başlangıç pozisyonu (sol alt köşe - butonun yanından)
    const startX = 80;
    const startY = window.innerHeight - 80;
    tomato.style.left = startX + 'px';
    tomato.style.top = startY + 'px';

    // Hedef pozisyonu
    const targetInfo = document.getElementById(`${targetPosition}PlayerInfo`);
    const targetRect = targetInfo.getBoundingClientRect();
    const endX = targetRect.left + targetRect.width / 2;
    const endY = targetRect.top + targetRect.height / 2;

    // Fırlama sesi
    playTomatoSound('throw');

    // Animasyon
    const duration = 600;
    const startTime = performance.now();

    function animateTomato(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Eğri yol için bezier benzeri hareket
        const easeProgress = 1 - Math.pow(1 - progress, 3);

        // Arc (yay) hareketi
        const arcHeight = 150;
        const arc = Math.sin(progress * Math.PI) * arcHeight;

        const currentX = startX + (endX - startX) * easeProgress;
        const currentY = startY + (endY - startY) * easeProgress - arc;

        // Döndürme
        const rotation = progress * 720; // 2 tam tur

        tomato.style.left = currentX + 'px';
        tomato.style.top = currentY + 'px';
        tomato.style.transform = `translate(-50%, -50%) rotate(${rotation}deg)`;

        if (progress < 1) {
            requestAnimationFrame(animateTomato);
        } else {
            // Hedefe ulaştı - splat!
            tomato.remove();
            createSplat(endX, endY);

            // Hedef oyuncuya animasyon
            targetInfo.classList.add('tomato-hit');
            setTimeout(() => targetInfo.classList.remove('tomato-hit'), 500);

            // Sunucuya bildir
            socket.emit('throwTomato', {
                targetPlayerIndex: targetPlayerIndex,
                throwerName: sessionStorage.getItem('playerName')
            });
        }
    }

    requestAnimationFrame(animateTomato);
}

// Splat efekti oluştur
function createSplat(x, y) {
    playTomatoSound('splat');

    const splat = document.createElement('div');
    splat.className = 'tomato-splat';
    splat.style.left = (x - 60) + 'px';
    splat.style.top = (y - 60) + 'px';

    // Merkez ve damlalar
    splat.innerHTML = `
        <div class="splat-center"></div>
        <div class="splat-drip"></div>
        <div class="splat-drip"></div>
        <div class="splat-drip"></div>
        <div class="splat-drip"></div>
        <div class="splat-drip"></div>
    `;

    document.body.appendChild(splat);

    // 3 saniye sonra kaldır
    setTimeout(() => splat.remove(), 3000);
}

// Domates yeme olayı (başkası bize attı)
socket.on('tomatoHit', (data) => {
    const myPosition = 'bottom';
    const myInfo = document.getElementById('bottomPlayerInfo');
    const myRect = myInfo.getBoundingClientRect();

    // Gelen domates animasyonu
    const tomato = document.createElement('div');
    tomato.className = 'flying-tomato';
    tomato.textContent = '🍅';
    document.body.appendChild(tomato);

    // Atanın pozisyonundan
    const throwerRelPos = (data.throwerIndex - gameState.playerIndex + 4) % 4;
    const positionMap = { 0: 'bottom', 1: 'right', 2: 'top', 3: 'left' };
    const throwerPosition = positionMap[throwerRelPos];
    const throwerInfo = document.getElementById(`${throwerPosition}PlayerInfo`);

    let startX, startY;
    if (throwerInfo) {
        const rect = throwerInfo.getBoundingClientRect();
        startX = rect.left + rect.width / 2;
        startY = rect.top + rect.height / 2;
    } else {
        startX = window.innerWidth / 2;
        startY = 100;
    }

    tomato.style.left = startX + 'px';
    tomato.style.top = startY + 'px';

    const endX = myRect.left + myRect.width / 2;
    const endY = myRect.top + myRect.height / 2;

    playTomatoSound('throw');

    const duration = 600;
    const startTime = performance.now();

    function animateTomato(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        const arcHeight = 100;
        const arc = Math.sin(progress * Math.PI) * arcHeight;

        const currentX = startX + (endX - startX) * easeProgress;
        const currentY = startY + (endY - startY) * easeProgress - arc;
        const rotation = progress * 720;

        tomato.style.left = currentX + 'px';
        tomato.style.top = currentY + 'px';
        tomato.style.transform = `translate(-50%, -50%) rotate(${rotation}deg)`;

        if (progress < 1) {
            requestAnimationFrame(animateTomato);
        } else {
            tomato.remove();
            createSplat(endX, endY);
            myInfo.classList.add('tomato-hit');
            setTimeout(() => myInfo.classList.remove('tomato-hit'), 500);

            // Bildirim göster
            showTomatoNotification(data.throwerName);
        }
    }

    requestAnimationFrame(animateTomato);
});

// Domates bildirim göster
function showTomatoNotification(throwerName) {
    const notification = document.createElement('div');
    notification.className = 'tomato-notification';
    notification.innerHTML = `🍅 ${throwerName} sana domates fırlattı!`;
    document.body.appendChild(notification);

    setTimeout(() => notification.remove(), 2500);
}

// Başka birine domates atıldığını gör
socket.on('tomatoThrown', (data) => {
    // Eğer hedef biz değilsek animasyonu göster
    if (data.targetPlayerIndex === gameState.playerIndex) return;

    const throwerRelPos = (data.throwerIndex - gameState.playerIndex + 4) % 4;
    const targetRelPos = (data.targetPlayerIndex - gameState.playerIndex + 4) % 4;

    const positionMap = { 0: 'bottom', 1: 'right', 2: 'top', 3: 'left' };

    const throwerPosition = positionMap[throwerRelPos];
    const targetPosition = positionMap[targetRelPos];

    const throwerInfo = document.getElementById(`${throwerPosition}PlayerInfo`);
    const targetInfo = document.getElementById(`${targetPosition}PlayerInfo`);

    if (!throwerInfo || !targetInfo) return;

    const throwerRect = throwerInfo.getBoundingClientRect();
    const targetRect = targetInfo.getBoundingClientRect();

    // Domates animasyonu
    const tomato = document.createElement('div');
    tomato.className = 'flying-tomato';
    tomato.textContent = '🍅';
    document.body.appendChild(tomato);

    const startX = throwerRect.left + throwerRect.width / 2;
    const startY = throwerRect.top + throwerRect.height / 2;
    const endX = targetRect.left + targetRect.width / 2;
    const endY = targetRect.top + targetRect.height / 2;

    tomato.style.left = startX + 'px';
    tomato.style.top = startY + 'px';

    playTomatoSound('throw');

    const duration = 600;
    const startTime = performance.now();

    function animateTomato(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        const arcHeight = 80;
        const arc = Math.sin(progress * Math.PI) * arcHeight;

        const currentX = startX + (endX - startX) * easeProgress;
        const currentY = startY + (endY - startY) * easeProgress - arc;
        const rotation = progress * 720;

        tomato.style.left = currentX + 'px';
        tomato.style.top = currentY + 'px';
        tomato.style.transform = `translate(-50%, -50%) rotate(${rotation}deg)`;

        if (progress < 1) {
            requestAnimationFrame(animateTomato);
        } else {
            tomato.remove();
            createSplat(endX, endY);
            targetInfo.classList.add('tomato-hit');
            setTimeout(() => targetInfo.classList.remove('tomato-hit'), 500);
        }
    }

    requestAnimationFrame(animateTomato);
});

// Konfeti efekti (kazanınca)
function createConfetti() {
    for (let i = 0; i < 50; i++) {
        setTimeout(() => {
            const confetti = document.createElement('div');
            confetti.className = 'confetti';
            confetti.style.left = Math.random() * 100 + 'vw';
            confetti.style.width = (Math.random() * 10 + 5) + 'px';
            confetti.style.height = confetti.style.width;
            confetti.style.animation = `confettiFall ${Math.random() * 2 + 2}s linear forwards`;
            confetti.style.animationDelay = Math.random() * 0.5 + 's';
            document.body.appendChild(confetti);

            setTimeout(() => confetti.remove(), 4000);
        }, i * 50);
    }
}

// Oyun bittiğinde konfeti
const originalGameFinished = socket.listeners('gameFinished')[0];
socket.off('gameFinished');
socket.on('gameFinished', (data) => {
    const isWinner = data.winner === gameState.playerIndex;
    if (isWinner) {
        createConfetti();
    }

    playSound('win');
    gameState.scores = data.scores;
    updateScoreboard();

    const winnerText = document.getElementById('winnerText');
    const finalScores = document.getElementById('finalScores');

    winnerText.textContent = isWinner ? '🎉 Kazandın!' : `🏆 ${data.winnerName} Kazandı!`;

    let scoresHTML = '<div class="round-scores">';

    if (data.teamMode) {
        const team1Points = data.points[0] + data.points[2];
        const team2Points = data.points[1] + data.points[3];
        scoresHTML += `
            <div class="score-row">
                <span>Takım 1</span>
                <span class="${team1Points >= 0 ? 'positive' : 'negative'}">${team1Points >= 0 ? '+' : ''}${team1Points}</span>
            </div>
            <div class="score-row">
                <span>Takım 2</span>
                <span class="${team2Points >= 0 ? 'positive' : 'negative'}">${team2Points >= 0 ? '+' : ''}${team2Points}</span>
            </div>
        `;
    } else {
        data.points.forEach((points, i) => {
            const player = gameState.players[i];
            scoresHTML += `
                <div class="score-row">
                    <span>${player?.name || 'Oyuncu'}</span>
                    <span class="${points >= 0 ? 'positive' : 'negative'}">${points >= 0 ? '+' : ''}${points}</span>
                </div>
            `;
        });
    }

    scoresHTML += '</div>';
    finalScores.innerHTML = scoresHTML;

    gameEndModal.classList.remove('hidden');

    // Domates sayısını sıfırla (yeni el için)
    tomatoCount = 3;
    tomatoCounter.textContent = tomatoCount;
});
