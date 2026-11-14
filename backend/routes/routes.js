const express = require("express");
const db = require("../database/db");
const { optionalAuth, requireAuth } = require("../middleware/auth");

const router = express.Router();

// Рейтинг маршрута: средняя оценка пользователей, а если их ещё нет —
// средневзвешенный рейтинг точек из 2ГИС.
const ROUTE_SELECT = `
    SELECT
        r.id, r.user_id, r.title, r.description, r.city, r.category,
        r.duration_minutes AS duration,
        r.distance_km AS distance,
        r.image_url AS image,
        (SELECT COUNT(*) FROM route_points p WHERE p.route_id = r.id) AS points_count,
        (SELECT COUNT(*) FROM ratings x WHERE x.route_id = r.id) AS user_ratings_count,
        (SELECT AVG(x.rating) FROM ratings x WHERE x.route_id = r.id) AS user_rating,
        (SELECT SUM(p.rating_2gis * p.ratings_count_2gis) * 1.0 / SUM(p.ratings_count_2gis)
           FROM route_points p
          WHERE p.route_id = r.id AND p.rating_2gis IS NOT NULL
            AND p.ratings_count_2gis > 0) AS gis_rating,
        (SELECT COALESCE(SUM(p.ratings_count_2gis), 0)
           FROM route_points p WHERE p.route_id = r.id) AS popularity
    FROM routes r
`;

function formatRoute(row, isFavorite = false) {
    const hasUserRating = row.user_ratings_count > 0;
    const rating = hasUserRating ? row.user_rating : row.gis_rating;

    return {
        id: row.id,
        title: row.title,
        description: row.description,
        city: row.city,
        category: row.category || "Прогулка",
        duration: row.duration,
        distance: row.distance,
        image: row.image,
        pointsCount: row.points_count,
        rating: rating === null ? null : Math.round(rating * 10) / 10,
        ratingSource: hasUserRating ? "users" : "2gis",
        userRatingsCount: row.user_ratings_count,
        popularity: row.popularity,
        isFavorite
    };
}

function favoriteIds(user) {
    if (!user) return new Set();

    return new Set(
        db.prepare("SELECT route_id FROM favorites WHERE user_id = ?")
            .all(user.id)
            .map((row) => row.route_id)
    );
}

function parseId(req, res) {
    const id = Number.parseInt(req.params.id, 10);

    if (!Number.isInteger(id) || id < 1) {
        res.status(400).json({ error: "Некорректный номер маршрута" });
        return null;
    }

    return id;
}

function findApprovedRoute(id) {
    return db.prepare(`${ROUTE_SELECT} WHERE r.id = ? AND r.status = 'approved'`).get(id);
}

// GET /api/routes — каталог одобренных маршрутов
router.get("/", optionalAuth, (req, res) => {
    try {
        const rows = db.prepare(`
            ${ROUTE_SELECT}
            WHERE r.status = 'approved'
            ORDER BY r.id
        `).all();

        const favorites = favoriteIds(req.user);

        res.json({ routes: rows.map((row) => formatRoute(row, favorites.has(row.id))) });
    } catch (error) {
        console.error("Ошибка получения маршрутов:", error);
        res.status(500).json({ error: "Не удалось загрузить маршруты" });
    }
});

// GET /api/routes/favorites — избранное текущего пользователя
// (объявлен до /:id, иначе «favorites» воспринялось бы как номер маршрута)
router.get("/favorites", requireAuth, (req, res) => {
    try {
        const rows = db.prepare(`
            ${ROUTE_SELECT}
            WHERE r.status = 'approved'
              AND r.id IN (SELECT route_id FROM favorites WHERE user_id = ?)
            ORDER BY r.id
        `).all(req.user.id);

        res.json({ routes: rows.map((row) => formatRoute(row, true)) });
    } catch (error) {
        console.error("Ошибка получения избранного:", error);
        res.status(500).json({ error: "Не удалось загрузить избранное" });
    }
});

// GET /api/routes/:id — маршрут с упорядоченными точками
router.get("/:id", optionalAuth, (req, res) => {
    const id = parseId(req, res);
    if (id === null) return;

    try {
        const row = findApprovedRoute(id);

        if (!row) {
            return res.status(404).json({ error: "Маршрут не найден" });
        }

        const points = db.prepare(`
            SELECT sort_order AS "order", title, description, address,
                   latitude, longitude, photo_url AS photo, gis_url AS gisUrl,
                   rating_2gis AS rating, ratings_count_2gis AS ratingsCount,
                   hours
            FROM route_points
            WHERE route_id = ?
            ORDER BY sort_order
        `).all(id);

        let myRating = null;
        let isFavorite = false;

        if (req.user) {
            const mine = db.prepare(
                "SELECT rating FROM ratings WHERE user_id = ? AND route_id = ?"
            ).get(req.user.id, id);
            myRating = mine ? mine.rating : null;

            isFavorite = Boolean(db.prepare(
                "SELECT 1 FROM favorites WHERE user_id = ? AND route_id = ?"
            ).get(req.user.id, id));
        }

        res.json({ route: { ...formatRoute(row, isFavorite), points, myRating } });
    } catch (error) {
        console.error("Ошибка получения маршрута:", error);
        res.status(500).json({ error: "Не удалось загрузить маршрут" });
    }
});

// POST /api/routes/:id/rating — поставить или изменить свою оценку (1–5)
router.post("/:id/rating", requireAuth, (req, res) => {
    const id = parseId(req, res);
    if (id === null) return;

    const rating = req.body && req.body.rating;

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return res.status(400).json({ error: "Оценка должна быть целым числом от 1 до 5" });
    }

    try {
        const route = findApprovedRoute(id);

        if (!route) {
            return res.status(404).json({ error: "Маршрут не найден" });
        }

        if (route.user_id === req.user.id) {
            return res.status(403).json({ error: "Нельзя оценивать собственный маршрут" });
        }

        db.prepare(`
            INSERT INTO ratings (user_id, route_id, rating)
            VALUES (?, ?, ?)
            ON CONFLICT (user_id, route_id)
            DO UPDATE SET rating = excluded.rating, created_at = CURRENT_TIMESTAMP
        `).run(req.user.id, id, rating);

        const favorites = favoriteIds(req.user);

        res.json({
            route: formatRoute(findApprovedRoute(id), favorites.has(id)),
            myRating: rating
        });
    } catch (error) {
        console.error("Ошибка сохранения оценки:", error);
        res.status(500).json({ error: "Не удалось сохранить оценку" });
    }
});

// PUT /api/routes/:id/favorite — добавить в избранное
router.put("/:id/favorite", requireAuth, (req, res) => {
    const id = parseId(req, res);
    if (id === null) return;

    try {
        if (!findApprovedRoute(id)) {
            return res.status(404).json({ error: "Маршрут не найден" });
        }

        db.prepare("INSERT OR IGNORE INTO favorites (user_id, route_id) VALUES (?, ?)")
            .run(req.user.id, id);

        res.json({ isFavorite: true });
    } catch (error) {
        console.error("Ошибка добавления в избранное:", error);
        res.status(500).json({ error: "Не удалось добавить в избранное" });
    }
});

// DELETE /api/routes/:id/favorite — убрать из избранного
router.delete("/:id/favorite", requireAuth, (req, res) => {
    const id = parseId(req, res);
    if (id === null) return;

    try {
        db.prepare("DELETE FROM favorites WHERE user_id = ? AND route_id = ?")
            .run(req.user.id, id);

        res.json({ isFavorite: false });
    } catch (error) {
        console.error("Ошибка удаления из избранного:", error);
        res.status(500).json({ error: "Не удалось убрать из избранного" });
    }
});

module.exports = router;
