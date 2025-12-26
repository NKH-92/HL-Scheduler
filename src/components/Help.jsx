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
      </div>
    </div>
  );
}

export default Help;

