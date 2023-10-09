import {config} from "dotenv";
import program from "./commands";

config()
program.parse(process.argv)
