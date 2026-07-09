// ---------------------------------------------------------------------
// Состояние
// ---------------------------------------------------------------------
let pathSegments = [];      // например ['coal', 'data'] -> route "coal/data"
let leafMeta = null;        // метаданные конечного (data) маршрута
let facetValuesCache = {};  // facetId -> [{id, name}]
let chartInstance = null;

const el = (id) => document.getElementById(id);

// ---------------------------------------------------------------------
// 1. Навигация по дереву маршрутов
// ---------------------------------------------------------------------
async function loadRoute() {
  leafMeta = null;
  el("filters-panel").classList.add("hidden");
  el("chart-panel").classList.add("hidden");
  el("leaf-info").classList.add("hidden");

  const route = pathSegments.join("/");
  const res = await fetch(`/api/routes/${route}`);
  const json = await res.json();

  if (json.error) {
    el("route-children").innerHTML = `<span style="color:#ff6b6b">${json.error}</span>`;
    return;
  }

  const resp = json.response || {};
  renderBreadcrumb();

  if (Array.isArray(resp.routes)) {
    // Это узел-каталог: показываем дочерние под-API как чипы
    el("leaf-info").classList.add("hidden");
    el("route-children").innerHTML = "";
    resp.routes.forEach((r) => {
      const chip = document.createElement("div");
      chip.className = "chip";
      chip.textContent = `${r.id} — ${r.name || ""}`;
      chip.onclick = () => {
        pathSegments.push(r.id);
        loadRoute();
      };
      el("route-children").appendChild(chip);
    });
  } else if (resp.facets || resp.frequency || resp.data) {
    // Это конечный ("листовой") маршрут с данными — обычно .../data
    el("route-children").innerHTML = "";
    leafMeta = resp;
    el("leaf-info").classList.remove("hidden");
    el("leaf-path").textContent = route;
    await renderFilters(resp);
  } else {
    el("route-children").innerHTML = "<i>Нет данных по этому маршруту</i>";
  }
}

function renderBreadcrumb() {
  const bc = el("breadcrumb");
  bc.innerHTML = "";
  const rootSpan = document.createElement("span");
  rootSpan.textContent = "EIA (root)";
  rootSpan.onclick = () => { pathSegments = []; loadRoute(); };
  bc.appendChild(rootSpan);

  pathSegments.forEach((seg, i) => {
    bc.append(" / ");
    const s = document.createElement("span");
    s.textContent = seg;
    s.onclick = () => { pathSegments = pathSegments.slice(0, i + 1); loadRoute(); };
    bc.appendChild(s);
  });
}

// Некоторые каталоги (например "coal") сами не листовые, но у них есть
// дочерний маршрут "data" с фактическими данными. Если пользователь выбрал
// узел без /data, но с полем routes, куда входит "data" — подсказываем это
// одним кликом дополнительно (см. чипы выше — там будет чип "data").

// ---------------------------------------------------------------------
// 2. Панель фильтров
// ---------------------------------------------------------------------
async function renderFilters(meta) {
  el("filters-panel").classList.remove("hidden");

  // Частота
  const freqSelect = el("frequency");
  freqSelect.innerHTML = "";
  (meta.frequency || []).forEach((f) => {
    const opt = document.createElement("option");
    opt.value = f.id;
    opt.textContent = `${f.id} (${f.description || ""})`;
    freqSelect.appendChild(opt);
  });

  // Колонки данных (value, production, stocks, ...)
  const dataSelect = el("data-columns");
  dataSelect.innerHTML = "";
  const dataCols = meta.data ? Object.keys(meta.data) : [];
  dataCols.forEach((key, i) => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = `${key}${meta.data[key].units ? " [" + meta.data[key].units + "]" : ""}`;
    if (i === 0) opt.selected = true;
    dataSelect.appendChild(opt);
  });

  // Facet'ы — динамически подгружаем возможные значения
  const facetsContainer = el("facets-container");
  facetsContainer.innerHTML = "";
  facetValuesCache = {};

  for (const facet of meta.facets || []) {
    const wrap = document.createElement("div");
    wrap.className = "field";
    const label = document.createElement("label");
    label.textContent = `${facet.id} — ${facet.description || ""}`;
    wrap.appendChild(label);

    const select = document.createElement("select");
    select.multiple = true;
    select.size = 5;
    select.dataset.facetId = facet.id;
    select.innerHTML = "<option>Загрузка...</option>";
    wrap.appendChild(select);
    facetsContainer.appendChild(wrap);

    fetchFacetValues(facet.id, select);
  }

  // Диапазон лет: подстраиваем границы под то, что реально отдаёт API
  const startYear = meta.startPeriod ? parseInt(meta.startPeriod.slice(0, 4)) : 1970;
  const endYear = meta.endPeriod ? parseInt(meta.endPeriod.slice(0, 4)) : 2025;
  const lo = Math.max(1970, Math.min(startYear, 1970));
  const hi = Math.min(2025, Math.max(endYear, 2025));

  el("start-year").min = lo;
  el("start-year").max = hi;
  el("end-year").min = lo;
  el("end-year").max = hi;
  el("start-year").value = Math.max(lo, 1970);
  el("end-year").value = Math.min(hi, 2025);
  updateRangeLabel();
}

async function fetchFacetValues(facetId, selectEl) {
  const route = pathSegments.join("/");
  try {
    const res = await fetch(`/api/facet/${route}/${facetId}`);
    const json = await res.json();
    const values = (json.response && json.response.facets) || [];
    selectEl.innerHTML = "";
    values.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v.id;
      opt.textContent = `${v.id} — ${v.name || v.id}`;
      selectEl.appendChild(opt);
    });
    facetValuesCache[facetId] = values;
  } catch (e) {
    selectEl.innerHTML = "<option>Ошибка загрузки</option>";
  }
}

// ---------------------------------------------------------------------
// 3. Диапазон лет (двойной ползунок)
// ---------------------------------------------------------------------
function updateRangeLabel() {
  let s = parseInt(el("start-year").value);
  let e = parseInt(el("end-year").value);
  if (s > e) { [s, e] = [e, s]; }
  el("range-label").textContent = `${s} – ${e}`;
}
el("start-year").addEventListener("input", updateRangeLabel);
el("end-year").addEventListener("input", updateRangeLabel);

// ---------------------------------------------------------------------
// 4. Построение запроса и графика
// ---------------------------------------------------------------------
el("build-btn").addEventListener("click", buildChart);
el("chart-type").addEventListener("change", buildChart);

async function buildChart() {
  if (!leafMeta) return;
  el("status-msg").textContent = "Загрузка данных...";

  const route = pathSegments.join("/");
  const params = new URLSearchParams();

  const frequency = el("frequency").value;
  if (frequency) params.append("frequency", frequency);

  const dataCols = Array.from(el("data-columns").selectedOptions).map((o) => o.value);
  dataCols.forEach((c) => params.append("data", c));

  document.querySelectorAll("#facets-container select").forEach((sel) => {
    const chosen = Array.from(sel.selectedOptions).map((o) => o.value);
    if (chosen.length) {
      params.append(`facets.${sel.dataset.facetId}`, chosen.join(","));
    }
  });

  let s = parseInt(el("start-year").value);
  let e = parseInt(el("end-year").value);
  if (s > e) [s, e] = [e, s];
  params.append("start", String(s));
  params.append("end", String(e));

  try {
    const res = await fetch(`/api/data/${route}?${params.toString()}`);
    const json = await res.json();

    if (json.error) {
      el("status-msg").textContent = `Ошибка: ${json.error}`;
      return;
    }

    const rows = (json.response && json.response.data) || [];
    el("status-msg").textContent = `Получено строк: ${rows.length}`;
    renderChart(rows, dataCols);
  } catch (e) {
    el("status-msg").textContent = "Ошибка запроса: " + e;
  }
}

function renderChart(rows, dataCols) {
  el("chart-panel").classList.remove("hidden");

  // Определяем, по каким facet-полям в строках группировать серии
  const facetIds = (leafMeta.facets || []).map((f) => f.id).filter((id) =>
    rows.some((r) => id in r)
  );

  // Собираем все периоды (ось X), отсортированные
  const periods = [...new Set(rows.map((r) => r.period))].sort();

  // Группируем: ключ серии = комбинация значений facet-полей + название data-колонки
  const seriesMap = new Map();

  rows.forEach((row) => {
    const facetKeyParts = facetIds.map((id) => `${id}=${row[id]}`);
    dataCols.forEach((col) => {
      if (row[col] === undefined || row[col] === null) return;
      const seriesKey = [...facetKeyParts, col].join(" | ") || col;
      if (!seriesMap.has(seriesKey)) {
        seriesMap.set(seriesKey, new Map());
      }
      seriesMap.get(seriesKey).set(row.period, Number(row[col]));
    });
  });

  const palette = [
    "#4f8cff", "#ffb347", "#5ed6a5", "#ff6b9d", "#c792ea",
    "#66d9ef", "#f78c6c", "#82aaff", "#c3e88d", "#ff5370",
  ];

  // Защита от "спагетти-графика": если серий слишком много, оставляем
  // только самые весомые (по среднему значению), а остальные сворачиваем
  // и предупреждаем пользователя — вместо того, чтобы рисовать всё подряд.
  const MAX_SERIES = 12;
  let entries = Array.from(seriesMap.entries());
  const totalSeries = entries.length;
  let warningEl = el("chart-warning");

  if (totalSeries > MAX_SERIES) {
    entries.sort((a, b) => {
      const avg = (m) => {
        const vals = Array.from(m.values()).filter((v) => v !== null && !Number.isNaN(v));
        return vals.length ? vals.reduce((s, v) => s + Math.abs(v), 0) / vals.length : 0;
      };
      return avg(b[1]) - avg(a[1]);
    });
    entries = entries.slice(0, MAX_SERIES);
    if (warningEl) {
      warningEl.classList.remove("hidden");
      warningEl.textContent =
        `Показаны топ-${MAX_SERIES} из ${totalSeries} серий (самые значимые по среднему значению). ` +
        `Чтобы увидеть остальные — сузьте фильтры выше (выберите меньше значений facet'ов).`;
    }
  } else if (warningEl) {
    warningEl.classList.add("hidden");
  }

  const datasets = entries.map(([label, m], i) => ({
    label,
    data: periods.map((p) => (m.has(p) ? m.get(p) : null)),
    borderColor: palette[i % palette.length],
    backgroundColor: palette[i % palette.length] + "55",
    spanGaps: true,
    tension: 0.25,
  }));

  const type = el("chart-type").value;

  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(el("chart").getContext("2d"), {
    type,
    data: { labels: periods, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { color: "#e6e9f0" } },
      },
      scales: {
        x: { ticks: { color: "#8a93a8" }, grid: { color: "#2a3346" } },
        y: { ticks: { color: "#8a93a8" }, grid: { color: "#2a3346" } },
      },
    },
  });
}

// ---------------------------------------------------------------------
// Старт
// ---------------------------------------------------------------------
loadRoute();
