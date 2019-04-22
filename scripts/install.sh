#!/bin/bash
set -e

scriptDirectory=$(dirname "$0")
scriptDirectory=$(realpath "$scriptDirectory")
rootDirectory="$scriptDirectory/.."
pushd "$rootDirectory"

npm ci
popd
for library in $(ls src/libraries); do
	pushd "$rootDirectory/src/libraries/$library"
	npm ci
	popd
done
