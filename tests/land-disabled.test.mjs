import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../server/src/index.js';
import {LandRoom} from '../server/src/land.js';

test('parked land routes reject HTTP and websocket entry before touching storage',async()=>{
  const env={DB:{prepare(){throw Error('disabled feature must not use DB');}}};
  for(const path of ['/land','/land/health','/land/player','/land/session','/land/bridge/ws','/land/ws']){
    for(const method of ['GET','POST']){
      const response=await worker.fetch(new Request('https://test.invalid'+path,{method}),env,{});
      assert.equal(response.status,503,path);
      assert.equal((await response.json()).error,'land_disabled');
    }
  }
  const root=await worker.fetch(new Request('https://test.invalid/'),env,{});
  assert.equal(root.status,200);
  assert.equal((await root.json()).ok,true);
});

test('existing land sockets close without accepting gameplay or relay messages',async()=>{
  const closed=[];
  const ws={close:(...args)=>closed.push(args)};
  const room=Object.create(LandRoom.prototype);
  room.env={LAND_ENABLED:'false'};
  room.sockets=()=>[ws];
  await room.webSocketMessage(ws,JSON.stringify({type:'move',x:20,y:30}));
  assert.equal(closed[0][0],1013);
});
