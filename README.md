# HL-Scheduler

React + Vite 기반의 간단한 일정/업무 스케줄러입니다.  
업무 관리, Gantt 차트, 휴가(일정 제외), 이미지 내보내기, Word 보고서 생성 기능을 포함합니다.

## 요구사항

- Node.js 18+

## 실행(개발)

```bash
cd D:\Scheduler
npm install
npm run dev
```

PowerShell에서 `npm` 실행이 막히는 경우(Execution Policy 오류) 아래처럼 실행하세요:

```powershell
cd D:\Scheduler
npm.cmd run dev
```

브라우저에서 `http://localhost:5173` 로 접속합니다.

## 빌드

```bash
npm.cmd run build
```

## 포터블 EXE (오프라인 배포)

Windows에서 설치 없이 실행되는 단일 `exe`로 패키징합니다.

```bash
npm.cmd run dist:portable
```

결과물: `release/Scheduler-<version>.exe` (이 파일만 다른 PC로 복사해서 실행하면 됩니다.)

## 메모

- 스타일은 Tailwind를 빌드 파이프라인(PostCSS)로 처리합니다(더 이상 CDN 사용하지 않음).
