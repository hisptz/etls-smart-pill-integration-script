import Joi from "joi";

export const deviceSchema = Joi.object({
  imeis: Joi.array().items(Joi.string()),
});

export const createEpisodeSchema = Joi.object({
  imei: Joi.string().required(),
  patientId: Joi.string().required(),
  force: Joi.boolean().optional(),
});

export const addAlarmSchema = Joi.object({
  imei: Joi.string().required(),
  alarm: Joi.string().optional().allow(null),
  refillAlarm: Joi.string().optional().allow(null),
  alarmStatus: Joi.number().integer().optional(),
  refillAlarmStatus: Joi.number().integer().optional(),
  days: Joi.string()
    .pattern(/^[0-1]{7}$/)
    .optional()
    .allow(null),
});
