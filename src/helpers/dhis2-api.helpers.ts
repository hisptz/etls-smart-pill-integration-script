import { WEB_APP_DATASTORE_KEY } from "../constants";
import dhis2Client from "../clients/dhis2";
import logger from "../logging";
import { filter, map, find, head } from "lodash";

async function getDataStoreSettings(): Promise<any> {
  const url = `dataStore/${WEB_APP_DATASTORE_KEY}/settings`;
  try {
    const { data } = await dhis2Client.get(url);
    return data;
  } catch (e: any) {
    logger.error(
      "Failed to fetch data store configurations. Check the logs below!"
    );
    logger.error(e.toString());
    return {};
  }
}

export async function getAssignedDevices(): Promise<string[]> {
  const { deviceIMEIList: devices } = await getDataStoreSettings();
  return devices
    ? map(
        filter(devices, ({ inUse }) => inUse),
        ({ code }) => code
      )
    : [];
}

export async function getProgramMapping(): Promise<any[]> {
  const { programMapping } = await getDataStoreSettings();
  return programMapping ?? [];
}

export function logImportSummary(response: any) {
  const { imported, updated, deleted, ignored, importSummaries } = response;
  if (imported || updated || deleted || ignored) {
    logger.info(
      `Here is the import summary: ${JSON.stringify({
        imported,
        deleted,
        updated,
        ignored,
      })}`
    );
  }

  if (ignored) {
    const latestImportSummary: any = find(
      importSummaries,
      ({ importCount }) => importCount.ignored
    );
    if (latestImportSummary) {
      const { description, conflicts } = latestImportSummary;
      if (description) {
        logger.error(description);
      } else if (conflicts) {
        const { object, value: message } = (head(conflicts) ?? {}) as Record<
          string,
          string
        >;
        logger.error(
          object && message
            ? `Conflicts at ${object} object: ${message}`
            : `Failed to evaluate import summary conflicts`
        );
      }
    }
  }
}

export function logSanitizedConflictsImportSummary(errorResponse: any): void {
  if (errorResponse.response) {
    const { response } = errorResponse.response.data;
    if (response) {
      logImportSummary(response);
    } else {
      logger.error(errorResponse.response);
    }
  } else {
    logger.error(errorResponse.message ?? errorResponse.toString());
  }
}
