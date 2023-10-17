export interface Duration {
  startDate?: string;
  endDate?: string;
}

export interface Device {
  alarmTime: string;
  refillAlarm: string;
  batteryLevel: number;
  lastOpened: string;
  deviceStatus: string;
}
