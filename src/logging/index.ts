import winston from "winston";
import {config} from "dotenv";

config();
const logger = winston.createLogger({
    format: winston.format.cli({}),
    defaultMeta: {},
    transports: [
        new winston.transports.Console({}),
        new winston.transports.File({
            filename: "logs/log",
            tailable: true,

        })
    ]
});

export default logger;
