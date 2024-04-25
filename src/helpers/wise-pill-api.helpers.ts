import { map, chunk, find } from "lodash";
import { AdherenceMapping, DHIS2DataValue, Device, Episode } from "../types";
import {
  BATTERY_HEALTH_DATA_ELEMENT,
  DAMAGED_OR_LOST,
  DEVICE_AVAILABLE,
  DEVICE_HEALTH_DATA_ELEMENT,
  DEVICE_LINKED,
  DEVICE_SIGNAL_DATA_ELEMENT,
  DEVICE_UNAVAILABLE,
  DOSAGE_TIME_DATA_ELEMENT,
  HEARTBEAT_RECEIVED,
  NONE_RECEIVED,
  RECEIVED_MULTIPLE,
  RECEIVED_ONCE,
} from "../constants";
import logger from "../logging";
import wisePillClient from "../clients/wise-pill";
import { DateTime } from "luxon";
import { getSystemTimeZone } from "./system.helpers";
import { updateDATEnrollmentStatus } from "./dhis2-api.helpers";

interface ResponseData {
  statusCode: number;
  body: Record<string, any>;
}

export function binaryToDecimal(binaryString: string): number {
  const binaryArray = binaryString.split("").reverse();
  let decimalValue = 0;

  for (let i = 0; i < binaryArray.length; i++) {
    if (binaryArray[i] === "1") {
      decimalValue += Math.pow(2, i);
    } else if (binaryArray[i] !== "0") {
      // If the input contains invalid characters
      return -1;
    }
  }
  return decimalValue;
}

export function decimalToBinary(decimalValue: number): string {
  if (decimalValue < 0 || decimalValue > 127) {
    // Ensure the decimal value is within the valid range (0 to 127)
    return "Invalid input";
  }

  let binaryString = "";

  for (let i = 6; i >= 0; i--) {
    const power = Math.pow(2, i);
    if (decimalValue >= power) {
      binaryString += "1";
      decimalValue -= power;
    } else {
      binaryString += "0";
    }
  }

  return binaryString;
}

export function getDeviceStatus(status: string): string {
  const statusCode = parseInt(status);
  return statusCode == 1
    ? DEVICE_LINKED
    : statusCode == 2
      ? DEVICE_AVAILABLE
      : statusCode == 3
        ? DAMAGED_OR_LOST
        : statusCode == 9
          ? DEVICE_UNAVAILABLE
          : "";
}

export function getDeviceBatteryLevel(batteryLevel: string): string {
  return `${batteryLevel}`;
}

export function sanitizeAdherenceCode(code: string): string {
  return code === "0"
    ? NONE_RECEIVED
    : code === "1"
      ? RECEIVED_ONCE
      : code === "2"
        ? RECEIVED_MULTIPLE
        : code === "9"
          ? HEARTBEAT_RECEIVED
          : NONE_RECEIVED;
}

export function getSanitizedAdherence(
  adherenceStrings: string[],
  end: string,
): AdherenceMapping[] {
  const episodeAdherence: AdherenceMapping[] = [];
  const endDate = DateTime.fromSQL(end);

  let daysToRollback = 0;
  for (const adherence of adherenceStrings) {
    const date = endDate.plus({ days: daysToRollback }).toISO()!;
    episodeAdherence.push({
      date,
      adherence,
    });
    daysToRollback++;
  }

  return episodeAdherence;
}

export function sanitizeDeviceList(
  devicesMergedWithRecords: any[],
): Array<Device> {
  return map(
    devicesMergedWithRecords,
    ({
      device_imei: imei,
      last_seen: lastHeartBeat,
      last_battery_level: batteryLevel,
      last_opened: lastOpened,
      total_device_days: daysDeviceInUse,
      device_status: deviceStatus,
    }: any): Device => {
      return {
        imei: imei ?? "",
        lastHeartBeat: lastHeartBeat ?? "",
        batteryLevel: getDeviceBatteryLevel(batteryLevel),
        lastOpened: lastOpened ?? "",
        daysDeviceInUse: daysDeviceInUse ?? 0,
        deviceStatus: getDeviceStatus(deviceStatus),
      };
    },
  );
}

export function sanitizeWisePillDateToDateTimeObjects(date: string): string {
  return date.replace(/ /g, "T");
}

export function sanitizeDateFromServer(date: string): string {
  return DateTime.fromISO(date).toISO() ?? "";
}

export function generateDataValuesFromAdherenceMapping(
  { adherence, date }: AdherenceMapping,
  batteryLevel?: string,
  deviceStatus?: string,
): Array<DHIS2DataValue> {
  const dataValues: Array<DHIS2DataValue> = [
    {
      dataElement: DOSAGE_TIME_DATA_ELEMENT,
      value: sanitizeDateFromServer(date),
    },
    {
      dataElement: DEVICE_SIGNAL_DATA_ELEMENT,
      value: sanitizeAdherenceCode(adherence),
    },
  ];

  if (batteryLevel) {
    dataValues.push({
      dataElement: BATTERY_HEALTH_DATA_ELEMENT,
      value: batteryLevel,
    });
  }

  if (deviceStatus) {
    dataValues.push({
      dataElement: DEVICE_HEALTH_DATA_ELEMENT,
      value: deviceStatus,
    });
  }

  return dataValues;
}

export async function assignEpisodeToDevice(
  episodeId: string,
  deviceImei: string,
  patientId: string,
  trackedEntity: string,
  program: string,
  enrollment: string,
  programStage: string,
  orgUnit: string,
  clearEpisodeLinkages: boolean = false,
): Promise<ResponseData> {
  // Assigning episode to device

  logger.info(
    `Assigning episode ${episodeId} to device ${deviceImei} for patient ${patientId}`,
  );

  if (clearEpisodeLinkages) {
    try {
      const unlinkEpisodeUrl = `devices/unassignDevice?episode_id=${episodeId}`;
      await wisePillClient.put(unlinkEpisodeUrl);
    } catch (error) {
      logger.error(
        `Failed to unlink episode ${episodeId} from previous devices for patient ${patientId}`,
      );
    }
  }

  const assignDeviceUrl = `devices/assignDevice?episode_id=${episodeId}&device_imei=${deviceImei}`;
  const { data } = await wisePillClient.put(assignDeviceUrl);
  const {
    ResultCode: deviceAssignmentCode,
    Result: deviceAssignmentResult,
  }: any = data;
  if (deviceAssignmentCode == 0) {
    // creating an enrollment signal in DHIS2
    await updateDATEnrollmentStatus(
      patientId,
      trackedEntity,
      program,
      enrollment,
      programStage,
      orgUnit,
    );

    // updating the device timezone
    const timeZone = getSystemTimeZone();
    const setTimeZoneUrl = `devices/setTimezone?device_imei=${deviceImei}&timezone=${timeZone}`;
    await wisePillClient.put(setTimeZoneUrl);

    return {
      statusCode: 200,
      body: {
        status: 201,
        episode: episodeId,
        message: `Device ${deviceImei} assigned to ${patientId} at timezone ${timeZone}`,
      },
    };
  } else {
    logger.error(
      `Failed to assign device ${deviceImei} to episode ${episodeId} for patient ${patientId} due to ${deviceAssignmentResult}`,
    );
    return {
      statusCode: 409,
      body: { message: deviceAssignmentResult },
    };
  }
}

export async function unassignPreviousLinkedEpisodes(
  deviceImei: string,
): Promise<void> {
  const deviceAvailableStatus = 2;
  const unlinkDeviceUrl = `devices/unassignDevice?device_status=${deviceAvailableStatus}&device_imei=${deviceImei}`;

  const { data, status } = await wisePillClient.put(unlinkDeviceUrl);
  if (status === 200) {
    const { ResultCode: statusCode, Result: message }: any = data;
    if (statusCode == 0) {
      return;
    } else {
      new Error(
        `Could not clear previous episodes linked to ${deviceImei}. ${message}`,
      );
    }
  }
}

export async function getWisepillEpisodeValues(
  episodeIds: string[],
): Promise<Episode[]> {
  const episodeUrl = `episodes/getEpisodes`;
  const deviceFetchUrl = `devices/getDeviceDetail`;
  const sanitizedEpisodes: Episode[] = [];
  const imeiGroupCount = 100;
  const chuckedEpisodeIds = chunk(episodeIds, imeiGroupCount);

  let fetchCount = 0;
  for (const ids of chuckedEpisodeIds) {
    fetchCount++;
    const { data } = await wisePillClient.get(episodeUrl, {
      data: { episodes: ids },
    });
    const { records: episodes } = data;

    const imeis = map(episodes, "device_imei");
    const assignedDevicesObject = {
      data: {
        imeis,
      },
    };

    const { data: devicesResults } = await wisePillClient.get(deviceFetchUrl, {
      data: assignedDevicesObject,
    });

    const { records: devices } = devicesResults;
    for (const episode of episodes) {
      const {
        episode_id: id,
        device_imei: imei,
        adherence_string: adherenceString,
        last_battery_level: batteryLevel,
        episode_start_date: episodeStartDate,
        last_seen: lastSeen,
      } = episode;
      const deviceDetails = find(
        devices,
        ({ device_imei: deviceImei }) => deviceImei == imei,
      );
      const { device_status: deviceStatus } = deviceDetails ?? {};

      if (imei) {
        const episode = {
          id,
          imei,
          episodeStartDate,
          deviceStatus: getDeviceStatus(deviceStatus),
          batteryLevel: getDeviceBatteryLevel(batteryLevel),
          adherenceString: adherenceString ?? "",
          lastSeen: lastSeen ?? "",
        };
        sanitizedEpisodes.push(episode);
      }
    }
    logger.info(
      `Fetched wisepill episodes: ${fetchCount}/${chuckedEpisodeIds.length}`,
    );
  }

  return sanitizedEpisodes;
}

export async function getDeviceDetailsFromWisepillAPI(
  imei: string,
): Promise<{ data: any; status: any }> {
  var data: any = {};
  var status: any;

  const activeEpisodeStatus = 1;
  const episodeUrl = `episodes/getEpisodes?device_imei=${imei}&episode_status=${activeEpisodeStatus}`;
  const deviceDetailsUrl = `devices/getDevices.php?device_imei=${imei}`;

  const [episodeResponse, deviceDetailsResponse] = await Promise.all([
    wisePillClient.get(episodeUrl),
    wisePillClient.get(deviceDetailsUrl),
  ]);

  const { data: episodeData } = episodeResponse;
  const { data: deviceDetailsData, status: deviceDetailsStatus } =
    deviceDetailsResponse;

  status = deviceDetailsStatus;

  if (deviceDetailsData && deviceDetailsData.ResultCode == 0) {
    const { records } = deviceDetailsData;
    const [device] = records;
    data = {
      ...data,
      ...device,
    };
  } else {
    const { Result, ResultCode } = deviceDetailsData;
    data = {
      ...data,
      Result,
      ResultCode,
    };
    return { data, status };
  }

  if (episodeData && episodeData.ResultCode == 0) {
    const { records } = episodeData;
    const [episode] = records;
    data = {
      ...data,
      ...episode,
    };
  } else {
    const { Result } = episodeData;
    data = {
      ...data,
      Result,
    };
  }

  return { data, status };
}

export async function createDeviceWisepillEpisodes(
  patientId: string,
): Promise<string | null> {
  // Creating episode if there are no episodes related to the patient
  const date = DateTime.now().toFormat("yyyy-MM-dd");
  const createEpisodeUrl = `episodes/createEpisode?episode_start_date=${date}&external_id=${patientId}`;
  const { data } = await wisePillClient.post(createEpisodeUrl);
  const { episode_id: createdEpisodeId }: any = data;

  return createdEpisodeId ?? null;
}
