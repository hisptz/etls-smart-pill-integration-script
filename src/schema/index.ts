import Joi from "joi";

const deviceSchema = Joi.object({
  imeis: Joi.array().items(Joi.string()),
});
