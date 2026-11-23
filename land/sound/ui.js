// 상단 막대의 소리 버튼 + 펼침 패널(음소거·볼륨 3개·컨셉). 요약(아이콘·상태) 먼저, 누르면 상세.
import { CONCEPTS } from './recipes.js';

const NOTE = { on: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V6l10-2v12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="6.5" cy="18" r="2.5" fill="currentColor"/><circle cx="16.5" cy="16" r="2.5" fill="currentColor"/></svg>', off: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V6l10-2v12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="6.5" cy="18" r="2.5" fill="currentColor"/><circle cx="16.5" cy="16" r="2.5" fill="currentColor"/><path d="M3 21L21 3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' };
const ICON = {
  on: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  off: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M17 9.5l5 5m0-5l-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
};

export function mountSoundControl(sound, host) {
  if (!host || host.querySelector('.sound-control')) return null;
  const wrap = document.createElement('div');
  wrap.className = 'sound-control';
  const pct = v => Math.round(v * 100);
  const concepts = [['auto', '자동(장소별)'], ...Object.values(CONCEPTS).map(c => [c.id, c.name + ' · ' + c.desc])];
  wrap.innerHTML = '<button type="button" class="quiet music-toggle"></button><button type="button" class="quiet sound-toggle" aria-expanded="false" aria-controls="soundPanel"></button>'
    + '<div class="sound-panel" id="soundPanel" role="group" aria-label="소리 설정" hidden>'
    + '<div class="sound-head"><strong>소리</strong><button type="button" class="sound-mute"></button></div>'
    + [['master', '전체'], ['bgm', '배경음'], ['sfx', '효과음']].map(([k, label]) => '<label class="sound-row"><span>' + label + '</span><input type="range" min="0" max="100" step="5" data-vol="' + k + '"><output data-out="' + k + '"></output></label>').join('')
    + '<label class="sound-row concept"><span>컨셉</span><select data-concept>' + concepts.map(([id, label]) => '<option value="' + id + '">' + label + '</option>').join('') + '</select></label>'
    + '</div>';
  host.prepend(wrap);
  const toggle = wrap.querySelector('.sound-toggle'), panel = wrap.querySelector('.sound-panel'), mute = wrap.querySelector('.sound-mute');
  const music = wrap.querySelector('.music-toggle');
  const render = s => {
    music.innerHTML = (s.music ? NOTE.on : NOTE.off) + '<span class="sr-only">' + (s.music ? '배경음악 끄기' : '배경음악 켜기') + '</span>';
    music.classList.toggle('muted', !s.music);
    music.setAttribute('aria-pressed', String(!s.music));
    music.title = s.music ? '배경음악 끄기' : '배경음악 켜기';
    toggle.innerHTML = (s.muted ? ICON.off : ICON.on) + '<span class="sr-only">' + (s.muted ? '소리 꺼짐' : '소리 켜짐') + ' · 설정 열기</span>';
    toggle.classList.toggle('muted', s.muted);
    mute.textContent = s.muted ? '소리 켜기' : '음소거';
    mute.setAttribute('aria-pressed', String(s.muted));
    wrap.querySelectorAll('[data-vol]').forEach(i => { i.value = pct(s[i.dataset.vol]); i.disabled = s.muted; });
    wrap.querySelectorAll('[data-out]').forEach(o => { o.textContent = pct(s[o.dataset.out]) + '%'; });
    wrap.querySelector('[data-concept]').value = s.concept;
  };
  const close = () => { panel.hidden = true; toggle.setAttribute('aria-expanded', 'false'); };
  toggle.addEventListener('click', () => { const open = panel.hidden; panel.hidden = !open; toggle.setAttribute('aria-expanded', String(open)); });
  music.addEventListener('click', () => sound.set({ music: !sound.get().music, muted: false }));
  mute.addEventListener('click', () => sound.set({ muted: !sound.get().muted }));
  wrap.querySelectorAll('[data-vol]').forEach(i => i.addEventListener('input', () => sound.set({ [i.dataset.vol]: Number(i.value) / 100 })));
  wrap.querySelectorAll('[data-vol]').forEach(i => i.addEventListener('change', () => sound.play('ui.tap')));
  wrap.querySelector('[data-concept]').addEventListener('change', e => { sound.set({ concept: e.target.value }); sound.play('win'); });
  document.addEventListener('pointerdown', e => { if (!wrap.contains(e.target)) close(); });
  wrap.addEventListener('keydown', e => { if (e.key === 'Escape') { close(); toggle.focus(); } });
  sound.onChange(render);
  render(sound.get());
  return wrap;
}
