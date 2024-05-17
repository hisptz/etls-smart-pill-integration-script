#!/bin/bash

# Get the current working directory
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Dynamically get the path to your Node.js binary
NODE_BIN=$(which node)

# Path to the script
NODE_SCRIPT="$DIR/src/index.js start-integration"

# Initialize endDate
END_DATE={$(date +%Y-%m-%d)}


# Run the Node.js script using the Node.js binary and pass the startDate and endDate
$NODE_BIN $NODE_SCRIPT --endDate=$END_DATE
