import axios from "axios";
import { config } from "dotenv";

config();

const baseURL = process.env.WISEPILL_BASE_URL ?? "";
const username = process.env.WISEPILL_USERNAME ?? "";
const secret = process.env.WISEPILL_SECRET ?? "";

const wisePillClient = axios.create({
  baseURL: `${baseURL}/`,
  headers: {
    Accept: "application/json",
    Username: username,
    Secret: secret,
  },
});

export default wisePillClient;
