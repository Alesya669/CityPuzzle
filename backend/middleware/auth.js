const crypto = require("crypto");
const db = require("../database/db");

const SESSION_DAYS = 30;

// В базе хранится только хеш токена: утечка базы не даёт войти в аккаунт
function hashToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
}

function createSession(userId) {
    db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();

    const token = crypto.randomBytes(32).toString("hex");

    db.prepare(`
        INSERT INTO sessions (token_hash, user_id, expires_at)
        VALUES (?, ?, datetime('now', ?))
    `).run(hashToken(token), userId, `+${SESSION_DAYS} days`);

    return token;
}

function readToken(req) {
    const header = req.headers.authorization || "";
    const match = header.match(/^Bearer ([a-f0-9]{64})$/i);
    return match ? match[1].toLowerCase() : null;
}

// Пользователь и его роль всегда берутся из базы, а не из браузера
function findUser(req) {
    const token = readToken(req);
    if (!token) return null;

    return db.prepare(`
        SELECT u.id, u.username, u.email, u.role
          FROM sessions s
          JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > datetime('now')
    `).get(hashToken(token)) || null;
}

function deleteSession(token) {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
}

// Добавляет req.user, если вход выполнен, но не требует его
function optionalAuth(req, res, next) {
    req.user = findUser(req);
    next();
}

function requireAuth(req, res, next) {
    const user = findUser(req);

    if (!user) {
        return res.status(401).json({ error: "Нужно войти в аккаунт" });
    }

    req.user = user;
    next();
}

module.exports = { createSession, readToken, deleteSession, optionalAuth, requireAuth };
