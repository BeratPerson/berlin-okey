require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const GameLogic = require('./gameLogic');
const Logger = require('./logger');
const { startTelegramBot } = require('./telegramBot');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// Sabit ana oda - 4 arkadaş için
const MAIN_ROOM = {
    code: 'MAIN',
    players: [],
    teamMode: false,
    gameStarted: false,
    game: null,
    scores: {}
};

// Static dosyalar
app.use(express.static(path.join(__dirname, '../public')));
app.use('/asset', express.static(path.join(__dirname, '../asset')));

// Health check (Render)
app.get('/health', (req, res) => {
    res.status(200).json({ ok: true, service: 'berlin-okey' });
});

// Ana sayfa
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Oyun sayfası
app.get('/game', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/game.html'));
});

// Yardımcı fonksiyon: Aktif oyuncuları getir
function getActivePlayers() {
    return MAIN_ROOM.players.filter(p => !p.disconnected);
}

// Yardımcı fonksiyon: Oyuncu pozisyonlarını güncelle
function updatePlayerPositions() {
    const positions = ['bottom', 'right', 'top', 'left'];
    const activePlayers = getActivePlayers();
    activePlayers.forEach((player, index) => {
        player.position = positions[index];
        player.index = index;
        if (MAIN_ROOM.teamMode) {
            player.team = index % 2 === 0 ? 1 : 2;
        }
    });
}

// Socket.io bağlantıları
io.on('connection', (socket) => {
    Logger.socket(`Yeni bağlantı: ${socket.id}`);

    // Oyuna katıl (tek oda)
    socket.on('joinGame', (data) => {
        const { playerName, teamMode, stackingMode, penaltyMode, avatar } = data;


        console.log(`[DEBUG] Join Request Received: Name=${playerName}, Avatar=${avatar}`);
        Logger.socket(`Katılma isteği: ${playerName}`);

        // Oyun modları ilk katılan tarafından belirlenir
        if (MAIN_ROOM.players.length === 0) {
            MAIN_ROOM.teamMode = teamMode;
            MAIN_ROOM.stackingMode = stackingMode || false;
            MAIN_ROOM.penaltyMode = penaltyMode || false;
            MAIN_ROOM.minimumOpenScore = 101; // Katlamalı mod için başlangıç değeri
            MAIN_ROOM.scores = teamMode ? { team1: 0, team2: 0 } : {};
            Logger.game(`Oyun modları: Takım=${teamMode}, Katlamalı=${stackingMode}, Cezalı=${penaltyMode}`);
        }

        const activePlayers = getActivePlayers();

        // Aynı isimde aktif oyuncu var mı kontrol et
        const existingPlayer = MAIN_ROOM.players.find(p => p.name === playerName && !p.disconnected);
        if (existingPlayer) {
            socket.emit('error', { message: 'Bu isimde bir oyuncu zaten var!' });
            return;
        }

        // Oyun başlamışsa, düşmüş oyuncunun yerine geçebilir mi?
        if (MAIN_ROOM.gameStarted) {
            const disconnectedPlayer = MAIN_ROOM.players.find(p => p.disconnected);

            if (disconnectedPlayer) {
                // Düşmüş oyuncunun yerine geç
                const playerIndex = MAIN_ROOM.players.indexOf(disconnectedPlayer);

                // Oyuncu bilgilerini güncelle
                disconnectedPlayer.socketId = socket.id;
                disconnectedPlayer.name = playerName;
                disconnectedPlayer.avatar = avatar || 'alibicim.png';
                disconnectedPlayer.disconnected = false;
                disconnectedPlayer.disconnectTime = null;

                // Skor güncelle (eski ismi sil, yeni isim ekle)
                if (!MAIN_ROOM.teamMode) {
                    const oldScore = MAIN_ROOM.scores[disconnectedPlayer.name] || 0;
                    delete MAIN_ROOM.scores[disconnectedPlayer.name];
                    MAIN_ROOM.scores[playerName] = oldScore;
                }

                socket.join('MAIN');
                socket.roomCode = 'MAIN';
                socket.playerName = playerName;
                socket.avatar = avatar || 'alibicim.png';

                // Oyuncuya mevcut oyun durumunu gönder
                socket.emit('gameStarted', {
                    tiles: MAIN_ROOM.game.getPlayerTiles(playerIndex),
                    indicator: MAIN_ROOM.game.indicator,
                    okey: MAIN_ROOM.game.okey,
                    currentPlayer: MAIN_ROOM.game.currentPlayer,
                    players: MAIN_ROOM.players.map((p, i) => ({
                        name: p.name,
                        position: p.position,
                        tileCount: MAIN_ROOM.game.getPlayerTiles(i).length,
                        team: p.team,
                        avatar: p.avatar
                    })),
                    playerIndex: playerIndex,
                    teamMode: MAIN_ROOM.teamMode,
                    scores: MAIN_ROOM.scores
                });

                // Diğer oyunculara bildir
                socket.to('MAIN').emit('playerReplaced', {
                    oldPlayerIndex: playerIndex,
                    newPlayerName: playerName,
                    players: MAIN_ROOM.players.map((p, i) => ({
                        name: p.name,
                        position: p.position,
                        tileCount: MAIN_ROOM.game.getPlayerTiles(i).length,
                        team: p.team,
                        avatar: p.avatar
                    }))
                });

                Logger.success(`🔄 ${playerName} düşmüş oyuncunun yerine geçti (pozisyon: ${playerIndex})`);
                return;
            } else {
                // Düşmüş oyuncu yok, katılamaz
                socket.emit('error', { message: 'Oyun devam ediyor ve boş yer yok!' });
                return;
            }
        }

        // Oda dolu mu? (oyun başlamadan önce)
        if (activePlayers.length >= 4) {
            socket.emit('error', { message: 'Oda dolu! 4 oyuncu mevcut.' });
            return;
        }

        // Yeni oyuncu ekle
        const positions = ['bottom', 'right', 'top', 'left'];
        const position = positions[activePlayers.length];
        const team = MAIN_ROOM.teamMode ? (activePlayers.length % 2 === 0 ? 1 : 2) : null;

        const player = {
            socketId: socket.id,
            name: playerName,
            position: position,
            index: activePlayers.length,
            team: team,
            avatar: avatar || 'alibicim.png'
        };

        MAIN_ROOM.players.push(player);

        if (!MAIN_ROOM.teamMode) {
            MAIN_ROOM.scores[playerName] = 0;
        }

        socket.join('MAIN');
        socket.roomCode = 'MAIN';
        socket.playerName = playerName;
        socket.avatar = avatar || 'alibicim.png';

        const updatedPlayers = getActivePlayers();

        // Katılan oyuncuya bildir
        socket.emit('joinedGame', {
            player: player,
            players: updatedPlayers,
            teamMode: MAIN_ROOM.teamMode
        });

        // Diğer oyunculara bildir
        socket.to('MAIN').emit('playerJoined', {
            player: player,
            players: updatedPlayers,
            teamMode: MAIN_ROOM.teamMode
        });

        Logger.room(`${playerName} oyuna katıldı (${updatedPlayers.length}/4)`);

        // 4 oyuncu olduysa oyunu başlat
        if (updatedPlayers.length === 4) {
            startGame();
        }
    });

    // Odaya yeniden katıl (sayfa yenilendiğinde)
    socket.on('rejoinRoom', (data) => {
        const { playerName } = data;

        // Oyuncuyu geri bağla
        const player = MAIN_ROOM.players.find(p => p.name === playerName);

        if (player) {
            player.socketId = socket.id;
            player.disconnected = false;
            player.disconnectTime = null;

            socket.join('MAIN');
            socket.roomCode = 'MAIN';
            socket.playerName = playerName;

            // Güncel oyuncu listesini gönder
            socket.emit('playerJoined', {
                players: getActivePlayers(),
                teamMode: MAIN_ROOM.teamMode
            });

            Logger.success(`🔄 ${playerName} oyuna geri bağlandı`);

            // Oyun devam ediyorsa oyun durumunu gönder
            if (MAIN_ROOM.gameStarted && MAIN_ROOM.game) {
                const playerIndex = MAIN_ROOM.players.findIndex(p => p.name === playerName);
                if (playerIndex !== -1) {
                    socket.emit('gameStarted', {
                        tiles: MAIN_ROOM.game.getPlayerTiles(playerIndex),
                        indicator: MAIN_ROOM.game.indicator,
                        okey: MAIN_ROOM.game.okey,
                        currentPlayer: MAIN_ROOM.game.currentPlayer,
                        players: MAIN_ROOM.players.map((p, i) => ({
                            name: p.name,
                            position: p.position,
                            tileCount: MAIN_ROOM.game.getPlayerTiles(i).length,
                            team: p.team,
                            avatar: p.avatar
                        })),
                        playerIndex: playerIndex,
                        teamMode: MAIN_ROOM.teamMode,
                        scores: MAIN_ROOM.scores
                    });
                }
            }
        } else if (!MAIN_ROOM.gameStarted && getActivePlayers().length < 4) {
            // Yeni oyuncu olarak ekle
            const positions = ['bottom', 'right', 'top', 'left'];
            const activePlayers = getActivePlayers();
            const position = positions[activePlayers.length];
            const team = MAIN_ROOM.teamMode ? (activePlayers.length % 2 === 0 ? 1 : 2) : null;

            const newPlayer = {
                socketId: socket.id,
                name: playerName,
                position: position,
                index: activePlayers.length,
                team: team,
                avatar: 'alibicim.png'
            };

            MAIN_ROOM.players.push(newPlayer);

            if (!MAIN_ROOM.teamMode) {
                MAIN_ROOM.scores[playerName] = 0;
            }

            socket.join('MAIN');
            socket.roomCode = 'MAIN';
            socket.playerName = playerName;

            io.to('MAIN').emit('playerJoined', {
                player: newPlayer,
                players: getActivePlayers(),
                teamMode: MAIN_ROOM.teamMode
            });

            if (getActivePlayers().length === 4) {
                startGame();
            }
        }
    });

    // Oyunu başlat
    function startGame() {
        MAIN_ROOM.gameStarted = true;
        MAIN_ROOM.game = new GameLogic();
        MAIN_ROOM.game.startGame(MAIN_ROOM.players);

        // Her oyuncuya kendi taşlarını gönder
        MAIN_ROOM.players.forEach((player, index) => {
            const playerSocket = io.sockets.sockets.get(player.socketId);
            if (playerSocket) {
                playerSocket.emit('gameStarted', {
                    tiles: MAIN_ROOM.game.getPlayerTiles(index),
                    indicator: MAIN_ROOM.game.indicator,
                    okey: MAIN_ROOM.game.okey,
                    currentPlayer: MAIN_ROOM.game.currentPlayer,
                    players: MAIN_ROOM.players.map((p, i) => ({
                        name: p.name,
                        position: p.position,
                        tileCount: MAIN_ROOM.game.getPlayerTiles(i).length,
                        team: p.team,
                        avatar: p.avatar
                    })),
                    playerIndex: index,
                    teamMode: MAIN_ROOM.teamMode,
                    scores: MAIN_ROOM.scores,
                    pileCount: MAIN_ROOM.game.getRemainingTileCount()
                });
            }
        });

        Logger.game(`🎮 Oyun başladı! Başlayan: ${MAIN_ROOM.players[MAIN_ROOM.game.currentPlayer].name}`);
    }

    // Taş çek
    socket.on('drawTile', (data) => {
        if (!MAIN_ROOM.game) return;

        const playerIndex = MAIN_ROOM.players.findIndex(p => p.socketId === socket.id);
        if (playerIndex === -1 || playerIndex !== MAIN_ROOM.game.currentPlayer) {
            console.log(`[DEBUG] Turn Error (Draw): Requesting=${playerIndex} (ID:${socket.id}), Current=${MAIN_ROOM.game.currentPlayer}`);
            socket.emit('error', { message: 'Sıra sizde değil!' });
            return;
        }

        if (MAIN_ROOM.game.hasDrawn) {
            socket.emit('error', { message: 'Zaten taş çektiniz!' });
            return;
        }

        let tile;
        let mustOpenHand = false;

        if (data.fromDiscard) {
            tile = MAIN_ROOM.game.drawFromDiscard(playerIndex);

            if (tile && tile.error) {
                socket.emit('error', { message: tile.error });
                return;
            }

            const state = MAIN_ROOM.game.playerStates[playerIndex];
            mustOpenHand = state.mustOpenThisTurn;
        } else {
            tile = MAIN_ROOM.game.drawFromPile(playerIndex);
        }

        if (!tile) {
            socket.emit('error', { message: 'Taş kalmadı!' });
            return;
        }

        MAIN_ROOM.game.hasDrawn = true;
        MAIN_ROOM.game.playerTiles[playerIndex].push(tile);

        socket.emit('tileDrawn', {
            tile: tile,
            fromDiscard: data.fromDiscard,
            mustOpenHand: mustOpenHand
        });

        socket.to('MAIN').emit('playerDrewTile', {
            playerIndex: playerIndex,
            fromDiscard: data.fromDiscard,
            tileCount: MAIN_ROOM.game.playerTiles[playerIndex].length
        });

        // Kalan taş sayısını güncelle (yığından çekildiyse)
        if (!data.fromDiscard) {
            io.to('MAIN').emit('pileUpdate', {
                count: MAIN_ROOM.game.getRemainingTileCount()
            });
        }
    });

    // Taş at
    socket.on('discardTile', (data) => {
        if (!MAIN_ROOM.game) return;

        const playerIndex = MAIN_ROOM.players.findIndex(p => p.socketId === socket.id);
        if (playerIndex === -1 || playerIndex !== MAIN_ROOM.game.currentPlayer) {
            console.log(`[DEBUG] Turn Error (Draw): Requesting=${playerIndex} (ID:${socket.id}), Current=${MAIN_ROOM.game.currentPlayer}`);
            socket.emit('error', { message: 'Sıra sizde değil!' });
            return;
        }

        if (!MAIN_ROOM.game.hasDrawn) {
            socket.emit('error', { message: 'Önce taş çekmelisiniz!' });
            return;
        }

        const tileIndex = data.tileIndex;
        const tileToDiscard = MAIN_ROOM.game.playerTiles[playerIndex][tileIndex];

        if (!tileToDiscard) {
            socket.emit('error', { message: 'Geçersiz taş!' });
            return;
        }

        // İŞLER TAŞ CEZASI: Atılan taş bir açık gruba eklenebilir mi?
        let isPlayableTile = false;
        for (let i = 0; i < 4; i++) {
            const state = MAIN_ROOM.game.playerStates[i];
            if (!state.hasOpened || !state.openedGroups) continue;

            for (const group of state.openedGroups) {
                // Taşı grubun başına veya sonuna eklemeyi dene
                const withLeft = [tileToDiscard, ...group];
                const withRight = [...group, tileToDiscard];

                if (MAIN_ROOM.game.isValidGroup(withLeft) || MAIN_ROOM.game.isValidGroup(withRight)) {
                    isPlayableTile = true;
                    break;
                }
            }
            if (isPlayableTile) break;
        }

        // Ceza uygula
        if (isPlayableTile && MAIN_ROOM.penaltyMode) {
            // Cezalı modda işler taş atma cezası
            if (MAIN_ROOM.teamMode) {
                const team = playerIndex % 2 === 0 ? 'team1' : 'team2';
                MAIN_ROOM.scores[team] = (MAIN_ROOM.scores[team] || 0) + 101;
            } else {
                const playerName = MAIN_ROOM.players[playerIndex].name;
                MAIN_ROOM.scores[playerName] = (MAIN_ROOM.scores[playerName] || 0) + 101;
            }

            io.to('MAIN').emit('penaltyApplied', {
                playerIndex: playerIndex,
                playerName: socket.playerName,
                reason: 'İşler taş attı!',
                penalty: 101,
                scores: MAIN_ROOM.scores
            });

            Logger.warning(`⚠️ ${socket.playerName} işler taş attı! +101 ceza`);
        }

        const discardedTile = MAIN_ROOM.game.discardTile(playerIndex, tileIndex);

        if (!discardedTile) {
            socket.emit('error', { message: 'Geçersiz taş!' });
            return;
        }

        MAIN_ROOM.game.currentPlayer = (MAIN_ROOM.game.currentPlayer + 1) % 4;
        MAIN_ROOM.game.hasDrawn = false;

        // Bir sonraki oyuncunun solundaki taş (yeni atılan)
        const nextPlayer = MAIN_ROOM.game.currentPlayer;
        const leftDiscard = MAIN_ROOM.game.getLeftDiscard(nextPlayer);

        io.to('MAIN').emit('tileDiscarded', {
            playerIndex: playerIndex,       // Kim attı
            tile: discardedTile,            // Hangi taş
            nextPlayer: nextPlayer,         // Sıra kimde
            tileCount: MAIN_ROOM.game.playerTiles[playerIndex].length,
            leftDiscard: leftDiscard,       // Sonraki oyuncunun solundaki taş
            isPlayableTile: isPlayableTile  // İşler taş mıydı?
        });
        Logger.game(`Taş atıldı: ${MAIN_ROOM.players[playerIndex].name} -> ${discardedTile ? discardedTile.id : '?'}${isPlayableTile ? ' (İŞLER!)' : ''}`);
    });

    // Taşları sırala
    socket.on('sortTiles', (data) => {
        if (!MAIN_ROOM.game) return;

        const playerIndex = MAIN_ROOM.players.findIndex(p => p.socketId === socket.id);
        if (playerIndex === -1) return;

        MAIN_ROOM.game.playerTiles[playerIndex] = data.tiles;
        socket.emit('tilesSorted', { tiles: data.tiles });
    });

    // El aç
    socket.on('openHand', (data) => {
        if (!MAIN_ROOM.game) return;

        const playerIndex = MAIN_ROOM.players.findIndex(p => p.socketId === socket.id);
        if (playerIndex === -1) return;

        if (MAIN_ROOM.game.playerStates[playerIndex].hasOpened) {
            socket.emit('error', { message: 'Zaten el açtınız!' });
            return;
        }

        const groups = data.groups;
        const score = data.score;

        // Minimum puan kontrolü
        const minScore = MAIN_ROOM.minimumOpenScore || 101;

        if (score < minScore) {
            if (MAIN_ROOM.stackingMode) {
                socket.emit('error', { message: `Katlamalı mod: En az ${minScore} puan gerekli!` });
            } else {
                socket.emit('error', { message: 'En az 101 puan gerekli!' });
            }
            return;
        }

        // Yerden çekilen taş kullanılmalı kontrolü
        const playerState = MAIN_ROOM.game.playerStates[playerIndex];
        const drawnFromDiscard = playerState.drawnFromDiscardTile;

        if (drawnFromDiscard) {
            // Bu taş açılan gruplardan birinde kullanılmalı
            const openedGroups = groups.map(groupIndices => {
                return groupIndices.map(idx => MAIN_ROOM.game.playerTiles[playerIndex][idx]);
            });

            // Yerden çekilen taş gruplardan birinde var mı?
            let tileUsed = false;
            for (const group of openedGroups) {
                for (const tile of group) {
                    if (tile.id === drawnFromDiscard.id) {
                        tileUsed = true;
                        break;
                    }
                }
                if (tileUsed) break;
            }

            if (!tileUsed) {
                // Taşı geri ver (soldaki oyuncunun atık alanına)
                const previousPlayer = (playerIndex + 3) % 4;
                MAIN_ROOM.game.discardPiles[previousPlayer].push(drawnFromDiscard);

                // Taşı oyuncunun elinden çıkar
                const tileIdx = MAIN_ROOM.game.playerTiles[playerIndex].findIndex(t => t.id === drawnFromDiscard.id);
                if (tileIdx !== -1) {
                    MAIN_ROOM.game.playerTiles[playerIndex].splice(tileIdx, 1);
                }

                // Durumu temizle
                playerState.drawnFromDiscardTile = null;

                socket.emit('error', { message: 'Yerden çektiğiniz taşı kullanmalısınız! Taş geri bırakıldı.' });

                // Güncel eli gönder
                socket.emit('tilesUpdated', { tiles: MAIN_ROOM.game.playerTiles[playerIndex] });

                Logger.warning(`⚠️ ${socket.playerName} yerden çektiği taşı kullanmadan açmaya çalıştı!`);
                return;
            }

            // Taş kullanıldı, temizle
            playerState.drawnFromDiscardTile = null;
        }

        const openedGroups = groups.map(groupIndices => {
            return groupIndices.map(idx => MAIN_ROOM.game.playerTiles[playerIndex][idx]);
        });

        const allIndices = groups.flat().sort((a, b) => b - a);
        allIndices.forEach(idx => {
            MAIN_ROOM.game.playerTiles[playerIndex].splice(idx, 1);
        });

        MAIN_ROOM.game.playerStates[playerIndex].hasOpened = true;
        MAIN_ROOM.game.playerStates[playerIndex].openType = 'normal';
        MAIN_ROOM.game.playerStates[playerIndex].openScore = score;
        MAIN_ROOM.game.playerStates[playerIndex].openedGroups = openedGroups;

        // Katlamalı modda minimum puanı güncelle
        if (MAIN_ROOM.stackingMode) {
            MAIN_ROOM.minimumOpenScore = score + 1;
            Logger.game(`📈 Katlamalı mod: Yeni minimum açma puanı: ${MAIN_ROOM.minimumOpenScore}`);
        }

        io.to('MAIN').emit('handOpened', {
            playerIndex: playerIndex,
            playerName: socket.playerName,
            groups: groups,
            openedGroups: openedGroups,
            score: score,
            tileCount: MAIN_ROOM.game.playerTiles[playerIndex].length,
            remainingTiles: MAIN_ROOM.game.playerTiles[playerIndex],
            minimumOpenScore: MAIN_ROOM.minimumOpenScore // Client'a bildir
        });

        Logger.game(`📖 ${socket.playerName} el açtı: ${score} puan`);
    });

    // Çift ile el aç
    socket.on('openWithPairs', () => {
        if (!MAIN_ROOM.game) return;

        const playerIndex = MAIN_ROOM.players.findIndex(p => p.socketId === socket.id);
        if (playerIndex === -1) return;

        const result = MAIN_ROOM.game.openWithPairs(playerIndex);

        if (!result.valid) {
            socket.emit('error', { message: result.message });
            return;
        }

        io.to('MAIN').emit('pairsOpened', {
            playerIndex: playerIndex,
            playerName: socket.playerName,
            pairsCount: result.count,
            tileCount: MAIN_ROOM.game.playerTiles[playerIndex].length
        });

        Logger.game(`🃏 ${socket.playerName} çift açtı: ${result.count} çift`);
    });

    // Masadaki sete taş işle (açılmış gruplara taş ekleme)
    socket.on('addToGroup', (data) => {
        if (!MAIN_ROOM.game) return;

        const playerIndex = MAIN_ROOM.players.findIndex(p => p.socketId === socket.id);
        if (playerIndex === -1) {
            socket.emit('error', { message: 'Oyuncu bulunamadı!' });
            return;
        }

        if (playerIndex !== MAIN_ROOM.game.currentPlayer) {
            socket.emit('error', { message: 'Sıra sizde değil!' });
            return;
        }

        // El açmış olmalı
        if (!MAIN_ROOM.game.playerStates[playerIndex].hasOpened) {
            socket.emit('error', { message: 'Önce el açmalısınız!' });
            return;
        }

        const { tileIndex, targetPlayerIndex, targetGroupIndex, position } = data;

        // Hedef oyuncunun açık grupları
        const targetState = MAIN_ROOM.game.playerStates[targetPlayerIndex];
        if (!targetState || !targetState.openedGroups || !targetState.openedGroups[targetGroupIndex]) {
            socket.emit('error', { message: 'Hedef grup bulunamadı!' });
            return;
        }

        // Taşı al
        const tile = MAIN_ROOM.game.playerTiles[playerIndex][tileIndex];
        if (!tile) {
            socket.emit('error', { message: 'Taş bulunamadı!' });
            return;
        }

        // Taşı gruba ekleyip kontrol et
        const group = [...targetState.openedGroups[targetGroupIndex]];
        if (position === 'left') {
            group.unshift(tile);
        } else {
            group.push(tile);
        }

        // Grup hala geçerli mi kontrol et
        if (!MAIN_ROOM.game.isValidGroup(group)) {
            socket.emit('error', { message: 'Bu taş bu gruba eklenemez!' });
            return;
        }

        // Taşı elden çıkar
        MAIN_ROOM.game.playerTiles[playerIndex].splice(tileIndex, 1);

        // Grubu güncelle
        targetState.openedGroups[targetGroupIndex] = group;

        // Tüm oyunculara bildir
        io.to('MAIN').emit('groupUpdated', {
            playerIndex: playerIndex,
            targetPlayerIndex: targetPlayerIndex,
            targetGroupIndex: targetGroupIndex,
            group: group,
            playerTileCount: MAIN_ROOM.game.playerTiles[playerIndex].length,
            addedTile: tile,
            position: position
        });

        // İşleyen oyuncuya güncel taşlarını gönder
        const processingSocket = [...io.sockets.sockets.values()].find(s =>
            MAIN_ROOM.players.find(p => p.socketId === s.id && p.name === socket.playerName)
        );
        if (processingSocket) {
            processingSocket.emit('tilesUpdated', {
                tiles: MAIN_ROOM.game.playerTiles[playerIndex]
            });
        }

        Logger.game(`📝 ${socket.playerName} taş işledi: ${tile.color} ${tile.number} -> ${MAIN_ROOM.players[targetPlayerIndex].name}'nin grubuna`);
    });

    // Oyunu bitir
    socket.on('finishGame', (data) => {
        if (!MAIN_ROOM.game) return;

        const playerIndex = MAIN_ROOM.players.findIndex(p => p.socketId === socket.id);
        if (playerIndex === -1 || playerIndex !== MAIN_ROOM.game.currentPlayer) {
            console.log(`[DEBUG] Turn Error (Discard): Requesting=${playerIndex}, Current=${MAIN_ROOM.game.currentPlayer}`);
            socket.emit('error', { message: 'Sıra sizde değil!' });
            return;
        }

        const result = MAIN_ROOM.game.checkFinish(playerIndex);

        if (!result.valid) {
            socket.emit('error', { message: result.message });
            return;
        }

        const points = MAIN_ROOM.game.calculatePoints(playerIndex, result);

        if (MAIN_ROOM.teamMode) {
            const team1Points = points[0] + points[2];
            const team2Points = points[1] + points[3];
            MAIN_ROOM.scores.team1 += team1Points;
            MAIN_ROOM.scores.team2 += team2Points;
        } else {
            MAIN_ROOM.players.forEach((p, i) => {
                MAIN_ROOM.scores[p.name] = (MAIN_ROOM.scores[p.name] || 0) + points[i];
            });
        }

        io.to('MAIN').emit('gameFinished', {
            winner: playerIndex,
            winnerName: MAIN_ROOM.players[playerIndex].name,
            points: points,
            scores: MAIN_ROOM.scores,
            tiles: MAIN_ROOM.game.playerTiles,
            teamMode: MAIN_ROOM.teamMode
        });

        Logger.title(`🏆 OYUN BİTTİ: ${MAIN_ROOM.players[playerIndex].name} KAZANDI! (${result.type})`);
    });

    // Yeni el başlat
    socket.on('newRound', () => {
        if (MAIN_ROOM.players.length === 4) {
            MAIN_ROOM.gameStarted = false;
            MAIN_ROOM.game = null;
            startGame();
        }
    });

    // Domates fırlatma
    socket.on('throwTomato', (data) => {
        const throwerIndex = MAIN_ROOM.players.findIndex(p => p.socketId === socket.id);
        if (throwerIndex === -1) return;

        const targetPlayerIndex = data.targetPlayerIndex;
        const targetPlayer = MAIN_ROOM.players[targetPlayerIndex];

        if (!targetPlayer) return;

        const targetSocket = io.sockets.sockets.get(targetPlayer.socketId);
        if (targetSocket) {
            targetSocket.emit('tomatoHit', {
                throwerIndex: throwerIndex,
                throwerName: data.throwerName
            });
        }

        MAIN_ROOM.players.forEach((player, index) => {
            if (index !== throwerIndex && index !== targetPlayerIndex) {
                const playerSocket = io.sockets.sockets.get(player.socketId);
                if (playerSocket) {
                    playerSocket.emit('tomatoThrown', {
                        throwerIndex: throwerIndex,
                        targetPlayerIndex: targetPlayerIndex,
                        throwerName: data.throwerName
                    });
                }
            }
        });

        Logger.game(`🍅 ${data.throwerName} -> ${targetPlayer.name}`);
    });

    socket.on('disconnect', () => {
        // Socket'i room'dan çıkar
        socket.leave('MAIN');

        const player = MAIN_ROOM.players.find(p => p.socketId === socket.id);
        if (player) {
            player.disconnected = true;
            player.disconnectTime = Date.now();

            Logger.socket(`Oyuncu ayrıldı: ${player.name} (30sn içinde geri bağlanmazsa silinecek)`);

            // 30 saniye sonra oyuncuyu sil
            setTimeout(() => {
                // Oyuncu hala disconnect durumunda mı?
                const currentPlayer = MAIN_ROOM.players.find(p => p.name === player.name);
                if (currentPlayer && currentPlayer.disconnected) {
                    const index = MAIN_ROOM.players.indexOf(currentPlayer);
                    if (index !== -1) {
                        MAIN_ROOM.players.splice(index, 1);
                        updatePlayerPositions();

                        io.to('MAIN').emit('playerLeft', {
                            playerName: player.name,
                            players: getActivePlayers()
                        });

                        Logger.room(`Oyuncu silindi: ${player.name}`);
                    }

                    // Tüm oyuncular ayrıldı mı kontrol et
                    if (MAIN_ROOM.players.length === 0) {
                        // Odayı tamamen sıfırla
                        MAIN_ROOM.gameStarted = false;
                        MAIN_ROOM.game = null;
                        MAIN_ROOM.scores = {};
                        MAIN_ROOM.teamMode = false;
                        Logger.room('🗑️ Oda tamamen sıfırlandı - tüm oyuncular ayrıldı');
                    }
                }
            }, 30000);
        } else {
            Logger.socket(`Bilinmeyen socket ayrıldı: ${socket.id}`);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    Logger.title(`🚀 BERLIN OKEY SUNUCUSU: http://0.0.0.0:${PORT}`);
    Logger.info('4 arkadaş için tek oda modu aktif');
    if (process.env.WEBAPP_URL) {
        Logger.info(`Mini App URL: ${process.env.WEBAPP_URL}`);
    } else {
        Logger.warn('WEBAPP_URL boş — Telegram Mini App butonu çalışmaz (HTTPS URL gerekli)');
    }
    startTelegramBot().catch((err) => {
        Logger.error(`Telegram bot: ${err.message}`);
    });
});
