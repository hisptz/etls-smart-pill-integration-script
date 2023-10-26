import { WEB_APP_DATASTORE_KEY } from "../constants";
import dhis2Client from "../clients/dhis2";
import logger from "../logging";
import { filter, map } from "lodash";

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
  const { deviceEmeiList } = await getDataStoreSettings();
  return deviceEmeiList
    ? map(
        filter(deviceEmeiList, ({ inUse }) => inUse),
        ({ code }) => code
      )
    : [];
}
