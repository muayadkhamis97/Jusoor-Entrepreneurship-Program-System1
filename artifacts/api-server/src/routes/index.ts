import { Router, type IRouter } from "express";
import dashboardRouter from "./dashboard";
import programsRouter from "./programs";
import businessesRouter from "./businesses";
import sessionsRouter from "./sessions";
import supportRouter from "./support";
import pitchesRouter from "./pitches";
import staffRouter from "./staff";
import applicationsRouter from "./applications";
import communicationsRouter from "./communications";
import analyticsRouter from "./analytics";
import { requireOperationsStaff } from "../middlewares/staffAccess";

const router: IRouter = Router();

router.use(staffRouter);
router.use(requireOperationsStaff);
router.use(applicationsRouter);
router.use(communicationsRouter);
router.use(analyticsRouter);
router.use(dashboardRouter);
router.use(programsRouter);
router.use(businessesRouter);
router.use(sessionsRouter);
router.use(supportRouter);
router.use(pitchesRouter);

export default router;
