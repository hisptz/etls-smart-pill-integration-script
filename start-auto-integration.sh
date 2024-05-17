#!/bin/bash

# Get the current working directory
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Dynamically get the path to the Node.js binary
NODE_BIN=$(which node)

# Path to the node script
NODE_SCRIPT="$DIR/src/index.js start-integration"

# Running the script using node
$NODE_BIN $NODE_SCRIPT
