/* Router, global events, persona switcher, boot. */
(() => {
  "use strict";
  const L = window.L, esc = L.esc;
  const app = document.getElementById("app");
  const NAV_ALIAS = { client: "clients", meeting: "meetings", research: "meetings", invoice: "invoices" };

  try { L.ui.persona = localStorage.getItem("loud-persona") || "F1"; } catch { L.ui.persona = "F1"; }

  L.render = () => {
    const [route, ...args] = (location.hash.replace(/^#\/?/, "") || "dashboard").split("/").map(decodeURIComponent);
    L.after.length = 0;
    const view = L.views[route] || L.views.dashboard;
    app.innerHTML = view(...args);
    L.after.forEach((fn) => fn());
    const navKey = NAV_ALIAS[route] || route;
    document.querySelectorAll(".nav a").forEach((a) => a.classList.toggle("active", a.dataset.route === navKey));
    // badges
    const awaiting = L.state.invoices.filter((i) => i.status === "Awaiting approval").length;
    const mailbox = L.me().id === "F1" ? null : L.me().id;
    const unread = mailbox ? L.unread(mailbox) : L.unread("T1") + L.unread("T2");
    document.querySelector('[data-route="invoices"] .nav-badge').textContent = L.isFounder() && awaiting ? awaiting : "";
    document.querySelector('[data-route="mail"] .nav-badge').textContent = unread || "";
    document.querySelector('[data-route="mail"]').setAttribute("href", `#/mail/${mailbox || "T1"}`);
  };

  window.addEventListener("hashchange", () => { L.render(); window.scrollTo(0, 0); });

  app.addEventListener("click", (e) => {
    const sortEl = e.target.closest("[data-sort]");
    if (sortEl) {
      const k = sortEl.dataset.sort;
      L.ui.sort = { key: k, dir: L.ui.sort.key === k ? -L.ui.sort.dir : k === "name" || k === "renewal" ? 1 : -1 };
      return L.render();
    }
    const t = e.target.closest("[data-act]");
    if (!t || !L.actions[t.dataset.act]) return;
    if (t.tagName === "A" || t.type === "submit") e.preventDefault();
    L.actions[t.dataset.act](t, e);
  });
  // Top-bar buttons use the same action registry
  document.querySelector(".topbar").addEventListener("click", (e) => {
    const t = e.target.closest("[data-act]");
    if (t && L.actions[t.dataset.act]) L.actions[t.dataset.act](t, e);
  });

  app.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.f === "q") {
      L.ui.clientFilter.q = t.value;
      const pos = t.selectionStart;
      L.render();
      const s = app.querySelector('[data-f="q"]');
      s.focus(); s.setSelectionRange(pos, pos);
    }
  });
  app.addEventListener("change", (e) => { for (const h of L.changeHandlers) if (h(e.target)) return; });
  app.addEventListener("submit", (e) => {
    const form = e.target;
    for (const h of L.submitHandlers) if (h(form, e)) return;
    if (form.dataset.noteForm) {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      const cid = form.dataset.noteForm;
      L.state.activity.unshift({ id: L.nextId("A", L.state.activity), client_id: cid, date: L.TODAY, type: data.type, author: L.me().id, summary: data.summary.trim() });
      L.save("activity").then(L.render);
    }
  });

  // tooltip
  const tipEl = document.getElementById("tooltip");
  document.addEventListener("pointerover", (e) => {
    const t = e.target.closest("[data-tip]");
    if (!t) return (tipEl.hidden = true);
    tipEl.textContent = t.dataset.tip;
    tipEl.hidden = false;
  });
  document.addEventListener("pointermove", (e) => {
    if (tipEl.hidden) return;
    tipEl.style.left = `${Math.min(e.clientX + 12, window.innerWidth - tipEl.offsetWidth - 8)}px`;
    tipEl.style.top = `${e.clientY + 16}px`;
  });

  // theme
  try { const th = localStorage.getItem("loud-theme"); if (th) document.documentElement.dataset.theme = th; } catch { /* ignore */ }
  document.getElementById("theme-toggle").addEventListener("click", () => {
    const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("loud-theme", document.documentElement.dataset.theme); } catch { /* ignore */ }
  });

  // boot
  L.load().then(() => {
    const sel = document.getElementById("persona");
    sel.innerHTML = L.people.map((p) => `<option value="${p.id}"${p.id === L.ui.persona ? " selected" : ""}>${esc(p.name)} (${esc(p.id === "F1" ? "Founder" : p.role.split(" ")[0] === "Account" ? "Account Director" : "Content & PR")})</option>`).join("");
    sel.addEventListener("change", () => { L.ui.persona = sel.value; try { localStorage.setItem("loud-persona", sel.value); } catch { /* ignore */ } L.render(); });
    document.getElementById("demo-date").textContent = L.state.company.demo_today ? `Demo date: ${L.fmtLong(L.TODAY)}` : "";
    L.render();
  }).catch((err) => {
    app.innerHTML = `<section class="card"><h1>Can't reach the LOUD server</h1><p>Start it from the project folder with <code>npm start</code>, then open <a href="http://localhost:4321">http://localhost:4321</a>.</p><p class="small muted">${esc(err.message)}</p></section>`;
  });
})();
