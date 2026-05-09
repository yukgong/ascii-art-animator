# ASCII Art Animator

> 이미지와 GIF를 멋진 ASCII 아트 애니메이션으로 변환하세요

[English](README.md)

<table>
  <tr>
    <td><img src="sample/main_gif.gif" width="400" height="400"/></td>
    <td><img src="sample/unit_main.gif" width="400" height="400"/></td>
  </tr>
</table>

## ✨ 주요 기능

- **이미지 → ASCII 변환**: 커스터마이징 가능한 문자 매핑으로 정적 이미지를 ASCII 아트로 변환
- **애니메이션 GIF 지원**: GIF를 프레임별 ASCII 애니메이션으로 변환
- **고급 이미지 전처리**:
  - 감마 보정
  - 블랙/화이트 포인트 조정
  - 블러, 그레인, 노이즈 효과
  - Floyd-Steinberg 디더링으로 부드러운 그라데이션
  - 색상 반전
- **밝기 매핑**: 다단계 밝기로 풍부한 ASCII 아트 표현
- **내보내기 옵션**:
  - PNG (단일 프레임)
  - GIF (애니메이션)
  - WebM (비디오)
  - React/HTML 코드 (독립 실행형)
- **실시간 미리보기**: 캔버스 기반 60 FPS 렌더링
- **완전한 커스터마이징**: ASCII 아트 생성의 모든 요소를 직접 제어

## 🚀 빠른 시작

```bash
git clone https://github.com/yukgong/ascii-art-animator.git
cd ascii-art-animator
npm install
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 열어 확인하세요.

## 🎨 사용 방법

1. **이미지 또는 GIF 업로드**: "Upload Media" 클릭
2. **설정 조정**: 전처리, 문자 매핑, 색상 등 세부 조정
3. **애니메이션 재생**: 재생 버튼으로 ASCII 아트 감상
4. **내보내기**: PNG, GIF, WebM으로 저장하거나 React 컴포넌트 코드 다운로드

## 🛠️ 기술 스택

- **프레임워크**: Next.js 15 (App Router)
- **런타임**: React 19
- **렌더링**: Canvas API
- **이미지 처리**: 커스텀 알고리즘 (감마, 디더링, 전처리)
- **GIF 생성**: [gif.js](https://github.com/jnordberg/gif.js)
- **GIF 파싱**: [gifuct-js](https://github.com/matt-way/gifuct-js)
- **파일 처리**: JSZip, FileSaver.js
- **스타일링**: Tailwind CSS

## 📦 프로젝트 구조

```
ascii-art-animator/
├── app/
│   ├── layout.tsx              # 루트 레이아웃
│   ├── page.tsx                # 메인 에디터 페이지
│   └── globals.css             # 글로벌 스타일
├── components/
│   └── animator/
│       ├── AsciiCanvas.tsx     # 캔버스 기반 ASCII 렌더러
│       └── AsciiControlPanel.tsx # 설정 패널
├── lib/
│   └── animations/
│       └── ascii-engine.ts     # ASCII 아트 핵심 엔진
├── types/
│   └── gifuct-js.d.ts          # GIF 라이브러리 타입
└── public/
    └── gif.worker.js           # GIF 생성 워커
```

## 🎯 핵심 알고리즘

1. **이미지 전처리**: 감마, 블러, 그레인, 디더링, 색상 조정 적용
2. **밝기 추출**: 각 픽셀을 밝기값(0-255)으로 변환
3. **문자 매핑**: 밝기값에 따라 ASCII 문자로 매핑
4. **렌더링**: 60 FPS로 캔버스에 ASCII 아트 출력

## 🤝 기여하기

PR은 언제나 환영입니다!

1. 레포지토리를 Fork하세요
2. 기능 브랜치 생성 (`git checkout -b feature/amazing-feature`)
3. 변경사항 커밋 (`git commit -m 'Add some amazing feature'`)
4. 브랜치에 Push (`git push origin feature/amazing-feature`)
5. Pull Request 열기

## 📄 라이선스

MIT License — 자세한 내용은 [LICENSE](LICENSE) 파일을 참고하세요.
