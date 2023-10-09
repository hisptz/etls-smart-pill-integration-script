import axios from "axios";
import {config} from "dotenv";

config();

const baseURL = process.env.DHIS2_BASE_URL ?? ""
const username = process.env.DHIS2_USERNAME ?? ""
const password = process.env.DHIS2_PASSWORD ?? ""

const dhis2Client = axios.create({
    baseURL: `${baseURL}/api/`,
    auth: {
        username,
        password
    },
    headers: {
        'Accept': "application/json"
    }
})
export default dhis2Client;
