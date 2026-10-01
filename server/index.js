require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const GameLogic = require('./gameLogic');
const Logger = require('./logger');
const RoomManager = require('./roomManager');
const { startTelegramBot } = require('./telegramBot');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

const roomManager = new RoomManager();

// Online 101 Okey: Okey 101 Plus 15/30/60 sn; Yudum en fazla 60 sn.
// Dengeli varsayılan: 30 sn. Sarı ≤15 sn, kırmızı ≤8 sn.
const TURN_SECONDS = 30;
const TURN_WARN_SECONDS = 15;
const TURN_DANGER_SECONDS = 8;

app.use(express.static(path.join(__dirname, '../public')));
app.use('/asset', express.static(path.join(__dirname, '../asset')));

app.get('/health', (req, res) => {
    res.status(200).json({ ok: true, service: 'berlin-okey' });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/game', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/game.html'));
});

function getRoom(socket) {
    return roomManager.getRoom(socket.roomCode);
}

function publicPlayers(room) {
    return roomManager.getActivePlayers(room).map(p => ({
        name: p.name,
        position: p.position,
        index: p.index,
        team: p.team,
        avatar: p.avatar,
        socketId: p.socketId
    }));
}

function gamePlayersPayload(room) {
    return room.players.map((p, i) => ({
        name: p.name,
        position: p.position,
        tileCount: room.game ? room.game.getPlayerTiles(i).length : 0,
        team: p.team,
        avatar: p.avatar
    }));
}

function clearTurnTimer(room) {
    if (room.turnTimer) {
        clearTimeout(room.turnTimer);
        room.turnTimer = null;
    }
}

function emitTurnTimer(room) {
    if (!room.game) return;
    io.to(room.code).emit('turnTimer', {
        currentPlayer: room.game.currentPlayer,
        turnEndsAt: room.turnEndsAt,
        turnSeconds: TURN_SECONDS,
        hasDrawn: !!room.game.hasDrawn,
        warnSeconds: TURN_WARN_SECONDS,
        dangerSeconds: TURN_DANGER_SECONDS
    });
}

function beginTurnTimer(room) {
    if (!room.game || !room.gameStarted) return;
    clearTurnTimer(room);
    room.turnEndsAt = Date.now() + TURN_SECONDS * 1000;
    room.turnTimer = setTimeout(() => {
        handleTurnTimeout(room).catch((err) => {
            Logger.error(`Tur zaman aşımı: ${err.message}`);
        });
    }, TURN_SECONDS * 1000);
    emitTurnTimer(room);
}

function pickAutoDiscardIndex(room, playerIndex) {
    const tiles = room.game.playerTiles[playerIndex];
    if (!tiles || tiles.length === 0) return -1;

    // Önce okey olmayanlardan rastgele; yoksa herhangi birinden rastgele
    const nonOkeyIndices = [];
    for (let i = 0; i < tiles.length; i++) {
        if (!room.game.isOkey(tiles[i])) nonOkeyIndices.push(i);
    }
    const pool = nonOkeyIndices.length > 0 ? nonOkeyIndices : tiles.map((_, i) => i);
    return pool[Math.floor(Math.random() * pool.length)];
}

function resolveDiscardIndex(room, playerIndex, data = {}) {
    const tiles = room.game.playerTiles[playerIndex] || [];
    if (data.tileId != null) {
        const byId = tiles.findIndex(t => t && String(t.id) === String(data.tileId));
        if (byId !== -1) return byId;
    }
    if (typeof data.tileIndex === 'number' && data.tileIndex >= 0 && data.tileIndex < tiles.length) {
        return data.tileIndex;
    }
    return -1;
}

function applyDiscardAndAdvance(room, playerIndex, tileIndex, { isPlayableTile = false, auto = false } = {}) {
    const discardedTile = room.game.discardTile(playerIndex, tileIndex);
    if (!discardedTile || discardedTile.error) {
        return { ok: false, error: discardedTile && discardedTile.error ? discardedTile.error : 'Geçersiz taş!' };
    }

    room.game.currentPlayer = (room.game.currentPlayer + 1) % 4;
    room.game.hasDrawn = false;
    const nextPlayer = room.game.currentPlayer;
    const leftDiscard = room.game.getLeftDiscard(nextPlayer);

    io.to(room.code).emit('tileDiscarded', {
        playerIndex,
        tile: discardedTile,
        nextPlayer,
        tileCount: room.game.playerTiles[playerIndex].length,
        leftDiscard,
        isPlayableTile,
        auto
    });

    beginTurnTimer(room);
    return { ok: true, tile: discardedTile };
}

async function handleTurnTimeout(room) {
    if (!room.game || !room.gameStarted) return;

    const playerIndex = room.game.currentPlayer;
    const player = room.players[playerIndex];
    if (!player) return;

    Logger.warn(`⏱️ Süre doldu: ${player.name} (oda ${room.code})`);

    if (!room.game.hasDrawn) {
        const tile = room.game.drawFromPile(playerIndex);
        if (!tile) {
            Logger.warn('Otomatik çekme başarısız — yığın boş');
            beginTurnTimer(room);
            return;
        }
        room.game.hasDrawn = true;
        room.game.playerTiles[playerIndex].push(tile);

        const playerSocket = io.sockets.sockets.get(player.socketId);
        if (playerSocket) {
            playerSocket.emit('tileDrawn', {
                tile,
                fromDiscard: false,
                mustOpenHand: false,
                auto: true
            });
        }
        io.to(room.code).emit('playerDrewTile', {
            playerIndex,
            fromDiscard: false,
            tileCount: room.game.playerTiles[playerIndex].length,
            auto: true
        });
        io.to(room.code).emit('pileUpdate', {
            count: room.game.getRemainingTileCount()
        });
    }

    const tileIndex = pickAutoDiscardIndex(room, playerIndex);
    if (tileIndex === -1) {
        beginTurnTimer(room);
        return;
    }

    const result = applyDiscardAndAdvance(room, playerIndex, tileIndex, { auto: true });
    if (!result.ok) {
        Logger.warn(`Otomatik atma başarısız: ${result.error}`);
        beginTurnTimer(room);
        return;
    }

    io.to(room.code).emit('turnTimeout', {
        playerIndex,
        playerName: player.name
    });
}

function startGame(room) {
    clearTurnTimer(room);
    room.gameStarted = true;
    room.game = new GameLogic();
    room.game.startGame(room.players);
    room.minimumOpenScore = 101;
    // İlk oyuncu 22 taşla başlar → çekmiş sayılır
    room.game.hasDrawn = true;
    room.turnEndsAt = Date.now() + TURN_SECONDS * 1000;

    room.players.forEach((player, index) => {
        const playerSocket = io.sockets.sockets.get(player.socketId);
        if (playerSocket) {
            playerSocket.emit('gameStarted', {
                roomCode: room.code,
                tiles: room.game.getPlayerTiles(index),
                indicator: room.game.indicator,
                okey: room.game.okey,
                currentPlayer: room.game.currentPlayer,
                players: gamePlayersPayload(room),
                playerIndex: index,
                teamMode: room.teamMode,
                scores: room.scores,
                pileCount: room.game.getRemainingTileCount(),
                turnEndsAt: room.turnEndsAt,
                turnSeconds: TURN_SECONDS,
                hasDrawn: index === room.game.currentPlayer,
                warnSeconds: TURN_WARN_SECONDS,
                dangerSeconds: TURN_DANGER_SECONDS
            });
        }
    });

    Logger.game(`🎮 Oda ${room.code} başladı! Başlayan: ${room.players[room.game.currentPlayer].name}`);
    beginTurnTimer(room);
}

function attachPlayerToSocket(socket, room, playerName, avatar) {
    socket.join(room.code);
    socket.roomCode = room.code;
    socket.playerName = playerName;
    socket.avatar = avatar || 'p-amber';
}

io.on('connection', (socket) => {
    Logger.socket(`Yeni bağlantı: ${socket.id}`);

    // Oda oluştur veya kod ile katıl
    socket.on('joinGame', (data) => {
        const {
            playerName,
            teamMode,
            stackingMode,
            penaltyMode,
            avatar,
            roomCode: rawCode,
            createRoom
        } = data || {};

        if (!playerName || !String(playerName).trim()) {
            socket.emit('error', { message: 'İsim gerekli!' });
            return;
        }

        const name = String(playerName).trim().slice(0, 15);
        const avatarName = avatar || 'p-amber';
        let room = null;
        const joinCode = roomManager.normalizeCode(rawCode);

        if (createRoom === true) {
            room = roomManager.createRoom({
                teamMode: !!teamMode,
                stackingMode: !!stackingMode,
                penaltyMode: !!penaltyMode
            });
            Logger.room(`Yeni oda: ${room.code} (Takım=${room.teamMode}, Katlamalı=${room.stackingMode}, Cezalı=${room.penaltyMode})`);
        } else if (joinCode) {
            room = roomManager.getRoom(joinCode);
            if (!room) {
                socket.emit('error', { message: 'Oda bulunamadı! Kodu kontrol et.' });
                return;
            }
        } else {
            socket.emit('error', { message: 'Oda kodu 6 basamaklı sayı olmalı!' });
            return;
        }

        const activePlayers = roomManager.getActivePlayers(room);

        const existingPlayer = room.players.find(p => p.name === name && !p.disconnected);
        if (existingPlayer) {
            socket.emit('error', { message: 'Bu isimde bir oyuncu zaten var!' });
            return;
        }

        // Oyun başlamışsa düşmüş oyuncunun yerine geç
        if (room.gameStarted) {
            const disconnectedPlayer = room.players.find(p => p.disconnected);
            if (disconnectedPlayer) {
                const playerIndex = room.players.indexOf(disconnectedPlayer);
                const oldName = disconnectedPlayer.name;

                disconnectedPlayer.socketId = socket.id;
                disconnectedPlayer.name = name;
                disconnectedPlayer.avatar = avatarName;
                disconnectedPlayer.disconnected = false;
                disconnectedPlayer.disconnectTime = null;

                if (!room.teamMode) {
                    const oldScore = room.scores[oldName] || 0;
                    delete room.scores[oldName];
                    room.scores[name] = oldScore;
                }

                attachPlayerToSocket(socket, room, name, avatarName);

                socket.emit('gameStarted', {
                    roomCode: room.code,
                    tiles: room.game.getPlayerTiles(playerIndex),
                    indicator: room.game.indicator,
                    okey: room.game.okey,
                    currentPlayer: room.game.currentPlayer,
                    players: gamePlayersPayload(room),
                    playerIndex,
                    teamMode: room.teamMode,
                    scores: room.scores
                });

                socket.to(room.code).emit('playerReplaced', {
                    oldPlayerIndex: playerIndex,
                    newPlayerName: name,
                    players: gamePlayersPayload(room)
                });

                Logger.success(`🔄 ${name} oda ${room.code} içinde yerine geçti`);
                return;
            }

            socket.emit('error', { message: 'Oyun devam ediyor ve boş yer yok!' });
            return;
        }

        if (activePlayers.length >= 4) {
            socket.emit('error', { message: 'Oda dolu! 4 oyuncu mevcut.' });
            return;
        }

        const player = roomManager.addPlayer(room, socket.id, name, avatarName);
        attachPlayerToSocket(socket, room, name, avatarName);

        const updatedPlayers = publicPlayers(room);

        socket.emit('joinedGame', {
            roomCode: room.code,
            player,
            players: updatedPlayers,
            teamMode: room.teamMode,
            stackingMode: room.stackingMode,
            penaltyMode: room.penaltyMode
        });

        socket.to(room.code).emit('playerJoined', {
            player,
            players: updatedPlayers,
            teamMode: room.teamMode
        });

        Logger.room(`${name} → oda ${room.code} (${updatedPlayers.length}/4)`);

        if (updatedPlayers.length === 4) {
            startGame(room);
        }
    });

    socket.on('rejoinRoom', (data) => {
        const { playerName, roomCode: rawCode } = data || {};
        const code = roomManager.normalizeCode(rawCode) || String(rawCode || '').trim();
        const room = roomManager.getRoom(code);

        if (!room) {
            socket.emit('error', { message: 'Oda bulunamadı veya kapandı!' });
            return;
        }

        const player = room.players.find(p => p.name === playerName);

        if (player) {
            player.socketId = socket.id;
            player.disconnected = false;
            player.disconnectTime = null;
            attachPlayerToSocket(socket, room, playerName, player.avatar);

            socket.emit('playerJoined', {
                players: publicPlayers(room),
                teamMode: room.teamMode
            });

            Logger.success(`🔄 ${playerName} oda ${room.code} içine geri bağlandı`);

            if (room.gameStarted && room.game) {
                const playerIndex = room.players.findIndex(p => p.name === playerName);
                if (playerIndex !== -1) {
                    socket.emit('gameStarted', {
                        roomCode: room.code,
                        tiles: room.game.getPlayerTiles(playerIndex),
                        indicator: room.game.indicator,
                        okey: room.game.okey,
                        currentPlayer: room.game.currentPlayer,
                        players: gamePlayersPayload(room),
                        playerIndex,
                        teamMode: room.teamMode,
                        scores: room.scores
                    });
                }
            }
            return;
        }

        // Lobide yeni oyuncu olarak ekle
        if (!room.gameStarted && roomManager.getActivePlayers(room).length < 4) {
            const nameTaken = room.players.find(p => p.name === playerName && !p.disconnected);
            if (nameTaken) {
                socket.emit('error', { message: 'Bu isimde bir oyuncu zaten var!' });
                return;
            }

            const newPlayer = roomManager.addPlayer(room, socket.id, playerName, 'p-amber');
            attachPlayerToSocket(socket, room, playerName, 'p-amber');

            io.to(room.code).emit('playerJoined', {
                player: newPlayer,
                players: publicPlayers(room),
                teamMode: room.teamMode
            });

            if (roomManager.getActivePlayers(room).length === 4) {
                startGame(room);
            }
        } else {
            socket.emit('error', { message: 'Odaya katılınamıyor!' });
        }
    });

    socket.on('leaveRoom', () => {
        const room = getRoom(socket);
        if (!room) return;

        const player = room.players.find(p => p.socketId === socket.id);
        if (!player) return;

        const index = room.players.indexOf(player);
        if (index !== -1) room.players.splice(index, 1);
        roomManager.updatePlayerPositions(room);
        socket.leave(room.code);

        io.to(room.code).emit('playerLeft', {
            playerName: player.name,
            players: publicPlayers(room)
        });

        if (room.players.length === 0) {
            roomManager.deleteRoom(room.code);
            Logger.room(`🗑️ Oda ${room.code} silindi`);
        }

        socket.roomCode = null;
    });

    socket.on('drawTile', (data) => {
        const room = getRoom(socket);
        if (!room || !room.game) return;

        const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
        if (playerIndex === -1 || playerIndex !== room.game.currentPlayer) {
            socket.emit('error', { message: 'Sıra sizde değil!' });
            return;
        }

        if (room.game.hasDrawn) {
            socket.emit('error', { message: 'Zaten taş çektiniz!' });
            return;
        }

        let tile;
        let mustOpenHand = false;

        if (data.fromDiscard) {
            tile = room.game.drawFromDiscard(playerIndex);
            if (tile && tile.error) {
                socket.emit('error', { message: tile.error });
                return;
            }
            mustOpenHand = room.game.playerStates[playerIndex].mustOpenThisTurn;
        } else {
            tile = room.game.drawFromPile(playerIndex);
        }

        if (!tile) {
            socket.emit('error', { message: 'Taş kalmadı!' });
            return;
        }

        room.game.hasDrawn = true;
        room.game.playerTiles[playerIndex].push(tile);

        socket.emit('tileDrawn', {
            tile,
            fromDiscard: data.fromDiscard,
            mustOpenHand
        });

        socket.to(room.code).emit('playerDrewTile', {
            playerIndex,
            fromDiscard: data.fromDiscard,
            tileCount: room.game.playerTiles[playerIndex].length
        });

        if (!data.fromDiscard) {
            io.to(room.code).emit('pileUpdate', {
                count: room.game.getRemainingTileCount()
            });
        }

        emitTurnTimer(room);
    });

    socket.on('discardTile', (data) => {
        const room = getRoom(socket);
        if (!room || !room.game) return;

        const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
        if (playerIndex === -1 || playerIndex !== room.game.currentPlayer) {
            socket.emit('error', { message: 'Sıra sizde değil!' });
            return;
        }

        if (!room.game.hasDrawn) {
            socket.emit('error', { message: 'Önce taş çekmelisiniz!' });
            return;
        }

        const tileIndex = resolveDiscardIndex(room, playerIndex, data || {});
        if (tileIndex === -1) {
            socket.emit('error', { message: 'Geçersiz taş! Taşı tekrar seçip sağdaki At alanına sürükle.' });
            return;
        }

        const tileToDiscard = room.game.playerTiles[playerIndex][tileIndex];
        if (!tileToDiscard) {
            socket.emit('error', { message: 'Geçersiz taş!' });
            return;
        }

        let isPlayableTile = false;
        for (let i = 0; i < 4; i++) {
            const state = room.game.playerStates[i];
            if (!state.hasOpened || !state.openedGroups) continue;
            for (const group of state.openedGroups) {
                const withLeft = [tileToDiscard, ...group];
                const withRight = [...group, tileToDiscard];
                if (room.game.isValidGroup(withLeft) || room.game.isValidGroup(withRight)) {
                    isPlayableTile = true;
                    break;
                }
            }
            if (isPlayableTile) break;
        }

        if (isPlayableTile && room.penaltyMode) {
            if (room.teamMode) {
                const team = playerIndex % 2 === 0 ? 'team1' : 'team2';
                room.scores[team] = (room.scores[team] || 0) + 101;
            } else {
                const pname = room.players[playerIndex].name;
                room.scores[pname] = (room.scores[pname] || 0) + 101;
            }

            io.to(room.code).emit('penaltyApplied', {
                playerIndex,
                playerName: socket.playerName,
                reason: 'İşler taş attı!',
                penalty: 101,
                scores: room.scores
            });

            Logger.warn(`⚠️ ${socket.playerName} işler taş attı! +101 ceza`);
        }

        const result = applyDiscardAndAdvance(room, playerIndex, tileIndex, { isPlayableTile });
        if (!result.ok) {
            socket.emit('error', { message: result.error || 'Taş atılamadı!' });
        }
    });

    socket.on('sortTiles', (data) => {
        const room = getRoom(socket);
        if (!room || !room.game) return;
        const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
        if (playerIndex === -1) return;
        room.game.playerTiles[playerIndex] = data.tiles;
        socket.emit('tilesSorted', { tiles: data.tiles });
    });

    socket.on('openHand', (data) => {
        const room = getRoom(socket);
        if (!room || !room.game) return;

        const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
        if (playerIndex === -1) return;

        if (room.game.playerStates[playerIndex].hasOpened) {
            socket.emit('error', { message: 'Zaten el açtınız!' });
            return;
        }

        const groups = data.groups;
        const score = data.score;
        const minScore = room.minimumOpenScore || 101;

        if (score < minScore) {
            socket.emit('error', {
                message: room.stackingMode
                    ? `Katlamalı mod: En az ${minScore} puan gerekli!`
                    : 'En az 101 puan gerekli!'
            });
            return;
        }

        const playerState = room.game.playerStates[playerIndex];
        const drawnFromDiscard = playerState.drawnFromDiscardTile;

        if (drawnFromDiscard) {
            const openedGroups = groups.map(groupIndices =>
                groupIndices.map(idx => room.game.playerTiles[playerIndex][idx])
            );

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
                const previousPlayer = (playerIndex + 3) % 4;
                room.game.discardPiles[previousPlayer].push(drawnFromDiscard);
                const tileIdx = room.game.playerTiles[playerIndex].findIndex(t => t.id === drawnFromDiscard.id);
                if (tileIdx !== -1) {
                    room.game.playerTiles[playerIndex].splice(tileIdx, 1);
                }
                playerState.drawnFromDiscardTile = null;
                socket.emit('error', { message: 'Yerden çektiğiniz taşı kullanmalısınız! Taş geri bırakıldı.' });
                socket.emit('tilesUpdated', { tiles: room.game.playerTiles[playerIndex] });
                return;
            }
            playerState.drawnFromDiscardTile = null;
        }

        const openedGroups = groups.map(groupIndices =>
            groupIndices.map(idx => room.game.playerTiles[playerIndex][idx])
        );

        const allIndices = groups.flat().sort((a, b) => b - a);
        allIndices.forEach(idx => {
            room.game.playerTiles[playerIndex].splice(idx, 1);
        });

        room.game.playerStates[playerIndex].hasOpened = true;
        room.game.playerStates[playerIndex].openType = 'normal';
        room.game.playerStates[playerIndex].openScore = score;
        room.game.playerStates[playerIndex].openedGroups = openedGroups;

        if (room.stackingMode) {
            room.minimumOpenScore = score + 1;
        }

        io.to(room.code).emit('handOpened', {
            playerIndex,
            playerName: socket.playerName,
            groups,
            openedGroups,
            score,
            tileCount: room.game.playerTiles[playerIndex].length,
            remainingTiles: room.game.playerTiles[playerIndex],
            minimumOpenScore: room.minimumOpenScore
        });
    });

    socket.on('openWithPairs', () => {
        const room = getRoom(socket);
        if (!room || !room.game) return;

        const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
        if (playerIndex === -1) return;

        const result = room.game.openWithPairs(playerIndex);
        if (!result.valid) {
            socket.emit('error', { message: result.message });
            return;
        }

        io.to(room.code).emit('pairsOpened', {
            playerIndex,
            playerName: socket.playerName,
            pairsCount: result.count,
            tileCount: room.game.playerTiles[playerIndex].length
        });
    });

    socket.on('addToGroup', (data) => {
        const room = getRoom(socket);
        if (!room || !room.game) return;

        const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
        if (playerIndex === -1) {
            socket.emit('error', { message: 'Oyuncu bulunamadı!' });
            return;
        }
        if (playerIndex !== room.game.currentPlayer) {
            socket.emit('error', { message: 'Sıra sizde değil!' });
            return;
        }
        if (!room.game.playerStates[playerIndex].hasOpened) {
            socket.emit('error', { message: 'Önce el açmalısınız!' });
            return;
        }

        const { tileIndex, targetPlayerIndex, targetGroupIndex, position } = data;
        const targetState = room.game.playerStates[targetPlayerIndex];
        if (!targetState || !targetState.openedGroups || !targetState.openedGroups[targetGroupIndex]) {
            socket.emit('error', { message: 'Hedef grup bulunamadı!' });
            return;
        }

        const tile = room.game.playerTiles[playerIndex][tileIndex];
        if (!tile) {
            socket.emit('error', { message: 'Taş bulunamadı!' });
            return;
        }

        const group = [...targetState.openedGroups[targetGroupIndex]];
        if (position === 'left') group.unshift(tile);
        else group.push(tile);

        if (!room.game.isValidGroup(group)) {
            socket.emit('error', { message: 'Bu taş bu gruba eklenemez!' });
            return;
        }

        room.game.playerTiles[playerIndex].splice(tileIndex, 1);
        targetState.openedGroups[targetGroupIndex] = group;

        io.to(room.code).emit('groupUpdated', {
            playerIndex,
            targetPlayerIndex,
            targetGroupIndex,
            group,
            playerTileCount: room.game.playerTiles[playerIndex].length,
            addedTile: tile,
            position
        });

        socket.emit('tilesUpdated', {
            tiles: room.game.playerTiles[playerIndex]
        });
    });

    socket.on('finishGame', () => {
        const room = getRoom(socket);
        if (!room || !room.game) return;

        const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
        if (playerIndex === -1 || playerIndex !== room.game.currentPlayer) {
            socket.emit('error', { message: 'Sıra sizde değil!' });
            return;
        }

        const result = room.game.checkFinish(playerIndex);
        if (!result.valid) {
            socket.emit('error', { message: result.message });
            return;
        }

        const points = room.game.calculatePoints(playerIndex, result);

        if (room.teamMode) {
            room.scores.team1 += points[0] + points[2];
            room.scores.team2 += points[1] + points[3];
        } else {
            room.players.forEach((p, i) => {
                room.scores[p.name] = (room.scores[p.name] || 0) + points[i];
            });
        }

        io.to(room.code).emit('gameFinished', {
            winner: playerIndex,
            winnerName: room.players[playerIndex].name,
            points,
            scores: room.scores,
            tiles: room.game.playerTiles,
            teamMode: room.teamMode
        });
        clearTurnTimer(room);
    });

    socket.on('newRound', () => {
        const room = getRoom(socket);
        if (!room) return;
        if (room.players.length === 4) {
            room.gameStarted = false;
            room.game = null;
            startGame(room);
        }
    });

    socket.on('throwTomato', (data) => {
        const room = getRoom(socket);
        if (!room) return;

        const throwerIndex = room.players.findIndex(p => p.socketId === socket.id);
        if (throwerIndex === -1) return;

        const targetPlayerIndex = data.targetPlayerIndex;
        const targetPlayer = room.players[targetPlayerIndex];
        if (!targetPlayer) return;

        const targetSocket = io.sockets.sockets.get(targetPlayer.socketId);
        if (targetSocket) {
            targetSocket.emit('tomatoHit', {
                throwerIndex,
                throwerName: data.throwerName
            });
        }

        room.players.forEach((player, index) => {
            if (index !== throwerIndex && index !== targetPlayerIndex) {
                const playerSocket = io.sockets.sockets.get(player.socketId);
                if (playerSocket) {
                    playerSocket.emit('tomatoThrown', {
                        throwerIndex,
                        targetPlayerIndex,
                        throwerName: data.throwerName
                    });
                }
            }
        });
    });

    socket.on('disconnect', () => {
        const room = getRoom(socket);
        if (!room) {
            Logger.socket(`Bilinmeyen socket ayrıldı: ${socket.id}`);
            return;
        }

        socket.leave(room.code);
        const player = room.players.find(p => p.socketId === socket.id);
        if (!player) return;

        player.disconnected = true;
        player.disconnectTime = Date.now();
        const roomCode = room.code;
        const playerName = player.name;

        Logger.socket(`Oyuncu ayrıldı: ${playerName} (oda ${roomCode})`);

        setTimeout(() => {
            const currentRoom = roomManager.getRoom(roomCode);
            if (!currentRoom) return;

            const currentPlayer = currentRoom.players.find(p => p.name === playerName);
            if (currentPlayer && currentPlayer.disconnected) {
                const index = currentRoom.players.indexOf(currentPlayer);
                if (index !== -1) {
                    currentRoom.players.splice(index, 1);
                    roomManager.updatePlayerPositions(currentRoom);

                    io.to(roomCode).emit('playerLeft', {
                        playerName,
                        players: publicPlayers(currentRoom)
                    });
                }

                if (currentRoom.players.length === 0) {
                    roomManager.deleteRoom(roomCode);
                    Logger.room(`🗑️ Oda ${roomCode} silindi`);
                }
            }
        }, 30000);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    Logger.title(`🚀 BERLIN OKEY SUNUCUSU: http://0.0.0.0:${PORT}`);
    Logger.info('Çoklu oda modu aktif (6 haneli kod)');
    if (process.env.WEBAPP_URL) {
        Logger.info(`Mini App URL: ${process.env.WEBAPP_URL}`);
    } else {
        Logger.warn('WEBAPP_URL boş — Telegram Mini App butonu çalışmaz');
    }
    startTelegramBot().catch((err) => {
        Logger.error(`Telegram bot: ${err.message}`);
    });
});
