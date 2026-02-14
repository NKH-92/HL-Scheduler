const MANUAL_SECTIONS = [
  {
    id: 'quick-start',
    title: '빠른 시작',
    items: [
      '비로그인 상태에서는 공개 일정 조회만 가능합니다.',
      '로그인 후 승인된 계정이면 편집 탭이 활성화됩니다.',
      '신규 작업 등록 후 간트 화면에서 날짜를 조정하면 가장 빠르게 시작할 수 있습니다.',
    ],
  },
  {
    id: 'edit-flow',
    title: '편집 / 일정 관리',
    items: [
      '작업의 필수값은 구분, 작업명입니다.',
      '간트에서 드래그로 일정 이동/기간 조정이 가능합니다.',
      '보고서(Word), Excel, 이미지 내보내기를 지원합니다.',
    ],
  },
  {
    id: 'public-schedules',
    title: '공개 일정',
    items: [
      '공개 일정에서 검색, 미리보기, 가져오기를 사용할 수 있습니다.',
      '업로드/업데이트는 승인된 계정만 가능합니다.',
      '업로드 시 폴더를 선택하며, 가져오기는 현재 편집 데이터를 덮어씁니다.',
    ],
  },
  {
    id: 'permissions',
    title: '권한 / 관리자 기능',
    items: [
      '일반 승인 계정: 일정 편집, 업로드/업데이트 가능',
      'Admin 계정: 사용자 승인관리 + 폴더 생성/삭제/이동 가능',
      '비승인 계정은 편집 기능을 사용할 수 없습니다.',
    ],
  },
  {
    id: 'backup-restore',
    title: '백업 / 복원',
    items: [
      '상단 백업 버튼으로 현재 프로젝트를 JSON으로 저장합니다.',
      '복원 시 현재 작업 데이터는 가져온 데이터로 교체됩니다.',
      '대량 변경 전에는 백업 후 작업하는 것을 권장합니다.',
    ],
  },
];

function Help() {
  return (
    <div className="animate-fade-in space-y-5">
      <section className="glass-panel p-5">
        <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">도움말</h2>
        <p className="mt-1 text-sm text-slate-500">핵심 사용 흐름만 간단히 정리했습니다.</p>
      </section>

      <section className="glass-panel p-5">
        <h3 className="text-sm font-bold text-slate-800">문의</h3>
        <div className="mt-3 text-sm text-slate-700">
          <p className="font-semibold">SQA팀 남광현</p>
          <a className="font-semibold text-blue-600 hover:underline" href="mailto:nkh92@hanlim.com">
            nkh92@hanlim.com
          </a>
        </div>
      </section>

      <section className="glass-panel p-5">
        <h3 className="text-sm font-bold text-slate-800">사용 매뉴얼</h3>
        <p className="mt-1 text-xs text-slate-500">항목을 눌러 펼쳐서 확인하세요.</p>

        <div className="mt-3 space-y-2">
          {MANUAL_SECTIONS.map((section) => (
            <details key={section.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-slate-800">{section.title}</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}

export default Help;

