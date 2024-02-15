# DHIS2 and evriMED Integration Script

## Introduction

This script, written in Node.js with TypeScript, facilitates the integration of evriMED data with DHIS2 for tracking adherence to medication regimens. The script not only performs data integration but also abstracts the evriMED API, making it accessible to DHIS2 web applications by encapsulating authentication and adding data sanitization.

## Tooling

This script uses the following basic packages as basic toolings:

- Commander: This is a tool to improve the script user experience when using the
  script. [Learn more](https://www.npmjs.com/package/commander)
- Winston: A tool for logging different information within the
  script. [Learn more](https://www.npmjs.com/package/winston)
- Axios: A HTTP client for accessing DHIS2 API resources Or any http
  resources. [Learn more](https://www.npmjs.com/package/axios)
- Luxon: A javascript package for manipulating time. [Learn more](https://www.npmjs.com/package/luxon)
- Lodash: A javascript package for manipulating objects and arrays. [Learn more](https://www.npmjs.com/package/lodash)

## Getting started

### Cloning the project

The source code can be clones from [github](https://github.com/hisptz/etls-smart-pill-integration-script) using:

```
git clone https://github.com/hisptz/etls-smart-pill-integration-script
```

### Installing packages

Packages can be installed using `npm` Or `yarn` using bellow commands:

```
npm install
```

Or

```
yarn install
```

### Setting environment variables

Environment variables can be set by creating `.env` file with contents similar as `.env.example` Or as shown below:

```
DHIS2_BASE_URL=<url-for-dhis2-instance>
DHIS2_USERNAME=<dhis2-username>
DHIS2_PASSWORD=<dhis2-password>
WISEPILL_BASE_URL=<evriMED-api-url>
WISEPILL_USERNAME=<evriMED-username>
WISEPILL_SECRET=<evriMED-secret-key>
PORT=<port-for-api-server>
SECRET_KEY=<optional-secret-key-for-api>
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

### Running the application

The script can be run using either `npm` Or `yarn` as show bellow:

- Running the API server:

```
npm run start-api-server
```

Or

```
yarn start-api-server
```

- Running migration for a specified range (date format: YYYY-MM-DD)

```
npm run start-integration --startDate 2023-01-01 --endDate 2023-06-30
```

Or

```
yarn start-integration --startDate 2023-01-01 --endDate 2023-06-30
```

## Building

The script can be build using `npm` Or `yarn` as show below:

```
npm run build
```

Or

```
yarn build
```
