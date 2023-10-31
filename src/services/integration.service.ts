import { Duration } from "../types";
import { DateTime } from "luxon";
import { map, head, chunk, find, forEach, filter } from "lodash";

import logger from "../logging";
import {
  getAssignedDevices,
  getProgramMapping,
} from "../helpers/dhis2-api.helpers";
import { getDevicesWisepillEpisodes } from "../helpers/wise-pill-api.helpers";
import dhis2Client from "../clients/dhis2";

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

async function getDhis2TrackedEntityInstancesWithEvents({
  startDate,
  endDate,
}: Duration) {
  logger.info("Fetching DHIS2 program mappings.");
  const { program, programStage, attributes } = await getProgramMapping();
  if (!program || !programStage || !attributes) {
    logger.warn(`There are program metadata configured for migration`);
    logger.error("Terminating the integration script!");
    return;
  }

  logger.info("Fetching DAT devices assigned in DHIS2.");
  const deviceImeis = await getAssignedDevices();

  //  TODO merge the events and TrackedEntity Instances
  let trackedEntityInstances = await getDhis2TrackedEntityInstances(
    program,
    deviceImeis,
    attributes
  );
  const events = await getDhis2Events(programStage, { startDate, endDate });
  logger.info("Organizing DHIS2 tracked entities and events");
  trackedEntityInstances = map(
    trackedEntityInstances,
    ({ trackedEntityInstance, imei }) => {
      const teiEvents = filter(
        events,
        ({ trackedEntityInstance: tei }) => trackedEntityInstance === tei
      );
      return {
        trackedEntityInstance,
        imei,
        events: teiEvents,
      };
    }
  );

  logger.info("Fetching Adherence episodes from Wisepill.");
  const episodes = await getDevicesWisepillEpisodes(deviceImeis);

  //  TODO generate events from the

  //  TODO import the events
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
      const url = `trackedEntityInstances.json?fields=attributes,trackedEntityInstances&ouMode=ALL&filter=${imeiAttribute}:in:${devices.join(
        ";"
      )}&program=${program}&paging=false`;

      const { data, status } = await dhis2Client.get(url);
      if (status === 200) {
        const { trackedEntityInstances } = data;
        forEach(
          trackedEntityInstances,
          ({ attributes, trackedEntityInstance }) => {
            const imei = find(
              attributes,
              ({ attribute }) => attribute === imeiAttribute
            );
            sanitizedTrackedEntityInstances.push({
              imei,
              trackedEntityInstance,
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

  while (totalPages <= page && rootOu !== "") {
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
