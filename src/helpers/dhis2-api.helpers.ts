import {
  filter,
  map,
  find,
  head,
  chunk,
  forEach,
  flattenDeep,
  compact,
} from "lodash";
import { mapLimit, asyncify } from "async";
import {
  DEVICE_SIGNAL_DATA_ELEMENT,
  DOSAGE_TIME_DATA_ELEMENT,
  ENROLLMENT_SIGNAL,
  WEB_APP_DATASTORE_KEY,
} from "../constants";
import dhis2Client from "../clients/dhis2";
import logger from "../logging";
import { DateTime } from "luxon";
import { uid } from "@hisptz/dhis2-utils";

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

export async function getPatientDetailsFromDHIS2(
  patientId: string
): Promise<any | null> {
  try {
    const programMappings = await getProgramMapping();
    const trackedEntityInstance = head(
      compact(
        flattenDeep(
          await mapLimit(
            programMappings,
            5,
            asyncify(
              async ({
                program,
                programStage,
                attributes: mappedAttributes,
              }: any): Promise<any> => {
                const patientNumberAttribute =
                  mappedAttributes["patientNumber"];
                const episodeIdAttribute = mappedAttributes["episodeId"];

                const tei = head(
                  await getDhis2TrackedEntityInstancesByAttribute(
                    program,
                    [patientId],
                    patientNumberAttribute
                  )
                );

                if (!tei) {
                  return null;
                }

                const { attributes, trackedEntityInstance, orgUnit } = tei;
                const episodeId = find(
                  attributes,
                  ({ attribute }) => attribute === episodeIdAttribute
                )?.value;

                return {
                  program,
                  programStage,
                  trackedEntityInstance,
                  orgUnit,
                  patientId,
                  episodeId,
                };
              }
            )
          )
        )
      )
    ) as any | null;
    return trackedEntityInstance;
  } catch (error: any) {
    logger.warn(
      `Failed to fetch patient details with ${patientId} identification number`
    );
    logger.error(error.toString());
    return null;
  }
}

export async function updateDATEnrollmentStatus(
  patientNumber: string,
  trackedEntityInstance: string,
  program: string,
  programStage: string,
  orgUnit: string
): Promise<void> {
  try {
    const now = DateTime.now().toISO();
    const eventDate = DateTime.now().toFormat("yyyy-MM-dd");

    const event = {
      event: uid(),
      program,
      programStage,
      orgUnit,
      trackedEntityInstance,
      eventDate,
      status: "ACTIVE",
      dataValues: [
        {
          dataElement: DEVICE_SIGNAL_DATA_ELEMENT,
          value: ENROLLMENT_SIGNAL,
        },
        {
          dataElement: DOSAGE_TIME_DATA_ELEMENT,
          value: now ?? "",
        },
      ],
    };

    const url = `events?strategy=CREATE_AND_UPDATE`;
    const { status, data } = await dhis2Client.post(url, {
      events: [event],
    });

    if (status === 200) {
      const { response: importResponse } = data;
      const { imported } = importResponse;
      if (imported) {
        logger.info(
          `Successfully updated the DAT enrollment status for patient with ${patientNumber} identification`
        );
      } else {
        logger.warn(
          `Failed to update the DAT enrollment status for patient with ${patientNumber} identification number`
        );
        logImportSummary(importResponse);
      }
    } else {
      logger.warn(
        `There are errors in saving the DAT enrollment status for patient with ${patientNumber} identification number`
      );
      const { response: importResponse } = data;
      logImportSummary(importResponse);
    }
  } catch (error: any) {
    logger.warn(
      `Failed to assign the DAT enrollment status for patient with ${patientNumber} identification number`
    );
    logger.error(error.toString());
  }
}

export async function getDhis2TrackedEntityInstancesByAttribute(
  program: string,
  values: string[],
  attribute: string,
  loggerStatus = false
): Promise<Array<{ [key: string]: any }>> {
  logger.info(`Fetching DHIS2 tracked entity instances for ${program} program`);
  const sanitizedTrackedEntityInstances: { [key: string]: string }[] = [];
  const pageSize = 100;

  const chunkedValues = chunk(values, pageSize);

  let page = 1;
  for (const valueGroup of chunkedValues) {
    try {
      const url = `trackedEntityInstances.json?fields=attributes,orgUnit,trackedEntityInstance&ouMode=ALL&filter=${attribute}:in:${valueGroup.join(
        ";"
      )}&program=${program}&paging=false`;
      const { data, status } = await dhis2Client.get(url);
      if (status === 200) {
        const { trackedEntityInstances } = data;
        forEach(
          trackedEntityInstances,
          ({ attributes, trackedEntityInstance, orgUnit }) => {
            const { value: imei } = find(
              attributes,
              ({ attribute }) => attribute === attribute
            );
            sanitizedTrackedEntityInstances.push({
              imei,
              trackedEntityInstance,
              orgUnit,
              attributes,
            });
          }
        );
        loggerStatus &&
          logger.info(
            `Fetched tracked entity instances from ${program} program: ${page}/${chunkedValues.length}`
          );
      } else {
        loggerStatus &&
          logger.warn(
            `Failed to fetch tracked entity instances for ${page} page`
          );
      }
    } catch (error: any) {
      loggerStatus &&
        logger.warn(
          `Failed to fetch tracked entity instances from ${program}. Check the error below!`
        );
      logSanitizedConflictsImportSummary(error);
    }
    page++;
  }
  return sanitizedTrackedEntityInstances;
}
