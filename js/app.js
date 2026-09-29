(function () {
  const NAV = ["overview", "people", "pipeline", "activity", "agents", "reports"];
  const api = window.VellumApi.create(window.VellumApi.demo());
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const state = {
    view: "overview",
    query: "",
    stage: "all",
    scopeId: "all",
    agentId: "score",
    drawerId: null,
  };

  let booted = false;
  let busy = false;
  let toastTimer = 0;

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[ch]));
  }

  function money(n) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(n || 0);
  }

  function initials(name) {
    return String(name || "?")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
  }

  function hue(name) {
    let h = 0;
    for (const ch of String(name)) h = (h * 33 + ch.charCodeAt(0)) % 360;
    return h;
  }

  function avatar(name, large) {
    return '<span class="avatar ' + (large ? "lg" : "") + '" style="--h:' + hue(name) + '">' + esc(initials(name)) + "</span>";
  }

  function ring(score) {
    const tone = score >= 75 ? "" : score >= 50 ? "mid" : "low";
    return (
      '<span class="ring ' + tone + '"><svg viewBox="0 0 36 36" aria-hidden="true"><circle class="bg" cx="18" cy="18" r="15" pathLength="100"></circle><circle class="fg" cx="18" cy="18" r="15" pathLength="100" stroke-dasharray="' +
      score +
      ' 100"></circle></svg><b>' +
      score +
      "</b></span>"
    );
  }

  function stageOptions(data, selected) {
    return data.stages
      .map((stage) => '<option value="' + stage.id + '"' + (stage.id === selected ? " selected" : "") + ">" + esc(stage.label) + "</option>")
      .join("");
  }

  function matches(contact) {
    if (state.stage !== "all" && contact.stage !== state.stage) return false;
    const q = state.query.trim().toLowerCase();
    if (!q) return true;
    return [contact.name, contact.company, contact.role, contact.city, contact.industry, contact.ownerName]
      .join(" ")
      .toLowerCase()
      .includes(q);
  }

  function toast(message) {
    const node = document.getElementById("toast");
    node.textContent = message;
    node.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove("is-on"), 3200);
  }

  function setStatus(text) {
    const node = document.getElementById("agent-status");
    if (node) node.textContent = text;
  }

  function toggleMenu(force) {
    const sidebar = document.getElementById("sidebar");
    const scrim = document.getElementById("scrim");
    const open = typeof force === "boolean" ? force : !sidebar.classList.contains("is-open");
    sidebar.classList.toggle("is-open", open);
    scrim.hidden = !open;
  }

  function closeDrawer() {
    state.drawerId = null;
    const drawer = document.getElementById("drawer");
    drawer.hidden = true;
    document.getElementById("drawer-panel").innerHTML = "";
  }

  function closeModal() {
    document.getElementById("modal").hidden = true;
    document.getElementById("modal-card").innerHTML = "";
  }

  function openModal(html) {
    document.getElementById("modal-card").innerHTML = html;
    document.getElementById("modal").hidden = false;
  }

  function hydrate(data) {
    document.getElementById("who-name").textContent = data.session.name;
    document.getElementById("who-role").textContent = data.session.role + " · " + data.session.workspace;
    const face = document.getElementById("who-avatar");
    face.textContent = initials(data.session.name);
    face.style.setProperty("--h", hue(data.session.name));
    document.querySelectorAll("[data-nav]").forEach((el) => {
      el.classList.toggle("is-active", el.dataset.nav === state.view);
    });
  }

  function kpi(label, value, note) {
    return '<article class="card kpi rise"><span>' + esc(label) + "</span><strong>" + esc(value) + "</strong><em>" + esc(note) + "</em></article>";
  }

  function overview(data) {
    const report = data.report;
    const max = Math.max.apply(null, report.funnel.map((row) => row.value).concat(1));
    const openCount = data.contacts.filter((item) => item.stage !== "won").length;
    return (
      '<div class="view-head rise"><div><p class="eyebrow">' +
      esc(data.session.workspace) +
      '</p><h1>At a glance</h1></div><div class="view-actions"><button class="btn solid tiny" type="button" data-action="run-agent" data-agent="score">Score the book</button><button class="btn ghost tiny" type="button" data-action="run-agent" data-agent="report">Write brief</button></div></div>' +
      '<section class="kpis">' +
      kpi("Open pipeline", money(report.openValue), openCount + " open") +
      kpi("Won", money(report.wonValue), "Closed work") +
      kpi("Avg priority", String(report.avg), "Across the book") +
      kpi("Quiet threads", String(report.quiet), "No touch in 7 days") +
      "</section>" +
      '<div class="split"><section class="panel rise"><h2>Pipeline</h2>' +
      report.funnel
        .map((row) => {
          const width = Math.max(6, Math.round((row.value / max) * 100));
          return (
            '<div class="funnel-row"><span>' +
            esc(row.label) +
            '</span><div class="track"><span style="width:' +
            width +
            '%"></span></div><b>' +
            row.count +
            "</b></div>"
          );
        })
        .join("") +
      '<h2 style="margin-top:18px">Needs a look</h2>' +
      (data.attention.length
        ? data.attention
            .slice(0, 5)
            .map(
              (person) =>
                '<button class="attention-row" type="button" data-action="open" data-id="' +
                person.id +
                '">' +
                avatar(person.name) +
                '<span class="grow"><b>' +
                esc(person.name) +
                '</b><span class="sub">' +
                esc(person.company) +
                " · " +
                esc(person.touchLabel) +
                "</span></span>" +
                ring(person.score) +
                "</button>"
            )
            .join("")
        : '<p class="empty">Nothing is stale.</p>') +
      '</section><section class="panel rise"><p class="quote">' +
      esc(report.headline) +
      '</p><p class="lede">' +
      esc(report.body) +
      '</p><h2>Latest activity</h2><div class="timeline">' +
      data.activities
        .slice(0, 5)
        .map(
          (item) =>
            '<div class="activity-row"><span class="kind ' +
            item.type +
            '">' +
            esc(item.type.slice(0, 1)) +
            '</span><span class="grow"><b>' +
            esc(item.person) +
            '</b><span class="sub">' +
            esc(item.text) +
            '</span></span><span class="sub">' +
            esc(item.when) +
            "</span></div>"
        )
        .join("") +
      "</div></section></div>"
    );
  }

  function people(data) {
    const rows = data.contacts.filter(matches).slice().sort((a, b) => b.score - a.score);
    const chips = [{ id: "all", label: "All" }].concat(data.stages).map((stage) => {
      return (
        '<button class="chip' +
        (state.stage === stage.id ? " is-active" : "") +
        '" type="button" data-action="filter" data-stage="' +
        stage.id +
        '">' +
        esc(stage.label) +
        "</button>"
      );
    });
    return (
      '<div class="view-head rise"><div><p class="eyebrow">Relationships</p><h1>People</h1></div><div class="view-actions"><button class="btn solid tiny" type="button" data-action="add-person">Add person</button></div></div>' +
      '<div class="chips">' +
      chips.join("") +
      "</div>" +
      (rows.length
        ? '<div class="grid-cards">' +
          rows
            .map(
              (person) =>
                '<button class="person-card rise" type="button" data-action="open" data-id="' +
                person.id +
                '"><div class="card-top">' +
                avatar(person.name) +
                ring(person.score) +
                '</div><strong style="display:block;margin-top:12px">' +
                esc(person.name) +
                '</strong><span class="sub">' +
                esc(person.role) +
                " · " +
                esc(person.company) +
                '</span><div class="meta"><span class="pill stage-' +
                person.stage +
                '">' +
                esc(person.stageLabel) +
                '</span><span class="money">' +
                money(person.value) +
                '</span><span class="sub">' +
                esc(person.city || "—") +
                "</span></div></button>"
            )
            .join("") +
          "</div>"
        : '<p class="empty">No one matches that search.</p>')
    );
  }

  function pipeline(data) {
    const columns = data.stages
      .map((stage) => {
        const cards = data.contacts.filter((person) => person.stage === stage.id && matches(person));
        const total = cards.reduce((sum, person) => sum + person.value, 0);
        return (
          '<section class="column" data-drop="' +
          stage.id +
          '"><header><div><strong>' +
          esc(stage.label) +
          '</strong><span class="sub">' +
          esc(stage.hint) +
          " · " +
          money(total) +
          '</span></div><b>' +
          cards.length +
          "</b></header>" +
          (cards.length
            ? cards
                .map(
                  (person) =>
                    '<article class="deal" draggable="true" data-drag="' +
                    person.id +
                    '"><div class="deal-top"><button class="textlike" type="button" data-action="open" data-id="' +
                    person.id +
                    '">' +
                    esc(person.name) +
                    '</button>' +
                    ring(person.score) +
                    '</div><span class="sub">' +
                    esc(person.company) +
                    '</span><div class="meta"><span class="money">' +
                    money(person.value) +
                    '</span><select class="tiny-select" data-change="stage" data-id="' +
                    person.id +
                    '" aria-label="Move ' +
                    esc(person.name) +
                    '">' +
                    stageOptions(data, person.stage) +
                    "</select></div></article>"
                )
                .join("")
            : '<p class="empty">Nothing here</p>') +
          "</section>"
        );
      })
      .join("");
    return (
      '<div class="view-head rise"><div><p class="eyebrow">Deals</p><h1>Pipeline</h1></div><p class="sub">Drag a card, or use the stage control.</p></div><div class="board">' +
      columns +
      "</div>"
    );
  }

  function activity(data) {
    const options = data.contacts
      .map((person) => '<option value="' + person.id + '">' + esc(person.name) + "</option>")
      .join("");
    const rows = data.activities.filter((item) => {
      const q = state.query.trim().toLowerCase();
      if (!q) return true;
      return (item.person + " " + item.company + " " + item.text).toLowerCase().includes(q);
    });
    return (
      '<div class="view-head rise"><div><p class="eyebrow">Timeline</p><h1>Activity</h1></div></div>' +
      '<form class="composer" data-form="activity"><select name="contactId" aria-label="Person">' +
      options +
      '</select><select name="type" aria-label="Type"><option value="note">Note</option><option value="call">Call</option><option value="meeting">Meeting</option><option value="task">Task</option></select><input name="text" placeholder="What happened?" required /><button class="btn solid tiny" type="submit">Add</button></form>' +
      '<section class="panel"><div class="timeline">' +
      (rows.length
        ? rows
            .map(
              (item) =>
                '<button class="activity-row" type="button" data-action="open" data-id="' +
                item.contactId +
                '"><span class="kind ' +
                item.type +
                '">' +
                esc(item.type.slice(0, 1)) +
                '</span><span class="grow"><b>' +
                esc(item.person) +
                " · " +
                esc(item.type) +
                '</b><span class="sub">' +
                esc(item.text) +
                '</span><span class="sub">' +
                esc(item.actor) +
                "</span></span><span class=\"sub\">" +
                esc(item.when) +
                "</span></button>"
            )
            .join("")
        : '<p class="empty">No activity yet.</p>') +
      "</div></section>"
    );
  }

  function agents(data) {
    const selected = data.runs[0];
    const options =
      '<option value="all"' +
      (state.scopeId === "all" ? " selected" : "") +
      ">Entire workspace</option>" +
      data.contacts
        .map(
          (person) =>
            '<option value="' + person.id + '"' + (state.scopeId === person.id ? " selected" : "") + ">" + esc(person.name) + "</option>"
        )
        .join("");
    return (
      '<div class="view-head rise"><div><p class="eyebrow">Automation</p><h1>Agents</h1></div><div class="view-actions"><select id="scope" class="tiny-select" data-change="scope" aria-label="Scope">' +
      options +
      '</select><button class="btn solid tiny" type="button" data-action="run-agent" data-agent="' +
      state.agentId +
      '">Run selected</button></div></div><div class="agent-grid">' +
      data.agents
        .map(
          (agent) =>
            '<article class="agent-card' +
            (state.agentId === agent.id ? " is-active" : "") +
            '" data-action="pick-agent" data-agent="' +
            agent.id +
            '"><div class="agent-top"><strong>' +
            esc(agent.name) +
            '</strong><button class="btn tiny solid" type="button" data-action="run-agent" data-agent="' +
            agent.id +
            '">Run</button></div><p>' +
            esc(agent.blurb) +
            "</p></article>"
        )
        .join("") +
      '</div><section class="panel"><h2>Latest result</h2>' +
      (selected
        ? '<p class="lede">' +
          esc(selected.summary) +
          '</p><div class="run-list">' +
          (selected.details || [])
            .slice(0, 6)
            .map((item) => '<div class="run-item"><strong>' + esc(item.title) + "</strong><p>" + esc(item.body) + "</p></div>")
            .join("") +
          "</div><p class=\"sub\" style=\"margin-top:8px\">" +
          esc(selected.label || "") +
          "</p>"
        : '<p class="empty">Run an agent to see a result.</p>') +
      "</section>"
    );
  }

  function reports(data) {
    const report = data.report;
    const maxValue = Math.max.apply(null, report.funnel.map((row) => row.value).concat(1));
    const maxLoad = Math.max.apply(null, report.owners.map((row) => row.load).concat(1));
    const maxBucket = Math.max.apply(null, report.buckets.map((row) => row.count).concat(1));
    return (
      '<div class="view-head rise"><div><p class="eyebrow">Brief</p><h1>Reports</h1></div><button class="btn solid tiny" type="button" data-action="run-agent" data-agent="report">Refresh brief</button></div>' +
      '<div class="report-grid"><section class="panel brief rise"><p class="quote">' +
      esc(report.headline) +
      '</p><p class="lede">' +
      esc(report.body) +
      "</p></section><section class=\"panel rise\"><h2>Priority mix</h2>" +
      report.buckets
        .map((row) => {
          const width = Math.max(8, Math.round((row.count / maxBucket) * 100));
          return '<div class="bar-row"><span>' + esc(row.label) + '</span><div class="track copper"><span style="width:' + width + '%"></span></div><b>' + row.count + "</b></div>";
        })
        .join("") +
      "<h2 style=\"margin-top:16px\">Team load</h2>" +
      report.owners
        .map((row) => {
          const width = Math.max(8, Math.round((row.load / maxLoad) * 100));
          return '<div class="bar-row"><span>' + esc(row.name.split(" ")[0]) + '</span><div class="track ink"><span style="width:' + width + '%"></span></div><b>' + row.load + "</b></div>";
        })
        .join("") +
      "</section></div><section class=\"panel rise\" style=\"margin-top:14px\"><h2>By stage</h2>" +
      report.funnel
        .map((row) => {
          const width = Math.max(6, Math.round((row.value / maxValue) * 100));
          return '<div class="funnel-row"><span>' + esc(row.label) + '</span><div class="track"><span style="width:' + width + '%"></span></div><b>' + money(row.value) + "</b></div>";
        })
        .join("") +
      "</section>"
    );
  }

  const views = { overview, people, pipeline, activity, agents, reports };

  function drawerHtml(person, data) {
    const history = data.activities.filter((item) => item.contactId === person.id).slice(0, 4);
    const actions = [
      ["score", "Score"],
      ["enrich", "Enrich"],
      ["personalize", "Brief"],
      ["followup", "Follow up"],
      ["assign", "Assign"],
    ];
    return (
      '<div class="card-top"><div>' +
      avatar(person.name, true) +
      '</div><button class="close-x" type="button" data-action="close-drawer" aria-label="Close">✕</button></div>' +
      '<h2 style="font-family:var(--display);font-size:34px;font-weight:560;letter-spacing:-0.03em;margin:14px 0 4px">' +
      esc(person.name) +
      "</h2><p class=\"sub\">" +
      esc(person.role) +
      " · " +
      esc(person.company) +
      "</p><div class=\"meta\">" +
      ring(person.score) +
      '<span class="pill stage-' +
      person.stage +
      '">' +
      esc(person.stageLabel) +
      '</span><span class="money">' +
      money(person.value) +
      "</span></div><p class=\"lede\" style=\"margin-top:12px\">" +
      esc(person.why || "") +
      '</p><label class="field" style="margin-top:8px"><span>Stage</span><select data-change="stage" data-id="' +
      person.id +
      '">' +
      stageOptions(data, person.stage) +
      '</select></label><div class="chips">' +
      actions
        .map(
          (pair) =>
            '<button class="chip" type="button" data-action="run-agent" data-agent="' +
            pair[0] +
            '" data-id="' +
            person.id +
            '">' +
            pair[1] +
            "</button>"
        )
        .join("") +
      "</div><p><strong>Owner</strong> · " +
      esc(person.ownerName) +
      "</p><p class=\"sub\" style=\"margin-top:6px\">" +
      esc(person.city || "City unknown") +
      (person.region ? " · " + esc(person.region) : "") +
      (person.industry ? " · " + esc(person.industry) : "") +
      (person.size ? " · " + esc(person.size) : "") +
      "</p><p style=\"margin-top:12px;line-height:1.5\">" +
      esc(person.context || person.notes || "No context yet. Enrichment can fill this in.") +
      "</p>" +
      (person.brief
        ? '<div class="panel" style="margin-top:14px"><h2>Outreach brief</h2><p style="white-space:pre-wrap;line-height:1.5">' +
          esc(person.brief) +
          "</p></div>"
        : "") +
      '<form class="stack" data-form="note" style="margin-top:16px"><input name="text" placeholder="Add a note" required style="flex:1;border:1px solid var(--line);border-radius:12px;padding:11px 12px;background:#fff" /><button class="btn solid tiny" type="submit">Save</button></form>' +
      '<h2 style="margin-top:18px">Recent</h2>' +
      (history.length
        ? history
            .map(
              (item) =>
                '<div class="activity-row"><span class="kind ' +
                item.type +
                '">' +
                esc(item.type.slice(0, 1)) +
                '</span><span class="grow"><b>' +
                esc(item.type) +
                '</b><span class="sub">' +
                esc(item.text) +
                "</span></span></div>"
            )
            .join("")
        : '<p class="empty">No activity yet.</p>')
    );
  }

  function renderDrawer() {
    const data = api.snapshot();
    const person = data && data.contacts.find((item) => item.id === state.drawerId);
    if (!person) {
      closeDrawer();
      return;
    }
    document.getElementById("drawer-panel").innerHTML = drawerHtml(person, data);
    document.getElementById("drawer").hidden = false;
  }

  function paint(options) {
    const data = api.snapshot();
    if (!data) return;
    const animate = !options || options.animate !== false;
    const view = document.getElementById("view");
    view.innerHTML = views[state.view](data);
    hydrate(data);
    if (animate) {
      view.classList.remove("is-in");
      requestAnimationFrame(() => view.classList.add("is-in"));
    } else {
      view.classList.add("is-in");
    }
    if (state.drawerId) renderDrawer();
  }

  function navigate(view) {
    toggleMenu(false);
    if (!NAV.includes(view)) return;
    if (location.hash === "#" + view) {
      state.view = view;
      closeDrawer();
      paint({ animate: true });
      return;
    }
    location.hash = view;
  }

  async function call(method, path, body) {
    try {
      return await api.request(method, path, body);
    } catch (error) {
      toast(error.message || "Something went wrong");
      return null;
    }
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function playRunner(agent) {
    const runner = document.getElementById("runner");
    const card = document.getElementById("runner-card");
    runner.hidden = false;
    const steps = agent.steps || ["Working"];
    for (let index = 0; index < steps.length; index += 1) {
      card.innerHTML =
        '<p class="eyebrow">' +
        esc(agent.name) +
        '</p><ol class="steps">' +
        steps
          .map((step, stepIndex) => {
            const cls = stepIndex < index ? "is-done" : stepIndex === index ? "is-on" : "";
            return "<li class=\"" + cls + "\">" + esc(step) + "</li>";
          })
          .join("") +
        "</ol>";
      if (!reduce) await wait(420);
    }
  }

  async function executeAgent(agentId, contactId) {
    if (busy) return;
    const data = api.snapshot();
    const agent = data.agents.find((item) => item.id === agentId);
    if (!agent) return;
    busy = true;
    setStatus(agent.name + " is working");
    try {
      await playRunner(agent);
      const scope = contactId || state.scopeId || "all";
      const result = await call("POST", "/agents/" + agentId + "/run", { contactId: scope });
      document.getElementById("runner").hidden = true;
      if (!result) return;
      state.agentId = agentId;
      if (!contactId && state.view !== "agents") {
        state.view = "agents";
        if (location.hash !== "#agents") location.hash = "agents";
      }
      toast(result.run.summary);
      paint({ animate: false });
      setStatus("Agents ready");
    } finally {
      busy = false;
      const runner = document.getElementById("runner");
      runner.hidden = true;
      document.getElementById("runner-card").innerHTML = "";
      setStatus("Agents ready");
    }
  }

  function addPersonModal(data) {
    openModal(
      '<p class="eyebrow">New</p><h2 id="modal-title" style="font-family:var(--display);font-size:32px;font-weight:560;margin-bottom:12px">Add a person</h2><form data-form="create"><label class="field"><span>Name</span><input name="name" required /></label><label class="field"><span>Company</span><input name="company" required /></label><label class="field"><span>Role</span><input name="role" placeholder="Lead" /></label><label class="field"><span>City</span><input name="city" /></label><label class="field"><span>Value</span><input name="value" type="number" min="0" step="1000" value="10000" /></label><label class="field"><span>Stage</span><select name="stage">' +
        stageOptions(data, "new") +
        '</select></label><div class="view-actions"><button class="btn ghost tiny" type="button" data-action="close-modal">Cancel</button><button class="btn solid tiny" type="submit">Save</button></div></form>'
    );
  }

  function bind() {
    document.body.addEventListener("click", (event) => {
      const el = event.target.closest("[data-action]");
      if (!el) return;
      const action = el.dataset.action;
      if (action === "navigate") navigate(el.dataset.nav);
      if (action === "toggle-menu") toggleMenu();
      if (action === "close-menu") toggleMenu(false);
      if (action === "close-drawer") closeDrawer();
      if (action === "close-modal") closeModal();
      if (action === "open") {
        state.drawerId = el.dataset.id;
        renderDrawer();
      }
      if (action === "filter") {
        state.stage = el.dataset.stage;
        paint({ animate: false });
      }
      if (action === "pick-agent") {
        state.agentId = el.dataset.agent;
        paint({ animate: false });
      }
      if (action === "add-person") addPersonModal(api.snapshot());
      if (action === "run-agent") executeAgent(el.dataset.agent, el.dataset.id || "");
      if (action === "sign-out") signOut();
      if (action === "reset-demo") resetDemo();
    });

    document.body.addEventListener("change", async (event) => {
      const el = event.target.closest("[data-change]");
      if (!el) return;
      if (el.dataset.change === "scope") {
        state.scopeId = el.value;
        return;
      }
      if (el.dataset.change === "stage") {
        const result = await call("PATCH", "/contacts/" + el.dataset.id + "/stage", { stage: el.value });
        if (!result) return;
        toast("Stage updated");
        paint({ animate: false });
      }
    });

    document.body.addEventListener("submit", async (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (!form.dataset.form || form.dataset.form === "login") return;
      event.preventDefault();
      const body = Object.fromEntries(new FormData(form).entries());
      if (form.dataset.form === "create") {
        const result = await call("POST", "/contacts", body);
        if (!result) return;
        closeModal();
        toast("Person added");
        state.drawerId = result.contactId;
        paint({ animate: false });
      }
      if (form.dataset.form === "activity") {
        const result = await call("POST", "/activities", body);
        if (!result) return;
        form.reset();
        toast("Activity added");
        paint({ animate: false });
      }
      if (form.dataset.form === "note") {
        const result = await call("POST", "/activities", {
          contactId: state.drawerId,
          type: "note",
          text: body.text,
        });
        if (!result) return;
        toast("Note saved");
        paint({ animate: false });
      }
    });

    const view = document.getElementById("view");
    view.addEventListener("dragstart", (event) => {
      const card = event.target.closest("[data-drag]");
      if (!card || event.target.closest("select, button, input, textarea")) {
        event.preventDefault();
        return;
      }
      card.classList.add("is-dragging");
      event.dataTransfer.setData("text/plain", card.dataset.drag);
      event.dataTransfer.effectAllowed = "move";
    });
    view.addEventListener("dragend", (event) => {
      const card = event.target.closest("[data-drag]");
      if (card) card.classList.remove("is-dragging");
      document.querySelectorAll(".column.is-over").forEach((col) => col.classList.remove("is-over"));
    });
    view.addEventListener("dragover", (event) => {
      const column = event.target.closest("[data-drop]");
      if (!column) return;
      event.preventDefault();
      document.querySelectorAll(".column.is-over").forEach((col) => col.classList.remove("is-over"));
      column.classList.add("is-over");
    });
    view.addEventListener("drop", async (event) => {
      const column = event.target.closest("[data-drop]");
      if (!column) return;
      event.preventDefault();
      column.classList.remove("is-over");
      const id = event.dataTransfer.getData("text/plain");
      if (!id) return;
      const current = api.snapshot().contacts.find((item) => item.id === id);
      if (current && current.stage === column.dataset.drop) return;
      const result = await call("PATCH", "/contacts/" + id + "/stage", { stage: column.dataset.drop });
      if (!result) return;
      toast("Moved to " + (api.snapshot().stages.find((item) => item.id === column.dataset.drop)?.label || "stage"));
      paint({ animate: false });
    });

    document.getElementById("search").addEventListener("input", (event) => {
      state.query = event.target.value;
      if (state.query && state.view !== "people" && state.view !== "activity" && state.view !== "pipeline") {
        navigate("people");
        return;
      }
      paint({ animate: false });
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeDrawer();
        closeModal();
        toggleMenu(false);
        document.getElementById("runner").hidden = true;
      }
    });

    window.addEventListener("hashchange", () => {
      if (document.getElementById("app").hidden) return;
      const view = location.hash.slice(1);
      if (!NAV.includes(view) || view === state.view) return;
      state.view = view;
      closeDrawer();
      paint({ animate: true });
    });
  }

  async function resetDemo() {
    const result = await call("POST", "/demo/reset");
    if (!result) return;
    closeDrawer();
    closeModal();
    toast("Demo data restored");
    paint({ animate: true });
  }

  function signOut() {
    sessionStorage.removeItem("vellum.session");
    closeDrawer();
    closeModal();
    toggleMenu(false);
    const app = document.getElementById("app");
    app.classList.remove("is-on");
    app.hidden = true;
    const login = document.getElementById("login");
    login.classList.remove("is-leaving");
    login.hidden = false;
  }

  async function boot() {
    if (!booted) {
      await api.request("GET", "/workspace");
      booted = true;
      bind();
    }
    const view = location.hash.slice(1);
    state.view = NAV.includes(view) ? view : "overview";
    if (!NAV.includes(view)) history.replaceState(null, "", "#overview");
    const app = document.getElementById("app");
    app.hidden = false;
    requestAnimationFrame(() => app.classList.add("is-on"));
    paint({ animate: true });
  }

  document.querySelectorAll("#operator, #passcode").forEach((input) => {
    input.addEventListener("focus", () => input.removeAttribute("readonly"));
  });

  document.getElementById("login-form").addEventListener("submit", (event) => {
    event.preventDefault();
    sessionStorage.setItem("vellum.session", "1");
    const login = document.getElementById("login");
    const enter = () => {
      login.hidden = true;
      boot();
    };
    if (reduce) enter();
    else {
      login.classList.add("is-leaving");
      setTimeout(enter, 420);
    }
  });

  if (sessionStorage.getItem("vellum.session") === "1") {
    document.getElementById("login").hidden = true;
    boot();
  }
})();
