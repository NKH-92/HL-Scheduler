# 📅 HL-Scheduler (Project Timeline Studio)

**HL-Scheduler**는 전문적이고 직관적인 웹 기반 프로젝트 일정 및 간트 차트(Gantt Chart) 관리 애플리케이션입니다.  
사용자는 프로젝트, 태스크, 휴가 등을 효율적으로 시각화하고, 작성된 일정을 다른 사람들과 실시간으로 공유할 수 있습니다. 

본 프로젝트는 React 프레임워크와 Vite 번들러를 활용하여 설계되었으며, 높은 속도와 모던한 UI/UX 경험을 제공합니다.

---

## ✨ 주요 기능 (Key Features)

- **Interactive Gantt Chart**: 드래그 앤 드롭 및 클릭 한 번으로 손쉽게 프로젝트 일정과 타임라인을 관리할 수 있습니다.
- **Modern User Interface**: 최근 웹 트렌드를 반영한 카드 뷰 UI, 글래스 모피즘(Glassmorphism) 및 편안한 그라데이션 바탕을 적용해 뛰어난 가독성과 매끄러운 사용자 경험(UX)을 제공.
- **실시간 공개 및 공유 기능**: 로그인 없이도 공유된 일정 확인이 가능하며, 사용자/부서별 '폴더' 기반으로 분류할 수 있습니다.
- **세밀한 의존성 관리**: 각 작업(Task)별 선/후행 관계(FF, FS, SF, SS) 설정으로 효율적인 일정 관리가 가능합니다.
- **휴가 및 주말 예외 처리**: 휴가자, 작업 불가능 휴일 지정 시 간트차트 일정 자동 계산(밀기/당기기)을 지원합니다.
- **고해상도 이미지 및 Excel/PDF 추출**: 작업된 일정을 JPG/PNG 캡처, 엑셀 파일, 혹은 로컬 JSON 파일 등 자유로운 포맷으로 추출할 수 있습니다.

---

## 🛠️ 기술 스택 (Tech Stack)

- **Framework**: React 18
- **Build Tool**: Vite
- **Styling**: Tailwind CSS (PostCSS)
- **State Management**: React Hooks (State, Context, Effects)
- **Network / API**: Fetch API (Cloudflare Worker backend)
- **Icons**: Custom SVG icon components
- **Exporting Modules**: `html-to-image`, `html2canvas`, `xlsx` (Excel)
- **Deployment**: Cloudflare Pages + Cloudflare Workers(D1)

---

## 🚀 설치 및 실행 방법 (Getting Started)

최신 Node.js 환경(권장: v18 이상)에서 동작합니다.

### 1️⃣ 패키지 설치
```bash
npm install
# 혹은
yarn install
```

### 2️⃣ 환경 변수 설정
최상위 경로에 `.env` 파일을 생성하고 아래 API 주소를 알맞게 기입해주세요.
```env
VITE_PUBLIC_SCHEDULES_API_BASE=https://your-api-endpoint.com/api
```

### 3️⃣ 개발 서버 시작
```bash
npm run dev
# 기본적으로 http://localhost:5173 에 접속 가능합니다.
```

### 4️⃣ 프로덕션 빌드
```bash
npm run build
```
빌드된 파일은 `dist/` 폴더에 생성되며 어떠한 정적 웹 서버(Apache, Nginx, Vercel 등)에도 바로 배포할 수 있습니다.

---

## 📂 폴더 구조 개요

```text
├── docs/                # 사용자 메뉴얼 및 참고 사진 파일 (images)
├── public/              # 정적 리소스 파일
├── src/                 
│   ├── components/      # React 메인 컴포넌트 (AppHeader, PublicSchedules 등)
│   ├── hooks/           # 커스텀 훅 (ex: useIsMobileViewport)
│   ├── utils/           # API 통신, 데이터 변환, 로컬 스토리지 등의 유틸 함수
│   ├── App.jsx          # 메인 랜더링 엔트리 (라우팅/탭 관리)
│   └── main.jsx         # 애플리케이션 진입점
├── server/              # Cloudflare Worker + D1 API
├── .env                 # API 환경 변수
├── tailwind.config.cjs  # Tailwind CSS 설정
└── vite.config.js       # Vite 빌드 도구 설정
```

---

## 📖 문서

자세한 사용법은 초보자용 매뉴얼을 참고해 주시기 바랍니다.  
👉 [사용자 매뉴얼 열기 (docs/USER_MANUAL.md)](./docs/USER_MANUAL.md)

---

## 🛡️ License & Copyright

Copyright ©. All rights reserved.
이 프로그램은 내부 프로젝트 조율 및 자산관리를 위해 개발되었습니다.
