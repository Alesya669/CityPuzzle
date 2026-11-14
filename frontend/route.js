const content = document.getElementById("route-content");

function getDurationLabel(minutes) {
    if (minutes < 60) return `${minutes} мин`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest === 0 ? `${hours} ч` : `${hours} ч ${rest} мин`;
}

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
}

function pluralRatings(n) {
    const mod10 = n % 10;
    const mod100 = n % 100;

    if (mod10 === 1 && mod100 !== 11) return `${n} оценка`;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} оценки`;
    return `${n} оценок`;
}

function ratingText(route) {
    if (route.rating === null) return "★ нет оценок";

    return route.ratingSource === "users"
        ? `★ ${route.rating.toFixed(1)} · ${pluralRatings(route.userRatingsCount)}`
        : `★ ${route.rating.toFixed(1)} · 2ГИС`;
}

function showMessage(text) {
    content.replaceChildren(el("p", "page-message", text));
}

function createPointCard(point) {
    const li = el("li", "point-card");
    li.append(el("div", "point-number", String(point.order)));

    const body = el("div", "point-body");
    body.append(el("h3", null, point.title));

    if (point.photo) {
        const photo = el("img", "point-photo");
        photo.src = point.photo;
        photo.alt = point.title;
        photo.loading = "lazy";
        photo.addEventListener("error", () => photo.remove());
        body.append(photo);
    }

    if (point.description) body.append(el("p", null, point.description));
    if (point.address) body.append(el("p", null, `Адрес: ${point.address}`));

    const hasCoords = point.latitude !== null && point.longitude !== null;

    if (hasCoords) {
        body.append(el("p", null,
            `Координаты: ${point.latitude.toFixed(6)}, ${point.longitude.toFixed(6)}`));
    }

    if (point.rating !== null) {
        const count = point.ratingsCount ? ` (${point.ratingsCount} оценок)` : "";
        body.append(el("p", null, `Рейтинг в 2ГИС: ★ ${point.rating.toFixed(1)}${count}`));
    }

    if (point.hours) body.append(el("p", null, `Режим работы: ${point.hours}`));

    const links = el("div", "point-links");
    // Поиск по координатам открывается в 2ГИС, даже если прямой ссылки на карточку нет
    // Без координат ищем в 2ГИС по названию и адресу
    const searchQuery = encodeURIComponent(
        [point.title, point.address].filter(Boolean).join(" "));
    const cardUrl = point.gisUrl || (hasCoords
        ? `https://2gis.ru/krasnodar?m=${point.longitude}%2C${point.latitude}%2F18`
        : `https://2gis.ru/krasnodar/search/${searchQuery}`);
    const gis = el("a", null, point.gisUrl ? "Открыть в 2ГИС ↗" : "Найти на карте 2ГИС ↗");
    gis.href = cardUrl;
    gis.target = "_blank";
    gis.rel = "noopener noreferrer";
    links.append(gis);
    body.append(links);

    li.append(body);
    return li;
}

function createActions(route, ratingBadge) {
    const box = el("section", "route-actions");

    if (!getUser()) {
        const next = encodeURIComponent(`route.html?id=${route.id}`);
        const note = el("p", "actions-note", "Хочешь оценить маршрут или сохранить его в избранное? ");
        const login = el("a", null, "Войди в аккаунт");
        login.href = `index.html?auth=login&next=${next}`;
        note.append(login, ".");
        box.append(note);
        return box;
    }

    // --- оценка ---
    const rateBox = el("div", "rate-box");
    rateBox.append(el("span", "rate-label", "Твоя оценка:"));

    const stars = el("div", "rate-stars");
    const status = el("span", "rate-status");
    let myRating = route.myRating;

    function paintStars() {
        stars.querySelectorAll("button").forEach((button, index) => {
            const active = myRating !== null && index < myRating;
            button.classList.toggle("active", active);
            button.textContent = active ? "★" : "☆";
        });
        status.textContent = myRating === null ? "" : "Спасибо за оценку!";
    }

    for (let value = 1; value <= 5; value++) {
        const button = el("button", "rate-star");
        button.type = "button";
        button.setAttribute("aria-label", `Оценка ${value} из 5`);

        button.addEventListener("click", async () => {
            stars.querySelectorAll("button").forEach((b) => (b.disabled = true));
            status.textContent = "Сохраняем...";

            try {
                const result = await apiRequest(`/routes/${route.id}/rating`, {
                    method: "POST",
                    body: { rating: value }
                });

                if (!result.ok) {
                    throw new Error(result.data.error || "Не удалось сохранить оценку");
                }

                myRating = result.data.myRating;
                ratingBadge.textContent = ratingText(result.data.route);
                paintStars();
            } catch (error) {
                status.textContent = networkErrorMessage(error);
            } finally {
                stars.querySelectorAll("button").forEach((b) => (b.disabled = false));
            }
        });

        stars.append(button);
    }

    rateBox.append(stars, status);
    paintStars();

    // --- избранное ---
    const favorite = el("button", "fav-large");
    favorite.type = "button";
    let isFavorite = route.isFavorite;

    function paintFavorite() {
        favorite.textContent = isFavorite ? "♥ В избранном" : "♡ В избранное";
        favorite.classList.toggle("active", isFavorite);
        favorite.setAttribute("aria-pressed", String(isFavorite));
    }

    favorite.addEventListener("click", async () => {
        favorite.disabled = true;

        try {
            const result = await apiRequest(`/routes/${route.id}/favorite`, {
                method: isFavorite ? "DELETE" : "PUT"
            });

            if (result.ok) {
                isFavorite = result.data.isFavorite;
                paintFavorite();
            } else {
                status.textContent = result.data.error || "Не удалось обновить избранное";
            }
        } catch (error) {
            status.textContent = networkErrorMessage(error);
        } finally {
            favorite.disabled = false;
        }
    });

    paintFavorite();
    box.append(rateBox, favorite);
    return box;
}

function renderHeader() {
    const actions = document.getElementById("header-actions");
    const user = getUser();
    const nodes = [];

    if (user) {
        const logout = el("button", "auth-button", "Выйти");
        logout.type = "button";
        logout.addEventListener("click", async () => {
            try {
                await apiRequest("/auth/logout", { method: "POST" });
            } catch {
                // сервер недоступен — выходим на этой стороне
            }

            setAuth(null);
        });

        nodes.push(el("span", "user-greeting", `Привет, ${user.username}!`), logout);
    } else {
        const login = el("a", "auth-button", "Войти");
        login.href = `index.html?auth=login&next=${encodeURIComponent(`route.html${location.search}`)}`;
        nodes.push(login);
    }

    const all = el("a", "header-button", "Все маршруты");
    all.href = "index.html#routes";
    nodes.push(all);

    actions.replaceChildren(...nodes);
}

function renderRoute(route) {
    document.title = `${route.title} — CityPuzzle`;

    const head = el("section", "route-head");
    head.append(
        el("p", "route-location", `⌖ ${route.city} · ${route.category}`),
        el("h1", null, route.title),
        el("p", "route-description", route.description)
    );

    const ratingBadge = el("span", "route-rating", ratingText(route));
    const meta = el("div", "route-meta");
    meta.append(
        el("span", null, `◷ ${getDurationLabel(route.duration)}`),
        ...(route.distance === null ? [] : [el("span", null, `↗ ${route.distance} км`)]),
        el("span", null, `${route.points.length} точек`),
        ratingBadge
    );
    head.append(meta);

    const list = el("ol", "point-list");
    list.append(...route.points.map(createPointCard));

    const blocks = [
        head,
        createActions(route, ratingBadge),
        el("h2", "points-title", "Точки маршрута"),
        list
    ];

    if (route.image) {
        const cover = el("img", "route-cover");
        cover.src = route.image;
        cover.alt = route.title;
        cover.addEventListener("error", () => cover.remove());
        blocks.unshift(cover);
    }

    content.replaceChildren(...blocks);
}

async function loadRoute() {
    const id = new URLSearchParams(location.search).get("id");

    if (!id) {
        showMessage("Маршрут не указан.");
        return;
    }

    try {
        const result = await apiRequest(`/routes/${encodeURIComponent(id)}`);

        if (!result.ok) throw new Error(result.data.error || "Не удалось загрузить маршрут");

        renderRoute(result.data.route);
    } catch (error) {
        showMessage(networkErrorMessage(error));
    }
}

// При входе или выходе на другой вкладке/в этой — перерисовать страницу
document.addEventListener("auth-changed", () => {
    renderHeader();
    loadRoute();
});

renderHeader();
loadRoute();
