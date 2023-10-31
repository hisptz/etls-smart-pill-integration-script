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

export interface Episode {
  imei: string;
  adherenceString: string;
  episodeStartDate: string;
  lastSeen: string;
  batteryLevel: number;
  deviceStatus: string;
}

export interface Device extends DeviceDetails {
  daysDeviceInUse: number;
  imei: string;
}
