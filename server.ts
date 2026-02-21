import express from "express";
import { createServer as createViteServer } from "vite";
import cors from "cors";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // --- Webhook Logic ---
  // Store pending updates in memory for the client to poll
  // This acts as a bridge between the Webhook (Server) and the Client (Browser)
  const pendingUpdates: any[] = [];

  app.post("/api/telegram-webhook", (req, res) => {
    try {
      const update = req.body;
      console.log("--- Webhook Received ---", JSON.stringify(update, null, 2));
      
      if (update.message || update.channel_post) {
        pendingUpdates.push(update);
        // Keep only last 50 updates to prevent memory leak
        if (pendingUpdates.length > 50) pendingUpdates.shift();
      }
      
      res.status(200).send("OK");
    } catch (e) {
      console.error("Webhook Error:", e);
      res.status(200).send("OK"); // Always return 200 to Telegram
    }
  });

  // Client polls this endpoint to get updates received via Webhook
  app.get("/api/telegram-updates", (req, res) => {
    const updates = [...pendingUpdates];
    pendingUpdates.length = 0; // Clear after sending
    res.json(updates);
  });

  // --- End Webhook Logic ---

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // In production, serve static files (if built)
    // For this environment, we rely on Vite dev server mostly, but standard pattern:
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook URL: https://<YOUR_APP_URL>/api/telegram-webhook`);
  });
}

startServer();
