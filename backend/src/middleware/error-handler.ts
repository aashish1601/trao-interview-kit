import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../domain/errors.js";

export const notFoundHandler: RequestHandler = (_request, response) => {
  response.status(404).json({ error: { code: "NOT_FOUND", message: "This endpoint does not exist." } });
};

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof AppError) {
    response.status(error.statusCode).json({ error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) } });
    return;
  }
  if (error instanceof ZodError) {
    response.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Check the submitted information.", details: error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })) } });
    return;
  }
  if (typeof error === "object" && error && "code" in error && (error as { code?: number }).code === 11000) {
    response.status(409).json({ error: { code: "DUPLICATE", message: "This kit already exists." } });
    return;
  }
  const message = error instanceof Error ? error.message : "Unexpected server error.";
  console.error("Unhandled request error", { message });
  response.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } });
};
