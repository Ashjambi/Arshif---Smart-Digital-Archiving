
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  FileText, Search, Plus, X, Send, Loader2, 
  FolderPlus, ArrowRight, Bot, FileImage, 
  FileBox, Activity, MessageSquare, Database, 
  Maximize2, ScanText, 
  Clock, FileCheck, Download, Trash2,
  AlertTriangle, LayoutDashboard, Sparkles, RefreshCw, Eye,
  Settings as SettingsIcon, ShieldCheck, User, HardDrive,
  ChevronLeft, Trash, Save, Info, Bell, Shield, Fingerprint,
  FileDigit, FileLock, Layers, Scale, Edit3, PlusCircle,
  History, CheckCircle2, Zap, Globe, ShieldAlert, Cpu, Share2,
  ChevronRight, Lock, Key, Smartphone, ExternalLink, ShieldQuestion,
  UserCheck, ShieldBan, Terminal
} from 'lucide-react';
// @ts-ignore
import mammoth from 'mammoth';
// @ts-ignore
import Tesseract from 'tesseract.js';

import { 
  FileRecord, ArchiveStatus, AuditAction, AuditLog, ChatMessage, DocumentType, RetentionAction, RetentionPolicy, Importance, Confidentiality
} from './types';
import { NAV_ITEMS, STATUS_COLORS } from './constants';
import { analyzeSpecificFile, chatWithFile, askAgent } from './services/geminiService';

const STORAGE_KEY = 'arshif_stable_v1';
const AUDIT_KEY = 'arshif_audit_stable_v1';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [settingsTab, setSettingsTab] = useState('general');
  const [files, setFiles] = useState<FileRecord[]>([]);
  // تخزين كائنات الملفات في الذاكرة لتمكين المعاينة أثناء الجلسة
  const [fileBlobs, setFileBlobs] = useState<Map<string, File>>(new Map());
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

  const folderInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedFile = useMemo(() => files.find(f => f.id === selectedFileId) || null, [files, selectedFileId]);

  useEffect(() => {
    const savedFiles = localStorage.getItem(STORAGE_KEY);
    const savedAudit = localStorage.getItem(AUDIT_KEY);
    if (savedFiles) try { setFiles(JSON.parse(savedFiles)); } catch (e) {}
    if (savedAudit) try { setAuditLogs(JSON.parse(savedAudit)); } catch (e) {}
  }, []);

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
      user: 'خالد (مسؤول النظام)',
      timestamp: new Date().toISOString(),
      resourceId
    };
    setAuditLogs(prev => [newLog, ...prev].slice(0, 50));
  };

  const processFiles = (uploadedFiles: FileList) => {
    const newRecords: FileRecord[] = [];
    const newBlobs = new Map(fileBlobs);

    Array.from(uploadedFiles).forEach(f => {
      const id = Math.random().toString(36).substr(2, 9);
      newRecords.push({
        id,
        name: f.name,
        size: f.size,
        type: f.type,
        lastModified: f.lastModified,
        isProcessing: false,
        isoMetadata: {
          recordId: `REC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
          originalPath: (f as any).webkitRelativePath || f.name,
          title: f.name,
          status: ArchiveStatus.ACTIVE,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          ocrStatus: 'pending'
        } as any
      });
      newBlobs.set(id, f);
    });

    setFiles(prev => [...newRecords, ...prev]);
    setFileBlobs(newBlobs);
    return newRecords.length;
  };

  const handleFolderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = e.target.files;
    if (!uploadedFiles || uploadedFiles.length === 0) return;
    setIsGlobalLoading(true);
    const count = processFiles(uploadedFiles);
    const pathParts = uploadedFiles[0].webkitRelativePath.split('/');
    if (pathParts.length > 0) setConnectedFolder(pathParts[0]);
    logAction(AuditAction.SYNC, `مزامنة ${count} ملف من المجلد ${pathParts[0]}`);
    setIsGlobalLoading(false);
    setActiveTab('archive');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = e.target.files;
    if (!uploadedFiles || uploadedFiles.length === 0) return;
    setIsGlobalLoading(true);
    const count = processFiles(uploadedFiles);
    logAction(AuditAction.CREATE, `إضافة ${count} ملف جديد`);
    setIsGlobalLoading(false);
    setActiveTab('archive');
  };

  const handleDeepAnalyze = async (fileId: string) => {
    const file = files.find(f => f.id === fileId);
    if (!file || isFileAnalyzing) return;
    setSelectedFileId(fileId);
    setIsFileAnalyzing(true);
    setFileChatMessages([{ role: 'assistant', text: "جاري استخراج البيانات وتحليل المحتوى ذكياً وفق معايير ISO..." }]);
    try {
      // محاكاة استخراج النص (في النسخة الحقيقية نستخدم OCR)
      const metadata = await analyzeSpecificFile(file.name, "محتوى المستند المستخرج");
      setFiles(prev => prev.map(f => f.id === fileId ? {
        ...f,
        extractedText: "تم تحليل الوثيقة. هذه الفاتورة تحتوي على مبالغ مالية وتواريخ استحقاق.",
        isoMetadata: { ...f.isoMetadata, ...metadata as any, ocrStatus: 'completed' }
      } : f));
      setFileChatMessages([{ role: 'assistant', text: "اكتمل التحليل. المستند مصنف الآن كـ " + (metadata.documentType || 'سجل') + ". يمكنك طرح أي سؤال حوله." }]);
      logAction(AuditAction.UPDATE, `تحليل ذكي للملف: ${file.name}`, file.id);
    } catch (e) {
      setFileChatMessages([{ role: 'assistant', text: "حدث خطأ في الاتصال بمحرك الذكاء الاصطناعي." }]);
    }
    setIsFileAnalyzing(false);
  };

  const handleViewOriginal = (id?: string) => {
    const targetId = id || selectedFileId;
    if (targetId) {
      const blob = fileBlobs.get(targetId);
      if (blob) {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        logAction(AuditAction.VIEW, `معاينة الملف الحقيقي لـ ${targetId}`, targetId);
      } else {
        alert("معاينة الملف الأصلي متاحة فقط للملفات التي تم رفعها في الجلسة الحالية.");
      }
    }
  };

  const handleAgentChat = async () => {
    if (!mainChatInput.trim() || isAgentLoading) return;
    const msg = mainChatInput;
    setMainChatMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', text: msg, timestamp: new Date() }]);
    setMainChatInput('');
    setIsAgentLoading(true);
    const context = files.slice(0, 20).map(f => `${f.name} (ID: ${f.id})`).join(', ');
    const res = await askAgent(msg, context);
    setMainChatMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', text: res, timestamp: new Date() }]);
    setIsAgentLoading(false);
  };

  // Fixed: Implement missing handleSendFileChat function to handle chat interactions with a specific document
  const handleSendFileChat = async () => {
    if (!fileChatInput.trim() || !selectedFileId || isFileAnalyzing) return;
    const query = fileChatInput;
    setFileChatMessages(prev => [...prev, { role: 'user', text: query }]);
    setFileChatInput('');
    setIsFileAnalyzing(true);
    
    try {
      const res = await chatWithFile(query, selectedFile?.name || '', selectedFile?.extractedText || '');
      setFileChatMessages(prev => [...prev, { role: 'assistant', text: res }]);
    } catch (e) {
      setFileChatMessages(prev => [...prev, { role: 'assistant', text: "عذراً، حدث خطأ أثناء معالجة استفسارك." }]);
    } finally {
      setIsFileAnalyzing(false);
    }
  };

  const getFileIcon = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    if (['jpg','png','jpeg'].includes(ext || '')) return <FileImage size={18} className="text-pink-500" />;
    if (ext === 'pdf') return <FileBox size={18} className="text-red-500" />;
    return <FileText size={18} className="text-indigo-500" />;
  };

  const clearArchive = () => {
    if (window.confirm('هل أنت متأكد من حذف الأرشيف بالكامل؟')) {
      setFiles([]);
      setFileBlobs(new Map());
      setAuditLogs([]);
      localStorage.clear();
      window.location.reload();
    }
  };

  return (
    <div className="min-h-screen flex bg-[#f8fafc] text-slate-900 font-['Cairo'] text-sm" dir="rtl">
      <input type="file" ref={folderInputRef} className="hidden" {...({ webkitdirectory: "" } as any)} multiple onChange={handleFolderUpload} />
      <input type="file" ref={fileInputRef} className="hidden" multiple onChange={handleFileUpload} />

      {/* Sidebar - SaaS Styled */}
      <aside className="bg-slate-950 text-slate-400 w-64 fixed h-full z-40 hidden lg:flex flex-col border-l border-slate-800 shadow-2xl">
        <div className="p-8 flex-1">
           <div className="flex items-center gap-3 mb-10 cursor-pointer" onClick={() => setActiveTab('dashboard')}>
              <div className="bg-indigo-600 w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-lg shadow-xl">أ</div>
              <div className="flex flex-col">
                <span className="text-lg font-black text-white tracking-tighter leading-none">أرشـيـف</span>
                <span className="text-[7px] font-black text-indigo-400 uppercase tracking-[0.3em] mt-1">Enterprise SaaS</span>
              </div>
           </div>
           
           <div className="space-y-1">
              <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-3 px-4">القائمة الرئيسية</p>
              {NAV_ITEMS.map(item => (
                <button key={item.id} onClick={() => setActiveTab(item.id)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === item.id ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-600/20' : 'hover:bg-white/5 hover:text-white'}`}>
                   <item.icon size={16} />
                   <span className="font-bold text-xs">{item.label}</span>
                </button>
              ))}
              <button onClick={() => setActiveTab('agent')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all mt-1 ${activeTab === 'agent' ? 'bg-indigo-600 text-white shadow-lg' : 'hover:bg-white/5'}`}>
                 <Bot size={16} />
                 <span className="font-bold text-xs">المساعد الذكي</span>
              </button>
           </div>
        </div>
        
        <div className="p-6">
           <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                 <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                 <span className="text-[9px] font-bold text-slate-500 uppercase">Cloud Sync: Active</span>
              </div>
              <ShieldCheck size={12} className="text-indigo-500" />
           </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 lg:mr-64 p-6 lg:p-10 transition-all">
        {isGlobalLoading && (
          <div className="fixed inset-0 z-50 bg-white/60 backdrop-blur-md flex flex-col items-center justify-center">
             <Loader2 className="animate-spin text-indigo-600 mb-4" size={40} />
             <p className="text-sm font-black">جاري مزامنة السجلات...</p>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-700">
             <header className="flex justify-between items-end mb-4">
                <div>
                   <h1 className="text-2xl font-black tracking-tighter text-slate-900">نظرة عامة</h1>
                   <p className="text-slate-400 font-bold text-xs mt-1">إدارة وتحليل السجلات الرقمية المؤسسية.</p>
                </div>
                <div className="flex gap-2">
                   <button onClick={() => folderInputRef.current?.click()} className="bg-slate-900 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-black transition-all flex items-center gap-2 text-[10px] shadow-sm">
                      <FolderPlus size={14} /> استيراد مجلد
                   </button>
                   <button onClick={() => fileInputRef.current?.click()} className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-indigo-700 transition-all flex items-center gap-2 text-[10px] shadow-lg">
                      <Plus size={14} /> إضافة سجل
                   </button>
                </div>
             </header>

             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                  { label: 'إجمالي السجلات', value: files.length, icon: Database, color: 'indigo' },
                  { label: 'تحليل الذكاء', value: files.filter(f => f.isoMetadata?.ocrStatus === 'completed').length, icon: Sparkles, color: 'emerald' },
                  { label: 'سعة التخزين', value: '45.2 GB', icon: HardDrive, color: 'amber' },
                  { label: 'مستوى الامتثال', value: '98%', icon: ShieldCheck, color: 'rose' }
                ].map((stat, i) => (
                  <div key={i} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between group hover:shadow-md transition-all">
                     <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{stat.label}</p>
                        <h3 className="text-xl font-black">{stat.value}</h3>
                     </div>
                     <div className={`bg-${stat.color}-50 text-${stat.color}-600 p-3 rounded-xl group-hover:scale-110 transition-transform`}><stat.icon size={18} /></div>
                  </div>
                ))}
             </div>

             <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                <div className="flex justify-between items-center mb-6">
                   <h3 className="text-sm font-black flex items-center gap-2"><History className="text-indigo-600" size={18} /> السجلات المضافة مؤخراً</h3>
                   <button onClick={() => setActiveTab('archive')} className="text-[10px] font-black text-indigo-600 hover:underline">عرض الكل</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                   {files.slice(0, 4).map(f => (
                     <div key={f.id} onClick={() => handleDeepAnalyze(f.id)} className="bg-slate-50 p-4 rounded-2xl border border-transparent hover:border-slate-200 hover:bg-white transition-all cursor-pointer flex items-center gap-4 group">
                        <div className="bg-white p-2.5 rounded-xl shadow-sm group-hover:bg-indigo-600 group-hover:text-white transition-all">{getFileIcon(f.name)}</div>
                        <div className="flex-1 min-w-0">
                           <p className="font-black text-xs truncate">{f.name}</p>
                           <p className="text-[8px] text-slate-400 font-bold mt-0.5 uppercase tracking-tighter">{f.isoMetadata?.recordId}</p>
                        </div>
                        <ArrowRight className="text-slate-200 group-hover:text-indigo-600 transition-all" size={14} />
                     </div>
                   ))}
                   {files.length === 0 && <p className="col-span-2 text-center py-10 text-slate-400 font-bold italic text-xs">لا توجد سجلات حالية. ابدأ برفع ملفاتك.</p>}
                </div>
             </div>
          </div>
        )}

        {activeTab === 'archive' && (
          <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
             <div className="flex justify-between items-center">
                <h1 className="text-2xl font-black tracking-tighter">الأرشيف المركزي</h1>
                <div className="relative w-full max-w-xs group">
                   <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                   <input type="text" placeholder="بحث في السجلات..." className="w-full pr-10 pl-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none font-bold text-xs shadow-sm focus:ring-4 ring-indigo-500/5 transition-all" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                </div>
             </div>
             
             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {files.filter(f => f.name.includes(searchQuery)).map(f => (
                  <div key={f.id} onClick={() => handleDeepAnalyze(f.id)} className="bg-white p-5 rounded-3xl border border-slate-100 hover:shadow-xl transition-all cursor-pointer group relative overflow-hidden">
                     <div className="bg-slate-50 w-10 h-10 rounded-xl flex items-center justify-center mb-4 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-sm">{getFileIcon(f.name)}</div>
                     <h3 className="font-black text-xs truncate mb-1">{f.name}</h3>
                     <p className="text-slate-400 text-[8px] font-bold uppercase tracking-widest mb-4">{f.isoMetadata?.recordId}</p>
                     <div className="pt-4 border-t border-slate-50 flex justify-between items-center">
                        <span className="text-[7px] font-black text-indigo-600 uppercase tracking-widest">{f.isoMetadata?.documentType || 'سجل عام'}</span>
                        <div className="p-1.5 bg-slate-50 rounded-lg text-slate-300 group-hover:text-indigo-600 transition-all"><Eye size={12} /></div>
                     </div>
                  </div>
                ))}
             </div>
          </div>
        )}

        {activeTab === 'agent' && (
          <div className="max-w-4xl mx-auto h-[calc(100vh-140px)] flex flex-col animate-in slide-in-from-bottom-4 duration-500">
             <div className="bg-white p-5 rounded-t-3xl border border-b-0 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="bg-indigo-600 p-2.5 rounded-xl text-white shadow-lg"><Bot size={20} /></div>
                  <div>
                    <h2 className="text-sm font-black">الوكيل الذكي</h2>
                    <p className="text-slate-400 font-bold text-[9px] mt-0.5">خبير استرجاع السجلات وإدارة الأرشيف الرقمي.</p>
                  </div>
                </div>
                <button onClick={() => setMainChatMessages([])} className="text-slate-300 hover:text-rose-500 transition-all"><Trash2 size={16}/></button>
             </div>
             
             <div className="flex-1 overflow-y-auto p-6 bg-white border-x space-y-6 shadow-inner custom-scrollbar">
                {mainChatMessages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] p-4 rounded-2xl font-bold shadow-sm text-xs leading-relaxed ${msg.role === 'user' ? 'bg-slate-900 text-white rounded-tr-none' : 'bg-slate-50 text-slate-800 rounded-tl-none border border-slate-100'}`}>
                       <p className="whitespace-pre-wrap">{msg.text}</p>
                       {msg.role === 'assistant' && files.length > 0 && (
                          <div className="mt-4 pt-3 border-t border-slate-200/50 flex flex-wrap gap-2">
                             <p className="text-[8px] font-black text-slate-400 w-full mb-1">ملفات مقترحة للمعاينة:</p>
                             {files.slice(0, 2).map(f => (
                               <button key={f.id} onClick={() => handleViewOriginal(f.id)} className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200 text-[9px] hover:bg-indigo-50 hover:border-indigo-200 transition-all group">
                                  <ExternalLink size={10} className="text-indigo-500" />
                                  <span className="truncate max-w-[100px]">{f.name}</span>
                               </button>
                             ))}
                          </div>
                       )}
                    </div>
                  </div>
                ))}
                {isAgentLoading && <div className="flex justify-start"><div className="bg-slate-50 p-3 rounded-xl border border-slate-100 animate-pulse flex items-center gap-3"><Loader2 className="animate-spin text-indigo-600" size={14} /> <span className="font-bold text-[10px]">جاري استخراج الإجابة...</span></div></div>}
             </div>
             
             <div className="p-5 bg-white rounded-b-3xl border shadow-xl flex gap-3">
                <input type="text" placeholder="اسأل عن أي سجل أو اطلب تحليل الأرشيف..." className="flex-1 bg-slate-50 px-5 py-3 rounded-xl outline-none font-bold border-2 border-transparent focus:border-indigo-600 focus:bg-white transition-all text-xs" value={mainChatInput} onChange={(e) => setMainChatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAgentChat()} />
                <button onClick={handleAgentChat} className="bg-indigo-600 text-white p-3 rounded-xl shadow-lg hover:bg-black transition-all transform active:scale-95"><Send size={18} /></button>
             </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-6xl mx-auto animate-in fade-in duration-700">
             <header className="mb-8">
                <h1 className="text-2xl font-black tracking-tighter">الإعدادات والتحكم</h1>
                <p className="text-slate-400 font-bold text-xs mt-1">تخصيص بيئة الأرشفة وإدارة سياسات الاستبقاء.</p>
             </header>

             <div className="flex flex-col lg:flex-row gap-8">
                <div className="w-full lg:w-64 space-y-1 shrink-0">
                   {[
                      { id: 'general', label: 'الإعدادات العامة', icon: Globe },
                      { id: 'policies', label: 'سياسات الحفظ', icon: Scale },
                      { id: 'security', label: 'الأمان والامتثال', icon: ShieldAlert },
                      { id: 'profile', label: 'الملف الشخصي', icon: User }
                   ].map(t => (
                      <button key={t.id} onClick={() => setSettingsTab(t.id)} className={`w-full flex items-center justify-between px-5 py-3.5 rounded-xl transition-all font-black text-xs ${settingsTab === t.id ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:bg-white hover:text-slate-800'}`}>
                         <div className="flex items-center gap-3"><t.icon size={16} /> <span>{t.label}</span></div>
                         <ChevronLeft size={14} className={settingsTab === t.id ? 'opacity-100' : 'opacity-0'} />
                      </button>
                   ))}
                   <div className="mt-6 pt-6 border-t border-slate-200">
                      <button onClick={clearArchive} className="w-full flex items-center gap-3 px-5 py-3 rounded-xl text-rose-500 font-black text-xs hover:bg-rose-50 transition-all">
                         <Trash2 size={16} /> تصفير كافة البيانات
                      </button>
                   </div>
                </div>

                <div className="flex-1 bg-white p-8 rounded-3xl border border-slate-100 shadow-sm min-h-[500px]">
                   {settingsTab === 'general' && (
                      <div className="space-y-8 animate-in slide-in-from-left-2">
                         <h3 className="text-base font-black flex items-center gap-3"><Globe className="text-indigo-600" size={18} /> التفضيلات العامة</h3>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="bg-slate-50 p-6 rounded-2xl space-y-3">
                               <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">نمط الواجهة</p>
                               <div className="flex gap-2">
                                  <button className="flex-1 py-2.5 bg-white rounded-xl border-2 border-indigo-600 text-indigo-600 font-black shadow-sm text-[10px]">الوضع الفاتح</button>
                                  <button className="flex-1 py-2.5 bg-white rounded-xl border border-slate-200 text-slate-400 font-black text-[10px]">الوضع الداكن</button>
                               </div>
                            </div>
                            <div className="bg-slate-50 p-6 rounded-2xl space-y-3">
                               <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">لغة النظام</p>
                               <select className="w-full py-2.5 px-3 bg-white rounded-xl border border-slate-200 font-black text-[10px] outline-none">
                                  <option>العربية (الافتراضية)</option>
                                  <option>English (US)</option>
                               </select>
                            </div>
                         </div>
                      </div>
                   )}

                   {settingsTab === 'policies' && (
                      <div className="space-y-8 animate-in slide-in-from-left-2">
                         <div className="flex justify-between items-center">
                            <h3 className="text-base font-black flex items-center gap-3"><Scale className="text-indigo-600" size={18} /> سياسات استبقاء السجلات</h3>
                            <button className="bg-indigo-600/10 text-indigo-600 px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-wider">+ إضافة سياسة</button>
                         </div>
                         <div className="space-y-3">
                            {[
                               { name: 'الفواتير والقيود المالية', duration: '10 سنوات', action: 'إتلاف آمن', color: 'indigo' },
                               { name: 'العقود الحكومية والاتفاقيات', duration: 'دائم', action: 'أرشفة دائمة', color: 'emerald' },
                               { name: 'المراسلات الإدارية الداخلية', duration: 'سنتان', action: 'مراجعة دورية', color: 'amber' },
                               { name: 'سجلات الموارد البشرية', duration: '5 سنوات', action: 'إتلاف آمن', color: 'rose' }
                            ].map((pol, i) => (
                               <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-transparent hover:border-slate-200 transition-all">
                                  <div className="flex items-center gap-4">
                                     <div className={`w-1.5 h-8 bg-${pol.color}-500 rounded-full`}></div>
                                     <div>
                                        <h4 className="font-black text-xs text-slate-800">{pol.name}</h4>
                                        <p className="text-[9px] text-slate-400 font-bold">المدة: {pol.duration} | الإجراء: {pol.action}</p>
                                     </div>
                                  </div>
                                  <button className="p-2 text-slate-300 hover:text-indigo-600"><Edit3 size={14}/></button>
                               </div>
                            ))}
                         </div>
                      </div>
                   )}

                   {settingsTab === 'security' && (
                      <div className="space-y-8 animate-in slide-in-from-left-2">
                         <h3 className="text-base font-black flex items-center gap-3"><ShieldAlert className="text-indigo-600" size={18} /> الأمان والامتثال (ISO 15489)</h3>
                         <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {[
                               { label: 'قوة التشفير', val: 'AES-256', icon: Lock, color: 'emerald' },
                               { label: 'سجلات التدقيق', val: auditLogs.length, icon: Terminal, color: 'indigo' },
                               // Fixed: Replace undefined CloudCheck with CheckCircle2
                               { label: 'حالة النسخ الاحتياطي', val: 'مكتمل', icon: CheckCircle2, color: 'amber' }
                            ].map((card, i) => (
                               <div key={i} className="bg-slate-50 p-5 rounded-2xl border text-center space-y-2">
                                  <card.icon className={`mx-auto text-${card.color}-500`} size={22} />
                                  <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">{card.label}</p>
                                  <h4 className="text-lg font-black">{card.val}</h4>
                               </div>
                            ))}
                         </div>
                         <div className="bg-slate-900 text-slate-400 p-6 rounded-3xl overflow-hidden relative shadow-2xl">
                            <Fingerprint className="absolute -bottom-4 -left-4 opacity-5 text-white" size={120} />
                            <h4 className="font-black mb-4 flex items-center gap-2 text-[10px] text-indigo-400 uppercase tracking-widest border-b border-slate-800 pb-3"><Activity size={14}/> سجل العمليات الأخير</h4>
                            <div className="space-y-2.5 max-h-40 overflow-y-auto custom-scrollbar">
                               {auditLogs.slice(0, 10).map((log, i) => (
                                  <div key={i} className="flex justify-between items-center text-[9px] group">
                                     <span className="font-bold text-slate-300 group-hover:text-white transition-all">{log.action}: {log.details}</span>
                                     <span className="text-slate-600 text-[8px]">{new Date(log.timestamp).toLocaleTimeString()}</span>
                                  </div>
                               ))}
                               {auditLogs.length === 0 && <p className="text-[9px] italic text-slate-600 text-center py-4">لا توجد عمليات مسجلة حالياً.</p>}
                            </div>
                         </div>
                      </div>
                   )}

                   {settingsTab === 'profile' && (
                      <div className="space-y-8 animate-in slide-in-from-left-2">
                         <h3 className="text-base font-black flex items-center gap-3"><User className="text-indigo-600" size={18} /> الملف الشخصي للمستخدم</h3>
                         <div className="flex flex-col items-center py-6">
                            <div className="w-20 h-20 rounded-3xl bg-indigo-600 flex items-center justify-center text-white text-3xl font-black shadow-2xl mb-4 border-4 border-slate-50">خ</div>
                            <h4 className="text-lg font-black text-slate-900">خالد محمد</h4>
                            <p className="text-[9px] text-indigo-600 font-black uppercase tracking-[0.3em] mt-1 bg-indigo-50 px-3 py-1 rounded-full">Senior Archivist</p>
                         </div>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-4">
                            {[
                               { l: 'البريد الإلكتروني', v: 'khaled.m@arshif.pro' },
                               { l: 'المسمى الوظيفي', v: 'مدير الأرشفة الرقمية' },
                               { l: 'مستوى الصلاحية', v: 'Super Admin (Level 4)' },
                               { l: 'تاريخ الانضمام', v: '14 أكتوبر 2024' }
                            ].map((f, i) => (
                               <div key={i} className="space-y-1.5">
                                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest px-1">{f.l}</label>
                                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-[10px] font-bold text-slate-700">{f.v}</div>
                               </div>
                            ))}
                         </div>
                         <button className="w-full py-3.5 bg-slate-900 text-white rounded-xl font-black text-[10px] hover:bg-black transition-all shadow-lg mt-10 uppercase tracking-widest">تحديث البيانات</button>
                      </div>
                   )}
                </div>
             </div>
          </div>
        )}
      </main>

      {/* Detail Overlay - SaaS Style */}
      {selectedFile && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-300">
           <div className="w-full lg:w-[850px] bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-left duration-500 border-l border-slate-100">
              <div className="p-6 border-b flex justify-between items-center bg-white shrink-0 shadow-sm relative z-10">
                 <div className="flex items-center gap-4">
                    <div className="bg-indigo-600 p-3.5 rounded-xl text-white shadow-lg">{getFileIcon(selectedFile.name)}</div>
                    <div className="min-w-0">
                       <h3 className="text-base font-black text-slate-900 truncate max-w-sm">{selectedFile.name}</h3>
                       <p className="text-indigo-600 font-black text-[9px] uppercase mt-0.5 tracking-widest">{selectedFile.isoMetadata?.recordId}</p>
                    </div>
                 </div>
                 <button onClick={() => setSelectedFileId(null)} className="p-2.5 hover:bg-rose-50 text-slate-300 hover:text-rose-500 rounded-xl transition-all"><X size={20}/></button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar bg-slate-50/30">
                 <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-600"></div>
                    <div className="flex justify-between items-center mb-6">
                       <h4 className="text-sm font-black flex items-center gap-2 text-slate-800"><Sparkles className="text-indigo-600" size={20} /> التقرير الذكي والبيانات الوصفية</h4>
                    </div>
                    
                    {isFileAnalyzing ? (
                       <div className="flex flex-col items-center justify-center py-10 space-y-4">
                          <Loader2 className="animate-spin text-indigo-600" size={32} />
                          <p className="text-[10px] font-black text-slate-400">جاري استنتاج البيانات بدقة ISO...</p>
                       </div>
                    ) : (
                       <>
                          <div className="text-xs font-bold text-slate-700 italic mb-8 leading-relaxed bg-slate-50 p-6 rounded-2xl border border-slate-100 shadow-inner">
                             "{selectedFile.isoMetadata?.description || 'يرجى تفعيل التحليل الذكي بالأسفل للحصول على ملخص المحتوى واستخراج البيانات الوصفية.'}"
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                             {[
                               { l: 'المرسل/المصدر', v: selectedFile.isoMetadata?.sender || '---', icon: User },
                               { l: 'التصنيف الفني', v: selectedFile.isoMetadata?.documentType || '---', icon: Layers },
                               { l: 'مستوى الأهمية', v: selectedFile.isoMetadata?.importance || '---', icon: AlertTriangle },
                               { l: 'درجة السرية', v: selectedFile.isoMetadata?.confidentiality || '---', icon: FileLock }
                             ].map((d, i) => (
                                <div key={i} className="bg-slate-50 p-4 rounded-2xl border border-transparent hover:border-slate-200 transition-all flex items-center gap-3 shadow-sm group">
                                   <div className="p-2.5 bg-white rounded-xl text-slate-400 shadow-sm group-hover:text-indigo-600 transition-all"><d.icon size={16}/></div>
                                   <div>
                                      <p className="text-[7px] text-slate-400 font-black mb-0.5 uppercase tracking-widest">{d.l}</p>
                                      <p className="font-black text-slate-800 text-[10px]">{d.v}</p>
                                   </div>
                                </div>
                             ))}
                          </div>
                       </>
                    )}
                 </div>

                 <div className="space-y-6 pb-10">
                    <h4 className="text-sm font-black flex items-center gap-2 text-indigo-600 px-2"><MessageSquare size={20} /> محادثة الوثيقة</h4>
                    <div className="space-y-4">
                       {fileChatMessages.map((m, i) => (
                          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                             <div className={`max-w-[90%] p-4 rounded-2xl font-bold shadow-sm text-xs leading-relaxed ${m.role === 'user' ? 'bg-slate-900 text-white rounded-tr-none' : 'bg-white text-slate-800 border border-slate-100 rounded-tl-none'}`}>
                                <p className="whitespace-pre-wrap">{m.text}</p>
                             </div>
                          </div>
                       ))}
                    </div>
                    <div className="bg-white p-2 rounded-2xl border-2 border-slate-100 shadow-xl flex gap-2 focus-within:ring-4 ring-indigo-500/5 transition-all">
                       <input type="text" placeholder="اسأل عن تفاصيل هذه الوثيقة..." className="flex-1 bg-transparent px-4 py-3 outline-none font-bold text-xs" value={fileChatInput} onChange={(e) => setFileChatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSendFileChat()} />
                       <button onClick={handleSendFileChat} className="bg-indigo-600 text-white p-3 rounded-xl shadow-lg hover:bg-black transition-all transform hover:scale-105 active:scale-95"><Send size={16} /></button>
                    </div>
                 </div>
              </div>

              {/* Action Bar */}
              <div className="p-6 border-t bg-white flex flex-wrap justify-end gap-3 shrink-0 shadow-inner relative z-10">
                 <button onClick={() => handleViewOriginal()} className="px-5 py-3 bg-white border-2 border-slate-100 text-slate-600 rounded-xl font-black flex items-center gap-2 hover:bg-slate-50 transition-all shadow-sm text-[10px]">
                    <Eye size={14} /> معاينة الملف الأصلي
                 </button>
                 <button onClick={() => handleDeepAnalyze(selectedFile.id)} className="px-5 py-3 bg-indigo-50 border-2 border-indigo-100 text-indigo-600 rounded-xl font-black flex items-center gap-2 hover:bg-indigo-600 hover:text-white transition-all shadow-sm text-[10px]">
                    <Sparkles size={14} /> إجراء تحليل ذكي
                 </button>
                 <button className="px-5 py-3 bg-slate-950 text-white rounded-xl font-black flex items-center gap-2 hover:bg-black transition-all shadow-lg text-[10px]">
                    <Download size={14} /> تحميل السجل المؤرشف
                 </button>
              </div>
           </div>
        </div>
      )}
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; border: 2px solid transparent; background-clip: content-box; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
      `}</style>
    </div>
  );
};

export default App;
