# DHIS2 and evriMED Integration

## Introduction

This script, written in Node.js with TypeScript, facilitates the integration of evriMED data with DHIS2 for tracking adherence to medication regimens. The script not only performs data integration but also abstracts the evriMED API, making it accessible to DHIS2 web applications by encapsulating authentication and adding data sanitization.

## Dependencies

Since this is a node script, it needs [Node](https://nodejs.org/en) to be installed together with a package manager of preference between [npm](https://www.npmjs.com/) and [yarn](https://yarnpkg.com/).

## Prerequisites

Before using this script, ensure you have the following:

- Node.js installed on your system
- Access to both evriMED and DHIS2 APIs with appropriate permissions
- Configuration files for both systems containing necessary credentials and endpoints

## Getting started

The following are the steps on how to run the script:

### 1. Installing packages

Packages can be installed using `npm` Or `yarn` using the below commands:

```
npm install
```

Or

```
yarn install
```

### 2. Setting environment variables

Environment variables can be set by creating `.env` file with contents similar to `.env.example` Or as shown below:

```
DHIS2_BASE_URL=<url-for-dhis2-instance>
DHIS2_USERNAME=<dhis2-username>
DHIS2_PASSWORD=<dhis2-password>
WISEPILL_BASE_URL=<evriMED-api-url>
WISEPILL_USERNAME=<evriMED-username>
WISEPILL_SECRET=<evriMED-secret-key>
TIME_ZONE=<time-zone>
PORT=<port-for-api-server>
SECRET_KEY=<secret-key-for-api>
```

Note:

- Below is the definition of the above variables:
  - DHIS2_BASE_URL: This is the url to the DHIS2 instance.
  - DHIS2_USERNAME: This is the username for accessing the DHIS2 instance.
  - DHIS2_PASSWORD: This is the password for accessing the DHIS2 instance.
  - WISEPILL_BASE_URL: This is the url for accessing the evriMED API.
  - WISEPILL_USERNAME: This is the username for accessing evriMED API.
  - WISEPILL_SECRET: This is a secret key for accessing the evriMED API
  - TIME_ZONE: This is the optional timezone to be assigned to evriMED devices. If not set, the system timezone will be assigned to the devices.
  - PORT: This is the port where the exposed API will be accessible by DHIS2 applications. If not set, the API service will be available at port:3000.
  - SECRET_KEY: This is the secret key that will be used to access the exposed API. This will be supplied to the DAT web application to assist with data fetch to evriMED API.

### 3. Deployment

The deployment of this script is done in two ways.

- Wisepill API mediator: The mediator assists with the communication between the DHIS2 custom application with the Wisepill smart boxes for operations like device assignment and reading device information.
  <br /><br />
  The mediator will be available at `http://localhost:<PORT>`. This can be configured on the proxy so as the URL that points to this `PORT` can be set within the web application as the mediator URL to allow communication with wisepill API.
  <br /><br />
  The script to start the API mediator can be run by the below `bash` command:

  ```
  sh start-api-server.sh
  ```

- Integration migration script: The integration script assist with migrating the episodes from the Wisepill API into the DHIS2 mapped program as events. This script transforms the string data device into DHIS2 events. This scripts populates the device data into DHIS2 to assist with calendar rendering and reports generation.
  <br /><br />
  The script has different options of running, it can be run for specific day using `start-auto-integration.sh` or on a specific date range using `start-interval-integration.sh --startDate=<start-date> --endDate=<end-date>`
  <br /><br />
  Below are the `bash` command example for running the migrations:

  - Running for the current day:

    ```
    sh start-auto-integration.sh
    ```

    <strong>Note</strong>: This script is advised to be run on a cron job to automate the process of migration in daily basis.

  - Running for a specified range (date format: YYYY-MM-DD):

    ```
    sh start-interval-integration.sh --startDate=2023-01-01 --endDate=2023-06-30
    ```
