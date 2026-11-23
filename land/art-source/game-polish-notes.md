# 랜드 게임 연출·공동 경마 변경

사용자 요청: 악세사리 숨김, Claude VFX 모듈 사용, 룰렛 회전과 철컥/틱/발사 소리, 바카라 과거 결과, 실사 포커판, 하이로우 같은 숫자 배율, 종이 스치는 카드 소리, 첫 참가 후 1분 대기하는 공동 경마.

## 룰렛 분석과 수정

- 닫힌 약실 캡이 버튼처럼 보여 금속 원판 느낌이 강했다. 기존 실사 아틀라스의 매끈한 강철 면·깊은 약실·중심 축을 조합한다. 진행 중에는 총알 위치를 공개하지 않는다.
- 짧은 60도 회전만 보여 무게와 관성이 부족했다. 두 바퀴를 돌고 감속하며 잠긴 뒤 방아쇠를 당긴다.
- 생존 횟수와 다음 약실 방향이 섞였다. 방금 검사한 약실이 고정 지시점에 남게 맞췄다.
- 철컥/틱은 약실 통과 시각, 잠금은 회전 종료, 빈 방아쇠/발사는 240ms 뒤에 맞춘다. 서버 응답이 늦으면 결과를 먼저 추측하지 않는다.
- 연출 중 추가 입력을 잠그며 판정·확률·정산은 서버에 그대로 둔다.

## 모듈 및 새 이미지

`land/vendor/claude-vfx/`는 Claude가 만든 `C:/Users/admin/Desktop/AI/projects/creative/vfx/`의 원본 3개를 복사했다. `land/vfx.js`가 실제 엔진을 호출하며 소품과 패를 가리는 큰 광선은 줄였다. 패배는 짧은 밝기 변화, 승리는 작은 빛/입자, 발사는 섬광/반동을 사용한다. 공유 엔진 하나로 WebGL 컨텍스트를 재사용하며 화면 이탈 시 취소한다.

`land/assets/photo/poker-table-photo.png`는 built-in image_gen으로 생성했다. CLI는 사용하지 않았다. 프롬프트: A single isolated photoreal luxury six-seat poker table tabletop game background, wide horizontal oval, directly overhead view with slight natural depth on the bottom leather edge. Deep forest green real wool felt, padded near-black brown leather oval rail with fine stitching, thin polished dark walnut outer rim, subtle warm overhead studio light and real fabric grain. Completely empty central felt for runtime community cards. No cards, chips, cup holders, chairs, logo, text, symbols, labels, people or illustration. Entire table visible, centered, transparent alpha outside oval, 8 percent margins, 1.85:1 ratio. Crisp realistic details, restrained lighting.

## 동작 및 검증 범위

- 모자·소품의 선택/표시만 비활성화하고 저장 값은 보존한다.
- 바카라 최근 120판의 실제 개인 결과를 서버에 저장한다. 구슬판과 빅로드는 이 기록만 읽으며 과거 결과를 생성하지 않는다.
  빅로드의 6행·동일 결과 연속·막힌 열의 가로 꼬리·타이 겹쳐 표시 방식은 [운영사 규칙 문서](https://assets.lotoquebec.com/ressources/assets/v3/assets/blt8296e79a7001648c/bltacc37bad98da3666/69cbe029bf93fc4ab335956a/Big_Road_Baccarat_rules_en.pdf)와 대조했다.
- 하이로우 같다: 1/13, 최초 성공 12.48배. 누적 배율/최대 100배/정산은 서버에서 계산한다.
- 카드 배분은 하이로우·바카라·포커에도 연결하고 카드 이동 순서와 종이 소리를 맞춘다.
- 경마는 광장당 공통 경주표 하나, 첫 참가 후 60초 대기, 혼자여도 출발, 마감 후 참가 금지. 우승/미래 궤적은 종료 전 비공개다. 참가 요청을 지갑 호출 전에 저장하고 응답 유실·재시작 시 같은 요청 번호로 확인하며 지난 경주라면 환불한다. 정산 큐는 상태와 함께 트랜잭션으로 저장한다.
- 로컬의 별도 Worker/DB에서 WebSocket 주민 두 명이 60초 자동 출발, 공통 결과, 자동 지갑 정산, 재전송 중복 차감 방지까지 통과했다. 약 71.5초의 실제 경주 테스트다. 운영 주민의 재화는 사용하지 않았다.
