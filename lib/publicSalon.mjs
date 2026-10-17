const STEPS = new Set([
  'business_identity', 'location', 'hours', 'service', 'qualified_staff',
  'public_link', 'communication_setup', 'import',
]);

function optionalText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function timeZone(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try { new Intl.DateTimeFormat('en', { timeZone: value }).format(0); return value; }
  catch { return null; }
}

function projectPublicHours(value) {
  if (!value || typeof value !== 'object') return null;
  const date = /^\d{4}-\d{2}-\d{2}$/;
  const clock = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  const weekly = Array.isArray(value.weekly) ? value.weekly.filter(row => row && Number.isInteger(row.weekday)
    && row.weekday >= 0 && row.weekday <= 6 && typeof row.opens_at === 'string' && clock.test(row.opens_at)
    && typeof row.closes_at === 'string' && clock.test(row.closes_at)
    && typeof row.effective_from === 'string' && date.test(row.effective_from)
    && (row.effective_to == null || (typeof row.effective_to === 'string' && date.test(row.effective_to))))
    .map(row => ({ weekday: row.weekday, opensAt: row.opens_at, closesAt: row.closes_at,
      effectiveFrom: row.effective_from, effectiveTo: row.effective_to || null })) : [];
  const exceptions = Array.isArray(value.exceptions) ? value.exceptions.filter(row => row && typeof row.exception_date === 'string' && date.test(row.exception_date)
    && ['closed', 'custom'].includes(row.kind)
    && (row.kind === 'closed' || (typeof row.opens_at === 'string' && clock.test(row.opens_at)
      && typeof row.closes_at === 'string' && clock.test(row.closes_at))))
    .map(row => ({ date: row.exception_date, kind: row.kind,
      opensAt: row.opens_at || null, closesAt: row.closes_at || null,
      label: optionalText(row.label) })) : [];
  return { timezone: timeZone(value.timezone), weekly, exceptions };
}

export function projectPublicSalon(value) {
  if (!value || typeof value !== 'object' || typeof value.accepting_bookings !== 'boolean'
      || !Array.isArray(value.missing_setup)) return null;
  const branding = value.branding && typeof value.branding === 'object' ? value.branding : {};
  const primary = typeof branding.primary_colour === 'string' && /^#[0-9a-f]{6}$/i.test(branding.primary_colour)
    ? branding.primary_colour : null;
  const accent = typeof branding.accent_colour === 'string' && /^#[0-9a-f]{6}$/i.test(branding.accent_colour)
    ? branding.accent_colour : null;
  const policy = value.booking_policy && typeof value.booking_policy === 'object'
    && typeof value.booking_policy.text === 'string' && value.booking_policy.text.trim().length > 0
    && value.booking_policy.text.trim().length <= 2000
    && Number.isInteger(value.booking_policy.version) && value.booking_policy.version >= 1
    ? { text: value.booking_policy.text.trim(), version: value.booking_policy.version } : null;
  return {
    businessName: optionalText(value.business_name) || 'Salon',
    locationName: optionalText(value.location_name),
    timezone: timeZone(value.timezone),
    publicHours: projectPublicHours(value.public_hours),
    branding: {
      brandName: optionalText(branding.brand_name),
      primaryColour: primary,
      accentColour: accent,
    },
    bookingPolicy: policy,
    acceptingBookings: value.accepting_bookings,
    missingSetup: value.missing_setup.filter(step => typeof step === 'string' && STEPS.has(step)),
  };
}

export function projectPublicBookingProfile(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.services)) return [];
  return value.services.filter(service => service && typeof service.id === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(service.id)
    && typeof service.name === 'string' && service.name.trim().length > 0
    && Number.isInteger(service.duration_minutes) && service.duration_minutes >= 5
    && Number.isInteger(service.price_minor) && service.price_minor >= 0
    && service.currency === 'CAD')
    .map(service => ({ id: service.id, name: service.name.trim(),
      durationMinutes: service.duration_minutes, priceMinor: service.price_minor,
      currency: service.currency }));
}

export function projectPublicAvailability(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.slots)) return [];
  return value.slots.filter(slot => slot && typeof slot.starts_at === 'string'
    && !Number.isNaN(Date.parse(slot.starts_at)) && typeof slot.ends_at === 'string'
    && !Number.isNaN(Date.parse(slot.ends_at)) && typeof slot.staff_id === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(slot.staff_id)
    && typeof slot.staff_name === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(slot.local_date)
    && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(slot.local_time)
    && typeof slot.timezone === 'string')
    .map(slot => ({ startsAt: slot.starts_at, endsAt: slot.ends_at,
      staffId: slot.staff_id, staffName: slot.staff_name, localDate: slot.local_date,
      localTime: slot.local_time, timezone: slot.timezone }));
}

export async function loadPublicSalon(slug, { apiBase = process.env.API_BASE_URL, fetchImpl = fetch } = {}) {
  if (typeof slug !== 'string' || !slug.trim() || !apiBase) return { state: 'unavailable' };
  try {
    const headers = { accept: 'application/json' };
    const options = { headers, redirect: 'manual', signal: AbortSignal.timeout(8000) };
    const [response, hoursResponse, bookingResponse] = await Promise.all([
      fetchImpl(new URL(`/v1/public/salons/${encodeURIComponent(slug)}`, apiBase), options),
      fetchImpl(new URL(`/v1/public/salons/${encodeURIComponent(slug)}/hours`, apiBase), options),
      fetchImpl(new URL(`/v1/public/salons/${encodeURIComponent(slug)}/booking-profile`, apiBase), options),
    ]);
    if (response.status === 404) return { state: 'not_found' };
    if (!response.ok || !hoursResponse.ok || !bookingResponse.ok) return { state: 'unavailable' };
    const [body, hours, booking] = await Promise.all([
      response.json(), hoursResponse.json(), bookingResponse.json(),
    ]);
    const salon = projectPublicSalon({ ...body, public_hours: hours });
    return salon ? { state: 'salon', salon: { ...salon,
      services: projectPublicBookingProfile(booking) } } : { state: 'unavailable' };
  } catch {
    return { state: 'unavailable' };
  }
}

export async function loadPublicAvailability(slug, serviceId, date, {
  apiBase = process.env.API_BASE_URL, fetchImpl = fetch,
} = {}) {
  if (typeof slug !== 'string' || !slug.trim() || !apiBase
      || typeof serviceId !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(serviceId)
      || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)
      || !Number.isFinite(Date.parse(`${date}T00:00:00Z`))
      || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
    return { state: 'unavailable', slots: [] };
  }
  try {
    const url = new URL(`/v1/public/salons/${encodeURIComponent(slug)}/availability`, apiBase);
    url.searchParams.set('service_id', serviceId);
    url.searchParams.set('date_from', date);
    url.searchParams.set('date_to', date);
    const response = await fetchImpl(url, {
      headers: { accept: 'application/json' }, redirect: 'manual',
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return { state: response.status === 404 ? 'not_found' : 'unavailable', slots: [] };
    const body = await response.json();
    return { state: 'available', timezone: typeof body.timezone === 'string' ? body.timezone : null,
      slots: projectPublicAvailability(body) };
  } catch {
    return { state: 'unavailable', slots: [] };
  }
}
