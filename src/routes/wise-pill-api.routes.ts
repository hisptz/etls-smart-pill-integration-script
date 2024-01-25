import { Router, Request, Response } from "express";
import {
  head,
  chunk,
  forIn,
  map,
  groupBy,
  find,
  findIndex,
  compact,
  orderBy,
  reduce,
  first,
} from "lodash";
import { DateTime } from "luxon";
import { addAlarmSchema, createEpisodeSchema } from "../schema";
import {
  assignEpisodeToDevice,
  binaryToDecimal,
  createDeviceWisepillEpisodes,
  decimalToBinary,
  getDeviceBatteryLevel,
  getDeviceDetailsFromWisepillAPI,
  getDeviceStatus,
  sanitizeDeviceList,
  unassignPreviousLinkedEpisodes,
} from "../helpers/wise-pill-api.helpers";
import wisePillClient from "../clients/wise-pill";
import { DeviceDetails } from "../types";
import {
  getAssignedDevices,
  getPatientDetailsFromDHIS2,
} from "../helpers/dhis2-api.helpers";

export const wisePillRouter = Router();

/**
 * @swagger
 * /api/:
 *   get:
 *     description: Get introduction to the API
 *     responses:
 *       201:
 *         description: Introduction to the API. This can act as a ping to the API.
 */
wisePillRouter.get("/", (req: Request, res: Response) => {
  const response = {
    message:
      "Welcome to the Wisepill and DHIS2 integration API. Go to {server}/docs for the documentation",
  };
  res.status(200).send(response);
});

// For setting device alarm
/**
 * @swagger
 * /api/alarms:
 *   post:
 *     description: Setting the Alarms for the device
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               imei:
 *                 type: string
 *                 description: Device Imei
 *               alarm:
 *                 type: string
 *                 description: Alarm to be set for taking medications in the format of hh:mm
 *               alarmStatus:
 *                 type: number
 *                 description: Status of the set alarm, can be 1 for activating the alarm or 0 for deactivating the alarm
 *               refillAlarm:
 *                 type: string
 *                 description:  Alarm to be set for refilling the device with medications in the format of YYYY-MM-DD hh:mm:ss
 *               refillAlarmStatus:
 *                 type: string
 *                 description: Status of the set refill alarm, can be 1 for activating the alarm or 0 for deactivating the alarm
 *               days:
 *                 type: string
 *                 description: This is binary representation of days of the week, SMTWTFS in a string format. e.g. 1111111
 *                 minLength: 7
 *             required:
 *               - imei
 *     responses:
 *       201:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   description: Success message
 *       409:
 *         description: Failed to set alarm
 */
wisePillRouter.post("/alarms", async (req: Request, res: Response) => {
  // validate the Alarm status value
  const validateAlarmStatusValue = (alarmStatus: any) => {
    const sanitizedAlarmStatus = parseInt(`${alarmStatus}`);
    return sanitizedAlarmStatus === 0 || sanitizedAlarmStatus === 1;
  };

  // validate the body
  const { error: bodyValidationError } = addAlarmSchema.validate(req.body);
  if (bodyValidationError) {
    return res.status(400).json({
      error: bodyValidationError.details.map((error) => error.message),
    });
  }

  const { alarm, alarmStatus, refillAlarmStatus, refillAlarm, imei, days } =
    req.body;

  // If there is alarm to be set
  if (alarm || validateAlarmStatusValue(alarmStatus)) {
    const alarmDays = days ? binaryToDecimal(days) : 127;
    const alarmString = alarm
      ? `&alarm_time=${alarm}&alarm_days=${alarmDays}`
      : "";
    const { data } = await wisePillClient.put(
      `devices/setAlarm?alarm=${
        alarmStatus ?? 1
      }&device_imei=${imei}${alarmString}`
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
  if (refillAlarm || validateAlarmStatusValue(refillAlarmStatus)) {
    const alarmString = refillAlarm
      ? `&refill_alarm_datetime=${refillAlarm}`
      : "";
    const { data } = await wisePillClient.put(
      `devices/setRefillAlarm?refill_alarm=${
        refillAlarmStatus ?? 1
      }&device_imei=${imei}${alarmString}`
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
      .json({ status: 409, message: "No alarm was specified" });
  }

  return res.status(201).json({ message: "Alarm set successfully" });
});

// For fetching device list
/**
 * @swagger
 * /api/devices:
 *   get:
 *     description: Get a list of devices that are assigned from the DHIS2 instance
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 devices:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       imei:
 *                         type: string
 *                         description: Device IMEI number
 *                       lastHeartBeat:
 *                         type: string
 *                         description: Time for the last heart beat received by the
 *                       email:
 *                         type: string
 *                         format: email
 *                         description: User's email address
 *     500:
 *       description: Server Error
 */
wisePillRouter.get("/devices", async (req: Request, res: Response) => {
  let sanitizedDevices: Array<DeviceDetails> = [];
  const deviceFetchUrl = `devices/getDeviceDetail`;
  const episodeUrl = `episodes/getEpisodes`;
  const devicesGroupCount = 50;

  const assignedDevices = await getAssignedDevices();

  if (assignedDevices.length < 1) {
    return res.status(200).json({ devices: sanitizedDevices });
  }

  const assignedDevicesObject = {
    data: {
      imeis: assignedDevices,
    },
  };

  const { status, data: devicesResults } = await wisePillClient.get(
    deviceFetchUrl,
    {
      data: assignedDevicesObject,
    }
  );
  if (status === 200) {
    const { Result, ResultCode, records } = devicesResults;
    if (parseInt(`${ResultCode}`) >= 100) {
      return res.status(409).json({ message: Result, code: ResultCode });
    }

    const chunkedRecord = chunk(records, devicesGroupCount);

    for (const recordsGroup of chunkedRecord) {
      let devicesMergedWithRecords: Array<any> = recordsGroup;
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

            const deviceIndex = findIndex(
              devicesMergedWithRecords,
              ({ device_imei }) => device_imei === imei
            );

            if (deviceIndex >= 0) {
              devicesMergedWithRecords[deviceIndex] = {
                ...(device ?? {}),
                ...first(orderBy(episodes, ["last_seen"], ["desc"])),
                total_device_days: reduce(
                  episodes,
                  (totalDays: number, { total_device_days }) =>
                    parseInt(total_device_days) + totalDays,
                  0
                ),
              };
            }
          }
        );
      }
      sanitizedDevices = [
        ...sanitizedDevices,
        ...sanitizeDeviceList(devicesMergedWithRecords),
      ];
    }
    res.status(200).send({ devices: sanitizedDevices });
  } else {
    res.status(status).send(devicesResults);
  }
});

// For fetching device details
/**
 * @swagger
 * /api/devices/details:
 *   get:
 *     description: Get all the details of a device
 *     parameters:
 *       - name: imei
 *         description: Specifies the device IMEI number
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 deviceStatus:
 *                   type: string
 *                   description: Status of a device
 *                 lastHeartBeat:
 *                   type: string
 *                   description: Time for the last received heartbeat signal
 *                 lastOpened:
 *                   type: string
 *                   description: Time when the device was last opened
 *                 batteryLevel:
 *                   type: number
 *                   description: The last recorded device battery level
 *                 alarmDays:
 *                   type: string
 *                   description: The alarm days in binary representation of days of the week, SMTWTFS in a string format. e.g. 1111111
 *                 refillAlarm:
 *                   type: string
 *                   description: Alarm time set for refilling the device with medications
 *                 alarmTime:
 *                   type: string
 *                   description: Alarm time set for taking medications
 *                 alarmStatus:
 *                   type: number
 *                   description: Status of the alarm for the device. 1 indicates active and 0 indicates inactive alarm
 *                 refillAlarmStatus:
 *                   type: number
 *                   description: Status of the refill alarm for the device. 1 indicates active and 0 indicates inactive alarm
 *       404:
 *         description: Device not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   description: Error message
 */
wisePillRouter.get("/devices/details", async (req: Request, res: Response) => {
  const { imei } = req.query;
  const { status, data } = await getDeviceDetailsFromWisepillAPI(`${imei}`);
  if (status === 200) {
    const { Result, ResultCode, records } = data;
    if (parseInt(ResultCode) >= 100) {
      res.status(409).send({ message: Result, code: ResultCode });
    } else {
      const {
        alarm,
        alarm_time,
        refill_alarm,
        refill_alarm_datetime,
        last_battery_level,
        last_opened,
        alarm_days,
        last_seen,
        device_status,
      } = head(records) as any;
      const deviceObject: DeviceDetails = {
        alarmDays: alarm_days ? decimalToBinary(alarm_days) : "",
        alarmTime: alarm_time ?? "",
        alarmStatus: alarm ?? 0,
        refillAlarm: refill_alarm_datetime ?? "",
        refillAlarmStatus: refill_alarm ?? 0,
        batteryLevel: getDeviceBatteryLevel(last_battery_level),
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
/**
 * @swagger
 * /api/devices/assign:
 *   post:
 *     description: For assigning a device and client to a wisepill episode, for adherence tracking.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               imei:
 *                 type: string
 *                 description: Device Imei
 *               patientId:
 *                 type: string
 *                 description: This is the unique identifier for a patient from the DHIS2 instance
 *             required:
 *               - imei
 *               - patientId
 *     responses:
 *       201:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   description: Success message
 *                 status:
 *                   type: number
 *                   description: HTTP status code
 *       409:
 *         description: Encountered conflicts on assigning device. A descriptive message of reason will be sent in the response body.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   description: Conflict message
 *       404:
 *         description: Device not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   description: Error message
 */
wisePillRouter.post("/devices/assign", async (req: Request, res: Response) => {
  // device status
  const assignedDeviceStatus = 1;
  const availableDeviceStatus = 2;
  const damagedDeviceStatus = 3;
  const unavailableDeviceStatus = 9;

  //validate schema
  const { error: bodyValidationError } = createEpisodeSchema.validate(req.body);
  if (bodyValidationError) {
    return res.status(400).json({
      error: bodyValidationError.details.map((error: any) => error.message),
    });
  }
  const { imei, patientId } = req.body;

  // check if device exists
  const findDeviceUrl = `devices/findDevice?input=${imei}`;
  const { data } = await wisePillClient.get(findDeviceUrl);
  const { ResultCode: devicesRequestStatus, records: deviceRecords }: any =
    data;

  if (devicesRequestStatus == 0) {
    const { device_status } = first(deviceRecords as any[]);
    const deviceStatus = parseInt(device_status);

    // get patient details from DHIS2
    let { program, programStage, trackedEntityInstance, orgUnit, episodeId } =
      await getPatientDetailsFromDHIS2(patientId);

    if (!trackedEntityInstance) {
      return res
        .status(404)
        .send({ message: `Patient ${patientId} not found` });
    }

    // Assigning device to episode
    if (deviceStatus === availableDeviceStatus) {
      if (!episodeId) {
        // Creating episode if there are no episodes related to the patient
        episodeId = createDeviceWisepillEpisodes(patientId, imei, res);
      }
      if (episodeId) {
        // Assigning episode to device
        await assignEpisodeToDevice(
          episodeId,
          imei,
          patientId,
          trackedEntityInstance,
          program,
          programStage,
          orgUnit,
          res
        );
      }
    } else if (deviceStatus == assignedDeviceStatus) {
      await unassignPreviousLinkedEpisodes(imei, res);
      if (!episodeId) {
        // Creating episode if there are no episodes related to the patient
        episodeId = createDeviceWisepillEpisodes(patientId, imei, res);
      }
      if (episodeId) {
        await assignEpisodeToDevice(
          episodeId,
          imei,
          patientId,
          trackedEntityInstance,
          program,
          programStage,
          orgUnit,
          res
        );
      } else {
        res.status(404).send({
          message: `Episodes assigned to device ${imei} could not be found`,
        });
      }
    } else if (deviceStatus === damagedDeviceStatus) {
      res.status(409).send({
        message: `Device ${imei} is marked as damaged. Contact your system administrator for follow up.`,
      });
    } else if (deviceStatus === unavailableDeviceStatus) {
      res.status(409).send({
        message: `Device ${imei} is unavailable. Contact your system administrator for follow up.`,
      });
    }
  } else {
    res.status(404).send({ message: `Device ${imei} not found` });
  }
});
