import Joi from "joi";

export const deviceSchema = Joi.object({
  imeis: Joi.array().items(Joi.string()),
});

export const createEpisodeSchema = Joi.object({
  imei: Joi.string().required(),
  patientId: Joi.string().required(),
});
