# DHIS2 TB program and Smart Pill Integration Script

## Introduction

This is a node script that integrates the DHIS2 TB instances with the Wisepill API for adherence. This Script runs the migration between the two systems, but also exposes the API to be used by the DHIS2 instance for accessing the Wisepill adherence data

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
WISEPILL_BASE_URL=<wisepill-api-url>
WISEPILL_USERNAME=<wisepill-username>
WISEPILL_SECRET=<wisepill-secret-key>
PORT=<port-for-api-server>
SECRET_KEY=<optional-secret-key-for-api>
```

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
