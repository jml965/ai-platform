import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import projectsRouter from "./projects";
import buildRouter from "./build";
import agentsRouter from "./agents";
import tokensRouter from "./tokens";
import billingRouter from "./billing";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(projectsRouter);
router.use(buildRouter);
router.use(agentsRouter);
router.use(tokensRouter);
router.use(billingRouter);

export default router;
