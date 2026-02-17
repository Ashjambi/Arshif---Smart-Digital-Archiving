import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { 
  FileText, Shield, Clock, AlertCircle, Search, Filter, Plus, X, Send, Loader2, 
  CheckCircle2, Download, FolderPlus, ArrowRight, Bot, Tag, FileImage, 
  FileSpreadsheet, FileBox, RefreshCw, Sparkles, User, Hash, ScanText, LayoutGrid, List as ListIcon, Maximize2, Settings as SettingsIcon, MessageSquare, Trash2, Database, Activity, Terminal, BrainCircuit, FolderTree
} from 'lucide-react';
// @ts-ignore
import mammoth from 'mammoth';

import { 
  FileRecord, ISOMetadata, ChatMessage, DocumentType, Importance, Confidentiality, 
  ArchiveStatus
} from './types';
import { NAV_ITEMS } from './constants';
import { analyzeSpecificFile, chatWithFile, askAgent } from './services/geminiService';

const STORAGE_KEY = 'arshif_v13_pro';

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
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  // Specific Analysis State
  const [isFileAnalyzing, setIsFileAnalyzing] = useState(false);
  const [fileChatInput, setFileChatInput] = useState('');
  const [fileChatMessages, setFileChatMessages] = useState<{role: 'user' | 'assistant', text: string}[]>([]);

  const folderInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedFile = useMemo(() => files.find(f => f.id === selectedFileId) || null, [files, selectedFileId]);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) try { setFiles(JSON.parse(saved)); } catch (e) {}
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
  }, [files]);

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
        isoMetadata: { 
          title: f.name, 
          status: ArchiveStatus.ACTIVE,
          originalPath: (f as any).webkitRelativePath || f.name 
        } as any
      };
    }));

    setFiles(prev => [...newRecords, ...prev]);
  };

  const handleDeepAnalyze = async (fileId: string) => {
    const file = files.find(f => f.id === fileId);
    if (!file) return;

    setIsFileAnalyzing(true);
    setSelectedFileId(fileId);
    setFileChatMessages([{ role: 'assistant', text: `جاري قراءة وتحليل محتوى "${file.name}"...` }]);

    try {
      const metadata = await analyzeSpecificFile(file.name, file.extractedText || file.name);
      setFiles(prev => prev.map(f => f.id === fileId ? {
        ...f,
        isoMetadata: { ...f.isoMetadata, ...metadata as any, recordId: `AR-${Math.floor(1000 + Math.random() * 9000)}` }
      } : f));
      setFileChatMessages(prev => [...prev, { role: 'assistant', text: "اكتمل التحليل. يمكنك سؤالي عن أي شيء داخل هذا المستند الآن." }]);
    } catch (e) {
      setFileChatMessages(prev => [...prev, { role: 'assistant', text: "عذراً، لم أتمكن من تحليل هذا الملف. قد يكون التنسيق غير مدعوم أو النص غير واضح." }]);
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

  return (
    <div className="min-h-screen flex bg-[#f8fafc] text-slate-900 font-['Cairo']" dir="rtl">
      {/* Hidden Inputs for File/Folder selection */}
      <input type="file" ref={folderInputRef} className="hidden" webkitdirectory="" {...({ directory: "" } as any)} multiple onChange={(e) => processFiles(e.target.files)} />
      <input type="file" ref={fileInputRef} className="hidden" multiple onChange={(e) => processFiles(e.target.files)} />

      {/* Sidebar */}
      <aside className={`bg-slate-900 text-slate-400 flex flex-col fixed h-full z-30 shadow-2xl transition-all duration-300 ${isSidebarOpen ? 'w-80' : 'w-20'}`}>
        <div className="p-6">
          <div className="flex items-center gap-4 mb-12 overflow-hidden">
            <div className="bg-indigo-600 w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-xl shrink-0 shadow-lg">أ</div>
            {isSidebarOpen && <span className="text-2xl font-black text-white whitespace-nowrap">أرشـيـف PRO</span>}
          </div>
          <nav className="space-y-4">
            {NAV_ITEMS.map(item => (
              <button 
                key={item.id} 
                onClick={() => setActiveTab(item.id)} 
                className={`w-full flex items-center gap-4 px-4 py-4 rounded-2xl transition-all ${activeTab === item.id ? 'bg-indigo-600 text-white shadow-xl' : 'hover:bg-slate-800'}`}
              >
                <item.icon size={22} className="shrink-0" />
                {isSidebarOpen && <span className="font-bold whitespace-nowrap">{item.label}</span>}
              </button>
            ))}
          </nav>
        </div>
      </aside>

      <main className={`flex-1 p-12 transition-all duration-300 ${isSidebarOpen ? 'mr-80' : 'mr-20'}`}>
        {activeTab === 'dashboard' && (
          <div className="space-y-12 animate-in fade-in">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
              <div>
                <h1 className="text-6xl font-black text-slate-900 tracking-tighter">مرحباً بك</h1>
                <p className="text-slate-500 mt-4 font-bold text-xl">اختر المجلد الذي يحتوي على مستنداتك للبدء.</p>
              </div>
              <div className="flex gap-4">
                 <button 
                  onClick={() => folderInputRef.current?.click()}
                  className="bg-slate-900 hover:bg-black text-white px-8 py-5 rounded-[1.5rem] flex items-center gap-4 shadow-2xl font-black transition-all hover:-translate-y-1"
                 >
                    <FolderTree size={24} /> اختيار مجلد
                 </button>
                 <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-5 rounded-[1.5rem] flex items-center gap-4 shadow-2xl font-black transition-all hover:-translate-y-1"
                 >
                    <Plus size={24} /> رفع ملفات
                 </button>
              </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
               <div className="lg:col-span-2 bg-white p-10 rounded-[3.5rem] border border-slate-100 shadow-sm overflow-hidden relative">
                  <h3 className="text-3xl font-black mb-8 flex items-center gap-4"><Clock size={28} className="text-indigo-600" /> الملفات المضافة</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     {files.slice(0, 6).map(f => (
                       <div key={f.id} className="group relative bg-slate-50 p-6 rounded-[2rem] border border-transparent hover:border-indigo-100 hover:bg-white transition-all hover:shadow-xl">
                          <div className="flex items-center gap-5">
                             <div className="bg-white p-4 rounded-2xl shadow-sm">{getFileIcon(f.name)}</div>
                             <div className="min-w-0">
                                <p className="font-black text-slate-800 truncate text-lg">{f.name}</p>
                                <p className={`text-[10px] font-black uppercase tracking-widest mt-1 ${f.isoMetadata?.recordId ? 'text-emerald-500' : 'text-slate-400'}`}>
                                   {f.isoMetadata?.recordId ? 'تم التحليل' : 'خام - اضغط للتحليل'}
                                </p>
                             </div>
                          </div>
                          <button 
                            onClick={() => handleDeepAnalyze(f.id)}
                            className="absolute left-6 top-1/2 -translate-y-1/2 bg-indigo-600 text-white p-4 rounded-2xl shadow-xl opacity-0 group-hover:opacity-100 transition-all hover:bg-black"
                          >
                             <BrainCircuit size={20} />
                          </button>
                       </div>
                     ))}
                  </div>
               </div>

               <div className="bg-indigo-600 text-white p-10 rounded-[3.5rem] shadow-2xl flex flex-col justify-between">
                  <Bot size={50} className="mb-6 opacity-50" />
                  <h3 className="text-3xl font-black mb-4 leading-tight">التحليل الفردي الذكي</h3>
                  <p className="text-indigo-100 font-bold opacity-80 leading-relaxed">عند الضغط على أيقونة الذكاء الاصطناعي بجانب أي ملف، سيقوم النظام بقراءته بعمق لاستخراج البيانات والدردشة معك حول تفاصيله.</p>
                  <button onClick={() => setActiveTab('archive')} className="w-full py-5 bg-white text-indigo-600 rounded-2xl font-black text-lg mt-12 hover:bg-indigo-50">تصفح الأرشيف</button>
               </div>
            </div>
          </div>
        )}

        {activeTab === 'archive' && (
          <div className="space-y-10 animate-in fade-in">
             <header className="flex justify-between items-center">
                <h1 className="text-5xl font-black text-slate-900 tracking-tighter">الأرشيف الرقمي</h1>
                <div className="relative w-[450px]">
                   <Search className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400" size={24} />
                   <input type="text" placeholder="بحث..." className="w-full pr-16 pl-8 py-5 bg-white border border-slate-100 rounded-[2rem] shadow-sm outline-none font-bold" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                </div>
             </header>

             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                {files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase())).map(f => (
                  <div key={f.id} onClick={() => handleDeepAnalyze(f.id)} className={`bg-white p-8 rounded-[3rem] border border-slate-100 transition-all cursor-pointer relative overflow-hidden group shadow-sm hover:shadow-2xl hover:-translate-y-2 ${selectedFileId === f.id ? 'ring-4 ring-indigo-500' : ''}`}>
                     <div className="flex items-center gap-5 mb-8">
                        <div className="p-5 bg-slate-50 rounded-[1.5rem] group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-sm">{getFileIcon(f.name)}</div>
                        <div className="flex-1 min-w-0">
                           <h3 className="font-black text-xl truncate text-slate-800">{f.isoMetadata?.title || f.name}</h3>
                           <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1">{f.isoMetadata?.recordId || 'انقر للتحليل'}</p>
                        </div>
                     </div>
                     <p className="text-slate-500 text-sm font-bold line-clamp-3 leading-[1.8] h-16">{f.isoMetadata?.description || 'هذا الملف لم يتم تحليله بعد.'}</p>
                     <div className="mt-8 pt-8 border-t border-slate-50 flex justify-between items-center">
                        <span className="bg-slate-50 text-slate-500 px-4 py-1.5 rounded-xl text-[10px] font-black">{f.isoMetadata?.documentType || '---'}</span>
                        <ArrowRight size={22} className="text-slate-200 group-hover:text-indigo-600 transition-all" />
                     </div>
                  </div>
                ))}
             </div>
          </div>
        )}
      </main>

      {/* Analysis Side Panel */}
      {selectedFile && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
           <div className="w-full md:w-[850px] bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-left duration-500">
              <div className="p-10 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                 <div className="flex items-center gap-8">
                    <div className="bg-indigo-600 p-6 rounded-[2rem] text-white shadow-2xl">{getFileIcon(selectedFile.name)}</div>
                    <div className="min-w-0">
                       <h3 className="text-3xl font-black text-slate-900 truncate max-w-[400px]">{selectedFile.name}</h3>
                       <p className="text-slate-400 font-black text-xs mt-1 uppercase tracking-widest">{selectedFile.isoMetadata?.recordId || 'تحليل نشط'}</p>
                    </div>
                 </div>
                 <button onClick={() => setSelectedFileId(null)} className="p-5 hover:bg-rose-50 text-slate-300 hover:text-rose-600 rounded-[2rem] transition-all"><X size={36}/></button>
              </div>

              <div className="flex-1 overflow-y-auto p-12 custom-scrollbar space-y-12">
                 {/* Intelligence Snapshot */}
                 <div className="bg-white border border-slate-100 p-10 rounded-[3.5rem] shadow-sm relative group overflow-hidden">
                    <div className="absolute top-0 left-0 w-2 h-full bg-indigo-600"></div>
                    <h4 className="text-2xl font-black text-slate-900 mb-6 flex items-center gap-4"><Sparkles size={28} className="text-amber-500" /> الملخص الذكي</h4>
                    
                    {isFileAnalyzing && !selectedFile.isoMetadata?.recordId ? (
                       <div className="flex items-center gap-6 p-6 bg-indigo-50 rounded-3xl animate-pulse">
                          <Loader2 className="animate-spin text-indigo-600" size={32} />
                          <p className="text-indigo-900 font-bold">الذكاء الاصطناعي يقرأ محتوى الملف الآن...</p>
                       </div>
                    ) : (
                       <div className="space-y-8">
                          <p className="text-xl font-bold text-slate-700 leading-[1.8] bg-slate-50/50 p-6 rounded-[2rem] border border-slate-100 italic">
                             "{selectedFile.isoMetadata?.description || 'اضغط على زر إعادة التحليل في الأسفل إذا لم تظهر النتائج.'}"
                          </p>
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

                 {/* In-File Chat */}
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
                       {isFileAnalyzing && fileChatMessages.length > 1 && <Loader2 className="animate-spin text-indigo-600 mx-auto" />}
                    </div>
                 </div>
              </div>

              <div className="p-10 border-t bg-white shrink-0">
                 <div className="bg-slate-50 p-3 rounded-[2.5rem] flex items-center gap-4 border border-slate-200">
                    <input type="text" placeholder="اسألني عن أي تفصيل في المستند..." className="flex-1 bg-transparent px-8 py-5 outline-none font-bold text-slate-800" value={fileChatInput} onChange={(e) => setFileChatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSendFileChat()} disabled={isFileAnalyzing} />
                    <button onClick={handleSendFileChat} disabled={isFileAnalyzing || !fileChatInput.trim()} className="bg-indigo-600 text-white p-6 rounded-[2rem] shadow-2xl hover:bg-black transition-all disabled:bg-slate-300"><Send size={28} /></button>
                 </div>
                 <button onClick={() => handleDeepAnalyze(selectedFile.id)} className="mt-4 text-indigo-600 font-black text-xs hover:underline flex items-center gap-2 mx-auto"><BrainCircuit size={14} /> إعادة تحليل الملف</button>
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