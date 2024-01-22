import { map, chunk, find, head } from "lodash";
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
import { Response } from "express";

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
  end: string
): AdherenceMapping[] {
  const episodeAdherence: AdherenceMapping[] = [];
  const endDate = DateTime.fromSQL(end);

  let daysToRollback = 0;
  for (const adherence of adherenceStrings.reverse()) {
    const date = endDate.minus({ days: daysToRollback }).toISO()!;
    episodeAdherence.push({
      date,
      adherence,
    });
    daysToRollback++;
  }

  return episodeAdherence;
}

export function sanitizeDeviceList(
  devicesMergedWithRecords: any[]
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
    }
  );
}

export function sanitizeDatesIntoDateTime(date: string): string {
  return date.replace(/ /g, "T");
}

export function generateDataValuesFromAdherenceMapping(
  { adherence, date }: AdherenceMapping,
  batteryLevel?: string,
  deviceStatus?: string
): Array<DHIS2DataValue> {
  const dataValues: Array<DHIS2DataValue> = [
    {
      dataElement: DOSAGE_TIME_DATA_ELEMENT,
      value: sanitizeDatesIntoDateTime(date),
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
  response: Response
): Promise<void> {
  // Assigning episode to device
  const assignDeviceUrl = `devices/assignDevice?episode_id=${episodeId}&device_imei=${deviceImei}`;
  const { data } = await wisePillClient.put(assignDeviceUrl);
  const {
    ResultCode: deviceAssignmentCode,
    Result: deviceAssignmentResult,
  }: any = data;
  if (deviceAssignmentCode == 0) {
    // creating an enrollment signal in DHIS2
    await updateDATEnrollmentStatus(patientId);

    // updating the device timezone
    const timeZone = getSystemTimeZone();
    const setTimeZoneUrl = `devices/setTimezone?device_imei=${deviceImei}&timezone=${timeZone}`;
    await wisePillClient.put(setTimeZoneUrl);

    response.status(201).send({
      status: 201,
      episode: episodeId,
      message: `Device ${deviceImei} assigned to ${patientId} at timezone ${timeZone}`,
    });
  } else {
    response.status(409).send({ message: deviceAssignmentResult });
  }
}

export async function closePreviousLinkedEpisodes(
  deviceImei: string
): Promise<void> {
  const activeEpisodeStatus = 1;
  const getEpisodesUrl = `episodes/getEpisodes?episode_status=${activeEpisodeStatus}&device_imei=${deviceImei}`;

  const { data, status } = await wisePillClient.get(getEpisodesUrl);
  if (status === 200) {
    const { ResultCode: episodeRequestStatus, records: episodeRecords }: any =
      data;

    if (parseInt(`${episodeRequestStatus}`) === 0) {
      const episode = head(episodeRecords) as any;
      const { episode_id } = episode;
      if (episode_id) {
        const now = DateTime.now().toFormat("yyyy-MM-dd");
        const unassignEpisodeUrl = `episodes/closeEpisode?episode_id=${episode_id}&episode_end_date=${now}`;
        await wisePillClient.put(unassignEpisodeUrl);
      }
    } else {
      return;
    }
  }
}

export async function getWisepillEpisodeValues(
  episodeIds: string[]
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
    const { records: episodes, ResultCode: episodeCode } = data;

    const imeis = map(episodes, "device_imei");
    const assignedDevicesObject = {
      data: {
        imeis,
      },
    };

    const { status, data: devicesResults } = await wisePillClient.get(
      deviceFetchUrl,
      {
        data: assignedDevicesObject,
      }
    );

    const { records: devices, ResultCode: devicesCode } = devicesResults;
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
        ({ device_imei: deviceImei }) => deviceImei == imei
      );
      const { device_status: deviceStatus } = deviceDetails ?? {};

      if (imei) {
        const episode = {
          id,
          imei,
          adherenceString,
          episodeStartDate,
          lastSeen,
          deviceStatus: getDeviceStatus(deviceStatus),
          batteryLevel: getDeviceBatteryLevel(batteryLevel),
        };
        sanitizedEpisodes.push(episode);
      }
    }
    logger.info(
      `Fetched wisepill episodes: ${fetchCount}/${chuckedEpisodeIds.length}`
    );
  }

  return sanitizedEpisodes;
}

export async function getDeviceDetailsFromWisepillAPI(
  imei: string
): Promise<{ data: any; status: any }> {
  const { status, data } = await wisePillClient.get(
    `devices/getDevices.php?device_imei=${imei}`
  );
  if (data && data.ResultCode == 0) {
    const { records } = data;
    const [device] = records;
    return { data: device, status };
  }
  return { data, status };
}
