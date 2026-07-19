import express from "express";
import { env } from "./config/env";
import "./db/index";
import { widgetRouter } from "./widget/router";

const app = express();

// Behind a reverse proxy in production (for correct req.ip in the rate limiter).
app.set("trust proxy", 1);

app.use(express.json({ limit: "1mb" }));

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

// The whole service is the widget, scoped by the dashboard's business id.
app.use("/b/:businessId/widget", widgetRouter);

app.listen(env.PORT, () => {
  console.log(`chat-widget service listening on port ${env.PORT} (dashboard: ${env.DASHBOARD_URL})`);
});
