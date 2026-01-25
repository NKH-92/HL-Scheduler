function Help() {
  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Help</h2>
        <p className="text-sm text-slate-500 mt-1">문의/정보</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <h3 className="text-sm font-bold text-slate-700">Contact</h3>
        <div className="mt-3 space-y-1 text-sm text-slate-700">
          <div className="font-semibold">품질보증부 SQA 남광현선임</div>
          <a className="text-indigo-600 font-semibold hover:underline" href="mailto:nkh92@hanlim.com">
            nkh92@hanlim.com
          </a>
        </div>

        <div className="mt-6 pt-6 border-t border-slate-100">
          <h3 className="text-sm font-bold text-slate-700">Manual</h3>
          <div className="mt-3 space-y-5 text-sm text-slate-700 leading-relaxed">
            <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">1) 기본 흐름</h4>
              <ul className="mt-2 list-disc pl-5 space-y-1">
                <li>
                  <span className="font-semibold">업무 관리</span>에서 프로젝트명 입력 후 업무를 등록/수정합니다.
                </li>
                <li>
                  <span className="font-semibold">스케줄</span>에서 Gantt 차트로 전체 흐름을 확인하고 드래그로 일정을 조정합니다.
                </li>
                <li>
                  <span className="font-semibold">대시보드</span>에서 진행률과 업무 현황을 요약으로 확인합니다.
                </li>
                <li>필요 시 Excel/보고서/IMG로 내보냅니다.</li>
              </ul>
            </div>

            <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">2) 업무 관리 탭</h4>
              <ul className="mt-2 list-disc pl-5 space-y-1">
                <li>프로젝트명은 저장/내보내기 파일명에 반영됩니다.</li>
                <li>
                  <span className="font-semibold">업무 추가/수정</span>: 구분/업무명은 필수이며, 담당자/부서/기간/진행률/메모를 관리합니다.
                </li>
                <li>
                  <span className="font-semibold">정렬/이동</span>: 시작일 정렬 및 위/아래 이동으로 표시 순서를 조정할 수 있습니다.
                </li>
                <li>
                  <span className="font-semibold">필터</span>: 부서/담당자 필터는 이 탭에서만 적용됩니다.
                </li>
                <li>
                  <span className="font-semibold">보고서</span>: 전체 프로젝트 기준으로 출력됩니다. (필터 무시)
                </li>
                <li>
                  <span className="font-semibold">Excel</span>: 현재 부서/담당자 필터 기준으로 내보냅니다.
                </li>
              </ul>
            </div>

            <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">3) 스케줄 탭(Gantt)</h4>
              <ul className="mt-2 list-disc pl-5 space-y-1">
                <li>
                  상단 검색창으로 <span className="font-semibold">업무명/부서/담당자</span>를 필터링합니다.
                </li>
                <li>
                  <span className="font-semibold">Day/Week/Month</span> 보기 전환, 간격 조절(앞/뒤), 한 화면 맞춤, Zoom을 지원합니다.
                </li>
                <li>
                  Day 보기에서 1년 이상이면 성능 보호를 위해 <span className="font-semibold">한 화면 맞춤이 자동 해제</span>됩니다.
                </li>
                <li>
                  막대를 <span className="font-semibold">드래그</span>하면 전체 이동, 양끝을 잡아 <span className="font-semibold">기간 조절</span>이 가능합니다.
                </li>
                <li>
                  <span className="font-semibold">휴가(일정 제외)</span>를 등록하면 차트에 음영/라벨로 표시됩니다.
                </li>
                <li>
                  <span className="font-semibold">IMG</span> 버튼으로 현재 화면 또는 전체 차트를 이미지로 저장합니다. (현재 검색 필터 기준)
                </li>
              </ul>
            </div>

            <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">4) 보고서 출력(Word)</h4>
              <ul className="mt-2 list-disc pl-5 space-y-1">
                <li>
                  <span className="font-semibold">업무 관리</span> 탭의 보고서 버튼으로 출력합니다.
                </li>
                <li>
                  1~2번 내용은 <span className="font-semibold">A4 세로</span>, 3번 일정 흐름은 <span className="font-semibold">가로 페이지</span>로 자동 분리됩니다.
                </li>
                <li>
                  보고서 간트 이미지는 <span className="font-semibold">한 화면 맞춤 + Today 표시 + 최대 해상도</span>로 고정됩니다.
                </li>
                <li>
                  보고서 미리보기에서 <span className="font-semibold">Day/Week/Month</span>를 선택하면 출력에도 반영됩니다.
                </li>
              </ul>
            </div>

            <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">5) IMG 내보내기</h4>
              <ul className="mt-2 list-disc pl-5 space-y-1">
                <li>포맷(PNG/JPG), 캡쳐 범위(전체/현재화면), 해상도(scale), 파일명, Today 표시를 선택합니다.</li>
                <li>이미지 내보내기는 <span className="font-semibold">현재 검색 필터 기준</span>으로 저장됩니다.</li>
                <li>
                  <span className="font-semibold">EXE 버전</span>에서는 저장 버튼을 누르면 <span className="font-semibold">저장 경로 선택</span> 창이 뜹니다.
                </li>
                <li>
                  일정이 매우 큰 경우에는 저장 실패를 막기 위해 <span className="font-semibold">자동으로 해상도가 낮아질 수</span> 있습니다.
                </li>
              </ul>
            </div>

            <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">6) 프로젝트 저장/불러오기</h4>
              <ul className="mt-2 list-disc pl-5 space-y-1">
                <li>
                  상단 우측 아이콘으로 <span className="font-semibold">프로젝트 저장(JSON)</span> / <span className="font-semibold">불러오기(JSON)</span>가 가능합니다.
                </li>
                <li>저장한 파일을 다른 PC로 옮겨서 그대로 불러올 수 있습니다.</li>
              </ul>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

export default Help;
