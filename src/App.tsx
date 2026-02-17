
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
  AlertTriangle,
  Scale,
  Play,
  Pause,
  ScanText,
  FileDigit,
  Fingerprint,
  Radio
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
  },
  {
    id: 'pol_perm_01',
    name: 'السياسات والهياكل',
    description: 'الوثائق التأسيسية والسياسات تحفظ بشكل دائم.',
    durationMonths: 1200, 
    action: RetentionAction.ARCHIVE,
    targetDocTypes: [DocumentType.POLICY, DocumentType.REPORT]
  }
];

const getFileIcon = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'heic'].includes(ext || '')) return <FileImage size={20} className="text-pink-500" />;
  if (['xlsx', 'xls', 'csv'].includes(ext || '')) return <FileSpreadsheet size={20} className="text-emerald-500" />;
  if (['doc', 'docx'].includes(ext || '')) return <FileText size={20} className="text-blue-500" />;
  if (['pdf'].includes(ext || '')) return <FileBox size={20} className="text-red-500" />;
  if (['ppt', 'pptx'].includes(ext || '')) return <FileCode size={20} className="text-orange-500" />;
  return <FileText size={20} className="text-slate-400" />;
};

const SidebarSection = ({ title, icon: Icon, children }: { title: string, icon: any, children?: React.ReactNode }) => (
  <div className="mb-8">
    <div className="flex items-center gap-3 px-5 mb-3 text-slate-500">
      <Icon size={16} />
      <span className="text-xs font-bold uppercase tracking-wider">{title}</span>
    </div>
    <div className="space-y-1">
      {children}
    </div>
  </div>
);

const DetailItem = ({ label, value, icon: Icon }: { label: string, value?: string | number, icon: any }) => (
  <div className="flex items-start gap-4">
    <div className="bg-slate-50 p-3 rounded-xl text-slate-400">
      <Icon size={20} />
    </div>
    <div>
      <p className="text-xs text-slate-400 font-bold mb-1">{label}</p>
      <p className="text-slate-800 font-bold">{value || 'غير محدد'}</p>
    </div>
  </div>
);

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [connectedFolder, setConnectedFolder] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [policies, setPolicies] = useState<RetentionPolicy[]>(DEFAULT_POLICIES);

  const [messages, setMessages] = useState<ChatMessage[]>([
     { id: '1', role: 'assistant', text: 'أهلاً بك في "أرشيف". كيف يمكنني مساعدتك في إدارة سجلاتك اليوم؟', timestamp: new Date() }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);

  const [scanProgress, setScanProgress] = useState<{ 
    total: number; 
    current: number; 
    currentFile: string; 
    status: 'idle' | 'scanning' | 'analyzing' | 'reconciling' | 'completed' | 'error';
    summary?: { added: number; modified: number; deleted: number }
  }>({ total: 0, current: 0, currentFile: '', status: 'idle' });
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFile, setSelectedFile] = useState<FileRecord | null>(null);
  const [filters, setFilters] = useState({ type: '', importance: '', confidentiality: '', status: '' });

  const filesRef = useRef(files);
  useEffect(() => { filesRef.current = files; }, [files]);

  useEffect(() => {
    const savedFiles = localStorage.getItem(STORAGE_KEY);
    const savedFolder = localStorage.getItem(FOLDER_KEY);
    const savedPolicies = localStorage.getItem(POLICIES_KEY);
    const savedLogs = localStorage.getItem(AUDIT_KEY);
    if (savedFiles) try { setFiles(JSON.parse(savedFiles)); } catch(e) {}
    if (savedFolder) setConnectedFolder(savedFolder);
    if (savedPolicies) setPolicies(JSON.parse(savedPolicies));
    if (savedLogs) try { setAuditLogs(JSON.parse(savedLogs)); } catch(e) {}
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
    if (connectedFolder) localStorage.setItem(FOLDER_KEY, connectedFolder);
    localStorage.setItem(POLICIES_KEY, JSON.stringify(policies));
    localStorage.setItem(AUDIT_KEY, JSON.stringify(auditLogs));
  }, [files, connectedFolder, policies, auditLogs]);

  const filteredFiles = useMemo(() => {
    return files.filter(f => {
      const matchesSearch = f.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            f.isoMetadata?.title?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = !filters.type || f.isoMetadata?.documentType === filters.type;
      const matchesStatus = !filters.status || f.isoMetadata?.status === filters.status;
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [files, searchQuery, filters]);

  const logAction = (action: AuditAction, details: string, resourceId?: string) => {
    const newLog: AuditLog = {
      id: Date.now().toString(),
      action,
      details,
      user: 'خالد محمد (مسؤول أرشفة)',
      timestamp: new Date().toISOString(),
      resourceId
    };
    setAuditLogs(prev => [newLog, ...prev].slice(0, 1000));
  };

  const handleManualUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Logic for processing files (simplified for brevity)
    logAction(AuditAction.SYNC, "مزامنة يدوية للملفات");
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || isChatLoading) return;
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', text: chatInput, timestamp: new Date() }]);
    setChatInput('');
    setIsChatLoading(true);
    const context = files.slice(0, 10).map(f => f.name).join(', ');
    const responseText = await askAgent(chatInput, context);
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', text: responseText, timestamp: new Date() }]);
    setIsChatLoading(false);
  };

  const clearArchive = () => {
    if (window.confirm('حذف كافة البيانات؟')) {
      setFiles([]);
      localStorage.removeItem(STORAGE_KEY);
      window.location.reload();
    }
  };

  return (
    <div className="min-h-screen flex bg-[#fbfcfd]">
      <aside className="w-80 bg-slate-900 text-slate-300 flex flex-col fixed h-full z-20 shadow-2xl border-l border-slate-800">
        <div className="p-8">
          <div className="flex items-center gap-5 mb-16 cursor-pointer" onClick={() => setActiveTab('dashboard')}>
            <div className="bg-indigo-600 w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-2xl">أ</div>
            <div className="flex flex-col">
              <span className="text-3xl font-black text-white tracking-tighter">أرشـيـف</span>
              <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em] mt-2">Professional</span>
            </div>
          </div>
          <SidebarSection title="النظام" icon={LayoutDashboard}>
            {NAV_ITEMS.map(item => (
              <button key={item.id} onClick={() => setActiveTab(item.id)} className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all mb-1 ${activeTab === item.id ? 'bg-indigo-600 text-white shadow-xl' : 'text-slate-400 hover:bg-slate-800'}`}>
                <item.icon size={20} />
                <span className="text-sm font-bold">{item.label}</span>
              </button>
            ))}
          </SidebarSection>
        </div>
      </aside>

      <main className="flex-1 mr-80 p-8">
        <div className="max-w-[1400px] mx-auto">
          {activeTab === 'dashboard' && (
            <div className="space-y-8 animate-in fade-in duration-700">
              <header className="flex justify-between items-center bg-white p-10 rounded-[3rem] border border-slate-100 shadow-xl">
                <div>
                  <h1 className="text-5xl font-black text-slate-900">لوحة التحكم</h1>
                  <p className="text-slate-400 font-bold mt-2">نظام الأرشفة الذكي لإدارة السجلات الرقمية.</p>
                </div>
                <button onClick={() => clearArchive()} className="p-4 bg-rose-50 text-rose-500 rounded-2xl hover:bg-rose-100 transition-all"><Trash2 size={24} /></button>
              </header>

              <div className="grid grid-cols-4 gap-8">
                {[
                  { label: 'إجمالي السجلات', value: files.length, icon: <Database /> },
                  { label: 'سجلات نشطة', value: files.length, icon: <FileCheck /> },
                  { label: 'الأمان', value: 'ISO', icon: <Shield /> },
                  { label: 'الذكاء', value: 'Gemini', icon: <Zap /> }
                ].map((stat, i) => (
                  <div key={i} className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm flex items-center justify-between group hover:shadow-xl transition-all">
                    <div>
                      <p className="text-xs font-black text-slate-400 uppercase mb-2">{stat.label}</p>
                      <h3 className="text-4xl font-black text-slate-800">{stat.value}</h3>
                    </div>
                    <div className="bg-slate-50 p-5 rounded-2xl text-indigo-600">{stat.icon}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'archive' && (
            <div className="space-y-8 animate-in fade-in duration-700">
               <header className="flex justify-between items-center bg-white p-10 rounded-[3rem] border border-slate-100 shadow-xl">
                  <h1 className="text-4xl font-black">الأرشيف المركزي</h1>
                  <div className="relative w-80">
                     <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                     <input type="text" className="w-full pr-12 pl-4 py-4 bg-slate-50 rounded-xl outline-none" placeholder="بحث..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                  </div>
               </header>
               <div className="grid grid-cols-3 gap-8">
                  {filteredFiles.map(file => (
                    <div key={file.id} onClick={() => setSelectedFile(file)} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-2xl transition-all cursor-pointer group">
                       <div className="bg-slate-50 w-16 h-16 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-indigo-600 group-hover:text-white transition-all">{getFileIcon(file.name)}</div>
                       <h3 className="text-xl font-black text-slate-800 truncate mb-2">{file.name}</h3>
                       <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">{file.isoMetadata?.recordId}</p>
                    </div>
                  ))}
               </div>
            </div>
          )}
        </div>
      </main>

      {selectedFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-4xl rounded-[3.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-10 border-b flex justify-between items-center">
              <div className="flex items-center gap-6">
                <div className="bg-indigo-600 p-5 rounded-2xl text-white">{getFileIcon(selectedFile.name)}</div>
                <div>
                   <h3 className="text-2xl font-black">{selectedFile.name}</h3>
                   <p className="text-indigo-600 font-black text-sm">{selectedFile.isoMetadata?.recordId}</p>
                </div>
              </div>
              <button onClick={() => setSelectedFile(null)} className="p-4 hover:bg-rose-50 rounded-2xl text-slate-400 hover:text-rose-600"><X size={28} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-12 space-y-10">
               <div className="bg-slate-50 p-10 rounded-[2.5rem] border border-slate-200">
                  <h4 className="text-xl font-black mb-6">البيانات الوصفية (ISO 15489)</h4>
                  <div className="grid grid-cols-2 gap-8">
                     <DetailItem label="النوع" value={selectedFile.isoMetadata?.documentType} icon={Layers} />
                     <DetailItem label="الأهمية" value={selectedFile.isoMetadata?.importance} icon={AlertTriangle} />
                     <DetailItem label="السرية" value={selectedFile.isoMetadata?.confidentiality} icon={Shield} />
                     <DetailItem label="تاريخ الإنشاء" value={new Date().toLocaleDateString('ar-SA')} icon={Calendar} />
                  </div>
               </div>
               <div className="space-y-6">
                  <h4 className="text-xl font-black flex items-center gap-3"><Sparkles size={24} className="text-indigo-600" /> تحليل المحتوى الذكي</h4>
                  <p className="text-lg font-bold text-slate-700 leading-relaxed bg-white p-8 rounded-[2rem] border shadow-sm italic">"{selectedFile.isoMetadata?.description || 'لم يتم تحليل المحتوى بعد.'}"</p>
               </div>
            </div>
            <div className="p-10 bg-slate-50/50 border-t flex justify-end gap-4">
               <button className="px-10 py-5 bg-slate-900 text-white rounded-2xl font-black flex items-center gap-3"><Download size={20} /> تحميل السجل</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
