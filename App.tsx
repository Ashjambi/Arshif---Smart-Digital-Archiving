
import React, { useState, useCallback, useMemo, useEffect } from 'react';
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
  HardDrive
} from 'lucide-react';
import { 
  FileRecord, 
  ISOMetadata, 
  ChatMessage, 
  DocumentType, 
  Importance, 
  Confidentiality, 
  ArchiveStatus 
} from './types';
import { NAV_ITEMS, STATUS_COLORS, IMPORTANCE_COLORS } from './constants';
import { classifyFileContent, askAgent } from './services/geminiService';

const STORAGE_KEY = 'arshif_records_v1';
const FOLDER_KEY = 'arshif_connected_folder';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [connectedFolder, setConnectedFolder] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      role: 'assistant',
      text: 'أهلاً بك في "أرشيف". نظامك الذكي جاهز لمساعدتك في فهرسة وإدارة وثائقك المحلية بأمان تامة وفق معايير ISO.',
      timestamp: new Date()
    }
  ]);
  
  const [scanProgress, setScanProgress] = useState<{ 
    total: number; 
    current: number; 
    currentFile: string; 
    status: 'idle' | 'scanning' | 'analyzing' | 'reconciling' | 'completed' | 'error';
    summary?: { added: number; modified: number; deleted: number }
  }>({ total: 0, current: 0, currentFile: '', status: 'idle' });
  
  const [searchQuery, setSearchQuery] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FileRecord | null>(null);

  const [filters, setFilters] = useState({
    type: '',
    importance: '',
    confidentiality: '',
    status: ''
  });

  useEffect(() => {
    const savedFiles = localStorage.getItem(STORAGE_KEY);
    const savedFolder = localStorage.getItem(FOLDER_KEY);
    if (savedFiles) {
      try {
        setFiles(JSON.parse(savedFiles));
      } catch (e) {
        console.error("Failed to load records", e);
      }
    }
    if (savedFolder) setConnectedFolder(savedFolder);
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
    if (connectedFolder) localStorage.setItem(FOLDER_KEY, connectedFolder);
  }, [files, connectedFolder]);

  const filteredFiles = useMemo(() => {
    return files.filter(f => {
      const matchesSearch = !searchQuery || 
        f.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        f.isoMetadata?.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.isoMetadata?.entity.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesType = !filters.type || f.isoMetadata?.documentType === filters.type;
      const matchesImportance = !filters.importance || f.isoMetadata?.importance === filters.importance;
      const matchesConfidentiality = !filters.confidentiality || f.isoMetadata?.confidentiality === filters.confidentiality;
      const matchesStatus = !filters.status || f.isoMetadata?.status === filters.status;

      return matchesSearch && matchesType && matchesImportance && matchesConfidentiality && matchesStatus;
    });
  }, [files, searchQuery, filters]);

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'heic'].includes(ext || '')) return <FileImage size={18} className="text-pink-500" />;
    if (['xlsx', 'xls', 'csv'].includes(ext || '')) return <FileSpreadsheet size={18} className="text-emerald-500" />;
    if (['doc', 'docx'].includes(ext || '')) return <FileText size={18} className="text-blue-500" />;
    if (['pdf'].includes(ext || '')) return <FileBox size={18} className="text-red-500" />;
    if (['ppt', 'pptx'].includes(ext || '')) return <FileCode size={18} className="text-orange-500" />;
    return <FileText size={18} className="text-slate-400" />;
  };

  /**
   * Smart Sync Logic (File Watcher Simulation)
   * This function performs reconciliation between the local state and the folder selection.
   */
  const handleIncrementalSync = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = e.target.files;
    if (!uploadedFiles || uploadedFiles.length === 0) return;

    const fullFileList = Array.from(uploadedFiles) as File[];
    
    // Set folder context if not already set
    if (fullFileList[0].webkitRelativePath) {
      const pathParts = fullFileList[0].webkitRelativePath.split('/');
      if (pathParts.length > 1) setConnectedFolder(pathParts[0]);
    }

    setScanProgress({ 
      total: fullFileList.length, 
      current: 0, 
      currentFile: 'بدء فحص التغييرات...', 
      status: 'reconciling' 
    });

    const newFiles: File[] = [];
    const modifiedFiles: { file: File; existingId: string }[] = [];
    const currentPaths = new Set(fullFileList.map(f => f.webkitRelativePath || f.name));
    
    // 1. Identification Phase: Detect Added and Modified files
    fullFileList.forEach(f => {
      const path = f.webkitRelativePath || f.name;
      const existing = files.find(ef => ef.isoMetadata?.originalPath === path);
      
      if (!existing) {
        newFiles.push(f);
      } else if (existing.size !== f.size || existing.lastModified !== f.lastModified) {
        modifiedFiles.push({ file: f, existingId: existing.id });
      }
    });

    // 2. Identification Phase: Detect Deleted files (not present in current selection)
    const deletedIds = files
      .filter(f => f.isoMetadata?.originalPath.startsWith(connectedFolder || '') && !currentPaths.has(f.isoMetadata!.originalPath))
      .map(f => f.id);

    const totalToProcess = newFiles.length + modifiedFiles.length;
    
    // If no changes, exit gracefully
    if (totalToProcess === 0 && deletedIds.length === 0) {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        text: 'فحص مكتمل: الأرشيف المحلي متطابق تماماً مع المجلد المربوط. لم يتم اكتشاف أي تغييرات.',
        timestamp: new Date()
      }]);
      setScanProgress(prev => ({ ...prev, status: 'completed', currentFile: 'لا توجد تغييرات' }));
      setLastSyncTime(new Date());
      setTimeout(() => setScanProgress(p => ({ ...p, status: 'idle' })), 3000);
      return;
    }

    setScanProgress(prev => ({ 
      ...prev, 
      total: totalToProcess, 
      status: 'analyzing',
      summary: { added: newFiles.length, modified: modifiedFiles.length, deleted: deletedIds.length }
    }));

    // Start with existing files minus deleted ones
    let updatedFileList = files.filter(f => !deletedIds.includes(f.id));
    
    // Processing Queue
    const queue = [
      ...newFiles.map(f => ({ file: f, isNew: true, existingId: null })),
      ...modifiedFiles.map(m => ({ file: m.file, isNew: false, existingId: m.existingId }))
    ];

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      setScanProgress(prev => ({ ...prev, current: i + 1, currentFile: item.file.name }));

      try {
        const fileContent = `اسم الملف: ${item.file.name}, الحجم: ${item.file.size} bytes, المسار: ${item.file.webkitRelativePath}`;
        const metadata = await classifyFileContent(item.file.name, fileContent);
        
        const record: FileRecord = {
          id: item.existingId || Math.random().toString(36).substring(2, 11),
          name: item.file.name,
          size: item.file.size,
          type: item.file.type,
          lastModified: item.file.lastModified,
          isProcessing: false,
          isoMetadata: {
            recordId: item.isNew ? `REC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}` : updatedFileList.find(f => f.id === item.existingId)?.isoMetadata?.recordId || '',
            originalPath: item.file.webkitRelativePath || `/local/${item.file.name}`,
            ...metadata as any,
            updatedAt: new Date().toISOString(),
            createdAt: item.isNew ? new Date().toISOString() : updatedFileList.find(f => f.id === item.existingId)?.isoMetadata?.createdAt
          }
        };

        if (item.isNew) {
          updatedFileList = [record, ...updatedFileList];
        } else {
          updatedFileList = updatedFileList.map(f => f.id === item.existingId ? record : f);
        }
        
        // Progressively update to avoid UI lag with large sets
        setFiles([...updatedFileList]);
      } catch (err) {
        console.error(`Sync error on ${item.file.name}:`, err);
      }
    }

    setScanProgress(prev => ({ ...prev, status: 'completed', currentFile: 'اكتملت المزامنة التراكمية' }));
    setLastSyncTime(new Date());
    
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      role: 'assistant',
      text: `تم تحديث الأرشيف بنجاح. العمليات: إكتشاف (${newFiles.length}) وثائق جديدة، تحديث (${modifiedFiles.length}) سجلات معدلة، وحذف (${deletedIds.length}) من الفهرس.`,
      timestamp: new Date()
    }]);

    setTimeout(() => setScanProgress(p => ({ ...p, status: 'idle' })), 5000);
  };

  const handleSendMessage = async (text?: string) => {
    const messageText = text || chatInput;
    if (!messageText.trim() || isChatLoading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: messageText,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setIsChatLoading(true);

    const context = files
      .filter(f => !f.isProcessing)
      .slice(0, 50)
      .map(f => 
        `[${f.isoMetadata?.recordId}] العنوان: ${f.isoMetadata?.title || f.name}, النوع: ${f.isoMetadata?.documentType}, الجهة: ${f.isoMetadata?.entity}, الأهمية: ${f.isoMetadata?.importance}`
      ).join('\n');

    const responseText = await askAgent(messageText, context);

    const assistantMsg: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      text: responseText,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, assistantMsg]);
    setIsChatLoading(false);
  };

  const clearArchive = () => {
    if (window.confirm('هل أنت متأكد من حذف كافة سجلات الأرشيف المحلي؟ هذا الإجراء لا يمكن التراجع عنه.')) {
      setFiles([]);
      setConnectedFolder(null);
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(FOLDER_KEY);
      window.location.reload();
    }
  };

  const SidebarSection = ({ title, children, icon: Icon }: { title: string, children?: React.ReactNode, icon?: any }) => (
    <div className="mb-8">
      <div className="flex items-center gap-2 px-4 mb-4">
        {Icon && <Icon size={14} className="text-slate-500" />}
        <span className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em]">{title}</span>
      </div>
      <div className="space-y-1">
        {children}
      </div>
    </div>
  );

  const Dashboard = () => (
    <div className="space-y-6 animate-in fade-in duration-700">
      <header className="flex justify-between items-end bg-white p-8 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/50">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-indigo-600 font-black text-xs uppercase tracking-widest">
            <Activity size={14} className="animate-pulse" />
            المراقبة الرقمية النشطة
          </div>
          <h1 className="text-4xl font-black text-slate-800 tracking-tight">ملخص الأرشفة</h1>
          <div className="flex items-center gap-3">
            {connectedFolder ? (
              <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-4 py-1.5 rounded-2xl text-xs font-black border border-emerald-100 shadow-sm">
                <FolderCheck size={16} />
                المجلد المربوط: {connectedFolder}
              </div>
            ) : (
              <div className="text-slate-400 text-sm font-medium flex items-center gap-2">
                <AlertCircle size={14} />
                بانتظار ربط المجلد للمزامنة...
              </div>
            )}
            <div className="flex items-center gap-2 text-indigo-600 bg-indigo-50 px-4 py-1.5 rounded-2xl text-xs font-black border border-indigo-100 shadow-sm">
              <History size={16} />
              آخر تحديث: {lastSyncTime ? lastSyncTime.toLocaleTimeString('ar-SA') : 'لم يتم'}
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={clearArchive}
            className="bg-white border border-slate-200 text-slate-400 hover:text-rose-500 p-4 rounded-2xl transition-all shadow-sm active:scale-95"
            title="حذف الأرشيف"
          >
            <Trash2 size={22} />
          </button>
          <label className="bg-slate-900 hover:bg-black text-white px-8 py-4 rounded-2xl cursor-pointer flex items-center gap-3 transition-all shadow-2xl shadow-slate-900/20 font-black active:scale-95">
            <RefreshCw size={22} />
            مزامنة تراكمية الآن
            <input 
              type="file" 
              webkitdirectory="" 
              {...({ directory: "" } as any)} 
              multiple 
              className="hidden" 
              onChange={handleIncrementalSync} 
            />
          </label>
        </div>
      </header>

      {scanProgress.status !== 'idle' && (
        <div className={`p-8 rounded-[2rem] border transition-all duration-500 shadow-2xl ${scanProgress.status === 'completed' ? 'bg-indigo-900 text-white border-indigo-500' : 'bg-white border-indigo-100 text-slate-800'}`}>
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-2xl shadow-lg ${scanProgress.status === 'completed' ? 'bg-white/10' : 'bg-indigo-50'}`}>
                {scanProgress.status === 'completed' ? <CheckCircle2 size={24} /> : <RefreshCw className="animate-spin text-indigo-600" size={24} />}
              </div>
              <div>
                <span className="font-black text-xl block">
                  {scanProgress.status === 'reconciling' && 'جاري مطابقة التغييرات مع الأرشيف...'}
                  {scanProgress.status === 'analyzing' && 'جاري الفهرسة الذكية للملفات المحدثة...'}
                  {scanProgress.status === 'completed' && 'اكتملت المزامنة بنجاح'}
                </span>
                <span className={`text-sm block mt-1 ${scanProgress.status === 'completed' ? 'text-indigo-200' : 'text-slate-400'} truncate max-w-xl`}>
                  {scanProgress.currentFile}
                </span>
              </div>
            </div>
            {scanProgress.summary && (
              <div className="flex gap-6">
                <div className="text-center group">
                  <div className="flex items-center gap-1.5 text-emerald-500 font-black">
                    <PlusCircle size={14} />
                    <span className="text-2xl">{scanProgress.summary.added}</span>
                  </div>
                  <span className="text-[9px] uppercase font-black opacity-60">جديد</span>
                </div>
                <div className="text-center group">
                  <div className="flex items-center gap-1.5 text-blue-500 font-black">
                    <Edit3 size={14} />
                    <span className="text-2xl">{scanProgress.summary.modified}</span>
                  </div>
                  <span className="text-[9px] uppercase font-black opacity-60">تحديث</span>
                </div>
                <div className="text-center group">
                  <div className="flex items-center gap-1.5 text-rose-500 font-black">
                    <MinusCircle size={14} />
                    <span className="text-2xl">{scanProgress.summary.deleted}</span>
                  </div>
                  <span className="text-[9px] uppercase font-black opacity-60">حذف</span>
                </div>
              </div>
            )}
          </div>
          <div className={`w-full h-4 rounded-full overflow-hidden shadow-inner ${scanProgress.status === 'completed' ? 'bg-indigo-950/50' : 'bg-slate-100'}`}>
            <div 
              className={`h-full transition-all duration-500 shadow-lg ${scanProgress.status === 'completed' ? 'bg-white' : 'bg-indigo-600'}`} 
              style={{ width: scanProgress.total > 0 ? `${(scanProgress.current / scanProgress.total) * 100}%` : '100%' }}
            ></div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { label: 'إجمالي السجلات', value: files.length, icon: <FileText className="text-indigo-600" />, color: 'bg-white' },
          { label: 'سجلات نشطة', value: files.filter(f => f.isoMetadata?.status === ArchiveStatus.ACTIVE).length, icon: <CheckCircle2 className="text-emerald-600" />, color: 'bg-white' },
          { label: 'تنبيهات حرجة', value: files.filter(f => f.isoMetadata?.importance === Importance.CRITICAL).length, icon: <AlertCircle className="text-rose-600" />, color: 'bg-white' },
          { label: 'سري للغاية', value: files.filter(f => f.isoMetadata?.confidentiality === Confidentiality.TOP_SECRET).length, icon: <Shield className="text-amber-600" />, color: 'bg-white' },
        ].map((stat, i) => (
          <div key={i} className={`${stat.color} p-6 rounded-[1.5rem] border border-slate-100 flex items-center justify-between group hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-default shadow-sm shadow-slate-200/50`}>
            <div>
              <p className="text-xs text-slate-400 mb-1 font-black uppercase tracking-widest">{stat.label}</p>
              <h3 className="text-3xl font-black text-slate-800 tracking-tighter">{stat.value}</h3>
            </div>
            <div className="bg-slate-50 p-4 rounded-2xl group-hover:scale-110 group-hover:bg-indigo-50 transition-all">
              {stat.icon}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
          <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
            <h3 className="font-black text-slate-800 flex items-center gap-2">
              <History size={20} className="text-indigo-600" />
              آخر الوثائق المؤرشفة في المجلد المربوط
            </h3>
            <button className="text-indigo-600 text-sm font-black hover:underline" onClick={() => setActiveTab('archive')}>مشاهدة كامل الأرشيف</button>
          </div>
          <div className="divide-y divide-slate-50">
            {files.length === 0 ? (
              <div className="p-24 text-center space-y-6">
                <div className="bg-slate-50 w-24 h-24 rounded-[2rem] flex items-center justify-center mx-auto text-slate-300 shadow-inner">
                  <Archive size={48} />
                </div>
                <div>
                  <p className="text-slate-600 font-black text-lg">الأرشيف المحلي فارغ</p>
                  <p className="text-slate-400 text-sm mt-2 max-w-sm mx-auto">اربط مجلداً محلياً للبدء في سحب وفهرسة ملفاتك بشكل دائم وآمن.</p>
                </div>
              </div>
            ) : (
              files.slice(0, 10).map(file => (
                <div key={file.id} className="p-5 flex items-center justify-between hover:bg-slate-50 transition-all group cursor-pointer" onClick={() => setSelectedFile(file)}>
                  <div className="flex items-center gap-5">
                    <div className="bg-white p-3 rounded-2xl text-slate-500 shadow-sm border border-slate-100 group-hover:border-indigo-100 group-hover:shadow-indigo-100 transition-all">
                      {file.isProcessing ? <Loader2 size={22} className="animate-spin text-indigo-500" /> : getFileIcon(file.name)}
                    </div>
                    <div>
                      <h4 className="font-black text-slate-800 text-sm truncate max-w-[350px] group-hover:text-indigo-600 transition-colors">{file.isoMetadata?.title || file.name}</h4>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded-lg font-black text-slate-500 border border-slate-200">{file.isoMetadata?.recordId || 'PENDING'}</span>
                        <span className="text-[10px] text-slate-400 font-bold">• {file.isoMetadata?.documentType || 'جاري المعالجة...'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <span className={`px-4 py-1.5 rounded-xl text-[10px] font-black shadow-sm border ${STATUS_COLORS[file.isoMetadata?.status as keyof typeof STATUS_COLORS] || 'bg-slate-100'}`}>
                      {file.isoMetadata?.status || 'جاري التحليل'}
                    </span>
                    <ArrowRight size={20} className="text-slate-300 group-hover:text-indigo-500 transition-all opacity-0 group-hover:opacity-100 -translate-x-4 group-hover:translate-x-0" />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-8">
          <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 p-6">
            <h3 className="font-black text-slate-800 mb-6 flex items-center gap-2">
              <Zap size={20} className="text-indigo-600" />
              حالة التخزين والأمان
            </h3>
            <div className="space-y-4">
              <div className="p-5 bg-indigo-50 rounded-[1.5rem] border border-indigo-100 flex items-center gap-4">
                <Database className="text-indigo-600" size={32} />
                <div>
                  <p className="text-xs font-black text-indigo-700 uppercase tracking-widest">تخزين السجلات</p>
                  <p className="text-sm text-indigo-900 font-bold">تم حفظ {files.length} سجلاً محلياً في المتصفح.</p>
                </div>
              </div>
              <div className="p-5 bg-emerald-50 rounded-[1.5rem] border border-emerald-100 flex items-center gap-4">
                <Shield className="text-emerald-600" size={32} />
                <div>
                  <p className="text-xs font-black text-emerald-700 uppercase tracking-widest">خصوصية البيانات</p>
                  <p className="text-sm text-emerald-900 font-bold">البيانات مشفرة ومخزنة في جهازك فقط.</p>
                </div>
              </div>
              
              <div className="pt-2">
                 <button onClick={clearArchive} className="w-full py-4 text-xs font-black text-rose-500 hover:bg-rose-50 rounded-2xl transition-all border border-dashed border-rose-200">تفريغ قاعدة البيانات المحلية</button>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white overflow-hidden relative group shadow-2xl shadow-slate-900/40">
            <div className="relative z-10">
              <div className="bg-white/10 w-16 h-16 rounded-[1.5rem] flex items-center justify-center mb-6 backdrop-blur-2xl border border-white/10">
                <Bot size={32} className="text-indigo-400" />
              </div>
              <h4 className="font-black text-2xl mb-3 tracking-tighter">موظف الأرشفة الآلي</h4>
              <p className="text-slate-400 text-sm leading-relaxed mb-8 font-medium">قمت بمراجعة الـ {files.length} وثيقة الموجودة في أرشيفك. اسألني عن أي محتوى أو ملخص.</p>
              <button 
                onClick={() => setActiveTab('agent')}
                className="w-full bg-indigo-600 text-white py-4 rounded-2xl text-sm font-black hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-600/20 active:scale-95 flex items-center justify-center gap-2"
              >
                بدء المحادثة الذكية
                <ArrowRight size={18} />
              </button>
            </div>
            <Bot size={120} className="absolute -bottom-10 -left-10 text-indigo-500/10 rotate-12" />
          </div>
        </div>
      </div>
    </div>
  );

  const ArchiveView = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-700">
      <header className="flex justify-between items-center bg-white p-8 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/50">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">الأرشيف المحلي المركزي</h1>
          <p className="text-slate-400 text-sm mt-1 font-medium">إدارة كافة السجلات المستخلصة والمحفوظة في جهازك</p>
        </div>
        <div className="flex gap-4">
          <div className="relative group">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" size={20} />
            <input 
              type="text" 
              placeholder="بحث شامل في العناوين والجهات..." 
              className="pr-12 pl-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl w-96 focus:ring-4 focus:ring-indigo-500/10 focus:outline-none text-sm transition-all focus:bg-white focus:border-indigo-200 font-bold text-slate-800"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button className="p-4 bg-white border border-slate-100 rounded-2xl text-slate-600 hover:bg-slate-50 transition-all shadow-sm active:scale-95">
            <Filter size={20} />
          </button>
        </div>
      </header>

      <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-right">
            <thead className="bg-slate-50/50 border-b border-slate-100 text-slate-400 text-[10px] font-black uppercase tracking-[0.15em]">
              <tr>
                <th className="p-6">اسم المستند والسجل</th>
                <th className="p-6">رقم السجل</th>
                <th className="p-6">الجهة والنوع</th>
                <th className="p-6">الأهمية / السرية</th>
                <th className="p-6">دورة الحياة</th>
                <th className="p-6">الحالة</th>
                <th className="p-6 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredFiles.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-32 text-center">
                    <div className="flex flex-col items-center gap-6">
                      <div className="bg-slate-50 p-8 rounded-[2.5rem] shadow-inner">
                        <FileSearch size={48} className="text-slate-300" />
                      </div>
                      <div>
                        <p className="text-slate-600 font-black text-xl">لا توجد سجلات مطابقة في الذاكرة المحلية</p>
                        <p className="text-slate-400 text-sm mt-2">جرب تحديث المجلد المربوط لمزامنة ملفات جديدة.</p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredFiles.map(file => (
                  <tr key={file.id} className="hover:bg-slate-50/70 transition-all group cursor-pointer" onClick={() => setSelectedFile(file)}>
                    <td className="p-6">
                      <div className="flex items-center gap-4">
                        <div className="bg-white p-3 rounded-2xl text-slate-500 shadow-sm border border-slate-100 group-hover:scale-110 transition-transform">
                          {getFileIcon(file.name)}
                        </div>
                        <div className="max-w-[250px]">
                          <div className="font-black text-slate-800 text-sm truncate group-hover:text-indigo-600 transition-colors">{file.isoMetadata?.title || file.name}</div>
                          <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1 font-bold">
                            <Calendar size={12} />
                            {new Date(file.isoMetadata?.createdAt || Date.now()).toLocaleDateString('ar-SA')}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-6 font-mono text-[11px] font-black text-slate-400 group-hover:text-indigo-400 transition-colors">{file.isoMetadata?.recordId}</td>
                    <td className="p-6">
                      <div className="text-sm font-black text-slate-700">{file.isoMetadata?.entity || '-'}</div>
                      <div className="text-[10px] bg-slate-100 inline-block px-2 py-0.5 rounded-lg text-slate-500 mt-1.5 font-bold border border-slate-200">
                        {file.isoMetadata?.documentType}
                      </div>
                    </td>
                    <td className="p-6">
                      <div className="flex items-center gap-3">
                        <span className={`text-[11px] font-black ${IMPORTANCE_COLORS[file.isoMetadata?.importance as keyof typeof IMPORTANCE_COLORS]}`}>
                          {file.isoMetadata?.importance}
                        </span>
                        <span className="text-slate-200">|</span>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-600 font-black">
                          <Shield size={14} className={file.isoMetadata?.confidentiality === Confidentiality.TOP_SECRET ? 'text-rose-500 fill-rose-500' : 'text-slate-300'} />
                          {file.isoMetadata?.confidentiality}
                        </div>
                      </div>
                    </td>
                    <td className="p-6">
                      <div className="text-[11px] text-slate-600 font-bold">
                        <span className="text-slate-400 font-black">الاحتفاظ: </span>
                        {file.isoMetadata?.retentionPolicy || 'غير محدد'}
                      </div>
                      {file.isoMetadata?.expiryDate && (
                        <div className="text-[10px] text-rose-600 font-black mt-1.5 flex items-center gap-1 animate-pulse">
                          <Clock size={12} />
                          ينتهي: {file.isoMetadata?.expiryDate}
                        </div>
                      )}
                    </td>
                    <td className="p-6">
                      <span className={`px-4 py-2 rounded-xl text-[10px] font-black shadow-sm border ${STATUS_COLORS[file.isoMetadata?.status as keyof typeof STATUS_COLORS] || 'bg-slate-100'}`}>
                        {file.isoMetadata?.status || 'جاري التحليل'}
                      </span>
                    </td>
                    <td className="p-6">
                      <div className="flex justify-center gap-2">
                        <button onClick={(e) => {e.stopPropagation();}} className="p-3 text-slate-400 hover:bg-white hover:text-indigo-600 rounded-xl transition-all shadow-sm border border-transparent hover:border-slate-100 active:scale-90"><Download size={18} /></button>
                        <button onClick={(e) => {e.stopPropagation();}} className="p-3 text-slate-400 hover:bg-white hover:text-slate-600 rounded-xl transition-all shadow-sm border border-transparent hover:border-slate-100 active:scale-90"><MoreVertical size={18} /></button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const AgentView = () => (
    <div className="h-[calc(100vh-64px)] flex flex-col bg-white rounded-[2.5rem] shadow-[0_30px_100px_rgba(0,0,0,0.1)] border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-500">
      <header className="p-6 border-b border-slate-100 flex items-center justify-between bg-white relative z-10 shadow-sm">
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 bg-indigo-600 rounded-[1.5rem] flex items-center justify-center text-white shadow-2xl shadow-indigo-100 border-4 border-white">
            <Bot size={32} />
          </div>
          <div>
            <h3 className="font-black text-slate-800 text-xl tracking-tight">الوكيل الذكي (خبير أرشفة ISO)</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <p className="text-xs text-emerald-600 font-black uppercase tracking-widest">متصل ومطلع على {files.length} سجل بدقة دلالية</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
           <button className="text-slate-400 p-3 hover:bg-slate-50 rounded-2xl transition-all hover:text-indigo-600 active:scale-90"><SettingsIcon size={24} /></button>
           <button onClick={() => setActiveTab('dashboard')} className="text-slate-400 p-3 hover:bg-slate-50 rounded-2xl transition-all hover:text-rose-600 active:scale-90"><X size={24} /></button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-slate-50/30 custom-scrollbar">
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}>
            <div className={`max-w-[80%] group relative ${msg.role === 'user' ? 'order-1' : 'order-2'}`}>
              <div className={`p-6 rounded-[2rem] shadow-sm transition-all hover:shadow-md ${
                msg.role === 'user' 
                  ? 'bg-indigo-700 text-white rounded-br-none shadow-indigo-200' 
                  : 'bg-white text-slate-900 border border-slate-100 rounded-bl-none'
              }`}>
                <p className={`text-base leading-relaxed whitespace-pre-wrap font-bold ${msg.role === 'user' ? 'text-white' : 'text-slate-900'}`}>
                  {msg.text}
                </p>
              </div>
              <div className={`flex items-center gap-3 mt-3 px-2 ${msg.role === 'user' ? 'flex-row' : 'flex-row-reverse'}`}>
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">
                  {msg.timestamp.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
                </p>
                {msg.role === 'assistant' && <div className="bg-emerald-50 text-emerald-600 p-1 rounded-lg border border-emerald-100"><CheckCircle2 size={12} /></div>}
              </div>
            </div>
          </div>
        ))}
        {isChatLoading && (
          <div className="flex justify-end">
            <div className="bg-white p-6 rounded-[2rem] shadow-lg border border-slate-100 flex items-center gap-4 animate-in fade-in slide-in-from-bottom-4">
              <div className="flex gap-1.5">
                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce"></div>
              </div>
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-indigo-500 animate-pulse" />
                <span className="text-sm text-slate-600 font-black tracking-widest uppercase">جاري البحث الدلالي في الأرشيف...</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <footer className="p-8 bg-white border-t border-slate-100">
        <div className="max-w-4xl mx-auto">
          <div className="flex gap-2 mb-6 overflow-x-auto pb-2 no-scrollbar scroll-smooth">
            {[
              "لخص أهم الوثائق المضافة اليوم",
              "هل هناك ملفات ناقصة البيانات؟",
              "ما هي أهم العقود النشطة؟",
              "تحليل الجهات الأكثر ذكراً",
              "إظهار ملفات PDF السرية"
            ].map(suggest => (
              <button 
                key={suggest}
                onClick={() => handleSendMessage(suggest)}
                className="whitespace-nowrap bg-white text-slate-600 px-5 py-2.5 rounded-2xl text-[11px] font-black hover:bg-indigo-600 hover:text-white transition-all border border-slate-200 shadow-sm hover:shadow-indigo-100 hover:border-indigo-600"
              >
                {suggest}
              </button>
            ))}
          </div>
          <div className="flex gap-4 relative">
            <input 
              type="text" 
              placeholder="اسأل الوكيل عن أي وثيقة في قاعدة بياناتك المحلية..."
              className="flex-1 py-5 pr-16 pl-8 bg-slate-50 border border-slate-200 rounded-3xl focus:ring-4 focus:ring-indigo-500/10 focus:outline-none text-base transition-all focus:bg-white focus:border-indigo-200 shadow-inner font-bold text-slate-900"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            />
            <button 
              onClick={() => handleSendMessage()}
              disabled={isChatLoading || !chatInput.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-12 h-12 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white rounded-[1rem] flex items-center justify-center transition-all shadow-xl shadow-indigo-600/20 active:scale-95"
            >
              <Send size={22} className="rotate-180" />
            </button>
          </div>
        </div>
      </footer>
    </div>
  );

  const navItems = [
    { id: 'dashboard', label: 'لوحة التحكم', icon: LayoutDashboard },
    { id: 'archive', label: 'الأرشيف المركزي', icon: Archive },
    { id: 'agent', label: 'المساعد الذكي', icon: Bot },
  ];

  return (
    <div className="min-h-screen flex bg-[#fbfcfd] selection:bg-indigo-100 selection:text-indigo-900">
      {/* PROFESSIONAL SINGLE-USER SaaS SIDEBAR */}
      <aside className="w-80 bg-slate-900 text-slate-300 flex flex-col fixed h-full z-20 shadow-[25px_0_50px_-15px_rgba(0,0,0,0.3)] border-l border-slate-800 transition-all duration-300">
        
        {/* Brand Header */}
        <div className="p-8">
          <div className="flex items-center gap-4 mb-12 px-2 group cursor-default">
            <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 w-11 h-11 rounded-xl flex items-center justify-center text-white font-black text-xl shadow-[0_0_20px_rgba(79,70,229,0.3)] border border-indigo-400/20 transition-transform">A</div>
            <div className="flex flex-col">
              <span className="text-2xl font-black text-white tracking-tighter leading-none">أرشـيـــــف</span>
              <span className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.3em] mt-1.5">Local Intel System</span>
            </div>
          </div>

          {/* Core Navigation */}
          <SidebarSection title="النظام الأساسي">
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl transition-all group ${
                  activeTab === item.id 
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/30 font-black' 
                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100'
                }`}
              >
                <div className="flex items-center gap-3">
                  <item.icon size={18} className={activeTab === item.id ? 'text-white' : 'text-slate-500 group-hover:text-indigo-400 transition-colors'} />
                  <span className="text-sm">{item.label}</span>
                </div>
                {activeTab === item.id && <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />}
              </button>
            ))}
          </SidebarSection>

          {/* Monitoring Status (The File Watcher UI) */}
          <SidebarSection title="مراقب المجلدات" icon={Activity}>
             <div className="px-4 py-4 bg-slate-800/20 rounded-2xl border border-slate-700/30 space-y-4">
                <div className="flex items-center justify-between">
                   <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${connectedFolder ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`}></div>
                      <span className="text-[10px] font-black text-slate-300">مراقبة: {connectedFolder || 'غير نشط'}</span>
                   </div>
                   {scanProgress.status !== 'idle' && <Loader2 size={12} className="animate-spin text-indigo-400" />}
                </div>
                
                <div className="flex items-center gap-3 bg-slate-900/40 p-3 rounded-xl border border-slate-800">
                   <HardDrive size={16} className="text-indigo-500" />
                   <div className="flex flex-col">
                      <span className="text-[9px] text-slate-500 font-black uppercase">إجمالي السجلات</span>
                      <span className="text-xs font-black text-white">{files.length}</span>
                   </div>
                </div>

                <label className="w-full flex items-center justify-center gap-3 py-2.5 text-[10px] font-black text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-all cursor-pointer group shadow-lg shadow-indigo-900/20">
                   <RefreshCw size={12} className="group-hover:rotate-180 transition-transform duration-500" />
                   تحديث الفهرس (Watcher)
                   <input 
                      type="file" webkitdirectory="" {...({ directory: "" } as any)} multiple className="hidden" 
                      onChange={handleIncrementalSync} 
                   />
                </label>
             </div>
          </SidebarSection>

          {/* Smart Filters Group */}
          <SidebarSection title="فلترة الوثائق" icon={Filter}>
             <div className="space-y-4 px-1">
                <div className="space-y-2">
                   <div className="flex justify-between items-center px-1">
                      <span className="text-[10px] text-slate-600 font-black uppercase tracking-widest">التصنيف</span>
                      <Layers size={10} className="text-slate-700" />
                   </div>
                   <div className="flex flex-wrap gap-1.5">
                      {Object.values(DocumentType).slice(0, 4).map(type => (
                        <button 
                          key={type}
                          onClick={() => setFilters(f => ({ ...f, type: f.type === type ? '' : type }))}
                          className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${filters.type === type ? 'bg-indigo-600 text-white' : 'bg-slate-800/40 text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}
                        >
                          {type}
                        </button>
                      ))}
                   </div>
                </div>
             </div>
          </SidebarSection>
        </div>

        {/* Unified User Info & Controls (Single User Mode) */}
        <div className="mt-auto p-6 bg-slate-950/50 border-t border-slate-800/50">
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-3 px-2">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 font-black border border-indigo-500/20 shadow-inner">KM</div>
              <div className="flex flex-col">
                <span className="text-xs font-black text-white">خالد محمد</span>
                <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest mt-1">مسؤول الأرشفة</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button 
                onClick={() => setActiveTab('settings')}
                className={`flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black transition-all border ${
                  activeTab === 'settings' 
                    ? 'bg-indigo-600 text-white border-transparent' 
                    : 'bg-slate-800/40 text-slate-400 border-slate-700/50 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <SettingsIcon size={14} />
                الإعدادات
              </button>
              <button 
                className="flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black bg-slate-800/40 text-slate-400 hover:bg-rose-900/30 hover:text-rose-400 transition-all border border-slate-700/50"
                onClick={() => window.location.reload()}
              >
                <LogOut size={14} />
                خروج
              </button>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 mr-80 p-10 transition-all duration-500">
        <div className="max-w-[1400px] mx-auto">
          {activeTab === 'dashboard' && <Dashboard />}
          {activeTab === 'archive' && <ArchiveView />}
          {activeTab === 'agent' && <AgentView />}
          {activeTab === 'settings' && (
            <div className="bg-white p-24 rounded-[3rem] text-center shadow-2xl shadow-slate-200/50 border border-slate-100 flex flex-col items-center gap-8 animate-in zoom-in-95 duration-500">
              <div className="w-24 h-24 bg-rose-50 rounded-[2.5rem] flex items-center justify-center text-rose-500 shadow-inner">
                <SettingsIcon size={48} />
              </div>
              <div className="space-y-3">
                <h3 className="text-3xl font-black text-slate-800 tracking-tight">إعدادات النظام</h3>
                <p className="text-slate-400 max-w-md mx-auto leading-relaxed">تحكم في قاعدة بياناتك المحلية وخيارات الأرشفة الذكية لحسابك.</p>
              </div>
              <div className="flex gap-4">
                <button onClick={clearArchive} className="bg-rose-600 text-white px-8 py-4 rounded-[1.25rem] font-black shadow-xl shadow-rose-600/20 active:scale-95 transition-all">مسح كافة البيانات المؤرشفة</button>
                <button onClick={() => setActiveTab('dashboard')} className="bg-slate-100 text-slate-600 px-8 py-4 rounded-[1.25rem] font-black hover:bg-slate-200 active:scale-95 transition-all">العودة للرئيسية</button>
              </div>
            </div>
          )}
        </div>
      </main>

      {selectedFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-8 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-3xl rounded-[3rem] shadow-2xl overflow-hidden animate-in slide-in-from-bottom-12 duration-500 border border-slate-100">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/40">
              <div className="flex items-center gap-5">
                <div className="bg-indigo-600 p-4 rounded-[1.25rem] text-white shadow-xl shadow-indigo-100 border-2 border-white">
                   {getFileIcon(selectedFile.name)}
                </div>
                <div>
                  <h3 className="font-black text-slate-800 text-xl tracking-tight">مراجعة وثيقة مؤرشفة</h3>
                  <p className="text-xs text-indigo-500 font-black mt-1 uppercase tracking-widest">{selectedFile.isoMetadata?.recordId}</p>
                </div>
              </div>
              <button onClick={() => setSelectedFile(null)} className="p-3 hover:bg-white rounded-2xl transition-all text-slate-400 hover:text-rose-500 active:scale-90"><X size={24} /></button>
            </div>
            <div className="p-10 grid grid-cols-2 gap-10 overflow-y-auto max-h-[75vh] custom-scrollbar">
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 border-r-2 border-indigo-500 pr-2">اسم السجل</label>
                  <input type="text" defaultValue={selectedFile.isoMetadata?.title} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3 text-sm font-black text-slate-800 focus:ring-4 focus:ring-indigo-500/5 focus:outline-none transition-all" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 border-r-2 border-indigo-500 pr-2">نوع الوثيقة</label>
                  <select className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3 text-sm font-black text-slate-800 focus:ring-4 focus:ring-indigo-500/5 focus:outline-none transition-all appearance-none cursor-pointer">
                    {Object.values(DocumentType).map(v => <option key={v} value={v} selected={v === selectedFile.isoMetadata?.documentType}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 border-r-2 border-indigo-500 pr-2">الجهة المعنية</label>
                  <input type="text" defaultValue={selectedFile.isoMetadata?.entity} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3 text-sm font-black text-slate-800 focus:ring-4 focus:ring-indigo-500/5 focus:outline-none transition-all" />
                </div>
              </div>
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 border-r-2 border-indigo-500 pr-2">تصنيف الأهمية</label>
                  <select className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3 text-sm font-black text-slate-800 focus:ring-4 focus:ring-indigo-500/5 focus:outline-none transition-all appearance-none cursor-pointer">
                    {Object.values(Importance).map(v => <option key={v} value={v} selected={v === selectedFile.isoMetadata?.importance}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 border-r-2 border-indigo-500 pr-2">مستوى السرية</label>
                  <select className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3 text-sm font-black text-slate-800 focus:ring-4 focus:ring-indigo-500/5 focus:outline-none transition-all appearance-none cursor-pointer">
                    {Object.values(Confidentiality).map(v => <option key={v} value={v} selected={v === selectedFile.isoMetadata?.confidentiality}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 border-r-2 border-indigo-500 pr-2">سياسة الحفظ</label>
                  <input type="text" defaultValue={selectedFile.isoMetadata?.retentionPolicy} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3 text-sm font-black text-slate-800 focus:ring-4 focus:ring-indigo-500/5 focus:outline-none transition-all" />
                </div>
              </div>
              <div className="col-span-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 border-r-2 border-indigo-500 pr-2">تحليل الوكيل الرقمي</label>
                <textarea rows={4} defaultValue={selectedFile.isoMetadata?.description} className="w-full bg-slate-50 border border-slate-200 rounded-3xl px-6 py-4 text-sm font-medium text-slate-700 leading-relaxed focus:ring-4 focus:ring-indigo-500/5 focus:outline-none transition-all shadow-inner text-slate-800"></textarea>
              </div>
            </div>
            <div className="p-8 bg-slate-50 border-t border-slate-100 flex justify-end gap-4 shadow-inner">
              <button onClick={() => setSelectedFile(null)} className="px-8 py-3.5 text-sm font-black text-slate-600 hover:bg-white rounded-2xl transition-all">إغلاق</button>
              <button onClick={() => {
                setSelectedFile(null);
              }} className="px-12 py-3.5 bg-slate-900 text-white rounded-2xl text-sm font-black shadow-2xl shadow-slate-900/20 hover:bg-black transition-all active:scale-95">تحديث السجل</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 20px; border: 2px solid transparent; background-clip: content-box; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; border: 2px solid transparent; background-clip: content-box; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      <div className="fixed top-0 right-0 -z-10 w-[1000px] h-[1000px] bg-indigo-50/40 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/2 animate-pulse"></div>
      <div className="fixed bottom-0 left-0 -z-10 w-[800px] h-[800px] bg-slate-100/50 rounded-full blur-[100px] translate-y-1/2 -translate-x-1/2"></div>
    </div>
  );
};

export default App;
