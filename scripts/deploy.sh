#!/bin/bash
set -e

scriptDirectory=$(dirname "$0")
scriptDirectory=$(realpath "$scriptDirectory")
rootDirectory="$scriptDirectory/.."
cd "$rootDirectory";

git checkout gh-pages

git merge master

bash "$scriptDirectory/build.sh"

for library in $(ls src/libraries); do
	libraryDirectory="$rootDirectory/src/libraries/$library"
	git add -f "$libraryDirectory/dist"
done

git commit -m "deploy"

git push

trap 'trap - SIGTERM && kill 0' SIGINT SIGTERM EXIT
wait
