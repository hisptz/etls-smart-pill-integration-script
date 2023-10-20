import Joi from "joi";

export const deviceSchema = Joi.object({
  imeis: Joi.array().items(Joi.string()),
});

export const createEpisodeSchema = Joi.object({
  imei: Joi.string().required(),
  patientId: Joi.string().required(),
});

export const addAlarmSchema = Joi.object({
  imei: Joi.string().required(),
  alarm: Joi.string().optional().allow(null),
  refillAlarm: Joi.string().optional().allow(null),
  days: Joi.string()
    .pattern(/^[0-1]{7}$/)
    .optional()
    .allow(null),
});
