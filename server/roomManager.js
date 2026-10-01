class RoomManager {
    constructor() {
        /** Aynı anda Telegram'da ~100 oyuncu (25 masa × 4) */
        this.MAX_CONCURRENT_PLAYERS = Number(process.env.MAX_PLAYERS) || 100;
        this.MAX_ROOMS = Number(process.env.MAX_ROOMS) || 40;
        this.PLAYERS_PER_TABLE = 4;
        this.rooms = new Map();
    }

    /** 6 basamaklı sayısal oda kodu (100000–999999) */
    generateRoomCode() {
        let code;
        do {
            code = String(Math.floor(100000 + Math.random() * 900000));
        } while (this.rooms.has(code));
        return code;
    }

    countActivePlayers() {
        let n = 0;
        for (const room of this.rooms.values()) {
            n += this.getActivePlayers(room).length;
        }
        return n;
    }

    countActiveRooms() {
        let n = 0;
        for (const room of this.rooms.values()) {
            if (this.getActivePlayers(room).length > 0) n += 1;
        }
        return n;
    }

    getCapacity() {
        const players = this.countActivePlayers();
        const rooms = this.countActiveRooms();
        return {
            players,
            maxPlayers: this.MAX_CONCURRENT_PLAYERS,
            rooms,
            maxRooms: this.MAX_ROOMS,
            tablesOpen: Math.max(0, Math.floor((this.MAX_CONCURRENT_PLAYERS - players) / this.PLAYERS_PER_TABLE)),
            full: players >= this.MAX_CONCURRENT_PLAYERS
        };
    }

    canAcceptPlayer() {
        return this.countActivePlayers() < this.MAX_CONCURRENT_PLAYERS;
    }

    canCreateRoom() {
        if (this.rooms.size >= this.MAX_ROOMS) return false;
        return this.canAcceptPlayer();
    }

    createRoom({ teamMode = false, stackingMode = false, penaltyMode = false, publicMatch = false } = {}) {
        if (!this.canCreateRoom()) {
            return null;
        }
        const code = this.generateRoomCode();
        const room = {
            code,
            players: [],
            teamMode: !!teamMode,
            stackingMode: !!stackingMode,
            penaltyMode: !!penaltyMode,
            publicMatch: !!publicMatch,
            minimumOpenScore: 101,
            gameStarted: false,
            game: null,
            scores: teamMode ? { team1: 0, team2: 0 } : {},
            createdAt: Date.now()
        };
        this.rooms.set(code, room);
        return room;
    }

    getRoom(code) {
        if (!code) return null;
        return this.rooms.get(String(code).trim()) || null;
    }

    normalizeCode(code) {
        const digits = String(code || '').replace(/\D/g, '');
        return digits.length === 6 ? digits : null;
    }

    getActivePlayers(room) {
        return room.players.filter(p => !p.disconnected);
    }

    /**
     * Hızlı eşleşme: aynı kurallarda, başlamamış, boş koltuğu olan halka açık oda.
     * En dolu odaya öncelik (daha hızlı 4 kişiye ulaşır).
     */
    findOpenPublicRoom({ teamMode = false, stackingMode = false, penaltyMode = false } = {}) {
        const candidates = [];
        for (const room of this.rooms.values()) {
            if (room.gameStarted) continue;
            if (!room.publicMatch) continue;
            if (!!room.teamMode !== !!teamMode) continue;
            if (!!room.stackingMode !== !!stackingMode) continue;
            if (!!room.penaltyMode !== !!penaltyMode) continue;
            const active = this.getActivePlayers(room).length;
            if (active > 0 && active < this.PLAYERS_PER_TABLE) {
                candidates.push({ room, active });
            }
        }
        candidates.sort((a, b) => b.active - a.active);
        return candidates.length ? candidates[0].room : null;
    }

    /** Boş halka açık odaya katıl veya yeni masa aç */
    findOrCreateQuickMatch(opts = {}) {
        const existing = this.findOpenPublicRoom(opts);
        if (existing) return { room: existing, created: false };

        const room = this.createRoom({ ...opts, publicMatch: true });
        if (!room) return { room: null, created: false };
        return { room, created: true };
    }

    updatePlayerPositions(room) {
        const positions = ['bottom', 'right', 'top', 'left'];
        const active = this.getActivePlayers(room);
        active.forEach((player, index) => {
            player.position = positions[index];
            player.index = index;
            if (room.teamMode) {
                player.team = index % 2 === 0 ? 1 : 2;
            } else {
                player.team = null;
            }
        });
    }

    addPlayer(room, socketId, playerName, avatar = '', telegramUserId = null) {
        const active = this.getActivePlayers(room);
        const positions = ['bottom', 'right', 'top', 'left'];
        const player = {
            socketId,
            name: playerName,
            position: positions[active.length],
            index: active.length,
            team: room.teamMode ? (active.length % 2 === 0 ? 1 : 2) : null,
            avatar: avatar || '',
            telegramUserId: telegramUserId ? String(telegramUserId) : null,
            disconnected: false,
            disconnectTime: null
        };
        room.players.push(player);
        if (!room.teamMode) {
            room.scores[playerName] = room.scores[playerName] || 0;
        }
        return player;
    }

    deleteRoom(code) {
        this.rooms.delete(code);
    }

    cleanupEmptyRooms() {
        for (const [code, room] of this.rooms.entries()) {
            if (room.players.length === 0) {
                this.rooms.delete(code);
            }
        }
    }

    /** Uzun süre bekleyen / terk edilmiş odaları temizle */
    cleanupStaleRooms(maxWaitMs = 45 * 60 * 1000) {
        const now = Date.now();
        for (const [code, room] of this.rooms.entries()) {
            const active = this.getActivePlayers(room);
            if (active.length === 0) {
                this.rooms.delete(code);
                continue;
            }
            if (!room.gameStarted && active.length < this.PLAYERS_PER_TABLE) {
                if (now - (room.createdAt || 0) > maxWaitMs) {
                    this.rooms.delete(code);
                }
            }
        }
    }
}

module.exports = RoomManager;
