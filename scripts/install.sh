#!/bin/bash
scriptDirectory=$(dirname "$0")
scriptDirectory=$(realpath "$scriptDirectory")
rootDirectory="$scriptDirectory/.."
pushd "$rootDirectory"
npm ci
popd
for library in $(ls libraries); do
	pushd "$rootDirectory/libraries/$library"
	npm ci
	popd
done
