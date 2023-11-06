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

import { addAlarmSchema, createEpisodeSchema } from "../schema";
import {
  binaryToDecimal,
  closePreviousLinkedEpisodes,
  getDeviceStatus,
  sanitizeDeviceList,
} from "../helpers/wise-pill-api.helpers";
import wisePillClient from "../clients/wise-pill";
import { DeviceDetails } from "../types";
import { getAssignedDevices } from "../helpers/dhis2-api.helpers";
import logger from "../logging";
import { DateTime } from "luxon";

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
    messsage:
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
 *               refillAlarm:
 *                 type: string
 *                 description:  Alarm to be set for refilling the device with medications in the format of YYYY-MM-DD hh:mm:ss
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
 *                         description: Time for the last heart beath received by the
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

  const assginedDevicesObject = {
    data: {
      imeis: assignedDevices,
    },
  };

  const { status, data: devicesResults } = await wisePillClient.get(
    deviceFetchUrl,
    {
      data: assginedDevicesObject,
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

// For fetching device list
/**
 * @swagger
 * /api/devices/details:
 *   get:
 *     description: Get a list of users based on query parameters
 *     parameters:
 *       - name: imei
 *         description: Specifies the device IMEI number
 *         in: query
 *         required: true
 *         schema:
 *           type: strin
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
 *                 refillAlarm:
 *                   type: string
 *                   description: Alarm time set for refelling the device with medications
 *                 alarmTime:
 *                   type: string
 *                   description: Alarm time set for taking medications
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
 *                   description: HTTP ststus code
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
  //validate schema
  const { error: bodyValidationError } = createEpisodeSchema.validate(req.body);
  if (bodyValidationError) {
    return res.status(400).json({
      error: bodyValidationError.details.map((error: any) => error.message),
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
    // closing previous linked active episodes
    logger.info(`Closing all episodes linked to ${imei}`);
    await closePreviousLinkedEpisodes(imei);

    const { device_status: deviceStatus } = first(deviceRecords as any[]);
    if (deviceStatus == assignedDeviceStatus) {
      // Unassign the assgined devices
      logger.info(`Unassigning ${imei}`);
      const unAssignUrl = `devices/unassignDevice?device_imei=${imei}`;
      await wisePillClient.put(unAssignUrl);
    }

    // Creating Episode
    const date = DateTime.now().toFormat("yyyy-MM-dd");
    const createEpisodeUrl = `episodes/createEpisode?episode_start_date=${date}&external_id=${patientId}`;
    const { data } = await wisePillClient.post(createEpisodeUrl);
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
