import type { ErrorRequestHandler } from "express";
import { JudgingFormError } from "../lib/judgingForms";

export const judgingFormErrors: ErrorRequestHandler = (error, req, res, _next) => {
  if (error instanceof JudgingFormError) {
    if (error.status === 429) res.set("Retry-After", "600");
    res.status(error.status).json({ error: error.message }); return;
  }
  const code = error?.cause?.code ?? error?.code;
  if (code === "42P01") {
    res.status(503).json({ error: "Judging forms need the program data update before they can be used." }); return;
  }
  // Do not log tokens, submission bodies, judge contact details or SQL bindings.
  req.log?.error({ event: "judging_form_request_failed", code: typeof code === "string" ? code : undefined }, "Judging form request failed");
  res.status(500).json({ error: "The judging form request could not be completed. Try again." });
};
