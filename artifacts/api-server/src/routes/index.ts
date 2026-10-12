import { Router, type IRouter } from "express";
import healthRouter from "./health";
import dashboardRouter from "./dashboard";
import programsRouter from "./programs";
import businessesRouter from "./businesses";
import sessionsRouter from "./sessions";
import supportRouter from "./support";
import pitchesRouter from "./pitches";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dashboardRouter);
router.use(programsRouter);
router.use(businessesRouter);
router.use(sessionsRouter);
router.use(supportRouter);
router.use(pitchesRouter);

export default router;
