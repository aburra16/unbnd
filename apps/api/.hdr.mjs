import WebSocket from "ws";
const LIB = "6aca05b812da97601151776d13de04ae71afc9d86da1408f0e72cffef72ece4b";
const ws = new WebSocket(process.argv[2] ?? "wss://dcosl.brainstorm.world");
const t = setTimeout(() => process.exit(0), 20000);
ws.on("open", () => ws.send(JSON.stringify(["REQ", "h", { kinds: [39998], authors: [LIB], "#d": ["books"] }])));
ws.on("message", (m) => { const msg = JSON.parse(m.toString());
  if (msg[0] === "EVENT") { const e = msg[2]; console.log(e.id, new Date(e.created_at * 1000).toISOString(), "tags:", e.tags.length); }
  if (msg[0] === "EOSE") { clearTimeout(t); ws.close(); } });
