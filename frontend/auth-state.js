// Общий для всех страниц: адрес API, хранение входа и запросы к серверу.
const API_URL = "http://localhost:3000/api";
const AUTH_KEY = "citypuzzle-auth";

let auth = null; // { token, user }

try {
    const raw = localStorage.getItem(AUTH_KEY);
    const saved = raw ? JSON.parse(raw) : null;

    if (saved && typeof saved.token === "string" && saved.user) {
        auth = saved;
    }

    // Старый способ хранения входа (без токена) больше не используется
    sessionStorage.removeItem("cityroutes-user");
} catch {
    auth = null;
}

function getUser() {
    return auth ? auth.user : null;
}

function setAuth(value) {
    auth = value;

    try {
        if (value) {
            localStorage.setItem(AUTH_KEY, JSON.stringify(value));
        } else {
            localStorage.removeItem(AUTH_KEY);
        }
    } catch {
        // хранилище недоступно — вход будет действовать до закрытия вкладки
    }

    document.dispatchEvent(new Event("auth-changed"));
}

// Запрос к API с токеном. Возвращает { ok, status, data }.
// Если сервер ответил 401, вход сбрасывается.
async function apiRequest(path, { method = "GET", body } = {}) {
    const headers = {};

    if (auth) headers.Authorization = `Bearer ${auth.token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";

    const response = await fetch(`${API_URL}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
    });

    let data = {};
    try {
        data = await response.json();
    } catch {
        // пустой или не JSON-ответ
    }

    if (response.status === 401 && auth) {
        setAuth(null);
    }

    return { ok: response.ok, status: response.status, data };
}

function networkErrorMessage(error) {
    return error.message === "Failed to fetch"
        ? "Не удалось связаться с сервером. Проверь, запущен ли backend."
        : error.message;
}
