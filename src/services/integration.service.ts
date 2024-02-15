import {
  AdherenceMapping,
  DHIS2DataValue,
  DHIS2Event,
  Duration,
  Episode,
} from "../types";
import { DateTime } from "luxon";
import { map, head, chunk, find, forEach, filter, last, values } from "lodash";

import logger from "../logging";
import {
  getAssignedDevices,
  getDhis2TrackedEntityInstancesByAttribute,
  getProgramMapping,
  logImportSummary,
  logSanitizedConflictsImportSummary,
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
          assignedDevices,
          { startDate, endDate }
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
        await uploadDhis2Events(eventPayloads);
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
    const { attributes, trackedEntityInstance } = tei;
    const { value: episodeId } =
      find(attributes, ({ attribute }) => attribute === episodeIdAttribute) ??
      {};
    if (episodeId) {
      mappedTrackedEntityInstances[trackedEntityInstance] = episodeId;
    }
  });

  return mappedTrackedEntityInstances;
}

function getEventDuration(startDate?: string, endDate?: string): string {
  if (!startDate && !endDate) {
    return "24h";
  }

  const start = startDate
    ? DateTime.fromISO(startDate)
    : DateTime.fromISO("1970-01-01");

  const end = endDate ? DateTime.fromISO(endDate) : DateTime.now();

  const { days, hours } = end.diff(start, ["days", "hours"]).toObject();

  return days ? `${Math.abs(days)}d` : hours ? `${Math.abs(hours)}h` : "24h";
}

async function getDhis2TrackedEntityInstancesWithEvents(
  programMapping: any,
  assignedDevices: string[],
  duration: Duration
): Promise<Record<string, any>[]> {
  const { program, programStage, attributes } = programMapping;

  let trackedEntityInstances = await getDhis2TrackedEntityInstancesByAttribute(
    program,
    assignedDevices,
    attributes["deviceIMEInumber"],
    true
  );

  const { startDate, endDate } = duration;
  const events = await getDhis2Events(programStage, { startDate, endDate });

  logger.info(`Organizing DHIS2 tracked entities and events`);
  trackedEntityInstances = map(
    trackedEntityInstances,
    ({ trackedEntityInstance, imei, orgUnit, attributes: teiAttributes }) => {
      const teiEvents = filter(
        events,
        ({ trackedEntityInstance: tei }) => trackedEntityInstance === tei
      );

      return {
        trackedEntityInstance,
        attributes: teiAttributes,
        imei,
        orgUnit,
        events: teiEvents,
      };
    }
  );

  return trackedEntityInstances;
}

async function getDhis2Events(
  programStage: string,
  duration: Duration
): Promise<any> {
  logger.info(`Fetching DHIS2 events for ${programStage} program stage`);

  const { startDate, endDate } = duration;
  const eventsLastUpdatedDuration = getEventDuration(startDate, endDate);

  let sanitizedEvents: any[] = [];
  const pageSize = 500;
  let page = 1;
  let totalPages = 1;

  const rootOu = await getRootOrganisationUnit();

  while (page <= totalPages && rootOu !== "") {
    const url = `events?fields=event,trackedEntityInstance,eventDate,dataValues[dataElement,value]&orgUnit=${rootOu}&ouMode=DESCENDANTS&programStage=${programStage}&lastUpdatedDuration=${eventsLastUpdatedDuration}&totalPages=true&page=${page}&pageSize=${pageSize}`;
    const { data, status } = await dhis2Client.get(url);
    if (status === 200) {
      const { events, pager } = data;
      const { pageCount } = pager;
      totalPages = pageCount;

      sanitizedEvents = [...sanitizedEvents, ...events];
      logger.info(
        `Fetched DHIS2 events for ${programStage} stage at page ${page}`
      );
    } else {
      logger.info(
        `Skipped DHIS2 events for ${programStage} stage at page ${page}`
      );
    }
    page++;
  }

  return sanitizedEvents;
}

async function getRootOrganisationUnit(): Promise<string> {
  let rootOuId = "";
  const url = "organisationUnits.json?filter=level:eq:1&fields=id";
  try {
    const { data, status } = await dhis2Client.get(url);
    const { organisationUnits } = data;
    rootOuId =
      head(map(organisationUnits as Array<{ id: string }>, ({ id }) => id)) ??
      "";
  } catch (e: any) {
    throw new Error(e.toString());
  }
  return rootOuId;
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
  const defaultStartDate = "1970-01-01";

  for (const {
    imei,
    trackedEntityInstance,
    orgUnit,
    events,
  } of trackedEntityInstances) {
    const teiEpisodeId =
      trackedEntityInstancesWithEpisodesMapping[trackedEntityInstance];

    if (!teiEpisodeId) {
      logger.warn(
        `Tracked entity instance ${trackedEntityInstance} has no episode id`
      );
      continue;
    }

    const teiEpisode = find(
      episodes,
      ({ id: episodeId }) => episodeId === teiEpisodeId
    );

    logger.info(
      `Evaluating DHIS2 event payloads for tracked entity instance ${trackedEntityInstance} assigned to device ${imei}`
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
      const adherence = (adherenceString ?? "").split(",");
      // if not range is specified
      if (!startDate && !endDate && lastSeen) {
        const lastSeenDate = DateTime.fromSQL(lastSeen);
        const now = DateTime.now();
        // if the last seen for the episode is the current day
        if ((now.diff(lastSeenDate, ["days"]).toObject().days ?? 0) < 1) {
          const episodeAdherence: AdherenceMapping = {
            adherence: last(adherence) ?? "0",
            date: lastSeen,
          };
          const dataValues = generateDataValuesFromAdherenceMapping(
            episodeAdherence,
            batteryLevel,
            deviceStatus
          );
          const teiEvent: DHIS2Event = getDHIS2EventPayload(
            program,
            programStage,
            trackedEntityInstance,
            orgUnit,
            lastSeen,
            events,
            dataValues
          );

          eventPayloads.push(teiEvent);
        } else {
          logger.warn(
            `Episode for ${imei} can not be saved to DHIS2 on ${now}, since the device was last seen at ${lastSeen}`
          );
        }
      } else {
        // if there is some range specified
        const episodeAdherence = getSanitizedAdherence(
          adherence,
          episodeStartDate
        );

        // evaluation of the range for running the script
        const evaluationStartDate = startDate
          ? DateTime.fromISO(startDate)
          : DateTime.fromISO(defaultStartDate);
        const evaluationEndDate = endDate
          ? DateTime.fromISO(endDate)
          : DateTime.now();

        for (const { adherence, date } of episodeAdherence) {
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
              trackedEntityInstance,
              orgUnit,
              date,
              events,
              dataValues
            );
            eventPayloads.push(adherenceEvent);
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
  trackedEntityInstance: string,
  orgUnit: string,
  eventDate: string,
  events: any[],
  dataValues: DHIS2DataValue[]
): DHIS2Event {
  const sanitizedEventDate = DateTime.fromISO(
    sanitizeDatesIntoDateTime(eventDate)
  ).toFormat("yyyy-MM-dd");
  const existingEvent: any =
    events && events.length
      ? head(
          filter(
            events,
            ({ eventDate: d2EventDate }) =>
              DateTime.fromISO(d2EventDate).toFormat("yyyy-MM-dd") ==
              sanitizedEventDate
          )
        )
      : null;

  const eventId = existingEvent ? existingEvent["event"] ?? uid() : uid();

  let mergedDataValues: DHIS2DataValue[] = dataValues;
  if (existingEvent) {
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
  }

  return {
    event: eventId,
    dataValues: mergedDataValues,
    trackedEntityInstance,
    orgUnit,
    program,
    programStage,
    eventDate: sanitizedEventDate,
    status: "COMPLETED",
  };
}

async function uploadDhis2Events(eventPayloads: DHIS2Event[]): Promise<void> {
  const paginationSize = 100;
  logger.info(`Evaluating pagination by ${[paginationSize]} page size`);
  const chunkedEvents = chunk(eventPayloads, paginationSize);
  let page = 1;

  for (const events of chunkedEvents) {
    logger.info(
      `Uploading adherence events to DHIS2: ${page}/${chunkedEvents.length}`
    );

    try {
      const url = `events?strategy=CREATE_AND_UPDATE`;
      const { status, data } = await dhis2Client.post(url, {
        events,
      });

      if (status === 200) {
        logger.info(
          `Successfully saved adherence events ${page}/${chunkedEvents.length}`
        );
        const { response: importResponse } = data;
        logImportSummary(importResponse);
      } else {
        logger.warn(
          `There are errors in saving the the adherence events at page ${page}`
        );
        const { response: importResponse } = data;
        logImportSummary(importResponse);
      }
    } catch (error: any) {
      logger.warn(
        `Failed to save the adherence events at page ${page}. Check the error below`
      );
      logSanitizedConflictsImportSummary(error);
    }

    page++;
  }
}
