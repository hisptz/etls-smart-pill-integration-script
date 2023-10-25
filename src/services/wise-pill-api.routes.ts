import { Router, Request, Response, NextFunction } from "express";
import { DateTime } from "luxon";
import {
  head,
  chunk,
  forIn,
  map,
  groupBy,
  find,
  filter,
  compact,
  orderBy,
  reduce,
  first,
} from "lodash";
import wisePillClient from "../clients/wise-pill";
import { DeviceDetails } from "../types";
import { addAlarmSchema, createEpisodeSchema } from "../schema";
import {
  binaryToDecimal,
  getDeviceStatus,
  sanitizeDeviceList,
} from "../helpers/wise-pill-api.helpers";
import { getAssignedDevices } from "../helpers/dhis2-api.helpers";
import logger from "../logging";

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const secretKey =
    req.headers["x-api-key"] || req.query.apiKey || req.body.apiKey;

  if (secretKey && secretKey === process.env.SECRET_KEY) {
    next();
  } else {
    res.status(401).json({ error: "Unauthorized: Invalid secret key" });
  }
}

const router = Router();

router.get("/", (req: Request, res: Response) => {
  const response = {
    messsage:
      "Welcome to the Wisepill and DHIS2 integration API. Go to {server}/docs for the documentation",
  };
  res.status(200).send(response);
});

// For setting device alarm
router.post("/alarms", async (req: Request, res: Response) => {
  // validate the body
  const { error: bodyValidationError } = addAlarmSchema.validate(req.body);
  if (bodyValidationError) {
    return res.status(400).json({
      error: bodyValidationError.details.map((error) => error.message),
    });
  }

  const { alarm, refillAlarm, imei, days } = req.body;

  // If there is alarm to be set
  if (alarm) {
    const alarmDays = days ? binaryToDecimal(days) : 127;
    const { data } = await wisePillClient.put(
      `devices/setAlarm?refill_alarm=1&alarm_time=${alarm}&device_imei=${imei}&alarm_days=${alarmDays}`
    );
    const { ResultCode: alarmCode, Result: alarmResult } = data;
    if (alarmCode >= 100) {
      return res.status(409).json({
        status: 409,
        message: `Alarm for ${imei} could not be set. ${alarmResult}`,
      });
    }
  }

  // If there is refill alarm to be set
  if (refillAlarm) {
    const { data } = await wisePillClient.put(
      `devices/setRefillAlarm?refill_alarm=1&refill_alarm_datetime=${refillAlarm}&device_imei=${imei}`
    );
    const { ResultCode: refillAlarmCode, Result: refillAlarmResult } = data;
    if (refillAlarmCode >= 100) {
      return res.status(409).json({
        status: 409,
        message: `Refill alarm for ${imei} could not be set. ${refillAlarmResult}`,
      });
    }
  }

  if (!refillAlarm && !alarm) {
    return res
      .status(409)
      .json({ status: 409, message: "No alarm was specifiied" });
  }
});

// For fetching device list
router.get("/devices", async (req: Request, res: Response) => {
  let sanitizedDevices: Array<DeviceDetails> = [];
  const deviceFetchUrl = `devices/getDeviceDetail`;
  const episodeUrl = `episodes/getEpisodes`;
  const devicesGroupCount = 50;

  const assginedDevices = {
    data: {
      imeis: map(
        filter(await getAssignedDevices(), ({ inUse }) => inUse),
        ({ code }) => code
      ),
    },
  };

  const { status, data: devicesResults } = await wisePillClient.get(
    deviceFetchUrl,
    {
      data: assginedDevices,
    }
  );

  if (status === 200) {
    const { Result, ResultCode, records } = devicesResults;
    if (parseInt(`${ResultCode}`) >= 100) {
      return res.status(409).json({ message: Result, code: ResultCode });
    }

    const chunkedRecord = chunk(records, devicesGroupCount);

    for (const recordsGroup of chunkedRecord) {
      const devicesMergedWithRecords: Array<DeviceDetails> = [];
      const imeis = compact(
        map(recordsGroup, ({ device_imei }: any) => device_imei)
      );
      const { data } = await wisePillClient.post(episodeUrl, {
        data: { imeis },
      });
      const { records: episodes, ResultCode: episodeCode } = data;
      if (episodeCode == 0) {
        forIn(
          groupBy(episodes, "device_imei"),
          (episodes: any[], imei: string) => {
            const device = find(
              recordsGroup,
              ({ device_imei }) => device_imei === imei
            );
            devicesMergedWithRecords.push({
              ...(device ?? {}),
              ...first(orderBy(episodes, ["last_seen"], ["desc"])),
              total_device_days: reduce(
                episodes,
                (totalDays: number, { total_device_days }) =>
                  parseInt(total_device_days) + totalDays,
                0
              ),
            });
          }
        );
      }
      sanitizedDevices = [
        ...sanitizedDevices,
        ...sanitizeDeviceList(devicesMergedWithRecords),
      ];
    }
    res.send({ devices: sanitizedDevices });
  } else {
    res.status(status).send(devicesResults);
  }
});

// For fetching device list
router.get("/devices/details", async (req: Request, res: Response) => {
  const { imei } = req.query;
  const { status, data } = await wisePillClient.get(
    `devices/getDevices.php?device_imei=${imei}`
  );
  if (status === 200) {
    const { Result, ResultCode, records } = data;
    if (parseInt(ResultCode) >= 100) {
      res.status(409).send({ message: Result, code: ResultCode });
    } else {
      const {
        alarm,
        refill_alarm_datetime,
        last_battery_level,
        last_opened,
        last_seen,
        device_status,
      } = head(records) as any;
      const deviceObject: DeviceDetails = {
        alarmTime: alarm ?? "",
        refillAlarm: refill_alarm_datetime ?? "",
        batteryLevel: parseInt(`${last_battery_level}`) / 100,
        lastOpened: last_opened ?? "",
        lastHeartBeat: last_seen ?? "",
        deviceStatus: getDeviceStatus(device_status),
      };
      res.status(status).send(deviceObject);
    }
  } else {
    res.status(status).send(data);
  }
});

// For assigning device
router.post("/devices/assign", async (req: Request, res: Response) => {
  //validate schema
  const { error: bodyValidationError } = createEpisodeSchema.validate(req.body);
  if (bodyValidationError) {
    return res.status(400).json({
      error: bodyValidationError.details.map((error) => error.message),
    });
  }
  const { imei, patientId } = req.body;

  // Finding device
  const assignedDeviceStatus = 1;
  const findDeviceUrl = `devices/findDevice?input=${imei}`;
  const { data } = await wisePillClient.get(findDeviceUrl);
  const { ResultCode: devicesRequestStatus, records: deviceRecords }: any =
    data;

  if (devicesRequestStatus == 0) {
    // Unassign the assgined devices
    const { device_status: deviceStatus } = first(deviceRecords as any[]);
    if (deviceStatus == assignedDeviceStatus) {
      logger.info(`Unassigning ${imei}`);
      const unAssignUrl = `devices/unassignDevice?device_imei=${imei}`;
      await wisePillClient.put(unAssignUrl);
    }
    // Creating Episode
    const date = DateTime.now().toFormat("yyyy-MM-dd");
    console.log(date);
    const createEpisodeUrl = `episodes/createEpisode?episode_start_date=${date}&external_id=${patientId}`;
    const { data } = await wisePillClient.post(createEpisodeUrl);
    console.log(data);
    const {
      ResultCode: creatEpisodeResultCode,
      Result: message,
      episode_id: episodeId,
    }: any = data;

    if (creatEpisodeResultCode == 0 && episodeId) {
      // Assigning episode to device
      const assignDeviceUrl = `devices/assignDevice?episode_id=${episodeId}&device_imei=${imei}`;
      const { data } = await wisePillClient.put(assignDeviceUrl);

      const {
        ResultCode: deviceAssignmentCode,
        Result: deviceAssigmnetResult,
      }: any = data;
      if (deviceAssignmentCode == 0) {
        res.status(201).send({
          status: 201,
          message: `Device ${imei} assigned to ${patientId}`,
        });
      } else {
        console.log(data);
        res.status(409).send({ message: deviceAssigmnetResult });
      }
    } else {
      res.status(409).send({
        message:
          creatEpisodeResultCode == 1
            ? `Episode already exist for ${imei}`
            : message ?? `Failed to create Episode for ${imei}`,
      });
    }
  } else {
    res.status(404).send({ message: `Device ${imei} not found` });
  }
});

export default router;
