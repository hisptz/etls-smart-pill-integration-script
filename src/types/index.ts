export interface Duration {
  startDate?: string;
  endDate?: string;
}

export interface DeviceDetails {
  alarmDays?: string;
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

export interface AdherenceMapping {
  date: string;
  adherence: string;
}

export interface Device extends DeviceDetails {
  daysDeviceInUse: number;
  imei: string;
}

export interface DHIS2Event {
  event: string;
  trackedEntityInstance: string;
  program: string;
  programStage: string;
  orgUnit: string;
  eventDate: string;
  status:
    | "ACTIVE"
    | "COMPLETED"
    | "SCHEDULED"
    | "SKIPPED"
    | "VISITED"
    | "OVERDUE";
  dataValues: Array<DHIS2DataValue>;
}

export interface DHIS2DataValue {
  dataElement: string;
  value: string | number | boolean;
}
