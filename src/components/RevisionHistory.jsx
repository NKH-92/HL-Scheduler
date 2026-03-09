import { useState } from 'react';

const REVISION_ITEMS = [
  {
    id: 'rev-0-0',
    title: 'Rev.0.0',
    content: '초기 프로토타입 개발 및 기본 간트 차트 렌더링 구현',
  },
  {
    id: 'rev-1-0',
    title: 'Rev.1.0',
    content: [
      '로컬 프로젝트 JSON 양방향 저장/불러오기 기능 추가',
      '초고해상도(렌더링 스케일 조정) 이미지 내보내기(Export) 지원',
      '각종 단축키 및 차트 드래그 앤 드롭 기능 고도화',
    ],
  },
  {
    id: 'rev-2-0',
    title: 'Rev.2.0',
    content: [
      '클라우드 기반 공개 일정 서버 연동 (조회/업로드)',
      '단일 프로젝트 중심에서 전사/팀 단위 다중 일정 관리 체계로 확장',
    ],
  },
  {
    id: 'rev-3-0',
    title: 'Rev.3.0',
    content: [
      '서버 공개 일정의 안정적 동기화를 위한 업로드/업데이트 워크플로우 리팩토링',
      '데이터 무결성 검증 로직 추가 및 UI 반응성 향상',
    ],
  },
  {
    id: 'rev-4-0',
    title: 'Rev.4.0',
    content: [
      '프론트엔드/백엔드 아키텍처 개편 및 서버리스 클라우드 연동',
      '공개 일정 디렉토리 고도화 (트리형 구조, 폴더별 탐색, 실시간 검색 등)',
      '사용자 인증/권한 체계 확립에 따른 강력한 보안 적용 (열람/편집/관리자 등급 적용)',
      '사내 인사 데이터(주소록) 연동 및 작업 등록 시 담당자 자동완성 기능 반영',
      '관리자 전용 대시보드 구축 및 사용자/폴더 관리 편의 기능 대폭 고도화',
    ],
  },
  {
    id: 'rev-5-0',
    title: 'Rev.5.0',
    content: [
      '공개 일정 보드 추가 및 폴더 목록 접기/펼치기 지원으로 가시 영역 확대',
      '공개 일정 보드에서 주간보고서/담당자별 보기 제거 및 요약 카드/여백 재정렬',
    ],
  },
];

function RevisionHistory() {
  const [openId, setOpenId] = useState('rev-5-0');

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
