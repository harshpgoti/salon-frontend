import Head from 'next/head';
import { useEffect, useRef, useState } from 'react';
import { loadPublicSalon, loadPublicAvailability } from '../../lib/publicSalon.mjs';
import { zonedInstant } from '../../lib/timezone';
import { trackedAttributionToken } from '../../lib/trackedAttribution.mjs';
import { formatMoney, formatDateTime, translate } from '../../lib/i18n';
import {useBrowserLocale} from '../../lib/useBrowserLocale';

const STEP_LABELS = {
  business_identity: 'business details',
  location: 'salon location',
  hours: 'opening hours',
  service: 'services',
  qualified_staff: 'qualified team members',
  public_link: 'booking link',
  communication_setup: 'communication settings',
  import: 'client setup',
};
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function localTomorrow(timezone) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const today = `${parts.find(part => part.type === 'year').value}-${parts.find(part => part.type === 'month').value}-${parts.find(part => part.type === 'day').value}`;
  const nextDay = new Date(`${today}T12:00:00Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  return nextDay.toISOString().slice(0, 10);
}

function dateTimeLocalAt(instant, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(instant));
  const fields = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}T${fields.hour}:${fields.minute}`;
}

export async function getServerSideProps({ params, query, res }) {
  const result = await loadPublicSalon(params?.slug);
  if (result.state === 'not_found') return { notFound: true };
  if (result.state === 'unavailable') res.statusCode = 503;
  if (result.state !== 'salon') return { props: result };
  const requestedService = typeof query?.service_id === 'string' ? query.service_id : null;
  const attributionToken = trackedAttributionToken(query?.attribution_token);
  const selectedService = result.salon.services.find(service => service.id === requestedService)
    || result.salon.services[0] || null;
  const date = validDate(query?.date) ? query.date : localTomorrow(result.salon.timezone);
  const availability = selectedService
    ? await loadPublicAvailability(params.slug, selectedService.id, date)
    : { state: 'available', slots: [] };
  return { props: { ...result, slug: params.slug, salon: { ...result.salon, booking: {
    serviceId: selectedService?.id || '', date,
    timezone: availability.timezone || result.salon.timezone,
    state: availability.state, slots: availability.slots,
  } }, attributionToken } };
}

export default function PublicSalonPage({ state, salon, slug, attributionToken = null }) {
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [hold, setHold] = useState(null);
  const [contact, setContact] = useState({ name: '', email: '', phone: '' });
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [managedBooking, setManagedBooking] = useState(null);
  const [manageLoading, setManageLoading] = useState(false);
  const [manageToken, setManageToken] = useState('');
  const [manageAppointmentId, setManageAppointmentId] = useState('');
  const [manageStartsAt, setManageStartsAt] = useState('');
  const [manageActionBusy, setManageActionBusy] = useState(false);
  const [manageNotice, setManageNotice] = useState('');
  const locale = useBrowserLocale();
  const [manageError, setManageError] = useState('');
  const manageCommand = useRef(null);
  const contactNameRef = useRef(null);
  const receiptRef = useRef(null);
  const brand = salon?.branding || {};
  const title = brand.brandName || salon?.businessName || 'Salon booking';
  const theme = {
    '--salon-primary': brand.primaryColour || '#334b39',
    '--salon-accent': brand.accentColour || '#8c2626',
  };
  const weeklyPatterns = new Map();
  for (const interval of salon?.publicHours?.weekly || []) {
    const key = `${interval.effectiveFrom}/${interval.effectiveTo || ''}`;
    if (!weeklyPatterns.has(key)) weeklyPatterns.set(key, { from: interval.effectiveFrom, to: interval.effectiveTo, rows: [] });
    weeklyPatterns.get(key).rows.push(interval);
  }

  useEffect(() => {
    if (!slug || typeof window === 'undefined') return;
    const appointmentId = new URLSearchParams(window.location.search).get('appointment_id');
    const token = window.location.hash.slice(1);
    if (!appointmentId || !token) return;
    let active = true;
    setManageAppointmentId(appointmentId); setManageToken(token);
    setManageLoading(true);
    fetch(`/api/public-booking?operation=manage&slug=${encodeURIComponent(slug)}&appointment_id=${encodeURIComponent(appointmentId)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
    }).then(async response => {
      const result = await response.json();
      if (!active) return;
      if (!response.ok) throw new Error(result?.detail?.code || 'management_unavailable');
      setManagedBooking(result);
      setManageStartsAt(dateTimeLocalAt(result.starts_at, result.timezone));
    }).catch(() => {
      if (active) setManageError('This booking link is invalid or has expired.');
    }).finally(() => { if (active) setManageLoading(false); });
    return () => { active = false; };
  }, [slug]);

  useEffect(() => {
    if (hold && selectedSlot && !receipt) contactNameRef.current?.focus();
  }, [hold, selectedSlot, receipt]);

  useEffect(() => {
    if (receipt) receiptRef.current?.focus();
  }, [receipt]);

  async function manageAppointment(action) {
    if (manageActionBusy || !managedBooking || !managedBooking.can_manage) return;
    setManageActionBusy(true); setManageError(''); setManageNotice('');
    try {
      const facts = { expected_version: managedBooking.version };
      if (action === 'reschedule') facts.starts_at = zonedInstant(manageStartsAt, managedBooking.timezone);
      const fingerprint = JSON.stringify({ slug, appointment: manageAppointmentId, action, ...facts });
      if (manageCommand.current?.fingerprint !== fingerprint) {
        manageCommand.current = { fingerprint, key: crypto.randomUUID() };
      }
      const operation = action === 'cancel' ? 'manage_cancel' : 'manage_reschedule';
      const response = await fetch(`/api/public-booking?operation=${operation}&slug=${encodeURIComponent(slug)}&appointment_id=${encodeURIComponent(manageAppointmentId)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: manageToken, ...facts, idempotency_key: manageCommand.current.key }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.detail?.code || 'management_unavailable');
      manageCommand.current = null;
      const booking = action === 'cancel'
        ? { ...managedBooking, status: 'cancelled', version: managedBooking.version + 1, can_manage: false,
            manage_blocked_reason: 'appointment_not_modifiable' }
        : { ...managedBooking, starts_at: result.starts_at, ends_at: result.ends_at,
            version: managedBooking.version + 1 };
      setManagedBooking(booking);
      setManageStartsAt(dateTimeLocalAt(booking.starts_at, booking.timezone));
      setManageNotice(action === 'cancel' ? 'Your appointment was cancelled.' : 'Your appointment was rescheduled.');
    } catch (cause) {
      setManageError(cause.message === 'appointment_version_conflict'
        ? 'This booking changed. Reload your management link before trying again.'
        : cause.message === 'public_management_requires_salon' || cause.message === 'booking_policy_changed'
          ? 'The salon’s current cancellation terms require you to contact the salon to change this booking.'
          : cause.message === 'appointment_not_modifiable'
            ? 'This appointment can no longer be changed online.'
            : `We could not update this booking (${cause.message}).`);
    } finally { setManageActionBusy(false); }
  }

  async function reserveSlot(slot) {
    setBusy(true); setError(''); setReceipt(null); setSelectedSlot(slot); setHold(null);
    try {
      const response = await fetch(`/api/public-booking?operation=hold&slug=${encodeURIComponent(slug)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_id: salon.booking.serviceId, staff_id: slot.staffId,
          starts_at: slot.startsAt, idempotency_key: crypto.randomUUID() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.detail?.code || 'slot_unavailable');
      setHold(result);
    } catch {
      setError('That time is no longer available. Choose another time and try again.');
      setSelectedSlot(null);
    } finally { setBusy(false); }
  }

  async function confirmBooking(event) {
    event.preventDefault();
    if (!hold || !salon.bookingPolicy) return;
    if (!contact.email.trim() && !contact.phone.trim()) {
      setError('Enter an email address or phone number so the salon can reach you.'); return;
    }
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/public-booking?operation=confirm&slug=${encodeURIComponent(slug)}&hold_id=${encodeURIComponent(hold.hold_id)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner_token: hold.owner_token, client_name: contact.name,
          email: contact.email || undefined, phone: contact.phone || undefined, country: 'CA',
          policy_accepted: policyAccepted, policy_version: salon.bookingPolicy.version,
          ...(attributionToken ? { attribution_token: attributionToken } : {}),
          idempotency_key: crypto.randomUUID() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.detail?.code || 'booking_unavailable');
      setReceipt(result);
    } catch (cause) {
      setError(cause.message === 'booking_policy_changed'
        ? 'The salon updated its booking policy. Refresh the page and review the current terms.'
        : 'We could not confirm this booking. Your time may have expired; choose a time again.');
    } finally { setBusy(false); }
  }

  const managementHref = receipt?.management_token && receipt?.appointment_id
    ? `/book/${encodeURIComponent(slug)}?appointment_id=${encodeURIComponent(receipt.appointment_id)}#${encodeURIComponent(receipt.management_token)}`
    : null;

  return (
    <>
      <Head><title>{title} · Booking</title><meta name="robots" content="noindex" /><meta name="referrer" content="no-referrer" /></Head>
      <a className="skip-link" href="#public-booking-main">{translate(locale,'a11y.skipBooking')}</a>
      <main id="public-booking-main" tabIndex={-1} className="public-booking" style={theme} aria-busy={busy || manageLoading || manageActionBusy}>
        <section className="booking-card" role={state === 'unavailable' ? 'status' : undefined}>
          <p className="eyebrow">{state === 'unavailable' ? 'Salon booking' : salon.locationName || 'Salon'}</p>
          <h1>{state === 'unavailable' ? 'Booking information is temporarily unavailable' : title}</h1>
          {state === 'unavailable' ? (
            <p>Please try again in a few minutes.</p>
          ) : (
            <>
            {salon.locationName && <p className="location">{salon.locationName}</p>}
            {salon.publicHours && <section className="hours" aria-labelledby="public-hours-heading">
              <h2 id="public-hours-heading">Opening hours</h2>
              <p className="hours-zone">Local time · {salon.publicHours.timezone || salon.timezone}</p>
              {[...weeklyPatterns.values()].map(pattern => <div className="hours-period" key={`${pattern.from}/${pattern.to || ''}`}>
                <h3>Effective {pattern.from}{pattern.to ? ` through ${pattern.to}` : ''}</h3>
                <ul>{WEEKDAYS.map((day, weekday) => {
                  const times = pattern.rows.filter(row => row.weekday === weekday).sort((a, b) => a.opensAt.localeCompare(b.opensAt));
                  return <li key={day}><strong>{day}:</strong> {times.length
                    ? times.map(row => `${row.opensAt}–${row.closesAt}`).join(', ')
                    : 'Closed'}</li>;
                })}</ul>
              </div>)}
              <h3>Upcoming date exceptions</h3>
              {(salon.publicHours.exceptions || []).length ? <ul>{salon.publicHours.exceptions.map(item => {
                const detail = item.kind === 'closed' ? 'Closed' : `${item.opensAt}–${item.closesAt}`;
                return <li key={`${item.date}-${item.kind}`}><strong>{item.date}:</strong> {item.label ? `${item.label} — ${detail}` : detail}</li>;
              })}</ul> : <p>No upcoming exceptions.</p>}
            </section>}
            {!salon.acceptingBookings ? (
              <div className="readiness" role="status">
                <h2>Online booking is not ready yet</h2>
                <p>The salon is finishing setup. These items still need attention:</p>
                {salon.missingSetup.length ? (
                  <ul>{salon.missingSetup.map(step => <li key={step}>{STEP_LABELS[step]}</li>)}</ul>
                ) : <p>The salon owner is completing the final setup step.</p>}
              </div>
            ) : (
              <section className="readiness" aria-labelledby="booking-heading">
                <h2 id="booking-heading">Choose a service and time</h2>
                {salon.services.length ? <>
                  <form method="get" action={`/book/${encodeURIComponent(slug)}`}>
                    {attributionToken && <input type="hidden" name="attribution_token" value={attributionToken} />}
                    <label htmlFor="booking-service">Service</label>
                    <select id="booking-service" name="service_id" aria-label="Service"
                      defaultValue={salon.booking.serviceId}>
                      {salon.services.map(service => <option key={service.id} value={service.id}>
                        {service.name} · {service.durationMinutes} min · {formatMoney(service.priceMinor, locale, service.currency)}
                      </option>)}
                    </select>
                    <label htmlFor="booking-date">Date</label>
                    <input id="booking-date" type="date" name="date" aria-label="Date" required
                      defaultValue={salon.booking.date} min={localTomorrow(salon.timezone)} />
                    <button type="submit">Show available times</button>
                  </form>
                  <div className="slot-results" role="status" aria-live="polite">
                    <h3>Available times · {salon.booking.timezone || salon.timezone}</h3>
                    {salon.booking.state === 'unavailable'
                      ? <p>Times are temporarily unavailable. Please try again.</p>
                      : salon.booking.slots.length
                        ? <ul>{salon.booking.slots.map(slot => <li key={`${slot.startsAt}-${slot.staffId}`}>
                          <button className="slot-button" type="button" disabled={busy || !salon.bookingPolicy}
                            aria-pressed={selectedSlot?.startsAt === slot.startsAt && selectedSlot?.staffId === slot.staffId}
                            onClick={() => reserveSlot(slot)}>
                            <time dateTime={slot.startsAt}>{slot.localTime}</time> with {slot.staffName}
                          </button>
                        </li>)}</ul>
                        : <p>No available times for this date. Choose another day or service.</p>}
                    <p>Times are shown in the salon’s local timezone. Selecting a time does not reserve it.</p>
                    {!salon.bookingPolicy && <p role="alert">Booking terms are unavailable. Please contact the salon.</p>}
                    {hold && selectedSlot && !receipt && <form onSubmit={confirmBooking} className="contact-form">
                      <h3>Complete your booking</h3>
                      <p>Your selected time is held for five minutes.</p>
                      <label htmlFor="booker-name">Your name</label>
                      <input ref={contactNameRef} id="booker-name" aria-label="Your name" autoComplete="name" maxLength={120} required
                        value={contact.name} onChange={event => setContact({ ...contact, name: event.target.value })} />
                      <label htmlFor="booker-email">Email address</label>
                      <input id="booker-email" aria-label="Email address" type="email" autoComplete="email" maxLength={320}
                        value={contact.email} onChange={event => setContact({ ...contact, email: event.target.value })} />
                      <label htmlFor="booker-phone">Phone number</label>
                      <input id="booker-phone" aria-label="Phone number" type="tel" autoComplete="tel" maxLength={40}
                        value={contact.phone} onChange={event => setContact({ ...contact, phone: event.target.value })} />
                      <fieldset className="policy-box">
                        <legend>Booking policy</legend>
                        <p>{salon.bookingPolicy?.text}</p>
                        <label className="checkbox-label"><input type="checkbox" required checked={policyAccepted}
                          onChange={event => setPolicyAccepted(event.target.checked)} /> I agree to this booking policy.</label>
                      </fieldset>
                      <p>Marketing updates are optional and are not part of booking.</p>
                      <button type="submit" disabled={busy || !salon.bookingPolicy || !policyAccepted}>
                        {busy ? 'Confirming…' : 'Confirm booking'}
                      </button>
                    </form>}
                    {receipt && <section ref={receiptRef} tabIndex={-1} className="receipt" role="status" aria-live="polite">
                      <h3>Booking confirmed</h3>
                      <p>{title} · {selectedSlot?.localDate} at {selectedSlot?.localTime} with {selectedSlot?.staffName}</p>
                      {managementHref && <a href={managementHref}>View or manage this booking</a>}
                    </section>}
                    {error && <p role="alert">{error}</p>}
                  </div>
                </> : <p>The salon has not published bookable services yet. Please contact the salon.</p>}
              </section>
            )}
            </>
          )}
        </section>
        {(manageLoading || managedBooking || manageError) && <section className="booking-card" aria-labelledby="managed-heading">
          {manageLoading && <p role="status">Loading your booking…</p>}
          {managedBooking && <section className="receipt" aria-labelledby="managed-heading">
            <h2 id="managed-heading">Your booking</h2>
            <p>{managedBooking.salon} · {managedBooking.service} with {managedBooking.staff}</p>
            <p><time dateTime={managedBooking.starts_at}>{formatDateTime(managedBooking.starts_at, locale, { timeZone: managedBooking.timezone, dateStyle: 'medium', timeStyle: 'short' })}</time></p>
            <p>Status: {managedBooking.status}</p>
            {managedBooking.can_manage ? <>
              <form className="form-grid" onSubmit={event => { event.preventDefault(); manageAppointment('reschedule'); }}>
                <label>New date and time at the salon<input type="datetime-local" required value={manageStartsAt}
                  onChange={event => setManageStartsAt(event.target.value)} /></label>
                <button type="submit" disabled={manageActionBusy}>{manageActionBusy ? 'Saving…' : 'Reschedule appointment'}</button>
              </form>
              <button type="button" className="button secondary" disabled={manageActionBusy}
                onClick={() => manageAppointment('cancel')}>Cancel appointment</button>
            </> : <p className="muted">{managedBooking.manage_blocked_reason === 'public_management_requires_salon'
              || managedBooking.manage_blocked_reason === 'booking_policy_changed'
              ? 'Contact the salon to make a change under its current cancellation terms.'
              : 'This appointment can no longer be changed online.'}</p>}
            {manageNotice && <p role="status" aria-live="polite">{manageNotice}</p>}
          </section>}
          {manageError && <p role="alert">{manageError}</p>}
        </section>}
      </main>
      <style jsx>{`
        .public-booking { min-height: 100vh; display: grid; place-items: center; padding: 24px; background: #f5f3ef; color: #20231f; font-family: Inter, system-ui, sans-serif; }
        .booking-card { width: min(100%, 640px); padding: clamp(24px, 6vw, 48px); border-radius: 18px; background: white; box-shadow: 0 12px 36px #20231f12; border-top: 5px solid var(--salon-primary); }
        .eyebrow { color: var(--salon-accent); font-size: 13px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
        h1 { margin: 8px 0; font-size: clamp(28px, 6vw, 40px); line-height: 1.12; }
        h2 { color: var(--salon-primary); font-size: 20px; }
        p, li { line-height: 1.6; }
        .location { color: #555b55; }
        .hours { margin-top: 28px; padding-top: 20px; border-top: 1px solid #e7e5e0; }
        .hours h2 { margin-bottom: 4px; }
        .hours h3 { margin: 16px 0 6px; font-size: 16px; }
        .hours-zone { margin-top: 0; color: #555b55; }
        .hours-period ul { columns: 2; }
        .readiness { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e7e5e0; }
        form { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
        select, input, button { min-height: 44px; min-width: 0; padding: 10px 12px; border: 1px solid #b9bcb6; border-radius: 8px; font: inherit; }
        button { margin-top: 8px; color: white; background: var(--salon-primary); border: 0; font-weight: 700; cursor: pointer; }
        button:focus-visible, select:focus-visible, input:focus-visible { outline: 3px solid var(--salon-accent); outline-offset: 2px; }
        .slot-results { margin-top: 24px; padding-top: 18px; border-top: 1px solid #e7e5e0; }
        .slot-results ul { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; padding: 0; list-style: none; }
        .slot-results li { padding: 5px; border: 1px solid #e7e5e0; border-radius: 8px; }
        .slot-button { width: 100%; margin: 0; color: #20231f; background: white; border: 0; text-align: left; }
        .slot-button:hover, .slot-button[aria-pressed="true"] { color: white; background: var(--salon-primary); }
        .contact-form { margin-top: 24px; }
        .policy-box { margin-top: 14px; padding: 14px; border: 1px solid #b9bcb6; border-radius: 8px; }
        .checkbox-label { display: flex; gap: 10px; align-items: start; }
        .checkbox-label input { min-height: 22px; min-width: 22px; margin: 0; }
        .receipt { margin-top: 20px; padding: 16px; border-left: 4px solid var(--salon-primary); background: #f5f3ef; }
        .receipt a { display: inline-block; padding: 12px 0; color: var(--salon-primary); font-weight: 700; }
        ul { padding-left: 22px; }
        @media (max-width: 480px) { .public-booking { padding: 14px; } .booking-card { border-radius: 12px; } }
      `}</style>
    </>
  );
}
