//An example of how to use the dhis2Client TODO: Delete/modify this file when using a specific case

import dhis2Client from "./dhis2";
import logger from "../logging";

export async function printDHIS2Info() {
    try {
        const response = await dhis2Client.get(`system/info`);
        if (response.status === 200) {
            const {version, revision, systemName} = response.data;
            logger.info(`DHIS2 system name: ${systemName}`)
            logger.info(`DHIS2 system version: ${version}`)
            logger.info(`Revision: ${revision}`)
            console.log(`===========================================================`)
            return;
        } else {
            logger.error(`Error getting DHIS2 system info`)
            logger.error(`Status code: ${response.status} - ${response.statusText}`)
        }
    } catch (e: any) {
        console.log(e.response)
        logger.error(`Error getting DHIS2 system info: ${e.message ?? JSON.stringify(e)}`)
    }
}
