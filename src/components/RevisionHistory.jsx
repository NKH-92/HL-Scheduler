import { useState } from 'react';

const REVISION_ITEMS = [
  {
    id: 'rev-0-0',
    title: 'Rev.0.0',
    content: '초기 개발',
  },
  {
    id: 'rev-1-0',
    title: 'Rev.1.0',
    content: '저장 / 불러오기 / 이미지 생성 기능 추가',
  },
  {
    id: 'rev-2-0',
    title: 'Rev.2.0',
    content: '공개 일정 서버 연동 기능 추가',
  },
  {
    id: 'rev-3-0',
    title: 'Rev.3.0',
    content: '공개 일정 업로드/업데이트 워크플로우 개선',
  },
  {
    id: 'rev-4-0',
    title: 'Rev.4.0',
    content: [
      '웹앱 전환 기반 정리 (React/Vite + Cloudflare Pages/Workers + D1 연동).',
      '공개 일정 고도화: 폴더 트리, 폴더별 조회/검색, 미리보기/가져오기, 업로드 시 폴더 선택.',
      '권한 분리: 비로그인 사용자는 조회만 가능, 승인 사용자만 편집/업로드 가능.',
      '관리자 기능 강화: 폴더 생성/삭제/이동 권한을 admin으로 제한.',
      '승인형 로그인 추가: 이메일 ID 회원가입(pending), 로그인/로그아웃, 토큰 세션 처리.',
      '관리자 사용자관리 추가: 승인대기 조회, 승인/거절, 임시 비밀번호 초기화.',
      '이력 추적 강화: 게시자(createdByEmail)·수정자(updatedByEmail) 자동 기록/표시.',
      '사원주소록 연동: 이메일 매칭으로 이름/부서/직위 표시 및 작업 편집 시 사원 선택 지원.',
      '자동 알림 메일 기능 제거: 업로드/업데이트를 일정 데이터 동기화 중심으로 단순화.',
      '로그인 역할별 진입 흐름 개선: admin 로그인 시 편집 화면 초기화, 일반 사용자는 공개 일정 중심 진입.',
    ],
  },
];

function RevisionHistory() {
  const [openId, setOpenId] = useState('rev-4-0');

  const toggleItem = (id) => {
    setOpenId((prev) => (prev === id ? '' : id));
  };

  return (
    <div className="animate-fade-in space-y-4">
      <section className="glass-panel p-5">
        <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">개정이력</h2>
        <p className="mt-1 text-sm text-slate-500">버전별 변경 사항을 확인할 수 있습니다.</p>
      </section>

      {REVISION_ITEMS.map((item) => {
        const isOpen = openId === item.id;
        return (
          <section key={item.id} className="glass-panel overflow-hidden">
            <button
              type="button"
              onClick={() => toggleItem(item.id)}
              className="flex w-full items-center justify-between px-5 py-4 text-left"
              aria-expanded={isOpen}
              aria-controls={`${item.id}-content`}
            >
              <span className="text-sm font-bold text-slate-900">{item.title}</span>
              <span className="text-xs font-semibold text-slate-500">{isOpen ? '접기' : '상세 보기'}</span>
            </button>

            {isOpen && (
              <div id={`${item.id}-content`} className="border-t border-slate-200/70 px-5 py-4 text-sm text-slate-700">
                {Array.isArray(item.content) ? (
                  <ul className="list-disc space-y-1 pl-5">
                    {item.content.map((line, index) => (
                      <li key={`${item.id}-${index}`}>{line}</li>
                    ))}
                  </ul>
                ) : (
                  item.content
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

export default RevisionHistory;
