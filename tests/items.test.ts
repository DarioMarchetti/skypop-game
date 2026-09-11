import test from 'node:test';
import assert from 'node:assert/strict';
import { itemAt } from '../src/game/items.ts';

test('item route respects onboarding, spacing and no consecutive repeats', () => {
  for (let seed = 0; seed < 100; seed++) {
    const drops = Array.from({length:1024}, (_,i)=>({i,kind:itemAt(seed,i)})).filter(p=>p.kind);
    assert.ok(drops[0].i>=4 && drops[0].i<=7);
    for(let i=1;i<drops.length;i++) {
      assert.ok(drops[i].i-drops[i-1].i>=5 && drops[i].i-drops[i-1].i<=8);
      assert.notEqual(drops[i].kind,drops[i-1].kind);
    }
  }
});

test('item schedule is unchanged by lookup order and cache eviction', () => {
  const expected=Array.from({length:1024},(_,i)=>itemAt(42,i));
  for(let seed=1000;seed<1020;seed++)itemAt(seed,1023);
  assert.equal(itemAt(42,1023),expected[1023]);
  for(let i=1023;i>=0;i--)assert.equal(itemAt(42,i),expected[i]);
  assert.equal(itemAt(42,-1),null); assert.equal(itemAt(42,1024),null);
});
