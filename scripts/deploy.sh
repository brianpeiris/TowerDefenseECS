#!/bin/bash
set -e

scriptDirectory=$(dirname "$0")
scriptDirectory=$(realpath "$scriptDirectory")
rootDirectory="$scriptDirectory/.."

git checkout gh-pages

bash "./$scriptDirectory/build.sh"

cd "$rootDirectory";
for library in $(ls libraries); do
	libraryDirectory="$rootDirectory/libraries/$library"
	git add -f "$libraryDirectory/dist"
done

git commit -m "deploy"

git push

trap 'trap - SIGTERM && kill 0' SIGINT SIGTERM EXIT
wait
