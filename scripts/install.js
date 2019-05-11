const fs = require("fs");
const cp = require("child_process");

const libraries = "src/libraries";
for (const dir of fs.readdirSync(libraries)) {
  console.log(cp.execSync("npm ci", { cwd: `${libraries}/${dir}` }).toString());
}
