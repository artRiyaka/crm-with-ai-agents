/* Agent runners. Each one takes raw workspace state and returns a run record. */
(function () {
  const ENRICH = {
    c6: {
      industry: "Publishing",
      size: "15–30",
      region: "Ireland",
      context: "Independent press. Small team, slow seasons, cares about craft more than volume.",
    },
    c11: {
      industry: "Food",
      size: "60–100",
      region: "Pacific Northwest",
      context: "Regional buyer. Wants a first offer that a kitchen team can understand in one sitting.",
    },
  };

  function money(n) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(n || 0);
  }

  function uid(prefix) {
    return prefix + "-" + Math.random().toString(36).slice(2, 8);
  }

  function sum(list) {
    return list.reduce((total, item) => total + (item.value || 0), 0);
  }

  function stageLabel(state, id) {
    const stage = state.stages.find((item) => item.id === id);
    return stage ? stage.label : id;
  }

  function ownerName(state, id) {
    const owner = state.owners.find((item) => item.id === id);
    return owner ? owner.name : "Unassigned";
  }

  function loadFor(state, ownerId) {
    return state.contacts.filter((item) => item.ownerId === ownerId && item.stage !== "won").length;
  }

  function touches(state, contactId) {
    return state.activities.filter((item) => item.contactId === contactId).length;
  }

  function scoreContact(state, contact) {
    let score = 28;
    const reasons = [];

    if (contact.value >= 50000) {
      score += 22;
      reasons.push("Large engagement");
    } else if (contact.value >= 25000) {
      score += 14;
      reasons.push("Solid deal size");
    } else {
      score += 6;
    }

    const stagePoints = { new: 4, qualified: 12, proposal: 18, negotiation: 20, won: 10 };
    score += stagePoints[contact.stage] || 0;
    if (contact.stage === "proposal" || contact.stage === "negotiation") reasons.push("Offer in motion");
    if (contact.stage === "won") reasons.push("Closed");

    if (contact.lastTouchDays <= 2) {
      score += 16;
      reasons.push("Recent conversation");
    } else if (contact.lastTouchDays <= 5) {
      score += 8;
      reasons.push("Active thread");
    } else {
      score -= 12;
      reasons.push("Going quiet");
    }

    score += Math.min(12, touches(state, contact.id) * 3);
    if (contact.enriched) score += 6;
    else reasons.push("Thin context");
    if (!contact.ownerId) {
      score -= 6;
      reasons.push("No owner");
    }

    return {
      score: Math.max(8, Math.min(97, score)),
      why: reasons.slice(0, 3).join(" · "),
    };
  }

  function pickTargets(state, contactId) {
    if (!contactId || contactId === "all") return state.contacts.slice();
    const one = state.contacts.find((item) => item.id === contactId);
    return one ? [one] : [];
  }

  function log(state, agentId, summary, details) {
    const run = {
      id: uid("r"),
      agentId,
      label: "Just now",
      summary,
      details,
    };
    state.runs.unshift(run);
    state.runs = state.runs.slice(0, 12);
    return run;
  }

  function runScore(state, payload) {
    const targets = pickTargets(state, payload.contactId);
    targets.forEach((contact) => {
      const next = scoreContact(state, contact);
      contact.score = next.score;
      contact.why = next.why;
    });
    const top = targets.slice().sort((a, b) => b.score - a.score)[0];
    const summary = top
      ? "Scored " + targets.length + " " + (targets.length === 1 ? "person" : "people") + ". Strongest is " + top.name + " at " + top.score + "."
      : "No one to score.";
    return log(
      state,
      "score",
      summary,
      targets
        .slice()
        .sort((a, b) => b.score - a.score)
        .map((contact) => ({
          title: contact.name + " · " + contact.score,
          body: contact.why,
        }))
    );
  }

  function runEnrich(state, payload) {
    const targets = pickTargets(state, payload.contactId);
    const details = [];
    let filled = 0;
    targets.forEach((contact) => {
      const known = ENRICH[contact.id] || {};
      const missing = !contact.enriched || !contact.industry || !contact.context;
      if (!missing) {
        details.push({ title: contact.name, body: "Context already in place." });
        return;
      }
      contact.industry = contact.industry || known.industry || "Independent practice";
      contact.size = contact.size || known.size || "10–40";
      contact.region = contact.region || known.region || contact.city;
      contact.context =
        contact.context ||
        known.context ||
        contact.name.split(" ")[0] +
          " is " +
          (contact.role ? "a " + contact.role.toLowerCase() : "the lead") +
          " at " +
          contact.company +
          ". A first conversation should stay concrete and short.";
      contact.enriched = true;
      const next = scoreContact(state, contact);
      contact.score = next.score;
      contact.why = next.why;
      filled += 1;
      details.push({
        title: contact.name + " · " + contact.company,
        body: contact.industry + " · " + contact.size + " · " + contact.region + ". " + contact.context,
      });
    });
    const summary = filled
      ? "Enriched " + filled + " " + (filled === 1 ? "record" : "records") + " with company context."
      : "Every selected record already had context.";
    return log(state, "enrich", summary, details);
  }

  function briefFor(contact) {
    const first = contact.name.split(" ")[0];
    const open = {
      new: "Open lightly. Reference " + contact.city + " and ask what " + first + " wants from the next quarter.",
      qualified: "Pick up the last conversation and offer one clear next step a " + contact.role.toLowerCase() + " can accept.",
      proposal: "Stay concrete: the outcome, the start, and a time to review the offer together.",
      negotiation: "Name the open point and propose a simple way to close the " + money(contact.value) + " engagement.",
      won: "Thank them and outline the first week so the work feels already in motion.",
    }[contact.stage];
    const context = contact.context || contact.notes || "Keep the ask to a single next step.";
    return first + " — " + contact.role + " at " + contact.company + ".\n\n" + open + "\n\n" + context;
  }

  function runPersonalize(state, payload) {
    const targets = pickTargets(state, payload.contactId);
    const details = targets.map((contact) => {
      contact.brief = briefFor(contact);
      return { title: contact.name, body: contact.brief };
    });
    const summary = targets.length
      ? "Drafted " + targets.length + " outreach " + (targets.length === 1 ? "brief" : "briefs") + "."
      : "No one selected.";
    return log(state, "personalize", summary, details);
  }

  function runFollowup(state, payload) {
    const targets = pickTargets(state, payload.contactId).filter((contact) => {
      if (contact.stage === "won") return false;
      if (payload.contactId && payload.contactId !== "all") return true;
      return contact.lastTouchDays >= 5;
    });
    const details = [];
    targets.forEach((contact) => {
      const already = state.activities.some(
        (item) => item.contactId === contact.id && item.type === "task" && item.daysAgo === 0 && item.text.indexOf("Follow up with") === 0
      );
      if (already) {
        details.push({ title: contact.name, body: "A follow-up task is already on today." });
        return;
      }
      const when = contact.lastTouchDays >= 7 ? "today" : contact.lastTouchDays >= 3 ? "tomorrow" : "in three days";
      const text =
        "Follow up with " +
        contact.name +
        " " +
        when +
        ". " +
        (contact.lastTouchDays >= 7 ? "The thread has gone quiet." : "Keep the current stage moving.");
      state.activities.unshift({
        id: uid("a"),
        contactId: contact.id,
        type: "task",
        text,
        daysAgo: 0,
        actor: "Follow-up agent",
      });
      contact.nextStep = text;
      details.push({ title: contact.name + " · " + when, body: text });
    });
    const created = details.filter((item) => item.body.indexOf("already") === -1).length;
    const summary = created
      ? "Scheduled " + created + " follow-up " + (created === 1 ? "task" : "tasks") + "."
      : "No new follow-ups were needed.";
    return log(state, "followup", summary, details.length ? details : [{ title: "Quiet book", body: "Nothing is stale enough to nudge." }]);
  }

function runAssign(state, payload) {
  const details = [];

  function lightest() {
    return state.owners
      .slice()
      .sort((a, b) => loadFor(state, a.id) - loadFor(state, b.id) || a.name.localeCompare(b.name))[0];
  }

  function place(contact) {
    const nextOwner = lightest();
    if (!nextOwner || contact.ownerId === nextOwner.id) {
      details.push({
        title: contact.name,
        body: "Stays with " + ownerName(state, contact.ownerId) + ".",
      });
      return false;
    }
    const previous = ownerName(state, contact.ownerId);
    contact.ownerId = nextOwner.id;
    const scored = scoreContact(state, contact);
    contact.score = scored.score;
    contact.why = scored.why;
    details.push({
      title: contact.name,
      body: previous + " → " + nextOwner.name + ".",
    });
    state.activities.unshift({
      id: uid("a"),
      contactId: contact.id,
      type: "note",
      text: "Assignment agent placed this with " + nextOwner.name + ".",
      daysAgo: 0,
      actor: "Assignment agent",
    });
    return true;
  }

  const single = payload.contactId && payload.contactId !== "all";
  if (single) {
    const contact = state.contacts.find((item) => item.id === payload.contactId);
    if (!contact) return log(state, "assign", "No one selected.", []);
    if (contact.stage === "won") {
      return log(state, "assign", contact.name + " is already closed.", [
        { title: contact.name, body: "Closed work stays with " + ownerName(state, contact.ownerId) + "." },
      ]);
    }
    const light = lightest();
    const gap = contact.ownerId ? loadFor(state, contact.ownerId) - loadFor(state, light.id) : 99;
    if (!contact.ownerId || (contact.ownerId !== light.id && gap >= 2)) place(contact);
    else {
      details.push({
        title: contact.name,
        body: "Already with " + ownerName(state, contact.ownerId) + ", and the books are close enough.",
      });
    }
  } else {
    const unowned = state.contacts.filter((item) => !item.ownerId && item.stage !== "won");
    if (unowned.length) {
      unowned.forEach(place);
    } else {
      let guard = 0;
      while (guard < 3) {
        const ranked = state.owners
          .slice()
          .sort((a, b) => loadFor(state, b.id) - loadFor(state, a.id));
        const busy = ranked[0];
        const light = lightest();
        if (!busy || !light || loadFor(state, busy.id) - loadFor(state, light.id) < 2) break;
        const candidate = state.contacts.find((item) => item.ownerId === busy.id && item.stage !== "won");
        if (!candidate) break;
        place(candidate);
        guard += 1;
      }
      if (!details.length) {
        details.push({ title: "Team", body: "Books are already within one of each other." });
      }
    }
  }

  const moved = details.filter((item) => item.body.indexOf("→") !== -1).length;
  const summary = moved
    ? "Updated " + moved + " " + (moved === 1 ? "assignment" : "assignments") + "."
    : "Ownership already matches the team load.";
  return log(state, "assign", summary, details);
}

  function narrate(state) {
    const open = state.contacts.filter((item) => item.stage !== "won");
    const won = state.contacts.filter((item) => item.stage === "won");
    const openValue = sum(open);
    const wonValue = sum(won);
    const avg = state.contacts.length
      ? Math.round(state.contacts.reduce((total, item) => total + (item.score || 0), 0) / state.contacts.length)
      : 0;
    const quiet = open.filter((item) => item.lastTouchDays >= 7).sort((a, b) => b.lastTouchDays - a.lastTouchDays);
    const top = open.slice().sort((a, b) => b.score - a.score)[0];
    const headline = quiet.length
      ? quiet.length + " open " + (quiet.length === 1 ? "relationship has" : "relationships have") + " gone quiet."
      : "Every open relationship has been touched this week.";
    const names = quiet.slice(0, 2).map((item) => item.name).join(" and ");
    const body =
      "Open pipeline is " +
      money(openValue) +
      " across " +
      open.length +
      " people. " +
      won.length +
      " closed for " +
      money(wonValue) +
      ". Average priority is " +
      avg +
      ". " +
      (top ? top.name + " at " + top.company + " is the strongest open thread (" + top.score + "). " : "") +
      (quiet.length ? "Start with " + names + "." : "Keep the current cadence.");

    return {
      headline,
      body,
      openValue,
      wonValue,
      avg,
      quiet: quiet.length,
      funnel: state.stages.map((stage) => {
        const rows = state.contacts.filter((item) => item.stage === stage.id);
        return { id: stage.id, label: stage.label, count: rows.length, value: sum(rows) };
      }),
      owners: state.owners.map((owner) => ({
        id: owner.id,
        name: owner.name,
        role: owner.role,
        load: loadFor(state, owner.id),
      })),
      buckets: [
        { label: "High · 75+", count: state.contacts.filter((item) => item.score >= 75).length },
        { label: "Mid · 50–74", count: state.contacts.filter((item) => item.score >= 50 && item.score < 75).length },
        { label: "Low · under 50", count: state.contacts.filter((item) => item.score < 50).length },
      ],
    };
  }

  function runReport(state) {
    const report = narrate(state);
    return log(state, "report", report.headline + " " + report.body, [
      { title: "Open pipeline", body: money(report.openValue) },
      { title: "Won", body: money(report.wonValue) },
      { title: "Average priority", body: String(report.avg) },
      { title: "Quiet threads", body: String(report.quiet) },
    ]);
  }

  const runners = {
    score: runScore,
    enrich: runEnrich,
    personalize: runPersonalize,
    followup: runFollowup,
    assign: runAssign,
    report: runReport,
  };

  function run(agentId, state, payload) {
    const fn = runners[agentId];
    if (!fn) {
      const error = new Error("Unknown agent");
      error.code = "unknown_agent";
      throw error;
    }
    return fn(state, payload || {});
  }

  window.VellumAgents = { run, narrate, scoreContact };
})();
