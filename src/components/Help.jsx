function Help() {
  return (
    <div className="animate-fade-in space-y-5">
      <section className="glass-panel p-5">
        <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">도움말</h2>
        <p className="mt-1 text-sm text-slate-500">처음 사용하는 분도 바로 사용할 수 있도록 핵심 흐름만 정리했습니다.</p>
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
        <h3 className="text-sm font-bold text-slate-800">빠른 시작</h3>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>비로그인 상태에서는 `공개 일정` 조회만 가능합니다.</li>
          <li>상단 `로그인` 후 승인된 계정이면 `편집` 탭이 활성화됩니다.</li>
          <li>`편집` 탭은 `작업 관리`, `간트 / 일정`, `대시보드`, `도움말`, `개정이력`으로 구성됩니다.</li>
          <li>작업을 먼저 등록한 뒤 간트 화면에서 일정과 범위를 조정하면 가장 빠르게 시작할 수 있습니다.</li>
        </ul>
      </section>

      <section className="glass-panel p-5">
        <h3 className="text-sm font-bold text-slate-800">작업 관리</h3>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>작업 추가/수정 시 `구분`, `작업명`은 필수입니다.</li>
          <li>검색 필터로 작업을 빠르게 찾을 수 있습니다.</li>
          <li>시작일 정렬/역정렬, 순서 이동 기능을 지원합니다.</li>
          <li>상단 버튼으로 `보고서(Word)`, `Excel`, `업로드`를 실행할 수 있습니다.</li>
        </ul>
      </section>

      <section className="glass-panel p-5">
        <h3 className="text-sm font-bold text-slate-800">간트 / 일정</h3>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>`Day / Week / Month` 보기 전환과 Zoom, 화면 맞춤, 범위 여백 조정이 가능합니다.</li>
          <li>차트 바 드래그로 일정 이동, 양 끝 핸들 드래그로 기간 조정이 가능합니다.</li>
          <li>휴가/예외 일정을 추가하면 차트에 자동 반영됩니다.</li>
          <li>`이미지` 버튼으로 현재 간트를 PNG/JPG로 저장할 수 있습니다.</li>
        </ul>
      </section>

      <section className="glass-panel p-5">
        <h3 className="text-sm font-bold text-slate-800">저장 / 불러오기</h3>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>상단 저장 버튼으로 현재 프로젝트를 JSON 파일로 백업할 수 있습니다.</li>
          <li>불러오기를 실행하면 현재 일정 데이터는 가져온 데이터로 대체됩니다.</li>
          <li>배열(JSON array) 형식으로 불러오면 작업 목록만 적용됩니다.</li>
        </ul>
      </section>

      <section className="glass-panel p-5">
        <h3 className="text-sm font-bold text-slate-800">공개 일정</h3>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>`작업 관리` 업로드/업데이트는 로그인 후 승인된 계정에서만 가능합니다.</li>
          <li>`공개 일정` 탭에서 목록 검색, 미리보기 확인 후 필요한 경우 가져오기를 진행하세요.</li>
          <li>Rev.4.0부터는 폴더 트리에서 범위를 선택한 뒤 목록을 조회할 수 있습니다.</li>
          <li>프로젝트 업로드 시에는 사전에 생성된 폴더를 드롭다운에서 선택해야 합니다.</li>
          <li>공개 일정 가져오기는 현재 편집 데이터를 덮어쓰므로, 필요하면 먼저 백업하세요.</li>
        </ul>
      </section>

      <section className="glass-panel p-5">
        <h3 className="text-sm font-bold text-slate-800">Rev.4.0 폴더 관리</h3>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>폴더 생성/삭제/이동은 로그인한 `admin` 계정만 수행할 수 있습니다.</li>
          <li>하위 폴더 또는 연결된 프로젝트가 남아 있으면 폴더 삭제가 차단됩니다.</li>
          <li>프로젝트별 폴더 변경은 목록의 폴더 선택 박스에서 개별로 처리할 수 있습니다.</li>
        </ul>
      </section>

      <section className="glass-panel p-5">
        <h3 className="text-sm font-bold text-slate-800">v3.0 알림 메일 기능</h3>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>최초 업로드(새 일정 업로드) 시 `알림 대상 메일`에 유관부서 담당자/팀장 주소를 등록합니다.</li>
          <li>수정 업로드(기존 일정 업데이트) 시 발신자/수정자는 로그인한 이메일 ID로 자동 연동됩니다.</li>
          <li>업데이트가 성공하면 등록된 수신자에게 자동 알림 메일이 발송됩니다.</li>
          <li>메일 본문에는 `프로젝트명`, `수정자`, `수정시각`이 포함됩니다.</li>
        </ul>
      </section>
    </div>
  );
}

export default Help;
