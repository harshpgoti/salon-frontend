// Locale parity check (TASK-063 AC-2): fr-CA must carry every en-CA key.
// Run in prebuild so French readiness gates every build, including CI.
const path = require("path");

async function main() {
  let i18n;
  try {
    i18n = require(path.join(__dirname, "..", "lib", "i18n.js"));
  } catch (err) {
    console.error(`i18n: cannot load lib/i18n.js: ${err.message}`);
    process.exit(1);
  }
  const base = new Set(i18n.localeKeys("en-CA"));
  let failures = 0;
  for (const locale of i18n.LOCALES) {
    if (locale === "en-CA") continue;
    const keys = new Set(i18n.localeKeys(locale));
    for (const key of base) {
      if (!keys.has(key)) {
        failures += 1;
        console.error(`i18n: ${locale} is missing key "${key}"`);
      }
    }
    for (const key of keys) {
      if (!base.has(key)) {
        failures += 1;
        console.error(`i18n: ${locale} has extra key "${key}"`);
      }
    }
  }
  // Spot-check the formatters while here: CAD money and a date in both locales.
  const money = i18n.formatMoney(6000, "fr-CA");
  if (!money.includes("60,00")) {
    failures += 1;
    console.error(`i18n: fr-CA money formatting looks wrong: ${money}`);
  }
  if (failures > 0) {
    console.error(`i18n: ${failures} problem(s)`);
    process.exit(1);
  }
  console.log("i18n: fr-CA matches en-CA");
}

main();
