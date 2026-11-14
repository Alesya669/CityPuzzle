// Запуск из папки backend:  node scripts/seed.js
// Заполняет БД маршрутами из data/seed-routes.json.
// Повторный запуск безопасен: уже существующие маршруты (по названию) пропускаются.
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const db = require("../database/db");
const seed = require("../data/seed-routes.json");

const WALK_SPEED_KMH = 4.5;
const MINUTES_PER_STOP = 5;
const DETOUR_FACTOR = 1.3; // по прямой -> примерно по тротуарам

function haversineKm(a, b) {
    const R = 6371;
    const rad = (d) => (d * Math.PI) / 180;
    const dLat = rad(b.latitude - a.latitude);
    const dLon = rad(b.longitude - a.longitude);
    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

function estimate(route) {
    const points = route.points;

    // Без координат расстояние посчитать нельзя: берём время из данных маршрута
    if (points.some((p) => p.latitude == null || p.longitude == null)) {
        return {
            distance: null,
            duration: route.duration_minutes || points.length * 20
        };
    }

    let km = 0;
    for (let i = 0; i < points.length - 1; i++) {
        km += haversineKm(points[i], points[i + 1]);
    }
    km *= DETOUR_FACTOR;
    const minutes = (km / WALK_SPEED_KMH) * 60 + points.length * MINUTES_PER_STOP;
    return {
        distance: Math.round(km * 10) / 10,
        duration: Math.round(minutes / 5) * 5
    };
}

// Системный аккаунт-владелец стартовых маршрутов (войти под ним нельзя)
function getSystemUserId() {
    const existing = db.prepare("SELECT id FROM users WHERE username = ?").get("CityRoutes");
    if (existing) return existing.id;

    const randomPassword = crypto.randomBytes(32).toString("hex");
    return db.prepare(`
        INSERT INTO users (username, email, password_hash, role)
        VALUES (?, ?, ?, 'moderator')
    `).run("CityRoutes", "system@cityroutes.local", bcrypt.hashSync(randomPassword, 10))
        .lastInsertRowid;
}

const insertRoute = db.prepare(`
    INSERT INTO routes
        (user_id, title, description, city, category, duration_minutes,
         distance_km, image_url, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved')
`);

const insertPoint = db.prepare(`
    INSERT INTO route_points
        (route_id, sort_order, title, description, address, latitude, longitude,
         photo_url, gis_url, rating_2gis, ratings_count_2gis, hours)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const importAll = db.transaction(() => {
    const userId = getSystemUserId();
    let added = 0;

    for (const route of seed.routes) {
        const exists = db.prepare("SELECT id FROM routes WHERE title = ?").get(route.title);
        if (exists) {
            console.log(`Пропущен (уже есть): ${route.title}`);
            continue;
        }

        const { distance, duration } = estimate(route);
        const routeId = insertRoute.run(
            userId, route.title, route.description, route.city, route.category,
            duration, distance, route.image_url
        ).lastInsertRowid;

        route.points.forEach((p, index) => {
            insertPoint.run(
                routeId, index + 1, p.title, p.description, p.address,
                p.latitude, p.longitude, p.photo_url, p.gis_url,
                p.rating_2gis, p.ratings_count_2gis, p.hours
            );
        });

        console.log(`Добавлен: ${route.title} — ${route.points.length} точек, ${distance ?? "—"} км, ${duration} мин`);
        added++;
    }

    return added;
});

console.log(`Готово, добавлено маршрутов: ${importAll()}`);
