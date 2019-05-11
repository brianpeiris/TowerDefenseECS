const fs = require("fs");
const cp = require("child_process");

const libraries = "src/libraries";

const singleLibrary = process.argv[2];
if (singleLibrary) {
  runLibrary(singleLibrary);
} else {
  fs.readdirSync(libraries).forEach(runLibrary);
}

logOutput(
  cp.exec(
    `npx browser-sync start --config .browser-sync.config.js --files "*.html" --files "${libraries}/*/dist/main.js"`
  )
);

function runLibrary(library) {
  const libraryDir = `${libraries}/${library}`;
  console.log("BPDEBUG libraryDir", libraryDir);
  logOutput(cp.exec(`npx webpack "${libraryDir}/main.js" -o "${libraryDir}/dist/main.js" --mode development -w`));
}

function logOutput(process) {
  process.stdout.on("data", console.log);
  process.stderr.on("data", console.error);
}
