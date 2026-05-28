import express from "express";

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT ?? 8787);

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "unbnd-api", time: new Date().toISOString() });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`unbnd-api listening on :${PORT}`);
});
