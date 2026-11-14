
const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../database/db");
const { createSession, readToken, deleteSession, requireAuth } = require("../middleware/auth");

const router = express.Router();

router.post("/register", (req, res) => {
    const { username, email, password } = req.body;

    if (
        typeof username !== "string" ||
        typeof email !== "string" ||
        typeof password !== "string" ||
        !username.trim() || !email.trim() || !password
    ) {
        return res.status(400).json({
            error: "Заполни имя пользователя, email и пароль"
        });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        return res.status(400).json({
            error: "Введи корректный email"
        });
    }

    if (password.length < 8) {
        return res.status(400).json({
            error: "Пароль должен содержать минимум 8 символов"
        });
    }

    try {
        const passwordHash = bcrypt.hashSync(password, 10);

        const result = db.prepare(`
            INSERT INTO users (username, email, password_hash)
            VALUES (?, ?, ?)
        `).run(username.trim(), email.trim().toLowerCase(), passwordHash);

        return res.status(201).json({
            message: "Регистрация успешна",
            user: {
                id: result.lastInsertRowid,
                username: username.trim(),
                email: email.trim().toLowerCase()
            }
        });
    } catch (error) {
        if (
            error.code === "SQLITE_CONSTRAINT_UNIQUE" ||
            /UNIQUE constraint failed/.test(String(error.message))
        ) {
            return res.status(409).json({
                error: "Такое имя пользователя или email уже зарегистрированы"
            });
        }

        console.error(error);
        return res.status(500).json({
            error: "Ошибка при регистрации"
        });
    }
});

router.post("/login", async (req, res) => {
    const { email, password } = req.body;

    if (
        typeof email !== "string" ||
        typeof password !== "string" ||
        !email.trim() ||
        !password
    ) {
        return res.status(400).json({
            error: "Введи почту и пароль"
        });
    }

    try {
        const user = db.prepare(`
            SELECT id, username, email, password_hash, role
            FROM users
            WHERE email = ?
        `).get(email.trim().toLowerCase());

        if (!user) {
            return res.status(401).json({
                error: "Неверная почта или пароль"
            });
        }

        const passwordMatches = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!passwordMatches) {
            return res.status(401).json({
                error: "Неверная почта или пароль"
            });
        }

        res.json({
            message: "Вход выполнен успешно",
            token: createSession(user.id),
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        console.error("Ошибка входа:", error);

        res.status(500).json({
            error: "Ошибка сервера при входе"
        });
    }
});

router.get("/me", requireAuth, (req, res) => {
    res.json({ user: req.user });
});

router.post("/logout", (req, res) => {
    const token = readToken(req);
    if (token) deleteSession(token);
    res.json({ message: "Вы вышли из аккаунта" });
});

module.exports = router;
