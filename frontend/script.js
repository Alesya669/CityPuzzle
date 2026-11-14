
// Маршруты загружаются с сервера (только одобренные модератором)
let routes = [];

const routeGrid = document.getElementById("route-grid");
const searchInput = document.getElementById("search-input");
const durationFilter = document.getElementById("duration-filter");
const sortSelect = document.getElementById("sort-select");
const resultsMessage = document.getElementById("results-message");
const favoritesFilter = document.getElementById("favorites-filter");
const favoritesOnly = document.getElementById("favorites-only");

function getDurationLabel(minutes) {
    if (minutes < 60) {
        return `${minutes} мин`;
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (remainingMinutes === 0) {
        return `${hours} ч`;
    }

    return `${hours} ч ${remainingMinutes} мин`;
}

function updateFavoriteButton(button, isFavorite) {
    button.textContent = isFavorite ? "♥" : "♡";
    button.classList.toggle("active", isFavorite);
    button.setAttribute("aria-pressed", String(isFavorite));
    button.setAttribute(
        "aria-label",
        isFavorite ? "Убрать из избранного" : "Добавить в избранное"
    );
    button.title = button.getAttribute("aria-label");
}

async function toggleFavorite(route, button) {
    if (!getUser()) {
        openAuthModal("login");
        registerMessage.textContent = "Войди, чтобы добавлять маршруты в избранное.";
        return;
    }

    button.disabled = true;

    try {
        const result = await apiRequest(`/routes/${route.id}/favorite`, {
            method: route.isFavorite ? "DELETE" : "PUT"
        });

        if (result.ok) {
            route.isFavorite = result.data.isFavorite;
            updateFavoriteButton(button, route.isFavorite);

            if (favoritesOnly.checked) filterRoutes();
        }
    } catch (error) {
        resultsMessage.textContent = networkErrorMessage(error);
    } finally {
        button.disabled = false;
    }
}

function createRouteCard(route) {
    const article = document.createElement("article");
    article.className = "route-card";

    const link = document.createElement("a");
    link.className = "route-card-link";
    link.href = `route.html?id=${route.id}`;

    const imageWrapper = document.createElement("div");
    imageWrapper.className = "route-image";

    const image = document.createElement("img");
    image.alt = route.title;
    image.loading = "lazy";

    image.addEventListener("error", () => {
        imageWrapper.classList.add("image-fallback");
        image.style.display = "none";
    });

    if (route.image) {
        image.src = route.image;
    } else {
        imageWrapper.classList.add("image-fallback");
        image.style.display = "none";
    }

    const category = document.createElement("span");
    category.className = "route-category";
    category.textContent = route.category;

    imageWrapper.append(image, category);

    const body = document.createElement("div");
    body.className = "route-body";

    const location = document.createElement("p");
    location.className = "route-location";
    location.textContent = `⌖ ${route.city} · ${route.pointsCount} точек`;

    const title = document.createElement("h3");
    title.className = "route-title";
    title.textContent = route.title;

    const description = document.createElement("p");
    description.className = "route-description";
    description.textContent = route.description;

    const meta = document.createElement("div");
    meta.className = "route-meta";

    const duration = document.createElement("span");
    duration.textContent = `◷ ${getDurationLabel(route.duration)}`;

    const distance = document.createElement("span");
    distance.textContent = route.distance === null ? `${route.pointsCount} мест` : `↗ ${route.distance} км`;

    const rating = document.createElement("span");
    rating.className = "route-rating";
    rating.textContent = route.rating === null
        ? "★ нет оценок"
        : `★ ${route.rating.toFixed(1)}`;
    rating.title = route.ratingSource === "users"
        ? "Средняя оценка пользователей"
        : "Рейтинг мест по данным 2ГИС";

    meta.append(duration, distance, rating);
    body.append(location, title, description, meta);
    link.append(imageWrapper, body);

    const favoriteButton = document.createElement("button");
    favoriteButton.type = "button";
    favoriteButton.className = "fav-button";
    updateFavoriteButton(favoriteButton, route.isFavorite);

    favoriteButton.addEventListener("click", () => toggleFavorite(route, favoriteButton));

    article.append(link, favoriteButton);

    return article;
}

function filterRoutes() {
    const query = searchInput.value.trim().toLocaleLowerCase("ru");
    const duration = durationFilter.value;

    let filteredRoutes = routes.filter((route) => {
        const searchableText = [
            route.title,
            route.city,
            route.category,
            route.description
        ].join(" ").toLocaleLowerCase("ru");

        const matchesSearch = searchableText.includes(query);

        let matchesDuration = true;

        if (duration === "short") {
            matchesDuration = route.duration < 60;
        } else if (duration === "medium") {
            matchesDuration = route.duration >= 60 && route.duration <= 120;
        } else if (duration === "long") {
            matchesDuration = route.duration > 120;
        }

        const matchesFavorite = !favoritesOnly.checked || route.isFavorite;

        return matchesSearch && matchesDuration && matchesFavorite;
    });

    if (sortSelect.value === "rating") {
        filteredRoutes.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    } else if (sortSelect.value === "duration") {
        filteredRoutes.sort((a, b) => a.duration - b.duration);
    } else {
        filteredRoutes.sort((a, b) => b.popularity - a.popularity);
    }

    renderRoutes(filteredRoutes);
}

function renderRoutes(routesToRender) {
    routeGrid.replaceChildren();

    if (routesToRender.length === 0) {
        const emptyMessage = document.createElement("div");
        emptyMessage.className = "no-results";
        emptyMessage.textContent = favoritesOnly.checked
            ? "В избранном пока пусто. Нажми ♡ на карточке маршрута."
            : "Маршруты не найдены. Попробуй изменить поисковый запрос или фильтры.";

        routeGrid.append(emptyMessage);
        resultsMessage.textContent = "Найдено маршрутов: 0";
        return;
    }

    const cards = routesToRender.map(createRouteCard);
    routeGrid.append(...cards);

    resultsMessage.textContent =
        `Найдено маршрутов: ${routesToRender.length}`;
}

searchInput.addEventListener("input", filterRoutes);
durationFilter.addEventListener("change", filterRoutes);
sortSelect.addEventListener("change", filterRoutes);
favoritesOnly.addEventListener("change", filterRoutes);

async function loadRoutes() {
    resultsMessage.textContent = "Загружаем маршруты...";

    try {
        const result = await apiRequest("/routes");

        if (!result.ok) {
            throw new Error(result.data.error || "Не удалось загрузить маршруты");
        }

        routes = result.data.routes;
        filterRoutes();
    } catch (error) {
        routeGrid.replaceChildren();
        resultsMessage.textContent = networkErrorMessage(error);
    }
}



const registerOverlay = document.getElementById("register-overlay");
const openRegisterButton = document.getElementById("open-register");
const openLoginButton = document.getElementById("open-login");
const closeRegisterButton = document.getElementById("close-register");

const registerForm = document.getElementById("register-form");
const registerMessage = document.getElementById("register-message");
const authTitle = document.getElementById("auth-title");
const authEyebrow = document.getElementById("auth-eyebrow");
const authDescription = document.getElementById("auth-description");
const authSubmit = document.getElementById("auth-submit");
const usernameField = document.getElementById("username-field");
const usernameInput = document.getElementById("register-username");
const emailInput = document.getElementById("register-email");
const passwordInput = document.getElementById("register-password");
const authSwitch = document.getElementById("auth-switch");
const switchToLoginButton = document.getElementById("switch-to-login");
const headerActions = document.getElementById("header-actions");

let authMode = "register";

function openAuthModal(mode) {
    authMode = mode;
    registerOverlay.hidden = false;
    registerMessage.textContent = "";
    registerForm.reset();

    const isLogin = mode === "login";

    authTitle.textContent = isLogin ? "С возвращением!" : "Создай аккаунт";
    authEyebrow.textContent = isLogin ? "РАДЫ ТЕБЯ ВИДЕТЬ" : "ПРИСОЕДИНЯЙСЯ К НАМ";

    authDescription.textContent = isLogin
        ? "Войди, чтобы продолжить свои прогулки."
        : "Сохраняй любимые маршруты и делись своими прогулками.";

    authSubmit.textContent = isLogin ? "Войти" : "Зарегистрироваться";
    usernameField.hidden = isLogin;
    usernameInput.required = !isLogin;

    passwordInput.autocomplete = isLogin ? "current-password" : "new-password";

    authSwitch.innerHTML = isLogin
        ? 'Ещё нет аккаунта? <button type="button" id="switch-to-register">Зарегистрироваться</button>'
        : 'Уже есть аккаунт? <button type="button" id="switch-to-login">Войти</button>';

    document.getElementById("switch-to-login")?.addEventListener("click", () => {
        openAuthModal("login");
    });

    document.getElementById("switch-to-register")?.addEventListener("click", () => {
        openAuthModal("register");
    });

    emailInput.focus();
}

function renderHeader() {
    headerActions.replaceChildren();

    const currentUser = getUser();

    favoritesFilter.hidden = !currentUser;
    if (!currentUser) favoritesOnly.checked = false;

    if (currentUser) {
        const greeting = document.createElement("span");
        greeting.className = "user-greeting";
        greeting.textContent = `Привет, ${currentUser.username}!`;

        const logoutButton = document.createElement("button");
        logoutButton.type = "button";
        logoutButton.className = "auth-button";
        logoutButton.textContent = "Выйти";

        logoutButton.addEventListener("click", async () => {
            try {
                await apiRequest("/auth/logout", { method: "POST" });
            } catch {
                // сервер недоступен — всё равно выходим на этой стороне
            }

            setAuth(null);
        });

        headerActions.append(greeting, logoutButton);
    } else {
        const loginButton = document.createElement("button");
        loginButton.type = "button";
        loginButton.className = "auth-button";
        loginButton.textContent = "Войти";
        loginButton.addEventListener("click", () => openAuthModal("login"));

        const registerButton = document.createElement("button");
        registerButton.type = "button";
        registerButton.className = "auth-button";
        registerButton.textContent = "Регистрация";
        registerButton.addEventListener("click", () => openAuthModal("register"));

        headerActions.append(loginButton, registerButton);
    }

    const routesLink = document.createElement("a");
    routesLink.href = "#routes";
    routesLink.className = "header-button";
    routesLink.textContent = "Найти прогулку";
    headerActions.append(routesLink);
}

openRegisterButton.addEventListener("click", () => openAuthModal("register"));
openLoginButton.addEventListener("click", () => openAuthModal("login"));

closeRegisterButton.addEventListener("click", () => {
    registerOverlay.hidden = true;
});

registerOverlay.addEventListener("click", (event) => {
    if (event.target === registerOverlay) {
        registerOverlay.hidden = true;
    }
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        registerOverlay.hidden = true;
    }
});

registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    const userData = authMode === "register"
        ? {
            username: usernameInput.value.trim(),
            email,
            password
        }
        : {
            email,
            password
        };

    authSubmit.disabled = true;
    registerMessage.textContent = authMode === "login"
        ? "Выполняем вход..."
        : "Регистрируем аккаунт...";

    try {
        const result = await apiRequest(
            authMode === "login" ? "/auth/login" : "/auth/register",
            { method: "POST", body: userData }
        );

        if (!result.ok) {
            throw new Error(result.data.error || "Не удалось выполнить запрос");
        }

        if (authMode === "register") {
            registerMessage.textContent =
                `Аккаунт создан! Добро пожаловать, ${result.data.user.username}. Теперь войди в аккаунт.`;

            registerForm.reset();
            return;
        }

        registerOverlay.hidden = true;
        setAuth({ token: result.data.token, user: result.data.user });

        // Вернуться на страницу маршрута, откуда пришёл пользователь
        const next = new URLSearchParams(location.search).get("next");

        if (next && /^route\.html\?id=\d+$/.test(next)) {
            location.href = next;
        }
    } catch (error) {
        registerMessage.textContent = networkErrorMessage(error);
    } finally {
        authSubmit.disabled = false;
    }
});

document.addEventListener("auth-changed", () => {
    renderHeader();
    loadRoutes();
});

renderHeader();
loadRoutes();

// Ссылка вида index.html?auth=login сразу открывает окно входа
if (new URLSearchParams(location.search).get("auth") === "login" && !getUser()) {
    openAuthModal("login");
}
