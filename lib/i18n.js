// Minimal locale foundation (TASK-063 AC-2): string keys for en-CA/fr-CA plus
// CAD money and local date/time formatters. Pages adopt keys incrementally;
// the prebuild parity check fails the build when fr-CA drifts from en-CA,
// so French readiness is enforced, not wished for.
//
// CommonJS on purpose: required by Node scripts and imported by Next pages.
const LOCALES = ["en-CA", "fr-CA"];

function preferredLocale(language) {
  const candidate = String(language || "").replaceAll("_", "-").toLowerCase();
  return candidate === "fr" || candidate.startsWith("fr-") ? "fr-CA" : "en-CA";
}

function browserLocale() {
  if (typeof navigator === "undefined") return "en-CA";
  return preferredLocale(navigator.languages?.[0] || navigator.language);
}

const STRINGS = {
  "en-CA": {
    "app.name": "Salon Operations",
    "common.loading": "Loading…",
    "common.save": "Save",
    "common.cancel": "Cancel",
    "common.close": "Close",
    "common.retry": "Try again",
    "common.nothingHere": "Nothing here.",
    "common.tenantWorkspace": "Tenant workspace",
    "nav.team": "Manage your team",
    "status.updated": "Updated",
    "a11y.skipContent": "Skip to content",
    "a11y.skipBooking": "Skip to booking",
  },
  "fr-CA": {
    "app.name": "Opérations Salon",
    "common.loading": "Chargement…",
    "common.save": "Enregistrer",
    "common.cancel": "Annuler",
    "common.close": "Fermer",
    "common.retry": "Réessayer",
    "common.nothingHere": "Rien ici.",
    "common.tenantWorkspace": "Espace salon",
    "nav.team": "Gérer votre équipe",
    "status.updated": "Mis à jour",
    "a11y.skipContent": "Passer au contenu",
    "a11y.skipBooking": "Passer à la réservation",
  },
};

function translate(locale, key) {
  const table = STRINGS[locale] || STRINGS["en-CA"];
  return table[key] ?? STRINGS["en-CA"][key] ?? key;
}

function formatMoney(minor, locale, currency) {
  return new Intl.NumberFormat(locale || "en-CA", {
    style: "currency", currency: currency || "CAD", minimumFractionDigits: 2,
  }).format((minor || 0) / 100);
}

function formatDateTime(value, locale, options) {
  return new Intl.DateTimeFormat(locale || "en-CA", options || {
    dateStyle: "medium", timeStyle: "short",
  }).format(new Date(value));
}

function localeKeys(locale) {
  return Object.keys(STRINGS[locale] || {});
}

module.exports = { LOCALES, preferredLocale, browserLocale, translate, formatMoney, formatDateTime, localeKeys };
