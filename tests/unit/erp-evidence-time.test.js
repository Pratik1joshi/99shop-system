import test from 'node:test';
import assert from 'node:assert/strict';
import {nepalWallClockTimestamp,nepalDateString,formatNepalDateTime} from '../../lib/report-dates.js';
test('SQL text and typed PostgreSQL timestamps describe the same Nepal instant and calendar date',()=>{
  const raw='2026-09-26 00:15:00';
  const normalized=nepalWallClockTimestamp(raw);
  const typed=new Date('2026-09-25T18:30:00.000Z');
  assert.equal(new Date(normalized).getTime(),typed.getTime());
  assert.equal(nepalDateString(normalized),'2026-09-26');
  assert.equal(formatNepalDateTime(normalized),formatNepalDateTime(typed));
  assert.equal(nepalWallClockTimestamp(normalized),normalized);
  assert.equal(nepalWallClockTimestamp(typed),typed.toISOString());
});
