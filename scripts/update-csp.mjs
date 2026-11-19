// Re-run after changing inline UI code. CI tests verify the exact browser hash.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const file=new URL('../index.html',import.meta.url);
let html=fs.readFileSync(file,'utf8');
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1].replace(/\r\n?/g,'\n'));
const hashes=scripts.map(s=>`'sha256-${createHash('sha256').update(s).digest('base64')}'`).join(' ');
const policy=`default-src 'self'; script-src 'self' ${hashes}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self' https://sword-forge-api.aicore-sj-relay.workers.dev http://127.0.0.1:8797 http://127.0.0.1:8798 http://127.0.0.1:8907; object-src 'none'; base-uri 'none'; form-action 'none'`;
html=html.replace(/(<meta http-equiv="Content-Security-Policy" content=")[^"]*(">)/,`$1${policy}$2`);
fs.writeFileSync(file,html);
