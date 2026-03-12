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

export default router;
