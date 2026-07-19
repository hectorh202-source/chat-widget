# Chat Widget Service

An embeddable AI website chat widget for home-services businesses. It engages a
site visitor, looks up their history, qualifies them, and either books a job or
forwards a lead — all by talking to the **Voice Agents dashboard** over HTTP.
The dashboard owns all per-business config and data; this service owns the AI
conversation, the widget UI, and conversation storage.

## How it fits together

```
Client site ──embed.js──▶ iframe ──▶ this service ──HTTP──▶ dashboard
                                        (Claude engine,        (config, ServiceTitan,
                                         widget UI,             Leads inbox)
                                         conversation DB)
```

Per turn, the service calls the dashboard:
- `GET /api/widget-service/businesses/:id/config` (`X-Widget-Service-Secret`) — fetches the business's Anthropic key, branding, allowed origins, booking mode, and the tool/lead secrets.
- `POST /b/:id/tools/{lookup-customer,check-availability,create-lead,book-job}` (`X-Tool-Secret`) — the ServiceTitan actions.
- `POST /b/:id/webhooks/leads/inbound` (`X-Lead-Intake-Secret`) — drops the finished lead + transcript into the dashboard's Leads inbox.

## Setup

1. In the dashboard's **Admin Settings → Chat Widget Service**, generate a service secret and set the widget-service base URL (this service's public URL).
2. Copy `.env.example` to `.env` and fill in:
   - `DASHBOARD_URL` — the dashboard's base URL.
   - `WIDGET_SERVICE_SECRET` — the secret from step 1.
   - `PORT`, `DATABASE_PATH` as needed.
   - `ENCRYPTION_KEY` (optional, recommended in production) — 64 hex chars.
3. Configure each business's widget (enable, Anthropic key, branding, allowed domains) in the dashboard's per-business **Chat Widget** settings, and add the client's domain to the allowlist.
4. Paste the install snippet (shown on the dashboard's Chat Widget settings page) on the client's site.

## Run

```sh
npm install
npm run dev     # tsx watch on $PORT
# or
npm run build && npm start
```

## Notes

- Requires a Node version with `node:sqlite` (Node 22+).
- Every per-business customer credential lives in the dashboard's encrypted
  store, fetched at runtime — this service only holds the two bootstrap values
  above.
