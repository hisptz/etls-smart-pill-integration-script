import { Command } from "commander";
import { config } from "dotenv";
import swaggerUi from "swagger-ui-express";
import swaggerJsdoc from "swagger-jsdoc";

import logger from "../logging";
import { Duration } from "../types";
import { startIntegrationProcess } from "../services";
import intergrationAPI from "../routes";

const swaggerOptions = {
  definition: {
    openapi: "3.0.0", // OpenAPI version
    info: {
      title: "Wisepill and DHIS2 integration API Documentation",
      version: "1.0.0",
      description:
        "API documentation for the Integration API server for Wisepill and DHIS2. This API exposes the required API by the DHIS2 app that manages the integration from the wisepill API specifications",
    },
  },
  apis: ["./**/*.routes.ts", "./**/*.routes.js"],
};

const swaggerSpecs = swaggerJsdoc(swaggerOptions);

config();
const program = new Command();

program
  .command("start-integration")
  .description("")
  .option(
    "-s --startDate <startDate>",
    "Start date for script coverage in YYYY-MM-DD",
  )
  .option(
    "-e --endDate <endDate>",
    "End date for script coverage in YYYY-MM-DD",
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
    const port = process.env.PORT ?? 3000;
    try {
      intergrationAPI.use(
        "/api-docs",
        swaggerUi.serve,
        swaggerUi.setup(swaggerSpecs),
      );
      intergrationAPI.listen(port, () => {
        logger.info(
          `⚡️[server]: Server is running at http://localhost:${port}`,
        );
      });
    } catch (error: any) {
      logger.error(error.toString());
    }
  });
export default program;
