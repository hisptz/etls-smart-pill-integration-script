export interface Duration {
  startDate?: string;
  endDate?: string;
}

export interface DeviceDetails {
  alarmTime?: string;
  refillAlarm?: string;
  batteryLevel: number;
  lastOpened: string;
  lastHeartBeat: string;
  deviceStatus: string;
}

export interface Device extends DeviceDetails {
  daysDeviceInUse: number;
  imei: string;
}
