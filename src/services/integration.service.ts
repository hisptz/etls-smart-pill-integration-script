import { Duration } from "../types";
import { map, head } from "lodash";

import logger from "../logging";
import {
  getAssignedDevices,
  getProgramMapping,
} from "../helpers/dhis2-api.helpers";
import { getDevicesWisepillEpisodes } from "../helpers/wise-pill-api.helpers";
import dhis2Client from "../clients/dhis2";

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

  //  TODO merge the events and TrackedEntity Instances
  const trackedEntityInstances = await getDhis2TrackedEntityInstances(program);
  const events = await getDhis2Events(programStage);
  logger.info("Organizing DHIS2 tracked entities and events");

  //  logger.info("Fetching DAT devices assigned in DHIS2.");
  //  const deviceImeis = await getAssignedDevices();
  //
  //  logger.info("Fetching Adherence episodes from Wisepill.");
  //  const episodes = await getDevicesWisepillEpisodes(deviceImeis);

  //  TODO generate events from the

  //  TODO import the events
}

async function getDhis2TrackedEntityInstances(program: string): Promise<any> {
  logger.info(`Fetching DHIS2 tracked entity instances for ${program} program`);
  const sanitizedTrackedEntityInstances: any[] = [];
  const pageSize = 500;
  let page = 1;
  let totalPages = 1;

  while (totalPages <= page) {
    const url = `tracker/trackedEntities?fields=trackedEntity,attributes&ouMode=ALL&program=tj4u1ip0tTF&totalPages=true&page=1&pageSize=250`;
    //    TODO update totalPages;
    logger.info(
      `Feteched tracked entity instances from ${program} program: ${page}/${totalPages}`
    );
    page++;
  }

  return sanitizedTrackedEntityInstances;
}

async function getDhis2Events(programStage: string): Promise<any> {
  logger.info(`Fetching DHIS2 events for ${programStage}`);
  let sanitizedEvents: any[] = [];
  const pageSize = 500;
  let page = 1;
  let totalPages = 1;
  const lastUpdatedDuration = "24h";

  const rootOu = await getRootOrganisationUnit();

  while (totalPages <= page && rootOu !== "") {
    const url = `tracker/events?fields=event&orgUnit=${rootOu}&ouMode=DESCENDANTS&programStage=${programStage}&f&updatedWithin=${lastUpdatedDuration}d&totalPages=true&page=${page}&pageSize=${pageSize}`;
    //    TODO update totalPages;
    const { data, status } = await dhis2Client.get(url);
    if (status === 200) {
      const { instances } = data;
      const events = map(
        instances as Array<any>,
        ({ event, occurredAt, dataValues }) => ({
          event,
          occurredAt,
          dataValues: map(
            dataValues as Array<any>,
            ({ dataElement, value }) => ({ dataElement, value })
          ),
        })
      );
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
