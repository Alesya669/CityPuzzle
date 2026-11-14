const cors = require("cors");
const express = require("express");
const path = require("path");
const db = require("./database/db");

const app = express();
app.use(cors());

const PORT = 3000;

app.use(express.json());

const authRoutes = require("./routes/auth");
app.use("/api/auth", authRoutes);
console.log("Маршруты авторизации подключены");

const routeCatalog = require("./routes/routes");
app.use("/api/routes", routeCatalog);
console.log("Маршруты каталога подключены");

app.post("/api/test", (req, res) => {
    res.json({ message: "POST работает" });
});

app.get("/api/health", (req, res) => {
    res.json({
        status: "ok",
        message: "CityPuzzle backend работает!"
    });
});

// Сайт открывается по адресу http://localhost:3000 — так вход сохраняется
// между страницами, а запросы идут на тот же адрес, что и сам сайт.
app.use(express.static(path.join(__dirname, "..", "frontend")));

app.listen(PORT, () => {
    console.log(`CityPuzzle backend: http://localhost:${PORT}`);
});
