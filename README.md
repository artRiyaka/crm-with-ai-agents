# Vellum

A minimal CRM workspace: people, pipeline, activity, reports, and six agents that score, enrich, draft outreach, schedule follow-ups, assign owners, and write a brief.

Open `index.html` in a browser. There is no install step. Demo records live in this browser and can be restored with **Reset demo**.

The sign-in screen is already filled in. Continue to enter the workspace.

## What you can do

- Browse and search people, open a record, and add someone new
- Move deals across New, Qualified, Proposal, Negotiation, and Won
- Log notes, calls, meetings, and tasks
- Run agents on one person or the whole workspace
- Read a live brief of pipeline value, priority mix, and team load

## API seam

The screens never touch storage directly. They call `request(method, path, body)` in `js/api.js`.

Today a demo adapter answers those routes from local demo data. A later service can use the same routes and the same JSON shape, `{ ok, workspace, run? }`, by switching one line in `js/app.js`:

```js
const api = VellumApi.create(VellumApi.demo());
// later:
const api = VellumApi.create(VellumApi.http("https://your-service.example"));
```

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/workspace` | Snapshot for the screens |
| POST | `/session` | Enter the workspace |
| POST | `/contacts` | Add a person |
| PATCH | `/contacts/:id` | Update a person |
| PATCH | `/contacts/:id/stage` | Move a deal |
| POST | `/activities` | Log a note, call, meeting, or task |
| POST | `/agents/:id/run` | Run an agent. Body: `{ contactId }` or `{ contactId: "all" }` |
| POST | `/demo/reset` | Restore demo data |

## Agents

Runners live in `js/agents.js`. Add one by giving it an id, a short description, and a function with the same shape as the others: it receives workspace state and returns a run record.

| Id | What it does |
| --- | --- |
| `score` | Priority from 0–100 using deal size, stage, recency, and context |
| `enrich` | Fills industry, scale, region, and a buying note |
| `personalize` | Writes an outreach brief for the person and stage |
| `followup` | Creates a task when a thread has gone quiet |
| `assign` | Fills empty owners, then eases lopsided books |
| `report` | Writes the workspace brief |

## Layout

```
index.html      shell and sign-in
css/app.css     layout, motion, small screens
js/data.js      demo records
js/agents.js    agent runners
js/api.js       route adapter
js/app.js       screens
```
