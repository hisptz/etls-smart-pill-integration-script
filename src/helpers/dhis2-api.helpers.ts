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
import { DHIS2Event } from "../types";

async function getDataStoreSettings(): Promise<any> {
  const url = `dataStore/${WEB_APP_DATASTORE_KEY}/settings`;
  try {
    const { data } = await dhis2Client.get(url);
    return data;
  } catch (e: any) {
    logger.error(
      "Failed to fetch data store configurations. Check the logs below!",
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
        ({ code }) => code,
      )
    : [];
}

export async function getProgramMapping(): Promise<any[]> {
  const { programMapping } = await getDataStoreSettings();
  return programMapping ?? [];
}

export function logImportSummary(importResponse: any) {
  const { stats, validationReport } = importResponse;

  const { created, updated, deleted, ignored, total } = stats ?? {};
  if (created || updated || deleted || ignored) {
    logger.info(
      `Here is the import summary: ${JSON.stringify({
        created,
        deleted,
        updated,
        ignored,
        total,
      })}`,
    );
  }

  const { warningReports, errorReports } = validationReport ?? {};
  if (warningReports && warningReports.length) {
    forEach(warningReports, ({ message }) => {
      logger.warn(message);
    });
  }
  if (errorReports && errorReports.length) {
    forEach(errorReports, ({ message }) => {
      logger.error(message);
    });
  }
}

export function logSanitizedConflictsImportSummary(errorResponse: any): void {
  if (errorResponse.response) {
    const { response } = errorResponse.response.data;
    if (response) {
      logImportSummary(response);
    } else {
      const { message, response } = errorResponse;

      if (!response) {
        logger.error(message);
      } else {
        const { status, validationReport } = response.data;
        const sanitizedMessage = (head(validationReport.errorReports) as any)
          ?.message;
        if (sanitizedMessage) {
          logger.error(sanitizedMessage);
        } else {
          logger.error(
            `Failed to fetch the validation report for the error with status code ${status}`,
          );
        }
      }
      logger.error(errorResponse.response);
    }
  } else {
    logger.error(errorResponse.message ?? errorResponse.toString());
  }
}

export async function getPatientDetailsFromDHIS2(
  patientId: string,
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

                const trackedEntities =
                  await getDhis2TrackedEntityInstancesByAttribute(
                    program,
                    [patientId],
                    patientNumberAttribute,
                  );
                const tei = head(trackedEntities);
                if (!tei) {
                  return null;
                }
                const { attributes, trackedEntity, orgUnit, enrollment } = tei;
                const episodeId = find(
                  attributes,
                  ({ attribute }) => attribute === episodeIdAttribute,
                )?.value;

                return {
                  program,
                  orgUnit,
                  patientId,
                  episodeId,
                  programStage,
                  enrollment,
                  trackedEntity,
                };
              },
            ),
          ),
        ),
      ),
    ) as any | null;
    return trackedEntityInstance;
  } catch (error: any) {
    logger.warn(
      `Failed to fetch patient details with ${patientId} identification number`,
    );
    logger.error(error.toString());
    return null;
  }
}

export async function updateDATEnrollmentStatus(
  patientNumber: string,
  trackedEntity: string,
  program: string,
  enrollment: string,
  programStage: string,
  orgUnit: string,
): Promise<void> {
  try {
    const now = DateTime.now().toISO();
    const eventDate = DateTime.now().toFormat("yyyy-MM-dd");

    const event: DHIS2Event = {
      event: uid(),
      program,
      enrollment,
      programStage,
      orgUnit,
      trackedEntity,
      occurredAt: eventDate,
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

    logger.info(
      `Updating DAT enrollment status for patient with ${patientNumber} identification`,
    );
    await uploadDhis2Events([event]);
  } catch (error: any) {
    logger.warn(
      `Failed to assign the DAT enrollment status for patient with ${patientNumber} identification number`,
    );
    logger.error(error.toString());
  }
}

export async function getDhis2TrackedEntityInstancesByAttribute(
  program: string,
  values: string[],
  attribute: string,
  programStage?: string,
): Promise<Array<{ [key: string]: any }>> {
  const showLogs = (programStage ?? "").length > 0;

  showLogs &&
    logger.info(
      `Fetching DHIS2 tracked entity instances for ${program} program`,
    );
  const sanitizedTrackedEntityInstances: { [key: string]: string | any[] }[] =
    [];

  const pageSize = 50;
  const chunkedValues = chunk(values, pageSize);

  let page = 1;
  for (const valueGroup of chunkedValues) {
    try {
      const url = `tracker/trackedEntities.json?fields=attributes[attribute,value],orgUnit,trackedEntity,enrollments[program,enrollment,events[event,enrollment,trackedEntity,occurredAt,programStage,dataValues[dataElement,value]]]&ouMode=ALL&program=${program}&totalPages=true&pageSize=${pageSize}&filter=${attribute}:in:${valueGroup.join(
        ";",
      )}`;

      const { data, status } = await dhis2Client.get(url);
      if (status === 200) {
        const { instances: trackedEntityInstances } = data;
        forEach(
          trackedEntityInstances,
          ({ attributes, trackedEntity, orgUnit, enrollments }) => {
            const { value: imei } = find(
              attributes,
              ({ attribute: attributeId }) => attribute === attributeId,
            );

            const latestProgramEnrollment =
              program && program.length
                ? head(
                    filter(
                      enrollments,
                      ({ program: enrolledProgram }) =>
                        enrolledProgram === program,
                    ),
                  )
                : {};

            const { enrollment, events: teiEvents } = latestProgramEnrollment;

            const events = filter(
              teiEvents ?? [],
              ({ programStage: eventProgramStage }) =>
                eventProgramStage === programStage,
            );
            sanitizedTrackedEntityInstances.push({
              imei,
              trackedEntity,
              enrollment,
              orgUnit,
              attributes,
              ...(programStage && { events }),
            });
          },
        );
        showLogs &&
          logger.info(
            `Fetched tracked entity instances from ${program} program: ${page}/${chunkedValues.length}`,
          );
      } else {
        showLogs &&
          logger.warn(
            `Failed to fetch tracked entity instances for ${page} page`,
          );
      }
    } catch (error: any) {
      if (showLogs) {
        logger.warn(
          `Failed to fetch tracked entity instances from ${program}. Check the error below!`,
        );
        logger.error(error.toString());
      }
      logSanitizedConflictsImportSummary(error);
    }
    page++;
  }
  return sanitizedTrackedEntityInstances;
}

export async function uploadDhis2Events(
  eventPayloads: DHIS2Event[],
): Promise<void> {
  const paginationSize = 100;
  logger.info(`Evaluating pagination by ${[paginationSize]} page size`);
  const chunkedEvents = chunk(eventPayloads, paginationSize);
  let page = 1;

  for (const events of chunkedEvents) {
    logger.info(
      `Uploading adherence events to DHIS2: ${page}/${chunkedEvents.length}`,
    );

    try {
      const url = `tracker?strategy=CREATE_AND_UPDATE&async=false&atomicMode=OBJECT`;
      const { status, data } = await dhis2Client.post(url, {
        events,
      });

      if (status === 200) {
        logger.info(
          `Successfully saved adherence events ${page}/${chunkedEvents.length}`,
        );
        logImportSummary(data);
      } else {
        logger.warn(
          `There are errors in saving the the adherence events at page ${page}`,
        );
        logImportSummary(data);
      }
    } catch (error: any) {
      logger.warn(
        `Failed to save the adherence events at page ${page}. Check the error below`,
      );
      logSanitizedConflictsImportSummary(error);
    }
    page++;
  }
}
