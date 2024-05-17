#!/bin/bash

# Get the current working directory
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Dynamically get the path to your Node.js binary
NODE_BIN=$(which node)

# Path to your Node.js script
NODE_SCRIPT="$DIR/src/index.js start-integration"

# Initialize startDate and endDate
START_DATE=""
END_DATE=${2:-$(date +%Y-%m-%d)}

# Loop over all arguments to get startDate and endDate
for arg in "$@"
do
    case $arg in
        --startDate=*)
        START_DATE="${arg#*=}"
        shift
        ;;
        --endDate=*)
        END_DATE="${arg#*=}"
        shift
        ;;
    esac
done

# Check if startDate is set
if [ -z "$START_DATE" ]; then
    echo "Error: You must provide startDate."
    exit 1
fi

# Run the script using the Node.js binary and pass the startDate and endDate
$NODE_BIN $NODE_SCRIPT --startDate=$START_DATE --endDate=$END_DATE
