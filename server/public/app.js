// creative-lab UI — vanilla JS, hash routes, zero dependencies.
// Ad copy, page names and links come from third parties: they are rendered as text nodes only
// (never innerHTML), and links are restricted to http(s). The UI never generates or spends —
// generation is CLI-only (`node cli.mjs gen run --batch <id> --confirm <id>`).
"use strict";

(() => {
  // ── DOM kit ──────────────────────────────────────────────────────────────────
  const $ = (s, r = document) => r.querySelector(s);

  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v === null || v === undefined || v === false) continue;
        if (k === "class") el.className = Array.isArray(v) ? v.filter(Boolean).join(" ") : v;
        else if (k === "style" && typeof v === "object") {
          for (const [sk, sv] of Object.entries(v)) {
            if (sv === null || sv === undefined) continue;
            if (sk.startsWith("--")) el.style.setProperty(sk, sv);
            else el.style[sk] = sv;
          }
        } else if (k === "dataset") Object.assign(el.dataset, v);
        else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (v === true) el.setAttribute(k, "");
        else el.setAttribute(k, String(v));
      }
    }
    append(el, kids);
    return el;
  }
  function append(el, kids) {
    for (const k of kids.flat(Infinity)) {
      if (k === null || k === undefined || k === false || k === true) continue;
      el.append(k instanceof Node ? k : document.createTextNode(String(k)));
    }
    return el;
  }

  // Trusted, constant SVG markup only.
  const SVG = (inner, fill = false) =>
    `<svg viewBox="0 0 24 24" ${fill ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'}>${inner}</svg>`;
  const ICONS = {
    search: SVG('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
    star: SVG('<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>'),
    starFill: SVG('<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>', true),
    eyeOff: SVG('<path d="M3 3l18 18"/><path d="M10.6 5.1A10.7 10.7 0 0 1 12 5c6 0 9.5 7 9.5 7a17 17 0 0 1-3.1 3.9M6.6 6.6C3.9 8.4 2.5 12 2.5 12S6 19 12 19a9.6 9.6 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
    eye: SVG('<path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z"/><circle cx="12" cy="12" r="3"/>'),
    play: SVG('<path d="M7 4.5v15l13-7.5z"/>', true),
    pause: SVG('<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>', true),
    external: SVG('<path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>'),
    copy: SVG('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>'),
    trophy: SVG('<path d="M7 3h10v2h3v3a4 4 0 0 1-4.1 4A5 5 0 0 1 13 14.9V18h3v3H8v-3h3v-3.1A5 5 0 0 1 8.1 12 4 4 0 0 1 4 8V5h3zm0 4H6v1a2 2 0 0 0 1.2 1.8A5 5 0 0 1 7 8zm10 0v1c0 .6-.1 1.2-.2 1.8A2 2 0 0 0 18 8V7z"/>', true),
    check: SVG('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
    x: SVG('<path d="M6 6l12 12M18 6 6 18"/>'),
    alert: SVG('<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.5v.01"/>'),
    clock: SVG('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    image: SVG('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>'),
    film: SVG('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>'),
    layers: SVG('<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>'),
    arrowLeft: SVG('<path d="M19 12H5M11 6l-6 6 6 6"/>'),
    refresh: SVG('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>'),
    info: SVG('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/>'),
    gift: SVG('<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12M12 8S10.5 4 8 4.5 7 8 12 8zm0 0s1.5-4 4-3.5S17 8 12 8z"/>'),
    shield: SVG('<path d="M12 3 4 6v6c0 4.4 3.4 8.2 8 9 4.6-.8 8-4.6 8-9V6z"/><path d="m9 12 2 2 4-4"/>'),
    terminal: SVG('<path d="m5 8 4 4-4 4M12 17h7"/>'),
    box: SVG('<path d="M3 8 12 3l9 5v8l-9 5-9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>'),
    plus: SVG('<path d="M12 5v14M5 12h14"/>'),
  };
  function icon(name, cls = "") {
    const s = document.createElement("span");
    s.className = `i ${cls}`.trim();
    s.setAttribute("aria-hidden", "true");
    s.innerHTML = ICONS[name] || "";
    return s;
  }
  const spinner = () => h("span", { class: "spinner", "aria-hidden": "true" });

  // ── formatting ───────────────────────────────────────────────────────────────
  const nf = new Intl.NumberFormat("en-US"); // Western digits everywhere (brand rule)
  const isNum = (n) => n !== null && n !== undefined && n !== "" && Number.isFinite(Number(n));
  const fmtNum = (n) => (isNum(n) ? nf.format(Number(n)) : "–");
  const fmtDA = (n) => (isNum(n) ? `${nf.format(Math.round(Number(n)))} DA` : "–");
  const fmtUsd = (n) => (isNum(n) ? `$${Number(n).toFixed(2)}` : "–");
  const fmtDays = (d) => (isNum(d) ? `${Math.round(Number(d))}d` : "–");
  const fmtScore = (s) => (isNum(s) ? String(Math.round(Number(s))) : "–");
  const fmtScore1 = (s) => (isNum(s) ? Number(s).toFixed(1) : "–");
  const fmtDur = (s) => {
    if (!isNum(s)) return "";
    const t = Math.round(Number(s));
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
  };
  const fmtDate = (sec) => (isNum(sec) && Number(sec) > 0 ? new Date(Number(sec) * 1000).toISOString().slice(0, 10) : "–");
  const fmtIso = (iso) => (iso ? String(iso).replace("T", " ").slice(0, 16) : "–");
  function fmtRel(iso) {
    const t = Date.parse(iso);
    if (!t) return "–";
    const s = (Date.now() - t) / 1000;
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    return `${Math.floor(s / 86400)} d ago`;
  }
  const pretty = (id) => {
    const s = String(id ?? "").replace(/_/g, " ").trim();
    return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : "";
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const plural = (n, w) => `${fmtNum(n)} ${w}${Number(n) === 1 ? "" : "s"}`;
  function aspectOf(w, hgt) {
    if (!w || !hgt) return null;
    const r = w / hgt;
    const known = [["9:16", 9 / 16], ["2:3", 2 / 3], ["3:4", 0.75], ["4:5", 0.8], ["1:1", 1], ["1.91:1", 1.91], ["16:9", 16 / 9]];
    let best = null;
    let d = Infinity;
    for (const [l, v] of known) {
      const dd = Math.abs(Math.log(r / v));
      if (dd < d) [d, best] = [dd, l];
    }
    return d < 0.05 ? best : `${r.toFixed(2)}:1`;
  }
  const safeHref = (u) => (typeof u === "string" && /^https?:\/\//i.test(u) ? u : null);
  function firstLines(text, n) {
    return String(text || "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, n)
      .join("\n");
  }

  // ── API ──────────────────────────────────────────────────────────────────────
  class ApiError extends Error {
    constructor(status, body) {
      super(body?.error || `HTTP ${status}`);
      this.status = status;
      this.body = body || {};
    }
  }
  async function api(path, { method = "GET", body, signal } = {}) {
    let res;
    try {
      res = await fetch(path, {
        method,
        signal,
        headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      if (e?.name === "AbortError") throw e;
      throw new ApiError(0, { error: "Server unreachable — is `node server/server.mjs` running?" });
    }
    const text = await res.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: text.slice(0, 200) };
      }
    }
    if (!res.ok) throw new ApiError(res.status, data);
    return data;
  }

  // ── taxonomy (labels + descriptions for enums) ──────────────────────────────
  let TAX = null;
  async function loadTaxonomy() {
    if (TAX) return TAX;
    try {
      TAX = await api("/api/taxonomy");
    } catch {
      TAX = {};
    }
    return TAX;
  }
  function taxEntry(list, id) {
    const arr = TAX?.[list];
    if (!Array.isArray(arr)) return null;
    return arr.find((x) => (x && typeof x === "object" ? x.id === id : x === id)) ?? null;
  }
  const tLabel = (list, id) => {
    const e = taxEntry(list, id);
    return (e && typeof e === "object" && e.label) || pretty(id);
  };
  const tDesc = (list, id) => {
    const e = taxEntry(list, id);
    return (e && typeof e === "object" && e.desc) || "";
  };
  const rungOf = (strategy) => taxEntry("generation_strategies", strategy)?.rung || null;
  const rungDesc = (rung) => {
    const fr = TAX?.fidelity_rungs?.[rung];
    return typeof fr === "string" ? fr : fr?.desc || fr?.label || "";
  };
  const RUNG_CLASS = { L0: "green", L1: "green", L2: "blue", L3: "violet", L4: "amber", L5: "amber", L6: "red" };
  const ROLE_COLORS = {
    hook: "#f0b13e",
    reveal: "#6ea7ff",
    proof: "#43cf7f",
    detail: "#b394ff",
    demo: "#4fd1c5",
    offer: "#f15c68",
    objection: "#f59e9e",
    social_proof: "#e3be63",
    cta: "#f2efe8",
    end_card: "#8b8891",
  };
  const roleColor = (r) => ROLE_COLORS[r] || "#8b8891";

  // ── shared components ───────────────────────────────────────────────────────
  function toast(msg, { kind = "info", action, timeout = 3600 } = {}) {
    const box = $("#toasts");
    const t = h("div", { class: `toast ${kind}` }, icon(kind === "error" ? "alert" : kind === "ok" ? "check" : "info"), h("span", null, msg));
    let timer;
    const close = () => {
      clearTimeout(timer);
      t.remove();
    };
    if (action) {
      t.append(
        h("button", {
          class: "btn btn-xs",
          type: "button",
          onclick: () => {
            close();
            action.fn();
          },
        }, action.label),
      );
    }
    box.append(t);
    while (box.children.length > 4) box.firstElementChild.remove();
    timer = setTimeout(close, action ? Math.max(timeout, 6000) : timeout);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const ta = h("textarea", { style: { position: "fixed", opacity: "0", top: "0", left: "0" } });
        ta.value = text;
        document.body.append(ta);
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        return ok;
      } catch {
        return false;
      }
    }
  }
  function copyBtn(text, label = "Copy") {
    const lbl = h("span", null, label);
    const b = h("button", { class: "btn btn-xs btn-ghost copy", type: "button", title: "Copy to clipboard" }, icon("copy", "i-sm"), lbl);
    b.addEventListener("click", async (e) => {
      e.stopPropagation();
      const ok = await copyText(text);
      b.classList.add(ok ? "ok" : "err");
      lbl.textContent = ok ? "Copied" : "Copy failed";
      setTimeout(() => {
        b.classList.remove("ok", "err");
        lbl.textContent = label;
      }, 1500);
    });
    return b;
  }
  const cmdBlock = (cmd, lg = false) => h("div", { class: ["cmd", lg && "lg"] }, h("code", null, cmd), copyBtn(cmd));

  function stateBox({ kind = "", iconName = "box", title, text, extra = [], compact = false }) {
    return h("div", { class: ["state", kind, compact && "compact"] }, icon(iconName), title && h("h3", null, title), text && h("p", null, text), extra);
  }
  function errorState(e, retry) {
    return stateBox({
      kind: "err",
      iconName: "alert",
      title: e?.status ? `Request failed (${e.status})` : "Something went wrong",
      text: e?.message || String(e),
      extra: [e?.body?.detail && h("div", { class: "detail" }, e.body.detail), retry && h("button", { class: "btn btn-sm", type: "button", onclick: retry }, icon("refresh"), "Retry")],
    });
  }
  function notReady(name, e, retry, compact = false) {
    const file = name === "batch" ? "lib/batch.mjs" : "lib/styles.mjs";
    return stateBox({
      kind: "wait",
      iconName: "clock",
      compact,
      title: `${name === "batch" ? "Batch" : "Styles"} module not ready`,
      text: `${file} is not loadable yet. Everything else in the lab works. The server re-checks the file on every request, so this page usually starts working as soon as the module lands; if the detail below says “restart”, restart the UI server.`,
      extra: [e?.body?.detail && h("div", { class: "detail" }, e.body.detail), retry && h("button", { class: "btn btn-sm", type: "button", onclick: retry }, icon("refresh"), "Check again")],
    });
  }
  const loadingBox = (text = "Loading…") => h("div", { class: "loading" }, spinner(), text);
  function panel(title, hint, body, { actions, cls } = {}) {
    return h("section", { class: ["panel", cls] }, h("div", { class: "panel-head" }, h("h2", null, title), hint && h("span", { class: "hint" }, hint), actions && h("div", { class: "spacer" }), actions), h("div", { class: "panel-body" }, body));
  }
  function pageView(title, sub, body, actions) {
    return h("section", { class: "view" }, h("div", { class: "view-head" }, h("div", null, h("h1", null, title), sub && h("div", { class: "sub" }, sub)), actions && h("div", { class: "spacer" }), actions), body);
  }
  const chip = (text, cls = "", title) => (text === null || text === undefined || text === "" ? null : h("span", { class: `chip ${cls}`.trim(), title: title || null }, text));
  const kv = (pairs) =>
    h(
      "dl",
      { class: "kv" },
      pairs.filter((p) => p && p[1] !== undefined && p[1] !== null && p[1] !== "").map(([k, v]) => [h("dt", null, k), h("dd", null, v)]),
    );
  const yesNo = (b) => (b ? h("span", { class: "yes" }, "Yes") : h("span", { class: "no" }, "No"));
  const dotSep = () => h("span", { class: "dotsep", "aria-hidden": "true" });

  const ST_OK = /^(ready|approved|generated|qa_pass|success|downloaded|assembled|done|exported|pass|ok)$/i;
  const ST_BAD = /^(blocked|fail|failed|qa_fail|error|block|cancelled|canceled|expired)$/i;
  const ST_RUN = /^(generating|submitted|assembling|running|polling|queued|qa|uploading)$/i;
  const ST_WARN = /^(warn|partial|needs_review|qa_warn)$/i;
  const stClass = (s) => (ST_OK.test(s) ? "ok" : ST_BAD.test(s) ? "bad" : ST_RUN.test(s) ? "run" : ST_WARN.test(s) ? "warn" : "idle");
  const statusSt = (s) => h("span", { class: `st ${stClass(String(s || ""))}` }, s || "unknown");
  const verdictBadge = (v) => {
    const k = ["PASS", "WARN", "BLOCK"].includes(String(v || "").toUpperCase()) ? String(v).toUpperCase() : "NONE";
    return h("span", { class: `verdict ${k}` }, k === "NONE" ? "NOT RUN" : k);
  };
  const qaBadge = (v) => {
    const u = String(v || "").toUpperCase();
    const cls = u === "PASS" ? "PASS" : u === "WARN" ? "WARN" : /^(FAIL|BLOCK|REJECT)/.test(u) ? "BLOCK" : "NONE";
    return h("span", { class: `verdict ${cls}`, title: "Post-generation QA" }, `QA ${u || "?"}`);
  };

  // lightbox
  let lbReturn = null;
  function lightbox(src, caption) {
    const lb = $("#lightbox");
    const img = lb.querySelector("img");
    img.src = src;
    lb.querySelector("figcaption").textContent = caption || "";
    lb.hidden = false;
    lbReturn = document.activeElement;
    lb.querySelector(".lightbox-close").focus();
  }
  function closeLightbox() {
    const lb = $("#lightbox");
    if (lb.hidden) return;
    lb.hidden = true;
    lb.querySelector("img").removeAttribute("src");
    lbReturn?.focus?.();
  }

  // ── stats + nav ──────────────────────────────────────────────────────────────
  let STATS = null;
  let statsAt = 0;
  async function refreshStats(force = false) {
    if (!force && Date.now() - statsAt < 4000) return STATS;
    statsAt = Date.now();
    try {
      STATS = await api("/api/stats");
    } catch {
      return STATS;
    }
    const set = (k, v) => {
      const el = $(`[data-count="${k}"]`);
      if (el) el.textContent = isNum(v) ? fmtNum(v) : "";
    };
    set("winners", STATS.curated ?? STATS.winners);
    set("briefs", STATS.briefs);
    set("styles", STATS.modules?.styles === false ? null : STATS.styles);
    set("products", STATS.products);
    set("batches", STATS.modules?.batch === false ? null : STATS.batches);
    const parts = [
      [STATS.curated_local, "local"],
      [STATS.curated_premium, "big-brand"],
      [STATS.analysed, "DNA"],
    ];
    $("#libstats").replaceChildren(
      ...parts.flatMap(([n, w], i) => [i ? " · " : "", h("b", null, fmtNum(n)), ` ${w}`]),
      STATS.last_crawl ? ` · crawl ${fmtRel(STATS.last_crawl)}` : "",
    );
    return STATS;
  }
  function setNav(key) {
    document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === key));
  }

  // ── router ───────────────────────────────────────────────────────────────────
  const app = $("#app");
  let routeSeq = 0;
  let winners = null; // cached Winners view: { el, key, scrollY, ... }
  let lastWinnersHash = "#/";

  function parseHash() {
    const raw = location.hash.replace(/^#/, "") || "/";
    const qi = raw.indexOf("?");
    const path = (qi === -1 ? raw : raw.slice(0, qi)) || "/";
    return { path, query: new URLSearchParams(qi === -1 ? "" : raw.slice(qi + 1)) };
  }
  function clearOthers() {
    for (const c of [...app.children]) if (c !== winners?.el) c.remove();
  }
  function mount(seq, node, { keepScroll = false } = {}) {
    if (seq !== routeSeq) return false;
    if (winners) winners.el.hidden = true;
    clearOthers();
    app.append(node);
    if (!keepScroll) window.scrollTo(0, 0);
    return true;
  }
  const mountLoading = (seq) => mount(seq, h("section", { class: "view" }, loadingBox()));

  const ROUTES = [
    [/^\/$/, "winners", viewWinners],
    [/^\/ad\/([^/]+)$/, "winners", viewAd],
    [/^\/styles$/, "styles", viewStyles],
    [/^\/style\/([^/]+)$/, "styles", viewStyle],
    [/^\/products$/, "products", viewProducts],
    [/^\/batch\/new$/, "new", viewBatchNew],
    [/^\/batches$/, "batches", viewBatches],
    [/^\/batch\/([^/]+)$/, "batches", viewBatch],
    [/^\/briefs$/, "briefs", viewBriefs],
    [/^\/brief\/new$/, "briefs", viewBriefNew],
    [/^\/brief\/([^/]+)$/, "briefs", viewBrief],
  ];

  async function route() {
    const seq = ++routeSeq;
    if (winners && !winners.el.hidden) winners.scrollY = window.scrollY;
    closeLightbox();
    const { path, query } = parseHash();
    refreshStats();
    for (const [re, nav, fn] of ROUTES) {
      const m = re.exec(path);
      if (!m) continue;
      setNav(nav);
      let params;
      try {
        params = m.slice(1).map(decodeURIComponent);
      } catch {
        params = m.slice(1);
      }
      try {
        await fn({ params, query, seq });
      } catch (e) {
        console.warn(e);
        mount(seq, h("section", { class: "view" }, errorState(e, route)));
      }
      return;
    }
    setNav("");
    mount(seq, pageView("Not found", null, stateBox({ title: "No such page", text: `Nothing lives at #${path}.`, extra: [h("a", { class: "btn btn-sm", href: "#/" }, "Go to winners")] })));
  }

  // ── Winners (library grid) ───────────────────────────────────────────────────
  const FILTER_KEYS = ["segment", "all", "q", "country", "format", "tier", "lang", "minDays", "winner", "starred", "media", "hidden", "page", "sort"];
  const PAGE_SIZE = 48;
  function filtersFrom(query) {
    const f = {};
    for (const k of FILTER_KEYS) {
      const v = query.get(k);
      if (v !== null && v !== "") f[k] = v;
    }
    return f;
  }
  function filtersQS(f) {
    const p = new URLSearchParams();
    for (const k of FILTER_KEYS) if (f[k] !== undefined && f[k] !== null && f[k] !== "") p.set(k, f[k]);
    return p.toString();
  }

  async function viewWinners({ query, seq }) {
    const key = filtersQS(filtersFrom(query));
    if (!STATS) await refreshStats(true);
    if (seq !== routeSeq) return;
    clearOthers();
    if (winners && winners.key === key) {
      winners.el.hidden = false;
      const y = winners.scrollY || 0;
      requestAnimationFrame(() => window.scrollTo(0, y));
      return;
    }
    if (winners) {
      winners.destroy();
      winners.el.remove();
    }
    winners = createWinners(query);
    app.append(winners.el);
    window.scrollTo(0, 0);
  }

  function createWinners(query) {
    const f = filtersFrom(query);
    const W = { key: filtersQS(f), scrollY: 0, total: 0, offset: 0, loading: false, done: false, ctrl: null, pageName: null, registry: new Map(), showHidden: !!f.hidden };
    const el = h("section", { class: "view view-winners" });
    W.el = el;
    const facets = STATS?.facets || {};

    const commit = () => {
      W.key = filtersQS(f);
      lastWinnersHash = `#/${W.key ? `?${W.key}` : ""}`;
      history.replaceState(null, "", lastWinnersHash);
      load(true);
    };
    const setF = (k, v) => {
      if (v) f[k] = v;
      else delete f[k];
      commit();
    };

    const sel = (key, allLabel, options, { noAll = false } = {}) => {
      const s = h("select", { class: "select", "aria-label": allLabel }, noAll ? null : h("option", { value: "" }, allLabel), options.map(([v, t]) => h("option", { value: v }, t)));
      const cur = f[key] || (noAll ? options[0]?.[0] : "");
      if (cur && ![...s.options].some((o) => o.value === cur)) s.append(h("option", { value: cur }, cur));
      s.value = cur;
      s.classList.toggle("set", !noAll && !!s.value);
      s.addEventListener("change", () => {
        s.classList.toggle("set", !noAll && !!s.value);
        setF(key, noAll && s.value === options[0]?.[0] ? "" : s.value);
      });
      return s;
    };
    const tog = (key, text, title) => {
      const b = h("button", { class: "toggle", type: "button", "aria-pressed": String(!!f[key]), title }, text);
      b.addEventListener("click", () => {
        const on = b.getAttribute("aria-pressed") !== "true";
        b.setAttribute("aria-pressed", String(on));
        setF(key, on ? "1" : "");
      });
      return b;
    };

    const search = h("input", { class: ["input", f.q && "set"], type: "search", placeholder: "Search copy, page, link, id…", value: f.q || "", "aria-label": "Search ads", "data-search": "1" });
    let deb = 0;
    search.addEventListener("input", () => {
      clearTimeout(deb);
      deb = setTimeout(() => {
        search.classList.toggle("set", !!search.value.trim());
        setF("q", search.value.trim());
      }, 280);
    });
    search.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        clearTimeout(deb);
        setF("q", search.value.trim());
      }
    });
    const count = (n) => (isNum(n) ? ` · ${fmtNum(n)}` : "");
    const bar = h(
      "div",
      { class: "filterbar" },
      h("div", { class: "search" }, icon("search"), search),
      sel("segment", "All sources", [["local", "Algeria & Maghreb" + count(STATS?.curated_local)], ["premium", "Big brands" + count(STATS?.curated_premium)]]),
      sel("country", "All countries", (facets.countries || []).map((c) => [c.value, `${c.value}${count(c.n)}`])),
      sel("format", "All formats", (facets.formats || []).map((c) => [c.value, `${pretty(c.value)}${count(c.n)}`])),
      sel("tier", "All tiers", (facets.tiers || []).map((c) => [c.value, `${pretty(c.value)}${count(c.n)}`])),
      sel("lang", "All languages", (facets.langs || []).map((c) => [c.value, `${c.value.toUpperCase()}${count(c.n)}`])),
      sel("minDays", "Any age", [["7", "≥ 7 days"], ["14", "≥ 14 days"], ["21", "≥ 21 days"], ["30", "≥ 30 days"], ["60", "≥ 60 days"], ["90", "≥ 90 days"], ["180", "≥ 180 days"], ["365", "≥ 1 year"]]),
      h("span", { class: "sep" }),
      tog("winner", "Winners", "Only ads flagged as winners (long-running, active, score above threshold)"),
      tog("starred", "Starred"),
      tog("all", "Show everything", "By default the library shows one ad per creative (duplicates collapsed) and only ads whose video/image is downloaded. Turn on to see every raw ad."),
      tog("hidden", "Hidden", "Show hidden ads instead (to restore them)"),
      h(
        "div",
        { class: "right" },
        sel("sort", "Sort", [["score", "Sort: winner score"], ["days", "Sort: longest running"], ["dup", "Sort: most duplicated"], ["recent", "Sort: newest"], ["seen", "Sort: recently seen"]], { noAll: true }),
        h("button", { class: "btn btn-ghost btn-sm", type: "button", title: "Clear all filters", onclick: () => (location.hash = "#/") }, "Reset"),
      ),
    );

    const resultLine = h("div", { class: "resultline" });
    const grid = h("div", { class: "ad-grid", "aria-live": "polite" });
    const moreBtn = h("button", { class: "btn btn-sm", type: "button", onclick: () => load(false) }, "Load more");
    const more = h("div", { class: "more" }, moreBtn);
    el.append(bar, resultLine, grid, more);

    const ctx = {
      showHidden: !!f.hidden,
      registry: W.registry,
      onPage: (pageId, name) => {
        if (!pageId) return;
        W.pageName = name || null;
        f.page = pageId;
        commit();
        window.scrollTo(0, 0);
      },
    };

    function paintResultLine() {
      const active = FILTER_KEYS.filter((k) => k !== "sort" && f[k]).length;
      resultLine.replaceChildren(...[
        h("span", null, h("b", null, fmtNum(W.total)), ` ${W.total === 1 ? "creative" : "creatives"}${f.hidden ? " hidden" : f.all ? " (raw, incl. duplicates)" : f.segment === "premium" ? " from big brands" : " curated"}`),
        f.page &&
          h(
            "span",
            { class: "chip outline" },
            `Page: ${W.pageName || f.page}`,
            h("button", { class: "iconbtn", type: "button", "aria-label": "Remove page filter", style: { width: "16px", height: "16px" }, onclick: () => setF("page", "") }, icon("x", "i-sm")),
          ),
        active ? h("button", { class: "btn btn-ghost btn-xs", type: "button", onclick: () => (location.hash = "#/") }, `Clear ${plural(active, "filter")}`) : null,
        h("span", { class: "spacer" }),
        h("span", { class: "faint" }, "Hover a video to preview · click to open"),
      ].filter(Boolean));
    }
    function paintMore() {
      more.hidden = W.done || !W.total;
      moreBtn.disabled = W.loading;
      moreBtn.replaceChildren(W.loading ? spinner() : null, W.loading ? "Loading…" : `Load more · ${fmtNum(W.offset)} of ${fmtNum(W.total)}`);
    }
    async function load(reset) {
      if (reset) {
        W.ctrl?.abort();
        W.offset = 0;
        W.done = false;
        W.loading = false;
        W.registry.clear();
        grid.replaceChildren(...Array.from({ length: 12 }, () => h("div", { class: "skel skel-card" })));
      }
      if (W.loading || W.done) return;
      W.loading = true;
      paintMore();
      const ctrl = new AbortController();
      W.ctrl = ctrl;
      const qs = filtersQS(f);
      try {
        const data = await api(`/api/ads?${qs ? `${qs}&` : ""}limit=${PAGE_SIZE}&offset=${W.offset}`, { signal: ctrl.signal });
        if (ctrl.signal.aborted) return;
        if (reset || W.offset === 0) grid.replaceChildren();
        W.total = data.total;
        W.offset += data.items.length;
        W.done = W.offset >= data.total || !data.items.length;
        if (f.page && !W.pageName && data.items[0]) W.pageName = data.items[0].page_name;
        for (const ad of data.items) grid.append(adCard(ad, ctx));
        if (!data.total) {
          const filtered = FILTER_KEYS.some((k) => k !== "sort" && f[k]);
          grid.replaceChildren(
            stateBox({
              title: filtered ? "No ads match these filters" : "The library is empty",
              text: filtered ? "Loosen a filter or clear them all." : "Run a crawl to collect ads from the Ad Library.",
              extra: filtered ? h("button", { class: "btn btn-sm", type: "button", onclick: () => (location.hash = "#/") }, "Clear filters") : cmdBlock("node cli.mjs spy niche"),
            }),
          );
        }
        paintResultLine();
      } catch (e) {
        if (e?.name === "AbortError") return;
        if (W.offset === 0) grid.replaceChildren(errorState(e, () => load(true)));
        else toast(`Could not load more ads: ${e.message}`, { kind: "error" });
      } finally {
        if (W.ctrl === ctrl) {
          W.loading = false;
          paintMore();
        }
      }
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((en) => en.isIntersecting) && !W.loading && !W.done && !el.hidden) load(false);
      },
      { rootMargin: "900px 0px" },
    );
    io.observe(more);
    W.destroy = () => {
      io.disconnect();
      W.ctrl?.abort();
    };
    lastWinnersHash = `#/${W.key ? `?${W.key}` : ""}`;
    paintResultLine();
    load(true);
    return W;
  }

  // ── ad card ──────────────────────────────────────────────────────────────────
  function formatLabel(ad) {
    const f = ad.format || "unknown";
    if (f === "video" || f === "multi_videos") return `${f === "video" ? "Video" : "Videos"}${ad.duration ? ` ${fmtDur(ad.duration)}` : ""}`;
    if (f === "carousel") return `Carousel${ad.n_images ? ` ·${ad.n_images}` : ""}`;
    if (f === "multi_images") return `Multi${ad.n_images ? ` ·${ad.n_images}` : ""}`;
    return pretty(f);
  }
  function mediaPlaceholder(ad) {
    const f = ad.format || "";
    return h("div", { class: "ph" }, icon(/video/.test(f) ? "film" : /carousel|multi/.test(f) ? "layers" : "image"), h("span", null, "Media not cached"));
  }
  function startPreview(media, src, pb) {
    if (media._pv) return;
    const v = document.createElement("video");
    v.className = "preview";
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = "auto";
    v.src = src;
    media.append(v);
    media._pv = v;
    media.classList.add("playing");
    if (pb) {
      pb.replaceChildren(icon("pause"));
      pb.setAttribute("aria-label", "Pause preview");
    }
    const p = v.play();
    if (p) p.catch(() => {});
  }
  function stopPreview(media, pb) {
    const v = media._pv;
    if (!v) return;
    media._pv = null;
    media._pinned = false;
    media.classList.remove("playing");
    try {
      v.pause();
    } catch {}
    v.removeAttribute("src");
    try {
      v.load();
    } catch {}
    v.remove();
    if (pb) {
      pb.replaceChildren(icon("play"));
      pb.setAttribute("aria-label", "Play preview");
    }
  }

  async function setFlag(ad, kind, on) {
    const r = await api(`/api/ads/${encodeURIComponent(ad.id)}/${kind}`, { method: "POST", body: { on } });
    ad.starred = r.starred;
    ad.hidden = r.hidden;
    refreshStats(true);
    return r;
  }
  function removeCard(card) {
    const parent = card.parentNode;
    const next = card.nextSibling;
    card.classList.add("leaving");
    setTimeout(() => card.remove(), 200);
    return () => {
      card.classList.remove("leaving");
      if (parent) parent.insertBefore(card, next && next.parentNode === parent ? next : null);
    };
  }

  function adCard(ad, ctx = {}) {
    const href = `#/ad/${encodeURIComponent(ad.id)}`;
    const open = () => {
      location.hash = href;
    };
    const media = h("div", { class: "media", role: "link", tabindex: "0", "aria-label": `Open ad ${ad.id}${ad.page_name ? ` by ${ad.page_name}` : ""}` });
    media.addEventListener("click", open);
    media.addEventListener("keydown", (e) => {
      if (e.key === "Enter") open();
    });
    if (ad.thumb) {
      media.style.setProperty("--bg-img", `url("${ad.thumb}")`);
      const img = h("img", { src: ad.thumb, alt: "", loading: "lazy", decoding: "async" });
      img.addEventListener(
        "error",
        () => {
          img.remove();
          media.style.removeProperty("--bg-img");
          media.prepend(mediaPlaceholder(ad));
        },
        { once: true },
      );
      media.append(img);
    } else if (ad.video) {
      const v = h("video", { preload: "metadata", muted: true, playsinline: true, src: `${ad.video}#t=0.5` });
      v.muted = true;
      media.append(v);
    } else media.append(mediaPlaceholder(ad));

    const aspect = aspectOf(ad.w, ad.h);
    media.append(
      h("div", { class: "ov tl" }, h("span", { class: ["score glass", ad.winner && "win"], title: ad.winner ? "Winner · winner score (0–100)" : "Winner score (0–100)" }, ad.winner && icon("trophy"), fmtScore(ad.score))),
      h("div", { class: "ov tr" }, h("span", { class: "ovchip glass" }, formatLabel(ad))),
      h(
        "div",
        { class: "ov bl" },
        aspect && h("span", { class: "ovchip glass" }, aspect),
        ad.segment === "premium" && h("span", { class: "ovchip brand", title: "Big-brand inspiration ad" }, ad.brand || "Brand"),
        ad.variants > 1 && h("span", { class: "ovchip glass", title: `${ad.variants} copies of this creative were running (shown once)` }, `×${ad.variants}`),
        ad.has_dna && h("span", { class: "ovchip dna", title: "Creative DNA analysed" }, "DNA"),
        ad.has_evidence && h("span", { class: "ovchip ev", title: "Evidence pack built" }, "EV"),
      ),
    );
    if (ad.video) {
      const pb = h("button", { class: "playbtn", type: "button", "aria-label": "Play preview", title: "Play / pause preview (muted)" }, icon("play"));
      pb.addEventListener("click", (e) => {
        e.stopPropagation();
        if (media._pv && media._pinned) stopPreview(media, pb);
        else {
          startPreview(media, ad.video, pb);
          media._pinned = true;
        }
      });
      pb.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") e.stopPropagation(); // activate the button, don't also open the ad
      });
      media.append(h("div", { class: "ov br" }, pb));
      let timer = 0;
      media.addEventListener("mouseenter", () => {
        timer = setTimeout(() => startPreview(media, ad.video, pb), 150);
      });
      media.addEventListener("mouseleave", () => {
        clearTimeout(timer);
        if (!media._pinned) stopPreview(media, pb);
      });
    }

    const card = h("article", { class: ["card", ad.winner && "is-winner", ad.hidden && "is-hidden"], dataset: { id: ad.id } });
    const starBtn = h("button", { class: "iconbtn", type: "button" });
    const hideBtn = h("button", { class: "iconbtn", type: "button" });
    const paint = () => {
      starBtn.className = `iconbtn${ad.starred ? " on" : ""}`;
      starBtn.replaceChildren(icon(ad.starred ? "starFill" : "star"));
      starBtn.title = ad.starred ? "Unstar" : "Star";
      starBtn.setAttribute("aria-label", starBtn.title);
      starBtn.setAttribute("aria-pressed", String(!!ad.starred));
      hideBtn.className = `iconbtn${ad.hidden ? " on-hide" : ""}`;
      hideBtn.replaceChildren(icon(ad.hidden ? "eye" : "eyeOff"));
      hideBtn.title = ad.hidden ? "Unhide (restore to library)" : "Hide from library";
      hideBtn.setAttribute("aria-label", hideBtn.title);
      card.classList.toggle("is-hidden", !!ad.hidden);
    };
    paint();
    ctx.registry?.set(ad.id, { ad, paint, card });
    starBtn.addEventListener("click", async () => {
      starBtn.disabled = true;
      try {
        await setFlag(ad, "star", !ad.starred);
        paint();
        toast(ad.starred ? "Starred" : "Unstarred", { kind: "ok", timeout: 1500 });
      } catch (e) {
        toast(`Could not star: ${e.message}`, { kind: "error" });
      } finally {
        starBtn.disabled = false;
      }
    });
    hideBtn.addEventListener("click", async () => {
      hideBtn.disabled = true;
      try {
        await setFlag(ad, "hide", !ad.hidden);
        paint();
        if (!!ad.hidden !== !!ctx.showHidden) {
          const restore = removeCard(card);
          toast(ad.hidden ? "Ad hidden from the library" : "Ad restored to the library", {
            kind: "ok",
            action: {
              label: "Undo",
              fn: async () => {
                try {
                  await setFlag(ad, "hide", !ad.hidden);
                  paint();
                  restore();
                } catch (e) {
                  toast(`Undo failed: ${e.message}`, { kind: "error" });
                }
              },
            },
          });
        }
      } catch (e) {
        toast(`Could not hide: ${e.message}`, { kind: "error" });
      } finally {
        hideBtn.disabled = false;
      }
    });

    const pageBtn = h("button", { class: "card-page ellipsis", type: "button", title: ad.page_name ? `Only ads from ${ad.page_name}` : "" }, ad.page_name || "Unknown page");
    pageBtn.addEventListener("click", () => ctx.onPage?.(ad.page_id, ad.page_name));
    const lines = firstLines(ad.body || ad.title || "", 2);
    const copy = h("div", { class: ["card-copy", !lines && "empty"], dir: "auto" }, lines || "No copy");
    copy.addEventListener("click", open);

    card.append(
      media,
      h(
        "div",
        { class: "card-body" },
        h("div", { class: "card-top" }, pageBtn, h("div", { class: "card-cc" }, (ad.countries || []).slice(0, 3).map((c) => h("span", { class: "cc" }, c)))),
        copy,
        h(
          "div",
          { class: "card-meta" },
          ad.tier && h("span", { class: `t-${ad.tier}` }, pretty(ad.tier)),
          ad.tier && dotSep(),
          h("span", { class: "num", title: "Days active" }, fmtDays(ad.days_active)),
          ad.dup > 1 && [dotSep(), h("span", { class: "num", title: "Ads sharing this exact creative (being scaled)" }, `dup×${ad.dup}`)],
          ad.is_active === 0 && [dotSep(), h("span", { title: "No longer running" }, "ended")],
          h("div", { class: "card-actions" }, starBtn, hideBtn),
        ),
      ),
    );
    return card;
  }

  // ── Ad detail ────────────────────────────────────────────────────────────────
  const SIGNAL_HELP = {
    longevity: "Days the ad has been running — advertisers kill losers within days",
    impression: "Percentile in an impressions-sorted Ad Library pull",
    duplication: "Ads sharing this exact creative + text (scaled across ad sets)",
    relaunch: "Times the page re-ran the same copy as a new ad",
    page_survival: "Survival percentile among the page's own ads",
    page_scale: "How many active ads the page runs",
    breadth: "Number of placements it runs on",
  };

  async function viewAd({ params: [id], seq }) {
    mountLoading(seq);
    let d;
    try {
      [d] = await Promise.all([api(`/api/ads/${encodeURIComponent(id)}`), loadTaxonomy()]);
    } catch (e) {
      const back = h("div", { class: "crumbs" }, h("a", { href: lastWinnersHash }, icon("arrowLeft", "i-sm"), "Winners"));
      mount(seq, h("section", { class: "view" }, back, e.status === 404 ? stateBox({ title: "Ad not found", text: `There is no ad ${id} in the library.` }) : errorState(e, route)));
      return;
    }
    mount(seq, renderAd(d));
  }

  function renderAd(d) {
    const ad = d.ad;
    const sb = ad.score_breakdown || {};
    const adRef = { id: ad.ad_archive_id, starred: ad.starred, hidden: ad.hidden };
    const starBtn = h("button", { class: "btn btn-sm", type: "button" });
    const hideBtn = h("button", { class: "btn btn-sm", type: "button" });
    const paint = () => {
      starBtn.replaceChildren(icon(adRef.starred ? "starFill" : "star"), adRef.starred ? "Starred" : "Star");
      starBtn.classList.toggle("on", !!adRef.starred);
      starBtn.setAttribute("aria-pressed", String(!!adRef.starred));
      hideBtn.replaceChildren(icon(adRef.hidden ? "eye" : "eyeOff"), adRef.hidden ? "Unhide" : "Hide");
    };
    paint();
    const flag = (kind, btn) => async () => {
      btn.disabled = true;
      try {
        await setFlag(adRef, kind, kind === "star" ? !adRef.starred : !adRef.hidden);
        paint();
        // Keep the cached grid truthful without re-querying it (so its scroll position survives).
        const reg = winners?.registry.get(adRef.id);
        if (reg) {
          reg.ad.starred = adRef.starred;
          reg.ad.hidden = adRef.hidden;
          reg.paint();
          if (kind === "hide") reg.card.hidden = !!adRef.hidden !== !!winners.showHidden;
        }
        toast(kind === "star" ? (adRef.starred ? "Starred" : "Unstarred") : adRef.hidden ? "Hidden from the library" : "Restored to the library", { kind: "ok", timeout: 1800 });
      } catch (e) {
        toast(e.message, { kind: "error" });
      } finally {
        btn.disabled = false;
      }
    };
    starBtn.addEventListener("click", flag("star", starBtn));
    hideBtn.addEventListener("click", flag("hide", hideBtn));

    const pageFilter = () => {
      if (ad.page_id) location.hash = `#/?page=${encodeURIComponent(ad.page_id)}`;
    };
    const head = h(
      "div",
      { class: "detail-head" },
      h(
        "div",
        { class: "detail-title" },
        h("h1", null, h("button", { type: "button", title: "All ads from this page", onclick: pageFilter }, ad.page_name || "Unknown page"), ad.is_active === 1 ? chip("Active", "green") : ad.is_active === 0 ? chip("Ended", "outline") : null, sb.winner && chip("Winner", "gold")),
        h(
          "div",
          { class: "detail-meta" },
          h("span", { class: "row" }, h("span", { class: "mono" }, ad.ad_archive_id), copyBtn(ad.ad_archive_id, "ID")),
          h("span", null, `Started ${fmtDate(ad.start_date)}`),
          h("span", null, `${fmtDays(sb.days_active)} running`),
          ad.countries?.length ? h("span", { class: "row" }, ad.countries.map((c) => h("span", { class: "cc" }, c))) : null,
          ad.platforms?.length ? h("span", null, ad.platforms.map(pretty).join(" · ")) : null,
          d.page?.like_count != null && h("span", null, `${fmtNum(d.page.like_count)} page likes`),
          d.page?.active_ads_seen ? h("span", null, `${fmtNum(d.page.active_ads_seen)} active ads seen for this page`) : null,
        ),
      ),
      h("div", { class: "detail-actions" }, starBtn, hideBtn, h("a", { class: "btn btn-sm btn-primary", href: `#/brief/new?ad=${encodeURIComponent(ad.ad_archive_id)}`, title: "Pick a product + format and get a code to send to Claude for a ready-to-paste video prompt" }, icon("plus", "i-sm"), "Get prompt code"), h("a", { class: "btn btn-sm", href: d.library_url, target: "_blank", rel: "noopener noreferrer" }, "Open in Ad Library", icon("external", "i-sm"))),
    );

    return h(
      "section",
      { class: "view view-ad" },
      h("div", { class: "crumbs" }, h("a", { href: lastWinnersHash }, icon("arrowLeft", "i-sm"), "Winners"), h("span", null, "/"), h("span", { class: "mono" }, ad.ad_archive_id)),
      head,
      h("div", { class: "detail-grid" }, mediaColumn(d), h("div", { class: "stack" }, scorePanel(d), copyPanel(d), sightingsPanel(d))),
      h("div", { class: "stack", style: { marginTop: "12px" } }, dnaPanel(d.dna, ad.ad_archive_id), evidencePanel(d.evidence, ad.ad_archive_id)),
    );
  }

  function mediaColumn(d) {
    const ok = d.media.filter((m) => m.url);
    const previews = new Map();
    for (const m of ok) {
      if (m.role === "video_preview") previews.set(`video:${m.idx}`, m.url);
      if (m.role === "card_preview") previews.set(`card_video:${m.idx}`, m.url);
    }
    const videos = ok.filter((m) => ["video", "card_video", "extra_video"].includes(m.role));
    const images = ok.filter((m) => ["image", "card_image", "extra_image"].includes(m.role));
    const col = h("div", { class: "media-col" });
    for (const v of videos) {
      const vid = h("video", { controls: true, preload: "metadata", playsinline: true, src: v.url, poster: previews.get(`${v.role}:${v.idx}`) || null });
      const cap = [pretty(v.role), String(v.idx + 1), v.duration ? fmtDur(v.duration) : null, aspectOf(v.width, v.height)].filter(Boolean).join(" · ");
      col.append(h("div", { class: "player" }, vid, h("div", { class: "cap" }, h("span", { class: "ovchip glass" }, cap))));
    }
    if (images.length) {
      const single = images.length === 1 && !videos.length;
      const g = h("div", { class: ["gallery", single && "single"] });
      images.forEach((m, i) => {
        const cardMeta = m.role === "card_image" ? (d.ad.cards || [])[m.idx] : null;
        const caption = `${pretty(m.role)} ${m.idx + 1}${m.width ? ` · ${m.width}×${m.height}` : ""}`;
        const th = h("button", { class: "thumb", type: "button", title: `Enlarge — ${caption}` }, h("img", { src: m.url, alt: caption, loading: "lazy" }), images.length > 1 && h("span", { class: "ix ovchip glass" }, String(i + 1)));
        th.addEventListener("click", () => lightbox(m.url, caption));
        g.append(h("figure", null, th, cardMeta?.title && h("figcaption", { class: "bidi ellipsis", dir: "auto" }, cardMeta.title)));
      });
      col.append(g);
    }
    const missing = d.media.filter((m) => !m.url && !["video_preview", "card_preview"].includes(m.role));
    if (!ok.length || missing.length) {
      const counts = {};
      for (const m of missing) counts[m.status] = (counts[m.status] || 0) + 1;
      const what = Object.entries(counts).map(([s, n]) => `${n} ${s}`).join(", ");
      col.append(
        h(
          "div",
          { class: "note info" },
          icon("info"),
          h(
            "div",
            { style: { minWidth: "0", flex: "1" } },
            missing.length ? `${plural(missing.length, "media file")} not cached (${what}). Ad Library media URLs expire after ~4–5 days, so fetch soon:` : "No media recorded for this ad.",
            missing.length ? h("div", { style: { marginTop: "7px" } }, cmdBlock(`node cli.mjs spy media --ids ${d.ad.ad_archive_id}`)) : null,
          ),
        ),
      );
    }
    return col;
  }

  function scorePanel(d) {
    const sb = d.ad.score_breakdown || {};
    const sub = sb.sub || {};
    const w = d.weights || {};
    const keys = [...new Set([...Object.keys(w), ...Object.keys(sub)])];
    const avail = keys.filter((k) => isNum(sub[k]));
    const den = avail.reduce((s, k) => s + (w[k] || 0), 0) || 1;
    const rows = keys.map((k) => {
      const v = sub[k];
      const na = !isNum(v);
      const contrib = na ? null : ((w[k] || 0) * Number(v)) / den;
      return h(
        "tr",
        null,
        h("td", { title: SIGNAL_HELP[k] || "" }, pretty(k)),
        h("td", { class: "num mono" }, isNum(w[k]) ? Number(w[k]).toFixed(2) : "–"),
        h(
          "td",
          { style: { width: "46%" } },
          na
            ? h("span", { class: "faint" }, "no data — weight renormalised")
            : h("div", { class: "row" }, h("div", { class: "bar", style: { flex: "1" } }, h("i", { style: { width: `${clamp(Number(v), 0, 100)}%` } })), h("span", { class: "mono num", style: { width: "40px", textAlign: "end" } }, Number(v).toFixed(1))),
        ),
        h("td", { class: "num mono" }, contrib === null ? "–" : contrib.toFixed(1)),
      );
    });
    const rel = sb.relevance_detail || {};
    const head = new Set(rel.positive_head || []);
    const terms = h(
      "div",
      { class: "terms" },
      h("div", { class: "row" }, h("span", { class: "lbl" }, "Niche terms"), h("div", { class: "chips" }, (rel.positive || []).length ? rel.positive.map((t) => chip(t, head.has(t) ? "green" : "", head.has(t) ? "Found in the head of the copy" : "Found in the tail")) : h("span", { class: "faint" }, "none"))),
      (rel.cod || []).length ? h("div", { class: "row" }, h("span", { class: "lbl" }, "COD terms"), h("div", { class: "chips" }, rel.cod.map((t) => chip(t, "blue")))) : null,
      (rel.negative || []).length ? h("div", { class: "row" }, h("span", { class: "lbl" }, "Negative"), h("div", { class: "chips" }, rel.negative.map((t) => chip(t, "red")))) : null,
      h("div", { class: "row" }, h("span", { class: "lbl" }, "Relevance"), h("span", { class: "mono" }, isNum(d.ad.relevance) ? Number(d.ad.relevance).toFixed(2) : "–"), rel.fashion_category ? chip("fashion page category", "outline") : null),
    );
    const body = [
      h(
        "div",
        { class: "score-hero" },
        h("div", { class: ["score-big", sb.winner && "win"], title: "Winner score 0–100" }, fmtScore(d.ad.score)),
        h(
          "div",
          { class: "score-facts" },
          sb.winner ? chip("Winner", "gold lg") : chip("Not a winner yet", "outline lg"),
          sb.tier && chip(pretty(sb.tier), "lg"),
          chip(`${fmtDays(sb.days_active)} active`, "lg"),
          chip(`dup×${d.ad.collation_count ?? 1}`, "lg", "Ads sharing this exact creative"),
          isNum(d.ad.relaunch_count) && d.ad.relaunch_count > 0 && chip(`${d.ad.relaunch_count}× relaunched`, "lg"),
          sb.format && chip(pretty(sb.format), "lg"),
          (sb.factors || []).map((x) => chip(x.replace("_x", " ×"), "amber lg", "Score multiplier")),
        ),
      ),
      h("table", { class: "tbl", style: { marginTop: "12px" } }, h("thead", null, h("tr", null, h("th", null, "Signal"), h("th", { class: "num" }, "Weight"), h("th", null, "Sub-score"), h("th", { class: "num" }, "Points"))), h("tbody", null, rows)),
      terms,
    ];
    return panel("Winner score", `${fmtScore1(d.ad.score)} / 100`, body);
  }

  function copyPanel(d) {
    const ad = d.ad;
    const link = safeHref(ad.link_url);
    const cards = (ad.cards || []).filter((c) => (c.title && c.title.trim()) || (c.body && c.body.trim()));
    const extra = d.extra?.extra_texts || [];
    const body = [
      ad.title && h("div", { class: "copy-title bidi", dir: "auto" }, ad.title),
      ad.body ? h("div", { class: "copy-body copytext", dir: "auto" }, ad.body) : h("p", { class: "faint" }, "No primary text."),
      ad.link_description && h("div", { class: "muted bidi", dir: "auto", style: { marginTop: "8px" } }, ad.link_description),
      h(
        "div",
        { class: "cta-row" },
        ad.cta_type && chip(ad.cta_type, "paper mono"),
        ad.cta_text && h("span", { class: "muted" }, ad.cta_text),
        link ? h("a", { class: "link mono", href: link, target: "_blank", rel: "noopener noreferrer", title: link }, ad.link_url) : ad.link_domain && h("span", { class: "mono muted" }, ad.link_domain),
        ad.lang && chip(`lang: ${ad.lang}`, "outline"),
      ),
      cards.length > 1 &&
        h(
          "div",
          { class: "cards-copy" },
          h("div", { class: "section-title", style: { marginTop: "4px" } }, `Cards (${cards.length})`),
          cards.map((c) => h("div", { class: "card-line" }, h("span", { class: "cc" }, String((c.i ?? 0) + 1)), h("span", { class: "bidi", dir: "auto" }, [c.title, c.body && c.body.trim()].filter(Boolean).join(" — ")))),
        ),
      extra.length > 0 && h("details", { class: "fold" }, h("summary", null, `Dynamic-creative text variants (${extra.length})`), h("div", { class: "fold-body stack" }, extra.map((t) => h("div", { class: "copytext muted", dir: "auto" }, t)))),
    ];
    return panel("Copy", null, body);
  }

  function sightingsPanel(d) {
    const s = d.sightings || [];
    if (!s.length) return panel("Seen in", null, h("p", { class: "faint" }, "No crawl sightings recorded."));
    return panel(
      "Seen in",
      `${plural(s.length, "crawl sighting")} · rank = position in an impressions-sorted pull`,
      h(
        "table",
        { class: "tbl" },
        h("thead", null, h("tr", null, h("th", null, "Query / page"), h("th", null, "Country"), h("th", { class: "num" }, "Rank"), h("th", null, "Sort"), h("th", null, "Seen"))),
        h(
          "tbody",
          null,
          s.map((x) =>
            h(
              "tr",
              null,
              h("td", { class: "bidi", dir: "auto" }, x.q || (x.page_id ? `page ${x.page_id}` : "–")),
              h("td", null, x.country ? h("span", { class: "cc" }, x.country) : "–"),
              h("td", { class: "num mono" }, isNum(x.rank) ? `#${x.rank}${isNum(x.n) ? ` / ${x.n}` : ""}` : "–"),
              h("td", { class: "muted" }, x.sort || "–"),
              h("td", { class: "muted nowrap" }, fmtRel(x.seen_at)),
            ),
          ),
        ),
      ),
    );
  }

  // DNA ------------------------------------------------------------------------
  function feasDots(n) {
    const v = clamp(Math.round(Number(n) || 0), 0, 5);
    return h("span", { class: "feas", title: `Replication feasibility ${v}/5` }, Array.from({ length: 5 }, (_, i) => h("i", { class: i < v ? "on" : "" })));
  }
  function timelineBar(beats, { durKey = null } = {}) {
    const segs = beats.map((b) => {
      const len = durKey ? Number(b[durKey]) || 0 : Math.max(0, (Number(b.t1) || 0) - (Number(b.t0) || 0));
      return { b, len };
    });
    const total = segs.reduce((s, x) => s + x.len, 0);
    const equal = !(total > 0);
    const bar = h(
      "div",
      { class: "timeline", role: "img", "aria-label": "Beat timeline" },
      segs.map(({ b, len }) =>
        h(
          "div",
          { class: "seg-b", style: { "--c": roleColor(b.role), flex: equal ? "1 1 0" : `${Math.max(len, total * 0.025)} 1 0` }, title: `${pretty(b.role)}${durKey ? (b[durKey] ? ` · ${b[durKey]} s` : "") : ` · ${b.t0}–${b.t1} s`}${b.shot ? ` · ${pretty(b.shot)}` : ""}` },
          h("span", null, pretty(b.role)),
        ),
      ),
    );
    const ticks = !equal ? h("div", { class: "ticks" }, h("span", null, "0 s"), h("span", null, `${(Math.round(total * 10) / 10).toString()} s`)) : null;
    return h("div", null, bar, ticks);
  }
  const roleTag = (r) => h("span", { class: "role", style: { "--c": roleColor(r) } }, pretty(r));

  function dnaPanel(dna, adId) {
    if (!dna) {
      return panel(
        "Creative DNA",
        "not analysed yet",
        stateBox({
          compact: true,
          iconName: "layers",
          title: "No DNA for this ad yet",
          text: "Build the evidence pack, then have Claude read it and write the DNA JSON (schemas/creative-dna.schema.json).",
          extra: h("div", { class: "stack", style: { width: "min(620px, 100%)", textAlign: "start" } }, cmdBlock(`node cli.mjs analyze evidence --ids ${adId}`), cmdBlock(`node cli.mjs dna template --id ${adId}`), cmdBlock("node cli.mjs dna set --file <dna.json>")),
        }),
      );
    }
    const hook = dna.hook || {};
    const offer = dna.offer || {};
    const to = dna.text_overlay || {};
    const prod = dna.production || {};
    const cta = dna.cta || {};
    const cp = dna.copy || {};
    const rep = dna.replication || {};
    const beats = Array.isArray(dna.beats) ? dna.beats : [];
    const meta = dna._meta || {};

    const headChips = h(
      "div",
      { class: "dna-head" },
      chip(tLabel("archetypes", dna.archetype), "paper", tDesc("archetypes", dna.archetype)),
      (dna.secondary_archetypes || []).map((a) => chip(tLabel("archetypes", a), "outline", tDesc("archetypes", a))),
      chip(`angle: ${pretty(dna.angle)}`, "blue"),
      (dna.secondary_angles || []).map((a) => chip(pretty(a), "outline")),
      chip(pretty(dna.awareness), "violet", "Awareness stage"),
      chip(pretty(dna.format)),
      chip(dna.aspect),
      isNum(dna.duration_s) && chip(`${Number(dna.duration_s).toFixed(1)} s`),
      chip(dna.language, "outline"),
      h("span", { class: "spacer" }),
      h("span", { class: "muted row" }, "feasibility", feasDots(rep.feasibility)),
      isNum(dna.confidence) && chip(`confidence ${Math.round(Number(dna.confidence) * 100)}%`, Number(dna.confidence) >= 0.7 ? "green" : "amber"),
    );

    const hookBlock = h(
      "div",
      null,
      h("div", { class: "section-title" }, "Hook"),
      h("div", { class: "chips", style: { marginBottom: "8px" } }, chip(pretty(hook.type), "amber", tDesc("hook_types", hook.type)), isNum(hook.seconds) && chip(`${hook.seconds} s`)),
      kv([
        ["First frame", hook.first_frame],
        ["On-screen", hook.text ? h("div", { class: "quote bidi", dir: "auto" }, hook.text) : null],
        ["Spoken", hook.spoken ? h("div", { class: "quote bidi", dir: "auto" }, hook.spoken) : null],
        ["Why it works", hook.why],
      ]),
    );
    const offerBlock = h(
      "div",
      null,
      h("div", { class: "section-title" }, "Offer"),
      h(
        "div",
        { class: "chips", style: { marginBottom: "8px" } },
        [["price_shown", "Price"], ["strike_price", "Strike price"], ["bundle", "Bundle"], ["gift", "Gift"], ["cod", "COD"], ["free_delivery", "Free delivery"]].map(([k, l]) =>
          h("span", { class: `chip ${offer[k] ? "green" : "outline"}` }, icon(offer[k] ? "check" : "x", "i-sm"), l),
        ),
      ),
      kv([
        ["Price text", offer.price_text ? h("span", { class: "bidi", dir: "auto" }, offer.price_text) : null],
        ["Bundle", offer.bundle_desc ? h("span", { class: "bidi", dir: "auto" }, offer.bundle_desc) : null],
        ["Delivery", offer.delivery_scope],
        ["Urgency", offer.urgency ? h("span", { class: "bidi", dir: "auto" }, offer.urgency) : null],
        ["Offer first seen", isNum(offer.first_seen_s) ? `${offer.first_seen_s} s` : null],
      ]),
    );

    const beatsTable = h(
      "table",
      { class: "tbl", style: { marginTop: "10px" } },
      h("thead", null, h("tr", null, h("th", null, "Role"), h("th", null, "Time"), h("th", null, "Shot"), h("th", null, "Visual"), h("th", null, "Camera / in"), h("th", null, "Overlay"), h("th", null, "Audio"))),
      h(
        "tbody",
        null,
        beats.map((b) =>
          h(
            "tr",
            null,
            h("td", null, roleTag(b.role)),
            h("td", { class: "mono nowrap" }, `${b.t0}–${b.t1} s`),
            h("td", { title: tDesc("shot_types", b.shot) }, pretty(b.shot)),
            h("td", null, b.visual),
            h("td", { class: "muted" }, [b.camera && pretty(b.camera), b.transition_in && b.transition_in !== "none" && `in: ${pretty(b.transition_in)}`].filter(Boolean).join(" · ") || "–"),
            h("td", null, b.text_overlay ? h("div", null, h("div", { class: "bidi", dir: "auto" }, b.text_overlay), b.overlay_style && h("span", { class: "faint" }, pretty(b.overlay_style))) : h("span", { class: "faint" }, "–")),
            h("td", { class: "muted bidi", dir: "auto" }, b.audio || "–"),
          ),
        ),
      ),
    );

    const overlayBlock = h(
      "div",
      null,
      h("div", { class: "section-title" }, "Text overlay"),
      kv([
        ["Density", pretty(to.density)],
        ["Language", to.language],
        ["Positions", (to.positions || []).map(pretty).join(", ")],
        ["Styles", (to.styles || []).map(pretty).join(", ")],
        ["Font feel", to.font_feel],
        ["Price rail", isNum(to.persistent_rail) || typeof to.persistent_rail === "boolean" ? yesNo(to.persistent_rail) : null],
      ]),
    );
    const prodBlock = h(
      "div",
      null,
      h("div", { class: "section-title" }, "Production"),
      kv([
        ["Style", pretty(prod.style)],
        ["Talent", pretty(prod.talent)],
        ["Setting", prod.setting],
        ["Lighting", prod.lighting],
        ["Palette", (prod.palette || []).length ? h("div", { class: "swatches" }, prod.palette.map((c) => h("span", { class: "swatch", title: c, style: { background: c } }))) : null],
        ["Pace", [pretty(prod.pace), isNum(prod.cuts_per_10s) ? `${prod.cuts_per_10s} cuts / 10 s` : null].filter(Boolean).join(" · ")],
        ["Transitions", (prod.transitions || []).map(pretty).join(", ")],
        ["Music", pretty(prod.music)],
        ["Voiceover", pretty(prod.voiceover)],
        ["SFX", typeof prod.sfx === "boolean" ? yesNo(prod.sfx) : null],
        ["AI signs", prod.ai_generated_signs],
      ]),
    );
    const ctaBlock = h(
      "div",
      null,
      h("div", { class: "section-title" }, "CTA & copy"),
      kv([
        ["Button", cta.button && chip(cta.button, "paper mono")],
        ["On screen", cta.on_screen ? h("span", { class: "bidi", dir: "auto" }, cta.on_screen) : null],
        ["In copy", cta.in_copy ? h("span", { class: "bidi", dir: "auto" }, cta.in_copy) : null],
        ["Destination", pretty(cta.destination)],
        ["Framework", pretty(cp.framework)],
        ["Length", pretty(cp.length)],
        ["Emoji", pretty(cp.emoji_density)],
        ["Structure", cp.structure],
        ["Key phrases", (cp.key_phrases || []).length ? h("div", { class: "chips" }, cp.key_phrases.map((k) => h("span", { class: "chip bidi", dir: "auto" }, k))) : null],
      ]),
    );
    const repBlock = h(
      "div",
      { class: "grid-2" },
      h(
        "div",
        null,
        h("div", { class: "section-title" }, "What to copy"),
        (rep.what_to_copy || []).length ? h("ul", { class: "listy good" }, rep.what_to_copy.map((x) => h("li", null, x))) : h("p", { class: "faint" }, "–"),
        h("div", { class: "section-title", style: { marginTop: "12px" } }, "Needs"),
        (rep.needs || []).length ? h("div", { class: "chips" }, rep.needs.map((x) => chip(x, "outline"))) : h("p", { class: "faint" }, "–"),
      ),
      h(
        "div",
        null,
        h("div", { class: "section-title" }, "What to avoid"),
        (rep.what_to_avoid || []).length ? h("ul", { class: "listy bad" }, rep.what_to_avoid.map((x) => h("li", null, x))) : h("p", { class: "faint" }, "–"),
        h("div", { class: "section-title", style: { marginTop: "12px" } }, "Risks"),
        (rep.risks || []).length ? h("ul", { class: "listy bad" }, rep.risks.map((x) => h("li", null, x))) : h("p", { class: "faint" }, "–"),
        (rep.ip_flags || []).length ? h("div", { class: "note", style: { marginTop: "10px" } }, icon("alert"), h("div", null, h("b", null, "IP flags — never replicate: "), rep.ip_flags.join(" · "))) : null,
      ),
    );

    const body = h(
      "div",
      { class: "stack" },
      headChips,
      dna.persona && h("p", { class: "muted" }, h("b", { style: { color: "var(--text-2)" } }, "Persona: "), dna.persona),
      h("div", { class: "grid-2" }, hookBlock, offerBlock),
      beats.length ? h("div", null, h("div", { class: "section-title" }, `Beats (${beats.length})`), timelineBar(beats), beatsTable) : null,
      h("div", { class: "grid-3" }, overlayBlock, prodBlock, ctaBlock),
      repBlock,
      dna.notes && h("div", { class: "note info" }, icon("info"), h("div", { class: "copytext" }, dna.notes)),
    );
    const hint = [meta.analyst && `by ${meta.analyst}`, meta.version && `v${meta.version}`, meta.updated_at && fmtRel(meta.updated_at)].filter(Boolean).join(" · ");
    return panel("Creative DNA", hint, body);
  }

  // Evidence -------------------------------------------------------------------
  function evImg(url, caption) {
    const b = h("button", { class: "ev-img", type: "button", title: `Enlarge — ${caption}`, style: { padding: "0", width: "100%" } }, h("img", { src: url, alt: caption, loading: "lazy" }));
    b.addEventListener("click", () => lightbox(url, caption));
    return b;
  }
  function evidencePanel(ev, adId) {
    if (!ev) {
      return panel(
        "Evidence pack",
        "not built",
        stateBox({
          compact: true,
          iconName: "film",
          title: "No evidence pack yet",
          text: "Contact sheet, 0–3 s hook strip, keyframes, palette and an ASR lead — what Claude reads to write the DNA.",
          extra: h("div", { style: { width: "min(560px, 100%)", textAlign: "start" } }, cmdBlock(`node cli.mjs analyze evidence --ids ${adId}`)),
        }),
      );
    }
    const blocks = [];
    for (const it of ev.items || []) {
      if (it.kind === "video") {
        const prefix = `${it.role}-${it.idx}/`;
        const audio = (ev.files || []).filter((f) => f.name.startsWith(prefix) && /\.(wave|spectrogram)\.png$/i.test(f.name));
        const facts = [isNum(it.duration) && `${Number(it.duration).toFixed(1)} s`, it.aspect, isNum(it.shots) && `${it.shots} shots`, isNum(it.lufs) && `${it.lufs} LUFS`, it.has_audio === false && "no audio"].filter(Boolean).join(" · ");
        blocks.push(
          h(
            "div",
            { class: "ev-block stack" },
            h("div", { class: "row" }, h("h3", { style: { fontSize: "13px" } }, `Video ${it.idx + 1}`), h("span", { class: "muted" }, facts)),
            it.vkit_ok === false && h("div", { class: "note" }, icon("alert"), h("div", null, "vkit reported an error: ", h("span", { class: "mono" }, String(it.vkit_error || "").slice(0, 300)))),
            h(
              "div",
              { class: "grid-2" },
              it.sheet ? h("div", null, h("div", { class: "section-title" }, "Contact sheet"), evImg(it.sheet, "Contact sheet")) : null,
              it.hook_strip ? h("div", null, h("div", { class: "section-title" }, "Hook strip 0–3 s · 4 fps (cell i → t = i × 0.25 s)"), evImg(it.hook_strip, "Hook strip 0–3 s")) : null,
            ),
            (it.keyframes || []).length ? h("div", null, h("div", { class: "section-title" }, `Keyframes (${it.keyframes.length})`), h("div", { class: "kf-row" }, it.keyframes.map((k) => evImg(k.url, k.name)))) : null,
            audio.length ? h("div", null, h("div", { class: "section-title" }, "Audio"), h("div", { class: "grid-2" }, audio.map((a) => evImg(a.url, a.name)))) : null,
            h(
              "div",
              null,
              h("div", { class: "section-title" }, `ASR lead${it.transcript_model ? ` · ${it.transcript_model}` : ""}`),
              (it.transcript || []).length
                ? [
                    h("div", { class: "note", style: { marginBottom: "8px" } }, icon("alert"), "A lead, not a quote — whisper hallucinates on music (poetry or «اشتركوا في القناة» means music, not speech)."),
                    h("div", { class: "transcript" }, it.transcript.map((t) => h("div", { class: "row", style: { alignItems: "flex-start" } }, h("span", { class: "t" }, `${Number(t.t).toFixed(1)}s`), h("span", { class: "bidi", dir: "auto" }, t.text)))),
                  ]
                : h("p", { class: "faint" }, it.has_audio === false ? "No audio track." : "No speech detected."),
            ),
          ),
        );
      } else {
        blocks.push(
          h(
            "div",
            { class: "ev-block stack" },
            h("div", { class: "row" }, h("h3", { style: { fontSize: "13px" } }, it.kind === "carousel" ? "Carousel cards" : "Images"), h("span", { class: "muted" }, plural((it.images || []).length, "image"))),
            it.montage && h("div", null, h("div", { class: "section-title" }, "Montage"), evImg(it.montage, "Cards montage")),
            h(
              "table",
              { class: "tbl" },
              h("thead", null, h("tr", null, h("th", null, "Image"), h("th", null, "Aspect"), h("th", null, "Palette"))),
              h(
                "tbody",
                null,
                (it.images || []).map((im) =>
                  h(
                    "tr",
                    null,
                    h("td", { class: "mono" }, `${pretty(im.role)} ${im.idx + 1}`),
                    h("td", { class: "muted" }, im.aspect || (im.w ? `${im.w}×${im.h}` : "–")),
                    h("td", null, h("div", { class: "swatches" }, (im.palette || []).map((c) => h("span", { class: "swatch", title: c, style: { background: c } })))),
                  ),
                ),
              ),
            ),
          ),
        );
      }
    }
    if (!blocks.length) {
      blocks.push(
        (ev.files || []).length
          ? h("div", { class: "kf-row" }, ev.files.slice(0, 40).map((f) => evImg(f.url, f.name)))
          : stateBox({ compact: true, title: "Evidence folder is empty", text: "The pack may still be building.", extra: cmdBlock(`node cli.mjs analyze evidence --ids ${adId} --force`) }),
      );
    }
    const actions = ev.markdown ? h("a", { class: "btn btn-xs", href: ev.markdown, target: "_blank", rel: "noopener" }, "EVIDENCE.md", icon("external", "i-sm")) : null;
    return panel("Evidence pack", ev.built_at ? `built ${fmtRel(ev.built_at)}` : null, blocks, { actions });
  }

  // ── Styles ───────────────────────────────────────────────────────────────────
  function miniTimeline(beats) {
    const list = Array.isArray(beats) ? beats : [];
    if (!list.length) return null;
    const anyDur = list.some((b) => Number(b.dur) > 0);
    return h("div", { class: "mini-tl", title: list.map((b) => pretty(b.role)).join(" → ") }, list.map((b) => h("i", { style: { "--c": roleColor(b.role), flex: anyDur ? `${Number(b.dur) || 0.5} 1 0` : "1 1 0" } })));
  }
  function refThumbs(refs, max = 5) {
    const withAd = (refs || []).filter((r) => r.ad);
    if (!withAd.length) return null;
    return h(
      "div",
      { class: "ref-thumbs" },
      withAd.slice(0, max).map((r) => h("div", { class: "rt", title: `${r.ad.page_name || ""} · ${r.id}` }, r.ad.thumb ? h("img", { src: r.ad.thumb, alt: "", loading: "lazy" }) : null)),
    );
  }
  function styleCard(s) {
    const open = () => {
      location.hash = `#/style/${encodeURIComponent(s.id)}`;
    };
    const card = h(
      "article",
      { class: "panel style-card", role: "link", tabindex: "0", "aria-label": `Open style ${s.name}` },
      h("div", { class: "row" }, h("h3", { class: "ellipsis", style: { flex: "1" } }, s.name || s.id), statusSt(s.status || "draft")),
      h("div", { class: "chips" }, chip(pretty(s.format), "paper"), (s.aspects || []).map((a) => chip(a, "outline mono")), chip(tLabel("archetypes", s.archetype), "", tDesc("archetypes", s.archetype)), chip(pretty(s.hook_type), "amber", tDesc("hook_types", s.hook_type)), chip(pretty(s.angle), "blue")),
      s.summary && h("p", { class: "summary" }, s.summary),
      miniTimeline(s.beats),
      h(
        "div",
        { class: "row" },
        refThumbs(s.refs),
        h("span", { class: "spacer" }),
        h("span", { class: "muted", style: { fontSize: "11.5px" } }, [plural((s.beats || []).length, "beat"), isNum(s.duration_s) && s.duration_s ? `${s.duration_s} s` : null, plural((s.refs || []).length, "ref")].filter(Boolean).join(" · ")),
      ),
    );
    card.addEventListener("click", open);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter") open();
    });
    return card;
  }

  async function viewStyles({ seq }) {
    mountLoading(seq);
    let list;
    try {
      [list] = await Promise.all([api("/api/styles"), loadTaxonomy()]);
    } catch (e) {
      mount(seq, pageView("Styles", "Reusable, product-agnostic recipes distilled from winning ads", e.status === 503 ? notReady("styles", e, route) : errorState(e, route)));
      return;
    }
    const body = list.length
      ? h("div", { class: "style-grid" }, list.map(styleCard))
      : stateBox({
          iconName: "layers",
          title: "No styles yet",
          text: "A style is a reusable recipe (beats, shots, overlays, copy pattern) distilled from one or more analysed winners. Analyse a few winners (evidence → DNA), then save a style card that validates against schemas/style.schema.json.",
          extra: h("a", { class: "btn btn-sm", href: "#/?winner=1&media=1" }, "Browse winners with media"),
        });
    mount(seq, pageView("Styles", `${plural(list.length, "style")} · reusable, product-agnostic recipes distilled from winning ads`, body));
  }

  async function viewStyle({ params: [id], seq }) {
    mountLoading(seq);
    let s;
    try {
      [s] = await Promise.all([api(`/api/styles/${encodeURIComponent(id)}`), loadTaxonomy()]);
    } catch (e) {
      const crumbs = h("div", { class: "crumbs" }, h("a", { href: "#/styles" }, icon("arrowLeft", "i-sm"), "Styles"));
      mount(seq, h("section", { class: "view" }, crumbs, e.status === 503 ? notReady("styles", e, route) : e.status === 404 ? stateBox({ title: "Style not found", text: `No style “${id}”.` }) : errorState(e, route)));
      return;
    }
    mount(seq, renderStyle(s));
  }

  function renderStyle(s) {
    const beats = Array.isArray(s.beats) ? s.beats : [];
    const copy = s.copy || {};
    const audio = s.audio || {};
    const fit = s.fit || {};
    const rail = s.rail || {};
    const end = s.end_card || {};
    const meta = s._meta || {};
    const overlayList = (ovs) =>
      (ovs || []).length
        ? h(
            "div",
            { class: "overlay-list" },
            ovs.map((o) => h("div", { class: "ovl" }, chip(pretty(o.kind), "outline"), h("span", { class: "mono" }, `{${o.slot}}`), o.position && h("span", { class: "muted" }, pretty(o.position)), isNum(o.at) && h("span", { class: "faint" }, `@${o.at}s`), o.emphasis && o.emphasis !== "normal" && chip(o.emphasis, "amber"))),
          )
        : h("span", { class: "faint" }, "–");
    const beatRows = beats.map((b, i) => {
      const rung = b.rung || rungOf(b.strategy);
      return h(
        "tr",
        null,
        h("td", { class: "mono faint" }, String(i + 1)),
        h("td", null, roleTag(b.role), h("div", { class: "mono faint", style: { fontSize: "10.5px", marginTop: "3px" } }, b.id)),
        h("td", { class: "mono nowrap" }, isNum(b.dur) ? `${b.dur} s` : "–"),
        h("td", { title: tDesc("shot_types", b.shot) }, pretty(b.shot)),
        h("td", null, h("div", { class: "chips" }, rung && chip(rung, `mono ${RUNG_CLASS[rung] || ""}`, rungDesc(rung))), h("div", { style: { marginTop: "4px" }, title: tDesc("generation_strategies", b.strategy) }, pretty(b.strategy)), (b.model_pref || []).length ? h("div", { class: "faint mono", style: { fontSize: "10.5px", marginTop: "3px" } }, b.model_pref.join(", ")) : null),
        h("td", { class: "muted" }, [b.camera && pretty(b.camera), b.transition_in && b.transition_in !== "none" && `in: ${pretty(b.transition_in)}`, b.talent && b.talent !== "none" && `talent: ${pretty(b.talent)}`].filter(Boolean).join(" · ") || "–"),
        h(
          "td",
          null,
          h(
            "div",
            { class: "beat-desc" },
            b.scene && h("div", null, h("b", null, "Scene"), b.scene),
            b.composition && h("div", null, h("b", null, "Comp"), b.composition),
            b.motion && h("div", null, h("b", null, "Motion"), b.motion),
            (b.ref_roles || []).length ? h("div", null, h("b", null, "Refs"), b.ref_roles.join(", ")) : null,
            b.from_beat && h("div", null, h("b", null, "From"), `beat ${b.from_beat}`),
            b._from_style && h("div", null, h("b", null, "Style"), b._from_style),
          ),
        ),
        h("td", null, overlayList(b.overlays)),
      );
    });
    const refCards = (s.refs || []).map((r) => {
      const a = r.ad;
      const inner = h(
        "div",
        { class: "panel", style: { overflow: "hidden" } },
        h("div", { class: "media", style: a?.thumb ? { "--bg-img": `url("${a.thumb}")` } : null }, a?.thumb ? h("img", { src: a.thumb, alt: "", loading: "lazy" }) : h("div", { class: "ph" }, icon("image"), r.kind === "adlib" ? "Not in library" : pretty(r.kind)), a && h("div", { class: "ov tl" }, h("span", { class: ["score glass", a.winner && "win"] }, a.winner && icon("trophy"), fmtScore(a.score)))),
        h(
          "div",
          { class: "card-body" },
          h("div", { class: "card-page ellipsis" }, a?.page_name || r.id),
          r.note && h("div", { class: "muted", style: { fontSize: "11.5px" } }, r.note),
          (r.take || []).length ? h("div", { class: "chips" }, r.take.map((t) => chip(t, "outline"))) : null,
          h("div", { class: "mono faint", style: { fontSize: "10.5px" } }, `${r.kind}:${r.id}`),
        ),
      );
      return r.kind === "adlib" ? h("a", { href: `#/ad/${encodeURIComponent(r.id)}`, title: "Open reference ad" }, inner) : inner;
    });
    return h(
      "section",
      { class: "view view-style" },
      h("div", { class: "crumbs" }, h("a", { href: "#/styles" }, icon("arrowLeft", "i-sm"), "Styles"), h("span", null, "/"), h("span", { class: "mono" }, s.id)),
      h(
        "div",
        { class: "detail-head" },
        h(
          "div",
          { class: "detail-title" },
          h("h1", null, s.name || s.id, statusSt(s.status || "draft")),
          h("div", { class: "detail-meta" }, h("span", { class: "row" }, h("span", { class: "mono" }, s.id), copyBtn(s.id, "ID")), meta.updated_at && h("span", null, `updated ${fmtRel(meta.updated_at)}`), s.created_from && h("span", null, `from ${s.created_from}`), (s.blended_from || []).length ? h("span", null, `blend of ${s.blended_from.join(" + ")}`) : null),
        ),
        h("div", { class: "detail-actions" }, h("a", { class: "btn btn-sm", href: `#/brief/new?style=${encodeURIComponent(s.id)}` }, "Get prompt code"), h("a", { class: "btn btn-sm btn-primary", href: `#/batch/new?style=${encodeURIComponent(s.id)}` }, icon("plus", "i-sm"), "Use in a batch")),
      ),
      h(
        "div",
        { class: "stack" },
        panel(
          "Recipe",
          null,
          h(
            "div",
            { class: "grid-2" },
            h(
              "div",
              { class: "stack" },
              s.summary && h("p", null, s.summary),
              s.why_it_wins && h("div", { class: "note info" }, icon("trophy"), h("div", null, h("b", null, "Why it wins: "), s.why_it_wins)),
              kv([
                ["Format", pretty(s.format)],
                ["Aspects", (s.aspects || []).join(" · ")],
                ["Duration", isNum(s.duration_s) ? `${s.duration_s} s` : null],
                ["Archetype", tLabel("archetypes", s.archetype)],
                ["Hook", pretty(s.hook_type)],
                ["Angle", pretty(s.angle)],
                ["Awareness", s.awareness && pretty(s.awareness)],
              ]),
            ),
            h(
              "div",
              { class: "stack" },
              h("div", null, h("div", { class: "section-title" }, "Copy"), kv([["Framework", pretty(copy.framework)], ["Structure", copy.primary_structure], ["Tone", copy.tone]]), (copy.hook_patterns || []).length ? h("div", { class: "stack", style: { gap: "5px", marginTop: "8px" } }, copy.hook_patterns.map((p) => h("div", { class: "quote bidi", dir: "auto" }, p))) : null),
              h("div", null, h("div", { class: "section-title" }, "Audio"), kv([["Music", pretty(audio.music)], ["Voiceover", audio.voiceover && pretty(audio.voiceover)], ["Notes", audio.notes]])),
            ),
          ),
        ),
        panel(
          `Beats (${beats.length})`,
          "strategy → fidelity rung (L0 real photo … L6 blocked)",
          beats.length
            ? [
                timelineBar(beats, { durKey: "dur" }),
                h("div", { style: { overflowX: "auto" } }, h("table", { class: "tbl", style: { marginTop: "10px" } }, h("thead", null, h("tr", null, h("th", null, "#"), h("th", null, "Role"), h("th", null, "Dur"), h("th", null, "Shot"), h("th", null, "Strategy · rung"), h("th", null, "Camera / in / talent"), h("th", null, "Direction"), h("th", null, "Overlays"))), h("tbody", null, beatRows))),
              ]
            : h("p", { class: "faint" }, "No beats."),
        ),
        h(
          "div",
          { class: "grid-3" },
          panel("Price rail", null, kv([["Enabled", yesNo(rail.enabled)], ["From frame 0", typeof rail.from_frame0 === "boolean" ? yesNo(rail.from_frame0) : null], ["Slots", (rail.slots || []).map((x) => `{${x}}`).join("  ")]])),
          panel("End card", null, kv([["Enabled", yesNo(end.enabled)], ["Duration", isNum(end.dur) ? `${end.dur} s` : null], ["Slots", (end.slots || []).map((x) => `{${x}}`).join("  ")]])),
          panel("Fit", null, kv([["Categories", (fit.categories || []).join(", ") || "any"], ["Requires", (fit.requires || []).map(pretty).join(", ") || "nothing special"], ["Notes", fit.notes]])),
        ),
        (s.dos || []).length || (s.donts || []).length
          ? h("div", { class: "grid-2" }, panel("Do", null, (s.dos || []).length ? h("ul", { class: "listy good" }, s.dos.map((x) => h("li", null, x))) : h("p", { class: "faint" }, "–")), panel("Don't", null, (s.donts || []).length ? h("ul", { class: "listy bad" }, s.donts.map((x) => h("li", null, x))) : h("p", { class: "faint" }, "–")))
          : null,
        panel(`Reference ads (${(s.refs || []).length})`, "the winners this recipe was distilled from", refCards.length ? h("div", { class: "ref-cards" }, refCards) : h("p", { class: "faint" }, "No references recorded.")),
        h("details", { class: "fold" }, h("summary", null, "Raw style JSON"), h("div", { class: "fold-body" }, h("pre", { class: "json" }, JSON.stringify(s, (k, v) => (k === "ad" ? undefined : v), 2)))),
      ),
    );
  }

  // ── Products ─────────────────────────────────────────────────────────────────
  const productName = (p) => p.name?.fr || p.name?.ar || p.slug;
  const sortProducts = (list) => [...list].sort((a, b) => (a.sortOrder ?? 1e9) - (b.sortOrder ?? 1e9) || String(a.slug).localeCompare(String(b.slug)));
  function priceRow(p) {
    const off = isNum(p.compareAt) && isNum(p.price) && Number(p.compareAt) > Number(p.price) ? Math.round((1 - Number(p.price) / Number(p.compareAt)) * 100) : null;
    return h("div", { class: "price" }, h("b", null, fmtDA(p.price)), off !== null && h("s", null, fmtDA(p.compareAt)), off !== null && h("span", { class: "off" }, `−${off}%`));
  }

  function refTile(p, r, onUpdate) {
    const tile = h("div", { class: ["ref-tile", r.approved ? "ok" : "no"] });
    const caption = `${p.slug} · ref ${r.idx} · ${r.role || "photo"}${r.w ? ` · ${r.w}×${r.h}` : ""}`;
    const img = h("button", { class: "rimg", type: "button", title: `Enlarge — ${caption}` }, r.src ? h("img", { src: r.src, alt: caption, loading: "lazy" }) : null);
    img.addEventListener("click", () => r.src && lightbox(r.src, caption));
    const tog = h(
      "button",
      { class: "rtog", type: "button", "aria-pressed": String(r.approved), title: r.approved ? "Approved as a generation reference — click to reject" : "Rejected — click to approve as a generation reference" },
      icon(r.approved ? "check" : "x"),
      r.approved ? "Use" : "Off",
    );
    tog.addEventListener("click", async () => {
      tog.disabled = true;
      try {
        const np = await api(`/api/products/${encodeURIComponent(p.slug)}/refs/${r.idx}/approve`, { method: "POST", body: { approved: !r.approved } });
        onUpdate(np);
        toast(`Ref ${r.idx} of ${p.slug} ${!r.approved ? "approved" : "rejected"} for generation`, { kind: "ok", timeout: 2000 });
      } catch (e) {
        toast(`Could not update: ${e.message}`, { kind: "error" });
        tog.disabled = false;
      }
    });
    tile.append(img, tog, h("span", { class: "role-lbl" }, r.role || ""));
    return tile;
  }

  function productCard(p) {
    const el = h("article", { class: ["panel pcard", !p.inStock && "oos"], dataset: { slug: p.slug } });
    const replace = (np) => {
      const fresh = productCard({ ...p, ...np });
      el.replaceWith(fresh);
    };
    const media = h(
      "div",
      { class: "p-media", title: p.thumb ? "Enlarge" : "" },
      p.thumb ? h("img", { src: p.thumb, alt: productName(p), loading: "lazy" }) : h("div", { class: "ph", style: { position: "absolute", inset: "0", display: "grid", placeItems: "center", color: "#777" } }, "No photo"),
      h("div", { class: "ov tl" }, chip(pretty(p.category), "glass")),
      h("div", { class: "ov tr" }, p.inStock ? chip("In stock", "green") : chip("Out of stock", "red")),
      p.badge && (p.badge.ar || p.badge.fr) ? h("div", { class: "ov bl" }, h("span", { class: "chip paper bidi", dir: "auto" }, p.badge.ar || p.badge.fr)) : null,
    );
    media.addEventListener("click", () => p.thumb && lightbox(p.thumb, `${p.slug} · ${productName(p)}`));
    const gift = p.freeGift && (p.freeGift.ar || p.freeGift.fr);
    el.append(
      media,
      h(
        "div",
        { class: "p-body" },
        p.name?.ar && h("div", { class: "p-name-ar ar", dir: "rtl", lang: "ar" }, p.name.ar),
        p.name?.fr && h("div", { class: "p-name-fr", dir: "auto" }, p.name.fr),
        priceRow(p),
        gift && h("div", { class: "gift" }, icon("gift", "i-sm"), h("span", { class: "bidi", dir: "auto" }, gift)),
        (p.colors || []).length ? h("div", { class: "swatches" }, p.colors.map((c) => h("span", { class: "swatch", title: c.name?.fr || c.name?.ar || c.hex || "", style: { background: c.hex || "#555" } }))) : null,
        h(
          "div",
          { class: "refs-strip" },
          (p.refs || []).map((r) => refTile(p, r, replace)),
          !(p.refs || []).length && h("span", { class: "faint" }, "No reference photos"),
        ),
        h(
          "div",
          { class: "row", style: { fontSize: "11px" } },
          h("span", { class: "muted" }, `${p.approved_refs}/${(p.refs || []).length} refs approved`),
          h("span", { class: "spacer" }),
          safeHref(p.url) && h("a", { class: "muted row", href: p.url, target: "_blank", rel: "noopener noreferrer", title: "Open in the store" }, "store", icon("external", "i-sm")),
        ),
      ),
    );
    return el;
  }

  async function viewProducts({ query, seq }) {
    mountLoading(seq);
    let list;
    try {
      list = sortProducts(await api("/api/products"));
    } catch (e) {
      mount(seq, pageView("Products", null, errorState(e, route)));
      return;
    }
    const f = { q: query.get("q") || "", cat: query.get("cat") || "", stock: query.get("stock") || "" };
    const cats = [...new Set(list.map((p) => p.category).filter(Boolean))];
    const search = h("input", { class: "input", type: "search", placeholder: "Search name or slug…", value: f.q, "aria-label": "Search products", "data-search": "1" });
    const catSel = h("select", { class: "select", "aria-label": "Category" }, h("option", { value: "" }, "All categories"), cats.map((c) => h("option", { value: c }, `${pretty(c)} · ${list.filter((p) => p.category === c).length}`)));
    catSel.value = f.cat;
    const stockSel = h("select", { class: "select", "aria-label": "Stock" }, h("option", { value: "" }, "Any stock"), h("option", { value: "in" }, "In stock"), h("option", { value: "out" }, "Out of stock"), h("option", { value: "review" }, "Has rejected refs"));
    stockSel.value = f.stock;
    const grid = h("div", { class: "product-grid" });
    const countEl = h("div", { class: "resultline" });
    const apply = () => {
      f.q = search.value.trim();
      f.cat = catSel.value;
      f.stock = stockSel.value;
      catSel.classList.toggle("set", !!f.cat);
      stockSel.classList.toggle("set", !!f.stock);
      const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
      history.replaceState(null, "", `#/products${qs ? `?${qs}` : ""}`);
      const q = f.q.toLowerCase();
      const shown = list.filter(
        (p) =>
          (!q || [p.slug, p.name?.ar, p.name?.fr].some((x) => String(x || "").toLowerCase().includes(q))) &&
          (!f.cat || p.category === f.cat) &&
          (!f.stock || (f.stock === "in" ? p.inStock : f.stock === "out" ? !p.inStock : (p.refs || []).some((r) => !r.approved))),
      );
      grid.replaceChildren(...(shown.length ? shown.map(productCard) : [stateBox({ title: "No products match", text: "Clear the search or pick another category." })]));
      const refsTotal = list.reduce((s, p) => s + (p.refs || []).length, 0);
      const refsOk = list.reduce((s, p) => s + (p.approved_refs || 0), 0);
      countEl.replaceChildren(h("span", null, h("b", null, fmtNum(shown.length)), ` of ${fmtNum(list.length)} products`), h("span", { class: "spacer" }), h("span", { class: "faint" }, `${fmtNum(refsOk)}/${fmtNum(refsTotal)} reference photos approved for generation · click a photo to enlarge, the toggle to approve/reject`));
    };
    let deb = 0;
    search.addEventListener("input", () => {
      clearTimeout(deb);
      deb = setTimeout(apply, 150);
    });
    catSel.addEventListener("change", apply);
    stockSel.addEventListener("change", apply);
    const bar = h("div", { class: "filterbar" }, h("div", { class: "search" }, icon("search"), search), catSel, stockSel, h("div", { class: "right" }, h("a", { class: "btn btn-sm btn-primary", href: "#/batch/new" }, icon("plus", "i-sm"), "New batch")));
    const synced = list.reduce((m, p) => (p.synced_at && p.synced_at > m ? p.synced_at : m), "");
    const view = h("section", { class: "view" }, bar, h("div", { class: "view-head", style: { marginTop: "0" } }, h("div", null, h("h1", null, "Products"), h("div", { class: "sub" }, `SIRINE store catalogue · synced ${synced ? fmtRel(synced) : "never"} · refresh with `, h("span", { class: "mono" }, "node cli.mjs product sync")))), countEl, grid);
    if (!list.length) grid.replaceChildren(stateBox({ title: "No products synced yet", text: "Pull the SIRINE catalogue (Turso first, public feed as fallback) and cache the photos.", extra: cmdBlock("node cli.mjs product sync") }));
    else apply();
    mount(seq, view);
  }

  // ── New batch ────────────────────────────────────────────────────────────────
  async function viewBatchNew({ query, seq }) {
    mountLoading(seq);
    const [products, stylesRes] = await Promise.all([api("/api/products").catch((e) => e), api("/api/styles").catch((e) => e), loadTaxonomy()]);
    if (products instanceof Error) {
      mount(seq, pageView("New batch", null, errorState(products, route)));
      return;
    }
    const plist = sortProducts(products);
    const styles = Array.isArray(stylesRes) ? stylesRes : [];
    const stylesErr = stylesRes instanceof Error ? stylesRes : null;
    const pre = query.get("style");
    const now = new Date();
    const S = {
      products: new Set(),
      styles: pre && styles.some((s) => s.id === pre) ? [pre] : [],
      placements: new Set(["9:16", "4:5"]),
      mode: "blend",
      name: `Batch ${now.toISOString().slice(0, 10)} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
    };

    // step 1 — products
    const pSearch = h("input", { class: "input", type: "search", placeholder: "Search products…", "aria-label": "Search products", "data-search": "1" });
    const pCat = h("select", { class: "select", "aria-label": "Category" }, h("option", { value: "" }, "All categories"), [...new Set(plist.map((p) => p.category).filter(Boolean))].map((c) => h("option", { value: c }, pretty(c))));
    const pStock = h("label", { class: "check" }, h("input", { type: "checkbox", checked: true }), "In stock only");
    const pGrid = h("div", { class: "pick-grid", role: "group", "aria-label": "Products" });
    const pCount = h("span", { class: "hint" });
    const tiles = new Map();
    for (const p of plist) {
      const t = h(
        "button",
        { class: "pick", type: "button", "aria-pressed": "false", title: p.slug },
        h("span", { class: "pimg" }, p.thumb ? h("img", { src: p.thumb, alt: "", loading: "lazy" }) : null),
        h("span", { class: "pt" }, h("span", { class: "nm", dir: "auto" }, productName(p)), h("span", { class: "sb" }, `${fmtDA(p.price)}${p.freeGift ? " · gift" : ""}${p.inStock ? "" : " · out"}`)),
        h("span", { class: "tick" }, icon("check")),
      );
      t.addEventListener("click", () => {
        if (S.products.has(p.slug)) S.products.delete(p.slug);
        else S.products.add(p.slug);
        paint();
      });
      tiles.set(p.slug, { el: t, p });
      pGrid.append(t);
    }
    const filterProducts = () => {
      const q = pSearch.value.trim().toLowerCase();
      const inStockOnly = pStock.querySelector("input").checked;
      for (const { el, p } of tiles.values()) {
        const vis = (!q || [p.slug, p.name?.ar, p.name?.fr].some((x) => String(x || "").toLowerCase().includes(q))) && (!pCat.value || p.category === pCat.value) && (!inStockOnly || p.inStock);
        el.hidden = !vis;
      }
    };
    pSearch.addEventListener("input", filterProducts);
    pCat.addEventListener("change", filterProducts);
    pStock.querySelector("input").addEventListener("change", filterProducts);
    const selectVisible = h("button", {
      class: "btn btn-ghost btn-xs",
      type: "button",
      onclick: () => {
        for (const { el, p } of tiles.values()) if (!el.hidden) S.products.add(p.slug);
        paint();
      },
    }, "Select visible");
    const clearSel = h("button", {
      class: "btn btn-ghost btn-xs",
      type: "button",
      onclick: () => {
        S.products.clear();
        paint();
      },
    }, "Clear");

    // step 2 — styles
    const sTiles = new Map();
    let stylesBody;
    if (stylesErr) stylesBody = stylesErr.status === 503 ? notReady("styles", stylesErr, route, true) : errorState(stylesErr, route);
    else if (!styles.length) stylesBody = stateBox({ compact: true, iconName: "layers", title: "No styles yet", text: "Distil at least one style from analysed winners before compiling a batch.", extra: h("a", { class: "btn btn-sm", href: "#/styles" }, "Open styles") });
    else {
      stylesBody = h("div", { class: "style-pick-grid", role: "group", "aria-label": "Styles" });
      for (const s of styles) {
        const t = h(
          "button",
          { class: "spick", type: "button", "aria-pressed": "false" },
          h("h4", null, s.name || s.id),
          h("div", { class: "chips" }, chip(pretty(s.format), "outline"), (s.aspects || []).map((a) => chip(a, "outline mono")), chip(pretty(s.hook_type), "amber"), statusSt(s.status || "draft")),
          s.summary && h("p", null, s.summary),
          miniTimeline(s.beats),
        );
        t.addEventListener("click", () => {
          const i = S.styles.indexOf(s.id);
          if (i >= 0) S.styles.splice(i, 1);
          else S.styles.push(s.id);
          paint();
        });
        sTiles.set(s.id, t);
        stylesBody.append(t);
      }
    }

    // step 3 — placements + mode
    const plBtns = ["9:16", "4:5", "1:1"].map((pl) => {
      const b = h("button", { class: "toggle", type: "button", "aria-pressed": String(S.placements.has(pl)) }, pl);
      b.addEventListener("click", () => {
        if (S.placements.has(pl)) S.placements.delete(pl);
        else S.placements.add(pl);
        paint();
      });
      return b;
    });
    const modeBlend = h("button", { type: "button" }, "Blend styles → 1 job per product");
    const modeCross = h("button", { type: "button" }, "Cross → 1 job per product × style");
    modeBlend.addEventListener("click", () => {
      S.mode = "blend";
      paint();
    });
    modeCross.addEventListener("click", () => {
      S.mode = "cross";
      paint();
    });
    const modeSeg = h("div", { class: "seg", role: "group", "aria-label": "Combination mode" }, modeBlend, modeCross);
    const langSel = h("select", { class: "select", "aria-label": "Language of overlays and copy", title: "One language per creative" }, h("option", { value: "ar-DZ" }, "Darija · ar-DZ"), h("option", { value: "fr" }, "Français · fr"), h("option", { value: "ar" }, "Arabic · ar"));
    const draftChk = h("input", { type: "checkbox" });
    const draftLbl = h("label", { class: "check", title: "Cheaper preview models (routing.json draft overrides) for a first look" }, draftChk, "Draft pass");
    const errBox = h("div", { class: "note err-box", hidden: true, role: "alert" });

    // action bar
    const nameIn = h("input", { class: "input", type: "text", value: S.name, maxlength: "80", "aria-label": "Batch name", placeholder: "Batch name" });
    nameIn.addEventListener("input", () => {
      S.name = nameIn.value;
      paint();
    });
    const summary = h("div", { class: "summary" });
    const submit = h("button", { class: "btn btn-primary", type: "button" }, "Compile batch");
    const jobsCount = () => (S.mode === "cross" && S.styles.length > 1 ? S.products.size * S.styles.length : S.products.size);
    const problems = () => {
      const out = [];
      if (!S.products.size) out.push("pick at least one product");
      if (!S.styles.length) out.push(stylesErr ? "styles module not ready" : "pick at least one style");
      if (!S.placements.size) out.push("pick a placement");
      if (!S.name.trim()) out.push("name the batch");
      if (jobsCount() > 60) out.push("max 60 jobs per batch");
      return out;
    };
    const styleName = (id) => styles.find((s) => s.id === id)?.name || id;
    function paint() {
      pCount.textContent = `${S.products.size} selected`;
      for (const [slug, { el }] of tiles) {
        const on = S.products.has(slug);
        el.classList.toggle("sel", on);
        el.setAttribute("aria-pressed", String(on));
      }
      for (const [id, el] of sTiles) {
        const i = S.styles.indexOf(id);
        el.classList.toggle("sel", i >= 0);
        el.setAttribute("aria-pressed", String(i >= 0));
        el.querySelector(".order")?.remove();
        if (i >= 0 && S.styles.length > 1) el.prepend(h("span", { class: "order", title: "Blend order" }, String(i + 1)));
      }
      plBtns.forEach((b) => b.setAttribute("aria-pressed", String(S.placements.has(b.textContent))));
      modeBlend.setAttribute("aria-pressed", String(S.mode === "blend"));
      modeCross.setAttribute("aria-pressed", String(S.mode === "cross"));
      modeSeg.hidden = S.styles.length < 2;
      const pr = problems();
      const nJobs = jobsCount();
      const styleTxt = !S.styles.length ? "no style" : S.styles.length === 1 ? `style “${styleName(S.styles[0])}”` : S.mode === "blend" ? `a blend of ${S.styles.length} styles` : `${S.styles.length} styles (crossed)`;
      summary.replaceChildren(
        h("b", null, plural(S.products.size, "product")),
        ` × ${styleTxt} → `,
        h("b", null, plural(nJobs, "job")),
        ` · ${S.placements.size ? [...S.placements].join(" + ") : "no placement"}`,
        pr.length ? h("span", { style: { color: "var(--amber)", marginLeft: "10px" } }, `— ${pr[0]}`) : h("span", { class: "faint", style: { marginLeft: "10px" } }, "— compile + preflight only; nothing is generated or spent"),
      );
      submit.disabled = pr.length > 0;
    }
    submit.addEventListener("click", async () => {
      if (problems().length) return;
      const placements = [...S.placements];
      const prods = [...S.products];
      const items =
        S.mode === "cross" && S.styles.length > 1
          ? prods.flatMap((product) => S.styles.map((st) => ({ product, styles: [st], placements })))
          : prods.map((product) => ({ product, styles: [...S.styles], placements }));
      submit.disabled = true;
      submit.replaceChildren(spinner(), "Compiling + preflight…");
      errBox.hidden = true;
      try {
        const b = await api("/api/batches", { method: "POST", body: { name: S.name.trim(), items, settings: { lang: langSel.value, draft: draftChk.checked } } });
        toast(`Batch ${b.id} compiled`, { kind: "ok" });
        refreshStats(true);
        location.hash = `#/batch/${encodeURIComponent(b.id)}`;
      } catch (e) {
        const msg = e.status === 503 ? `Batch module not ready — nothing was created.${e.body?.detail ? `\n${e.body.detail}` : ""}` : `Compile failed: ${e.message}`;
        errBox.replaceChildren(icon("alert"), h("div", { class: "copytext" }, msg));
        errBox.hidden = false;
        toast(e.status === 503 ? "Batch module not ready — nothing was created." : "Compile failed — see the details above the button.", { kind: "error", timeout: 6000 });
        submit.replaceChildren("Compile batch");
        paint();
      }
    });

    const view = h(
      "section",
      { class: "view view-new" },
      h("div", { class: "view-head" }, h("div", null, h("h1", null, "New batch"), h("div", { class: "sub" }, "Pick store products and one or more styles. The server compiles shot plans + prompts and runs preflight — generation stays CLI-only and needs --confirm."))),
      h(
        "div",
        { class: "step" },
        h("div", { class: "step-head" }, h("span", { class: "step-no" }, "1"), h("h2", null, "Products"), pCount, h("span", { class: "spacer" }), h("div", { class: "search" }, icon("search"), pSearch), pCat, pStock, selectVisible, clearSel),
        pGrid,
      ),
      h("div", { class: "step" }, h("div", { class: "step-head" }, h("span", { class: "step-no" }, "2"), h("h2", null, "Styles"), h("span", { class: "hint" }, "pick several to blend: hook from #1, body from the next, end card from the last")), stylesBody),
      h(
        "div",
        { class: "step" },
        h("div", { class: "step-head" }, h("span", { class: "step-no" }, "3"), h("h2", null, "Placements & language"), h("span", { class: "hint" }, "each job renders every selected placement; one language per creative")),
        h("div", { class: "row wrap" }, plBtns, h("span", { class: "sep", style: { width: "1px", height: "20px", background: "var(--line-2)", margin: "0 6px" } }), langSel, draftLbl, h("span", { class: "spacer" }), modeSeg),
      ),
      errBox,
      h("div", { class: "actionbar" }, h("label", { class: "row" }, h("span", { class: "muted" }, "Name"), nameIn), summary, h("span", { class: "spacer" }), submit),
    );
    filterProducts();
    paint();
    mount(seq, view);
  }

  // ── Batches ──────────────────────────────────────────────────────────────────
  const jobCount = (b) => (Array.isArray(b.jobs) ? b.jobs.length : isNum(b.jobs) ? Number(b.jobs) : null);

  async function viewBatches({ seq }) {
    mountLoading(seq);
    let list;
    try {
      list = await api("/api/batches");
    } catch (e) {
      mount(seq, pageView("Batches", null, e.status === 503 ? notReady("batch", e, route) : errorState(e, route), h("a", { class: "btn btn-sm btn-primary", href: "#/batch/new" }, icon("plus", "i-sm"), "New batch")));
      return;
    }
    const newBtn = h("a", { class: "btn btn-sm btn-primary", href: "#/batch/new" }, icon("plus", "i-sm"), "New batch");
    if (!list.length) {
      mount(seq, pageView("Batches", null, stateBox({ iconName: "box", title: "No batches yet", text: "A batch compiles store products × styles into shot plans, prompts and a cost estimate, then preflights them. Nothing is generated from the UI.", extra: newBtn }), null));
      return;
    }
    const rows = [...list]
      .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
      .map((b) => {
        const tr = h(
          "tr",
          { tabindex: "0" },
          h("td", null, statusSt(b.status)),
          h("td", null, h("div", { style: { fontWeight: "600" } }, b.name || "Untitled"), h("div", { class: "mono faint", style: { fontSize: "11px" } }, b.id)),
          h("td", { class: "num mono" }, fmtNum(jobCount(b))),
          h("td", { class: "num mono" }, fmtNum(isNum(b.est_credits) ? Math.round(b.est_credits) : null)),
          h("td", { class: "num mono" }, fmtUsd(b.est_usd)),
          h("td", { class: "muted nowrap" }, b.created_at ? `${fmtIso(b.created_at)} · ${fmtRel(b.created_at)}` : "–"),
        );
        const go = () => {
          location.hash = `#/batch/${encodeURIComponent(b.id)}`;
        };
        tr.addEventListener("click", go);
        tr.addEventListener("keydown", (e) => {
          if (e.key === "Enter") go();
        });
        return tr;
      });
    const table = h(
      "div",
      { class: "panel" },
      h("table", { class: "tbl hover" }, h("thead", null, h("tr", null, h("th", null, "Status"), h("th", null, "Batch"), h("th", { class: "num" }, "Jobs"), h("th", { class: "num" }, "Est. credits"), h("th", { class: "num" }, "Est. USD"), h("th", null, "Created"))), h("tbody", null, rows)),
    );
    mount(seq, pageView("Batches", `${plural(list.length, "batch")} · compiled product × style jobs with cost estimates and preflight`, table, newBtn));
  }

  async function viewBatch({ params: [id], seq }) {
    mountLoading(seq);
    let b;
    try {
      b = await api(`/api/batches/${encodeURIComponent(id)}`);
    } catch (e) {
      const crumbs = h("div", { class: "crumbs" }, h("a", { href: "#/batches" }, icon("arrowLeft", "i-sm"), "Batches"));
      mount(seq, h("section", { class: "view" }, crumbs, e.status === 503 ? notReady("batch", e, route) : e.status === 404 ? stateBox({ title: "Batch not found", text: `No batch “${id}”.` }) : errorState(e, route)));
      return;
    }
    mount(seq, renderBatch(b));
  }

  function promptParts(req) {
    if (!req || typeof req !== "object") return { prompt: null, negative: null, rest: {} };
    const inp = req.input && typeof req.input === "object" ? req.input : req;
    const { prompt, negative_prompt: negative, ...rest } = inp;
    if (inp === req) delete rest.model;
    return { prompt: typeof prompt === "string" ? prompt : prompt ? JSON.stringify(prompt) : null, negative: negative || null, rest };
  }
  function shortVal(v) {
    if (Array.isArray(v)) return v.length > 2 ? `[${v.length} items]` : v.map((x) => (typeof x === "string" ? x.split("/").pop() : JSON.stringify(x))).join(", ");
    if (v && typeof v === "object") return JSON.stringify(v).slice(0, 120);
    return String(v);
  }
  function outputsGrid(files) {
    if (!files?.length) return null;
    return h(
      "div",
      { class: "outputs" },
      files.map((o) => {
        const media = o.url
          ? o.kind === "video"
            ? h("video", { src: o.url, controls: true, preload: "metadata", muted: true })
            : o.kind === "image"
              ? h("img", { src: o.url, alt: o.name, loading: "lazy", style: { cursor: "zoom-in" }, onclick: () => lightbox(o.url, o.name) })
              : null
          : null;
        const name = o.url ? h("a", { class: "on", href: o.url, target: "_blank", rel: "noopener" }, o.name || "file") : h("a", { class: "on", href: safeHref(o.remote) || "#", target: "_blank", rel: "noopener noreferrer", title: "Remote output (not downloaded yet)" }, `${o.name || "remote"} ↗`);
        return h("div", { class: "o" }, media, name);
      }),
    );
  }

  const LEVEL_ORDER = { BLOCK: 0, WARN: 1, PASS: 2 };
  function checksList(checks) {
    const sorted = [...checks].sort((a, b) => (LEVEL_ORDER[String(a.level).toUpperCase()] ?? 3) - (LEVEL_ORDER[String(b.level).toUpperCase()] ?? 3));
    return h(
      "div",
      { class: "checks" },
      sorted.map((c) => {
        const lv = String(c.level || "").toUpperCase();
        return h("div", { class: `check-row ${lv}` }, h("span", { class: "lv" }, lv || "?"), h("span", null, c.id && h("span", { class: "cid" }, c.id), h("span", { class: "bidi", dir: "auto" }, c.msg || "")));
      }),
    );
  }
  const SLOT_SKIP = new Set(["gift_raw", "colours_count"]);
  function slotsList(slots) {
    const pairs = Object.entries(slots || {}).filter(([k, v]) => !SLOT_SKIP.has(k) && typeof v === "string" && v.trim());
    if (!pairs.length) return null;
    return kv(pairs.map(([k, v]) => [h("span", { class: "mono" }, `{${k}}`), h("span", { class: "bidi", dir: "auto" }, v)]));
  }
  function copyDraft(copy) {
    if (!copy || typeof copy !== "object") return null;
    const prim = Array.isArray(copy.primary) ? copy.primary : [];
    const heads = Array.isArray(copy.headline) ? copy.headline : copy.headline ? [copy.headline] : [];
    const desc = Array.isArray(copy.description) ? copy.description : copy.description ? [copy.description] : [];
    return h(
      "div",
      { class: "stack", style: { gap: "8px" } },
      prim.map((p, i) => h("div", null, h("div", { class: "row", style: { marginBottom: "4px" } }, h("span", { class: "section-title", style: { margin: "0" } }, `Primary text ${i + 1}`), h("span", { class: "spacer" }), copyBtn(String(p))), h("div", { class: "copytext", dir: "auto", style: { background: "var(--bg-2)", border: "1px solid var(--line)", borderRadius: "7px", padding: "8px 10px" } }, String(p)))),
      kv([
        ["Headlines", heads.length ? h("div", { class: "stack", style: { gap: "3px" } }, heads.map((x) => h("span", { class: "bidi", dir: "auto" }, x))) : null],
        ["Description", desc.length ? h("span", { class: "bidi", dir: "auto" }, desc.join(" · ")) : null],
        ["CTA", copy.cta_type && chip(copy.cta_type, "paper mono")],
        ["Language", copy.language],
        ["Link", safeHref(copy.link) ? h("a", { class: "mono", href: copy.link, target: "_blank", rel: "noopener noreferrer", style: { color: "var(--blue)" } }, copy.link) : null],
        ["URL tags", copy.url_tags ? h("span", { class: "mono", style: { fontSize: "11px", wordBreak: "break-all" } }, copy.url_tags) : null],
      ]),
    );
  }
  function shotPlan(shots) {
    if (!Array.isArray(shots) || !shots.length) return null;
    return h(
      "table",
      { class: "tbl" },
      h("thead", null, h("tr", null, h("th", null, "Beat"), h("th", null, "Shot"), h("th", null, "Strategy · rung"), h("th", { class: "num" }, "Dur"))),
      h(
        "tbody",
        null,
        shots.map((s) =>
          h(
            "tr",
            null,
            h("td", null, roleTag(s.role), h("div", { class: "mono faint", style: { fontSize: "10.5px" } }, `${s.id}${s.from_style ? ` · ${s.from_style}` : ""}`)),
            h("td", { title: tDesc("shot_types", s.shot) }, pretty(s.shot)),
            h("td", null, h("div", { class: "row wrap", style: { gap: "5px" } }, s.rung && chip(s.rung, `mono ${RUNG_CLASS[s.rung] || ""}`, rungDesc(s.rung)), h("span", { title: tDesc("generation_strategies", s.strategy) }, pretty(s.strategy)))),
            h("td", { class: "num mono" }, isNum(s.dur) ? `${s.dur} s` : "–"),
          ),
        ),
      ),
    );
  }

  function jobPanel(j) {
    const pf = j.preflight || null;
    const checks = Array.isArray(pf?.checks) ? pf.checks : [];
    const pinfo = j.product_info;
    const tasks = Array.isArray(j.tasks) ? j.tasks : [];
    const ops = Array.isArray(j.ops) ? j.ops : [];
    const spec = j.spec && typeof j.spec === "object" ? j.spec : null;
    const placements = spec?.placements || spec?.aspects || null;
    const shoot = Array.isArray(spec?.shoot_requests) ? spec.shoot_requests : [];
    const byRoute = spec?.cost?.by_route && typeof spec.cost.by_route === "object" ? Object.entries(spec.cost.by_route) : [];
    const slots = slotsList(spec?.slots);
    const plan = shotPlan(spec?.shots);
    const draftCopy = copyDraft(spec?.copy);
    const left = h(
      "div",
      { class: "stack" },
      h(
        "div",
        null,
        h("div", { class: "row", style: { marginBottom: "8px" } }, h("div", { class: "section-title", style: { margin: "0" } }, "Preflight"), verdictBadge(pf?.verdict), pf?.at && h("span", { class: "faint", style: { fontSize: "11px" } }, fmtRel(pf.at))),
        checks.length ? checksList(checks) : h("p", { class: "faint" }, pf ? "No checks reported." : "Preflight has not run for this job yet."),
      ),
      shoot.length
        ? h(
            "div",
            null,
            h("div", { class: "section-title" }, `Shoot requests for the owner (${shoot.length})`),
            h("ul", { class: "listy" }, shoot.map((s) => h("li", null, h("span", { class: "mono" }, s.shot_id), " — ", h("span", { class: "bidi", dir: "auto" }, s.what || ""), s.why && h("div", { class: "faint", style: { fontSize: "11.5px" } }, s.why)))),
          )
        : null,
      slots && h("div", null, h("div", { class: "section-title" }, "Overlay text — composited in Remotion, never model-rendered"), slots),
      (() => {
        const files = [
          ...(j.renders || []),
          ...(j.assets || []).filter((a) => a.url).map((a) => ({ url: a.url, name: [a.kind, a.placement, a.status].filter(Boolean).join(" · ") || a.id, kind: /\.(mp4|webm|mov)$/i.test(a.path || "") ? "video" : "image" })),
          ...ops.filter((o) => o.output_url).map((o) => ({ url: o.output_url, name: [o.kind, o.shot_id, o.placement].filter(Boolean).join(" · "), kind: /\.(mp4|webm|mov)$/i.test(o.output_url) ? "video" : "image" })),
        ];
        return files.length ? h("div", null, h("div", { class: "section-title" }, `Renders, composites & assets (${files.length})`), outputsGrid(files)) : null;
      })(),
      draftCopy && h("details", { class: "fold" }, h("summary", null, "Ad copy draft"), h("div", { class: "fold-body" }, draftCopy)),
      plan && h("details", { class: "fold" }, h("summary", null, `Shot plan (${spec.shots.length} beats)`), h("div", { class: "fold-body" }, plan)),
      byRoute.length ? h("details", { class: "fold" }, h("summary", null, `Cost by route${spec.cost.uncertain ? " · some estimates uncertain" : ""}`), h("div", { class: "fold-body" }, kv(byRoute.map(([r, usd]) => [h("span", { class: "mono" }, r), h("span", { class: "mono" }, fmtUsd(usd))])))) : null,
      spec && h("details", { class: "fold" }, h("summary", null, "Job spec (JSON)"), h("div", { class: "fold-body" }, h("pre", { class: "json" }, JSON.stringify(spec, null, 2)))),
    );
    const right = h(
      "div",
      null,
      h("div", { class: "section-title" }, `Tasks & compiled prompts (${tasks.length})`),
      tasks.length
        ? tasks.map((t) => {
            const { prompt, negative, rest } = promptParts(t.request);
            const restPairs = Object.entries(rest || {}).filter(([, v]) => v !== null && v !== undefined && v !== "");
            const where = [t.stage && `stage ${t.stage}`, t.placement, isNum(t.candidate) && Number(t.candidate) > 0 ? `cand ${Number(t.candidate) + 1}` : null].filter(Boolean).join(" · ");
            return h(
              "details",
              { class: "task" },
              h(
                "summary",
                null,
                h("span", { class: "mono" }, t.shot_id || t.id),
                where && h("span", { class: "faint", style: { fontSize: "11px" } }, where),
                h("span", { class: "muted mono ellipsis", style: { fontSize: "11px", minWidth: "0" } }, t.model || ""),
                h("span", { class: "spacer" }),
                t.selected === false && chip("alt", "outline", "Alternate candidate (not selected)"),
                isNum(t.est_credits) && h("span", { class: "faint mono", style: { fontSize: "11px" } }, `${fmtNum(Math.round(t.est_credits * 10) / 10)} cr`),
                Array.isArray(t.qa) && t.qa[0] ? qaBadge(t.qa[0].verdict) : null,
                statusSt(t.state),
              ),
              h(
                "div",
                { class: "tbody" },
                prompt ? h("div", null, h("div", { class: "row", style: { marginBottom: "5px" } }, h("span", { class: "section-title", style: { margin: "0" } }, "Prompt"), h("span", { class: "spacer" }), copyBtn(prompt)), h("pre", { class: "prompt" }, prompt)) : h("p", { class: "faint" }, "No prompt (non-generative step)."),
                negative && h("div", null, h("div", { class: "section-title" }, "Negative prompt"), h("pre", { class: "prompt" }, negative)),
                restPairs.length ? kv(restPairs.map(([k, v]) => [k, h("span", { class: "mono", style: { fontSize: "11.5px" } }, shortVal(v))])) : null,
                t.error && h("div", { class: "note" }, icon("alert"), h("span", { class: "mono" }, typeof t.error === "string" ? t.error : JSON.stringify(t.error))),
                outputsGrid(t.output_files),
                Array.isArray(t.qa) && t.qa.length
                  ? h("div", null, h("div", { class: "section-title" }, `QA · ${t.qa[0].kind || "check"}${t.qa[0].created_at ? ` · ${fmtRel(t.qa[0].created_at)}` : ""}`), Array.isArray(t.qa[0].json) ? checksList(t.qa[0].json) : h("pre", { class: "json" }, JSON.stringify(t.qa[0].json, null, 2)))
                  : null,
                t.request && h("details", { class: "fold" }, h("summary", null, "Request JSON"), h("div", { class: "fold-body" }, h("pre", { class: "json" }, JSON.stringify(t.request, null, 2)))),
              ),
            );
          })
        : h("p", { class: "faint" }, "No tasks — every beat of this job uses real photos or graphics (no model calls)."),
      ops.length
        ? h(
            "details",
            { class: "fold" },
            h("summary", null, `Deterministic ops (${ops.length}) — cut-outs, composites, edits; no credits`),
            h(
              "div",
              { class: "fold-body" },
              h("table", { class: "tbl" }, h("thead", null, h("tr", null, h("th", null, "Op"), h("th", null, "Shot"), h("th", null, "Placement"), h("th", null, "State"))), h("tbody", null, ops.map((o) => h("tr", null, h("td", { class: "mono" }, o.kind || o.id), h("td", { class: "mono" }, o.shot_id || "–"), h("td", { class: "mono" }, o.placement || "–"), h("td", null, statusSt(o.state)))))),
            ),
          )
        : null,
    );
    return h(
      "article",
      { class: "panel job" },
      h(
        "div",
        { class: "job-head" },
        h("span", { class: "mono faint" }, `#${isNum(j.idx) ? j.idx + 1 : "?"}`),
        h("span", { class: "pimg" }, pinfo?.thumb ? h("img", { src: pinfo.thumb, alt: "", loading: "lazy" }) : null),
        h(
          "div",
          { class: "jt" },
          h("span", { class: "nm", dir: "auto" }, pinfo ? productName(pinfo) : j.product_slug || "Unknown product"),
          h("span", { class: "row wrap", style: { gap: "5px" } }, h("span", { class: "mono faint", style: { fontSize: "11px" } }, j.product_slug), pinfo && h("span", { class: "muted mono", style: { fontSize: "11px" } }, fmtDA(pinfo.price)), (j.style_info || []).map((s) => h("a", { class: "chip outline", href: `#/style/${encodeURIComponent(s.id)}` }, s.name || s.id)), Array.isArray(placements) ? placements.map((p) => chip(String(p), "mono")) : null),
        ),
        h("span", { class: "spacer" }),
        h("span", { class: "muted mono nowrap", title: "Estimated credits / USD" }, `${fmtNum(isNum(j.est_credits) ? Math.round(j.est_credits) : null)} cr · ${fmtUsd(j.est_usd)}`),
        statusSt(j.status),
        verdictBadge(pf?.verdict),
      ),
      h("div", { class: "job-body" }, left, right),
    );
  }

  function renderBatch(b) {
    const jobs = Array.isArray(b.jobs) ? b.jobs : [];
    const v = b.verdicts || {};
    const cap = b.max_credits_per_batch;
    const est = Number(b.est_credits) || 0;
    const overCap = isNum(cap) && est > Number(cap);
    // Preflight is the pre-generation audit; batch.mjs rewrites the batch status when it runs, so it
    // is only offered before generation (re-running it on a generated batch would reset it to ready).
    const canPreflight = /^(draft|compiled|ready|blocked)$/i.test(String(b.status || ""));
    const pfBtn = h("button", { class: "btn btn-sm", type: "button", title: canPreflight ? "Re-run the pre-generation audit" : `Preflight runs before generation — this batch is already “${b.status}”` }, icon("shield", "i-sm"), "Run preflight");
    pfBtn.disabled = !canPreflight;
    pfBtn.addEventListener("click", async () => {
      pfBtn.disabled = true;
      pfBtn.replaceChildren(spinner(), "Running preflight…");
      try {
        const nb = await api(`/api/batches/${encodeURIComponent(b.id)}/preflight`, { method: "POST", body: {} });
        const view = renderBatch(nb);
        app.querySelector(".view-batch")?.replaceWith(view);
        const nv = nb.verdicts || {};
        toast(`Preflight done — ${nv.PASS || 0} pass · ${nv.WARN || 0} warn · ${nv.BLOCK || 0} block`, { kind: nv.BLOCK ? "error" : "ok", timeout: 4500 });
      } catch (e) {
        toast(e.status === 503 ? "Batch module not ready — preflight unavailable." : `Preflight failed: ${e.message}`, { kind: "error" });
        pfBtn.disabled = false;
        pfBtn.replaceChildren(icon("shield", "i-sm"), "Run preflight");
      }
    });
    const blocked = (v.BLOCK || 0) > 0 || String(b.status).toLowerCase() === "blocked";
    const gen = panel(
      "Generate",
      "CLI only — a click in this UI can never spend credits",
      h(
        "div",
        { class: "gen-box" },
        cmdBlock(b.generate_command || `node cli.mjs gen run --batch ${b.id} --confirm ${b.id}`, true),
        h(
          "div",
          { class: ["note", (!canPreflight || (!blocked && !overCap)) && "info"] },
          icon(canPreflight && (blocked || overCap) ? "alert" : "terminal"),
          h(
            "div",
            null,
            !canPreflight
              ? `This batch is already “${b.status}”. Re-running the command resumes it: tasks that already have a provider id are polled, never re-created.`
              : blocked
              ? "Preflight has BLOCK findings — fix them (or change the rung/style) before generating; the CLI refuses a blocked batch."
              : overCap
                ? `Estimate (${fmtNum(Math.round(est))} credits) is above the per-batch cap of ${fmtNum(cap)} credits — the CLI stops at the cap.`
                : `Run from creative-lab/. It uploads approved reference photos to Kie.ai and spends about ${fmtNum(Math.round(est))} credits (${fmtUsd(b.est_usd)}); --confirm must repeat the batch id.`,
          ),
        ),
      ),
    );
    return h(
      "section",
      { class: "view view-batch" },
      h("div", { class: "crumbs" }, h("a", { href: "#/batches" }, icon("arrowLeft", "i-sm"), "Batches"), h("span", null, "/"), h("span", { class: "mono" }, b.id)),
      h(
        "div",
        { class: "batch-head" },
        h(
          "div",
          { class: "detail-title" },
          h("h1", null, b.name || b.id, statusSt(b.status)),
          h(
            "div",
            { class: "detail-meta" },
            h("span", { class: "row" }, h("span", { class: "mono" }, b.id), copyBtn(b.id, "ID")),
            b.created_at && h("span", null, `created ${fmtRel(b.created_at)}`),
            h("span", null, plural(jobs.length, "job")),
            h("span", { class: "row" }, verdictBadge("PASS"), h("b", { class: "mono" }, String(v.PASS || 0)), verdictBadge("WARN"), h("b", { class: "mono" }, String(v.WARN || 0)), verdictBadge("BLOCK"), h("b", { class: "mono" }, String(v.BLOCK || 0)), v.none ? h("span", { class: "faint" }, `${v.none} not run`) : null),
          ),
        ),
        h(
          "div",
          { class: "row", style: { alignItems: "flex-start", gap: "18px" } },
          h(
            "div",
            { class: "cost" },
            h("div", null, h("div", { class: "k" }, "Est. credits"), h("div", { class: "v", style: overCap ? { color: "var(--red)" } : null }, fmtNum(Math.round(est)), isNum(cap) ? h("small", null, ` / ${fmtNum(cap)} cap`) : null)),
            h("div", null, h("div", { class: "k" }, "Est. USD"), h("div", { class: "v" }, fmtUsd(b.est_usd))),
            isNum(b.spent_credits) && h("div", null, h("div", { class: "k" }, "Spent"), h("div", { class: "v" }, fmtNum(b.spent_credits), h("small", null, " cr"))),
          ),
          pfBtn,
        ),
      ),
      h(
        "div",
        { class: "stack" },
        gen,
        Array.isArray(b.preflight?.batch) && b.preflight.batch.length ? panel("Batch checks", "across all jobs — distinctness (Andromeda) and the credit cap", checksList(b.preflight.batch), { actions: verdictBadge(b.preflight.verdict) }) : null,
        b.settings && Object.keys(b.settings).length ? h("details", { class: "fold", style: { borderTop: "0", marginTop: "0" } }, h("summary", null, "Batch settings"), h("div", { class: "fold-body" }, h("pre", { class: "json" }, JSON.stringify(b.settings, null, 2)))) : null,
        jobs.length ? h("div", null, jobs.map(jobPanel)) : stateBox({ compact: true, title: "This batch has no jobs", text: "Compile it again from New batch." }),
      ),
    );
  }

  // ── global wiring ────────────────────────────────────────────────────────────
  const lb = $("#lightbox");
  lb.addEventListener("click", closeLightbox);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeLightbox();
    const tag = (e.target && e.target.tagName) || "";
    if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(tag) && !e.ctrlKey && !e.metaKey) {
      const s = [...document.querySelectorAll("[data-search]")].find((x) => x.offsetParent !== null);
      if (s) {
        e.preventDefault();
        s.focus();
        s.select();
      }
    }
  });
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";

  // ── Prompt codes (briefs): reference ad/style + product + format → FL-XXXXX for Claude ─────────────
  const BRIEF_MODELS = [["veo-3.1-fast", "Veo 3.1 Fast (default)"], ["veo-3.1-quality", "Veo 3.1 Quality (hero shots, no ingredients)"], ["veo-3.1-lite", "Veo 3.1 Lite (drafts)"], ["omni-flash", "Gemini Omni Flash (up to 10 s)"]];
  const BRIEF_MODES = [["auto", "Let Claude choose"], ["ingredients", "Ingredients (product photos as references)"], ["frames", "Frames (start / end image)"], ["text", "Text only (no product on screen)"]];
  const segBtns = (opts, cur, onPick) => {
    const wrap = h("div", { class: "seg", role: "group" });
    const paint = (v) => [...wrap.children].forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === String(v))));
    for (const [v, t] of opts) {
      const b = h("button", { class: "toggle", type: "button", dataset: { v: String(v) } }, t);
      b.addEventListener("click", () => {
        paint(v);
        onPick(v);
      });
      wrap.append(b);
    }
    paint(cur);
    return wrap;
  };

  function refCardMini(ref) {
    if (!ref) return null;
    return h(
      "a",
      { class: "brief-ref", href: `#/ad/${encodeURIComponent(ref.id)}` },
      h("span", { class: "pimg" }, ref.thumb ? h("img", { src: ref.thumb, alt: "", loading: "lazy" }) : null),
      h("span", { class: "pt" }, h("b", null, ref.page_name || ref.id), h("span", { class: "faint" }, `${formatLabel(ref)} · ${fmtDays(ref.days_active)} running${ref.brand ? ` · ${ref.brand}` : ""}`)),
    );
  }

  async function viewBriefNew({ query, seq }) {
    mountLoading(seq);
    const adId = query.get("ad");
    const styleId = query.get("style");
    const [products, adRes, styleRes] = await Promise.all([
      api("/api/products").catch((e) => e),
      adId ? api(`/api/ads?all=1&q=${encodeURIComponent(adId)}`).catch((e) => e) : null,
      styleId ? api(`/api/styles/${encodeURIComponent(styleId)}`).catch((e) => e) : null,
    ]);
    if (products instanceof Error) return mount(seq, pageView("New prompt code", null, errorState(products, route)));
    const ref = adRes && !(adRes instanceof Error) ? (adRes.items || []).find((x) => x.id === adId) : null;
    const style = styleRes && !(styleRes instanceof Error) ? styleRes : null;
    if (!ref && !style) {
      return mount(
        seq,
        pageView(
          "New prompt code",
          null,
          stateBox({
            iconName: "film",
            title: "First pick the reference ad",
            text: "Open any ad in the library (local winners or big brands) and click “Get prompt code”. You then choose the product and the format here.",
            extra: [h("a", { class: "btn btn-sm btn-primary", href: "#/?segment=premium" }, "Browse big-brand ads"), h("a", { class: "btn btn-sm", href: "#/" }, "Browse local winners")],
          }),
        ),
      );
    }
    const S = { product: null, aspect: "9:16", duration_s: 8, model: "veo-3.1-fast", mode: "auto", vo: "auto", notes: "" };
    const plist = sortProducts(products).filter((p) => p.inStock);
    const pSearch = h("input", { class: "input", type: "search", placeholder: "Search products…", "aria-label": "Search products" });
    const pGrid = h("div", { class: "pick-grid", role: "radiogroup", "aria-label": "Product" });
    const tiles = [];
    for (const p of plist) {
      const t = h(
        "button",
        { class: "pick", type: "button", "aria-pressed": "false", title: p.slug },
        h("span", { class: "pimg" }, p.thumb ? h("img", { src: p.thumb, alt: "", loading: "lazy" }) : null),
        h("span", { class: "pt" }, h("span", { class: "nm", dir: "auto" }, productName(p)), h("span", { class: "sb" }, `${fmtDA(p.price)}${p.freeGift ? " · gift" : ""}`)),
        h("span", { class: "tick" }, icon("check")),
      );
      t.addEventListener("click", () => {
        S.product = p.slug;
        tiles.forEach((x) => x.el.setAttribute("aria-pressed", String(x.p.slug === p.slug)));
        paint();
      });
      tiles.push({ el: t, p });
      pGrid.append(t);
    }
    pSearch.addEventListener("input", () => {
      const q = pSearch.value.trim().toLowerCase();
      for (const { el, p } of tiles) el.hidden = !!q && ![p.slug, p.name?.ar, p.name?.fr].some((x) => String(x || "").toLowerCase().includes(q));
    });
    const durWrap = h("div");
    const paintDur = () => {
      const opts = (S.model === "omni-flash" ? [4, 6, 8, 10] : [4, 6, 8]).map((d) => [d, `${d} s`]);
      if (S.model !== "omni-flash" && S.duration_s > 8) S.duration_s = 8;
      durWrap.replaceChildren(segBtns(opts, S.duration_s, (v) => (S.duration_s = Number(v))));
    };
    paintDur();
    const modelSel = h("select", { class: "select", "aria-label": "Model" }, BRIEF_MODELS.map(([v, t]) => h("option", { value: v }, t)));
    modelSel.addEventListener("change", () => {
      S.model = modelSel.value;
      paintDur();
    });
    const voSel = h("select", { class: "select", "aria-label": "Darija voice-over" }, [["auto", "Only if the original has a voice"], ["on", "Yes — write a Darija voice-over"], ["off", "No voice-over"]].map(([v, t]) => h("option", { value: v }, t)));
    voSel.addEventListener("change", () => (S.vo = voSel.value));
    const modeSel = h("select", { class: "select", "aria-label": "Mode" }, BRIEF_MODES.map(([v, t]) => h("option", { value: v }, t)));
    modeSel.addEventListener("change", () => (S.mode = modeSel.value));
    const notes = h("textarea", { class: "input", rows: 3, placeholder: "Optional: anything specific (colour to feature, mood, keep it calm, show the gift…)", style: { width: "100%" } });
    notes.addEventListener("input", () => (S.notes = notes.value));
    const go = h("button", { class: "btn btn-primary", type: "button" }, "Get the code");
    const status = h("span", { class: "hint" });
    const result = h("div");
    const paint = () => {
      go.disabled = !S.product;
      status.textContent = S.product ? `${S.product} · ${S.aspect} · ${S.duration_s}s` : "pick a product";
    };
    go.addEventListener("click", async () => {
      go.disabled = true;
      try {
        const b = await api("/api/briefs", { method: "POST", body: { source_kind: ref ? "ad" : "style", source_id: ref ? ref.id : style.id, product_slug: S.product, aspect: S.aspect, duration_s: S.duration_s, model: S.model, mode: S.mode, vo: S.vo, notes: S.notes || null } });
        result.replaceChildren(codeBox(b.code, true));
        result.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch (e) {
        result.replaceChildren(errorState(e));
      } finally {
        paint();
      }
    });
    paint();
    const refBlock = ref ? refCardMini(ref) : h("div", { class: "brief-ref" }, h("span", { class: "pt" }, h("b", null, style.name || style.id), h("span", { class: "faint" }, "Style card")));
    mount(
      seq,
      pageView(
        "New prompt code",
        "Reference + product + format → a short code. Send the code to Claude; you get back a ready-to-paste Flow prompt and the exact product photos to attach.",
        h(
          "div",
          { class: "stack" },
          panel("1 · Reference", "the ad whose format we copy", refBlock),
          panel("2 · Product", "in-stock store products", h("div", null, h("div", { class: "filterbar" }, h("div", { class: "search" }, icon("search"), pSearch)), pGrid)),
          panel(
            "3 · Format",
            "Google Flow",
            h(
              "div",
              { class: "form-grid" },
              h("label", null, "Aspect", segBtns([["9:16", "9:16 Reels/Stories"], ["16:9", "16:9"]], S.aspect, (v) => (S.aspect = v))),
              h("label", null, "Model", modelSel),
              h("label", null, "Length per scene", durWrap),
              h("label", null, "Mode", modeSel),
              h("label", null, "Darija voice-over", voSel),
              h("label", { class: "wide" }, "Notes", notes),
            ),
          ),
          h("div", { class: "row", style: { gap: "12px", alignItems: "center" } }, go, status),
          result,
        ),
      ),
    );
  }

  function codeBox(code, fresh = false) {
    return h(
      "div",
      { class: "codebox" },
      h("div", { class: "faint" }, fresh ? "Your code — send it to Claude:" : "Code"),
      h("div", { class: "code" }, code),
      h("div", { class: "row", style: { gap: "8px", justifyContent: "center" } }, copyBtn(code, "Copy code"), copyBtn(`Write the Flow prompt for ${code}`, "Copy message for Claude"), fresh && h("a", { class: "btn btn-xs", href: `#/brief/${code}` }, "Open")),
    );
  }

  async function viewBriefs({ seq }) {
    mountLoading(seq);
    let list;
    try {
      list = await api("/api/briefs");
    } catch (e) {
      return mount(seq, pageView("Prompt codes", null, errorState(e, route)));
    }
    const body = !list.length
      ? stateBox({ iconName: "film", title: "No codes yet", text: "Open an ad in the library and click “Get prompt code”.", extra: h("a", { class: "btn btn-sm btn-primary", href: "#/" }, "Open the library") })
      : h(
          "div",
          { class: "brief-list" },
          list.map((b) =>
            h(
              "a",
              { class: "brief-row", href: `#/brief/${b.code}` },
              h("span", { class: "code sm" }, b.code),
              h("span", { class: "pimg" }, b.reference?.thumb ? h("img", { src: b.reference.thumb, alt: "", loading: "lazy" }) : null),
              h("span", { class: "plus" }, "+"),
              h("span", { class: "pimg" }, b.product?.thumb ? h("img", { src: b.product.thumb, alt: "", loading: "lazy" }) : null),
              h("span", { class: "pt" }, h("b", { dir: "auto" }, b.product ? productName(b.product) : b.product_slug), h("span", { class: "faint" }, `${b.reference?.page_name || b.source_id} · ${b.aspect} · ${b.duration_s}s · ${b.model}`)),
              b.status === "prompted" ? chip("Prompt ready", "green") : chip("Waiting for Claude", "amber"),
            ),
          ),
        );
    mount(seq, pageView("Prompt codes", `${list.length} code${list.length === 1 ? "" : "s"}`, body, h("a", { class: "btn btn-sm btn-primary", href: "#/" }, icon("plus", "i-sm"), "New (pick an ad)")));
  }

  // ── Prompt code page = production board (one card per Flow scene) ─────────────
  const FLOW_URL = "https://labs.google/fx/tools/flow";
  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem(k);
        return v === null ? d : JSON.parse(v);
      } catch {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, JSON.stringify(v));
      } catch {}
    },
  };
  const AR_RE = /[؀-ۿ]/;

  // Inline markdown → DOM (text nodes only): **bold**, `code`, «Arabic quotes», bare links.
  function mdInline(text) {
    const out = [];
    const re = /(\*\*[^*]+\*\*|`[^`]+`|«[^»]*»|https?:\/\/[^\s)|]+)/g;
    let last = 0;
    let m;
    const s = String(text || "");
    while ((m = re.exec(s))) {
      if (m.index > last) out.push(s.slice(last, m.index));
      const t = m[0];
      if (t.startsWith("**")) out.push(h("b", null, mdInline(t.slice(2, -2))));
      else if (t.startsWith("`")) out.push(h("code", { class: "md-code" }, t.slice(1, -1)));
      else if (t.startsWith("«")) out.push(h("span", { class: "ar", dir: "rtl", lang: "ar" }, t));
      else {
        const href = safeHref(t.replace(/[.,]+$/, ""));
        out.push(href ? h("a", { class: "md-link", href, target: "_blank", rel: "noopener noreferrer" }, href.length > 60 ? `${href.slice(0, 57)}…` : href) : t);
      }
      last = m.index + t.length;
    }
    if (last < s.length) out.push(s.slice(last));
    return out;
  }
  // Block markdown → DOM: tables, bullet / numbered lists, quotes, paragraphs.
  function mdBlocks(md) {
    const lines = String(md || "").replace(/\r\n?/g, "\n").split("\n");
    const out = [];
    let i = 0;
    const cells = (l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
    while (i < lines.length) {
      const l = lines[i];
      if (!l.trim() || /^-{3,}\s*$/.test(l.trim())) {
        i++;
        continue;
      }
      if (/^\s*\|/.test(l)) {
        const rows = [];
        while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
        const body = rows.filter((r) => !/^\s*\|\s*:?-{2,}/.test(r));
        const [head, ...rest] = body.map(cells);
        out.push(
          h(
            "div",
            { class: "md-table" },
            h("table", { class: "tbl" }, h("thead", null, h("tr", null, (head || []).map((c) => h("th", null, mdInline(c))))), h("tbody", null, rest.map((r) => h("tr", null, r.map((c) => h("td", { dir: AR_RE.test(c) && !/[A-Za-z]{3}/.test(c) ? "rtl" : null }, mdInline(c))))))),
          ),
        );
        continue;
      }
      if (/^\s*[-*]\s+/.test(l)) {
        const items = [];
        while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s+/, ""));
        out.push(h("ul", { class: "listy md-list" }, items.map((t) => h("li", null, mdInline(t)))));
        continue;
      }
      if (/^\s*\d+[.)]\s+/.test(l)) {
        const items = [];
        while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ""));
        out.push(h("ol", { class: "listy md-list" }, items.map((t) => h("li", null, mdInline(t)))));
        continue;
      }
      if (/^>\s?/.test(l)) {
        const q = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, ""));
        out.push(h("div", { class: "quote md-quote", dir: "auto" }, mdInline(q.join(" "))));
        continue;
      }
      if (/^#{3,}\s+/.test(l)) {
        out.push(h("h4", { class: "md-h" }, mdInline(l.replace(/^#+\s+/, ""))));
        i++;
        continue;
      }
      const para = [];
      while (i < lines.length && lines[i].trim() && !/^\s*(\||[-*]\s|\d+[.)]\s|>|-{3,}\s*$|#{3,}\s)/.test(lines[i])) para.push(lines[i++]);
      if (!para.length) {
        i++;
        continue;
      }
      out.push(h("p", { class: "md-p", dir: "auto" }, para.map((p, k) => [k ? h("br") : null, mdInline(p)])));
    }
    return h("div", { class: "md" }, out);
  }

  /** Swap the "[COLOUR LOCK: …]" segment(s) for the chosen colourway's lock; no marker → prepend it. */
  function applyColourLock(prompt, lock) {
    if (!prompt || !lock) return prompt;
    let out = prompt;
    let from = 0;
    let found = false;
    for (;;) {
      const i = out.indexOf("[COLOUR LOCK:", from);
      if (i === -1) break;
      let depth = 0;
      let j = i;
      for (; j < out.length; j++) {
        if (out[j] === "[") depth++;
        else if (out[j] === "]" && --depth === 0) break;
      }
      if (j >= out.length) break; // unbalanced → leave the rest alone
      out = out.slice(0, i) + lock + out.slice(j + 1);
      from = i + lock.length;
      found = true;
    }
    return found ? out : `${lock} ${out}`;
  }
  const sceneShowsProduct = (sc) => !!sc.prompt && (sc.prompt.includes("[COLOUR LOCK:") || sc.attach.some((a) => a.kind === "photo") || !!sc.start_frame_text);
  const cwName = (c) => c?.name?.fr || c?.name?.ar || c?.slug || "";
  const zipQS = (S) => (S.variant ? `?colour=${encodeURIComponent(S.variant.slug)}` : "");
  const dlName = (n, label, file) => `${n}-${String(label || "photo").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "photo"}${(/\.(png|jpe?g|webp)$/i.exec(file || "") || [".jpg"])[0].toLowerCase()}`;

  // Big copy button that confirms in place ("Copied ✓"); `text` may be a function (read at click time).
  function bigCopy(text, label, { cls = "btn-primary", after } = {}) {
    const lbl = h("span", null, label);
    const b = h("button", { class: `btn ${cls} bigcopy`, type: "button" }, icon("copy", "i-sm"), lbl);
    b.addEventListener("click", async () => {
      const ok = await copyText(typeof text === "function" ? text() : text);
      b.classList.add(ok ? "ok" : "err");
      lbl.textContent = ok ? "Copied ✓" : "Copy failed";
      if (ok && after) after();
      setTimeout(() => {
        b.classList.remove("ok", "err");
        lbl.textContent = label;
      }, 1800);
    });
    return b;
  }

  async function viewBrief({ params: [code], seq }) {
    mountLoading(seq);
    let b;
    try {
      b = await api(`/api/briefs/${encodeURIComponent(code)}`);
    } catch (e) {
      return mount(seq, pageView(code, null, errorState(e, route)));
    }
    const back = h("a", { class: "btn btn-sm", href: "#/briefs" }, icon("arrowLeft", "i-sm"), "All codes");
    const sub = `${b.aspect} · ${b.duration_s}s · ${b.model} · mode ${b.mode}${b.notes ? ` · notes: ${b.notes}` : ""}`;
    if (!b.prompt) {
      return mount(
        seq,
        pageView(
          b.code,
          sub,
          h(
            "div",
            { class: "stack" },
            codeBox(b.code),
            stateBox({ compact: true, iconName: "clock", title: "Waiting for Claude", text: `Send “${b.code}” in the chat. The scene-by-scene production board appears here once the prompt is written.` }),
            panel("Reference", null, refCardMini(b.reference) || h("span", null, `${b.source_kind} ${b.source_id}`)),
          ),
          back,
        ),
      );
    }
    if (!b.pack || !b.pack.scenes?.length) return mount(seq, pageView(b.code, sub, rawBriefBody(b), back));
    mount(seq, briefBoard(b));
  }

  /** Old layout — only used when the markdown has no "## Scene …" sections to parse. */
  function rawBriefBody(b) {
    return h(
      "div",
      { class: "stack" },
      h("div", { class: "note info" }, icon("info"), h("span", null, "This prompt is not in the scene-by-scene format, so it is shown as written.")),
      panel("Prompt", "paste into Google Flow", h("div", null, h("div", { class: "row", style: { justifyContent: "flex-end", marginBottom: "8px" } }, copyBtn(b.prompt, "Copy everything")), h("pre", { class: "prompt-pre", dir: "auto" }, b.prompt))),
      panel(
        "Product photos",
        "attach these in Flow",
        h("div", { class: "brief-photos" }, (b.product?.photos || []).map((ph, i) => h("figure", null, ph.file ? h("img", { src: ph.file, alt: "", loading: "lazy" }) : null, h("figcaption", null, h("span", { class: "faint" }, `${i + 1} · ${ph.role}`), ph.file && h("a", { class: "btn btn-xs", href: ph.file, download: "" }, "Download"))))),
      ),
      panel("Reference", null, refCardMini(b.reference) || h("span", null, `${b.source_kind} ${b.source_id}`)),
    );
  }

  function briefBoard(b) {
    const pack = b.pack;
    const code = b.code;
    const keyDone = `cl.brief.${code}.done`;
    const keyQa = `cl.brief.${code}.qa`;
    const keyColour = `cl.brief.${code}.colour`;
    const baseSlug = b.product?.slug || b.product_slug;
    const S = { variant: null, colourways: null };
    const done = new Set(store.get(keyDone, []));

    const promptFor = (sc) => (S.variant && S.variant.colour_lock && sceneShowsProduct(sc) ? applyColourLock(sc.prompt, S.variant.colour_lock) : sc.prompt);
    const everything = () => {
      let md = b.prompt;
      if (S.variant) for (const sc of pack.scenes) if (sc.prompt) md = md.split(sc.prompt).join(promptFor(sc));
      return md;
    };
    /** Pack photo n → the photo to show for the chosen colour (same position in that colour's list). */
    const photoFor = (n) => {
      const base = pack.photos.find((p) => p.n === n);
      if (!base) return null;
      if (!S.variant) return { ...base, missing: !base.file };
      const vp = base.idx !== null && base.idx !== undefined ? S.variant.photos[base.idx] : null;
      return { ...base, file: vp?.file || null, thumb: vp?.thumb || null, missing: !vp?.file };
    };

    // ── header ──
    const p = b.product;
    // The chips below already show aspect / length / scene count → drop them from the title line.
    const titleRest = (pack.title || "")
      .replace(new RegExp(`^${code}\\s*·\\s*`), "")
      .replace(/(\s*·\s*(\d+:\d+|~\s*[\d.]+\s*s(\s+total)?|\d+\s+scenes?(\s*\+\s*\d+\s+prep)?))+\s*$/i, "");
    const videoScenes = pack.scenes.filter((s) => !s.prep).length;
    const prepScenes = pack.scenes.length - videoScenes;
    const zipAll = h("a", { class: "btn btn-sm", download: "" }, icon("image", "i-sm"), "Download all photos (.zip)");
    const head = h(
      "header",
      { class: "bb-head panel" },
      h(
        "div",
        { class: "bb-id" },
        h("div", { class: "bb-code" }, h("span", { class: "code sm" }, code), copyBtn(`Write the Flow prompt for ${code}`, "Message for Claude")),
        titleRest && h("div", { class: "bb-title", dir: "auto" }, titleRest),
        h(
          "div",
          { class: "chips" },
          chip(`${videoScenes} scene${videoScenes === 1 ? "" : "s"}${prepScenes ? ` + ${prepScenes} prep` : ""}`, "lg paper"),
          isNum(pack.total_s) && chip(`~${pack.total_s} s final cut`, "lg"),
          chip(b.aspect, "lg outline"),
        ),
      ),
      h(
        "div",
        { class: "bb-pair" },
        p &&
          h(
            "div",
            { class: "bb-thing" },
            h("span", { class: "pimg light" }, p.thumb ? h("img", { src: p.thumb, alt: "" }) : null),
            h("span", { class: "pt" }, h("span", { class: "faint" }, "Product"), h("b", { dir: "auto" }, productName(p)), h("span", { class: "price" }, h("b", null, fmtDA(p.price)), isNum(p.compareAt) && Number(p.compareAt) > Number(p.price) ? h("s", null, fmtDA(p.compareAt)) : null)),
          ),
        b.reference &&
          h(
            "a",
            { class: "bb-thing", href: `#/ad/${encodeURIComponent(b.reference.id)}`, title: "Open the reference ad" },
            h("span", { class: "pimg" }, b.reference.thumb ? h("img", { src: b.reference.thumb, alt: "" }) : null),
            h("span", { class: "pt" }, h("span", { class: "faint" }, "Reference"), h("b", null, b.reference.page_name || b.reference.id), h("span", { class: "faint" }, `${formatLabel(b.reference)} · ${fmtDays(b.reference.days_active)} running`)),
          ),
      ),
      h(
        "div",
        { class: "bb-actions" },
        zipAll,
        bigCopy(everything, "Copy everything", { cls: "btn-sm" }),
        h("a", { class: "btn btn-sm btn-primary", href: FLOW_URL, target: "_blank", rel: "noopener noreferrer" }, icon("external", "i-sm"), "Open Google Flow"),
      ),
    );

    // ── progress ──
    const progFill = h("i");
    const progText = h("span", { class: "bb-prog-t" });
    const paintProgress = () => {
      const n = pack.scenes.filter((s) => done.has(String(s.n))).length;
      progFill.style.width = `${(100 * n) / pack.scenes.length}%`;
      progText.replaceChildren(h("b", null, `${n}/${pack.scenes.length}`), " scenes done", n === pack.scenes.length ? " — ready to assemble" : "");
    };
    const progress = h("div", { class: "bb-prog" }, h("div", { class: "bar gold" }, progFill), progText);

    // ── colour picker (lib/products/colour.mjs; hidden while it answers 503) ──
    const colourRow = h("div", { class: "bb-colours", hidden: true });
    const colourNote = h("div", { class: "bb-colour-note", hidden: true });
    const paintColours = () => {
      const list = S.colourways || [];
      const cur = S.variant?.slug || baseSlug;
      colourRow.replaceChildren(
        h("span", { class: "bb-colours-l" }, "Colour"),
        ...list.map((c) => {
          const hex = c.store_hex || c.measured_hex || "#777";
          const btn = h(
            "button",
            { class: ["cw", c.slug === cur && "sel", c.in_stock === false && "oos"], type: "button", "aria-pressed": String(c.slug === cur), title: [c.descriptor_en, c.in_stock === false ? "out of stock" : null].filter(Boolean).join(" · ") || null },
            h("span", { class: "cw-dot", style: { background: hex } }),
            h("span", null, cwName(c)),
            c.name?.ar && h("span", { class: "ar faint", dir: "rtl", lang: "ar" }, c.name.ar),
            c.slug === baseSlug && h("span", { class: "cw-base" }, "pack"),
            c.in_stock === false && h("span", { class: "chip red" }, "out of stock — don't advertise"),
          );
          btn.addEventListener("click", () => pickColour(c.slug));
          return btn;
        }),
      );
      const v = S.variant;
      if (!v) {
        colourNote.hidden = true;
      } else {
        const counts = pack.used_photos.map((n) => photoFor(n)).filter(Boolean);
        const missing = counts.filter((x) => x.missing).length;
        colourNote.hidden = false;
        colourNote.replaceChildren(
          h(
            "div",
            { class: ["note", v.in_stock === false ? "" : "info"] },
            icon(v.in_stock === false ? "alert" : "info"),
            h(
              "span",
              null,
              h("b", null, `${cwName(v)}: `),
              "every product scene's prompt now carries the ",
              h("b", null, `${cwName(v)} COLOUR LOCK`),
              " and the photo strips + zips use the ",
              cwName(v),
              " photos.",
              missing ? h("b", null, ` Only ${v.photos.filter((x) => x.file).length} photos for this colour — ${missing} slot${missing === 1 ? " is" : "s are"} empty below.`) : null,
              v.in_stock === false ? h("b", null, " Out of stock — don't advertise this colour.") : null,
            ),
          ),
        );
      }
      zipAll.setAttribute("href", `/api/briefs/${encodeURIComponent(code)}/photos.zip${zipQS(S)}`);
    };
    function pickColour(slug) {
      S.variant = slug && slug !== baseSlug ? (S.colourways || []).find((c) => c.slug === slug) || null : null;
      store.set(keyColour, S.variant ? S.variant.slug : null);
      paintColours();
      paintScenes();
    }

    // ── scene cards ──
    const scenesBox = h("div", { class: "scenes" });
    const sceneCard = (sc) => {
      const id = String(sc.n);
      const isDone = done.has(id);
      const card = h("article", { class: ["scene-card", "panel", isDone && "done", sc.prep && "prep"], id: `scene-${id}` });
      const doneBox = h("input", { type: "checkbox", checked: isDone || null });
      doneBox.addEventListener("change", () => {
        if (doneBox.checked) done.add(id);
        else done.delete(id);
        store.set(keyDone, [...done]);
        card.classList.toggle("done", doneBox.checked);
        paintProgress();
      });
      const refLine = [sc.ref_shot && `ref ${sc.ref_shot}`, sc.ref_time, sc.use && `use ${sc.use} in the edit`].filter(Boolean).join(" · ") || (sc.prep ? "prep — make this before the scenes that use it" : sc.meta);
      const st = sc.settings || {};
      const setChip = (k, v, cls = "") => (v === null || v === undefined || v === "" ? null : h("span", { class: `set ${cls}`.trim() }, h("span", { class: "k" }, k), h("span", { class: "v" }, String(v))));

      // attach strip
      const tiles = [];
      let order = 0;
      for (const a of sc.attach) {
        order++;
        if (a.kind === "photo") {
          const ph = photoFor(a.n);
          const label = ph?.label || `photo ${a.n}`;
          tiles.push(
            h(
              "figure",
              { class: ["att", a.start && "start", (!ph || ph.missing) && "missing"] },
              h("span", { class: "att-order" }, String(order)),
              ph && ph.file
                ? h("button", { class: "att-img", type: "button", title: "Preview", onclick: () => lightbox(ph.file, `Photo ${a.n} · ${label}${S.variant ? ` · ${cwName(S.variant)}` : ""}`) }, h("img", { src: ph.thumb || ph.file, alt: `Photo ${a.n}`, loading: "lazy" }))
                : h("div", { class: "att-img ph" }, icon("image"), h("span", null, S.variant ? `no ${cwName(S.variant)} photo` : "no local file")),
              h(
                "figcaption",
                null,
                a.start && h("span", { class: "chip gold" }, "START FRAME"),
                h("span", { class: "att-n" }, `Photo ${a.n}`),
                h("span", { class: "att-l", title: label }, label),
                ph?.file && h("a", { class: "btn btn-xs", href: ph.file, download: dlName(a.n, label, ph.file) }, "Download"),
              ),
            ),
          );
        } else if (a.kind === "character") {
          tiles.push(h("figure", { class: "att char" }, h("span", { class: "att-order" }, String(order)), h("div", { class: "att-img ph" }, h("b", null, `@${a.name}`)), h("figcaption", null, h("span", { class: "att-n" }, "Character"), h("span", { class: "att-l" }, "pick from Characters in Flow"))));
        } else {
          tiles.push(h("figure", { class: "att char" }, h("span", { class: "att-order" }, String(order)), h("div", { class: "att-img ph" }, icon("info")), h("figcaption", null, h("span", { class: "att-l", title: a.label }, a.label))));
        }
      }
      const hasPhotos = sc.attach.some((a) => a.kind === "photo");
      const startNote = sc.start_frame_text && !sc.start_frame ? h("div", { class: "note info sm" }, icon("info"), h("span", null, h("b", null, "Start frame: "), sc.start_frame_text)) : sc.start_frame_text ? h("div", { class: "faint sm" }, `Start frame: ${sc.start_frame_text}`) : null;
      const attachBox =
        tiles.length || startNote
          ? h(
              "div",
              { class: "sc-attach" },
              h("div", { class: "sc-label" }, tiles.length ? "Attach in this order" : "Start frame", hasPhotos && h("a", { class: "btn btn-xs", href: `/api/briefs/${encodeURIComponent(code)}/scene/${encodeURIComponent(id)}/photos.zip${zipQS(S)}`, download: "" }, icon("image", "i-sm"), "Download this scene's photos")),
              tiles.length ? h("div", { class: "att-strip" }, tiles) : null,
              startNote,
            )
          : h("div", { class: "sc-attach" }, h("div", { class: "sc-label" }, "Attach"), h("div", { class: "faint sm" }, "Nothing to attach — text only."));

      // prompt
      const text = promptFor(sc) || "";
      const changed = !!S.variant && text !== sc.prompt;
      const pbox = h("div", { class: "pbox collapsed", dir: "auto" }, text);
      const more = h("button", { class: "btn btn-xs btn-ghost", type: "button" }, "Show the whole prompt");
      more.addEventListener("click", () => {
        const open = pbox.classList.toggle("collapsed");
        more.textContent = open ? "Show the whole prompt" : "Show less";
      });
      const promptBox = sc.prompt
        ? h(
            "div",
            { class: "sc-prompt" },
            h("div", { class: "sc-label" }, "Prompt", h("span", { class: "faint" }, `${text.split(/\s+/).length} words`), changed && h("span", { class: "chip gold" }, `${cwName(S.variant)} colour applied`)),
            pbox,
            h(
              "div",
              { class: "sc-btns" },
              bigCopy(() => promptFor(sc), "Copy prompt"),
              bigCopy(() => promptFor(sc), "Copy prompt & open Flow", { cls: "btn-gold", after: () => window.open(FLOW_URL, "_blank", "noopener") }),
              h("span", { class: "spacer" }),
              more,
            ),
          )
        : h("div", { class: "note" }, icon("alert"), h("span", null, "No “> …” prompt line found for this scene — see Copy everything."));

      const notes = h(
        "div",
        { class: "sc-notes" },
        sc.use_note && h("div", { class: "sn" }, h("b", null, "Use"), h("span", null, sc.use_note)),
        sc.fallback && h("div", { class: "sn warn" }, h("b", null, "If it drifts"), h("span", null, sc.fallback.replace(/^If it drifts:\s*/i, ""))),
        (sc.notes || []).map((n) => h("div", { class: "sn" }, h("b", null, "Note"), h("span", null, n))),
      );

      card.append(
        h(
          "div",
          { class: "sc-head" },
          h("span", { class: "sc-no" }, id),
          h("div", { class: "sc-t" }, h("h3", { dir: "auto" }, sc.title), refLine && h("div", { class: "faint" }, refLine)),
          h("span", { class: "spacer" }),
          sc.prep && chip(/image/i.test(st.mode || "") ? "Prep · image" : "Prep", "violet"),
          h("label", { class: "check sc-done" }, doneBox, h("span", null, "Done")),
        ),
        h("div", { class: "sc-sets" }, setChip("Model", st.model, "strong"), setChip("Mode", st.mode, "strong"), setChip("Aspect", st.aspect), setChip("Length", st.length), setChip("Outputs", st.outputs)),
        h("div", { class: "sc-grid" }, attachBox, promptBox),
      );
      if (notes.childNodes.length) card.append(notes);
      return card;
    };
    function paintScenes() {
      scenesBox.replaceChildren(...pack.scenes.map(sceneCard));
    }

    // ── reference panels ──
    const sec = pack.sections || {};
    const fold = (title, hint, body, { open = false, actions } = {}) =>
      h("details", { class: "bpanel panel", open: open || null }, h("summary", null, h("h2", null, title), hint && h("span", { class: "hint" }, hint), h("span", { class: "spacer" }), actions), h("div", { class: "panel-body" }, body));
    const panels = [];
    if (sec.intro?.markdown) panels.push(fold("About this pack", "method, what we keep / change, store photos", mdBlocks(sec.intro.markdown)));
    if (sec.breakdown) panels.push(fold("Breakdown of the reference", sec.breakdown.title.replace(/^Breakdown of the reference\s*/i, ""), mdBlocks(sec.breakdown.markdown)));
    if (sec.product_lock) panels.push(fold("Product lock", "pasted into every product scene", mdBlocks(sec.product_lock.markdown), { actions: copyBtn(sec.product_lock.markdown.replace(/\*\*/g, ""), "Copy") }));
    if (sec.continuity) panels.push(fold("Continuity bible", "pasted at the end of every scene", mdBlocks(sec.continuity.markdown), { actions: copyBtn(sec.continuity.markdown.replace(/\*\*/g, ""), "Copy") }));
    if (sec.voice_over) {
      const intro = sec.voice_over.markdown.split("\n").filter((l) => !/^\s*[-*]\s+/.test(l)).join("\n");
      panels.push(
        fold(
          "Voice-over",
          pack.vo_lines.length ? `${pack.vo_lines.length} Darija line${pack.vo_lines.length === 1 ? "" : "s"}` : null,
          h(
            "div",
            { class: "stack" },
            mdBlocks(intro),
            pack.vo_lines.length
              ? h("div", { class: "vo-lines" }, pack.vo_lines.map((v) => h("div", { class: "vo" }, h("span", { class: "chip mono" }, v.time), h("span", { class: "vo-t ar", dir: "rtl", lang: "ar" }, v.text), copyBtn(v.text, "Copy"))))
              : null,
          ),
        ),
      );
    }
    if (sec.assembly) panels.push(fold(sec.assembly.title.replace(/\s*\(.*$/, "") || "Assembly", (/\(([^)]*)\)/.exec(sec.assembly.title) || [])[1] || "the edit", mdBlocks(sec.assembly.markdown)));
    if (sec.qa) {
      const checked = new Set(store.get(keyQa, []));
      const qaBody = pack.qa_items.length
        ? h(
            "div",
            { class: "qa-list" },
            pack.qa_items.map((t, i) => {
              const cb = h("input", { type: "checkbox", checked: checked.has(i) || null });
              cb.addEventListener("change", () => {
                if (cb.checked) checked.add(i);
                else checked.delete(i);
                store.set(keyQa, [...checked]);
              });
              return h("label", { class: "check qa-item" }, cb, h("span", { dir: "auto" }, mdInline(t)));
            }),
          )
        : mdBlocks(sec.qa.markdown);
      panels.push(fold("QA before posting", "tick each one before the ad goes live", qaBody));
    }
    for (const o of sec.other || []) panels.push(fold(o.title, null, mdBlocks(o.markdown)));

    const board = h(
      "section",
      { class: "view brief-board" },
      h("div", { class: "crumbs" }, h("a", { href: "#/briefs" }, icon("arrowLeft", "i-sm"), "All codes")),
      head,
      h("div", { class: "bb-bar" }, progress, colourRow),
      colourNote,
      scenesBox,
      h("div", { class: "section-title bb-more" }, "Pack reference"),
      h("div", { class: "bpanels" }, panels),
    );
    paintColours();
    paintProgress();
    paintScenes();

    // Colourways load after the board is up; any failure (503 while lib/products/colour.mjs is missing) keeps the picker hidden.
    if (baseSlug) {
      api(`/api/products/${encodeURIComponent(baseSlug)}/colourways`)
        .then((r) => {
          const items = (r?.items || []).filter((c) => c && c.slug);
          if (items.length < 2) return;
          S.colourways = items;
          colourRow.hidden = false;
          const saved = store.get(keyColour, null);
          if (saved && items.some((c) => c.slug === saved)) pickColour(saved);
          else paintColours();
        })
        .catch(() => {});
    }
    return board;
  }

  window.addEventListener("hashchange", route);
  loadTaxonomy();
  refreshStats(true).then(() => route());
})();
