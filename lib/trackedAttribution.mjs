export function trackedAttributionToken(value) {
  return typeof value === 'string' && /^[a-f0-9]{32,64}$/i.test(value)
    ? value
    : null;
}
