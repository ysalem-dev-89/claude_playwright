import "dotenv/config";
import path from "node:path";
import express from "express";
import { sampleProfile } from "./sampleProfile";
import { runApplication } from "./automation/runApplication";
import { ApplyRequest, RunEvent } from "./types";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());
app.use(express.static(path.resolve(process.cwd(), "public")));

app.get("/api/sample-profile", (_req, res) => {
  res.json(sampleProfile);
});

app.get("/api/ai-available", (_req, res) => {
  res.json({ available: Boolean(process.env.ANTHROPIC_API_KEY) });
});

app.post("/api/apply", async (req, res) => {
  const body = req.body as Partial<ApplyRequest>;
  if (!body.profile || !body.strategy) {
    res.status(400).json({ error: "Request body must include { profile, strategy }." });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "application/x-ndjson",
    "Cache-Control": "no-cache",
    "Transfer-Encoding": "chunked",
  });

  const emit = (event: RunEvent) => {
    res.write(JSON.stringify(event) + "\n");
  };

  const baseUrl = `${req.protocol}://${req.get("host")}`;
  await runApplication(body.profile, body.strategy, baseUrl, emit);
  res.end();
});

app.listen(PORT, () => {
  console.log(`Greenhouse apply demo running at http://localhost:${PORT}`);
});
