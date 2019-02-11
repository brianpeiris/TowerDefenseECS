module.exports = {
  env: { browser: true, es6: true, node: true },
  plugins: ["prettier"],
  extends: ["prettier", "eslint:recommended"],
  rules: { "prettier/prettier": "error" }
};
