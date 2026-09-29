/*
 * API seam.
 * Screens call request(method, path, body). Today a demo adapter answers
 * from this browser. To point at a real service later, pass http(baseUrl)
 * instead — keep the same routes and the same JSON shape:
 *   { ok, workspace, run? }
 */
(function () {
  const KEY = "vellum.demo.v1";

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function ago(days) {
    if (days <= 0) return "Today";
    if (days === 1) return "Yesterday";
    return days + " days ago";
  }

  function uid(prefix) {
    return prefix + "-" + Math.random().toString(36).slice(2, 8);
  }

  function present(state) {
    const report = window.VellumAgents.narrate(state);
    const owners = state.owners.map((owner) => ({
      ...owner,
      load: state.contacts.filter((item) => item.ownerId === owner.id && item.stage !== "won").length,
    }));
    const contacts = state.contacts.map((contact) => ({
      ...contact,
      ownerName: owners.find((owner) => owner.id === contact.ownerId)?.name || "Unassigned",
      touchLabel: ago(contact.lastTouchDays),
      stageLabel: state.stages.find((stage) => stage.id === contact.stage)?.label || contact.stage,
    }));
    const attention = contacts
      .filter((item) => item.stage !== "won" && (item.lastTouchDays >= 7 || item.score < 45))
      .sort((a, b) => b.lastTouchDays - a.lastTouchDays || a.score - b.score);

    return {
      session: state.session,
      stages: state.stages,
      agents: state.agents,
      owners,
      contacts,
      activities: state.activities.map((item) => ({
        ...item,
        when: ago(item.daysAgo),
        person: contacts.find((contact) => contact.id === item.contactId)?.name || "Unknown",
        company: contacts.find((contact) => contact.id === item.contactId)?.company || "",
      })),
      runs: state.runs,
      report,
      attention,
    };
  }

  function createDemoAdapter() {
    let state = load();

    function load() {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) return JSON.parse(raw);
      } catch (error) {
        /* ignore broken demo cache */
      }
      return clone(window.VellumData.seed());
    }

    function save() {
      localStorage.setItem(KEY, JSON.stringify(state));
    }

    function ok(extra) {
      save();
      return Object.assign({ ok: true, workspace: present(state) }, extra || {});
    }

    function findContact(id) {
      const contact = state.contacts.find((item) => item.id === id);
      if (!contact) {
        const error = new Error("Person not found");
        error.code = "not_found";
        throw error;
      }
      return contact;
    }

    const routes = [
      {
        method: "GET",
        pattern: /^\/workspace$/,
        handle() {
          return ok();
        },
      },
      {
        method: "POST",
        pattern: /^\/session$/,
        handle() {
          return ok();
        },
      },
      {
        method: "POST",
        pattern: /^\/contacts$/,
        handle(_match, body) {
          const name = (body.name || "").trim();
          const company = (body.company || "").trim();
          if (!name || !company) {
            const error = new Error("Name and company are required");
            error.code = "invalid";
            throw error;
          }
          const contact = {
            id: uid("c"),
            name,
            company,
            role: (body.role || "Lead").trim(),
            city: (body.city || "").trim(),
            industry: "",
            size: "",
            region: "",
            context: "",
            stage: state.stages.some((item) => item.id === body.stage) ? body.stage : "new",
            value: Math.max(0, Number(body.value) || 0),
            score: 40,
            why: "Just added",
            ownerId: "",
            lastTouchDays: 0,
            notes: (body.notes || "").trim(),
            enriched: false,
            brief: "",
            tags: ["new"],
          };
          const scored = window.VellumAgents.scoreContact(state, contact);
          contact.score = scored.score;
          contact.why = scored.why;
          state.contacts.unshift(contact);
          state.activities.unshift({
            id: uid("a"),
            contactId: contact.id,
            type: "note",
            text: "Added to the workspace.",
            daysAgo: 0,
            actor: state.session.name,
          });
          return ok({ contactId: contact.id });
        },
      },
      {
        method: "PATCH",
        pattern: /^\/contacts\/([^/]+)$/,
        handle(match, body) {
          const contact = findContact(match[1]);
          ["role", "city", "notes", "ownerId"].forEach((key) => {
            if (body[key] !== undefined) contact[key] = body[key];
          });
          if (body.value !== undefined) contact.value = Math.max(0, Number(body.value) || 0);
          const scored = window.VellumAgents.scoreContact(state, contact);
          contact.score = scored.score;
          contact.why = scored.why;
          return ok();
        },
      },
      {
        method: "PATCH",
        pattern: /^\/contacts\/([^/]+)\/stage$/,
        handle(match, body) {
          const contact = findContact(match[1]);
          const next = body.stage;
          if (!state.stages.some((item) => item.id === next)) {
            const error = new Error("Unknown stage");
            error.code = "invalid";
            throw error;
          }
          if (contact.stage !== next) {
            const from = state.stages.find((item) => item.id === contact.stage)?.label || contact.stage;
            const to = state.stages.find((item) => item.id === next)?.label || next;
            contact.stage = next;
            contact.lastTouchDays = 0;
            state.activities.unshift({
              id: uid("a"),
              contactId: contact.id,
              type: "note",
              text: "Moved from " + from + " to " + to + ".",
              daysAgo: 0,
              actor: state.session.name,
            });
            const scored = window.VellumAgents.scoreContact(state, contact);
            contact.score = scored.score;
            contact.why = scored.why;
          }
          return ok();
        },
      },
      {
        method: "POST",
        pattern: /^\/activities$/,
        handle(_match, body) {
          const contact = findContact(body.contactId);
          const text = (body.text || "").trim();
          if (!text) {
            const error = new Error("Add a few words first");
            error.code = "invalid";
            throw error;
          }
          const type = ["note", "call", "meeting", "task"].includes(body.type) ? body.type : "note";
          state.activities.unshift({
            id: uid("a"),
            contactId: contact.id,
            type,
            text,
            daysAgo: 0,
            actor: state.session.name,
          });
          if (type !== "task") {
            contact.lastTouchDays = 0;
            const scored = window.VellumAgents.scoreContact(state, contact);
            contact.score = scored.score;
            contact.why = scored.why;
          }
          return ok();
        },
      },
      {
        method: "POST",
        pattern: /^\/agents\/([^/]+)\/run$/,
        handle(match, body) {
          const run = window.VellumAgents.run(match[1], state, { contactId: body.contactId || "all" });
          return ok({ run });
        },
      },
      {
        method: "POST",
        pattern: /^\/demo\/reset$/,
        handle() {
          state = clone(window.VellumData.seed());
          return ok();
        },
      },
    ];

    return {
      mode: "demo",
      async handle(method, path, body) {
        const route = routes.find((item) => item.method === method && item.pattern.test(path));
        if (!route) {
          const error = new Error("No route for " + method + " " + path);
          error.code = "not_found";
          throw error;
        }
        return route.handle(path.match(route.pattern), body || {});
      },
    };
  }

  function createHttpAdapter(baseUrl) {
    const root = String(baseUrl || "").replace(/\/$/, "");
    return {
      mode: "http",
      async handle(method, path, body) {
        const response = await fetch(root + path, {
          method,
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: method === "GET" ? undefined : JSON.stringify(body || {}),
        });
        if (!response.ok) {
          const error = new Error("Request failed");
          error.code = "http";
          throw error;
        }
        return response.json();
      },
    };
  }

  function createApi(adapter) {
    let cache = null;
    return {
      mode: adapter.mode,
      snapshot() {
        return cache;
      },
      async request(method, path, body) {
        const result = await adapter.handle(method, path, body);
        if (result && result.workspace) cache = result.workspace;
        return result;
      },
    };
  }

  window.VellumApi = {
    demo: createDemoAdapter,
    http: createHttpAdapter,
    create: createApi,
  };
})();
