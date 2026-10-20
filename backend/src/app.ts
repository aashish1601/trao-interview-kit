import express from "express";
import cors from "cors";
import helmet from "helmet";
import session from "express-session";
import MongoStore from "connect-mongo";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";
import { env } from "./config/env.js";
import { authRouter } from "./routes/auth.routes.js";
import { kitsRouter } from "./routes/kits.routes.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";

export function createApp() {
  const app = express();
  if (env.isProduction) app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  const allowedOrigins = env.frontendOrigins;
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const cleanOrigin = origin.replace(/\/+$/, "");
      if (allowedOrigins.includes("*") || allowedOrigins.includes(cleanOrigin) || (!env.isProduction && cleanOrigin.startsWith("http://localhost:"))) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-CSRF-Token"],
  }));
  app.use(express.json({ limit: "5mb", strict: true }));
  app.use(rateLimit({ windowMs: 60_000, limit: 180, standardHeaders: true, legacyHeaders: false }));
  app.use(session({
    name: env.SESSION_COOKIE_NAME,
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    store: MongoStore.create({ mongoUrl: env.MONGODB_URI, ttl: env.SESSION_TTL_DAYS * 24 * 60 * 60, autoRemove: "native" }),
    cookie: {
      httpOnly: true,
      secure: env.cookieSecure,
      sameSite: env.cookieSameSite,
      maxAge: env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
      path: "/",
    },
  }));
  app.get("/api/health", (_request, response) => {
    const connected = mongoose.connection.readyState === 1;
    response.status(connected ? 200 : 503).json({ status: connected ? "ok" : "unavailable", database: connected ? "connected" : "disconnected", timestamp: new Date().toISOString() });
  });
  app.use("/api/auth", authRouter);
  app.use("/api/kits", kitsRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
