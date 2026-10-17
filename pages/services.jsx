import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import { privatePage } from '../lib/session';
import { useWorkspace } from '../components/Workspace';
import { api, money } from '../lib/http';

export default function Services() {
  const { tenantId } = useWorkspace();
  const [items, setItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [resources, setResources] = useState([]);
  const [resourceIds, setResourceIds] = useState([]);
  const [quantities, setQuantities] = useState({});
  const [phases, setPhases] = useState([]);
  const [serviceVersion, setServiceVersion] = useState(1);
  const [locationId, setLocationId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const url = useCallback((resource, extra = {}) => {
    const query = new URLSearchParams({ tenant_id: tenantId, resource, ...extra });
    return `/api/workspace?${query}`;
  }, [tenantId]);

  const loadServices = useCallback(async () => {
    const [serviceResult, locationResult] = await Promise.all([
      api(url('services')),
      api(url('locations')),
    ]);
    const nextServices = serviceResult.items || [];
    const nextLocations = locationResult.items || [];
    setItems(nextServices);
    setLocations(nextLocations);
    setServiceId(current => nextServices.some(service => service.id === current)
      ? current : nextServices[0]?.id || '');
    setLocationId(current => nextLocations.some(location => location.id === current)
      ? current : nextLocations[0]?.id || '');
  }, [url]);

  useEffect(() => {
    loadServices().catch(e => setError(e.message));
  }, [loadServices]);

  useEffect(() => {
    if (!locationId || !serviceId) {
      setResources([]);
      setResourceIds([]);
      return undefined;
    }
    let current = true;
    Promise.all([
      api(url('resources', { location_id: locationId })),
      api(url('services', { id: serviceId, action: 'resources', location_id: locationId })),
      api(url('services', { id: serviceId, action: 'phases' })),
    ]).then(([resourceResult, requirementResult, phaseResult]) => {
      if (!current) return;
      setResources(resourceResult.items || []);
      setResourceIds((requirementResult.items || []).map(resource => resource.id));
      setQuantities(Object.fromEntries((requirementResult.items || []).map(resource => [resource.id, resource.quantity || 1])));
      setPhases(phaseResult.phases || []);
      setServiceVersion(phaseResult.version || 1);
    }).catch(e => { if (current) setError(e.message); });
    return () => { current = false; };
  }, [locationId, serviceId, url]);

  async function createService(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setBusy(true); setError('');
    try {
      const price = String(values.get('price'));
      if (!/^\d+(\.\d{1,2})?$/.test(price)) throw new Error('Enter a price with up to two decimal places.');
      const [dollars, cents = ''] = price.split('.');
      const priceMinor = Number(dollars) * 100 + Number(cents.padEnd(2, '0'));
      await api(url('services'), { method: 'POST', body: JSON.stringify({
        name: values.get('name'), duration_minutes: Number(values.get('duration')), price_minor: priceMinor,
      }) });
      form.reset(); setNote('Service added to your catalogue.'); await loadServices();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function toggleService(service) {
    setError('');
    try {
      await api(url('services', { id: service.id, action: service.archived_at ? 'restore' : 'archive' }), { method: 'POST' });
      setNote(service.archived_at ? 'Service restored.' : 'Service archived.'); await loadServices();
    } catch (e) { setError(e.message); }
  }

  async function createResource(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setBusy(true); setError('');
    try {
      await api(url('resources'), { method: 'POST', body: JSON.stringify({
        location_id: locationId, name: values.get('resource_name'), kind: values.get('kind'),
        capacity: Number(values.get('capacity')),
      }) });
      form.reset(); setNote('Room, chair or equipment added to this location.');
      const result = await api(url('resources', { location_id: locationId }));
      setResources(result.items || []);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function saveRequirements(event) {
    event.preventDefault();
    if (!serviceId || !locationId) return;
    setBusy(true); setError('');
    try {
      const result = await api(url('services', { id: serviceId, action: 'resources', location_id: locationId }), {
        method: 'PUT', body: JSON.stringify({ location_id: locationId, expected_version: serviceVersion, resource_ids: resourceIds,
          quantities: Object.fromEntries(resourceIds.map(id => [id, Number(quantities[id] || 1)])) }),
      });
      setServiceVersion(result.version);
      setNote('Resource pool requirements saved for this location.');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function savePhases(event) {
    event.preventDefault();
    if (!serviceId) return;
    setBusy(true); setError('');
    try {
      const result = await api(url('services', { id: serviceId, action: 'phases' }), { method: 'PUT',
        body: JSON.stringify({ expected_version: serviceVersion, phases: phases.map((phase, index) => ({
          sequence: index + 1, duration_minutes: Number(phase.duration_minutes), mode: phase.mode,
          staff_count: phase.mode === 'gap' ? 0 : Number(phase.staff_count || 1),
        })) }) });
      setPhases(result.phases); setServiceVersion(result.version);
      setNote('Service processing phases saved.');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return <main className="page">
    <Head><title>Services · SalonOS</title></Head>
    <span className="eyebrow">YOUR CATALOGUE</span><h1>Services and resources</h1>
    <p className="muted">Manage service durations, processing phases, and the room, chair or equipment capacity each booking needs.</p>
    {error && <p role="alert" className="error">{error}</p>}
    <p role="status" className="status-text">{note}</p>

    <section className="panel service-form"><h2>Add a service</h2>
      <form className="form-grid" onSubmit={createService}>
        <label>Service name<input name="name" required maxLength={120} placeholder="Signature haircut" /></label>
        <label>Duration (minutes)<input name="duration" type="number" min="5" max="1440" required defaultValue="45" /></label>
        <label>Price (CAD)<input name="price" inputMode="decimal" required placeholder="65.00" /></label>
        <button className="button" disabled={busy}>{busy ? 'Saving…' : 'Add service'}</button>
      </form>
    </section>

    <section className="panel"><h2>Your services</h2>
      <div className="table-wrap"><table><thead><tr><th>Service</th><th>Duration</th><th>Price</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>{items.map(service => <tr key={service.id}>
          <td><strong>{service.name}</strong></td><td>{service.duration_minutes} min</td><td>{money(service.price_minor)}</td>
          <td>{service.archived_at ? 'Archived' : 'Active'}</td>
          <td><button className="button secondary small" onClick={() => toggleService(service)}>{service.archived_at ? 'Restore' : 'Archive'}</button></td>
        </tr>)}</tbody></table></div>
      {!items.length && <p className="empty">No services yet. Add your first service above.</p>}
    </section>

    <section className="panel"><h2>Rooms, chairs and equipment</h2>
      {!locations.length ? <p className="empty">Add a salon location before configuring resources.</p> : <>
        <label>Location<select value={locationId} onChange={event => setLocationId(event.target.value)}>
          {locations.map(location => <option key={location.id} value={location.id}>{location.display_name}</option>)}
        </select></label>
        <form className="form-grid" onSubmit={createResource}>
          <label>Resource name<input name="resource_name" required maxLength={120} placeholder="Colour chair 1" /></label>
          <label>Type<select name="kind"><option value="chair">Chair</option><option value="room">Room</option><option value="equipment">Equipment</option></select></label>
          <label>Capacity units<input name="capacity" type="number" min="1" max="100" required defaultValue="1" /></label>
          <button className="button" disabled={busy || !locationId}>{busy ? 'Saving…' : 'Add resource'}</button>
        </form>
        <ul className="list">{resources.map(resource => <li key={resource.id}>{resource.name} <span className="muted">· {resource.kind} · capacity {resource.capacity}</span></li>)}</ul>
        {!resources.length && <p className="empty">No active resources at this location yet.</p>}
        <form onSubmit={saveRequirements}>
          <label>Service<select value={serviceId} onChange={event => setServiceId(event.target.value)}>
            {items.filter(service => !service.archived_at).map(service => <option key={service.id} value={service.id}>{service.name}</option>)}
          </select></label>
          {!items.some(service => !service.archived_at) ? <p className="empty">Add a service before assigning required resources.</p> : <>
            <fieldset><legend>Resources required for this service at this location</legend>
              {resources.map(resource => <label key={resource.id} className="check-row"><input type="checkbox" checked={resourceIds.includes(resource.id)}
                onChange={event => setResourceIds(ids => event.target.checked ? [...ids, resource.id] : ids.filter(id => id !== resource.id))} />
                {resource.name} ({resource.kind}, {resource.capacity} units)</label>)}
              {resources.filter(resource => resourceIds.includes(resource.id)).map(resource => <label key={`quantity-${resource.id}`}>Units required from {resource.name}
                <input type="number" min="1" max={resource.capacity} value={quantities[resource.id] || 1}
                  onChange={event => setQuantities(values => ({ ...values, [resource.id]: event.target.value }))} /></label>)}
              {!resources.length && <p className="muted">Add a resource above, then assign its required capacity.</p>}
            </fieldset>
            <button className="button" disabled={busy || !serviceId}>{busy ? 'Saving…' : 'Save requirements'}</button>
          </>}
        </form>
        <form className="form-grid" onSubmit={savePhases}>
          <h3>Processing phases</h3>
          <p className="muted">Attended phases reserve qualified staff. Gap phases reserve none. Durations must add up to the service duration.</p>
          {phases.map((phase, index) => <div className="form-grid" key={phase.sequence}>
            <label>Phase {index + 1} duration (minutes)<input type="number" min="1" max="1440" value={phase.duration_minutes}
              onChange={event => setPhases(rows => rows.map((item, i) => i === index ? { ...item, duration_minutes: event.target.value } : item))} /></label>
            <label>Mode<select value={phase.mode} onChange={event => setPhases(rows => rows.map((item, i) => i === index ? { ...item, mode: event.target.value, staff_count: event.target.value === 'gap' ? 0 : 1 } : item))}>
              <option value="attended">Attended</option><option value="gap">Unattended gap</option></select></label>
            {phase.mode === 'attended' && <label>Staff needed<input type="number" min="1" max="4" value={phase.staff_count}
              onChange={event => setPhases(rows => rows.map((item, i) => i === index ? { ...item, staff_count: event.target.value } : item))} /></label>}
            <button type="button" className="button secondary small" onClick={() => setPhases(rows => rows.filter((_, i) => i !== index))}>Remove phase</button>
          </div>)}
          <button type="button" className="button secondary" disabled={phases.length >= 12} onClick={() => setPhases(rows => [...rows, { sequence: rows.length + 1, duration_minutes: 15, mode: 'attended', staff_count: 1 }])}>Add phase</button>
          <button className="button" disabled={busy || !serviceId}>{busy ? 'Saving…' : 'Save phases'}</button>
        </form>
      </>}
    </section>
  </main>;
}

export const getServerSideProps = privatePage('staff');
