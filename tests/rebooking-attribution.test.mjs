import assert from 'node:assert/strict';
import { test } from 'node:test';
import { trackedAttributionToken } from '../lib/trackedAttribution.mjs';

test('public rebooking accepts only opaque hexadecimal attribution tokens', () => {
  const token = 'a'.repeat(32);
  assert.equal(trackedAttributionToken(token), token);
  assert.equal(trackedAttributionToken('A'.repeat(64)), 'A'.repeat(64));
  for (const value of [undefined, '', 'short', 'g'.repeat(32), 'a'.repeat(65), ['a'.repeat(32)]]) {
    assert.equal(trackedAttributionToken(value), null);
  }
});
