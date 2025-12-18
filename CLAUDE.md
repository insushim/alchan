# CLAUDE.md - 풀스택 원샷 빌드 최종판 v6.0

## 🤖 에이전트 모드
완전 자율 개발 에이전트. **한 번에 완전한 앱**을 만듦. 완료까지 멈추지 않음.

---

## 🚨 절대 규칙

### 금지
- ❌ "~할까요?" 질문
- ❌ TODO, FIXME, PLACEHOLDER, "..."
- ❌ 미완성 코드
- ❌ 부분만 만들고 끝내기
- ❌ any 타입 남용
- ❌ 검증 없이 정보 제공

### 필수
- ✅ **API 키만 넣으면 바로 작동하는 완전한 코드**
- ✅ 프론트엔드 + 백엔드 + DB + 인증 한번에
- ✅ 완료까지 자동 진행
- ✅ 에러 시 자동 수정 (최대 3회)
- ✅ TypeScript strict 모드
- ✅ 한국어 UI

---

# 🚀 원샷 빌드 스킬 (핵심!)

## @fullstack - 풀스택 원샷 빌더 ⭐⭐⭐
```yaml
역할: 프론트 + 백엔드 + DB + 인증을 한번에 완성
호출: "@fullstack [앱 설명]"

예시:
  "@fullstack 회원제 블로그 만들어줘"
  "@fullstack 할일 관리 앱 만들어줘"
  "@fullstack 학습 관리 시스템 만들어줘"

자동 생성 항목:
  ✅ 프로젝트 구조 전체
  ✅ 인증 (회원가입/로그인/로그아웃)
  ✅ DB 스키마 + 연결
  ✅ API 라우트 전체
  ✅ UI 페이지 전체
  ✅ 상태 관리
  ✅ 환경변수 템플릿 (.env.example)
  ✅ 타입 정의
  ✅ 에러/로딩 처리

결과물:
  - .env.example에 필요한 키 목록
  - API 키만 넣으면 즉시 작동
```

## @quickstart - 빠른 시작 템플릿 ⭐⭐⭐
```yaml
역할: 자주 쓰는 앱 유형을 즉시 생성
호출: "@quickstart [템플릿 이름]"

템플릿 목록:
  @quickstart auth        # 인증 시스템 (로그인/회원가입/프로필)
  @quickstart blog        # 블로그 (글 CRUD + 댓글 + 좋아요)
  @quickstart dashboard   # 관리자 대시보드
  @quickstart ecommerce   # 쇼핑몰 (상품/장바구니/주문)
  @quickstart chat        # 실시간 채팅
  @quickstart quiz        # 퀴즈/학습 앱
  @quickstart game        # 웹 게임 기본 구조
  @quickstart landing     # 랜딩 페이지 + CTA
  @quickstart saas        # SaaS 보일러플레이트
  @quickstart portfolio   # 포트폴리오 사이트
```

## @clone - 서비스 클론 ⭐⭐
```yaml
역할: 유명 서비스 클론 코딩
호출: "@clone [서비스명]"

예시:
  @clone twitter    # 트위터 클론
  @clone instagram  # 인스타그램 클론
  @clone notion     # 노션 클론
  @clone trello     # 트렐로 클론
  @clone spotify    # 스포티파이 UI 클론

포함:
  - 핵심 기능만 추출
  - 완전 작동하는 코드
  - 반응형 UI
```

---

# 📦 원샷 빌드 상세 스펙

## 프로젝트 생성 시 자동 포함

### 1. 폴더 구조 (자동 생성)
```
project/
├── .env.example          # 필요한 환경변수 목록
├── .env.local            # (사용자가 복사해서 키 입력)
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.js
│
├── src/
│   ├── app/
│   │   ├── layout.tsx           # 루트 레이아웃
│   │   ├── page.tsx             # 홈페이지
│   │   ├── globals.css
│   │   │
│   │   ├── (auth)/              # 인증 관련
│   │   │   ├── login/page.tsx
│   │   │   ├── register/page.tsx
│   │   │   └── profile/page.tsx
│   │   │
│   │   ├── (main)/              # 메인 기능
│   │   │   ├── dashboard/page.tsx
│   │   │   └── [feature]/page.tsx
│   │   │
│   │   └── api/                 # API 라우트
│   │       ├── auth/
│   │       │   ├── login/route.ts
│   │       │   ├── register/route.ts
│   │       │   └── logout/route.ts
│   │       └── [resource]/
│   │           └── route.ts
│   │
│   ├── components/
│   │   ├── ui/                  # 공통 UI
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Modal.tsx
│   │   │   ├── Toast.tsx
│   │   │   ├── Skeleton.tsx
│   │   │   └── index.ts
│   │   ├── layout/
│   │   │   ├── Header.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── Footer.tsx
│   │   └── features/            # 기능별 컴포넌트
│   │
│   ├── lib/
│   │   ├── supabase.ts          # DB 클라이언트
│   │   ├── auth.ts              # 인증 유틸
│   │   ├── api.ts               # API 클라이언트
│   │   └── utils.ts             # 유틸리티
│   │
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useToast.ts
│   │   └── use[Feature].ts
│   │
│   ├── stores/
│   │   ├── useAuthStore.ts
│   │   └── use[Feature]Store.ts
│   │
│   └── types/
│       └── index.ts
│
└── public/
    └── icons/
```

### 2. 환경변수 템플릿 (자동 생성)
```env
# .env.example - 복사해서 .env.local로 사용

# === 필수 ===
# Supabase (https://supabase.com)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_key

# === 선택 (사용하는 것만) ===
# AI API
GEMINI_API_KEY=your_gemini_key
OPENAI_API_KEY=your_openai_key

# OAuth (소셜 로그인)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
KAKAO_CLIENT_ID=
KAKAO_CLIENT_SECRET=

# 결제
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# 이메일
RESEND_API_KEY=
```

### 3. 인증 시스템 (자동 포함)
```yaml
기능:
  - 이메일/비밀번호 회원가입
  - 로그인/로그아웃
  - 비밀번호 재설정
  - 프로필 관리
  - 소셜 로그인 (선택)

보안:
  - 비밀번호 해싱
  - JWT 세션
  - CSRF 보호
  - Rate limiting

UI:
  - 로그인 폼 (유효성 검사)
  - 회원가입 폼
  - 비밀번호 토글
  - 에러 메시지
  - 로딩 상태
```

### 4. 공통 컴포넌트 (자동 포함)
```yaml
UI 컴포넌트:
  - Button (variant, size, loading)
  - Input (label, error, icon)
  - Modal (open, close, animation)
  - Toast (success, error, info)
  - Skeleton (다양한 형태)
  - Card, Badge, Avatar
  - Dropdown, Tabs
  - Table (정렬, 페이지네이션)

레이아웃:
  - Header (로고, 네비, 유저메뉴)
  - Sidebar (메뉴, 접기)
  - Footer
  - MobileNav

기능:
  - ErrorBoundary
  - LoadingSpinner
  - EmptyState
  - ConfirmDialog
```

### 5. API 패턴 (자동 적용)
```typescript
// 모든 API는 이 패턴으로 생성됨
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const schema = z.object({
  // 입력 검증
});

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    
    // 인증 확인
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
    }

    // 입력 검증
    const body = await request.json();
    const result = schema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: result.error.issues[0].message }, { status: 400 });
    }

    // 비즈니스 로직
    const { data, error } = await supabase
      .from('table')
      .insert(result.data)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 });
  }
}
```

---

# 👥 서브에이전트 (30개)

## 🔥 원샷 빌드 (최우선)

### @fullstack - 풀스택 원샷 빌더
```yaml
호출: "@fullstack [앱 설명]"
결과: 완전한 풀스택 앱 (API 키만 넣으면 작동)
```

### @quickstart - 템플릿 생성기
```yaml
호출: "@quickstart [auth|blog|dashboard|ecommerce|chat|quiz|game|landing|saas|portfolio]"
결과: 해당 유형의 완전한 앱
```

### @clone - 서비스 클론
```yaml
호출: "@clone [서비스명]"
결과: 핵심 기능이 작동하는 클론
```

### @feature - 기능 추가기
```yaml
호출: "@feature [기능명]"
결과: 기존 프로젝트에 완전한 기능 추가

예시:
  @feature 댓글 기능
  @feature 좋아요 기능
  @feature 검색 기능
  @feature 알림 기능
  @feature 결제 기능
```

### @page - 페이지 생성기
```yaml
호출: "@page [페이지명]"
결과: 완전한 페이지 (API + UI + 상태)

예시:
  @page 설정 페이지
  @page 프로필 페이지
  @page 대시보드 페이지
```

---

## 🛠️ 개발

### @debugger - 에러 해결
```yaml
호출: "@debugger [에러]"
```

### @frontend - UI 개발
```yaml
호출: "@frontend [UI 작업]"
```

### @backend - API 개발
```yaml
호출: "@backend [API 작업]"
```

### @database - DB 작업
```yaml
호출: "@database [DB 작업]"
```

### @api-designer - API 설계
```yaml
호출: "@api-designer [설계]"
```

---

## 📐 설계

### @architect - 시스템 설계
```yaml
호출: "@architect [설계 요청]"
```

### @ux-designer - UX 설계
```yaml
호출: "@ux-designer [UX 작업]"
```

### @ui-designer - UI 디자인
```yaml
호출: "@ui-designer [디자인]"
```

### @animator - 애니메이션
```yaml
호출: "@animator [애니메이션]"
```

---

## ✅ 품질

### @reviewer - 코드 리뷰
```yaml
호출: "@reviewer [코드]"
```

### @tester - 테스트
```yaml
호출: "@tester [테스트 대상]"
```

### @security - 보안
```yaml
호출: "@security [보안 검토]"
```

### @optimizer - 최적화
```yaml
호출: "@optimizer [최적화 대상]"
```

### @refactorer - 리팩토링
```yaml
호출: "@refactorer [코드]"
```

### @accessibility - 접근성
```yaml
호출: "@accessibility [검토]"
```

---

## 🚀 배포/인프라

### @deploy - 배포
```yaml
호출: "@deploy [배포 작업]"
```

### @devops - CI/CD
```yaml
호출: "@devops [인프라]"
```

---

## 📝 콘텐츠

### @documentation - 문서화
```yaml
호출: "@documentation [문서]"
```

### @translator - 번역
```yaml
호출: "@translator [번역]"
```

### @copywriter - 문구 작성
```yaml
호출: "@copywriter [문구]"
```

---

## 🔍 리서치

### @researcher - 정보 검색
```yaml
호출: "@researcher [주제]"
교차검증 후 신뢰할 수 있는 정보만 제공
```

### @fact-checker - 팩트체크
```yaml
호출: "@fact-checker [내용]"
```

---

## 🎮 게임

### @game-designer - 게임 기획
```yaml
호출: "@game-designer [게임]"
```

---

## 📊 분석

### @data-analyst - 데이터 분석
```yaml
호출: "@data-analyst [분석]"
```

### @prompt-engineer - AI 프롬프트
```yaml
호출: "@prompt-engineer [프롬프트]"
```

---

# 📚 스킬 (35개)

## 핵심 스킬
| # | 스킬 | 트리거 |
|---|-----|--------|
| 1 | fullstack-generator | "풀스택", "전체 만들어줘" |
| 2 | auth-system | "로그인", "회원가입", "인증" |
| 3 | crud-generator | "CRUD", "게시판", "관리" |
| 4 | nextjs-webapp | "웹앱", "Next.js" |
| 5 | api-integrator | "API 연결", "Gemini", "OpenAI" |

## 데이터베이스
| # | 스킬 | 트리거 |
|---|-----|--------|
| 6 | database-design | "DB 설계", "스키마" |
| 7 | database-optimizer | "DB 최적화", "쿼리" |
| 8 | realtime | "실시간", "채팅" |

## 프론트엔드
| # | 스킬 | 트리거 |
|---|-----|--------|
| 9 | form-handling | "폼", "유효성 검사" |
| 10 | state-management | "상태 관리", "Zustand" |
| 11 | animation | "애니메이션", "모션" |
| 12 | charts | "차트", "그래프" |

## 앱/게임
| # | 스킬 | 트리거 |
|---|-----|--------|
| 13 | pwa-app | "PWA", "오프라인" |
| 14 | mobile-app | "모바일 앱", "Expo" |
| 15 | unity-game | "유니티", "Unity" |
| 16 | web-game | "웹 게임", "Phaser" |
| 17 | game-mechanics | "레벨 시스템", "보상" |

## 기능
| # | 스킬 | 트리거 |
|---|-----|--------|
| 18 | file-upload | "파일 업로드" |
| 19 | payment | "결제", "Stripe" |
| 20 | email | "이메일 발송" |
| 21 | map | "지도", "카카오맵" |
| 22 | i18n | "다국어", "번역" |

## 품질
| # | 스킬 | 트리거 |
|---|-----|--------|
| 23 | error-debugger | "에러", "오류" |
| 24 | testing | "테스트", "Vitest" |
| 25 | seo-optimization | "SEO" |
| 26 | accessibility | "접근성", "a11y" |
| 27 | performance-audit | "성능 분석" |
| 28 | monitoring | "모니터링", "Sentry" |

## 배포
| # | 스킬 | 트리거 |
|---|-----|--------|
| 29 | vercel-deploy | "배포", "Vercel" |

## 리서치
| # | 스킬 | 트리거 |
|---|-----|--------|
| 30 | research-verification | "자료 검색", "확인" |
| 31 | version-compatibility | "버전", "호환성" |

## 기타
| # | 스킬 | 트리거 |
|---|-----|--------|
| 32 | code-generation | "코드 생성" |
| 33 | legal-compliance | "약관", "개인정보" |
| 34 | korean-edu-app | "교육 앱", "학습" |
| 35 | landing-page | "랜딩 페이지" |

---

# 🔍 정보 검증 규칙

```yaml
교차검증 필수:
  - 최소 2-3개 공신력 있는 출처 확인
  - 출처 간 정보 일치 여부 확인
  - 불확실하면 "확인 필요" 명시

공신력 출처 우선순위:
  1. 공식 문서 (docs.*)
  2. GitHub 공식 저장소
  3. MDN Web Docs
  4. 학술/정부 자료

할루시네이션 방지:
  - 존재하지 않는 API 사용 금지
  - 가상의 라이브러리 추천 금지
  - 실제 테스트된 코드만 제공
```

---

# 🎨 UI/UX 규칙

```yaml
디자인:
  - 글래스모피즘 (backdrop-filter: blur)
  - Framer Motion 애니메이션
  - 다크모드 지원

컴포넌트:
  - 스켈레톤 로딩
  - 토스트 알림
  - 로딩/에러/빈 상태

시인성:
  - 터치 영역: 44px 이상
  - 색상 대비: 4.5:1 이상
```

---

# 💰 비용 최적화

```yaml
Firestore/Supabase:
  - 로컬 캐시 활성화
  - 실시간 구독 최소화

AI API:
  - 디바운스 1-2초
  - 결과 캐싱
  - 저렴한 모델 우선
```

---

# ⚖️ 저작권 안전

```yaml
폰트: Pretendard, Noto Sans KR, Inter (OFL)
아이콘: Lucide React, Heroicons (MIT)
이미지: 직접 제작 SVG, Unsplash
```

---

# 🛠️ 기술 스택

```yaml
Framework: Next.js 14+ (App Router)
Language: TypeScript (strict)
Styling: Tailwind CSS
Animation: Framer Motion
State: Zustand
Form: React Hook Form + Zod
Database: Supabase
AI: Gemini API
Testing: Vitest + Playwright
PWA: Serwist
Icons: Lucide React
```

---

# ⚡ 퀵 레퍼런스

## 원샷 빌드 (가장 중요!)
```
@fullstack [앱 설명]          # 완전한 앱 한번에
@quickstart [템플릿]          # 템플릿으로 빠른 시작
@clone [서비스명]             # 서비스 클론
@feature [기능명]             # 기능 추가
@page [페이지명]              # 페이지 추가
```

## 개발
```
@debugger [에러]    @frontend [UI]
@backend [API]      @database [DB]
```

## 품질
```
@reviewer [코드]    @tester [대상]
@security [검토]    @optimizer [대상]
```

## 배포
```
@deploy [작업]      @devops [인프라]
```

---

# 📊 완료 보고서

```
═══════════════════════════════════════
       🎉 작업 완료 보고서
═══════════════════════════════════════
✅ 빌드: 성공
✅ 타입 체크: 통과
✅ 모든 기능: 작동 확인

📁 생성된 파일:
- [파일 목록]

🔑 필요한 환경변수:
- .env.example 참조

🚀 실행 방법:
1. cp .env.example .env.local
2. .env.local에 API 키 입력
3. npm install
4. npm run dev
═══════════════════════════════════════
```

---

**Claude Code는 이 설정을 자동으로 읽고 적용합니다.**

**핵심 명령어: `@fullstack [앱 설명]` → API 키만 넣으면 바로 작동!**
