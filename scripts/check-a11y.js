// Static accessibility audit for pages (TASK-063 AC-1). Run in prebuild:
// every form control must be labelled (wrapping <label> or aria-label[lledby]),
// every page needs exactly one <h1>, error text needs role=alert, loading and
// status text needs role=status (or aria-live). Exits non-zero on violation.
const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "..", "pages");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".jsx") && !f.startsWith("_"));
let failures = 0;

function fail(file, message) {
  failures += 1;
  console.error(`a11y: ${file}: ${message}`);
}

for (const file of files) {
  const src = fs.readFileSync(path.join(dir, file), "utf8");

  // Exactly one h1 per page.
  const h1 = (src.match(/<h1[\s>]/g) || []).length;
  if (h1 !== 1) fail(file, `expected exactly one <h1>, found ${h1}`);

  // Every <input>/<select>/<textarea> labelled. Crude but effective: strip
  // <label>...</label> spans first, then require aria-* on the remainder.
  const withoutLabels = src.replace(/<label[\s>][\s\S]*?<\/label>/g, "");
  const controls = withoutLabels.match(/<(input|select|textarea)[\s>][^>]*\/?>/g) || [];
  for (const control of controls) {
    if (!/aria-(label|labelledby)=/.test(control)) {
      fail(file, `unlabelled control: ${control.slice(0, 80)}`);
    }
  }

  // Buttons and links need discernible text: flag empties.
  for (const match of src.match(/<button[^>]*>\s*<\/button>/g) || []) {
    fail(file, `empty button: ${match.slice(0, 80)}`);
  }

  // Data pages (fetch) must announce errors and results: role=alert for
  // failures, role=status or aria-live for loading/result states.
  if (/fetch\(/.test(src)) {
    if (!/role="alert"/.test(src)) fail(file, "fetching page has no role=alert error region");
    if (!/role="status"|aria-live/.test(src)) {
      fail(file, "fetching page has no role=status/aria-live result region");
    }
  }
}

if (failures > 0) {
  console.error(`a11y: ${failures} violation(s)`);
  process.exit(1);
}
console.log("a11y: pages pass static audit");
