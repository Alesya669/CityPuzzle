const express = require("express");
const db = require("../database/db");

const router = express.Router();

// Рейтинг маршрута: средняя оценка пользователей, а если их ещё нет —
// средневзвешенный рейтинг точек из 2ГИС.
const ROUTE_SELECT = `
    SELECT
        r.id, r.title, r.description, r.city, r.category,
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

function formatRoute(row) {
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
        popularity: row.popularity
    };
}

// GET /api/routes — каталог одобренных маршрутов
router.get("/", (req, res) => {
    try {
        const rows = db.prepare(`
            ${ROUTE_SELECT}
            WHERE r.status = 'approved'
            ORDER BY r.id
        `).all();

        res.json({ routes: rows.map(formatRoute) });
    } catch (error) {
        console.error("Ошибка получения маршрутов:", error);
        res.status(500).json({ error: "Не удалось загрузить маршруты" });
    }
});

// GET /api/routes/:id — маршрут с упорядоченными точками
router.get("/:id", (req, res) => {
    const id = Number.parseInt(req.params.id, 10);

    if (!Number.isInteger(id) || id < 1) {
        return res.status(400).json({ error: "Некорректный номер маршрута" });
    }

    try {
        const row = db.prepare(`
            ${ROUTE_SELECT}
            WHERE r.id = ? AND r.status = 'approved'
        `).get(id);

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

        res.json({ route: { ...formatRoute(row), points } });
    } catch (error) {
        console.error("Ошибка получения маршрута:", error);
        res.status(500).json({ error: "Не удалось загрузить маршрут" });
    }
});

module.exports = router;
