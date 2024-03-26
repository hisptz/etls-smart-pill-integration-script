import {
  AdherenceMapping,
  DHIS2DataValue,
  DHIS2Event,
  Duration,
  Episode,
} from "../types";
import { DateTime } from "luxon";
import { map, head, chunk, find, forEach, filter, values } from "lodash";
import logger from "../logging";
import {
  getAssignedDevices,
  getDhis2TrackedEntityInstancesByAttribute,
  getProgramMapping,
  logImportSummary,
  logSanitizedConflictsImportSummary,
  uploadDhis2Events,
} from "../helpers/dhis2-api.helpers";
import {
  generateDataValuesFromAdherenceMapping,
  getWisepillEpisodeValues,
  getSanitizedAdherence,
  sanitizeDatesIntoDateTime,
} from "../helpers/wise-pill-api.helpers";
import dhis2Client from "../clients/dhis2";
import { uid } from "@hisptz/dhis2-utils";
import { DEVICE_SIGNAL_DATA_ELEMENT } from "../constants";

export async function startIntegrationProcess({
  startDate,
  endDate,
}: Duration): Promise<void> {
  try {
    logger.info(
      `Started integration with WisePill API ${
        startDate ? "from " + startDate : ""
      } ${endDate ? "up to " + endDate : ""}`.trim() +
        ` at ${DateTime.now().toISO()}`
    );

    logger.info("Fetching DAT devices assigned in DHIS2.");
    const assignedDevices = await getAssignedDevices();

    logger.info("Fetching configured program mapping from DHIS2.");
    const programMapping = await getProgramMapping();

    if (!programMapping || programMapping.length <= 0) {
      logger.warn(`There are No program metadata configured for migration`);
      logger.error("Terminating the integration script!");
      return;
    }

    for (const { program, programStage, attributes } of programMapping) {
      if (!program || !programStage || !attributes) {
        logger.warn(
          `There are program mapping is wrongly configured! Revisit configurations to ensure program, program and attributes are well configured`
        );
        break;
      }

      const trackedEntityInstances =
        await getDhis2TrackedEntityInstancesWithEvents(
          { program, programStage, attributes },
          assignedDevices
        );

      logger.info("Mapping Tracked Entity Instances with episodes");
      const trackedEntityInstancesWithEpisodesMapping =
        getTrackedEntityInstanceWithEpisodesMapping(
          trackedEntityInstances,
          attributes["episodeId"]
        );

      logger.info("Fetching Adherence episodes from Wisepill.");
      const episodes = await getWisepillEpisodeValues(
        values(trackedEntityInstancesWithEpisodesMapping)
      );

      const eventPayloads = generateEventPayload(
        episodes,
        trackedEntityInstances,
        program,
        programStage,
        trackedEntityInstancesWithEpisodesMapping,
        {
          startDate,
          endDate,
        }
      );

      if (eventPayloads.length) {
        logger.info(
          `Uploading ${eventPayloads.length} events for program stage ${programStage}`
        );
        console.log(JSON.stringify({ eventPayloads }));
        // await uploadDhis2Events(eventPayloads);
      } else {
        logger.info(
          `Skipping uploading events from program stage ${programStage} since there are no events`
        );
      }
    }
  } catch (error: any) {
    logger.error(
      `An error occurred while running the integration script. Check the error below`
    );
    logger.error(error.toString());
  }

  logger.info(
    `Terminating the integration process at ${DateTime.now().toISO()}`
  );
}

function getTrackedEntityInstanceWithEpisodesMapping(
  trackedEntityInstances: Record<string, any>,
  episodeIdAttribute: string
) {
  let mappedTrackedEntityInstances: Record<string, any> = {};
  forEach(trackedEntityInstances, (tei) => {
    const { attributes, trackedEntity } = tei;
    const { value: episodeId } =
      find(attributes, ({ attribute }) => attribute === episodeIdAttribute) ??
      {};
    if (episodeId) {
      mappedTrackedEntityInstances[trackedEntity] = episodeId;
    }
  });

  return mappedTrackedEntityInstances;
}

async function getDhis2TrackedEntityInstancesWithEvents(
  programMapping: any,
  assignedDevices: string[]
): Promise<Record<string, any>[]> {
  const { program, programStage, attributes } = programMapping;
  return await getDhis2TrackedEntityInstancesByAttribute(
    program,
    assignedDevices,
    attributes["deviceIMEInumber"],
    programStage
  );
}

function generateEventPayload(
  episodes: Episode[],
  trackedEntityInstances: Array<{ [key: string]: any }>,
  program: string,
  programStage: string,
  trackedEntityInstancesWithEpisodesMapping: Record<string, any>,
  duration: Duration
): any[] {
  logger.info("Preparing the events payloads for migrating to DHIS2");

  const eventPayloads: DHIS2Event[] = [];
  const { startDate, endDate } = duration;
  const defaultStartDate = "2000-01-01";

  for (const {
    imei,
    trackedEntity,
    orgUnit,
    events,
  } of trackedEntityInstances) {
    const teiEpisodeId =
      trackedEntityInstancesWithEpisodesMapping[trackedEntity];

    if (!teiEpisodeId) {
      logger.warn(`Tracked entity instance ${trackedEntity} has no episode id`);
      continue;
    }

    const teiEpisode = find(
      episodes,
      ({ id: episodeId }) => episodeId === teiEpisodeId
    );

    logger.info(
      `Evaluating DHIS2 event payloads for tracked entity instance ${trackedEntity} assigned to device ${imei}`
    );
    if (teiEpisode) {
      const {
        adherenceString,
        episodeStartDate,
        lastSeen,
        batteryLevel,
        deviceStatus,
        imei,
      } = teiEpisode;
      const adherences = (adherenceString ?? "").split(",");
      // if not range is specified
      if (!startDate && !endDate && lastSeen) {
        const lastSeenDate = DateTime.fromSQL(lastSeen);
        const now = DateTime.now();
        // if the last seen for the episode is the current day
        if ((now.diff(lastSeenDate, ["days"]).toObject().days ?? 0) >= 1) {
          logger.warn(
            `Device with IMEI ${imei} has not been communicating data since ${lastSeen}`
          );
        }
        const episodeAdherences: Array<AdherenceMapping> = [];
        var daysFromEpisodeStart = 0;
        for (const sanitizedAdherence of adherences) {
          const episodeDate = DateTime.fromSQL(episodeStartDate)
            .plus({ days: daysFromEpisodeStart })
            .toFormat("yyyy-MM-dd");

          episodeAdherences.push({
            adherence: sanitizedAdherence,
            date: episodeDate,
          });
          daysFromEpisodeStart++;
        }

        const adherenceEvents: Array<{
          eventDate: string;
          adherence: string;
          dataValues: Array<DHIS2DataValue>;
        }> = map(episodeAdherences, ({ adherence, date }) => ({
          adherence,
          eventDate: date,
          dataValues: generateDataValuesFromAdherenceMapping(
            { adherence, date },
            batteryLevel,
            deviceStatus
          ),
        })).reverse();

        for (const { eventDate, adherence, dataValues } of adherenceEvents) {
          if (adherence === "0") {
            break;
          }
          const teiEvent = getDHIS2EventPayload(
            program,
            programStage,
            trackedEntity,
            orgUnit,
            eventDate,
            events,
            dataValues
          );
          if (teiEvent) {
            eventPayloads.push(teiEvent);
          }
        }
      }
      // if there is some range specified
      else if (startDate || endDate) {
        const episodeAdherences = getSanitizedAdherence(
          adherences,
          episodeStartDate
        );
        // evaluation of the range for running the script
        const evaluationStartDate = startDate
          ? DateTime.fromISO(startDate)
          : DateTime.fromISO(defaultStartDate);
        const evaluationEndDate = endDate
          ? DateTime.fromISO(endDate)
          : DateTime.now();

        for (const { adherence, date } of episodeAdherences) {
          const adherenceDate = DateTime.fromISO(date);
          // If the adherence date is within the range for running the script
          if (
            evaluationStartDate <= adherenceDate &&
            adherenceDate <= evaluationEndDate
          ) {
            const dataValues = generateDataValuesFromAdherenceMapping({
              adherence,
              date,
            });
            const adherenceEvent = getDHIS2EventPayload(
              program,
              programStage,
              trackedEntity,
              orgUnit,
              date,
              events,
              dataValues
            );
            if (adherenceEvent) {
              eventPayloads.push(adherenceEvent);
            }
          }
        }
      }
    } else {
      logger.warn(
        `Tracked entity instance linked to device with IMEI ${imei} has not wisepill episodes`
      );
    }
  }

  return eventPayloads;
}

function getDHIS2EventPayload(
  program: string,
  programStage: string,
  trackedEntity: string,
  orgUnit: string,
  eventDate: string,
  events: any[],
  dataValues: DHIS2DataValue[]
): DHIS2Event | null {
  const sanitizedEventDate = DateTime.fromISO(
    sanitizeDatesIntoDateTime(eventDate)
  ).toFormat("yyyy-MM-dd");
  const existingEvent: any =
    events && events.length
      ? head(
          filter(
            events,
            ({ occurredAt: d2EventDate }) =>
              DateTime.fromISO(d2EventDate).toFormat("yyyy-MM-dd") ==
              sanitizedEventDate
          )
        )
      : null;

  const eventId = existingEvent ? existingEvent["event"] ?? uid() : uid();

  let mergedDataValues: DHIS2DataValue[] = dataValues;
  if (existingEvent) {
    const currentDeviceSignalDataValue = find(
      dataValues,
      ({ dataElement }) => dataElement === DEVICE_SIGNAL_DATA_ELEMENT
    );

    const previousDeviceSignalDataValue = find(
      existingEvent["dataValues"] ?? [],
      ({ dataElement }) => dataElement === DEVICE_SIGNAL_DATA_ELEMENT
    );

    // check if the adherence have changed
    if (
      currentDeviceSignalDataValue?.value !==
      previousDeviceSignalDataValue?.value
    ) {
      mergedDataValues = [
        ...filter(
          dataValues,
          ({ dataElement }) => dataElement === DEVICE_SIGNAL_DATA_ELEMENT
        ),
        ...filter(
          existingEvent["dataValues"] ?? [],
          ({ dataElement }) => dataElement !== DEVICE_SIGNAL_DATA_ELEMENT
        ),
      ];
    } else {
      // No signal has changed, return nothing
      return null;
    }
  }

  return {
    event: eventId,
    dataValues: mergedDataValues,
    trackedEntity,
    orgUnit,
    program,
    programStage,
    occurredAt: sanitizedEventDate,
    completedAt: DateTime.now().toISO(),
    status: "COMPLETED",
  };
}
