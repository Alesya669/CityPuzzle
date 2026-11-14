const cors = require("cors");
const express = require("express");
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
        message: "CityRoutes backend работает!"
    });
});

app.listen(PORT, () => {
    console.log(`CityRoutes backend: http://localhost:${PORT}`);
});
