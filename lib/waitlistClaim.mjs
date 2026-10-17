const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9-]{3,80}$/i;

export function waitlistClaimUrl(origin, slug, offerId, ownerToken) {
  if (!SLUG.test(slug) || !UUID.test(offerId)
      || typeof ownerToken !== 'string' || ownerToken.length < 16 || ownerToken.length > 128) {
    throw new TypeError('Invalid waitlist claim link facts');
  }
  const target = new URL(`/waitlist/claim/${encodeURIComponent(slug)}/${offerId}`, origin);
  target.hash = new URLSearchParams({ token: ownerToken }).toString();
  return target.toString();
}
