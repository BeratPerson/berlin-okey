const styles = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    dim: "\x1b[2m",
    underscore: "\x1b[4m",
    blink: "\x1b[5m",
    reverse: "\x1b[7m",
    hidden: "\x1b[8m",

    fg: {
        black: "\x1b[30m",
        red: "\x1b[31m",
        green: "\x1b[32m",
        yellow: "\x1b[33m",
        blue: "\x1b[34m",
        magenta: "\x1b[35m",
        cyan: "\x1b[36m",
        white: "\x1b[37m",
        gray: "\x1b[90m",
    },
    bg: {
        black: "\x1b[40m",
        red: "\x1b[41m",
        green: "\x1b[42m",
        yellow: "\x1b[43m",
        blue: "\x1b[44m",
        magenta: "\x1b[45m",
        cyan: "\x1b[46m",
        white: "\x1b[47m"
    }
};

class Logger {
    static getTimestamp() {
        const now = new Date();
        return now.toLocaleTimeString('tr-TR', { hour12: false });
    }

    static info(message, ...args) {
        console.log(`${styles.fg.gray}[${this.getTimestamp()}]${styles.reset} ${styles.fg.cyan}ℹ️  INFO   ${styles.reset} ${message}`, ...args);
    }

    static success(message, ...args) {
        console.log(`${styles.fg.gray}[${this.getTimestamp()}]${styles.reset} ${styles.bright}${styles.fg.green}✅ SUCCESS${styles.reset} ${message}`, ...args);
    }

    static warn(message, ...args) {
        console.log(`${styles.fg.gray}[${this.getTimestamp()}]${styles.reset} ${styles.fg.yellow}⚠️  WARN   ${styles.reset} ${message}`, ...args);
    }

    static error(message, ...args) {
        console.log(`${styles.fg.gray}[${this.getTimestamp()}]${styles.reset} ${styles.bright}${styles.fg.red}❌ ERROR  ${styles.reset} ${message}`, ...args);
    }

    static socket(message, ...args) {
        console.log(`${styles.fg.gray}[${this.getTimestamp()}]${styles.reset} ${styles.fg.blue}🔌 SOCKET ${styles.reset} ${message}`, ...args);
    }

    static game(message, ...args) {
        console.log(`${styles.fg.gray}[${this.getTimestamp()}]${styles.reset} ${styles.fg.magenta}🎲 GAME   ${styles.reset} ${message}`, ...args);
    }

    static room(message, ...args) {
        console.log(`${styles.fg.gray}[${this.getTimestamp()}]${styles.reset} ${styles.fg.yellow}🏠 ROOM   ${styles.reset} ${message}`, ...args);
    }

    static debug(message, ...args) {
        console.log(`${styles.fg.gray}[${this.getTimestamp()}]${styles.reset} ${styles.dim}🐛 DEBUG  ${styles.reset} ${styles.dim}${message}${styles.reset}`, ...args);
    }

    static divider() {
        console.log(`${styles.fg.gray}─────────────────────────────────────────────────────────────${styles.reset}`);
    }

    static title(message) {
        this.divider();
        console.log(`${styles.bright}${styles.fg.white}${message.toUpperCase()}${styles.reset}`);
        this.divider();
    }
}

module.exports = Logger;
