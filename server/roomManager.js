class RoomManager {
    constructor() {
        this.rooms = new Map();
    }

    generateRoomCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    createRoom(teamMode = false) {
        let code = this.generateRoomCode();
        while (this.rooms.has(code)) {
            code = this.generateRoomCode();
        }

        const room = {
            code: code,
            players: [],
            teamMode: teamMode,
            gameStarted: false,
            game: null,
            scores: teamMode ? { team1: 0, team2: 0 } : {},
            createdAt: Date.now()
        };

        this.rooms.set(code, room);
        return room;
    }

    getRoom(code) {
        return this.rooms.get(code);
    }

    joinRoom(code, socketId, playerName, avatar = 'alibicim.png') {
        const room = this.rooms.get(code);
        if (!room) return null;

        const positions = ['bottom', 'right', 'top', 'left'];
        const position = positions[room.players.length];

        // Takım belirleme: 0 ve 2 = Takım 1, 1 ve 3 = Takım 2
        const team = room.teamMode ? (room.players.length % 2 === 0 ? 1 : 2) : null;

        const player = {
            socketId: socketId,
            name: playerName,
            position: position,
            index: room.players.length,
            team: team,
            avatar: avatar
        };

        room.players.push(player);

        if (!room.teamMode) {
            room.scores[playerName] = 0;
        }

        return player;
    }

    leaveRoom(code, socketId) {
        const room = this.rooms.get(code);
        if (!room) return;

        const player = room.players.find(p => p.socketId === socketId);
        if (player) {
            // Oyuncuyu hemen silme - disconnected olarak işaretle
            player.disconnected = true;
            player.disconnectTime = Date.now();
        }
    }

    // Gerçekten silmek için kullan (timeout sonrası)
    removePlayer(code, socketId) {
        const room = this.rooms.get(code);
        if (!room) return;

        const index = room.players.findIndex(p => p.socketId === socketId);
        if (index !== -1) {
            room.players.splice(index, 1);
        }
    }

    // Oyuncunun geri bağlanmasını işle
    reconnectPlayer(code, playerName, newSocketId) {
        const room = this.rooms.get(code);
        if (!room) return null;

        const player = room.players.find(p => p.name === playerName);
        if (player) {
            player.socketId = newSocketId;
            player.disconnected = false;
            player.disconnectTime = null;
            return player;
        }
        return null;
    }

    deleteRoom(code) {
        this.rooms.delete(code);
    }

    getRooms() {
        return Array.from(this.rooms.values()).map(room => ({
            code: room.code,
            playerCount: room.players.filter(p => !p.disconnected).length,
            teamMode: room.teamMode,
            gameStarted: room.gameStarted
        }));
    }
}

module.exports = RoomManager;
