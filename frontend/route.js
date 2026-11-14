const API_URL = "http://localhost:3000/api";
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

function renderRoute(route) {
    document.title = `${route.title} — CityPuzzle`;

    const head = el("section", "route-head");
    head.append(
        el("p", "route-location", `⌖ ${route.city} · ${route.category}`),
        el("h1", null, route.title),
        el("p", "route-description", route.description)
    );

    const meta = el("div", "route-meta");
    meta.append(
        el("span", null, `◷ ${getDurationLabel(route.duration)}`),
        ...(route.distance === null ? [] : [el("span", null, `↗ ${route.distance} км`)]),
        el("span", null, `${route.points.length} точек`),
        el("span", "route-rating",
            route.rating === null ? "★ нет оценок" : `★ ${route.rating.toFixed(1)}`)
    );
    head.append(meta);

    const list = el("ol", "point-list");
    list.append(...route.points.map(createPointCard));

    const blocks = [head, el("h2", "points-title", "Точки маршрута"), list];

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
        const response = await fetch(`${API_URL}/routes/${encodeURIComponent(id)}`);
        const data = await response.json();

        if (!response.ok) throw new Error(data.error || "Не удалось загрузить маршрут");

        renderRoute(data.route);
    } catc