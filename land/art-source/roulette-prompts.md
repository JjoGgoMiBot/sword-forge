# 러시안 룰렛·룰렛 휠 실사 자산 프롬프트 (2026-11-24 Codex CLI 내장 image_gen 으로 생성·적용 완료)

생성 도구: ChatGPT 이미지 생성(`photo-prompts.md`와 같은 방식). 공통 조건: 위에서 똑바로 내려다본 사진(원근 없음), 빛은 왼쪽 위 한 방향(약 4500K), 순수 검정 #000000 배경, 글자·숫자·로고·워터마크·사람 없음.

**왜 칸을 그림으로 뽑지 않나**: 생성 이미지는 6칸·37칸 간격이 정확히 같지 못해 처음 불만(원이 비대칭)이 되살아난다. 그래서 *재질*만 생성하고, 칸 위치·숫자·공 궤도는 코드(`land/revolver.js`, `land/wheel-view.js`)가 정확한 좌표로 올린다.

## 1. 리볼버 약실 판 → assets/photo/cyl-plate.webp
Generate an image. Top-down orthographic product photograph of a round blued-and-polished steel revolver cylinder face, perfectly circular and centered, 1:1, warm key light from upper left, brushed steel with fine machining rings, soft specular highlight, a plain smooth central hub with a small round ejector-rod hole. IMPORTANT: NO chambers, NO holes around the edge, NO cartridges — the solid plate only. Pure black #000000 background, whole disc visible with margin. Negative: no text, no letters, no numbers, no logos, no watermark, no engraving, no extra objects.

## 2. 황동 탄 윗면 → assets/photo/cartridge.webp
Generate an image. Macro top-down photograph of a single brass revolver cartridge base seen straight on, perfectly circular, centered, 1:1, polished brass rim with a copper primer in the middle, warm key light from upper left, sharp detail. Pure black #000000 background. Negative: no text, no headstamp letters, no numbers, no watermark, no extra objects.

## 3. 룰렛 휠 몸통 → assets/photo/wheel-bowl.webp
Generate an image. Top-down orthographic photograph of an empty casino roulette wheel bowl: glossy dark walnut outer rim with brass trim, a smooth ball track, an inner raised brass cone hub with a turret. IMPORTANT: NO numbered pockets, NO colored sectors, NO ball, NO numbers — leave the pocket ring as a plain neutral dark ring. Perfectly circular and centered, 1:1, warm key light from upper left, glossy lacquer reflections. Pure black #000000 background. Negative: no text, no letters, no numbers, no watermark, no people.

## 4. 룰렛 공 → assets/photo/wheel-ball.webp
Generate an image. Macro top-down photograph of one small polished white ceramic roulette ball, perfectly round, centered, 1:1, warm key light from upper left with a crisp specular highlight. Pure black #000000 background. Negative: no text, no watermark, no extra objects.

## 처리
원본 검정 배경은 Pillow 로 원형 알파 마스크를 씌워 webp 로 저장했다(약실 판 640px, 탄 256, 휠 몸통 760, 공 128). 코드는 이 이미지를 깔고 칸·숫자·공만 위에 얹는다.
