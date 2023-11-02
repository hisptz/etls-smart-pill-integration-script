import {
  AdherenceMapping,
  DHIS2DataValue,
  DHIS2Event,
  Duration,
  Episode,
} from "../types";
import { DateTime } from "luxon";
import {
  map,
  head,
  chunk,
  find,
  forEach,
  filter,
  groupBy,
  orderBy,
  reduce,
  last,
} from "lodash";

import logger from "../logging";
import {
  getAssignedDevices,
  getProgramMapping,
} from "../helpers/dhis2-api.helpers";
import {
  generateDataValuesFromAdherenceMapping,
  getDevicesWisepillEpisodes,
  getSanitizedAdherence,
} from "../helpers/wise-pill-api.helpers";
import dhis2Client from "../clients/dhis2";
import { uid } from "@hisptz/dhis2-utils";

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

export async function startIntegrationProcess({
  startDate,
  endDate,
}: Duration): Promise<void> {
  logger.info(
    `Started integtration with WisePill API ${
      startDate ? "from " + startDate : ""
    } ${endDate ? "up to " + endDate : ""}`.trim()
  );

  await getDhis2TrackedEntityInstancesWithEvents({ startDate, endDate });
}

async function getDhis2TrackedEntityInstancesWithEvents(duration: Duration) {
  logger.info("Fetching DHIS2 program mappings.");
  const { program, programStage, attributes } = await getProgramMapping();
  if (!program || !programStage || !attributes) {
    logger.warn(`There are program metadata configured for migration`);
    logger.error("Terminating the integration script!");
    return;
  }

  logger.info("Fetching DAT devices assigned in DHIS2.");
  const deviceImeis = await getAssignedDevices();

  let trackedEntityInstances = await getDhis2TrackedEntityInstances(
    program,
    deviceImeis,
    attributes
  );

  const { startDate, endDate } = duration;
  const events = await getDhis2Events(programStage, { startDate, endDate });

  logger.info("Organizing DHIS2 tracked entities and events");
  trackedEntityInstances = map(
    trackedEntityInstances,
    ({ trackedEntityInstance, imei, orgUnit }) => {
      const teiEvents = filter(
        events,
        ({ trackedEntityInstance: tei }) => trackedEntityInstance === tei
      );
      return {
        trackedEntityInstance,
        imei,
        orgUnit,
        events: teiEvents,
      };
    }
  );

  logger.info("Fetching Adherence episodes from Wisepill.");
  const episodes = await getDevicesWisepillEpisodes(deviceImeis);

  const eventPayloads = generateEventPayload(
    episodes,
    trackedEntityInstances,
    program,
    programStage,
    {
      startDate,
      endDate,
    }
  );

  console.log(JSON.stringify(eventPayloads));

  //  await uploadDhis2Events(eventPayloads);
}

async function getDhis2TrackedEntityInstances(
  program: string,
  assignedDevises: string[],
  attributes: { [key: string]: string }
): Promise<Array<{ [key: string]: any }>> {
  logger.info(`Fetching DHIS2 tracked entity instances for ${program} program`);
  const sanitizedTrackedEntityInstances: { [key: string]: string }[] = [];
  const pageSize = 100;
  const { deviceIMEInumber: imeiAttribute } = attributes;

  const chunkedDevices = chunk(assignedDevises, pageSize);

  let page = 1;
  for (const devices of chunkedDevices) {
    try {
      const url = `trackedEntityInstances.json?fields=attributes,orgUnit,trackedEntityInstance&ouMode=ALL&filter=${imeiAttribute}:in:${devices.join(
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
              ({ attribute }) => attribute === imeiAttribute
            );
            sanitizedTrackedEntityInstances.push({
              imei,
              trackedEntityInstance,
              orgUnit,
            });
          }
        );
        logger.info(
          `Feteched tracked entity instances from ${program} program: ${page}/${chunkedDevices.length}`
        );
      } else {
        logger.warn(
          `Failed to fetch tracked entity instances for ${page} page`
        );
      }
    } catch (error: any) {
      logger.warn(
        `Failed to fetch tracked entity instances. Check the error below!`
      );
      logger.error(error.toString());
    }
    page++;
  }

  return sanitizedTrackedEntityInstances;
}

async function getDhis2Events(
  programStage: string,
  duration: Duration
): Promise<any> {
  logger.info(`Fetching DHIS2 events for ${programStage}`);

  const { startDate, endDate } = duration;
  const eventsLastUpdatedDuration = getEventDuration(startDate, endDate);

  let sanitizedEvents: any[] = [];
  const pageSize = 500;
  let page = 1;
  let totalPages = 1;

  const rootOu = await getRootOrganisationUnit();

  while (page <= totalPages && rootOu !== "") {
    const url = `events?fields=event,eventDate,dataValues[dataElement,value]&orgUnit=${rootOu}&ouMode=DESCENDANTS&programStage=${programStage}&f&updatedWithin=${eventsLastUpdatedDuration}d&totalPages=true&page=${page}&pageSize=${pageSize}`;

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
  duration: Duration
): any[] {
  logger.info("Preparing the events payloads for migrating to DHIS2");

  const eventPayloads: DHIS2Event[] = [];
  const { startDate, endDate } = duration;
  const defaultStartDate = "1970-01-01";
  const groupedEpisodes = groupBy(episodes, "imei");

  for (const {
    imei,
    trackedEntityInstance,
    orgUnit,
    events,
  } of trackedEntityInstances) {
    const teiEpisodes = groupedEpisodes[imei];

    logger.info(
      `Evaluating DHIS2 event payloads for tracked entity instance ${trackedEntityInstance} assigned to device ${imei}`
    );
    if (teiEpisodes && teiEpisodes.length) {
      const cummulativeEpisodes = getCummulatedEpsodes(teiEpisodes);
      const { adherenceString, lastSeen, batteryLevel, deviceStatus, imei } =
        cummulativeEpisodes;

      const adherences = (adherenceString ?? "").split(",");

      // if not range is specified
      if (!startDate && !endDate) {
        const lastSeenDate = DateTime.fromSQL(lastSeen);
        const now = DateTime.now();

        // if the last seen for the episode is the current day
        if ((now.diff(lastSeenDate, ["days"]).toObject().days ?? 0) < 1) {
          const episodeAdherence: AdherenceMapping = {
            adherence: last(adherences) ?? "0",
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
        const episodeAdherences = getSanitizedAdherence(adherences, lastSeen);

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
  const sanitizedEventDate = DateTime.fromISO(eventDate).toFormat("yyyy-MM-dd");
  const existingEvent: any =
    events && events.length
      ? head(filter(events, (eventDate) => eventDate == sanitizedEventDate))
      : null;
  const eventId = existingEvent ? existingEvent["event"] ?? uid() : uid();

  return {
    event: eventId,
    dataValues,
    trackedEntityInstance,
    orgUnit,
    program,
    programStage,
    eventDate: sanitizedEventDate,
    status: "COMPLITED",
  };
}

function getCummulatedEpsodes(episodes: Episode[]): Episode {
  logger.info("Accumulating the episodes from the same devices");
  const orderedEpisodes = orderBy(episodes, ["lastSeen"], ["asc"]);
  return reduce(orderedEpisodes, (cummulatedEpisode, episode) => {
    return {
      ...cummulatedEpisode,
      imei: cummulatedEpisode?.imei ?? episode.imei,
      episodeStartDate:
        cummulatedEpisode?.episodeStartDate ?? episode.episodeStartDate,
      lastSeen: episode.lastSeen,
      batteryLevel: episode.batteryLevel,
      deviceStatus: episode.deviceStatus,
      adherenceString: cummulatedEpisode
        ? cummulatedEpisode.adherenceString
        : "" + episode.adherenceString,
    };
  }) as Episode;
}

//  TODO import the events
async function uploadDhis2Events(eventPayloads: any): Promise<void> {
  try {
    const url = `events?strategy=CREATE_AND_UPDATE`;
    const response = dhis2Client.post(url, { events: eventPayloads });
    console.log(JSON.stringify({ response }));
  } catch (error: any) {}
}
