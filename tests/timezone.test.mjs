import assert from 'node:assert/strict';
import {test} from 'node:test';
import {zonedInstant} from '../lib/timezone.js';
test('salon timezone controls booking instant independently of browser',()=>{assert.equal(zonedInstant('2026-10-13T10:00','America/Toronto'),'2026-10-13T14:00:00.000Z');assert.equal(zonedInstant('2026-01-13T10:00','America/Vancouver'),'2026-01-13T18:00:00.000Z');assert.equal(zonedInstant('2026-01-13T10:00','America/St_Johns'),'2026-01-13T13:30:00.000Z');});
test('DST nonexistent local time is refused',()=>assert.throws(()=>zonedInstant('2026-03-08T02:30','America/Toronto'),/does not exist/));
test('DST ambiguous local time is refused with a useful explanation',()=>assert.throws(()=>zonedInstant('2026-11-01T01:30','America/Toronto'),/occurs twice/));
