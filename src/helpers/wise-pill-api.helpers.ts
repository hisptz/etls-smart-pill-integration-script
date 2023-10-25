import { map } from "lodash";
import { Device } from "../types";
import {
  DAMAGED_OR_LOST,
  DEVICE_AVAILABLE,
  DEVICE_LINKED,
  DEVICE_UNAVAILABLE,
} from "../constants";

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
        imei,
        lastHeartBeat,
        batteryLevel: parseInt(`${batteryLevel}`) / 100,
        lastOpened,
        daysDeviceInUse,
        deviceStatus: getDeviceStatus(deviceStatus),
      };
    }
  );
}
