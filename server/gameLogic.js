// 101 Okey - Tam Kural Entegrasyonu
// Resmi kurallar: yerden alma, çift açma, taş işleme, puanlama, elden bitirme

const Logger = require('./logger');

class GameLogic {
    constructor() {
        this.tiles = [];
        this.playerTiles = [[], [], [], []];
        // Her oyuncunun kendi atık alanı (sağına atar, solundan çeker)
        this.discardPiles = [[], [], [], []];
        this.indicator = null;
        this.okey = null;
        this.currentPlayer = 0;
        this.hasDrawn = false;
        this.lastDrawnFromDiscard = false; // Yerden mi çekildi?

        // Oyuncu durumları
        this.playerStates = [
            this.createPlayerState(),
            this.createPlayerState(),
            this.createPlayerState(),
            this.createPlayerState()
        ];

        // Masa üzerindeki açılmış setler (herkesin erişebileceği)
        this.tableGroups = [];
    }

    createPlayerState() {
        return {
            hasOpened: false,       // El açtı mı?
            openType: null,         // 'normal' veya 'pairs'
            openedGroups: [],       // Açılan gruplar
            openScore: 0,           // Açılış skoru
            mustOpenThisTurn: false // Bu turda açmak zorunda mı? (yerden taş aldıysa)
        };
    }

    // Tüm taşları oluştur (106 taş)
    createTiles() {
        const colors = ['Kirmizi', 'Yesil', 'Mavi', 'Siyah'];
        this.tiles = [];

        // Her renk için 1-13 arası 2 set (104 taş)
        for (let set = 0; set < 2; set++) {
            for (let colorIndex = 0; colorIndex < colors.length; colorIndex++) {
                for (let num = 1; num <= 13; num++) {
                    this.tiles.push({
                        color: colors[colorIndex],
                        number: num,
                        isJoker: false,
                        isFakeJoker: false,
                        id: `${colors[colorIndex]}-${num}-${set}`
                    });
                }
            }
        }

        // 2 sahte okey (joker)
        this.tiles.push({ color: 'Sahte', number: 0, isJoker: false, isFakeJoker: true, id: 'Sahte-1' });
        this.tiles.push({ color: 'Sahte', number: 0, isJoker: false, isFakeJoker: true, id: 'Sahte-2' });
    }

    // Taşları karıştır
    shuffleTiles() {
        for (let i = this.tiles.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.tiles[i], this.tiles[j]] = [this.tiles[j], this.tiles[i]];
        }
    }

    // Oyunu başlat
    startGame(players) {
        this.createTiles();
        this.shuffleTiles();

        // Gösterge taşını belirle (sahte okey olmamalı)
        do {
            this.indicator = this.tiles.pop();
        } while (this.indicator.isFakeJoker);

        // Okey taşını belirle (göstergenin bir üstü)
        const okeyNumber = this.indicator.number === 13 ? 1 : this.indicator.number + 1;
        this.okey = {
            color: this.indicator.color,
            number: okeyNumber
        };

        // Taşları dağıt: Dağıtıcıya 22, diğerlerine 21 taş
        this.playerTiles = [[], [], [], []];

        // Oyuncu durumlarını sıfırla
        this.playerStates = [
            this.createPlayerState(),
            this.createPlayerState(),
            this.createPlayerState(),
            this.createPlayerState()
        ];
        this.tableGroups = [];

        // Rastgele başlayan oyuncu seç (dağıtıcı)
        this.currentPlayer = Math.floor(Math.random() * 4);

        // 101 Okey: Dağıtıcı 22 taş alır, diğerleri 21 taş
        for (let i = 0; i < 4; i++) {
            const count = (i === this.currentPlayer) ? 22 : 21;
            for (let j = 0; j < count; j++) {
                if (this.tiles.length > 0) {
                    this.playerTiles[i].push(this.tiles.pop());
                }
            }
        }

        this.hasDrawn = true; // Dağıtıcı zaten 22 taş aldı
        this.lastDrawnFromDiscard = false;
        // Her oyuncunun atık alanını sıfırla
        this.discardPiles = [[], [], [], []];

        Logger.game(`Oyun başladı! Dağıtıcı: ${players[this.currentPlayer].name}`);
        Logger.debug(`Gösterge: ${this.indicator.color} ${this.indicator.number}`);
        Logger.debug(`OKEY: ${this.okey.color} ${this.okey.number}`);
    }

    // Oyuncu taşlarını getir
    getPlayerTiles(playerIndex) {
        return this.playerTiles[playerIndex] || [];
    }

    // Yığından taş çek - Bu, soldaki atık taşı "öldürür"
    drawFromPile(playerIndex) {
        if (this.tiles.length === 0) return null;
        this.lastDrawnFromDiscard = false;

        // Soldaki oyuncunun son attığı taş artık "ölü" - çekilemez
        // Bunu takip etmek için deadCount kullanıyoruz
        const previousPlayer = (playerIndex + 3) % 4;
        const pile = this.discardPiles[previousPlayer];
        if (pile.length > 0 && !this.deadDiscards) {
            this.deadDiscards = {};
        }
        if (pile.length > 0) {
            // Bu pile'daki tüm taşları ölü olarak işaretle
            this.deadDiscards[previousPlayer] = pile.length;
        }

        return this.tiles.pop();
    }

    // Atılandan (yerden) taş çek - SOLUMUZDAKİ oyuncunun atık alanından
    drawFromDiscard(playerIndex) {
        // Solumuz = bir önceki oyuncu (saat yönünün tersi)
        const previousPlayer = (playerIndex + 3) % 4;
        const previousPile = this.discardPiles[previousPlayer];

        if (previousPile.length === 0) return null;

        // Ölü taş kontrolü - ortadan çekilince ölü olarak işaretlenen taşlar çekilemez
        const deadCount = this.deadDiscards?.[previousPlayer] || 0;
        if (previousPile.length <= deadCount) {
            // Tüm taşlar ölü, çekilecek taze taş yok
            return { error: 'Bu taş artık çekilemez!' };
        }

        const state = this.playerStates[playerIndex];

        // Çift açmış oyuncu yerden alamaz!
        if (state.hasOpened && state.openType === 'pairs') {
            return { error: 'Çift açan oyuncu yerden taş alamaz!' };
        }

        // Yerden taş alınca el açma zorunluluğu
        if (!state.hasOpened) {
            state.mustOpenThisTurn = true;
        }

        this.lastDrawnFromDiscard = true;

        // Yerden çekilen taşı kaydet (açarken kontrol için)
        const drawnTile = previousPile.pop();
        state.drawnFromDiscardTile = drawnTile; // Bu taş kullanılmalı!

        return drawnTile;
    }

    // Soldaki oyuncunun atık alanında taş var mı?
    hasDiscardToLeft(playerIndex) {
        const previousPlayer = (playerIndex + 3) % 4;
        return this.discardPiles[previousPlayer].length > 0;
    }

    // Soldaki oyuncunun son attığı taşı getir (göstermek için)
    getLeftDiscard(playerIndex) {
        const previousPlayer = (playerIndex + 3) % 4;
        const pile = this.discardPiles[previousPlayer];
        return pile.length > 0 ? pile[pile.length - 1] : null;
    }

    // Taş at - KENDİ atık alanımıza (sağımızdaki oyuncu çekebilir)
    discardTile(playerIndex, tileIndex) {
        const state = this.playerStates[playerIndex];

        // Yerden taş aldı ama el açmadıysa → Ceza durumu
        if (state.mustOpenThisTurn && !state.hasOpened) {
            return {
                error: 'Yerden taş aldınız! Elini açmak zorundasınız veya 101 ceza alırsınız.',
                penalty: true
            };
        }

        if (tileIndex < 0 || tileIndex >= this.playerTiles[playerIndex].length) {
            return null;
        }

        const tile = this.playerTiles[playerIndex].splice(tileIndex, 1)[0];
        // Kendi atık alanımıza at (sağımızdaki oyuncu buradan çeker)
        this.discardPiles[playerIndex].push(tile);

        // Sıra geçince zorunluluğu sıfırla
        state.mustOpenThisTurn = false;

        Logger.game(`Atılan taş: ${tile.color} ${tile.number} (Oyuncu ${playerIndex})`);
        return tile;
    }

    // Bir taşın okey olup olmadığını kontrol et (Joker olarak kullanılıp kullanılamayacağı)
    isOkey(tile) {
        // Sahte okeyler JOKER DEĞİLDİR, sabit taştır.
        if (tile.isFakeJoker) return false;
        // Gerçek okey taşı
        return tile.color === this.okey.color && tile.number === this.okey.number;
    }

    // Taşın efektif değerini al (Sahte okey için)
    getEffectiveTile(tile) {
        if (tile.isFakeJoker) {
            return { ...tile, color: this.okey.color, number: this.okey.number };
        }
        return tile;
    }

    // Taşın puan değeri
    getTileValue(tile) {
        if (tile.isFakeJoker) return this.okey.number;
        if (this.isOkey(tile)) return tile.number; // Okey ise değeri üzerindeki sayıdır
        return tile.number;
    }

    // Taşın ceza değeri (el bittiğinde)
    getTilePenalty(tile) {
        if (this.isOkey(tile)) return 101; // Okey cezası
        if (tile.isFakeJoker) return this.getEffectiveTile(tile).number;
        return tile.number;
    }

    // ============================================
    // SERI/PER DOĞRULAMA
    // ============================================

    // Seri kontrolü (aynı renk, ardışık sayılar)
    // NOT: 101 Okey'de 12-13-1 geçişi GEÇERSİZ!
    isValidSequence(tiles) {
        if (tiles.length < 3) return false;

        const effectiveTiles = tiles.map(t => this.getEffectiveTile(t));
        const nonOkeys = effectiveTiles.filter(t => !this.isOkey(t));

        if (nonOkeys.length === 0) return true; // Hepsi okey ise geçerli

        // Tüm normal taşlar aynı renkte mi?
        const color = nonOkeys[0].color;
        if (!nonOkeys.every(t => t.color === color)) return false;

        // Sayıları sırala
        const numbers = nonOkeys.map(t => t.number).sort((a, b) => a - b);

        // Joker sayısı
        let okeyCount = tiles.length - nonOkeys.length;

        // 101 Okey'de 12-13-1 geçişi YOK - sadece normal ardışık kontrol
        return this.checkConsecutive(numbers, okeyCount);
    }

    // Per kontrolü (farklı renkler, aynı sayı)
    isValidSet(tiles) {
        if (tiles.length < 3 || tiles.length > 4) return false;

        const effectiveTiles = tiles.map(t => this.getEffectiveTile(t));
        const nonOkeys = effectiveTiles.filter(t => !this.isOkey(t));

        if (nonOkeys.length === 0) return true; // Hepsi okey (teorik olarak mümkün)

        // Tüm taşlar aynı sayıda mı?
        const number = nonOkeys[0].number;
        if (!nonOkeys.every(t => t.number === number)) return false;

        // Renkler farklı mı?
        const colors = nonOkeys.map(t => t.color);
        const uniqueColors = new Set(colors);

        if (colors.length !== uniqueColors.size) return false;

        return true;
    }

    // Grup (seri veya per) doğrulama
    isValidGroup(tiles) {
        return this.isValidSequence(tiles) || this.isValidSet(tiles);
    }

    // Grup değerini hesapla
    calculateGroupValue(tiles) {
        let value = 0;
        let okeyPositions = [];

        // Normal taşların değerlerini topla
        const nonOkeys = tiles.filter(t => !this.isOkey(t));
        nonOkeys.forEach(t => value += t.number);

        // Okeylerin değerini hesapla (yerine geçtiği taş değeri)
        const okeyCount = tiles.length - nonOkeys.length;
        if (okeyCount > 0 && this.isValidSequence(tiles)) {
            // Seri için eksik sayıları bul
            const numbers = nonOkeys.map(t => t.number).sort((a, b) => a - b);
            const min = numbers[0];
            const max = numbers[numbers.length - 1];

            // Eksik sayıları bul
            for (let n = min; n <= max; n++) {
                if (!numbers.includes(n)) {
                    value += n;
                }
            }

            // Uçlara eklenen okeyler
            let remaining = okeyCount - (max - min + 1 - numbers.length);
            for (let i = 0; i < remaining; i++) {
                if (min - 1 - i >= 1) value += min - 1 - i;
                else if (max + 1 + i <= 13) value += max + 1 + i;
            }
        } else if (okeyCount > 0 && this.isValidSet(tiles)) {
            // Per için okey aynı sayı değerini alır
            const number = nonOkeys[0].number;
            value += number * okeyCount;
        }

        return value;
    }

    // ============================================
    // ÇİFT AÇMA
    // ============================================

    // Çift sayısını hesapla
    countPairs(tiles) {
        const pairs = [];
        const used = new Set();

        for (let i = 0; i < tiles.length; i++) {
            if (used.has(i)) continue;
            if (this.isOkey(tiles[i])) continue; // Okeyler çift sayılmaz

            for (let j = i + 1; j < tiles.length; j++) {
                if (used.has(j)) continue;
                if (this.isOkey(tiles[j])) continue;

                // Aynı renk ve sayı mı?
                if (tiles[i].color === tiles[j].color &&
                    tiles[i].number === tiles[j].number) {
                    pairs.push([tiles[i], tiles[j]]);
                    used.add(i);
                    used.add(j);
                    break;
                }
            }
        }

        return pairs;
    }

    // Çift açma kontrolü (el açmak için 5+ çift)
    canOpenWithPairs(playerIndex) {
        const tiles = this.playerTiles[playerIndex];
        const pairs = this.countPairs(tiles);

        return {
            valid: pairs.length >= 5,
            count: pairs.length,
            pairs: pairs
        };
    }

    // Çift ile bitirme kontrolü (7 çift gerekli)
    canFinishWithPairs(playerIndex) {
        const tiles = this.playerTiles[playerIndex];
        const pairs = this.countPairs(tiles);

        // 7 çift = 14 taş, 1 bitiş taşı = toplam 15 taş
        // Ama normalde 21 taş ile başlıyoruz, el açıldıktan sonra azalır
        return {
            valid: pairs.length >= 7,
            count: pairs.length,
            pairs: pairs
        };
    }

    // ============================================
    // EL AÇMA
    // ============================================

    // Normal el açma kontrolü (101+ puan)
    canOpenHand(playerIndex, groupsToOpen) {
        const state = this.playerStates[playerIndex];

        if (state.hasOpened) {
            return { valid: false, message: 'Zaten el açtınız!' };
        }

        // Çift açmayı kontrol et
        if (state.openType === 'pairs') {
            return { valid: false, message: 'Çift açtığınız için seri açamazsınız!' };
        }

        let totalScore = 0;
        for (const group of groupsToOpen) {
            if (!this.isValidGroup(group)) {
                return { valid: false, message: 'Geçersiz seri veya per!' };
            }
            totalScore += this.calculateGroupValue(group);
        }

        if (totalScore < 101) {
            return {
                valid: false,
                message: `101 puana ulaşamadınız! (Mevcut: ${totalScore})`
            };
        }

        return { valid: true, score: totalScore };
    }

    // El aç (normal - seri/per ile)
    openHand(playerIndex, groups) {
        const tiles = this.playerTiles[playerIndex];
        const groupTiles = groups.map(indices => indices.map(i => tiles[i]));

        const canOpen = this.canOpenHand(playerIndex, groupTiles);
        if (!canOpen.valid) return canOpen;

        const state = this.playerStates[playerIndex];
        state.hasOpened = true;
        state.openType = 'normal';
        state.openScore = canOpen.score;
        state.openedGroups = groupTiles;
        state.mustOpenThisTurn = false;

        // Masaya ekle
        groupTiles.forEach(group => {
            this.tableGroups.push({
                tiles: [...group],
                owner: playerIndex,
                type: this.isValidSequence(group) ? 'sequence' : 'set'
            });
        });

        // Taşları elden çıkar (büyükten küçüğe)
        const allIndices = groups.flat().sort((a, b) => b - a);
        allIndices.forEach(idx => tiles.splice(idx, 1));

        return { valid: true, score: canOpen.score };
    }

    // Çift ile el aç
    openWithPairs(playerIndex) {
        const check = this.canOpenWithPairs(playerIndex);
        if (!check.valid) {
            return { valid: false, message: `5 çift gerekli! (Mevcut: ${check.count})` };
        }

        const state = this.playerStates[playerIndex];
        state.hasOpened = true;
        state.openType = 'pairs';
        state.openedGroups = check.pairs;
        state.mustOpenThisTurn = false;

        state.mustOpenThisTurn = false;

        Logger.game(`Çift açıldı: Oyuncu ${playerIndex}, ${check.count} çift`);
        return { valid: true, count: check.count };
    }

    // ============================================
    // TAŞ İŞLEME (Masadaki setlere taş ekleme)
    // ============================================

    // Masadaki bir sete taş işleme
    addToTableGroup(playerIndex, groupIndex, tileIndices) {
        const state = this.playerStates[playerIndex];

        if (!state.hasOpened) {
            return { valid: false, message: 'Önce el açmalısınız!' };
        }

        if (groupIndex < 0 || groupIndex >= this.tableGroups.length) {
            return { valid: false, message: 'Geçersiz grup!' };
        }

        const group = this.tableGroups[groupIndex];
        const tiles = this.playerTiles[playerIndex];
        const tilesToAdd = tileIndices.map(i => tiles[i]);

        // Yeni grubu oluştur
        const newGroupTiles = [...group.tiles, ...tilesToAdd];

        // Geçerli mi kontrol et
        if (!this.isValidGroup(newGroupTiles)) {
            return { valid: false, message: 'Bu taşlar gruba uymuyor!' };
        }

        // Grubu güncelle
        group.tiles = newGroupTiles;

        // Taşları elden çıkar (büyükten küçüğe)
        const sortedIndices = [...tileIndices].sort((a, b) => b - a);
        sortedIndices.forEach(idx => tiles.splice(idx, 1));

        return { valid: true };
    }

    // ============================================
    // OYUNU BİTİRME
    // ============================================

    // Bitiriş kontrolü
    checkFinish(playerIndex) {
        const tiles = this.playerTiles[playerIndex];
        const state = this.playerStates[playerIndex];

        // 1. Çift ile bitirme (7 çift + 0 taş kalmalı... aslında son taş atılır)
        if (state.openType === 'pairs') {
            const pairsCheck = this.canFinishWithPairs(playerIndex);
            if (pairsCheck.valid) {
                return {
                    valid: true,
                    type: 'pairs',
                    message: 'Çiftlerle bitirdi!'
                };
            }
        }

        // 2. Normal bitirme - elden bitirme
        // Tüm taşlar geçerli gruplar oluşturmalı (son 1 taş atılır)
        if (tiles.length <= 1) {
            return {
                valid: true,
                type: state.hasOpened ? 'normal' : 'instant',
                message: state.hasOpened ? 'Oyunu bitirdi!' : 'Elden bitirdi!'
            };
        }

        // 3. Elden bitirme (101 tutmasa bile tek seferde tüm taşları indir)
        const instantFinish = this.checkInstantFinish(tiles);
        if (instantFinish.valid) {
            return {
                valid: true,
                type: 'instant',
                groups: instantFinish.groups,
                message: 'Elden bitirdi!'
            };
        }

        return { valid: false, message: 'Henüz bitirme şartları sağlanmadı!' };
    }

    // Elden bitirme kontrolü (tüm taşları tek seferde indirme)
    checkInstantFinish(tiles) {
        // Son 1 taş (bitiş taşı) hariç tümü grup oluşturmalı
        if (tiles.length < 7) return { valid: false }; // En az 2 grup (6 taş) + 1 bitiş

        // Tüm olası kombinasyonları dene
        for (let skipIndex = 0; skipIndex < tiles.length; skipIndex++) {
            const remaining = tiles.filter((_, i) => i !== skipIndex);
            const groups = this.findAllGroups(remaining);

            if (groups && groups.usedCount === remaining.length) {
                return { valid: true, groups: groups.groups, skipIndex };
            }
        }

        return { valid: false };
    }

    // Tüm grupları bul (backtracking)
    findAllGroups(tiles) {
        return this.backtrackGroups([...tiles], []);
    }

    backtrackGroups(remaining, currentGroups) {
        if (remaining.length === 0) {
            return {
                groups: currentGroups,
                usedCount: currentGroups.reduce((sum, g) => sum + g.length, 0)
            };
        }

        if (remaining.length < 3) return null;

        // Serileri dene (aynı renk)
        const byColor = {};
        remaining.forEach((tile, idx) => {
            const key = this.isOkey(tile) ? 'okey' : tile.color;
            if (!byColor[key]) byColor[key] = [];
            byColor[key].push({ tile, idx });
        });

        for (const color of ['Kirmizi', 'Sari', 'Mavi', 'Siyah']) {
            const colorTiles = (byColor[color] || []).concat(byColor['okey'] || []);
            if (colorTiles.length < 3) continue;

            // Sayıya göre sırala
            colorTiles.sort((a, b) => {
                if (this.isOkey(a.tile)) return 1;
                if (this.isOkey(b.tile)) return -1;
                return a.tile.number - b.tile.number;
            });

            // 3+ uzunlukta seriler dene
            for (let len = 3; len <= Math.min(13, colorTiles.length); len++) {
                for (let start = 0; start <= colorTiles.length - len; start++) {
                    const group = colorTiles.slice(start, start + len).map(x => x.tile);

                    if (this.isValidSequence(group)) {
                        const newRemaining = remaining.filter(t =>
                            !group.some(g => g.id === t.id)
                        );
                        const result = this.backtrackGroups(newRemaining, [...currentGroups, group]);
                        if (result) return result;
                    }
                }
            }
        }

        // Perleri dene (aynı sayı)
        const byNumber = {};
        remaining.forEach((tile, idx) => {
            if (this.isOkey(tile)) return;
            if (!byNumber[tile.number]) byNumber[tile.number] = [];
            byNumber[tile.number].push({ tile, idx });
        });

        for (const num in byNumber) {
            const numTiles = byNumber[num].concat(
                (byColor['okey'] || [])
            );

            if (numTiles.length >= 3) {
                for (let len = 3; len <= 4 && len <= numTiles.length; len++) {
                    const group = numTiles.slice(0, len).map(x => x.tile);

                    if (this.isValidSet(group)) {
                        const newRemaining = remaining.filter(t =>
                            !group.some(g => g.id === t.id)
                        );
                        const result = this.backtrackGroups(newRemaining, [...currentGroups, group]);
                        if (result) return result;
                    }
                }
            }
        }

        return null;
    }

    // ============================================
    // PUANLAMA
    // ============================================

    calculatePoints(winnerIndex, result) {
        const points = [0, 0, 0, 0];

        // Kazanan bonusları
        let winnerBonus = -101; // Normal bitiş

        // Son atılan taş okey mi? (Kazananın attığı son taş)
        const winnerPile = this.discardPiles[winnerIndex];
        const lastDiscarded = winnerPile.length > 0 ? winnerPile[winnerPile.length - 1] : null;
        const finishedWithOkey = lastDiscarded && this.isOkey(lastDiscarded);

        // Bitiş türüne göre bonus
        switch (result.type) {
            case 'normal':
                winnerBonus = finishedWithOkey ? -202 : -101;
                break;
            case 'instant': // Elden bitiş
                winnerBonus = finishedWithOkey ? -404 : -202;
                break;
            case 'pairs': // Çift ile bitiş
                winnerBonus = finishedWithOkey ? -404 : -202;
                break;
        }

        points[winnerIndex] = winnerBonus;
        Logger.success(`Kazanan (Index ${winnerIndex}): ${winnerBonus} Puan (Bitiş: ${result.type})`);

        // Kaybedenlerin cezaları
        for (let i = 0; i < 4; i++) {
            if (i === winnerIndex) continue;

            const state = this.playerStates[i];
            let penalty = 0;

            if (!state.hasOpened) {
                // El açılmamış cezası
                if (finishedWithOkey) {
                    penalty = 808; // Okey ile bitiş + açılmamış
                } else if (result.type === 'instant') {
                    penalty = 404; // Elden bitiş + açılmamış
                } else {
                    penalty = 202; // Normal bitiş + açılmamış (bazı kurallarda 404)
                }
            } else {
                // El açılmış - kalan taşların toplamı
                let hasOkeyInHand = false;
                for (const tile of this.playerTiles[i]) {
                    penalty += this.getTilePenalty(tile);
                    // Elde okey var mı?
                    if (this.isOkey(tile)) {
                        hasOkeyInHand = true;
                    }
                }

                // OKEY ELDE KALMA CEZASI: +101 ekstra
                if (hasOkeyInHand) {
                    penalty += 101;
                    Logger.warning(`⚠️ Oyuncu ${i} elinde okey ile kaldı! +101 ekstra ceza`);
                }

                // Çarpan (okey ile bitiş = 2x, elden bitiş = 2x)
                if (finishedWithOkey) penalty *= 2;
                if (result.type === 'instant') penalty *= 2;
                if (result.type === 'pairs') penalty *= 2;
            }

            points[i] = penalty;
        }

        return points;
    }

    // ============================================
    // YARDIMCI FONKSİYONLAR
    // ============================================

    // Kalan taş sayısı
    getRemainingTileCount() {
        return this.tiles.length;
    }

    // Oyuncu durumunu getir
    getPlayerState(playerIndex) {
        return this.playerStates[playerIndex];
    }

    // Masadaki grupları getir
    getTableGroups() {
        return this.tableGroups;
    }
}

module.exports = GameLogic;
