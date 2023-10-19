import { Router, Request, Response, NextFunction } from "express";
import { DateTime } from "luxon";
import wisePillClient from "../clients/wise-pill";
import { Device } from "../types";
import {
  DAMAGED_OR_LOST,
  DEVICE_AVAILABLE,
  DEVICE_LINKED,
  DEVICE_UNAVAILABLE,
} from "../constants";

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
    messsage: "Welcome to the integration API",
  };
  res.status(200).send(response);
});

// For fetching device list
router.get("/deviceDetails", async (req: Request, res: Response) => {
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
        device_status,
      } = records;
      const deviceObject: Device = {
        alarmTime: alarm ?? "",
        refillAlarm: refill_alarm_datetime ?? "",
        batteryLevel: parseInt(`${last_battery_level}`) / 100,
        lastOpened: last_opened ?? "",
        deviceStatus:
          device_status === 1
            ? DEVICE_LINKED
            : device_status === 2
            ? DEVICE_AVAILABLE
            : device_status === 3
            ? DAMAGED_OR_LOST
            : device_status === 9
            ? DEVICE_UNAVAILABLE
            : "",
      };
      res.status(status).send(deviceObject);
    }
  } else {
    res.status(status).send(data);
  }
});

// For setting device alarm
router.post("/alarms", (req: Request, res: Response) => {});

// For fetching device events
router.get("/events", (req: Request, res: Response) => {});

// For fetching device list
router.get("/devices", async (req: Request, res: Response) => {});

// For assigning device
router.post("/devices/assign", async (req: Request, res: Response) => {
  // TODO validate body
  const { imei, patientId } = req.body;

  // Finding device
  const availableStatus = 2;
  const findDeviceUrl = `devices/findDevice?device_status=${availableStatus}&input=${imei}`;
  const { data } = await wisePillClient.get(findDeviceUrl);
  const { status: deviceStatus }: any = data;

  if (deviceStatus === 0) {
    // Creating Episode
    const date = DateTime.now().format("YYYY-MM-DD");
    const createEpisodeUrl = `episodes/createEpisode?episode_start_date=${date}&external_id=${patientId}`;
    const { data } = await wisePillClient.post(createEpisodeUrl);
    const {
      ResultCode: creatEpisodeResultCode,
      Result: message,
      episode_id: episodeId,
    }: any = data;

    if (creatEpisodeResultCode === 0 && episodeId) {
      // Assigning episode to device
      const assignDeviceUrl = `devices/assignDevice?episode_id=${episodeId}&device_imei=${imei}`;
      const { data } = await wisePillClient.put(assignDeviceUrl);
      const {
        ResultCode: deviceAssignmentCode,
        Result: deviceAssigmnetResult,
      }: any = data;
      if (deviceAssignmentCode === 0) {
        res
          .status(201)
          .send({
            status: 201,
            message: `Device ${imei} assigned to ${patientId}`,
          });
      } else {
        res.status(409).send({ message: deviceAssigmnetResult });
      }
    } else {
      res.status(409).send({
        message:
          creatEpisodeResultCode === 1
            ? `Episode already exist for ${imei}`
            : message ?? `Failed to create Episode for ${imei}`,
      });
    }
  } else {
    res.status(404).send({ message: "Device not found" });
  }
});

export default router;
