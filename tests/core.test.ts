import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyJump,
  createRun,
  jumpDistance,
  MAX_HOLD_MS,
} from '../supabase/functions/_shared/game';

test('replays the same route for the same seed', () => {
    assert.deepEqual(createRun(42), createRun(42));
    assert.notDeepEqual(createRun(42), createRun(43));
  });

test('keeps adjacent platforms axis aligned, separate, and reachable', () => {
    const run = createRun(1234);
    for (let index = 1; index < 40; index += 1) {
      const previous = run.platforms[index - 1];
      const current = run.platforms[index];
      const dx = Math.abs(current.x - previous.x);
      const dz = Math.abs(current.z - previous.z);
      const distance = Math.hypot(current.x - previous.x, current.z - previous.z);
      assert.equal(dx === 0 || dz === 0, true);
      assert.ok(current.x >= previous.x && current.z >= previous.z, 'route never reverses');
      assert.ok(distance >= previous.radius + current.radius + 24);
      assert.ok(distance <= jumpDistance(MAX_HOLD_MS));
    }
  });

test('awards perfect streak points and clears the streak on an ordinary landing', () => {
    const run = createRun(9);
    const first = run.platforms[0];
    const target = run.platforms[1];
    const targetDistance = Math.hypot(target.x - first.x, target.z - first.z);
    const perfectHold = (targetDistance - 30) / 0.24;
    const perfect = applyJump(run, perfectHold);
    assert.equal(perfect.landed, true);
    assert.equal(perfect.perfect, true);
    assert.equal(perfect.state.score, 2);
    assert.equal(perfect.state.combo, 1);

    const next = perfect.state.platforms[1];
    const nextTarget = perfect.state.platforms[2];
    const nextDistance = Math.hypot(nextTarget.x - next.x, nextTarget.z - next.z);
    const ordinaryHold = (nextDistance - 30 + nextTarget.radius * 0.5) / 0.24;
    const ordinary = applyJump(perfect.state, ordinaryHold);
    assert.equal(ordinary.landed, true);
    assert.equal(ordinary.perfect, false);
    assert.equal(ordinary.state.combo, 0);
    assert.equal(ordinary.state.score, 3);
  });

test('fails a jump that cannot reach the next platform and clamps hold values', () => {
    const run = createRun(88);
    const result = applyJump(run, -100);
    assert.equal(result.landed, false);
    assert.equal(result.state.over, true);
    assert.equal(jumpDistance(-100), jumpDistance(0));
    assert.equal(jumpDistance(MAX_HOLD_MS + 100), jumpDistance(MAX_HOLD_MS));
  });

test('does not mutate the input state or platform array', () => {
    const run = createRun(77);
    const before = JSON.stringify(run);
    applyJump(run, MAX_HOLD_MS);
    assert.equal(JSON.stringify(run), before);
  });
