#!/bin/bash
set -e

scriptDirectory=$(dirname "$0")
scriptDirectory=$(realpath "$scriptDirectory")
rootDirectory="$scriptDirectory/.."
cd "$rootDirectory";

if [[ -n "$1" ]]; then
	libraryDirectory="$rootDirectory/src/libraries/$1"
	npx webpack "$libraryDirectory/main.js" -o "$libraryDirectory/dist/main.js" --mode development -w &
else
	for library in $(ls src/libraries); do
		libraryDirectory="$rootDirectory/src/libraries/$library"
		npx webpack "$libraryDirectory/main.js" -o "$libraryDirectory/dist/main.js" --mode development -w &
	done
fi
npx browser-sync start -s -w --no-open --no-notify --no-ghost-ui --files 'src/libraries/*/dist/main.js' &
trap 'trap - SIGTERM && kill 0' SIGINT SIGTERM EXIT
wait
