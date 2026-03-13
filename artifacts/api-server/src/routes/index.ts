import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import projectsRouter from "./projects";
import buildRouter from "./build";
import agentsRouter from "./agents";
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
import { requireAuth } from "../middlewares/authSession";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);

router.use(requireAuth);
router.use(projectsRouter);
router.use(buildRouter);
router.use(agentsRouter);
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

export default router;
