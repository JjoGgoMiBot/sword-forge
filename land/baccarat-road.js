const NAMES={player:'플레이어',banker:'뱅커',tie:'타이'};
export function bigRoad(history){
  const cells=[],used=new Set();let side=null,x=0,y=0,base=0,leading=0,last,tail=false;
  for(const r of history){if(!NAMES[r.winner])continue;
    if(r.winner==='tie'){if(last)last.ties++;else leading++;continue;}
    if(side===null){side=r.winner;x=0;y=0;}
    else if(r.winner!==side){base++;x=base;y=0;while(used.has(x+','+y))x++;base=x;side=r.winner;tail=false;}
    else if(!tail&&y<5&&!used.has(x+','+(y+1)))y++;else{tail=true;do{x++;}while(used.has(x+','+y));}
    last={x,y,winner:r.winner,ties:leading,n:r.n};leading=0;cells.push(last);used.add(x+','+y);
  }
  if(leading)cells.push({x:0,y:0,winner:'tie',ties:leading,n:history.at(-1)?.n});return cells;
}
export function baccaratRoad(history=[]){
  const rows=history.filter(r=>NAMES[r.winner]).slice(-120),counts={player:0,banker:0,tie:0};rows.forEach(r=>counts[r.winner]++);
  const cell=(r,x,y,road=false)=>`<span class="bacc-dot ${r.winner}${road?' hollow':''}${road&&r.ties?' has-ties':''}" style="grid-column:${x+1};grid-row:${y+1}" title="${Number(r.n)||''}판 ${NAMES[r.winner]}${r.ties?' · 타이 '+r.ties+'회':''}" aria-label="${Number(r.n)||''}판 ${NAMES[r.winner]}${r.ties?' · 타이 '+r.ties+'회':''}">${road?(r.ties>1?`<i>${r.ties}</i>`:''):{player:'P',banker:'B',tie:'T'}[r.winner]}</span>`;
  const road=bigRoad(rows),columns=Math.max(20,...road.map(c=>c.x+1));
  return `<section class="bacc-history"><header><strong>내 바카라 기록</strong><span>최근 ${rows.length}판 · 최대 120판</span></header><p class="bacc-legend"><span class="player">플레이어 ${counts.player}</span><span class="banker">뱅커 ${counts.banker}</span><span class="tie">타이 ${counts.tie}</span></p>${rows.length?'':'<p class="status-note">첫 판이 끝나면 실제 결과부터 기록돼요.</p>'}<details open><summary>구슬판 · 판 순서대로</summary><div class="bacc-road-scroll"><div class="bacc-road" style="--columns:${Math.max(20,Math.ceil(rows.length/6))}">${rows.map((r,i)=>cell(r,Math.floor(i/6),i%6)).join('')}</div></div></details><details><summary>빅로드 · 연승 흐름</summary><div class="bacc-road-scroll"><div class="bacc-road" style="--columns:${columns}">${road.map(c=>cell(c,c.x,c.y,true)).join('')}</div></div><small>같은 쪽 승리는 아래로, 바뀌면 새 열로. 타이는 직전 칸에 초록 선과 횟수로 표시해요.</small></details></section>`;
}
