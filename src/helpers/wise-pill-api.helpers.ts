import { map, chunk, find, last } from "lodash";
import {
  AdherenceMapping,
  DHIS2DataValue,
  Device,
  DHIS2Event,
  Episode,
} from "../types";
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
  adherences: string[],
  end: string
): AdherenceMapping[] {
  const episodeAdherences: AdherenceMapping[] = [];
  const endDate = DateTime.fromSQL(end);

  let daysToRollback = 0;
  for (const adherence of adherences.reverse()) {
    const date = endDate.minus({ days: daysToRollback }).toISO()!;
    episodeAdherences.push({
      date,
      adherence,
    });
  }

  return episodeAdherences;
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
        batteryLevel: parseInt(`${batteryLevel ?? 0}`) / 100,
        lastOpened: lastOpened ?? "",
        daysDeviceInUse: daysDeviceInUse ?? 0,
        deviceStatus: getDeviceStatus(deviceStatus),
      };
    }
  );
}

export async function getDevicesWisepillEpisodes(
  deviceImeis: string[]
): Promise<Episode[]> {
  const episodeUrl = `episodes/getEpisodes`;
  const deviceFetchUrl = `devices/getDeviceDetail`;
  const sanitizedEpisodes: Episode[] = [];
  const imeiGroupCount = 50;
  const chunckedImeis = chunk(deviceImeis, imeiGroupCount);

  let fetchCount = 0;
  for (const imeis of chunckedImeis) {
    fetchCount++;
    const { data } = await wisePillClient.get(episodeUrl, {
      data: { imeis },
    });
    const { records: episodes, ResultCode: episodeCode } = data;

    const assginedDevicesObject = {
      data: {
        imeis,
      },
    };
    const { status, data: devicesResults } = await wisePillClient.get(
      deviceFetchUrl,
      {
        data: assginedDevicesObject,
      }
    );

    const { records: devices, ResultCode: devicesCode } = devicesResults;
    for (const episode of episodes) {
      const {
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
          imei,
          adherenceString,
          episodeStartDate,
          lastSeen,
          deviceStatus: getDeviceStatus(deviceStatus),
          batteryLevel: parseInt(`${batteryLevel ?? 0}`) / 100,
        };
        console.log({ episode });
        sanitizedEpisodes.push(episode);
      }
    }
    logger.info(
      `Fetched wisepill episodes: ${fetchCount}/${chunckedImeis.length}`
    );
  }

  return sanitizedEpisodes;
}

export function generateDataValuesFromAdherenceMapping(
  { adherence, date }: AdherenceMapping,
  batteryLevel?: number,
  deviceStatus?: string
): Array<DHIS2DataValue> {
  const dataValues: Array<DHIS2DataValue> = [
    {
      dataElement: DOSAGE_TIME_DATA_ELEMENT,
      value: date,
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
