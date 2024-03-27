import express, { Express } from "express";
import rateLimit from "express-rate-limit";
import cors from "cors";
import helmet from "helmet";

import logger from "../logging";
import { authenticate } from "../services";
import { wisePillRouter } from "./wise-pill-api.routes";

const apiServerRateLimiter = rateLimit({
  windowMs: 30 * 1000,
  limit: 100,
  message: {
    status: "429",
    message: "You have made too many requests, please try again later.",
  },
});

const intergrationAPI: Express = express();

try {
  intergrationAPI.use(cors());
  intergrationAPI.use(
    helmet.contentSecurityPolicy({
      useDefaults: true,
    }),
  );
  intergrationAPI.use(express.json());
  intergrationAPI.use(express.urlencoded({ extended: true }));
  intergrationAPI.use(apiServerRateLimiter);
  if (process.env.SECRET_KEY) {
    intergrationAPI.use(authenticate);
  }
  intergrationAPI.use("/api", wisePillRouter);
} catch (error: any) {
  logger.error(error.toString());
}

export default intergrationAPI;
