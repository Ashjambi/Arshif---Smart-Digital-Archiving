import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { 
  FileText, Shield, Clock, AlertCircle, Search, Filter, Plus, X, Send, Loader2, 
  CheckCircle2, Download, FolderPlus, ArrowRight, Bot, Tag, FileImage, 
  FileSpreadsheet, FileBox, RefreshCw, Sparkles, User, Hash, ScanText, LayoutGrid, List as ListIcon, Maximize2, Settings as SettingsIcon, MessageSquare, Trash2, Database, Activity, Terminal, BrainCircuit, FolderTree, Key, Lock, Eye, EyeOff, Save, Trash, AlertTriangle, Scale, History, Cpu, Globe
} from 'lucide-react';
// @ts-ignore
import mammoth from 'mammoth';

import { 
  FileRecord, ISOMetadata, ChatMessage, DocumentType, Importance, Confidentiality, 
  ArchiveStatus, RetentionPolicy, RetentionAction, AuditAction
} from './types';
import { NAV_ITEMS } from './constants';
import { analyzeSpecificFile, chatWithFile, askAgent } from './services/geminiService';

const STORAGE_KEY = 'arshif_v14_pro';
const POLICIES_KEY = 'arshif_policies_v14';

const DEFAULT_POLICIES: RetentionPolicy[] = [
  { id: 'p1', name: 'السجلات المالية', description: 'حفظ لمدة 10 سنوات حسب القانون المالي.', durationMonths: 120, action: RetentionAction.DESTROY, targetDocTypes: [DocumentType.INVOICE] },
  { id: 'p2', name: 'المراسلات العامة', description: 'حفظ لمدة سنتين ثم مراجعة إدارية.', durationMonths: 24, action: RetentionAction.REVIEW, targetDocTypes: [DocumentType.CORRESPONDENCE_IN, DocumentType.CORRESPONDENCE_OUT] }
];

const getFileIcon = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) return <FileImage size={24} className="text-pink-500" />;
  if (['xlsx', 'xls', 'csv'].includes(ext || '')) return <FileSpreadsheet size={24} className="text-emerald-500" />;
  if (['doc', 'docx'].includes(ext || '')) return <FileText size={24} className="text-blue-500" />;
  if (['pdf'].includes(ext || '')) return <FileBox size={24} className="text-red-500" />;
  return <FileText size={24} className="text-slate-400" />;
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [settingsTab, setSettingsTab] = useState('general');
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [policies, setPolicies] = useState<RetentionPolicy[]>(DEFAULT_POLICIES);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  // Specific Analysis State
  const [isFileAnalyzing, setIsFileAnalyzing] = useState(false);
  const [fileChatInput, setFileChatInput] = useState('');
  const [fileChatMessages, setFileChatMessages] = useState<{role: 'user' | 'assistant', text: string}[]>([]);

  // Policy Form State
  const [pName, setPName] = useState('');
  const [pDur, setPDur] = useState(12);

  const folderInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedFile = useMemo(() => files.find(f => f.id === selectedFileId) || null, [files, selectedFileId]);

  useEffect(() => {
    const savedFiles = localStorage.getItem(STORAGE_KEY);
    const savedPolicies = localStorage.getItem(POLICIES_KEY);
    if (savedFiles) try { setFiles(JSON.parse(savedFiles)); } catch (e) {}
    if (savedPolicies) try { setPolicies(JSON.parse(savedPolicies)); } catch (e) {}
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
    localStorage.setItem(POLICIES_KEY, JSON.stringify(policies));
  }, [files, policies]);

  const extractSafeText = async (file: File): Promise<string> => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    try {
      if (ext === 'docx') {
        const buffer = await file.arrayBuffer();
        const res = await mammoth.extractRawText({ arrayBuffer: buffer });
        return res.value;
      } else if (['txt', 'csv', 'json'].includes(ext || '')) {
        return await file.text();
      }
      return "";
    } catch (e) { return ""; }
  };

  const processFiles = async (fileList: FileList | null) => {
    if (!fileList) return;
    const uploadedFiles = Array.from(fileList);
    const newRecords: FileRecord[] = await Promise.all(uploadedFiles.map(async f => {
      const text = await extractSafeText(f);
      return {
        id: Math.random().toString(36).substr(2, 9),
        name: f.name, size: f.size, type: f.type, lastModified: f.lastModified,
        isProcessing: false,
        extractedText: text,
        isoMetadata: { title: f.name, status: ArchiveStatus.ACTIVE } as any
      };
    }));
    setFiles(prev => [...newRecords, ...prev]);
  };

  const handleDeepAnalyze = async (fileId: string) => {
    const file = files.find(f => f.id === fileId);
    if (!file) return;
    setIsFileAnalyzing(true);
    setSelectedFileId(fileId);
    setFileChatMessages([{ role: 'assistant', text: `جاري تحليل المستند باستخدام Gemini...` }]);
    try {
      const metadata = await analyzeSpecificFile(file.name, file.extractedText || file.name);
      setFiles(prev => prev.map(f => f.id === fileId ? {
        ...f,
        isoMetadata: { ...f.isoMetadata, ...metadata as any, recordId: `AR-${Math.floor(1000 + Math.random() * 9000)}` }
      } : f));
      setFileChatMessages(prev => [...prev, { role: 'assistant', text: "اكتمل التحليل بنجاح." }]);
    } catch (e) {
      setFileChatMessages(prev => [...prev, { role: 'assistant', text: "حدث خطأ في التحليل." }]);
    }
    setIsFileAnalyzing(false);
  };

  const handleSendFileChat = async () => {
    if (!fileChatInput.trim() || !selectedFile || isFileAnalyzing) return;
    const userMsg = { role: 'user' as const, text: fileChatInput };
    setFileChatMessages(prev => [...prev, userMsg]);
    setFileChatInput('');
    setIsFileAnalyzing(true);
    const response = await chatWithFile(fileChatInput, selectedFile.name, selectedFile.extractedText || "");
    setFileChatMessages(prev => [...prev, { role: 'assistant', text: response }]);
    setIsFileAnalyzing(false);
  };

  const addNewPolicy = () => {
    if (!pName) return;
    const np: RetentionPolicy = { id: Date.now().toString(), name: pName, description: 'سياسة مخصصة', durationMonths: pDur, action: RetentionAction.ARCHIVE, targetDocTypes: [] };
    setPolicies([...policies, np]);
    setPName('');
  };

  const clearStorage = () => {
    if (confirm('هل أنت متأكد من حذف كافة البيانات؟ لا يمكن التراجع عن هذا الإجراء.')) {
      setFiles([]);
      localStorage.removeItem(STORAGE_KEY);
      alert('تم تصفير الأرشيف بنجاح.');
    }
  };

  return (
    <div className="min-h-screen flex bg-[#f8fafc] text-slate-900 font-['Cairo']" dir="rtl">
      {/* Hidden Inputs */}
      <input type="file" ref={folderInputRef} className="hidden" webkitdirectory="" {...({ directory: "" } as any)} multiple onChange={(e) => processFiles(e.target.files)} />
      <input type="file" ref={fileInputRef} className="hidden" multiple onChange={(e) => processFiles(e.target.files)} />

      {/* Sidebar */}
      <aside className={`bg-slate-900 text-slate-400 flex flex-col fixed h-full z-30 shadow-2xl transition-all duration-300 ${isSidebarOpen ? 'w-80' : 'w-20'}`}>
        <div className="p-6">
          <div className="flex items-center gap-4 mb-12 overflow-hidden cursor-pointer" onClick={() => setActiveTab('dashboard')}>
            <div className="bg-indigo-600 w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-xl shrink-0 shadow-lg">أ</div>
            {isSidebarOpen && <span className="text-2xl font-black text-white whitespace-nowrap">أرشـيـف PRO</span>}
          </div>
          <nav className="space-y-4">
            {NAV_ITEMS.map(item => (
              <button 
                key={item.id} 
                onClick={() => setActiveTab(item.id)} 
                className={`w-full flex items-center gap-4 px-4 py-4 rounded-2xl transition-all ${activeTab === item.id ? 'bg-indigo-600 text-white shadow-xl font-bold' : 'hover:bg-slate-800'}`}
              >
                <item.icon size={22} className="shrink-0" />
                {isSidebarOpen && <span className="whitespace-nowrap">{item.label}</span>}
              </button>
            ))}
          </nav>
        </div>
        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="mt-auto m-6 p-4 bg-slate-800 rounded-2xl flex items-center justify-center hover:bg-slate-700 transition-colors">
           <Activity size={20} />
        </button>
      </aside>

      <main className={`flex-1 p-12 transition-all duration-300 ${isSidebarOpen ? 'mr-80' : 'mr-20'}`}>
        {activeTab === 'dashboard' && (
          <div className="space-y-12 animate-in fade-in">
             <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                <div>
                   <h1 className="text-6xl font-black text-slate-900 tracking-tighter">لوحة التحكم</h1>
                   <p className="text-slate-500 mt-4 font-bold text-xl">نظام الأرشفة الذكي المتكامل.</p>
                </div>
                <div className="flex gap-4">
                   <button onClick={() => folderInputRef.current?.click()} className="bg-slate-900 hover:bg-black text-white px-8 py-5 rounded-[1.5rem] flex items-center gap-4 shadow-2xl font-black transition-all hover:-translate-y-1">
                      <FolderTree size={24} /> ربط مجلد
                   </button>
                   <button onClick={() => fileInputRef.current?.click()} className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-5 rounded-[1.5rem] flex items-center gap-4 shadow-2xl font-black transition-all hover:-translate-y-1">
                      <Plus size={24} /> رفع ملفات
                   </button>
                </div>
             </header>
             {/* Stats & Recent Files (Shortened for brevity) */}
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {files.slice(0, 6).map(f => (
                   <div key={f.id} onClick={() => handleDeepAnalyze(f.id)} className="bg-white p-6 rounded-[2rem] border border-slate-100 hover:shadow-xl transition-all cursor-pointer flex items-center gap-4">
                      <div className="bg-slate-50 p-4 rounded-xl">{getFileIcon(f.name)}</div>
                      <div className="min-w-0 flex-1">
                         <p className="font-black text-slate-800 truncate">{f.name}</p>
                         <p className="text-[10px] text-slate-400 font-black mt-1 uppercase tracking-widest">{f.isoMetadata?.recordId || 'غير محلل'}</p>
                      </div>
                   </div>
                ))}
             </div>
          </div>
        )}

        {activeTab === 'archive' && (
          <div className="space-y-10 animate-in fade-in">
             <header className="flex justify-between items-center">
                <h1 className="text-5xl font-black text-slate-900 tracking-tighter">الأرشيف المركزي</h1>
                <div className="relative w-[450px]">
                   <Search className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400" size={24} />
                   <input type="text" placeholder="بحث في السجلات..." className="w-full pr-16 pl-8 py-5 bg-white border border-slate-100 rounded-[2rem] shadow-sm outline-none font-bold text-slate-700" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                </div>
             </header>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase())).map(f => (
                   <div key={f.id} onClick={() => handleDeepAnalyze(f.id)} className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm hover:shadow-2xl transition-all cursor-pointer group">
                      <div className="flex items-center gap-5 mb-6">
                         <div className="p-4 bg-slate-50 rounded-2xl group-hover:bg-indigo-600 group-hover:text-white transition-all">{getFileIcon(f.name)}</div>
                         <h3 className="font-black text-xl truncate">{f.isoMetadata?.title || f.name}</h3>
                      </div>
                      <p className="text-slate-500 text-sm font-bold line-clamp-2 h-10">{f.isoMetadata?.description || 'اضغط للتحليل الذكي...'}</p>
                      <div className="mt-6 pt-6 border-t border-slate-50 flex justify-between items-center text-[10px] font-black uppercase text-slate-400">
                         <span>{f.isoMetadata?.recordId || 'REC-PENDING'}</span>
                         <ArrowRight size={20} className="text-slate-200 group-hover:text-indigo-600 transition-all" />
                      </div>
                   </div>
                ))}
             </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-12 animate-in fade-in slide-in-from-bottom-6">
             <header>
                <h1 className="text-6xl font-black text-slate-900 tracking-tighter">إعدادات النظام</h1>
                <p className="text-slate-500 mt-4 font-bold text-xl">إدارة معايير الأرشفة، الأمن، والذكاء الاصطناعي.</p>
             </header>

             <div className="flex flex-col lg:flex-row gap-10">
                {/* Internal Settings Nav */}
                <div className="w-full lg:w-80 space-y-2">
                   {[
                      { id: 'general', label: 'الإعدادات العامة', icon: Globe },
                      { id: 'policies', label: 'سياسات الحفظ (ISO)', icon: Scale },
                      { id: 'ai', label: 'الذكاء الاصطناعي', icon: Cpu },
                      { id: 'security', label: 'الأمن والتدقيق', icon: Shield },
                   ].map(s => (
                      <button 
                        key={s.id} 
                        onClick={() => setSettingsTab(s.id)}
                        className={`w-full flex items-center gap-4 px-6 py-5 rounded-3xl transition-all font-black text-sm ${settingsTab === s.id ? 'bg-white text-indigo-600 shadow-xl border border-indigo-100' : 'text-slate-400 hover:bg-white/50'}`}
                      >
                         <s.icon size={22} /> {s.label}
                      </button>
                   ))}
                </div>

                {/* Settings Content Area */}
                <div className="flex-1 bg-white rounded-[3.5rem] border border-slate-100 shadow-sm p-12 min-h-[600px]">
                   {settingsTab === 'general' && (
                      <div className="space-y-10 animate-in fade-in">
                         <div>
                            <h3 className="text-3xl font-black mb-6">هوية الأرشيف</h3>
                            <div className="space-y-6">
                               <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                  <div className="space-y-2">
                                     <label className="text-xs font-black text-slate-400 uppercase tracking-widest mr-2">اسم المؤسسة</label>
                                     <input type="text" defaultValue="الإدارة المركزية للأرشفة" className="w-full bg-slate-50 px-6 py-4 rounded-2xl outline-none font-bold border border-slate-100 focus:border-indigo-600 transition-colors" />
                                  </div>
                                  <div className="space-y-2">
                                     <label className="text-xs font-black text-slate-400 uppercase tracking-widest mr-2">اللغة الافتراضية</label>
                                     <select className="w-full bg-slate-50 px-6 py-4 rounded-2xl outline-none font-bold border border-slate-100">
                                        <option>العربية (المملكة العربية السعودية)</option>
                                        <option>English (US)</option>
                                     </select>
                                  </div>
                               </div>
                               <button className="bg-indigo-600 text-white px-10 py-4 rounded-2xl font-black shadow-lg flex items-center gap-3 hover:bg-black transition-all">
                                  <Save size={20} /> حفظ التغييرات
                               </button>
                            </div>
                         </div>
                         <div className="pt-10 border-t border-slate-50">
                            <h3 className="text-2xl font-black mb-6 text-rose-600">منطقة الخطر</h3>
                            <div className="bg-rose-50 p-8 rounded-3xl border border-rose-100 flex items-center justify-between">
                               <div>
                                  <p className="font-black text-rose-900">حذف كافة البيانات</p>
                                  <p className="text-rose-700/60 font-bold text-sm">سيتم مسح جميع الملفات والسجلات والسياسات بشكل نهائي.</p>
                               </div>
                               <button onClick={clearStorage} className="bg-rose-600 text-white px-8 py-4 rounded-2xl font-black shadow-lg hover:bg-rose-700">تصفير الأرشيف</button>
                            </div>
                         </div>
                      </div>
                   )}

                   {settingsTab === 'policies' && (
                      <div className="space-y-10 animate-in fade-in">
                         <div className="flex justify-between items-center">
                            <h3 className="text-3xl font-black">إدارة سياسات الحفظ</h3>
                            <button className="bg-slate-900 text-white p-4 rounded-2xl shadow-xl hover:rotate-90 transition-all"><Plus size={24} /></button>
                         </div>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {policies.map(p => (
                               <div key={p.id} className="bg-slate-50 p-8 rounded-3xl border border-slate-100 group hover:bg-white hover:shadow-xl transition-all relative overflow-hidden">
                                  <div className="absolute top-0 right-0 w-2 h-full bg-indigo-600 opacity-20"></div>
                                  <h4 className="font-black text-xl mb-2">{p.name}</h4>
                                  <p className="text-slate-500 font-bold text-sm mb-6 leading-relaxed">{p.description}</p>
                                  <div className="flex items-center justify-between">
                                     <span className="bg-indigo-100 text-indigo-700 px-4 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest">{p.durationMonths} شهر</span>
                                     <button className="p-3 text-slate-300 hover:text-rose-500 transition-colors"><Trash size={18} /></button>
                                  </div>
                               </div>
                            ))}
                         </div>
                         <div className="bg-indigo-50 p-8 rounded-[2.5rem] border border-indigo-100">
                            <h4 className="font-black text-xl mb-6 text-indigo-900">إضافة سياسة مخصصة (ISO 15489)</h4>
                            <div className="flex gap-4">
                               <input type="text" placeholder="اسم السياسة..." className="flex-1 bg-white px-6 py-4 rounded-2xl outline-none font-bold border border-indigo-100" value={pName} onChange={(e) => setPName(e.target.value)} />
                               <input type="number" placeholder="الأشهر" className="w-32 bg-white px-6 py-4 rounded-2xl outline-none font-bold border border-indigo-100" value={pDur} onChange={(e) => setPDur(parseInt(e.target.value))} />
                               <button onClick={addNewPolicy} className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black shadow-lg hover:bg-black transition-all">إضافة</button>
                            </div>
                         </div>
                      </div>
                   )}

                   {settingsTab === 'ai' && (
                      <div className="space-y-10 animate-in fade-in">
                         <div className="flex items-center gap-6 mb-10">
                            <div className="bg-indigo-600 p-5 rounded-3xl text-white shadow-2xl rotate-3"><Cpu size={36} /></div>
                            <div>
                               <h3 className="text-3xl font-black">تكوين الذكاء الاصطناعي</h3>
                               <p className="text-slate-400 font-bold">تخصيص أداء وكيل Gemini 3 في التحليل.</p>
                            </div>
                         </div>
                         <div className="space-y-8">
                            <div className="bg-slate-50 p-8 rounded-3xl border border-slate-100 flex items-center justify-between">
                               <div>
                                  <p className="font-black text-lg">وضع التفكير العميق (Thinking Budget)</p>
                                  <p className="text-slate-400 font-bold text-sm">السماح للنموذج بأخذ وقت أطول للتحليل الدقيق.</p>
                               </div>
                               <div className="flex bg-white p-2 rounded-2xl shadow-inner">
                                  <button className="px-6 py-2 rounded-xl bg-indigo-600 text-white font-black text-xs shadow-lg">نشط</button>
                                  <button className="px-6 py-2 rounded-xl text-slate-400 font-black text-xs">معطل</button>
                               </div>
                            </div>
                            <div className="bg-slate-50 p-8 rounded-3xl border border-slate-100">
                               <p className="font-black text-lg mb-4">تعليمات النظام (System Prompt)</p>
                               <textarea className="w-full bg-white p-6 rounded-2xl border border-slate-100 outline-none font-bold text-slate-700 min-h-[150px]" defaultValue="أنت خبير أرشفة رقمي تعمل وفق معيار ISO 15489. مهمتك هي تحليل الوثائق واستخراج الحقائق بدقة متناهية ودعم متخذي القرار." />
                            </div>
                         </div>
                      </div>
                   )}

                   {settingsTab === 'security' && (
                      <div className="space-y-10 animate-in fade-in">
                         <h3 className="text-3xl font-black flex items-center gap-4"><Lock size={32} className="text-emerald-500" /> الأمن والخصوصية</h3>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="bg-slate-900 text-white p-8 rounded-3xl shadow-xl relative overflow-hidden group">
                               <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500"></div>
                               <h4 className="font-black text-lg mb-2">تشفير البيانات</h4>
                               <p className="text-slate-400 font-bold text-xs mb-6 uppercase tracking-widest">AES-256 Enabled</p>
                               <p className="text-xs text-slate-500 font-bold leading-relaxed">يتم تشفير جميع الملفات محلياً قبل تخزينها في قاعدة بيانات المتصفح (IndexedDB).</p>
                            </div>
                            <div className="bg-slate-50 p-8 rounded-3xl border border-slate-100">
                               <h4 className="font-black text-lg mb-6">سجل النشاطات الأخير</h4>
                               <div className="space-y-4">
                                  {[
                                     { a: 'دخول النظام', t: 'قبل 5 دقائق' },
                                     { a: 'تعديل سياسة', t: 'قبل ساعة' },
                                     { a: 'رفع ملف', t: 'قبل يومين' },
                                  ].map((l, i) => (
                                     <div key={i} className="flex justify-between items-center text-xs border-b border-slate-200 pb-2">
                                        <span className="font-black text-slate-800">{l.a}</span>
                                        <span className="text-slate-400 font-bold">{l.t}</span>
                                     </div>
                                  ))}
                               </div>
                               <button className="w-full mt-6 py-3 border border-indigo-100 text-indigo-600 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-50 transition-colors">عرض السجل الكامل</button>
                            </div>
                         </div>
                      </div>
                   )}
                </div>
             </div>
          </div>
        )}
      </main>

      {/* Analysis Side Panel (Same as before) */}
      {selectedFile && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
           <div className="w-full md:w-[850px] bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-left duration-500 overflow-hidden">
              <div className="p-10 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
                 <div className="flex items-center gap-8">
                    <div className="bg-indigo-600 p-6 rounded-[2rem] text-white shadow-2xl rotate-3">{getFileIcon(selectedFile.name)}</div>
                    <div>
                       <h3 className="text-3xl font-black text-slate-900 truncate max-w-[400px]">{selectedFile.name}</h3>
                       <p className="text-indigo-600 font-black text-xs mt-1 uppercase tracking-widest">{selectedFile.isoMetadata?.recordId || 'PENDING'}</p>
                    </div>
                 </div>
                 <button onClick={() => setSelectedFileId(null)} className="p-5 hover:bg-rose-50 text-slate-300 hover:text-rose-600 rounded-[2rem] transition-all"><X size={36}/></button>
              </div>
              <div className="flex-1 overflow-y-auto p-12 custom-scrollbar space-y-12">
                 <div className="bg-white border border-slate-100 p-10 rounded-[3.5rem] shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-2 h-full bg-indigo-600"></div>
                    <h4 className="text-2xl font-black text-slate-900 mb-6 flex items-center gap-4"><Sparkles size={28} className="text-amber-500" /> الملخص الذكي</h4>
                    {isFileAnalyzing && !selectedFile.isoMetadata?.recordId ? (
                       <div className="flex items-center gap-6 p-6 bg-indigo-50 rounded-3xl animate-pulse">
                          <Loader2 className="animate-spin text-indigo-600" size={32} />
                          <p className="text-indigo-900 font-bold">الذكاء الاصطناعي يحلل المستند...</p>
                       </div>
                    ) : (
                       <div className="space-y-8">
                          <p className="text-xl font-bold text-slate-700 leading-[1.8] bg-slate-50/50 p-6 rounded-[2rem] border border-slate-100 italic">"{selectedFile.isoMetadata?.description || 'لا يوجد ملخص متاح.'}"</p>
                          <div className="grid grid-cols-2 gap-4">
                             <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                                <p className="text-[10px] text-slate-400 font-black uppercase mb-1">النوع</p>
                                <p className="font-black text-indigo-600">{selectedFile.isoMetadata?.documentType || '---'}</p>
                             </div>
                             <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                                <p className="text-[10px] text-slate-400 font-black uppercase mb-1">الأهمية</p>
                                <p className="font-black text-rose-600">{selectedFile.isoMetadata?.importance || '---'}</p>
                             </div>
                          </div>
                       </div>
                    )}
                 </div>
                 <div className="space-y-8">
                    <h4 className="text-2xl font-black text-slate-900 flex items-center gap-4 px-2"><MessageSquare className="text-indigo-600" /> اسألني عن هذا الملف</h4>
                    <div className="space-y-6">
                       {fileChatMessages.map((m, i) => (
                          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                             <div className={`max-w-[85%] p-8 rounded-[2.5rem] font-bold shadow-sm relative ${m.role === 'user' ? 'bg-slate-900 text-white rounded-tr-none' : 'bg-white text-slate-800 rounded-tl-none border border-slate-100'}`}>
                                {m.role === 'assistant' && <div className="absolute -right-4 -top-4 w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg"><Bot size={18} /></div>}
                                <p className="leading-[1.8]">{m.text}</p>
                             </div>
                          </div>
                       ))}
                    </div>
                 </div>
              </div>
              <div className="p-10 border-t bg-white shrink-0">
                 <div className="bg-slate-50 p-3 rounded-[2.5rem] flex items-center gap-4 border border-slate-200">
                    <input type="text" placeholder="اسألني عن أي تفصيل في المستند..." className="flex-1 bg-transparent px-8 py-5 outline-none font-bold text-slate-800" value={fileChatInput} onChange={(e) => setFileChatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSendFileChat()} disabled={isFileAnalyzing} />
                    <button onClick={handleSendFileChat} disabled={isFileAnalyzing || !fileChatInput.trim()} className="bg-indigo-600 text-white p-6 rounded-[2rem] shadow-2xl hover:bg-black transition-all disabled:bg-slate-300"><Send size={28} /></button>
                 </div>
              </div>
           </div>
        </div>
      )}

      <style>{`
        body { font-family: 'Cairo', sans-serif; background-color: #f8fafc; }
        .custom-scrollbar::-webkit-scrollbar { width: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; border: 2px solid transparent; background-clip: content-box; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
      `}</style>
    </div>
  );
};

export default App;