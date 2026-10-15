import express, { type Express, type RequestHandler } from "express";
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
import googleCalendarOAuthRouter from "./routes/googleCalendarOAuth";
import emailSenderRouter from "./routes/emailSender";
import zoomRouter from "./routes/zoom";
import judgeRouter from "./routes/judge";
import coursesRouter from "./routes/courses";
import {
  participantCourseDiscussionRouter,
  staffCourseDiscussionRouter,
} from "./routes/courseDiscussions";
import {
  participantCourseQuizRouter,
  staffCourseQuizRouter,
} from "./routes/courseQuizzes";
import { participantCoursePackageRouter } from "./routes/coursePackages";
import {
  participantCourseProgressRouter,
  publicCertificateVerificationRouter,
  staffLearningProgressRouter,
} from "./routes/courseProgress";
import xapiRouter from "./routes/xapi";
import {
  participantSessionInteractionsRouter,
  staffSessionInteractionsRouter,
} from "./routes/sessionInteractions";
import profilesRouter from "./routes/profiles";
import participantProfileRouter from "./routes/participantProfile";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import { requireStaff } from "./middlewares/staffAccess";
import { requireParticipant } from "./middlewares/participantAccess";
import { requireRole } from "./middlewares/requireRole";
import { logger } from "./lib/logger";
import programBrandingRouter from "./routes/programBranding";
import externalIntegrationApiRouter from "./routes/externalIntegrationApi";
import integrationApiKeysRouter from "./routes/integrationApiKeys";

export function createApp(options: {
  authenticationMiddleware?: RequestHandler;
  participantMiddleware?: RequestHandler;
} = {}): Express {
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

app.use(options.authenticationMiddleware ?? clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })));

app.use("/api", healthRouter);
app.use("/api", publicApplicationsRouter);
app.use("/api", programBrandingRouter);
app.use("/api/v1", externalIntegrationApiRouter);
app.use("/api", integrationApiKeysRouter);
const participantAccess = options.participantMiddleware ?? requireParticipant;
app.use("/api/participant/profile", participantAccess, participantProfileRouter);
 app.use("/api/participant", participantAccess, participantRouter);
app.use("/api/participant", participantAccess, participantSessionInteractionsRouter);
app.use("/api/participant/courses", participantAccess, participantCourseDiscussionRouter);
app.use("/api/participant/courses", participantAccess, participantCourseQuizRouter);
app.use("/api/participant/courses", participantAccess, participantCoursePackageRouter);
app.use("/api/participant/courses", participantAccess, participantCourseProgressRouter);
app.use("/api", publicCertificateVerificationRouter);
app.use("/api/courses", requireStaff, staffCourseDiscussionRouter);
app.use("/api/courses", requireStaff, staffCourseQuizRouter);
app.use("/api/courses", requireStaff, coursesRouter);
app.use("/api/mentor/calendly", calendlyOAuthRouter);
app.use("/api/mentor/google-calendar", googleCalendarOAuthRouter);
app.use("/api/email-sender", emailSenderRouter);
app.use("/api/zoom", zoomRouter);
app.use("/api/xapi", xapiRouter);
app.use("/api/trainer", requireStaff, requireRole("trainer"), trainerRouter);
app.use("/api/mentor", requireStaff, requireRole("mentor"), mentorRouter);
app.use("/api/judge", requireStaff, requireRole("judge"), judgeRouter);
app.use("/api", requireStaff, staffLearningProgressRouter);
app.use("/api", requireStaff, profilesRouter);
app.use("/api", requireStaff);
app.use("/api", staffSessionInteractionsRouter);
app.use("/api", router);

return app;
}

const app = createApp();
export default app;
