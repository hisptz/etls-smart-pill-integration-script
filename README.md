# Node Script Template

## Introduction

This is a node script template for scripts used to interact with DHIS2. This template contains the basic setup for a
script that
is intended to interact with a DHIS2 instance.

## How to use

Open the script in [github](https://github.com/hisptz/node-script-template) and click use template to get started.

## Tooling

This template comes with some already configured tools to use for the scripts. Some of the tools are:

- Commander: This is a tool to improve the script user experience when using the
  script. [Learn more](https://www.npmjs.com/package/commander)
- Winston: A tool for logging different information within the
  script. [Learn more](https://www.npmjs.com/package/winston)
- Axios: A HTTP client for accessing DHIS2 API resources or any http
  resources. [Learn more](https://www.npmjs.com/package/axios)

Most of these tools have the basic configuration and can be used directly

### Using commander

By default, the commander program has been parsed in the `index.ts` of the script (Hence it is the entrypoint of the
script). Meaning you can directly use the configured program commands. To name your program, add a description, commands
and options, edit the `commands/index.ts` file. You can learn how to configure commander
programs [here](https://www.npmjs.com/package/commander#declaring-program-variable)

### Using winston logger

The winston logger has been configured within the `logging/index.ts` with basic configuration. It is configured to
create a logs folder and a log file as well as print the logs to the console. To change this behaviour edit the
configuration in the `logging/index.ts`. For more configuration options
see [here](https://www.npmjs.com/package/winston#logging).

### Using axios

By default, only the DHIS2 API axios client is configured (see `clients/dhis2`). This axios client is already configured
with the DHIS2 base URL as well as the basic credentials. For the client usage you can see the example
in `clients.sysInfo.ts` file (This file was provided as an example. You can delete it with the respective command
in `commands/index.ts`). If you want to access another HTTP resource, you can create another client file and define your
client.

## Issues

If you encounter any issues or would like to recommend features open an issue on the
project's [issues](https://github.com/hisptz/node-script-template/issues) page.
