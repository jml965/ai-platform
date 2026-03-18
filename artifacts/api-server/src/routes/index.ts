import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import projectsRouter from "./projects";
import buildRouter from "./build";
import agentsRouter from "./agents";
import providersRouter from "./providers";
import tokensRouter from "./tokens";
import billingRouter from "./billing";
import teamsRouter from "./teams";
import qaRouter from "./qa";
import sandboxRouter from "./sandbox";
import monitoringRouter from "./monitoring";
import plannerRouter from "./planner";
import deploymentsRouter from "./deployments";
import domainsRouter from "./domains";
import notificationsRouter from "./notifications";
import snapshotsRouter from "./snapshots";
import templatesRouter from "./templates";
import pwaRouter from "./pwa";
import analyticsRouter from "./analytics";
import seoRouter from "./seo";
import pluginsRouter from "./plugins";
import translationsRouter from "./translations";
import chatRouter from "./chat";
import mediaProvidersRouter from "./media-providers";
import adminRouter from "./admin";
import strategicRouter from "./strategic";
import { requireAuth } from "../middlewares/authSession";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(analyticsRouter);

// AUTH TEMPORARILY DISABLED FOR DEVELOPMENT - RE-ENABLE BEFORE PRODUCTION
// router.use(requireAuth);
router.use((req, _res, next) => {
  if (!req.user) {
    (req as any).user = { id: "cfc4ba30-2c8a-4a78-8a95-78cc1fc2ec68", role: "admin", email: "jamal@oktamam.com" };
  }
  next();
});
router.use(projectsRouter);
router.use(buildRouter);
router.use(agentsRouter);
router.use(providersRouter);
router.use(tokensRouter);
router.use(billingRouter);
router.use(teamsRouter);
router.use(qaRouter);
router.use(sandboxRouter);
router.use(monitoringRouter);
router.use(plannerRouter);
router.use(deploymentsRouter);
router.use(domainsRouter);
router.use(notificationsRouter);
router.use(snapshotsRouter);
router.use(templatesRouter);
router.use(pwaRouter);
router.use(seoRouter);
router.use(pluginsRouter);
router.use(translationsRouter);
router.use(chatRouter);
router.use(mediaProvidersRouter);
router.use(adminRouter);
router.use(strategicRouter);

export default router;
