import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import router from "./routes";
import { processStripeWebhook } from "./lib/stripeWebhookHandler";
import { authSession } from "./middlewares/authSession";

const app: Express = express();

app.post(
  "/api/billing/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];
    if (!signature) {
      return res.status(400).json({ error: "Missing stripe-signature header" });
    }
    const sig = Array.isArray(signature) ? signature[0] : signature;
    try {
      if (!Buffer.isBuffer(req.body)) {
        console.error("Stripe webhook: req.body is not a Buffer");
        return res
          .status(500)
          .json({ error: "Webhook body must be raw Buffer" });
      }
      await processStripeWebhook(req.body as Buffer, sig);
      return res.status(200).json({ received: true });
    } catch (err: any) {
      console.error("Stripe webhook error:", err.message);
      return res
        .status(400)
        .json({ error: `Webhook processing failed: ${err.message}` });
    }
  }
);

app.use(cors());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV === "development") {
  app.post("/api/internal/test-build", async (req, res) => {
    try {
      const { startBuild } = await import("./lib/agents/execution-engine");
      const { projectId, userId, prompt } = req.body;
      console.log("[TEST-BUILD] Starting:", projectId);
      const buildId = await startBuild(projectId, userId, prompt);
      console.log("[TEST-BUILD] Build ID:", buildId);
      res.json({ buildId, status: "started" });
    } catch (err: any) {
      console.error("[TEST-BUILD] Error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });
}

app.use(authSession);

app.use("/api", router);

export default app;
