// Optional live integration check. Creates one disposable session/score;
// prints its ID for explicit cleanup by the project administrator.
// Run: node --env-file=.env.local --import tsx tests/cloud-smoke.mts
import assert from 'node:assert/strict';
import { createRun, applyJump, JUMP_DURATION_MS } from '../supabase/functions/_shared/game.ts';
const base = process.env.VITE_SUPABASE_URL!;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
assert(base && key, 'Supabase public configuration required');
const endpoint = `${base}/functions/v1/cloud-hop-v2`;
async function request(body?: unknown) {
  const r = await fetch(endpoint, {method: body ? 'POST' : 'GET', headers: {apikey:key, 'content-type':'application/json'}, body: body ? JSON.stringify(body) : undefined, signal:AbortSignal.timeout(20000)});
  return {status:r.status, body:await r.json()};
}
const initial = await request(); assert.equal(initial.status, 200); assert(Array.isArray(initial.body));
const started = await request({action:'start'}); assert.equal(started.status,200);
const session = started.body;
console.log('Created test session:', session.id);
const run = createRun(session.seed);
const target = run.platforms[1];
const hold = Math.round((Math.hypot(target.x,target.z)+target.radius*0.6-30)/0.24);
const jumped = applyJump(run,hold); assert(jumped.landed && !jumped.perfect);
const target2 = jumped.state.platforms[2];
const hold2 = Math.round((Math.hypot(target2.x-jumped.state.position.x,target2.z-jumped.state.position.z)-30)/0.24);
const second = applyJump(jumped.state,hold2); assert(second.perfect);
const holds = [hold,hold2,0];
const expected = applyJump(second.state,0).state; assert(expected.over);
const durationMs = hold + hold2 + 3*JUMP_DURATION_MS;
const body = {action:'finish',session,result:{holds,durationMs,score:999999,perfectCount:9999},nickname:'验收测试'};
await new Promise(resolve=>setTimeout(resolve,durationMs+100));
const badToken = await request({...body,session:{...session,token:'x'.repeat(43)}}); assert.equal(badToken.status,400);
const invalid = await request({...body,result:{...body.result,holds:[-1]}}); assert.equal(invalid.status,400);
const submitted = await Promise.all([request(body),request(body)]);
for (const r of submitted) {assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.score,expected.score);}
const leaders = await request(); assert.equal(leaders.status,200);
const own = leaders.body.filter((r:{nickname:string})=>r.nickname==='验收测试'); assert.equal(own.length,1); assert.equal(own[0].score,expected.score);
const table = await fetch(`${base}/rest/v1/cloud_hop_scores?select=*`,{headers:{apikey:key},signal:AbortSignal.timeout(20000)});
assert([401,403].includes(table.status), `Direct table read should be blocked: ${table.status}`);
const rpc = await fetch(`${base}/rest/v1/rpc/cloud_hop_submit_score`,{method:'POST',headers:{apikey:key,'content-type':'application/json'},body:JSON.stringify({p_session_id:session.id,p_token_hash:'a'.repeat(64),p_score:999,p_perfect_count:999,p_nickname:'bad'}),signal:AbortSignal.timeout(20000)});
assert([401,403,404].includes(rpc.status), `Direct RPC should be blocked: ${rpc.status}`);
console.log(JSON.stringify({status:'PASS',verified:['server-replay-ignores-fake-score','bad-token','invalid-hold','concurrent-idempotence','leaderboard','table-and-rpc-access'],sessionId:session.id,scoreId:own[0].id,score:expected.score}));
