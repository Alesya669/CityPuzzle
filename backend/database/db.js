const Database = require("better-sqlite3");
const path = require("path");

function routePointsSql(name) {
    return `
    CREATE TABLE IF NOT EXISTS ${name} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        route_id INTEGER NOT NULL,
        sort_order INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        address TEXT,
        latitude REAL,
        longitude REAL,
        photo_url TEXT,
        gis_url TEXT,
        rating_2gis REAL,
        ratings_count_2gis INTEGER,
        hours TEXT,
        UNIQUE (route_id, sort_order),
        FOREIGN KEY (route_id) REFERENCES routes(id)
            ON DELETE CASCADE
    );`;
}

const dbPath = path.join(__dirname, "cityroutes.sqlite");
const db = new Database(dbPath);

db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user'
        CHECK (role IN ('user', 'moderator')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS routes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    city TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
    moderation_comment TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    route_id INTEGER NOT NULL,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, route_id),
    FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE,
    FOREIGN KEY (route_id) REFERENCES routes(id)
        ON DELETE CASCADE
);

`);

db.exec(routePointsSql("route_points"));

db.exec(`
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS favorites (
    user_id INTEGER NOT NULL,
    route_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, route_id),
    FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE,
    FOREIGN KEY (route_id) REFERENCES routes(id)
        ON DELETE CASCADE
);
`);

// Миграция: координаты точки теперь необязательны (бывают маршруты без координат).
// В SQLite нельзя снять NOT NULL через ALTER, поэтому пересоздаём таблицу.
const latitudeColumn = db
    .prepare("PRAGMA table_info(route_points)")
    .all()
    .find((col) => col.name === "latitude");

if (latitudeColumn && latitudeColumn.notnull) {
    db.exec("BEGIN");
    try {
        db.exec(routePointsSql("route_points_new"));
        db.exec(`
            INSERT INTO route_points_new
            SELECT id, route_id, sort_order, title, description, address,
                   latitude, longitude, photo_url, gis_url, rating_2gis,
                   ratings_count_2gis, hours
            FROM route_points
        `);
        db.exec("DROP TABLE route_points");
        db.exec("ALTER TABLE route_points_new RENAME TO route_points");
        db.exec("COMMIT");
    } catch (error) {
        db.exec("ROLLBACK");
        throw error;
    }
}

// Мини-миграция: новые колонки в уже существующей таблице routes
function addColumnIfMissing(table, column, definition) {
    const exists = db
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .some((col) => col.name === column);

    if (!exists) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
}

addColumnIfMissing("routes", "category", "TEXT");
addColumnIfMissing("routes", "distance_km", "REAL");
addColumnIfMissing("routes", "image_url", "TEXT");

console.log("База CityRoutes готова.");

module.exports = db;
