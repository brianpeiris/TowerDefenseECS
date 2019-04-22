#!/bin/bash
set -e

scriptDirectory=$(dirname "$0")
scriptDirectory=$(realpath "$scriptDirectory")
rootDirectory="$scriptDirectory/.."
cd "$rootDirectory";

for library in $(ls src/libraries); do
	libraryDirectory="$rootDirectory/src/libraries/$library"
	NODE_ENV=production npx webpack "$libraryDirectory/main.js" -o "$libraryDirectory/dist/main.js" --mode production
done
