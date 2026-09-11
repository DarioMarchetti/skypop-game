import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseScene, SCENE_KINDS } from '../src/game/sceneTypes.ts';

test('all five scenes are reachable on first round',()=>{
 const choices=Array.from({length:5},(_,i)=>chooseScene(null,()=> (i+0.5)/5));
 assert.deepEqual(choices,[...SCENE_KINDS]);
});
test('a subsequent round can select every other scene, never the previous one',()=>{
 for(const previous of SCENE_KINDS){
  const choices=Array.from({length:4},(_,i)=>chooseScene(previous,()=> (i+0.5)/4));
  assert.equal(new Set(choices).size,4);
  assert.ok(!choices.includes(previous));
 }
});
