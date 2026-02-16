import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { 
  FileText, 
  Shield, 
  Clock, 
  AlertCircle, 
  Search, 
  Filter, 
  Plus, 
  MoreVertical,
  X,
  Send,
  Loader2, 
  FileSearch,
  CheckCircle2,
  Download,
  FolderPlus,
  ArrowRight,
  ChevronDown,
  Info,
  Calendar,
  LayoutDashboard,
  Archive,
  Bot,
  Settings as SettingsIcon,
  Tag,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileBox,
  FolderCheck,
  Zap,
  Trash2,
  Database,
  History,
  Sparkles,
  RefreshCw,
  LogOut,
  User,
  Command,
  Activity,
  Layers,
  PlusCircle,
  MinusCircle,
  Edit3,
  HardDrive,
  LayoutGrid,
  List as ListIcon,
  Eye,
  CalendarDays,
  Hash,
  Maximize2,
  Link as LinkIcon,
  Minimize2,
  FileCheck,
  ExternalLink,
  AlertTriangle,
  Scale,
  Play,
  Pause,
  ScanText,
  FileDigit,
  Fingerprint,
  Radio,
  UserCheck,
  Users,
  Briefcase,
  MessageSquare,
  FileSignature,
  Stamp
} from 'lucide-react';
// @ts-ignore
import mammoth from 'mammoth';
// @ts-ignore
import Tesseract from 'tesseract.js';

import { 
  FileRecord, 
  ISOMetadata, 
  ChatMessage, 
  DocumentType, 
  Importance, 
  Confidentiality, 
  ArchiveStatus,
  RetentionPolicy,
  RetentionAction,
  AuditLog,
  AuditAction
} from './types';
import { NAV_ITEMS, STATUS_COLORS, IMPORTANCE_COLORS } from './constants';
import { classifyFileContent, askAgent } from './services/geminiService';

const STORAGE_KEY = 'arshif_records_v1';
const FOLDER_KEY = 'arshif_connected_folder';
const POLICIES_KEY = 'arshif_policies_v1';
const AUDIT_KEY = 'arshif_audit_logs_v1';

const DEFAULT_POLICIES: RetentionPolicy[] = [
  {
    id: 'pol_fin_01',
    name: 'السجلات المالية والضريبية',
    description: 'الاحتفاظ بالفواتير والسجلات المالية لمدة 10 سنوات حسب المتطلبات القانونية.',
    durationMonths: 120,
    action: RetentionAction.DESTROY,
    targetDocTypes: [DocumentType.INVOICE, DocumentType.CONTRACT]
  },
  {
    id: 'pol_corr_01',
    name: 'المراسلات العامة',
    description: 'المراسلات الإدارية العادية تحفظ لمدة سنتين ثم تراجع.',
    durationMonths: 24,
    action: RetentionAction.REVIEW,
    targetDocTypes: [DocumentType.CORRESPONDENCE_IN, DocumentType.CORRESPONDENCE_OUT]
  }
];

const getFileIcon = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'heic'].includes(ext || '')) return <FileImage size={20} className="text-pink-500" />;
  if (['xlsx', 'xls', 'csv'].includes(ext || '')) return <FileSpreadsheet size={20} className="text-emerald-500" />;
  if (['doc', 'docx'].includes(ext || '')) return <FileText size={20} className="text-blue-500" />;
  if (['pdf'].includes(ext || '')) return <FileBox size={20} className="text-red-500" />;
  return <FileText size={20} className="text-slate-400" />;
};

const SidebarSection = ({ title, icon: Icon, children }: { title: string, icon: any, children?: React.ReactNode }) => (
  <div className="mb-8">
    <div className="flex items-center gap-3 px-5 mb-3 text-slate-500">
      <Icon size={16} />
      <span className="text-xs font-bold uppercase tracking-wider">{title}</span>
    </div>
    <div className="space-y-1">{children}</div>
  </div>
);

const DetailCard = ({ label, value, icon: Icon, colorClass = "text-indigo-600" }: { label: string, value?: string | number, icon: any, colorClass?: string }) => (
  <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md hover:border-indigo-100 transition-all group">
    <div className="flex items-center gap-4">
      <div className={`p-3 rounded-2xl bg-slate-50 group-hover:bg-indigo-50 transition-colors ${colorClass}`}>
        <Icon size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-slate-400 font-bold mb-1 uppercase tracking-widest">{label}</p>
        <p className="text-slate-800 text-sm font-black leading-tight break-words">{value || 'غير محدد'}</p>
      </div>
    </div>
  </div>
);

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [connectedFolder, setConnectedFolder] = useState<string | null>(null);
  
  const [messages, setMessages] = useState<ChatMessage[]>([{ id: '1', role: 'assistant', text: 'أهلاً بك، أنا خبير الأرشفة الاستراتيجي. كيف يمكنني مساعدتك اليوم؟', timestamp: new Date() }]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [activeFileContext, setActiveFileContext] = useState<FileRecord | null>(null);

  const [scanProgress, setScanProgress] = useState<{ total: number; current: number; currentFile: string; status: string; }>({ total: 0, current: 0, currentFile: '', status: 'idle' });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFile, setSelectedFile] = useState<FileRecord | null>(null);
  const [filters, setFilters] = useState({ type: '', status: '' });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef(files);
  useEffect(() => { filesRef.current = files; }, [files]);

  useEffect(() => {
    const savedFiles = localStorage.getItem(STORAGE_KEY);
    const savedFolder = localStorage.getItem(FOLDER_KEY);
    if (savedFiles) setFiles(JSON.parse(savedFiles));
    if (savedFolder) setConnectedFolder(savedFolder);
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
    if (connectedFolder) localStorage.setItem(FOLDER_KEY, connectedFolder);
  }, [files, connectedFolder]);

  const filteredFiles = useMemo(() => {
    return files.filter(f => {
      const match = f.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                    f.isoMetadata?.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    f.extractedText?.toLowerCase().includes(searchQuery.toLowerCase());
      return match && (!filters.type || f.isoMetadata?.documentType === filters.type);
    });
  }, [files, searchQuery, filters]);

  const handleOpenInBrowser = (record: FileRecord) => {
    if (!record.preview) return;
    const parts = record.preview.split(',');
    if (parts.length < 2) return;
    const mime = parts[0].match(/:(.*?);/)?.[1] || 'application/octet-stream';
    const bstr = atob(parts[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while(n--) { u8arr[n] = bstr.charCodeAt(n); }
    const blob = new Blob([u8arr], { type: mime });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  const processFileChanges = async (newFiles: File[]) => {
    setScanProgress({ total: newFiles.length, current: 0, currentFile: '', status: 'analyzing' });
    let updatedFileList = [...filesRef.current];
    const archiveSummary = updatedFileList.slice(0, 50).map(f => `[رقم:${f.isoMetadata?.incomingNumber || f.id}] ${f.isoMetadata?.title}`).join(', ');

    for (let f of newFiles) {
      setScanProgress(p => ({ ...p, current: p.current + 1, currentFile: f.name }));
      const reader = new FileReader();
      const content: string = await new Promise((res) => {
        reader.onload = (e) => res(e.target?.result as string);
        reader.readAsDataURL(f);
      });
      
      let extractedText = "";
      if (f.type.includes('image')) {
        const { data: { text } } = await Tesseract.recognize(content, 'ara+eng');
        extractedText = text;
      }

      const metadata = await classifyFileContent(f.name, extractedText || f.name, archiveSummary);
      const record: FileRecord = {
        id: Math.random().toString(36).substr(2, 9),
        name: f.name, size: f.size, type: f.type, lastModified: f.lastModified,
        isProcessing: false, preview: content, extractedText,
        isoMetadata: { ...metadata as any, originalPath: f.name, updatedAt: new Date().toISOString(), createdAt: new Date().toISOString() }
      };
      updatedFileList = [record, ...updatedFileList];
      setFiles([...updatedFileList]);
    }
    setScanProgress(p => ({ ...p, status: 'idle' }));
  };

  const handleManualUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = e.target.files;
    if (!uploadedFiles) return;
    processFileChanges(Array.from(uploadedFiles));
  };

  const handleSendMessage = async (text?: string) => {
    const msg = text || chatInput;
    if (!msg.trim() || isChatLoading) return;
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', text: msg, timestamp: new Date() }]);
    setChatInput('');
    setIsChatLoading(true);
    const summary = files.slice(0, 20).map(f => `[رقم:${f.isoMetadata?.incomingNumber || 'غير محدد'}] موضوع:${f.isoMetadata?.title}`).join('\n');
    const response = await askAgent(msg, summary, activeFileContext?.extractedText || activeFileContext?.name);
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', text: response, timestamp: new Date() }]);
    setIsChatLoading(false);
  };

  const discussFile = (file: FileRecord) => {
    setActiveFileContext(file);
    setActiveTab('agent');
    setSelectedFile(null);
    handleSendMessage(`أريد مناقشة هذا المستند: "${file.isoMetadata?.title || file.name}". يرجى تحليله وربطه بأي معاملات مشابهة في الأرشيف.`);
  };

  return (
    <div className="min-h-screen flex bg-[#fbfcfd] dir-rtl" dir="rtl">
      {/* Sidebar */}
      <aside className="w-80 bg-slate-900 text-slate-300 flex flex-col fixed h-full z-20 shadow-2xl">
        <div className="p-8">
          <div className="flex items-center gap-4 mb-16 group cursor-pointer" onClick={() => setActiveTab('dashboard')}>
            <div className="bg-indigo-600 w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-2xl group-hover:scale-110 transition-transform">أ</div>
            <span className="text-2xl font-black text-white tracking-tighter">أرشـيـف</span>
          </div>
          <SidebarSection title="النظام" icon={LayoutDashboard}>
            {NAV_ITEMS.map(item => (
              <button key={item.id} onClick={() => { setActiveTab(item.id); if(item.id !== 'agent') setActiveFileContext(null); }} className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all mb-2 group ${activeTab === item.id ? 'bg-indigo-600 text-white shadow-xl font-black' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'}`}>
                <item.icon size={20} className={activeTab === item.id ? 'text-white' : 'text-slate-500 group-hover:text-indigo-400'} />
                <span className="text-sm">{item.label}</span>
              </button>
            ))}
          </SidebarSection>
        </div>
      </aside>

      <main className="flex-1 mr-80 p-8">
        {activeTab === 'dashboard' && (
          <div className="space-y-8 animate-in fade-in duration-700">
            <header className="flex justify-between items-end bg-white p-10 rounded-[3rem] border border-slate-100 shadow-xl">
              <div>
                <h1 className="text-5xl font-black text-slate-900 tracking-tight">الأرشفة الذكية</h1>
                <p className="text-slate-500 mt-2 font-bold text-lg">تحليل ومعالجة المستندات بمعايير الجودة العالمية</p>
              </div>
              <label className="bg-slate-900 text-white px-10 py-5 rounded-2xl flex items-center gap-3 cursor-pointer shadow-xl font-black hover:bg-black transition-all">
                <FolderPlus size={22} /> أرشفة مجلد جديد
                <input type="file" multiple webkitdirectory="" className="hidden" onChange={handleManualUpload} />
              </label>
            </header>
            
            {scanProgress.status !== 'idle' && (
              <div className="bg-slate-900 text-white p-10 rounded-[3rem] shadow-2xl">
                <div className="flex items-center gap-6 mb-6">
                  <div className="bg-indigo-600 p-4 rounded-2xl animate-spin"><RefreshCw size={24} /></div>
                  <div className="flex-1">
                    <span className="font-black text-2xl block mb-1">جاري معالجة: {scanProgress.currentFile}</span>
                    <span className="text-indigo-400 text-sm font-bold">تطبيق الذكاء الاصطناعي لفهرسة المستند</span>
                  </div>
                </div>
                <div className="w-full h-4 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: `${(scanProgress.current / scanProgress.total) * 100}%` }}></div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {[
                { label: 'إجمالي السجلات', value: files.length, icon: <FileText className="text-indigo-600"/> },
                { label: 'نصوص مستخرجة', value: files.filter(f => f.extractedText).length, icon: <ScanText className="text-amber-600"/> },
                { label: 'سجلات نشطة', value: files.filter(f => f.isoMetadata?.status === ArchiveStatus.ACTIVE).length, icon: <CheckCircle2 className="text-emerald-600"/> },
                { label: 'عمليات النظام', value: auditLogs.length, icon: <Activity className="text-rose-600"/> },
              ].map((s, i) => (
                <div key={i} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 flex items-center justify-between shadow-sm hover:shadow-xl transition-all group">
                  <div><p className="text-xs text-slate-400 font-black mb-1 uppercase group-hover:text-indigo-400 transition-colors">{s.label}</p><h3 className="text-4xl font-black text-slate-800">{s.value}</h3></div>
                  <div className="bg-slate-50 p-5 rounded-3xl">{s.icon}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'archive' && (
          <div className="space-y-8">
            <header className="flex justify-between items-center bg-white p-10 rounded-[3rem] border border-slate-100 shadow-xl">
              <div>
                <h1 className="text-4xl font-black text-slate-900 tracking-tight">الأرشيف المركزي</h1>
                <p className="text-slate-500 mt-2 font-medium">حوكمة الوثائق والمراسلات</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setViewMode('grid')} className={`p-4 rounded-2xl ${viewMode === 'grid' ? 'bg-indigo-600 text-white' : 'bg-slate-50'}`}><LayoutGrid size={22}/></button>
                <button onClick={() => setViewMode('list')} className={`p-4 rounded-2xl ${viewMode === 'list' ? 'bg-indigo-600 text-white' : 'bg-slate-50'}`}><ListIcon size={22}/></button>
              </div>
            </header>

            <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-lg">
              <div className="relative">
                <Search className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input type="text" placeholder="بحث في الأرشيف..." className="w-full pl-6 pr-16 py-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-slate-800 focus:ring-4 ring-indigo-500/10 transition-all" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              </div>
            </div>

            <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-3 gap-8" : "space-y-4"}>
              {filteredFiles.map(f => (
                <div key={f.id} onClick={() => setSelectedFile(f)} className="bg-white border border-slate-100 rounded-[2.5rem] p-8 hover:shadow-2xl transition-all cursor-pointer group relative">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="bg-slate-50 p-4 rounded-2xl text-slate-500 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-sm">{getFileIcon(f.name)}</div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-black text-slate-800 text-lg truncate group-hover:text-indigo-600 transition-colors">{f.isoMetadata?.title || f.name}</h3>
                      <span className="text-[10px] font-black text-slate-400 block mt-1">رقم: {f.isoMetadata?.incomingNumber || 'بدون رقم'}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-6 pt-6 border-t border-slate-50">
                    <span className="bg-slate-50 text-slate-600 px-3 py-1.5 rounded-xl text-[10px] font-black">{f.isoMetadata?.documentType}</span>
                    <ArrowRight size={18} className="text-slate-300 group-hover:translate-x-[-4px] transition-transform" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'agent' && (
          <div className="h-full flex flex-col space-y-6 animate-in fade-in duration-700">
            <div className="h-[calc(100vh-160px)] flex flex-col bg-white rounded-[3rem] border border-slate-100 shadow-2xl overflow-hidden">
              <div className="p-10 border-b border-slate-100 bg-slate-50/30 flex justify-between items-center">
                <div>
                  <h2 className="text-3xl font-black text-slate-900 tracking-tight">المساعد الاستراتيجي</h2>
                  <p className="text-slate-500 font-bold mt-1">تحليل المعاملات وربط السياقات الإدارية</p>
                </div>
                <div className="bg-indigo-100 p-5 rounded-[2rem] text-indigo-600"><Bot size={36} /></div>
              </div>
              <div className="flex-1 overflow-y-auto p-10 space-y-8 custom-scrollbar">
                {messages.map(m => (
                  <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] p-8 rounded-[2.5rem] shadow-sm text-lg leading-relaxed ${m.role === 'user' ? 'bg-slate-900 text-white rounded-tr-none' : 'bg-white border border-slate-100 rounded-tl-none text-slate-800 font-bold'}`}>
                      <p className="whitespace-pre-wrap">{m.text}</p>
                    </div>
                  </div>
                ))}
                {isChatLoading && <div className="text-indigo-600 font-black animate-pulse flex items-center gap-2 px-4"><Loader2 className="animate-spin" size={20}/> جاري التحليل المعمق...</div>}
              </div>
              <div className="p-8 bg-slate-50/50 border-t border-slate-100">
                <div className="flex gap-4 bg-white p-3 rounded-[1.5rem] border border-slate-200 shadow-inner focus-within:ring-4 ring-indigo-500/10 transition-all">
                  <input type="text" className="flex-1 bg-transparent px-6 py-4 outline-none font-bold text-slate-800 text-lg" placeholder="اسأل عن مستند أو اطلب تحليل سياق..." value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendMessage()} />
                  <button onClick={() => handleSendMessage()} className="bg-indigo-600 text-white px-8 py-4 rounded-xl shadow-lg hover:bg-indigo-700 transition-all font-black flex items-center gap-2"><Send size={20}/> إرسال</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* REFINED PROFESSIONAL DETAIL MODAL */}
      {selectedFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 md:p-12 bg-slate-900/95 backdrop-blur-2xl animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-6xl h-full max-h-[92vh] rounded-[3.5rem] shadow-[0_60px_200px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col border border-white/20 animate-in slide-in-from-bottom-12 duration-700 relative">
            
            {/* Modal Header */}
            <div className="p-8 md:p-10 border-b border-slate-100 flex justify-between items-center bg-slate-50/20 shrink-0">
              <div className="flex items-center gap-8 min-w-0 flex-1">
                <div className="bg-indigo-600 p-6 rounded-3xl text-white shadow-2xl border-4 border-white shrink-0">
                  {getFileIcon(selectedFile.name)}
                </div>
                <div className="min-w-0 flex-1 pr-2">
                  <h3 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight leading-[1.2] whitespace-normal break-words text-wrap">
                    {selectedFile.isoMetadata?.title || selectedFile.name}
                  </h3>
                  <div className="flex flex-wrap items-center gap-4 mt-4">
                    <span className="bg-indigo-50 text-indigo-700 px-4 py-2 rounded-2xl text-[12px] font-black border border-indigo-100 shadow-sm">
                      رقم القيد: {selectedFile.isoMetadata?.recordId}
                    </span>
                    <span className="bg-slate-100 text-slate-600 px-4 py-2 rounded-2xl text-[12px] font-black border border-slate-200">
                      نوع المعاملة: {selectedFile.isoMetadata?.documentType}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex gap-4 shrink-0 self-start mt-2">
                <button onClick={() => setSelectedFile(null)} className="p-4 bg-rose-50 text-rose-600 rounded-2xl hover:bg-rose-100 transition-colors shadow-sm">
                  <X size={32}/>
                </button>
              </div>
            </div>
            
            {/* Modal Body: Focus on Professional Data & Summary */}
            <div className="flex-1 overflow-y-auto p-8 md:p-12 custom-scrollbar bg-white">
              <div className="space-y-12">
                
                {/* 1. Executive Summary (The Highlight Section) */}
                <section className="relative p-1 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-[3.5rem] shadow-2xl">
                  <div className="bg-white p-10 md:p-12 rounded-[3.4rem] overflow-hidden relative">
                    <div className="absolute top-0 left-0 p-8 opacity-5">
                       <Sparkles size={120} className="text-indigo-600" />
                    </div>
                    <div className="flex items-center gap-4 mb-8">
                      <div className="p-3 bg-indigo-50 rounded-2xl text-indigo-600">
                        <FileSignature size={28} />
                      </div>
                      <h4 className="text-2xl font-black text-slate-900 tracking-tight">الملخص التنفيذي للمستند</h4>
                    </div>
                    <div className="text-xl md:text-2xl font-bold text-slate-800 leading-[1.8] text-right break-words whitespace-pre-wrap">
                      {selectedFile.isoMetadata?.description}
                    </div>
                    <div className="mt-8 pt-8 border-t border-slate-100 flex items-center justify-between">
                       <div className="flex items-center gap-3">
                          <Bot size={20} className="text-indigo-600" />
                          <span className="text-xs font-black text-slate-400 uppercase tracking-widest">تحليل ذكي بواسطة Arshif-GPT</span>
                       </div>
                       <button onClick={() => discussFile(selectedFile)} className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black text-sm flex items-center gap-3 hover:bg-black transition-all shadow-xl shadow-indigo-500/20 active:scale-95">
                          <MessageSquare size={18} /> مناقشة هذا الملخص
                       </button>
                    </div>
                  </div>
                </section>

                {/* 2. Correspondence Professional Details Grid */}
                <section>
                   <div className="flex items-center gap-4 mb-8">
                      <div className="p-2 bg-slate-50 rounded-xl text-slate-400">
                        <Layers size={22} />
                      </div>
                      <h4 className="text-xl font-black text-slate-900 tracking-tight">معلومات المراسلة التفصيلية</h4>
                   </div>
                   <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      <DetailCard label="المرسل (الجهة المصدرة)" value={selectedFile.isoMetadata?.sender} icon={User} />
                      <DetailCard label="إلى (المستلم الرئيسي)" value={selectedFile.isoMetadata?.recipient} icon={UserCheck} />
                      <DetailCard label="نسخة إلى (CC)" value={selectedFile.isoMetadata?.cc} icon={Users} colorClass="text-slate-500" />
                      <DetailCard label="التصنيف الإداري" value={selectedFile.isoMetadata?.category} icon={Tag} colorClass="text-amber-600" />
                      <DetailCard label="رقم القيد / الصادر" value={selectedFile.isoMetadata?.outgoingNumber || selectedFile.isoMetadata?.incomingNumber} icon={Hash} colorClass="text-emerald-600" />
                      <DetailCard label="تاريخ الأرشفة" value={new Date(selectedFile.isoMetadata?.createdAt || '').toLocaleDateString('ar-SA')} icon={Calendar} colorClass="text-rose-600" />
                   </div>
                </section>

                {/* 3. Governance & Metadata Section */}
                <section className="bg-slate-50/50 p-10 rounded-[3rem] border border-slate-100">
                   <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                      <div>
                        <p className="text-[10px] text-slate-400 font-bold mb-2 uppercase tracking-widest">السرية</p>
                        <div className="flex items-center gap-2">
                           <Shield size={16} className="text-indigo-600" />
                           <span className="text-sm font-black text-slate-800">{selectedFile.isoMetadata?.confidentiality}</span>
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400 font-bold mb-2 uppercase tracking-widest">الأهمية</p>
                        <div className="flex items-center gap-2">
                           <AlertCircle size={16} className="text-orange-600" />
                           <span className="text-sm font-black text-slate-800">{selectedFile.isoMetadata?.importance}</span>
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400 font-bold mb-2 uppercase tracking-widest">الجهة التابع لها</p>
                        <div className="flex items-center gap-2">
                           <Briefcase size={16} className="text-slate-600" />
                           <span className="text-sm font-black text-slate-800">{selectedFile.isoMetadata?.entity || 'غير محدد'}</span>
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400 font-bold mb-2 uppercase tracking-widest">حجم الملف</p>
                        <div className="flex items-center gap-2">
                           <Database size={16} className="text-slate-400" />
                           <span className="text-sm font-black text-slate-800">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</span>
                        </div>
                      </div>
                   </div>
                </section>

              </div>
            </div>
            
            {/* Modal Footer */}
            <div className="p-8 md:p-10 bg-slate-50 border-t border-slate-100 flex justify-end gap-6 shrink-0">
               <button onClick={() => handleOpenInBrowser(selectedFile)} className="px-10 py-5 bg-white border border-slate-200 text-slate-600 rounded-2xl text-lg font-black flex gap-3 shadow-sm hover:bg-slate-50 transition-all">
                 <ExternalLink size={24} /> فتح المستند الأصلي
               </button>
               <button className="px-16 py-5 bg-slate-900 text-white rounded-2xl text-lg font-black flex gap-3 shadow-2xl hover:bg-black transition-all hover:scale-[1.02] active:scale-95">
                 <Download size={24} /> تحميل النسخة المعتمدة
               </button>
            </div>
          </div>
        </div>
      )}
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 10px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 20px; border: 4px solid transparent; background-clip: content-box; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
        .dir-rtl { direction: rtl; }
      `}</style>
    </div>
  );
};

export default App;