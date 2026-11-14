// Запуск из папки backend:  node scripts/update-v2.js
// Правки для уже заполненной базы: переименование маршрута и исправление
// ошибочных ссылок 2ГИС. Повторный запуск безопасен.
const db = require("../database/db");

const WRONG = "https://2gis.ru/krasnodar/geo/70030076280004966";

const renamed = db.prepare(`
    UPDATE routes
       SET title = 'Парк Краснодар',
           description = 'Фонтаны, инсталляции, амфитеатр и смотровая площадка парка Краснодар.'
     WHERE title = 'Арт-объекты и фонтаны парка'
`).run();

// Ссылка принадлежит «Объятиям человечества»; у точек «Солнечного острова»
// она оказалась скопирована ошибочно.
const links = db.prepare(`
    UPDATE route_points
       SET gis_url = NULL
     WHERE gis_url = ?
       AND route_id IN (SELECT id FROM routes WHERE title LIKE 'Парк «Солнечный%')
`).run(WRONG);

console.log(`Переименовано маршрутов: ${renamed.changes}`);
console.log(`Исправлено ссылок: ${links.changes}`);
