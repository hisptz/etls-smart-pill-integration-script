export type Duration = {
  startDate?: string;
  endDate?: string;
};

export type Episode = {
  id: string;
  imei: string;
  adherenceString: string;
  episodeStartDate: string;
  lastSeen: string;
  batteryLevel: string;
  deviceStatus: string;
};

export type AdherenceMapping = {
  date: string;
  adherence: string;
};

export type DHIS2Event = {
  event: string;
  trackedEntityInstance: string;
  program: string;
  enrollment: string;
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
  completedAt?: string;
};

export type DHIS2DataValue = {
  dataElement: string;
  value: string | number | boolean;
};

export interface DeviceDetails {
  alarmDays?: string;
  alarmTime?: string;
  alarmStatus?: number;
  refillAlarmStatus?: number;
  refillAlarm?: string;
  batteryLevel: string;
  lastOpened: string;
  lastHeartBeat: string;
  deviceStatus: string;
  enrollmentDate?: string;
  deviceOpenings?: number;
}

export interface Device extends DeviceDetails {
  daysDeviceInUse: number;
  imei: string;
}
