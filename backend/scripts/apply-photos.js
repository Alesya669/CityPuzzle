// Запуск из папки backend:  node scripts/apply-photos.js
// Читает data/photos.json и записывает пути к фото в базу.
// Пустые значения пропускаются; повторный запуск безопасен.
const db = require("../database/db");
const photos = require("../data/photos.json");

const setRoute = db.prepare("UPDATE routes SET image_url = ? WHERE title = ?");
const setPoint = db.prepare(`
    UPDATE route_points SET photo_url = ?
     WHERE sort_order = ?
       AND route_id = (SELECT id FROM routes WHERE title = ?)
`);

let routesUpdated = 0;
let pointsUpdated = 0;

db.transaction(() => {
    for (const route of photos.routes) {
        if (route.image) {
            routesUpdated += setRoute.run(route.image, route.title).changes;
        }
        for (const point of route.points) {
            if (point.photo) {
                pointsUpdated += setPoint.run(point.photo, point.order, route.title).changes;
            }
        }
    }
})();

console.log(`Обновлено фото маршрутов: ${routesUpdated}, фото точек: ${pointsUpdated}`);
