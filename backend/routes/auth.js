
const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../database/db");

const router = express.Router();

router.post("/register", (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({
            error: "Заполни имя пользователя, email и пароль"
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
        if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
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
        `).get(email.trim());

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

module.exports = router;
