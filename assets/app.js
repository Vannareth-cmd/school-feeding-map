(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const COLOR = { W: "#0A6EB4", M: "#C88A00" };
  const KHNUM = "០១២៣៤៥៦៧៨៩";

  const S = { year: -1, impl: "all", prov: "", dist: "", q: "", lang: "en", base: "map", sortK: "province", sortDir: 1, shown: 50 };
  let D, SCHOOLS = [], YEARS = [], PROVS = null, provKh = {};
  let baseLoad, map, layerSchools, layerProv, baseLayers, markers = new Map(), playTimer = null, lastFitKey = "";

  // ---------- i18n ----------
  const t = (k, ...a) => {
    let s = (I18N[S.lang] && I18N[S.lang][k]) || I18N.en[k] || k;
    a.forEach(v => { s = s.replace("%s", v); });
    return s;
  };
  const num = n => {
    const s = Number(n).toLocaleString("en-US");
    return S.lang === "km" ? s.replace(/[0-9]/g, d => KHNUM[d]) : s;
  };
  const provName = p => (S.lang === "km" && provKh[p]) ? provKh[p] : p;
  const implName = c => c === "W" ? "WFP" : c === "M" ? t("moeys") : t("notIn");
  function applyI18n() {
    document.documentElement.lang = S.lang === "km" ? "km" : "en";
    $$("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
    $$("[data-i18n-ph]").forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
    $$(".lang button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.lang === S.lang)));
    $("#tl-play").textContent = playTimer ? t("pause") : t("play");
  }

  // ---------- state <-> URL ----------
  function readHash() {
    const h = new URLSearchParams(location.hash.slice(1));
    if (h.has("y")) { const y = h.get("y"); S.year = y === "all" ? -1 : Math.max(-1, YEARS.indexOf(y)); }
    else S.year = YEARS.length - 1;
    if (["W", "M"].includes(h.get("impl"))) S.impl = h.get("impl");
    if (h.get("prov")) S.prov = h.get("prov");
    if (h.get("dist")) S.dist = h.get("dist");
    if (h.get("q")) S.q = h.get("q");
    if (h.get("lang") === "km") S.lang = "km";
    if (["sat", "streets"].includes(h.get("base"))) S.base = h.get("base");
  }
  function writeHash() {
    const h = new URLSearchParams();
    h.set("y", S.year < 0 ? "all" : YEARS[S.year]);
    if (S.impl !== "all") h.set("impl", S.impl);
    if (S.prov) h.set("prov", S.prov);
    if (S.dist) h.set("dist", S.dist);
    if (S.q) h.set("q", S.q);
    if (S.lang !== "en") h.set("lang", S.lang);
    if (S.base !== "map") h.set("base", S.base);
    history.replaceState(null, "", "#" + h.toString());
  }

  // ---------- filtering ----------
  // status of a school for the current year selection: "W", "M" or "" (not in programme)
  function statusOf(s) {
    if (S.year >= 0) { const c = s.history[S.year]; return c === "." ? "" : c; }
    return s.last;
  }
  function passes(s, skip) {
    if (!skip.includes("year")) {
      if (S.year >= 0) {
        const c = s.history[S.year];
        if (c === ".") return false;
        if (S.impl !== "all" && c !== S.impl) return false;
      } else if (S.impl !== "all" && !s.history.includes(S.impl)) return false;
    }
    if (!skip.includes("prov") && S.prov && s.province !== S.prov) return false;
    if (!skip.includes("dist") && S.dist && s.district !== S.dist) return false;
    if (S.q) {
      const q = S.q.toLowerCase();
      if (!(s.name_en.toLowerCase().includes(q) || (s.name_kh || "").includes(S.q) || s.emis.includes(q))) return false;
    }
    return true;
  }
  const current = () => SCHOOLS.filter(s => passes(s, []));

  // ---------- timeline ----------
  function buildTimeline() {
    const wrap = $("#tl-bars");
    wrap.innerHTML = "";
    YEARS.forEach((y, i) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "yr"; b.setAttribute("role", "option"); b.dataset.i = i;
      b.innerHTML = `<span class="n"></span><span class="stack"><span class="w"></span><span class="m"></span></span><span class="y">${y.slice(0, 4)}-${y.slice(7, 9)}</span>`;
      b.addEventListener("click", () => { stopPlay(); setYear(i); });
      wrap.appendChild(b);
    });
    wrap.addEventListener("keydown", e => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
      e.preventDefault(); stopPlay();
      const base = S.year < 0 ? YEARS.length - 1 : S.year;
      setYear(Math.min(YEARS.length - 1, Math.max(0, base + (["ArrowRight", "ArrowDown"].includes(e.key) ? 1 : -1))));
      wrap.children[S.year].focus();
    });
  }
  function renderTimeline() {
    // counts per year under every filter except the year itself
    const base = SCHOOLS.filter(s => passes(s, ["year"]));
    const counts = YEARS.map((_, i) => {
      let w = 0, m = 0;
      for (const s of base) { const c = s.history[i]; if (c === "W" && S.impl !== "M") w++; else if (c === "M" && S.impl !== "W") m++; }
      return [w, m];
    });
    const max = Math.max(1, ...counts.map(c => c[0] + c[1]));
    $$("#tl-bars .yr").forEach((b, i) => {
      const [w, m] = counts[i];
      b.querySelector(".w").style.width = (w / max * 100) + "%";
      b.querySelector(".m").style.width = (m / max * 100) + "%";
      b.querySelector(".n").textContent = (w + m) ? num(w + m) : "";
      b.setAttribute("aria-selected", String(i === S.year));
      b.setAttribute("aria-label", `${YEARS[i]}: ${num(w + m)} ${t("schools")} (WFP ${num(w)}, ${t("moeys")} ${num(m)})`);
      b.tabIndex = (i === (S.year < 0 ? YEARS.length - 1 : S.year)) ? 0 : -1;
    });
    const wrap = $("#tl-bars"), selBar = wrap.children[S.year < 0 ? YEARS.length - 1 : S.year];
    if (selBar && wrap.scrollHeight > wrap.clientHeight) {
      const top = selBar.offsetTop - wrap.offsetTop;
      if (top < wrap.scrollTop || top + selBar.offsetHeight > wrap.scrollTop + wrap.clientHeight) wrap.scrollTop = top - wrap.clientHeight / 2;
    }
    $(".timeline").classList.toggle("all-years", S.year < 0);
    $("#tl-current").textContent = S.year < 0 ? t("allYears") : YEARS[S.year];
    $("#tl-all").setAttribute("aria-pressed", String(S.year < 0));
  }
  function setYear(i) { S.year = i; update(); }
  function stopPlay() { if (playTimer) { clearInterval(playTimer); playTimer = null; $("#tl-play").textContent = t("play"); } }
  function togglePlay() {
    if (playTimer) return stopPlay();
    if (S.year < 0 || S.year >= YEARS.length - 1) setYear(0);
    $("#tl-play").textContent = t("pause");
    playTimer = setInterval(() => {
      if (S.year >= YEARS.length - 1) return stopPlay();
      setYear(S.year + 1);
    }, 900);
  }

  // ---------- filters panel ----------
  function fillSelect(sel, values, allLabel, value, labelFn = v => v) {
    sel.innerHTML = "";
    const o = new Option(allLabel, ""); sel.add(o);
    values.forEach(v => sel.add(new Option(labelFn(v), v)));
    sel.value = values.includes(value) ? value : "";
  }
  function renderFilters() {
    const provs = [...new Set(SCHOOLS.map(s => s.province))].sort();
    fillSelect($("#f-prov"), provs, t("allProvinces"), S.prov, provName);
    const dists = [...new Set(SCHOOLS.filter(s => !S.prov || s.province === S.prov).map(s => s.district))].sort();
    if (S.dist && !dists.includes(S.dist)) S.dist = "";
    fillSelect($("#f-dist"), dists, t("allDistricts"), S.dist);
    $$(".seg button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.impl === S.impl)));
    if ($("#f-q").value !== S.q) $("#f-q").value = S.q;
  }

  // ---------- stats + breakdown ----------
  function renderStats(list) {
    let w = 0, m = 0;
    list.forEach(s => { const c = statusOf(s); if (c === "W") w++; else if (c === "M") m++; });
    $("#s-total").textContent = num(list.length);
    $("#s-w").textContent = num(w);
    $("#s-m").textContent = num(m);
    $("#s-p").textContent = num(new Set(list.map(s => s.province)).size);
    $("#s-d").textContent = num(new Set(list.map(s => s.province + "|" + s.district)).size);
    $("#p-w").textContent = "(" + num(w) + ")";
    $("#p-m").textContent = "(" + num(m) + ")";

    const byDist = !!S.prov;
    $("#bd-title").textContent = byDist ? t("byDistrict") : t("byProvince");
    const src = SCHOOLS.filter(s => passes(s, byDist ? ["dist"] : ["prov", "dist"]));
    const groups = new Map();
    src.forEach(s => {
      const k = byDist ? s.district : s.province;
      const g = groups.get(k) || { w: 0, m: 0 }; const c = statusOf(s);
      if (c === "M") g.m++; else g.w++;
      groups.set(k, g);
    });
    const rows = [...groups.entries()].sort((a, b) => (b[1].w + b[1].m) - (a[1].w + a[1].m));
    const max = Math.max(1, ...rows.map(r => r[1].w + r[1].m));
    const ol = $("#bd-list"); ol.innerHTML = "";
    rows.forEach(([k, g]) => {
      const li = document.createElement("li");
      const active = byDist ? S.dist === k : S.prov === k;
      li.innerHTML = `<button type="button" aria-pressed="${active}"><span>${active ? "<b>" : ""}${byDist ? k : provName(k)}${active ? "</b>" : ""}</span><span>${num(g.w + g.m)}</span><span class="bar"><i style="width:${g.w / max * 100}%;background:var(--wfp)"></i><i style="width:${g.m / max * 100}%;background:var(--moeys)"></i></span></button>`;
      li.firstChild.addEventListener("click", () => {
        if (byDist) S.dist = S.dist === k ? "" : k; else { S.prov = S.prov === k ? "" : k; S.dist = ""; }
        update();
      });
      ol.appendChild(li);
    });
  }

  // ---------- map ----------
  function initMap() {
    map = L.map("map", { zoomControl: true, preferCanvas: false, minZoom: 6, maxZoom: 18, zoomSnap: 0.25 })
      .fitBounds([[10.35, 102.3], [14.7, 107.65]]);
    const esri = "https://server.arcgisonline.com/ArcGIS/rest/services/";
    const grayBase = L.tileLayer(esri + "Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
      maxNativeZoom: 16, maxZoom: 19, crossOrigin: true, attribution: "Basemap &copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors" });
    const grayRef = L.tileLayer(esri + "Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}", {
      maxNativeZoom: 16, maxZoom: 19, crossOrigin: true, pane: "labels" });
    map.createPane("labels"); map.getPane("labels").style.zIndex = 420; map.getPane("labels").style.pointerEvents = "none";
    const osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, crossOrigin: true, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' });
    const sat = L.tileLayer(esri + "World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 19, crossOrigin: true, attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics" });
    baseLayers = { map: L.layerGroup([grayBase, grayRef]), streets: osm, sat: L.layerGroup([sat]) };
    baseLoad = { map: grayBase, streets: osm, sat: sat };
    baseLayers[S.base].addTo(map);
    L.control.scale({ metric: true, imperial: false, position: "bottomleft", maxWidth: 160 }).addTo(map);
    map.createPane("prov"); map.getPane("prov").style.zIndex = 350;
    layerProv = L.geoJSON(PROVS, { pane: "prov", interactive: false, style: provStyle }).addTo(map);
    layerSchools = L.layerGroup().addTo(map);
    SCHOOLS.forEach(s => {
      const mk = L.circleMarker([s.lat, s.lon], { radius: 5, weight: 1, color: "#fff", fillOpacity: 0.92 });
      mk.on("click", () => openPopup(s));
      markers.set(s.uid, mk);
    });
  }
  function provStyle(f) {
    const sel = S.prov && f.properties.name === S.prov;
    const sat = S.base === "sat";
    return { color: sel ? (sat ? "#fff" : "#1C2B23") : (sat ? "#E8EEE9" : "#5B6A61"), weight: sel ? 2.4 : 1, opacity: sel ? 1 : 0.7, fill: false, dashArray: sel ? null : "4 3" };
  }
  function renderMap(list) {
    layerSchools.clearLayers();
    const r = map.getZoom() >= 11 ? 7 : map.getZoom() >= 9 ? 6 : 4.5;
    list.forEach(s => {
      const mk = markers.get(s.uid), c = statusOf(s);
      mk.setStyle({ fillColor: COLOR[c] || "#8A968F", radius: r, color: S.base === "sat" ? "#000" : "#fff" });
      layerSchools.addLayer(mk);
    });
    layerProv.setStyle(provStyle);
    const key = S.prov + "|" + S.dist + "|" + S.q;
    if (key !== lastFitKey) {
      lastFitKey = key;
      if ((S.prov || S.dist || S.q) && list.length) {
        map.fitBounds(L.latLngBounds(list.map(s => [s.lat, s.lon])).pad(0.12), { maxZoom: 14 });
      } else if (!S.prov && !S.dist && !S.q) {
        map.fitBounds([[10.35, 102.3], [14.7, 107.65]]);
      }
    }
  }
  function popupHtml(s) {
    const c = statusOf(s);
    const yrs = [...s.history].map((ch, i) => ch !== "." ? i : -1).filter(i => i >= 0);
    const stat = S.year >= 0
      ? (c ? `<span class="status ${c}">${implName(c)}</span> ${t("inYear", YEARS[S.year])}` : `<span class="status none">${t("notInYear", YEARS[S.year])}</span>`)
      : `<span class="status ${c}">${implName(c)}</span>`;
    const cells = [...s.history].map((ch, i) => `<i class="${ch === "." ? "" : ch}${i === S.year ? " sel" : ""}" title="${YEARS[i]}: ${implName(ch === "." ? "" : ch)}"></i>`).join("");
    return `<div class="pp">
      <h3>${esc(s.name_en)}${s.approx ? " ≈" : ""}</h3>
      ${s.name_kh ? `<div class="kh">${esc(s.name_kh)}</div>` : ""}
      <div>${stat}</div>
      <dl>
        <dt>${t("colEmis")}</dt><dd>${s.emis}</dd>
        ${s.village ? `<dt>${t("village")}</dt><dd>${esc(s.village)}</dd>` : ""}
        <dt>${t("commune")}</dt><dd>${esc(s.commune)}</dd>
        <dt>${t("district")}</dt><dd>${esc(s.district)}</dd>
        <dt>${t("province")}</dt><dd>${esc(provName(s.province))}</dd>
        <dt>${t("colYears")}</dt><dd>${t("yearsRange", YEARS[yrs[0]], YEARS[yrs[yrs.length - 1]], num(yrs.length))}</dd>
      </dl>
      <div class="note">${t("history")}</div>
      <div class="strip">${cells}</div>
      <div class="strip-axis"><span>1999</span><span>2013</span><span>2028</span></div>
      ${s.remark ? `<div class="note">${t("remark")}: ${esc(s.remark)}</div>` : ""}
      ${s.approx ? `<div class="note">≈ ${t("approx")}</div>` : ""}
    </div>`;
  }
  function openPopup(s) {
    L.popup({ maxWidth: 320, autoPanPadding: [30, 30] }).setLatLng([s.lat, s.lon]).setContent(popupHtml(s)).openOn(map);
  }
  const esc = v => String(v).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ---------- table ----------
  function sortVal(s, k) {
    if (k === "status") return statusOf(s) || "~";
    if (k === "years") return s.nYears;
    return (s[k] || "~").toString().toLowerCase();
  }
  function renderTable(list) {
    const k = S.sortK, d = S.sortDir;
    const rows = list.slice().sort((a, b) => {
      const x = sortVal(a, k), y = sortVal(b, k);
      return (x < y ? -1 : x > y ? 1 : 0) * d || a.name_en.localeCompare(b.name_en);
    });
    const tb = $("#tbl tbody");
    tb.innerHTML = rows.slice(0, S.shown).map(s => {
      const c = statusOf(s);
      return `<tr data-uid="${s.uid}" tabindex="0"><td>${esc(s.name_en)}${s.approx ? " ≈" : ""}</td><td>${esc(s.name_kh || "")}</td><td>${s.emis}</td><td>${esc(s.commune)}</td><td>${esc(s.district)}</td><td>${esc(provName(s.province))}</td><td><span class="tag ${c || "none"}">${implName(c)}</span></td><td>${num(s.nYears)} (${s.first.slice(0, 4)}–${s.lastYear.slice(5)})</td></tr>`;
    }).join("");
    $$("#tbl th").forEach(th => th.setAttribute("aria-sort", th.dataset.k === k ? (d > 0 ? "ascending" : "descending") : "none"));
    $("#list-count").textContent = list.length > S.shown ? t("showing", num(Math.min(S.shown, list.length)), num(list.length)) : "(" + num(list.length) + ")";
    $("#more").hidden = list.length <= S.shown;
    $("#empty").hidden = list.length > 0;
  }
  function downloadCsv() {
    const list = current();
    const head = ["school_year_selected", "status", "school_uid", "emis_code", "name_en", "name_kh", "village", "commune", "district", "province", "first_year", "last_year", "years_in_programme", "lat", "lon", "location_note"];
    const q = v => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const lines = [head.join(",")].concat(list.map(s => [
      S.year < 0 ? "all" : YEARS[S.year], statusOf(s) === "W" ? "WFP" : statusOf(s) === "M" ? "MoEYS" : "",
      s.uid, s.emis, s.name_en, s.name_kh, s.village, s.commune, s.district, s.province, s.first, s.lastYear, s.nYears,
      s.lat, s.lon, s.approx ? "approximate (commune average)" : ""].map(q).join(",")));
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `school_feeding_${S.year < 0 ? "all_years" : YEARS[S.year]}${S.prov ? "_" + S.prov.replace(/\s+/g, "_") : ""}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ---------- printing ----------
  function filterSummary(list) {
    const parts = [S.year < 0 ? t("yearsAll") : `${t("schoolYear")} ${YEARS[S.year]}`];
    if (S.impl !== "all") parts.push(implName(S.impl));
    if (S.dist) parts.push(`${S.dist}, ${provName(S.prov)}`); else if (S.prov) parts.push(provName(S.prov));
    if (S.q) parts.push(`"${S.q}"`);
    parts.push(t("schoolsShown", num(list.length)));
    return parts.join("; ");
  }
  function defaultTitle() {
    const where = S.dist ? `${S.dist}, ${provName(S.prov)}` : S.prov ? provName(S.prov) : t("allCambodia");
    return `${t("mapTitleDefault")}, ${where}, ${S.year < 0 ? t("allYears") : YEARS[S.year]}`;
  }
  function drawInset() {
    const svg = $("#p-inset");
    const W = 200, H = 170, b = [102.3, 10.35, 107.65, 14.7];
    const sx = W / (b[2] - b[0]), sy = H / (b[3] - b[1]), s = Math.min(sx, sy * Math.cos(12.5 * Math.PI / 180)) ;
    const kx = s, ky = s / Math.cos(12.5 * Math.PI / 180);
    const ox = (W - (b[2] - b[0]) * kx) / 2, oy = (H - (b[3] - b[1]) * ky) / 2;
    const P = ([x, y]) => `${(ox + (x - b[0]) * kx).toFixed(1)},${(oy + (b[3] - y) * ky).toFixed(1)}`;
    const ring = r => "M" + r.map(P).join("L") + "Z";
    let paths = "";
    PROVS.features.forEach(f => {
      const g = f.geometry, polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
      const d = polys.map(p => p.map(ring).join("")).join("");
      const sel = S.prov && f.properties.name === S.prov;
      paths += `<path d="${d}" fill="${sel ? "#C9D8CE" : "#fff"}" stroke="#7A877F" stroke-width="${sel ? 0.9 : 0.4}"/>`;
    });
    const vb = map.getBounds();
    const p1 = P([vb.getWest(), vb.getNorth()]).split(","), p2 = P([vb.getEast(), vb.getSouth()]).split(",");
    const rx = Math.max(0, +p1[0]), ry = Math.max(0, +p1[1]), rw = Math.min(W, +p2[0]) - rx, rh = Math.min(H, +p2[1]) - ry;
    svg.innerHTML = paths + `<rect x="${rx}" y="${ry}" width="${Math.max(2, rw)}" height="${Math.max(2, rh)}" fill="none" stroke="#C0392B" stroke-width="1.6"/>`;
  }
  function openPrint() {
    $("#pd-t").value = defaultTitle();
    const d = $("#print-dlg");
    if (d.showModal) d.showModal(); else d.setAttribute("open", "");
  }
  function doPrint() {
    const paper = $("#pd-paper").value, orient = $("#pd-orient").value;
    const dims = { A4: [297, 210], A3: [420, 297] }[paper];
    const [pw0, ph0] = orient === "landscape" ? dims : [dims[1], dims[0]];
    const m = 10, pw = pw0 - 2 * m, ph = ph0 - 2 * m - 1;
    const side = orient === "landscape" ? (paper === "A3" ? 80 : 62) : 0;
    $("#page-size").textContent = `@page { size: ${paper} ${orient}; margin: ${m}mm; }`;
    const list = current();
    $("#p-title").textContent = $("#pd-t").value.trim() || defaultTitle();
    $("#p-sub").textContent = filterSummary(list);
    $("#p-note").textContent = t("approxLine");
    $("#p-source").textContent = t("source");
    $("#p-date").textContent = t("printedOn", new Date().toLocaleDateString(S.lang === "km" ? "km-KH" : "en-GB", { day: "numeric", month: "long", year: "numeric" }));
    map.closePopup();
    const center = map.getCenter(), zoom = map.getZoom();
    const vb = map.getBounds();
    document.body.style.setProperty("--pw", pw + "mm");
    document.body.style.setProperty("--ph", ph + "mm");
    document.body.style.setProperty("--side", side + "mm");
    document.body.classList.add("print-prep");
    document.body.classList.toggle("portrait", orient === "portrait");
    map.invalidateSize({ animate: false });
    map.fitBounds(vb, { animate: false });
    drawInset();
    let done = false;
    const go = () => { if (done) return; done = true; setTimeout(() => window.print(), 250); };
    baseLoad[S.base].once("load", go);
    setTimeout(go, 2500);
    const restore = () => {
      window.removeEventListener("afterprint", restore);
      document.body.classList.remove("print-prep", "portrait");
      map.invalidateSize({ animate: false });
      map.setView(center, zoom, { animate: false });
    };
    window.addEventListener("afterprint", restore);
  }

  // ---------- main update ----------
  function update() {
    renderFilters();
    const list = current();
    renderTimeline();
    renderStats(list);
    renderMap(list);
    renderTable(list);
    writeHash();
  }

  function bind() {
    $("#tl-play").addEventListener("click", togglePlay);
    $("#tl-all").addEventListener("click", () => { stopPlay(); setYear(S.year < 0 ? YEARS.length - 1 : -1); });
    $$(".seg button").forEach(b => b.addEventListener("click", () => { S.impl = b.dataset.impl; update(); }));
    $("#f-prov").addEventListener("change", e => { S.prov = e.target.value; S.dist = ""; S.shown = 50; update(); });
    $("#f-dist").addEventListener("change", e => {
      S.dist = e.target.value;
      if (S.dist && !S.prov) { const s = SCHOOLS.find(x => x.district === S.dist); if (s) S.prov = s.province; }
      S.shown = 50; update();
    });
    let qt;
    $("#f-q").addEventListener("input", e => { clearTimeout(qt); qt = setTimeout(() => { S.q = e.target.value.trim(); S.shown = 50; update(); }, 250); });
    $("#f-reset").addEventListener("click", () => { stopPlay(); Object.assign(S, { year: YEARS.length - 1, impl: "all", prov: "", dist: "", q: "", shown: 50 }); update(); });
    $$(".lang button").forEach(b => b.addEventListener("click", () => { S.lang = b.dataset.lang; map.closePopup(); applyI18n(); update(); }));
    $$(".basemap button").forEach(b => b.addEventListener("click", () => {
      if (S.base === b.dataset.base) return;
      map.removeLayer(baseLayers[S.base]); S.base = b.dataset.base; baseLayers[S.base].addTo(map);
      $$(".basemap button").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.base === S.base)));
      update();
    }));
    $$("#tbl th").forEach(th => th.addEventListener("click", () => {
      if (S.sortK === th.dataset.k) S.sortDir *= -1; else { S.sortK = th.dataset.k; S.sortDir = th.dataset.k === "years" ? -1 : 1; }
      renderTable(current());
    }));
    const rowGo = tr => {
      const s = SCHOOLS.find(x => x.uid === +tr.dataset.uid); if (!s) return;
      map.setView([s.lat, s.lon], Math.max(map.getZoom(), 13));
      openPopup(s);
      $("#map-wrap").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    };
    $("#tbl tbody").addEventListener("click", e => { const tr = e.target.closest("tr"); if (tr) rowGo(tr); });
    $("#tbl tbody").addEventListener("keydown", e => { if (e.key === "Enter") { const tr = e.target.closest("tr"); if (tr) rowGo(tr); } });
    $("#more").addEventListener("click", () => { S.shown += 50; renderTable(current()); });
    $("#csv").addEventListener("click", downloadCsv);
    map.on("zoomend", () => renderMap(current()));
    $("#print-open").addEventListener("click", openPrint);
    $("#pd-cancel").addEventListener("click", () => $("#print-dlg").close());
    $("#print-form").addEventListener("submit", () => { setTimeout(doPrint, 50); });
    window.addEventListener("resize", () => map.invalidateSize());
  }

  // ---------- load ----------
  Promise.all([fetch("data/schools.json").then(r => r.json()), fetch("data/provinces.geojson").then(r => r.json())])
    .then(([d, p]) => {
      D = d; YEARS = d.years; PROVS = p;
      p.features.forEach(f => { provKh[f.properties.name] = f.properties.name_kh; });
      const F = d.fields;
      SCHOOLS = d.rows.map(r => {
        const o = {}; F.forEach((f, i) => { o[f] = r[i]; });
        const idx = [...o.history].map((c, i) => c !== "." ? i : -1).filter(i => i >= 0);
        o.last = o.history[idx[idx.length - 1]];
        o.nYears = idx.length; o.first = YEARS[idx[0]]; o.lastYear = YEARS[idx[idx.length - 1]];
        return o;
      });
      readHash();
      applyI18n();
      buildTimeline();
      initMap();
      $$(".basemap button").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.base === S.base)));
      bind();
      update();
    })
    .catch(err => {
      document.querySelector(".stage").innerHTML = `<p style="padding:24px">The school data could not be loaded (${esc(err.message)}). If you opened this file directly from your computer, use the GitHub Pages link instead, or run a local web server.</p>`;
    });
})();
