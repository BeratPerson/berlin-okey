class RoomManager {
    constructor() {
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

    createRoom({ teamMode = false, stackingMode = false, penaltyMode = false } = {}) {
        const code = this.generateRoomCode();
        const room = {
            code,
            players: [],
            teamMode: !!teamMode,
            stackingMode: !!stackingMode,
            penaltyMode: !!penaltyMode,
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

    addPlayer(room, socketId, playerName, avatar = 'alibicim.png') {
        const active = this.getActivePlayers(room);
        const positions = ['bottom', 'right', 'top', 'left'];
        const player = {
            socketId,
            name: playerName,
            position: positions[active.length],
            index: active.length,
            team: room.teamMode ? (active.length % 2 === 0 ? 1 : 2) : null,
            avatar: avatar || 'alibicim.png',
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
}

module.exports = RoomManager;
