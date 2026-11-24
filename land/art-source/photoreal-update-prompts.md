# 쪼꼬미랜드 실사 소재 업데이트

2026-11-23. Built-in `image_gen` 사용. CLI/API 생성은 사용하지 않았다.
생성 원본은 보존하고 아래 PNG를 프로젝트에 복사했다. 투명 배경을 유지한다.
게임 결과·점수·총알 위치·정산은 사진에 넣지 않고 서버의 공개 상태로 표시한다.

## 파일 및 생성 브리프

- `land/assets/photo/roulette-states-photo.png`: 2×2 transparent sprite atlas. Photoreal top-down engraved blued-steel circular cylinder body with central ejector hub and no chamber holes; closed dark steel circular chamber cover; empty dark chamber recess with metallic lip; single brass cartridge rear with centered primer. Each object centered in an equal cell, same camera and scale, upper-left soft lighting. No text, no other cartridges, no baked game states. Renderer composes six independent chambers over the body.
- `land/assets/photo/resident-photo-atlas.png`: 4×2 transparent sprite atlas. Identical photoreal matte-white vinyl miniature mascot with a large round head, black dot eyes, small smile, blush, short rounded arms and legs, white knitted shirt and ivory shorts. Front idle, front left step, front right step, back idle, back left step, back right step, right profile idle, right profile step. Consistent feet baseline and size; no hats, props, text or grid. Runtime shirt tint preserves fabric lighting; frame caches preserve the existing avatar settings.
- `land/assets/photo/resident-props-photo.png`: 3×2 transparent sprite atlas. Isolated photoreal accessories matching the round miniature: dark teal fabric cap, dark teal cat-ear headband, weathered brass three-point crown; thin black round glasses with transparent lenses, muted purple over-ear headphones with empty center, rust-red knitted scarf. Consistent soft upper-left lighting. No model, head, words or grid.
- `land/assets/photo/pond-photo.png`: A single isolated photoreal miniature garden pond sprite viewed from a high 55-degree camera. Wide oval clear dark teal water with photographed soft ripples and tiny reflected sky highlights; thin irregular weathered gray limestone bank; modest moss/reeds at the edge. Transparent outside the silhouette, fully visible with margins, approximate width-to-height ratio 1.8:1, upper-left natural soft daylight and fine real material details. No text, labels, ducks, bridge, ground rectangle, drawing, vector or cartoon.

## 표시 및 검증 범위

기존 건물·나무·풀·길·오락관 소품의 실사 소재를 유지한다. 주민·착용 소품·연못·러시안 룰렛의 도형 기반 주 표시를 사진 소재로 교체했다. 글자·버튼·점수·그림자·초점 표시는 접근성과 판독을 위한 UI다. 사진 로딩 실패 시 기존 안전한 대체 렌더러가 남아 있다.

바카라는 실제 UI 모듈에 로컬 고정 응답을 연결해 대기 화면, 양쪽 승리, 무승부 반환/타이 당첨, 세 번째 카드 및 320px 폭에서 검증한다. 실제 계정의 초코를 걸거나 지갑을 변경하지 않는다.

## 타로·카드도감 추가

`land/assets/photo/tarot-symbols-photo.png`: Built-in image_gen, transparent 6×5 atlas of 26 photographed antique miniature objects. Rows: travel knapsack/staff, magician wand/candle, crescent between ivory pillars, empress tiara/wheat, iron emperor crown, ceremonial keys/staff; lovers roses/rings, bronze chariot, bronze lion, lantern, brass wheel, justice scales; rope knot, skull/white rose, two cups pouring water, horned theatrical mask, broken stone tower, silver star; ivory crescent, gilded sun, brass trumpet, globe/laurel, wooden wand, silver goblet; steel sword, gold pentacle coin, four empty cells. Product photography, tactile metal/stone/wood, consistent upper-left light, no text/grid/humans/cartoon. Major arcana use individual symbols; all 56 minor cards use their own suit symbol with their exact printed number and name retained. Reversed symbols rotate while explanatory text remains upright.
