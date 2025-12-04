# CLAUDE.md - PhonicsQuest 자동화 에이전트 v3

## 🤖 에이전트 모드
완전 자율 개발 에이전트. 완료까지 멈추지 않음.

---

## 🚨 절대 규칙

### 금지
- ❌ "~할까요?" 질문
- ❌ TODO, FIXME, PLACEHOLDER
- ❌ 미완성 코드
- ❌ 테스트 없이 완료 선언

### 필수
- ✅ 완료까지 자동 진행
- ✅ 에러 시 자동 수정 (최대 3회)
- ✅ 빌드 + 서버 + 테스트 + 스크린샷

---

## 📱 PWA 필수

```yaml
manifest.ts: 앱 이름, 아이콘, 테마색
Service Worker: 오프라인 캐싱 (Serwist)
아이콘: icon-192.png, icon-512.png, apple-touch-icon.png
메타태그: themeColor, appleWebApp, viewport
설치 프롬프트: usePWAInstall 훅
오프라인: useOnlineStatus 훅
```

---

## 🎨 UI/UX 필수

```yaml
디자인:
  - 글래스모피즘 (backdrop-filter: blur)
  - Framer Motion 애니메이션
  - 다크모드 지원 (useTheme)
  - 페이지 전환 애니메이션

컴포넌트:
  - 스켈레톤 로딩
  - 토스트 알림 (Zustand)
  - 햅틱 피드백 (navigator.vibrate)
  - AnimatedButton

시인성:
  - 학습 단어: 48-72px
  - 터치 영역: 44px 이상
  - 색상 대비: 4.5:1 이상
  - 포커스 표시: focus-visible
```

---

## ⚖️ 저작권 (상업화 안전)

```yaml
폰트:
  - Pretendard (OFL)
  - Noto Sans KR (OFL)
  - Inter (OFL)

아이콘:
  - Lucide React (MIT)

이미지:
  - 직접 제작 SVG
  - CSS 그래픽

오디오:
  - Web Speech API
  - CC0 효과음
```

---

## 💰 비용 최적화

```yaml
Firestore:
  - persistentLocalCache() 활성화
  - 한 문서에 progress 통합
  - 게임 중 로컬만 업데이트
  - 레벨 완료 시에만 저장
  - 리스너는 필요한 화면에서만

Gemini:
  - 디바운스 1.5초
  - 결과 캐싱 (Map)
  - gemini-1.5-flash 우선
  - 일일 사용량 제한 (50회)
```

---

## 🧠 자동 추가 기능

```yaml
항상 추가:
  - 스켈레톤 로딩
  - ErrorBoundary
  - 토스트 알림
  - aria-label 접근성
  - 키보드 네비게이션
  - 로딩/에러 상태

로그인 화면:
  - 유효성 검사
  - 비밀번호 토글
  - Enter 제출

목록 화면:
  - 검색/정렬/필터
  - 빈 상태 UI
  - 무한 스크롤

게임 화면:
  - 일시정지
  - 효과음 토글
  - 자동 저장
  - 재시작 옵션
```

---

## 🔄 실행 순서

```
Phase 1: 프로젝트 분석
Phase 2: 환경 설정 + 패키지 설치
Phase 3: PWA 설정 (manifest, SW, 아이콘)
Phase 4: 코드 개발 (완전한 코드만)
Phase 5: 빌드 검증 (실패 시 자동 수정)
Phase 6: 개발 서버 실행
Phase 7: Playwright 브라우저 테스트
Phase 8: 스크린샷 3종 + 완료 보고서
```

---

## 📊 완료 보고서 형식

```
═══════════════════════════════════════
       🎉 작업 완료 보고서
═══════════════════════════════════════
✅ 빌드: 성공
✅ PWA: manifest + SW + 오프라인
✅ 테스트: 통과
✅ 저작권: 안전
✅ 비용: 최적화

📸 스크린샷:
- test-results/mobile.png
- test-results/tablet.png
- test-results/desktop.png

🚀 접속: http://localhost:3000
═══════════════════════════════════════
```

---

## 🛠️ 기술 스택

```yaml
Framework: Next.js 14+ (App Router)
Language: TypeScript (strict)
Styling: Tailwind CSS
Animation: Framer Motion
State: Zustand
Database: Firebase Firestore
AI: Gemini API
Testing: Playwright
PWA: Serwist (@serwist/next)
Icons: Lucide React
```

---

**Claude Code는 이 설정을 읽고 자동으로 적용합니다.**
**실행: `claude --dangerously-skip-permissions`**
