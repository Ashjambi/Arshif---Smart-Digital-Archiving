
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  FileText, Search, Plus, X, Send, Loader2, 
  FolderPlus, ArrowRight, Bot, FileImage, 
  FileBox, Activity, MessageSquare, Database, 
  ExternalLink, Maximize2, ScanText, 
  Clock, Printer, FileCheck, Download, Trash2,
  AlertTriangle, LayoutDashboard, Sparkles, RefreshCw, Eye,
  Settings as SettingsIcon, ShieldCheck, User, HardDrive,
  ChevronLeft, Trash, Save, Info, Bell, Shield, Fingerprint,
  FileDigit, FileLock, Layers, Scale, Edit3, PlusCircle
} from 'lucide-react';
// @ts-ignore
import mammoth from 'mammoth';
// @ts-ignore
import Tesseract from 'tesseract.js';

import { 
  FileRecord, ArchiveStatus, AuditAction, AuditLog, ChatMessage, DocumentType, RetentionAction, RetentionPolicy
} from './types';
import { NAV_ITEMS } from './constants';
import { analyzeSpecificFile, chatWithFile, askAgent } from './services/geminiService';

const STORAGE_KEY = 'arshif_v24_pro';
const AUDIT_KEY = 'arshif_audit_v24';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [connectedFolder, setConnectedFolder] = useState<string | null>(null);
  
  const [isGlobalLoading, setIsGlobalLoading] = useState(false);
  const [isFileAnalyzing, setIsFileAnalyzing] = useState(false);
  const [fileChatInput, setFileChatInput] = useState('');
  const [fileChatMessages, setFileChatMessages] = useState<{role: 'user' | 'assistant', text: string}[]>([]);
  const [mainChatInput, setMainChatInput] = useState('');
  const [mainChatMessages, setMainChatMessages] = useState<ChatMessage[]>([]);
  const [isAgentLoading, setIsAgentLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const selectedFile = useMemo(() => files.find(f => f.id === selectedFileId) || null, [files, selectedFileId]);

  // Load Persistence
  useEffect(() => {
    const savedFiles = localStorage.getItem(STORAGE_KEY);
    const savedAudit = localStorage.getItem(AUDIT_KEY);
    if (savedFiles) {
      try {
        setFiles(JSON.parse(savedFiles));
      } catch (e) { console.error("Load error", e); }
    }
    if (savedAudit) try { setAuditLogs(JSON.parse(savedAudit)); } catch (e) {}
  }, []);

  // Save Persistence
  useEffect(() => {
    const filesToSave = files.map(({ preview, ...rest }) => rest);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filesToSave));
    localStorage.setItem(AUDIT_KEY, JSON.stringify(auditLogs));
  }, [files, auditLogs]);

  const logAction = (action: AuditAction, details: string, resourceId?: string) => {
    const newLog: AuditLog = {
      id: Math.random().toString(36).substr(2, 9),
      action,
      details,
      user: 'خالد (مدير الأرشفة)',
      timestamp: new Date().toISOString(),
      resourceId
    };
    setAuditLogs(prev => [newLog, ...prev].slice(0, 100));
  };

  const processFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setIsGlobalLoading(true);
    
    const uploadedFiles = Array.from(fileList);
    if (uploadedFiles[0].webkitRelativePath) {
      setConnectedFolder(uploadedFiles[0].webkitRelativePath.split('/')[0]);
    }

    const newRecords: FileRecord[] = [];
    for (const f of uploadedFiles) {
      if (f.name.startsWith('.') || f.size === 0) continue;
      const previewUrl = URL.createObjectURL(f);
      newRecords.push({
        id: Math.random().toString(36).substr(2, 9),
        name: f.name,
        size: f.size,
        type: f.type,
        lastModified: f.lastModified,
        isProcessing: false,
        preview: previewUrl,
        isoMetadata: {
          recordId: `PENDING-${Math.floor(1000 + Math.random() * 9000)}`,
          title: f.name,
          status: ArchiveStatus.ACTIVE,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          ocrStatus: 'pending'
        } as any
      });
    }

    setFiles(prev => [...newRecords, ...prev]);
    setIsGlobalLoading(false);
    logAction(AuditAction.CREATE, `رفع ${newRecords.length} مستندات جديدة.`);
    setActiveTab('archive');
  };

  const handleDeepAnalyze = async (fileId: string) => {
    const file = files.find(f => f.id === fileId);
    if (!file || isFileAnalyzing) return;
    setSelectedFileId(fileId);
    if (file.extractedText) return;

    setIsFileAnalyzing(true);
    setFileChatMessages([{ role: 'assistant', text: "جاري تحليل الوثيقة واستخراج النص الكامل (OCR)..." }]);

    try {
      let extractedText = "";
      if (file.preview) {
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (['jpg', 'jpeg', 'png', 'webp'].includes(ext || '')) {
          const result = await Tesseract.recognize(file.preview, 'ara+eng');
          extractedText = result.data.text;
        } else if (ext === 'docx') {
          const response = await fetch(file.preview);
          extractedText = (await mammoth.extractRawText({ arrayBuffer: await (await response.blob()).arrayBuffer() })).value;
        } else if (['txt', 'csv'].includes(ext || '')) {
          extractedText = await (await fetch(file.preview)).text();
        }
      }

      const metadata = await analyzeSpecificFile(file.name, extractedText || file.name);
      setFiles(prev => prev.map(f => f.id === fileId ? {
        ...f,
        extractedText: extractedText || "لا يوجد نص صريح، يعتمد التحليل على البيانات الوصفية واسم الملف.",
        isoMetadata: {
          ...f.isoMetadata,
          ...metadata as any,
          recordId: `REC-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`,
          ocrStatus: extractedText ? 'completed' : 'failed'
        }
      } : f));
      setFileChatMessages([{ role: 'assistant', text: "اكتمل التحليل. كيف يمكنني مساعدتك في هذه الوثيقة؟" }]);
    } catch (e) {
      setFileChatMessages([{ role: 'assistant', text: "عذراً، حدث خطأ أثناء القراءة العميقة." }]);
    }
    setIsFileAnalyzing(false);
  };

  const handleSendFileChat = async () => {
    if (!fileChatInput.trim() || !selectedFile || isFileAnalyzing) return;
    const msg = fileChatInput;
    setFileChatMessages(prev => [...prev, { role: 'user', text: msg }]);
    setFileChatInput('');
    setIsFileAnalyzing(true);
    // Crucial: Pass extractedText as context
    const res = await chatWithFile(msg, selectedFile.name, selectedFile.extractedText || "محتوى غير متوفر.");
    setFileChatMessages(prev => [...prev, { role: 'assistant', text: res }]);
    setIsFileAnalyzing(false);
  };

  const handleAgentChat = async () => {
    if (!mainChatInput.trim() || isAgentLoading) return;
    const msg = mainChatInput;
    setMainChatMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', text: msg, timestamp: new Date() }]);
    setMainChatInput('');
    setIsAgentLoading(true);

    const context = files
      .filter(f => f.extractedText)
      .slice(0, 5)
      .map(f => `[${f.name}]: ${f.isoMetadata?.description}. النص: ${f.extractedText?.substring(0, 400)}`)
      .join('\n---\n');

    const res = await askAgent(msg, context || "الأرشيف بانتظار التحليل.");
    setMainChatMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', text: res, timestamp: new Date() }]);
    setIsAgentLoading(false);
  };

  return (
    <div className="min-h-screen flex bg-[#f8fafc] text-slate-900 font-['Cairo']" dir="rtl">
      <input type="file" ref={fileInputRef} className="hidden" multiple onChange={(e) => processFiles(e.target.files)} />
      <input type="file" ref={folderInputRef} className="hidden" webkitdirectory="" {...({ directory: "" } as any)} multiple onChange={(e) => processFiles(e.target.files)} />

      {/* Sidebar */}
      <aside className={`bg-slate-900 text-slate-400 w-80 fixed h-full z-40 transition-all hidden lg:block border-l border-slate-800`}>
        <div className="p-8">
           <div className="flex items-center gap-4 mb-16 cursor-pointer" onClick={() => setActiveTab('dashboard')}>
              <div className="bg-indigo-600 w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-xl">أ</div>
              <span className="text-2xl font-black text-white tracking-tighter">أرشيـف PRO</span>
           </div>
           <nav className="space-y-4">
              {NAV_ITEMS.map(item => (
                <button key={item.id} onClick={() => setActiveTab(item.id)} className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all ${activeTab === item.id ? 'bg-indigo-600 text-white shadow-xl' : 'hover:bg-slate-800 hover:text-white'}`}>
                   <item.icon size={22} />
                   <span className="font-bold">{item.label}</span>
                </button>
              ))}
              <button onClick={() => setActiveTab('agent')} className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all ${activeTab === 'agent' ? 'bg-indigo-600 text-white shadow-xl' : 'hover:bg-slate-800'}`}>
                 <Bot size={22} />
                 <span className="font-bold">المساعد الذكي</span>
              </button>
           </nav>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`flex-1 lg:mr-80 p-8 lg:p-12 transition-all`}>
        {isGlobalLoading && (
          <div className="fixed inset-0 z-50 bg-white/90 backdrop-blur-md flex flex-col items-center justify-center">
             <Loader2 className="animate-spin text-indigo-600 mb-6" size={64} />
             <p className="text-2xl font-black text-slate-800">جاري فهرسة المستندات...</p>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <div className="max-w-7xl mx-auto space-y-12 animate-in fade-in duration-700">
             <header className="bg-white p-12 rounded-[3.5rem] shadow-sm border border-slate-100 flex flex-col xl:flex-row justify-between items-center gap-10">
                <div className="text-center xl:text-right">
                   <h1 className="text-5xl lg:text-6xl font-black text-slate-900 tracking-tighter">مرحباً خالد</h1>
                   <p className="text-slate-400 font-bold mt-4 text-xl">نظام الأرشفة الذكي يعمل بنجاح (معيار ISO 15489)</p>
                   {connectedFolder && (
                     <div className="mt-6 inline-flex items-center gap-3 bg-emerald-50 text-emerald-600 px-6 py-3 rounded-2xl text-lg font-black border border-emerald-100 shadow-sm">
                        <FolderPlus size={24} /> المجلد النشط: {connectedFolder}
                     </div>
                   )}
                </div>
                <div className="flex flex-wrap justify-center gap-6">
                   <button onClick={() => folderInputRef.current?.click()} className="bg-slate-900 text-white px-10 py-6 rounded-[1.5rem] flex items-center gap-4 font-black shadow-2xl hover:bg-black transition-all active:scale-95">
                      <FolderPlus size={28} /> ربط مجلد
                   </button>
                   <button onClick={() => fileInputRef.current?.click()} className="bg-indigo-600 text-white px-10 py-6 rounded-[1.5rem] flex items-center gap-4 font-black shadow-2xl hover:bg-indigo-700 transition-all active:scale-95">
                      <Plus size={28} /> رفع ملفات
                   </button>
                </div>
             </header>

             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                {[
                  { label: 'إجمالي الأرشيف', value: files.length, icon: Database, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                  { label: 'وثائق محللة', value: files.filter(f => f.extractedText).length, icon: FileCheck, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                  { label: 'سجلات OCR', value: files.filter(f => f.isoMetadata?.ocrStatus === 'completed').length, icon: ScanText, color: 'text-amber-600', bg: 'bg-amber-50' },
                  { label: 'التدقيق الأمني', value: 'نشط', icon: ShieldCheck, color: 'text-rose-600', bg: 'bg-rose-50' }
                ].map((stat, i) => (
                  <div key={i} className="bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-sm flex items-center justify-between hover:shadow-xl transition-all">
                     <div>
                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">{stat.label}</p>
                        <h3 className="text-4xl font-black text-slate-800">{stat.value}</h3>
                     </div>
                     <div className={`${stat.bg} ${stat.color} p-5 rounded-2xl`}><stat.icon size={32} /></div>
                  </div>
                ))}
             </div>

             <div className="bg-white p-12 rounded-[3.5rem] border border-slate-100 shadow-sm">
                <div className="flex justify-between items-center mb-12">
                   <h3 className="text-3xl font-black flex items-center gap-4"><Clock className="text-indigo-600" /> الملفات المضافة مؤخراً</h3>
                   <button onClick={() => setActiveTab('archive')} className="text-indigo-600 font-bold text-lg hover:underline">عرض الكل</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                   {files.slice(0, 4).map(f => (
                     <div key={f.id} onClick={() => handleDeepAnalyze(f.id)} className="bg-slate-50 p-8 rounded-[2rem] border border-transparent hover:border-indigo-100 hover:bg-white transition-all cursor-pointer flex items-center gap-8 group shadow-sm">
                        <div className="bg-white p-5 rounded-2xl shadow-sm group-hover:bg-indigo-600 group-hover:text-white transition-all">
                           {f.name.toLowerCase().endsWith('.pdf') ? <FileBox /> : <FileImage />}
                        </div>
                        <div className="min-w-0 flex-1">
                           <p className="font-black text-slate-800 truncate text-xl">{f.name}</p>
                           <p className="text-sm text-slate-400 font-black mt-2 uppercase tracking-widest">{f.isoMetadata?.recordId}</p>
                        </div>
                        <ArrowRight className="text-slate-200 group-hover:text-indigo-600 transition-all" />
                     </div>
                   ))}
                </div>
             </div>
          </div>
        )}

        {activeTab === 'archive' && (
          <div className="max-w-7xl mx-auto space-y-12 animate-in fade-in duration-500">
             <div className="flex flex-col md:flex-row justify-between items-center gap-10">
                <h1 className="text-4xl font-black text-slate-900 tracking-tighter">مخزن الأرشيف</h1>
                <div className="relative w-full md:w-[500px] group">
                   <Search className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600" size={24} />
                   <input type="text" placeholder="بحث في السجلات..." className="w-full pr-16 pl-6 py-5 bg-white border border-slate-200 rounded-[1.5rem] outline-none font-bold shadow-sm focus:ring-4 ring-indigo-500/10 transition-all" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                </div>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-10">
                {files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase())).map(f => (
                  <div key={f.id} onClick={() => handleDeepAnalyze(f.id)} className="bg-white p-10 rounded-[3rem] border border-slate-100 hover:shadow-2xl transition-all cursor-pointer group relative">
                     <div className="bg-slate-50 w-16 h-16 rounded-2xl flex items-center justify-center mb-8 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-sm">
                        {f.name.toLowerCase().endsWith('.pdf') ? <FileBox /> : <FileImage />}
                     </div>
                     <h3 className="font-black text-2xl truncate mb-3 text-slate-800">{f.isoMetadata?.title || f.name}</h3>
                     <p className="text-slate-400 text-sm font-bold truncate mb-8 uppercase tracking-widest">{f.isoMetadata?.recordId}</p>
                     <div className="pt-8 border-t border-slate-50 flex justify-between items-center">
                        <span className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em]">{f.isoMetadata?.documentType || 'بانتظار التحليل'}</span>
                        <div className="p-3 bg-slate-50 rounded-xl group-hover:bg-indigo-50 text-slate-300 group-hover:text-indigo-600 transition-all"><ExternalLink size={20} /></div>
                     </div>
                  </div>
                ))}
             </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-6xl mx-auto space-y-12 animate-in fade-in duration-700 pb-20">
             <header className="mb-12">
                <h1 className="text-4xl font-black text-slate-900 tracking-tighter">الإعدادات المتقدمة</h1>
                <p className="text-slate-400 font-bold text-xl mt-4">إدارة سياسات النظام، المستخدمين، والأمان</p>
             </header>

             <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                {/* Right Column: Navigation */}
                <div className="md:col-span-1 space-y-4">
                   {[
                      { id: 'profile', label: 'الملف الشخصي', icon: User },
                      { id: 'retention', label: 'سياسات الحفظ (ISO)', icon: Scale },
                      { id: 'security', label: 'الأمان والخصوصية', icon: Shield },
                      { id: 'audit', label: 'سجل التدقيق', icon: Fingerprint },
                      { id: 'storage', label: 'إدارة التخزين', icon: HardDrive }
                   ].map(link => (
                      <button key={link.id} className="w-full flex items-center justify-between p-6 bg-white border border-slate-100 rounded-2xl font-black text-slate-600 hover:border-indigo-600 hover:text-indigo-600 transition-all shadow-sm group">
                         <div className="flex items-center gap-4"><link.icon size={24} /><span className="text-lg">{link.label}</span></div>
                         <ChevronLeft className="opacity-0 group-hover:opacity-100 transition-all" />
                      </button>
                   ))}
                </div>

                {/* Left Column: Content Cards */}
                <div className="md:col-span-2 space-y-8">
                   {/* Profile Card */}
                   <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-2 h-full bg-indigo-600"></div>
                      <div className="flex items-center gap-8 mb-10">
                         <div className="w-24 h-24 bg-slate-100 rounded-[2rem] flex items-center justify-center text-slate-400"><User size={48} /></div>
                         <div>
                            <h3 className="text-2xl font-black text-slate-800">خالد محمد</h3>
                            <p className="text-slate-400 font-bold">مدير الأرشيف الرقمي - جهة حكومية</p>
                         </div>
                         <button className="mr-auto bg-slate-50 p-4 rounded-xl text-slate-400 hover:bg-slate-100 transition-all"><Edit3 size={24} /></button>
                      </div>
                      <div className="grid grid-cols-2 gap-6">
                         <div className="bg-slate-50 p-6 rounded-2xl border border-transparent hover:border-slate-200 transition-all">
                            <p className="text-[10px] text-slate-400 font-black uppercase mb-2">تاريخ الانضمام</p>
                            <p className="font-black text-slate-800">14 أكتوبر 2023</p>
                         </div>
                         <div className="bg-slate-50 p-6 rounded-2xl border border-transparent hover:border-slate-200 transition-all">
                            <p className="text-[10px] text-slate-400 font-black uppercase mb-2">رتبة الوصول</p>
                            <p className="font-black text-indigo-600">مسؤول النظام (Root)</p>
                         </div>
                      </div>
                   </div>

                   {/* System Policies */}
                   <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm">
                      <div className="flex justify-between items-center mb-10">
                         <h3 className="text-2xl font-black flex items-center gap-4"><Scale className="text-indigo-600" /> سياسات الحفظ (ISO 15489)</h3>
                         <button className="text-indigo-600 font-black flex items-center gap-2"><PlusCircle size={20} /> إضافة سياسة</button>
                      </div>
                      <div className="space-y-6">
                         {[
                            { name: 'السجلات المالية', dur: '10 سنوات', action: 'إتلاف آمن' },
                            { name: 'العقود والمواثيق', dur: 'دائم', action: 'أرشفة نهائية' },
                            { name: 'المراسلات العامة', dur: 'سنتان', action: 'مراجعة' }
                         ].map((pol, i) => (
                            <div key={i} className="flex items-center justify-between p-6 bg-slate-50 rounded-2xl border border-slate-100 group">
                               <div className="flex items-center gap-6">
                                  <div className="p-4 bg-white rounded-xl shadow-sm text-slate-400 group-hover:text-indigo-600 transition-all"><FileDigit size={24} /></div>
                                  <div>
                                     <p className="font-black text-slate-800 text-lg">{pol.name}</p>
                                     <p className="text-sm text-slate-400 font-bold">المدة: {pol.dur} | الإجراء: {pol.action}</p>
                                  </div>
                               </div>
                               <button className="text-slate-300 hover:text-rose-600 transition-all"><Trash size={20} /></button>
                            </div>
                         ))}
                      </div>
                   </div>

                   {/* Audit Log Card */}
                   <div className="bg-slate-900 text-white p-10 rounded-[3.5rem] shadow-2xl overflow-hidden relative">
                      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-indigo-500/10 via-transparent to-transparent opacity-50"></div>
                      <h3 className="text-2xl font-black mb-10 flex items-center gap-4 relative z-10"><Fingerprint className="text-emerald-400" /> سجل التدقيق المباشر</h3>
                      <div className="space-y-4 relative z-10 max-h-80 overflow-y-auto custom-scrollbar pl-4">
                         {auditLogs.slice(0, 10).map(log => (
                            <div key={log.id} className="p-4 bg-white/5 border border-white/5 rounded-2xl flex items-center gap-6 group hover:bg-white/10 transition-all">
                               <span className="text-emerald-400 font-mono text-xs">{new Date(log.timestamp).toLocaleTimeString()}</span>
                               <span className="bg-indigo-500/20 text-indigo-300 px-3 py-1 rounded-lg text-[10px] font-black uppercase">{log.action}</span>
                               <span className="text-slate-300 font-bold text-sm truncate">{log.details}</span>
                            </div>
                         ))}
                         {auditLogs.length === 0 && <p className="text-slate-500 font-bold italic py-10 text-center">لا توجد سجلات تدقيق حالياً.</p>}
                      </div>
                   </div>
                </div>
             </div>
          </div>
        )}

        {activeTab === 'agent' && (
          <div className="max-w-5xl mx-auto h-[calc(100vh-180px)] flex flex-col animate-in slide-in-from-bottom-8 duration-500">
             <div className="bg-white p-10 rounded-t-[3rem] border flex items-center gap-6 shadow-sm">
                <div className="bg-indigo-600 p-5 rounded-2xl text-white shadow-lg"><Bot size={36} /></div>
                <div>
                   <h2 className="text-3xl font-black text-slate-900">أرشيـف GPT</h2>
                   <p className="text-slate-400 font-bold text-lg">بإمكاني قراءة محتوى المستندات المحللة والإجابة بدقة.</p>
                </div>
             </div>
             <div className="flex-1 overflow-y-auto p-10 bg-white border-x space-y-8 custom-scrollbar">
                {mainChatMessages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] p-8 rounded-[2.5rem] font-bold shadow-sm ${msg.role === 'user' ? 'bg-slate-900 text-white shadow-xl rounded-tr-none' : 'bg-slate-100 text-slate-800 border shadow-sm rounded-tl-none'}`}>
                       <p className="whitespace-pre-wrap leading-relaxed text-lg">{msg.text}</p>
                    </div>
                  </div>
                ))}
                {isAgentLoading && <Loader2 className="animate-spin text-indigo-600 mx-auto" size={32} />}
             </div>
             <div className="p-10 bg-white rounded-b-[3rem] border shadow-2xl flex gap-6">
                <input type="text" placeholder="مثال: لخص لي الخطابات الصادرة من جهة معينة..." className="flex-1 bg-slate-50 px-10 py-6 rounded-[2rem] outline-none font-bold border-2 border-transparent focus:border-indigo-600 focus:bg-white transition-all text-xl" value={mainChatInput} onChange={(e) => setMainChatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAgentChat()} />
                <button onClick={handleAgentChat} className="bg-indigo-600 text-white p-6 rounded-[2rem] shadow-xl hover:bg-black transition-all active:scale-95"><Send size={32} /></button>
             </div>
          </div>
        )}
      </main>

      {/* Detail Overlay (RE-DESIGNED TO FIX BLOCKED PREVIEW) */}
      {selectedFile && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/70 backdrop-blur-xl animate-in fade-in duration-300">
           <div className="w-full lg:w-[1000px] bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-left duration-500 overflow-hidden">
              <div className="p-10 border-b flex justify-between items-center bg-white shrink-0 shadow-sm relative z-10">
                 <div className="flex items-center gap-8">
                    <div className="bg-indigo-600 p-6 rounded-3xl text-white shadow-2xl border-4 border-white">{selectedFile.name.toLowerCase().endsWith('.pdf') ? <FileBox size={32}/> : <FileImage size={32}/>}</div>
                    <div className="min-w-0">
                       <h3 className="text-3xl font-black text-slate-900 truncate max-w-lg">{selectedFile.name}</h3>
                       <p className="text-indigo-600 font-black text-sm uppercase mt-2 tracking-widest">{selectedFile.isoMetadata?.recordId}</p>
                    </div>
                 </div>
                 <button onClick={() => setSelectedFileId(null)} className="p-5 hover:bg-rose-50 text-slate-300 hover:text-rose-600 rounded-2xl transition-all"><X size={40}/></button>
              </div>

              <div className="flex-1 overflow-y-auto p-12 space-y-16 custom-scrollbar bg-slate-50/50">
                 {/* Safe Visual View (NO IFRAME BLOCKS) */}
                 <div className="bg-slate-900 rounded-[3.5rem] p-8 flex flex-col items-center justify-center min-h-[500px] relative shadow-2xl overflow-hidden group">
                    {selectedFile.preview ? (
                      selectedFile.type.startsWith('image/') ? 
                        <img src={selectedFile.preview} className="max-w-full max-h-[600px] rounded-3xl shadow-xl object-contain" alt="preview" /> :
                        <div className="text-slate-300 flex flex-col items-center gap-8 text-center max-w-sm">
                           <div className="w-32 h-32 bg-white/5 rounded-full flex items-center justify-center border border-white/10"><FileBox size={64} className="text-indigo-500" /></div>
                           <div>
                              <p className="text-2xl font-black mb-4">معاينة آمنة للمستند</p>
                              <p className="text-slate-500 font-bold leading-relaxed">لتجاوز قيود أمان المتصفح (Blocked by Comet)، يرجى فتح الوثيقة في نافذة مستقلة للمعاينة الكاملة.</p>
                           </div>
                           <button onClick={() => window.open(selectedFile.preview, '_blank')} className="mt-4 bg-white text-slate-900 px-10 py-6 rounded-3xl font-black shadow-2xl flex items-center gap-4 hover:bg-indigo-600 hover:text-white transition-all transform hover:scale-105 active:scale-95">
                              <Eye size={28} /> فتح المعاينة المستقلة
                           </button>
                        </div>
                    ) : (
                      <div className="text-slate-500 font-bold flex flex-col items-center gap-6">
                         <RefreshCw size={64} className="animate-spin opacity-20" />
                         <p className="text-2xl">بانتظار مزامنة البيانات...</p>
                      </div>
                    )}
                 </div>

                 {/* ISO Analysis Block */}
                 <div className="bg-white p-12 rounded-[3.5rem] border border-slate-200 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-3 h-full bg-indigo-600"></div>
                    <div className="flex justify-between items-center mb-10">
                       <h4 className="text-2xl font-black flex items-center gap-4 text-slate-800"><Sparkles className="text-indigo-600" /> التحليل الفني والوظيفي</h4>
                       <span className={`px-4 py-2 rounded-xl text-xs font-black border ${selectedFile.isoMetadata?.ocrStatus === 'completed' ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>
                          {selectedFile.isoMetadata?.ocrStatus === 'completed' ? 'تمت القراءة الآلية' : 'بانتظار القراءة'}
                       </span>
                    </div>
                    
                    {isFileAnalyzing ? (
                       <div className="flex flex-col items-center justify-center py-12 space-y-6">
                          <Loader2 className="animate-spin text-indigo-600" size={56} />
                          <p className="text-2xl font-black text-slate-400">جاري قراءة محتوى الوثيقة...</p>
                       </div>
                    ) : (
                       <>
                          <p className="text-2xl font-bold text-slate-700 italic mb-12 leading-relaxed bg-slate-50 p-8 rounded-3xl border border-slate-100 shadow-inner">
                             "{selectedFile.isoMetadata?.description || 'يرجى تفعيل التحليل العميق لقراءة محتوى هذا المستند.'}"
                          </p>
                          <div className="grid grid-cols-2 gap-8">
                             {[
                               { l: 'المصدر / المرسل', v: selectedFile.isoMetadata?.sender || '---', icon: User },
                               { l: 'تصنيف الوثيقة', v: selectedFile.isoMetadata?.documentType || '---', icon: Layers },
                               { l: 'الأهمية القصوى', v: selectedFile.isoMetadata?.importance || '---', icon: AlertTriangle },
                               { l: 'السرية والأمان', v: selectedFile.isoMetadata?.confidentiality || '---', icon: FileLock }
                             ].map((d, i) => (
                                <div key={i} className="bg-slate-50 p-8 rounded-3xl border border-transparent hover:border-slate-200 transition-all flex items-center gap-6">
                                   <div className="p-4 bg-white rounded-2xl text-slate-400 shadow-sm"><d.icon size={24}/></div>
                                   <div>
                                      <p className="text-[10px] text-slate-400 font-black mb-1 uppercase tracking-widest">{d.l}</p>
                                      <p className="font-black text-slate-800 text-xl">{d.v}</p>
                                   </div>
                                </div>
                             ))}
                          </div>
                       </>
                    )}
                 </div>

                 {/* OCR Result Box */}
                 {selectedFile.extractedText && (
                    <div className="space-y-6">
                       <h5 className="font-black text-slate-400 text-xs flex items-center gap-3 uppercase tracking-widest"><ScanText size={24}/> النص الكامل المستخرج (OCR)</h5>
                       <div className="bg-slate-900 p-12 rounded-[3rem] text-slate-300 font-mono text-xl leading-loose max-h-96 overflow-y-auto border border-slate-800 shadow-2xl custom-scrollbar selection:bg-indigo-500 selection:text-white">
                          {selectedFile.extractedText}
                       </div>
                    </div>
                 )}

                 {/* Message Component */}
                 <div className="space-y-10 pb-20">
                    <h4 className="text-2xl font-black flex items-center gap-4 text-indigo-600 px-4"><MessageSquare /> دردشة المستند الذكية</h4>
                    <div className="space-y-8">
                       {fileChatMessages.map((m, i) => (
                          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                             <div className={`max-w-[85%] p-10 rounded-[3rem] font-bold shadow-sm ${m.role === 'user' ? 'bg-slate-900 text-white shadow-2xl rounded-tr-none' : 'bg-white text-slate-800 border rounded-tl-none shadow-sm'}`}>
                                <p className="leading-relaxed whitespace-pre-wrap text-xl">{m.text}</p>
                             </div>
                          </div>
                       ))}
                       {isFileAnalyzing && <div className="flex justify-start"><Loader2 className="animate-spin text-indigo-600" /></div>}
                    </div>
                    <div className="bg-white p-4 rounded-[2.5rem] border shadow-2xl flex gap-4 focus-within:ring-4 ring-indigo-500/10 transition-all">
                       <input type="text" placeholder="اسأل عن أي تفاصيل داخل هذه الوثيقة..." className="flex-1 bg-transparent px-8 py-6 outline-none font-bold text-xl" value={fileChatInput} onChange={(e) => setFileChatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSendFileChat()} />
                       <button onClick={handleSendFileChat} className="bg-indigo-600 text-white p-6 rounded-3xl shadow-xl hover:bg-black transition-all active:scale-95"><Send size={32} /></button>
                    </div>
                 </div>
              </div>

              <div className="p-10 border-t bg-white flex justify-end gap-6 shrink-0 shadow-inner relative z-10">
                 <button onClick={() => handleDeepAnalyze(selectedFile.id)} className="px-12 py-6 bg-white border-2 border-indigo-600 text-indigo-600 rounded-3xl font-black flex items-center gap-4 hover:bg-indigo-600 hover:text-white transition-all shadow-xl">
                    <Sparkles size={28} /> {selectedFile.extractedText ? 'إعادة التحليل' : 'تحليل عميق الآن'}
                 </button>
                 <button onClick={() => window.print()} className="px-12 py-6 bg-slate-900 text-white rounded-3xl font-black flex items-center gap-4 hover:bg-black transition-all">
                    <Printer size={28} /> طباعة السجل
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default App;
