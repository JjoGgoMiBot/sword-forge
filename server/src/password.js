// Version the hash in the existing column; legacy hashes migrate only after a valid login.
const enc=new TextEncoder(),ITER=100000,LEGACY_ITER=20000;
async function derive(pin,salt,iterations){
  const key=await crypto.subtle.importKey('raw',enc.encode(pin),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:enc.encode(salt),iterations},key,256);
  return [...new Uint8Array(bits)].map(v=>v.toString(16).padStart(2,'0')).join('');
}
const equal=(a,b)=>{if(a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0;};
export const hashPassword=async(pin,salt)=>`pbkdf2:${ITER}:${await derive(pin,salt,ITER)}`;
export async function checkPassword(pin,salt,stored){
  if(typeof stored!=='string')return false;
  if(/^[0-9a-f]{64}$/.test(stored))return equal(await derive(pin,salt,LEGACY_ITER),stored);
  const parts=stored.split(':');
  if(parts.length!==3||parts[0]!=='pbkdf2'||parts[1]!==String(ITER)||!/^[0-9a-f]{64}$/.test(parts[2]))return false;
  return equal(await derive(pin,salt,ITER),parts[2]);
}
