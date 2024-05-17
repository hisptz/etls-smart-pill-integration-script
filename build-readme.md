# DHIS2 and evriMED Integration

## Introduction

This script, written in Node.js with TypeScript, facilitates the integration of evriMED data with DHIS2 for tracking adherence to medication regimens. The script not only performs data integration but also abstracts the evriMED API, making it accessible to DHIS2 web applications by encapsulating authentication and adding data sanitization.

## Dependencies

Since this is a node script, it needs [Node](https://nodejs.org/en) to be installed together with a package manager of preference between [npm](https://www.npmjs.com/) and [yarn](https://yarnpkg.com/).

## Prerequisites

Before using this script, ensure you have the following:

- Node.js installed on your system
- TypeScript installed globally (npm install -g typescript)
- Access to both evriMED and DHIS2 APIs with appropriate permissions
- Configuration files for both systems containing necessary credentials and endpoints

## Getting started

The following are the steps on how to run the script:

### 1. Installing packages

Packages can be installed using `npm` Or `yarn` using below commands:

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
  - TIME_ZONE: This is the optional timezone to be assigned to evriMED devices. If not set, the system timezone will be assigned to the devices.
  - PORT: This is the port where the exposed API will be accessible by DHIS2 applications. If not set, the API service will be available at port:3000.
  - SECRET_KEY: This is the secret key that will be used to access the exposed API. This will be supplied to the DAT web application to assist with data fetch to evriMED API.

### 3. Running the application

The script can be run using `bash` scripts as shown below:

- Starting the API server: The API server can be started using the command

```
sh start-api-server.sh
```

- Running migration: To run migration, there are two options, running daily or running in a specific range.

  - Running for the current day:
    ```
    sh start-auto-integration.sh
    ```
  - Running for a specified range (date format: YYYY-MM-DD):

    ```
    sh start-interval-integration.sh --startDate=2023-01-01 --endDate=2023-06-30
    ```

  - Running migration alignment: To run migration aligment, use the below `bash` sxcrip.

        ```
        sh start-alignment.sh
        ```
