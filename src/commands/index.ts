import {Command} from "commander";
import appDetails from "../../package.json"
import logger from "../logging";
import {printDHIS2Info} from "../clients/sysInfo";

const program = new Command();

program.name("hello-dhis2-script").description("An example program. Delete this when using the template").version(appDetails.version);

program.command("say-hi").option("-n --name <name>", "The name of the user").action((args) => {
    const {name} = args ?? {}
    //Here you can call any of your functions to do what is necessary. Use the args to access the argument object as specified on the options
    logger.info(`Hello ${name}, Welcome to the dhis2-node-script`)
})

program.command(`dhis2-info`).description("Print out connected DHIS2 instance information").action(async () => {
    await printDHIS2Info()
})
export default program;
