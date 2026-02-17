import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { 
  FileText, Shield, Clock, AlertCircle, Search, Filter, Plus, X, Send, Loader2, 
  CheckCircle2, Download, FolderPlus, ArrowRight, Bot, Tag, FileImage, 
  FileSpreadsheet, FileBox, RefreshCw, Sparkles, User, Hash, ScanText, LayoutGrid, List as ListIcon, Maximize2, Settings as SettingsIcon, MessageSquare, Trash2, Database, Activity, Terminal
} from 'lucide-react';
// @ts-ignore
import mammoth from 'mammoth';

import { 
  FileRecord, ISOMetadata, ChatMessage, DocumentType, Importance, Confidentiality, 
  ArchiveStatus
} from './types';
import { NAV_ITEMS } from './constants';
import { classifyFileContent, askAgent } from './services/geminiService';

const STORAGE_KEY = 'arshif_v9_pro';
const CONCURRENCY_LIMIT = 3;

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
  const [scanProgress, setScanProgress] = useState({ total: 0, current: 0, status: 'idle' });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  
  // Agent Chat States
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: '1', role: 'assistant', text: 'أهلاً بك في نظام أرشيف الذكي. كيف يمكنني مساعدتك في إدارة سجلاتك اليوم؟', timestamp: new Date() }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const selectedFile = useMemo(() => files.find(f => f.id === selectedFileId) || null, [files, selectedFileId]);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) try { setFiles(JSON.parse(saved)); } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
  }, [files]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const extractSafeText = async (file: File): Promise<string> => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    return new Promise(async (resolve) => {
      const timeout = setTimeout(() => resolve(""), 2500);
      try {
        if (ext === 'docx') {
          const buffer = await file.arrayBuffer();
          const res = await mammoth.extractRawText({ arrayBuffer: buffer });
          clearTimeout(timeout);
          resolve(res.value.substring(0, 2500));
        } else if (['txt', 'csv', 'json'].includes(ext || '')) {
          const text = await file.text();
          clearTimeout(timeout);
          resolve(text.substring(0, 2500));
        } else {
          clearTimeout(timeout);
          resolve("");
        }
      } catch (e) {
        clearTimeout(timeout);
        resolve("");
      }
    });
  };

  const processSingleFile = async (file: File, tempId: string) => {
    try {
      const text = await extractSafeText(file);
      const metadata = await classifyFileContent(file.name, text || file.name);
      
      setFiles(prev => prev.map(rec => rec.id === tempId ? {
        ...rec,
        isProcessing: false,
        extractedText: text || "تمت الفهرسة بالاسم.",
        isoMetadata: {
          ...rec.isoMetadata,
          ...metadata as any,
          recordId: `AR-${Math.floor(1000 + Math.random() * 9000)}`,
          status: ArchiveStatus.ACTIVE,
          updatedAt: new Date().toISOString()
        }
      } : rec));
    } catch (err) {
      setFiles(prev => prev.map(rec => rec.id === tempId ? { ...rec, isProcessing: false } : rec));
    }
    setScanProgress(p => ({ ...p, current: p.current + 1 }));
  };

  const handleManualUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    // Fix: Explicitly cast to File[] to ensure type safety for 'unknown' properties (name, size, type, lastModified)
    const newFilesList = Array.from(e.target.files) as File[];
    setScanProgress({ total: newFilesList.length, current: 0, status: 'scanning' });

    const initialRecords: FileRecord[] = newFilesList.map(f => ({
      id: Math.random().toString(36).substr(2, 9),
      name: f.name, 
      size: f.size, 
      type: f.type, 
      lastModified: f.lastModified,
      isProcessing: true,
      extractedText: "جاري التحليل...",
      isoMetadata: { 
        title: f.name, 
        documentType: DocumentType.OTHER, 
        recordId: "PENDING", 
        status: ArchiveStatus.IN_PROCESS 
      } as any
    }));

    setFiles(prev => [...initialRecords, ...prev]);

    for (let i = 0; i < newFilesList.length; i += CONCURRENCY_LIMIT) {
      const chunk = newFilesList.slice(i, i + CONCURRENCY_LIMIT);
      // Fix: Ensure the mapped 'file' is inferred correctly from the File array
      const chunkPromises = chunk.map((file, idx) => processSingleFile(file, initialRecords[i + idx].id));
      await Promise.all(chunkPromises);
    }
    setScanProgress(p => ({ ...p, status: 'idle' }));
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || isChatLoading) return;
    const userMsg = { id: Date.now().toString(), role: 'user' as const, text: chatInput, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setIsChatLoading(true);

    const context = files.slice(0, 10).map(f => `${f.name}: ${f.isoMetadata?.description}`).join('\n');
    const response = await askAgent(chatInput, context);
    
    setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'assistant', text: response, timestamp: new Date() }]);
    setIsChatLoading(false);
  };

  const filteredFiles = useMemo(() => {
    return files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()) || f.isoMetadata?.title?.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [files, searchQuery]);

  return (
    <div className="min-h-screen flex bg-[#f8fafc] text-slate-900 font-['Cairo']" dir="rtl">
      {/* Sidebar - Pro Design */}
      <aside className="w-80 bg-slate-900 text-slate-400 flex flex-col fixed h-full z-30 shadow-2xl transition-all">
        <div className="p-10">
          <div className="flex items-center gap-4 mb-12 group cursor-pointer" onClick={() => setActiveTab('dashboard')}>
            <div className="bg-indigo-600 w-14 h-14 rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-indigo-500/20 shadow-lg group-hover:scale-105 transition-transform">أ</div>
            <div>
              <span className="text-2xl font-black text-white block leading-none">أرشـيـف</span>
              <span className="text-[10px] text-indigo-400 font-black uppercase tracking-widest mt-1">PRO EDITION</span>
            </div>
          </div>

          <nav className="space-y-2">
            {NAV_ITEMS.map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button 
                  key={item.id} 
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all relative group ${isActive ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/20' : 'hover:bg-slate-800 hover:text-white'}`}
                >
                  <Icon size={22} className={isActive ? 'text-white' : 'text-slate-500 group-hover:text-indigo-400 transition-colors'} />
                  <span className="text-sm font-bold">{item.label}</span>
                  {isActive && <div className="absolute left-2 w-1.5 h-6 bg-white rounded-full"></div>}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto p-10 border-t border-slate-800">
           <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-indigo-400 font-black">KM</div>
              <div>
                 <p className="text-xs font-black text-white">خالد محمد</p>
                 <p className="text-[10px] text-slate-500 uppercase tracking-tighter">مدير الأرشيف</p>
              </div>
           </div>
        </div>
      </aside>

      <main className="flex-1 mr-80 p-12 transition-all">
        {/* Dynamic Tab Rendering */}
        {activeTab === 'dashboard' && (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <header className="flex justify-between items-end">
              <div>
                <h1 className="text-5xl font-black text-slate-900">نظرة عامة</h1>
                <p className="text-slate-500 mt-3 font-bold text-xl">مرحباً بك مجدداً في نظام الإدارة الذكي.</p>
              </div>
              <label className="bg-indigo-600 hover:bg-black text-white px-10 py-5 rounded-[1.5rem] flex items-center gap-3 cursor-pointer shadow-2xl font-black transition-all hover:-translate-y-1">
                <FolderPlus size={24} /> أرشفة سجلات جديدة
                <input type="file" multiple webkitdirectory="" className="hidden" onChange={handleManualUpload} />
              </label>
            </header>

            {/* Processing Banner */}
            {scanProgress.status !== 'idle' && (
              <div className="bg-slate-900 text-white p-10 rounded-[3rem] shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-full h-1 bg-gradient-to-l from-indigo-500 to-transparent"></div>
                <div className="flex justify-between items-center mb-6">
                  <div className="flex items-center gap-6">
                    <div className="bg-indigo-600/20 p-4 rounded-2xl border border-indigo-500/30">
                      <RefreshCw className="animate-spin text-indigo-400" size={28} />
                    </div>
                    <div>
                      <h3 className="font-black text-2xl">جاري التحليل الذكي...</h3>
                      <p className="text-indigo-400 text-sm font-bold mt-1 uppercase tracking-widest">تطبيق معايير ISO 15489 اللحظية</p>
                    </div>
                  </div>
                  <span className="text-4xl font-black text-indigo-400">{Math.round((scanProgress.current / scanProgress.total) * 100)}%</span>
                </div>
                <div className="w-full h-4 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.6)] transition-all duration-700 ease-out" style={{ width: `${(scanProgress.current / scanProgress.total) * 100}%` }}></div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                { label: 'إجمالي السجلات', value: files.length, icon: <FileText size={28} />, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                { label: 'جاري التحليل', value: files.filter(f => f.isProcessing).length, icon: <Loader2 size={28} className="animate-spin" />, color: 'text-blue-500', bg: 'bg-blue-50' },
                { label: 'سجلات مكتملة', value: files.filter(f => !f.isProcessing).length, icon: <CheckCircle2 size={28} />, color: 'text-emerald-500', bg: 'bg-emerald-50' },
              ].map((stat, i) => (
                <div key={i} className="bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all flex items-center justify-between group">
                  <div>
                    <p className="text-[10px] text-slate-400 font-black uppercase mb-1 tracking-widest">{stat.label}</p>
                    <h3 className="text-5xl font-black text-slate-800">{stat.value}</h3>
                  </div>
                  <div className={`${stat.bg} ${stat.color} p-6 rounded-3xl group-hover:scale-110 transition-transform`}>{stat.icon}</div>
                </div>
              ))}
            </div>

            {/* Quick Actions / Recent */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
               <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm">
                  <h3 className="text-2xl font-black text-slate-900 mb-8 flex items-center gap-3"><Activity size={24} className="text-indigo-600" /> النشاط الأخير</h3>
                  <div className="space-y-6">
                     {files.slice(0, 5).map(f => (
                        <div key={f.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl hover:bg-indigo-50 transition-colors">
                           <div className="flex items-center gap-4">
                              <div className="bg-white p-3 rounded-xl border border-slate-200">{getFileIcon(f.name)}</div>
                              <div>
                                 <p className="font-bold text-slate-800 truncate max-w-[200px]">{f.name}</p>
                                 <p className="text-[10px] text-slate-400 font-black uppercase">{f.isProcessing ? 'جاري المعالجة' : 'تمت الأرشفة بنجاح'}</p>
                              </div>
                           </div>
                           <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">اليوم</span>
                        </div>
                     ))}
                     {files.length === 0 && <p className="text-slate-400 text-center font-bold py-10">لا توجد سجلات حالية.</p>}
                  </div>
               </div>
               <div className="bg-slate-900 p-10 rounded-[3rem] shadow-2xl relative overflow-hidden">
                  <div className="absolute bottom-0 right-0 opacity-10"><Database size={200} /></div>
                  <h3 className="text-2xl font-black text-white mb-2">حالة التخزين</h3>
                  <p className="text-slate-400 text-sm mb-10 font-bold uppercase tracking-widest">مساحة سحابية مشفرة</p>
                  <div className="space-y-6 relative z-10">
                     <div className="flex justify-between text-xs font-black text-indigo-400 mb-2"><span>مستخدم</span><span>1.2 GB / 10 GB</span></div>
                     <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden"><div className="w-[12%] h-full bg-indigo-500"></div></div>
                     <button className="w-full py-4 bg-white/5 border border-white/10 rounded-2xl text-white font-black text-sm hover:bg-white/10 transition-all mt-6">ترقية الخطة</button>
                  </div>
               </div>
            </div>
          </div>
        )}

        {activeTab === 'archive' && (
          <div className="space-y-10 animate-in fade-in duration-500">
            <header className="flex justify-between items-center">
               <h1 className="text-5xl font-black text-slate-900">الأرشيف المركزي</h1>
               <div className="relative w-96">
                <Search className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input type="text" placeholder="بحث ذكي في المحتوى..." className="w-full pr-16 pl-6 py-5 bg-white border border-slate-100 rounded-[1.5rem] shadow-sm outline-none font-bold text-slate-700 focus:ring-4 ring-indigo-500/10 transition-all" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {filteredFiles.map(f => (
                <div key={f.id} onClick={() => !f.isProcessing && setSelectedFileId(f.id)} className={`bg-white border border-slate-100 rounded-[2.5rem] p-10 transition-all relative overflow-hidden group ${f.isProcessing ? 'cursor-wait border-indigo-100' : 'hover:shadow-2xl hover:-translate-y-2 cursor-pointer'}`}>
                  <div className="flex items-center gap-5 mb-8">
                    <div className={`p-5 rounded-3xl transition-all ${f.isProcessing ? 'bg-indigo-50 text-indigo-500 animate-pulse' : 'bg-slate-50 group-hover:bg-indigo-600 group-hover:text-white'}`}>{getFileIcon(f.name)}</div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-black text-slate-800 text-xl truncate">{f.isoMetadata?.title || f.name}</h3>
                      <p className="text-[10px] font-black text-slate-400 block mt-1 uppercase tracking-widest">{f.isProcessing ? 'جاري التحليل...' : f.isoMetadata?.recordId}</p>
                    </div>
                  </div>
                  <p className="text-slate-500 text-sm font-bold line-clamp-2 leading-relaxed mb-8 h-10">{f.isoMetadata?.description}</p>
                  <div className="flex items-center justify-between mt-auto pt-8 border-t border-slate-50">
                    <span className="bg-slate-50 text-slate-500 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest">{f.isoMetadata?.documentType}</span>
                    <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-sm">
                      <ArrowRight size={20} className="group-hover:translate-x-[-2px] transition-transform" />
                    </div>
                  </div>
                </div>
              ))}
              {filteredFiles.length === 0 && (
                 <div className="col-span-full py-20 text-center flex flex-col items-center gap-6">
                    <div className="bg-slate-50 p-10 rounded-full text-slate-200"><Database size={80} /></div>
                    <p className="text-slate-400 font-black text-2xl">لا توجد نتائج بحث مطابقة.</p>
                 </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'agent' && (
          <div className="h-[calc(100vh-180px)] flex flex-col bg-white rounded-[3.5rem] border border-slate-100 shadow-xl overflow-hidden animate-in slide-in-from-bottom-6 duration-700">
             <div className="p-10 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-6">
                   <div className="bg-indigo-600 p-5 rounded-2xl text-white shadow-2xl shadow-indigo-600/30"><Bot size={32} /></div>
                   <div>
                      <h2 className="text-3xl font-black text-slate-900 tracking-tight">المساعد الرقمي</h2>
                      <p className="text-slate-500 text-sm font-bold mt-1 uppercase tracking-widest">خبير الأرشفة ISO 15489</p>
                   </div>
                </div>
                <div className="bg-emerald-50 text-emerald-600 px-6 py-3 rounded-2xl text-xs font-black border border-emerald-100 flex items-center gap-2">
                   <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                   النظام متصل
                </div>
             </div>

             <div className="flex-1 overflow-y-auto p-12 space-y-10 bg-slate-50/20 custom-scrollbar">
                {messages.map((m) => (
                   <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in duration-300`}>
                      <div className={`max-w-[70%] p-8 rounded-[2.5rem] shadow-sm relative ${m.role === 'user' ? 'bg-slate-900 text-white rounded-tr-none' : 'bg-white text-slate-800 rounded-tl-none border border-slate-100'}`}>
                         {m.role === 'assistant' && <div className="absolute -right-4 -top-4 w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg"><Bot size={18} /></div>}
                         <p className="text-lg font-bold leading-relaxed whitespace-pre-wrap">{m.text}</p>
                         <p className={`text-[10px] mt-4 font-black uppercase opacity-50 ${m.role === 'user' ? 'text-slate-400' : 'text-slate-300'}`}>
                            {m.timestamp.toLocaleTimeString('ar-SA')}
                         </p>
                      </div>
                   </div>
                ))}
                {isChatLoading && (
                   <div className="flex justify-start animate-pulse">
                      <div className="bg-white border border-slate-100 p-8 rounded-[2.5rem] rounded-tl-none flex items-center gap-4">
                         <Loader2 className="animate-spin text-indigo-600" />
                         <span className="text-slate-400 text-sm font-black uppercase tracking-widest">جاري مراجعة الأرشيف...</span>
                      </div>
                   </div>
                )}
                <div ref={chatEndRef} />
             </div>

             <div className="p-10 bg-white border-t border-slate-100 shrink-0">
                <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} className="flex gap-6">
                   <div className="flex-1 relative">
                      <input 
                        type="text" 
                        placeholder="اطرح أي سؤال حول ملفاتك المؤرشفة..." 
                        className="w-full pr-10 pl-24 py-6 bg-slate-50 border border-slate-200 rounded-[2rem] outline-none font-bold text-slate-800 text-lg shadow-inner focus:ring-4 ring-indigo-500/10 transition-all"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        disabled={isChatLoading}
                      />
                      <div className="absolute left-6 top-1/2 -translate-y-1/2 flex gap-3 text-slate-400">
                         <Terminal size={20} />
                         <Hash size={20} />
                      </div>
                   </div>
                   <button 
                     type="submit" 
                     disabled={!chatInput.trim() || isChatLoading}
                     className="bg-indigo-600 text-white px-10 rounded-[2rem] font-black text-xl hover:bg-black transition-all shadow-2xl shadow-indigo-600/20 disabled:bg-slate-300 flex items-center gap-4 group"
                   >
                      إرسال <Send size={24} className="group-hover:translate-x-[-4px] transition-transform" />
                   </button>
                </form>
             </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
             <header>
                <h1 className="text-5xl font-black text-slate-900 tracking-tight">الإعدادات</h1>
                <p className="text-slate-500 mt-2 font-bold text-lg">إدارة تفضيلات النظام وسياسات الحفظ الرقمي.</p>
             </header>

             <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                <div className="lg:col-span-2 space-y-10">
                   <div className="bg-white p-12 rounded-[3.5rem] border border-slate-100 shadow-xl">
                      <h3 className="text-2xl font-black text-slate-900 mb-8 flex items-center gap-4"><User className="text-indigo-600" /> البروفايل الإداري</h3>
                      <div className="grid grid-cols-2 gap-8">
                         <div className="space-y-2">
                            <label className="text-xs font-black text-slate-400 uppercase tracking-widest">الاسم الكامل</label>
                            <input type="text" value="خالد محمد" className="w-full p-5 bg-slate-50 border rounded-2xl font-bold" disabled />
                         </div>
                         <div className="space-y-2">
                            <label className="text-xs font-black text-slate-400 uppercase tracking-widest">الدور</label>
                            <input type="text" value="مدير أرشفة (Admin)" className="w-full p-5 bg-slate-50 border rounded-2xl font-bold" disabled />
                         </div>
                      </div>
                   </div>

                   <div className="bg-white p-12 rounded-[3.5rem] border border-slate-100 shadow-xl">
                      <h3 className="text-2xl font-black text-slate-900 mb-8 flex items-center gap-4"><SettingsIcon className="text-indigo-600" /> إعدادات النظام</h3>
                      <div className="space-y-6">
                         {[
                            { label: 'التصنيف التلقائي عبر الذكاء الاصطناعي', desc: 'تفعيل تحليل محتوى الملفات فور الرفع.', active: true },
                            { label: 'الأرشفة السحابية المشفرة', desc: 'تشفير كافة السجلات بمعيار AES-256.', active: true },
                            { label: 'تنبيهات سياسات الحفظ', desc: 'إرسال إشعار عند قرب موعد إتلاف السجل.', active: false },
                         ].map((opt, i) => (
                            <div key={i} className="flex items-center justify-between p-6 bg-slate-50 rounded-3xl">
                               <div>
                                  <p className="font-bold text-slate-800">{opt.label}</p>
                                  <p className="text-xs text-slate-400 font-bold mt-1">{opt.desc}</p>
                               </div>
                               <div className={`w-14 h-8 rounded-full p-1 cursor-pointer transition-colors ${opt.active ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                                  <div className={`w-6 h-6 bg-white rounded-full shadow-md transition-transform ${opt.active ? 'translate-x-0' : 'translate-x-[-24px]'}`}></div>
                               </div>
                            </div>
                         ))}
                      </div>
                   </div>
                </div>

                <div className="space-y-10">
                   <div className="bg-rose-50 p-10 rounded-[3.5rem] border border-rose-100 shadow-lg">
                      <h3 className="text-xl font-black text-rose-900 mb-4 flex items-center gap-3"><Trash2 size={24} /> منطقة الخطر</h3>
                      <p className="text-rose-700/70 text-sm font-bold leading-relaxed mb-8">حذف كافة البيانات سيؤدي إلى فقدان دائم للأرشيف الرقمي ولا يمكن استرجاعه.</p>
                      <button 
                        onClick={() => { if(confirm('حذف كافة البيانات؟')) { localStorage.removeItem(STORAGE_KEY); setFiles([]); } }}
                        className="w-full py-5 bg-rose-600 text-white rounded-[1.5rem] font-black hover:bg-rose-700 transition-all shadow-xl shadow-rose-200"
                      >
                         تصفير الأرشيف بالكامل
                      </button>
                   </div>

                   <div className="bg-indigo-900 text-white p-10 rounded-[3.5rem] shadow-2xl relative overflow-hidden group">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full -translate-y-10 translate-x-10"></div>
                      <h3 className="text-xl font-black mb-4">تقرير الامتثال</h3>
                      <p className="text-indigo-200 text-xs font-bold mb-10 leading-relaxed">تحميل تقرير كامل بمدى مطابقة الأرشيف لمعايير ISO 15489 العالمية.</p>
                      <button className="w-full py-5 bg-indigo-500 text-white rounded-[1.5rem] font-black hover:bg-white hover:text-indigo-900 transition-all shadow-xl flex items-center justify-center gap-4">
                         تحميل التقرير <Download size={20} />
                      </button>
                   </div>
                </div>
             </div>
          </div>
        )}
      </main>

      {/* Modal - Professional Detail View */}
      {selectedFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 md:p-12 bg-slate-900/90 backdrop-blur-2xl animate-in fade-in">
          <div className="bg-white w-full max-w-7xl h-full max-h-[90vh] rounded-[4rem] shadow-[0_40px_100px_rgba(0,0,0,0.4)] overflow-hidden flex flex-col border border-white/20">
            <div className="p-10 border-b border-slate-100 flex justify-between items-center bg-slate-50/20 shrink-0">
              <div className="flex items-center gap-8 min-w-0">
                <div className="bg-indigo-600 p-6 rounded-[2rem] text-white shadow-2xl shrink-0 group hover:rotate-6 transition-transform">{getFileIcon(selectedFile.name)}</div>
                <div className="min-w-0">
                  <h3 className="text-4xl font-black text-slate-900 truncate">{selectedFile.isoMetadata?.title}</h3>
                  <div className="flex items-center gap-3 mt-3">
                     <span className="bg-indigo-50 text-indigo-600 px-4 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-widest">{selectedFile.isoMetadata?.recordId}</span>
                     <span className="bg-slate-100 text-slate-500 px-4 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-widest">{selectedFile.isoMetadata?.documentType}</span>
                  </div>
                </div>
              </div>
              <button onClick={() => setSelectedFileId(null)} className="p-5 bg-rose-50 text-rose-600 rounded-3xl hover:bg-rose-100 transition-all"><X size={32}/></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-12 custom-scrollbar">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                <div className="lg:col-span-2 space-y-12">
                   <section className="bg-indigo-50/50 p-12 rounded-[3rem] border border-indigo-100/50 relative overflow-hidden group">
                      <div className="absolute top-4 left-4 text-indigo-200 group-hover:text-indigo-400 transition-colors"><Sparkles size={32} /></div>
                      <h4 className="text-2xl font-black text-indigo-900 mb-4">الملخص التنفيذي الذكي</h4>
                      <p className="text-2xl font-bold text-slate-800 leading-[1.8]">{selectedFile.isoMetadata?.description}</p>
                   </section>

                   <div className="grid grid-cols-2 md:grid-cols-3 gap-8">
                      {[
                        { l: 'المرسل', v: selectedFile.isoMetadata?.sender, i: User, c: 'text-indigo-600' },
                        { l: 'المستلم', v: selectedFile.isoMetadata?.recipient, i: User, c: 'text-emerald-600' },
                        { l: 'الأهمية', v: selectedFile.isoMetadata?.importance, i: AlertCircle, c: 'text-rose-600' },
                        { l: 'السرية', v: selectedFile.isoMetadata?.confidentiality, i: Shield, c: 'text-slate-600' },
                        { l: 'التصنيف', v: selectedFile.isoMetadata?.category, i: Tag, c: 'text-amber-600' },
                        { l: 'تاريخ الأرشفة', v: new Date(selectedFile.isoMetadata?.updatedAt || '').toLocaleDateString('ار-SA'), i: Clock, c: 'text-blue-600' },
                      ].map((d, i) => (
                        <div key={i} className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-md transition-all">
                           <div className="flex items-center gap-3 mb-3">
                              <div className={`p-2.5 rounded-xl bg-slate-50 ${d.c}`}><d.i size={18} /></div>
                              <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{d.l}</p>
                           </div>
                           <p className="text-slate-800 text-sm font-black leading-relaxed truncate">{d.v || 'غير محدد'}</p>
                        </div>
                      ))}
                   </div>
                </div>

                <div className="space-y-12">
                   <section className="bg-slate-50 p-10 rounded-[3rem] border border-slate-100 flex flex-col h-full shadow-inner">
                      <h4 className="text-xl font-black text-slate-800 mb-8 flex items-center gap-3"><ScanText size={24} /> المحتوى الرقمي</h4>
                      <div className="bg-white p-10 rounded-[2rem] border border-slate-200 text-slate-700 leading-[2.2] font-mono text-sm flex-1 overflow-y-auto whitespace-pre-wrap shadow-sm">
                         {selectedFile.extractedText}
                      </div>
                   </section>
                </div>
              </div>
            </div>
            
            <div className="p-10 bg-slate-50 border-t border-slate-100 flex justify-end gap-6 shrink-0">
               <button onClick={() => setSelectedFileId(null)} className="px-12 py-5 bg-white border border-slate-200 text-slate-600 rounded-[1.5rem] text-lg font-black hover:bg-slate-100 transition-all">إغلاق</button>
               <button className="px-16 py-5 bg-indigo-600 text-white rounded-[1.5rem] text-lg font-black shadow-2xl shadow-indigo-600/30 hover:bg-black transition-all flex items-center gap-4">تصدير السجل <Download size={24}/></button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; border: 2px solid transparent; background-clip: content-box; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
      `}</style>
    </div>
  );
};

export default App;