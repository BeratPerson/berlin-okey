/**
 * Ortak Socket.IO — online (Render) + lokal
 * Mini App her zaman aynı HTTPS origin'e bağlanır.
 */
(function (global) {
    function createSocket() {
        return global.io({
            path: '/socket.io',
            transports: ['websocket', 'polling'],
            upgrade: true,
            rememberUpgrade: true,
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 700,
            reconnectionDelayMax: 5000,
            timeout: 20000,
            forceNew: false
        });
    }

    global.BerlinSocket = {
        create: createSocket
    };
})(window);
