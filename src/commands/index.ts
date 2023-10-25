import { Command } from "commander";
import { config } from "dotenv";
import express, { Express } from "express";
import logger from "../logging";
import { Duration } from "../types";
import swaggerUi from "swagger-ui-express";

import wisePillRoutes, { authenticate } from "../services/wise-pill-api.routes";
import { startIntegrationProcess } from "../services";
import swaggerJsdoc from "swagger-jsdoc";

const swaggerOptions = {
  definition: {
    openapi: "3.0.0", // OpenAPI version
    info: {
      title: "Wisepill and DHIS2 integration API Documentation",
      version: "1.0.0",
      description:
        "API documentation for the Integration API server for Wisepill and DHIS2",
    },
  },
  apis: ["./src/services/*.routes.ts"],
};

const swaggerSpecs = swaggerJsdoc(swaggerOptions);

config();
const program = new Command();

program
  .command("start-integration")
  .description("")
  .option(
    "-s --startDate <startDate>",
    "Start date for script coverage in DD-MM-YYYY"
  )
  .option(
    "-e --endDate <endDate>",
    "End date for script coverage in DD-MM-YYYY"
  )
  .action(async ({ startDate, endDate }: Duration) => {
    try {
      await startIntegrationProcess({ startDate, endDate });
    } catch (error: any) {
      logger.error(error.toString());
    }
  });

program
  .command("start-api-server")
  .description("Initialization of the server for Wisepill integration")
  .action(() => {
    const app: Express = express();
    app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpecs));
    const port = process.env.PORT ?? 3000;
    try {
      app.use(express.json());
      app.use(express.urlencoded({ extended: true }));

      if (process.env.SECRET_KEY) {
        app.use(authenticate);
      }

      app.use("/api", wisePillRoutes);

      app.listen(port, () => {
        logger.info(
          `⚡️[server]: Server is running at http://localhost:${port}`
        );
      });
    } catch (error: any) {
      logger.error(error.toString());
    }
  });
export default program;
