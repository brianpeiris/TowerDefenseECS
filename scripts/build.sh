#!/bin/bash
scriptDirectory=$(dirname "$0")
scriptDirectory=$(realpath "$scriptDirectory")
rootDirectory="$scriptDirectory/.."
cd "$rootDirectory";
for library in $(ls libraries); do
	libraryDirectory="$rootDirectory/libraries/$library"
	npx webpack "$libraryDirectory/src/main.js" -o "$libraryDirectory/dist/main.js" --mode production
done
