import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import router from "./routes";
import healthRouter from "./routes/health";
import publicApplicationsRouter from "./routes/publicApplications";
import participantRouter from "./routes/participant";
import trainerRouter from "./routes/trainer";
import mentorRouter from "./routes/mentor";
import calendlyOAuthRouter from "./routes/calendlyOAuth";
import zoomRouter from "./routes/zoom";
import judgeRouter from "./routes/judge";
import coursesRouter from "./routes/courses";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import { requireStaff } from "./middlewares/staffAccess";
import { requireParticipant } from "./middlewares/participantAccess";
import { requireRole } from "./middlewares/requireRole";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(cors({ credentials: true, origin: true }));
app.use(express.json({
  verify: (req, _res, buffer) => {
    (req as typeof req & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
  },
}));
app.use(express.urlencoded({ extended: true }));

app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", healthRouter);
app.use("/api", publicApplicationsRouter);
app.use("/api/participant", requireParticipant, participantRouter);
app.use("/api/courses", requireStaff, coursesRouter);
app.use("/api/mentor/calendly", calendlyOAuthRouter);
app.use("/api/zoom", zoomRouter);
app.use("/api/trainer", requireStaff, requireRole("trainer"), trainerRouter);
app.use("/api/mentor", requireStaff, requireRole("mentor"), mentorRouter);
app.use("/api/judge", requireStaff, requireRole("judge"), judgeRouter);
app.use("/api", requireStaff);
app.use("/api", router);

export default app;
