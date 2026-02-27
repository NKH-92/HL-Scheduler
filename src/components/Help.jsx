const MANUAL_SECTIONS = [
  {
    id: 'core-concept',
    title: '💬 핵심 개념 및 시작하기',
    items: [
      '웹 기반 간편 프로젝트 관리: 복잡한 설치 없이 브라우저에서 바로 간트 차트를 생성하고 관리합니다.',
      '공개 일정: 다른 팀원/부서가 공유한 프로젝트를 폴더별로 열람하고 손쉽게 검색할 수 있습니다 (비로그인 기능).',
      '편집 공간: 회원가입 후 승인된 사용자는 [편집] 탭에서 나만의 일정을 설계하고, 작성 중인 데이터는 브라우저에 자동 저장(Auto-save)됩니다.',
    ],
  },
  {
    id: 'edit-flow',
    title: '🚀 스케줄링 기초 (편집 탭)',
    items: [
      '작업 생성: 화면 좌측 하단의 [+ 작업 추가] 버튼으로 필수 항목(구분, 작업명)을 입력하여 일정을 추가합니다.',
      '직관적인 일정 조정: 우측 차트에서 생성된 막대(Bar)를 마우스로 직접 드래그하여 날짜를 손쉽게 변경할 수 있습니다.',
      '선행 작업(의존성) 연결: 두 번째 작업의 "선행 작업"란에 앞선 작업을 지정하면, 파란 연결선이 생기며 두 일정이 유기적으로 연동됩니다 (앞 일정이 연기되면 뒤 일정도 자동으로 연기됨).',
      '휴가(공휴일) 지정: 휴가를 등록하면 시스템이 자동으로 휴가일수만큼 작업 마감(종료)일을 뒤로 연장해 줍니다.',
    ],
  },
  {
    id: 'cloud-sync',
    title: '☁️ 데이터 저장 및 공유 (서버 연동)',
    items: [
      '서버로 업로드: 내 PC에서 완성한 일정을 팀원들과 공유하려면 [서버로 업로드] 아이콘을 눌러 공개 폴더로 게시합니다.',
      '일정 가져오기(주의): 공개 일정 카드의 [가져오기] 버튼이나 로컬 파일(JSON)을 불러올 때, "기존 편집 내용은 모두 삭제"되고 해당 일정으로 덮어쓰기 됩니다.',
      '로컬 백업: 화면 상단 아이콘 중 💾(디스켓) 모양 버튼으로 언제든 내 컴퓨터에 변경 내용을 안전하게 파일 형태로 다운로드(JSON)할 수 있습니다.',
    ],
  },
  {
    id: 'export-report',
    title: '📊 차트 내보내기 및 보고서 생성',
    items: [
      '이미지 내보내기: 미팅 준비를 위해 🖼️ 사진기 아이콘을 눌러 현재 차트 화면을 고해상도 이미지(PNG/JPG)로 바로 저장합니다.',
      'Excel 변환: 엑셀 아이콘을 눌러 전체 태스크 내역을 깔끔한 엑셀 파일 형태로 다운로드 받습니다.',
      'Word 보고서 활용: [대시보드] 탭에서 [주간 보고서 생성] 버튼을 누르면 Word 문서 기반의 깔끔한 스케줄 보고서가 즉시 생성됩니다.',
    ],
  },
  {
    id: 'admin-auth',
    title: '🛡️ 계정 및 관리자 권한',
    items: [
      '계정 생성 대기: 이메일로 첫 가입 시 대기 상태가 되며, 조회 기능만 가능합니다.',
      '일반 사용자 (승인 완료): [편집] 탭 생성/수정/서버 업로드 등 핵심 기능을 모두 사용할 수 있습니다.',
      '관리자 (Admin): 시스템 설정으로 폴더(디렉토리) 생성과 삭제, 사용자 가입 승인 및 비밀번호 초기화 등 전사 관리 권한을 독점합니다.',
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

