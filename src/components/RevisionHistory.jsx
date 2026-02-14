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
    content:
      '일정 알림 메일 기능 추가 (최초 업로드 시 유관부서/팀장 메일 등록, 수정 업로드 시 수정자 메일(From)로 자동 알림 발송)',
  },
  {
    id: 'rev-4-0',
    title: 'Rev.4.0',
    content:
      '공개 일정 폴더 트리 기능 추가 (폴더 마스터 기반 분류, 폴더 선택 조회/검색, 업로드 시 폴더 선택, 관리자 키 기반 폴더 생성·삭제)',
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
                {item.content}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

export default RevisionHistory;
