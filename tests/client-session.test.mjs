import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const setAcc=html.slice(html.indexOf('const setAcc='),html.indexOf('async function api('));
const boot=html.slice(html.indexOf('async function cloudBoot(){'),html.indexOf('// Storage updates never'));
function browserStub(){
  const sandbox={};vm.createContext(sandbox);
  vm.runInContext(`
    let ACC={token:'old'},accountEpoch=0,accountReady=true,cloudState='',cloudLast=0;
    const ACC_KEY='fixture',localStorage={setItem(){},removeItem(){}};
    let adopted=0,resolvePending,rejectPending;
    const S={event:null,work:null},api=()=>new Promise((resolve,reject)=>{resolvePending=resolve;rejectPending=reject;});
    const render=()=>{},renderAcct=()=>{},log=()=>{},$=()=>null,randomEvent=()=>{},showWork=()=>{};
    const adoptSave=()=>{adopted++;};
    ${setAcc}
    ${boot}
    globalThis.begin=()=>cloudBoot();
    globalThis.switchAccount=account=>{setAcc(account);accountReady=true;cloudState='new-session';};
    globalThis.respond=()=>resolvePending({save:'{}',saved:123});
    globalThis.reject=()=>rejectPending(new Error('connection lost'));
    globalThis.state=()=>({adopted,accountReady,cloudState,cloudLast});
  `,sandbox);return sandbox;
}
test('an in-flight load cannot restore the previous account after logout or account switch',async()=>{
  for(const account of [null,{token:'new'}]){const b=browserStub(),pending=b.begin();b.switchAccount(account);b.respond();await pending;assert.equal(b.state().adopted,0);assert.equal(b.state().cloudState,'new-session');assert.equal(b.state().accountReady,true);}
});
test('current-account loads still apply and stale connection errors leave the new session alone',async()=>{
  const current=browserStub(),p=current.begin();current.respond();await p;assert.equal(current.state().adopted,1);assert.equal(current.state().cloudState,'ok');
  const stale=browserStub(),q=stale.begin();stale.switchAccount({token:'new'});stale.reject();await q;assert.equal(stale.state().cloudState,'new-session');assert.equal(stale.state().accountReady,true);
});
test('a queued action cannot be sent under a different account or turned into a guest action',async()=>{
  const dispatch=html.slice(html.indexOf('async function dispatch(action){'),html.indexOf('async function cloudBoot(){'));
  for(const newAccount of [null,{token:'new'}]){
    const b={};vm.createContext(b);
    vm.runInContext(`
      let ACC={token:'old'},accountEpoch=0,accountReady=true,cloudState='',cloudLast=0,requestBusy=false,tabReady=true;
      let S={rev:0},networkCalls=0,guestCalls=0,runQueued;
      const ACC_KEY='fixture',KEY='fixture',localStorage={setItem(){},removeItem(){},getItem(){return null;}};
      const navigator={locks:{request:(_name,callback)=>new Promise((resolve,reject)=>{runQueued=()=>Promise.resolve().then(callback).then(resolve,reject);})}};
      const crypto={randomUUID:()=> '00000000-0000-0000-0000-000000000000'};
      const api=async()=>{networkCalls++;return {state:{rev:1},saved:1};};
      const Forge={normalize:x=>x,transition:()=>{guestCalls++;return {state:{rev:1}};}};
      const render=()=>{},renderAcct=()=>{},save=()=>{},setSword=()=>{},toast=()=>{},log=()=>{},$=()=>null;
      ${setAcc}
      ${dispatch}
      globalThis.begin=()=>dispatch({type:'enhance'});
      globalThis.switchAccount=account=>setAcc(account);
      globalThis.run=()=>runQueued();
      globalThis.calls=()=>({networkCalls,guestCalls});
    `,b);
    const pending=b.begin();b.switchAccount(newAccount);await b.run();await pending;
    assert.equal(b.calls().networkCalls,0);assert.equal(b.calls().guestCalls,0);
  }
});
