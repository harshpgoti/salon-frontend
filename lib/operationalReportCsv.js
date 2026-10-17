const csvCell = (value) => {
  let text = String(value ?? "");
  // Text from salons/services may be opened in spreadsheet software.
  if (/^\s*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
};

export function operationalReportCsv(report) {
  const rows = [["Metric", "Value", "Definition"]];
  const add = (name, value, definition = "") => rows.push([name, value, definition]);
  add("Generated at (UTC)", report.generated_at);
  add("Metric version", report.metric_version || "");
  add("Date range", `${report.date_from} through ${report.date_to}`,
    `Inclusive local calendar dates in ${report.timezone}.`);
  add("Location filter", report.filters?.location_id || "All authorized locations");
  add("Staff filter", report.filters?.staff_id || "All staff");
  add("Service filter", report.filters?.service_id || "All services");
  add("Timezone basis", report.timezone, report.definitions?.basis || "");
  add("Currency", report.currency || "CAD");
  add("Source", report.source || "");
  add("Bookings total", report.bookings?.total ?? 0,
    report.definitions?.booking_counts || "");
  for (const [status, count] of Object.entries(report.bookings?.by_state || {})) {
    add(`Bookings: ${status}`, count, report.definitions?.booking_counts || "");
  }
  for (const [name, metric] of Object.entries(report.rates || {})) {
    add(name, metric.value ?? "", `${metric.numerator ?? 0} / ${metric.denominator ?? 0}`);
  }
  for (const service of report.service_mix || []) {
    add(`Service: ${service.service}`, `${service.bookings} bookings; ${service.booked_minor} CAD minor`,
      report.definitions?.service_mix || "");
  }
  for (const staff of report.staff_utilization || []) {
    add(`Staff ${staff.staff_name || staff.staff_id} utilization`, staff.utilization ?? "",
      `${staff.booked_minutes} booked minutes / ${staff.scheduled_minutes} available minutes. ${report.definitions?.utilization || ""}`);
  }
  add("Forecast booked value (CAD minor)", report.forecast_booked_value_minor ?? 0,
    report.definitions?.forecast_booked_value || "Booked value, never revenue.");
  for (const [kind, totals] of Object.entries(report.recorded_receipts?.by_kind || {})) {
    add(`Recorded ${kind} (CAD minor)`, totals.minor, report.definitions?.recorded_receipts || "");
  }
  add("Recorded gross receipts (CAD minor)", report.recorded_receipts?.gross_minor ?? 0);
  add("Recorded refunds (CAD minor)", report.recorded_receipts?.refunds_minor ?? 0);
  add("Recorded adjustments (CAD minor)", report.recorded_receipts?.adjustments_minor ?? 0);
  add("Recorded net receipts (CAD minor)", report.recorded_receipts?.net_minor ?? 0,
    report.definitions?.recorded_receipts || "Recorded entries, never processor-settled cash.");
  for (const row of Object.entries(report.definitions || {})) add(`Definition: ${row[0]}`, row[1]);
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
