import { Duration } from "../types";
import logger from "../logging";

export async function startIntegrationProcess({
  startDate,
  endDate,
}: Duration): Promise<void> {
  logger.info(
    `Started integtration with WisePill API ${
      startDate ? "from " + startDate : ""
    } ${endDate ? "up to " + endDate : ""}`.trim()
  );
}
