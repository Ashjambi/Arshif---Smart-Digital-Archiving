
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
  Pause
} from 'lucide-react';
// @ts-ignore
import mammoth from 'mammoth';
import { 
  FileRecord, 
  ISOMetadata, 
  ChatMessage, 
  DocumentType, 
  Importance, 
  Confidentiality, 
  ArchiveStatus,
  RetentionPolicy,
  RetentionAction
} from './types';
import { NAV_ITEMS, STATUS_COLORS, IMPORTANCE_COLORS } from './constants';
import { classifyFileContent, askAgent } from './services/geminiService';
import { fileWatcher } from './services/fileWatcher';

const STORAGE_KEY = 'arshif_records_v1';
const FOLDER_KEY = 'arshif_connected_folder';
const POLICIES_KEY = 'arshif_policies_v1';

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
    durationMonths: 1200, // Effectively forever (~100 years)
    action: RetentionAction.ARCHIVE,
    targetDocTypes: [DocumentType.POLICY, DocumentType.REPORT]
  }
];

// Extracted utility function for file icons
const getFileIcon = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'heic'].includes(ext || '')) return <FileImage size={20} className="text-pink-500" />;
  if (['xlsx', 'xls', 'csv'].includes(ext || '')) return <FileSpreadsheet size={20} className="text-emerald-500" />;
  if (['doc', 'docx'].includes(ext || '')) return <FileText size={20} className="text-blue-500" />;
  if (['pdf'].includes(ext || '')) return <FileBox size={20} className="text-red-500" />;
  if (['ppt', 'pptx'].includes(ext || '')) return <FileCode size={20} className="text-orange-500" />;
  return <FileText size={20} className="text-slate-400" />;
};

// Standalone FilePreviewer component
const FilePreviewer = ({ 
  record, 
  expanded, 
  onToggleExpand 
}: { 
  record: FileRecord; 
  expanded: boolean; 
  onToggleExpand: () => void; 
}) => {
  if (!record.preview) {
    return (
      <div className={`${expanded ? 'h-[600px]' : 'h-64'} bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 space-y-4`}>
        <FileSearch size={expanded ? 64 : 48} className="opacity-10" />
        <p className="text-sm font-black">المعاينة المباشرة غير مدعومة لهذا التنسيق</p>
        <button className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-xs font-black shadow-lg hover:bg-indigo-700 transition-all flex items-center gap-2">
          <Download size={14} />
          تحميل لفتحه محلياً
        </button>
      </div>
    );
  }

  const isImage = record.preview.startsWith('data:image');
  const isPdf = record.preview.startsWith('data:application/pdf');
  
  return (
    <div className={`bg-white rounded-3xl border border-slate-200 shadow-inner overflow-hidden relative group h-full flex flex-col`}>
      <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/50">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-white rounded-lg border border-slate-200">
             {getFileIcon(record.name)}
          </div>
          <span className="text-[10px] font-black text-slate-600 truncate max-w-[150px]">{record.name}</span>
        </div>
        <button 
          onClick={onToggleExpand}
          className="p-2 hover:bg-white rounded-lg transition-all text-slate-400 hover:text-indigo-600 border border-transparent hover:border-slate-100"
        >
           {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </div>

      <div className="flex-1 overflow-auto bg-slate-100/30">
        {isImage ? (
          <div className="p-4 flex items-center justify-center min-h-full">
             <img src={record.preview} alt={record.name} className="max-w-full h-auto rounded-xl shadow-xl border border-white" />
          </div>
        ) : isPdf ? (
          <iframe 
            src={`${record.preview}#toolbar=0&navpanes=0`} 
            className="w-full h-full min-h-[400px] border-none" 
            title="PDF Preview"
          ></iframe>
        ) : (
          <div className="p-8 max-h-full">
             <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm min-h-full">
                <pre className="text-sm font-medium text-slate-700 leading-loose whitespace-pre-wrap text-right font-sans" dir="rtl">
                  {record.preview}
                </pre>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

// AgentView Component
const AgentView = ({ 
  messages, 
  chatInput, 
  setChatInput, 
  onSendMessage, 
  isLoading 
}: {
  messages: ChatMessage[];
  chatInput: string;
  setChatInput: (v: string) => void;
  onSendMessage: (t?: string) => void;
  isLoading: boolean;
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col bg-white rounded-[3rem] border border-slate-100 shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-8 duration-700 relative">
       {/* Header */}
       <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-6">
             <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-600/20">
                <Bot size={32} />
             </div>
             <div>
                <h2 className="text-2xl font-black text-slate-800">المساعد الذكي</h2>
                <p className="text-slate-400 font-medium text-sm flex items-center gap-2">
                   <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                   متصل بقاعدة المعرفة (ISO 15489)
                </p>
             </div>
          </div>
       </div>

       {/* Messages */}
       <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-slate-50/30 custom-scrollbar" ref={scrollRef}>
          {messages.map((msg) => (
             <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] p-6 rounded-[2rem] shadow-sm relative group ${
                   msg.role === 'user' 
                   ? 'bg-indigo-600 text-white rounded-br-none' 
                   : 'bg-white text-slate-700 border border-slate-100 rounded-bl-none'
                }`}>
                   <p className="leading-relaxed whitespace-pre-wrap font-medium">{msg.text}</p>
                   <span className={`text-[10px] font-black absolute -bottom-6 ${msg.role === 'user' ? 'right-2 text-slate-400' : 'left-2 text-slate-400'}`}>
                      {msg.timestamp.toLocaleTimeString('ar-SA', {hour: '2-digit', minute:'2-digit'})}
                   </span>
                </div>
             </div>
          ))}
          {isLoading && (
             <div className="flex justify-start">
                <div className="bg-white p-6 rounded-[2rem] rounded-bl-none border border-slate-100 shadow-sm flex items-center gap-3">
                   <Loader2 size={20} className="animate-spin text-indigo-600" />
                   <span className="text-xs font-black text-slate-400">جاري التحليل...</span>
                </div>
             </div>
          )}
       </div>

       {/* Input */}
       <div className="p-6 bg-white border-t border-slate-100">
          <div className="flex items-center gap-4 bg-slate-50 p-2 rounded-[2rem] border border-slate-200 focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-500/10 transition-all">
             <input 
                type="text" 
                className="flex-1 bg-transparent border-none outline-none px-6 py-4 font-bold text-slate-700 placeholder:text-slate-400"
                placeholder="اطرح سؤالاً حول ملفاتك أو سياسات الأرشفة..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onSendMessage()}
                disabled={isLoading}
             />
             <button 
                onClick={() => onSendMessage()}
                disabled={!chatInput.trim() || isLoading}
                className="relative p-4 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg active:scale-95 flex items-center justify-center"
             >
                <Send size={20} className={isLoading ? 'opacity-0' : ''} />
                {isLoading && <Loader2 size={20} className="absolute animate-spin" />}
             </button>
          </div>
       </div>
    </div>
  );
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [connectedFolder, setConnectedFolder] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [policies, setPolicies] = useState<RetentionPolicy[]>(DEFAULT_POLICIES);
  const [isWatching, setIsWatching] = useState(false);
  const [watcherInterval, setWatcherInterval] = useState<any>(null);

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
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false);
  
  // New Policy State
  const [newPolicyName, setNewPolicyName] = useState('');
  const [newPolicyDuration, setNewPolicyDuration] = useState(12);
  const [newPolicyAction, setNewPolicyAction] = useState<RetentionAction>(RetentionAction.ARCHIVE);
  const [newPolicyTypes, setNewPolicyTypes] = useState<DocumentType[]>([]);

  const [filters, setFilters] = useState({
    type: '',
    importance: '',
    confidentiality: '',
    status: ''
  });

  // Ref to hold current files for the interval to access without closure issues
  const filesRef = useRef(files);
  useEffect(() => { filesRef.current = files; }, [files]);

  useEffect(() => {
    const savedFiles = localStorage.getItem(STORAGE_KEY);
    const savedFolder = localStorage.getItem(FOLDER_KEY);
    const savedPolicies = localStorage.getItem(POLICIES_KEY);

    if (savedFiles) {
      try {
        setFiles(JSON.parse(savedFiles));
      } catch (e) {
        console.error("Failed to load records", e);
      }
    }
    if (savedFolder) setConnectedFolder(savedFolder);
    if (savedPolicies) setPolicies(JSON.parse(savedPolicies));

    return () => {
      if (watcherInterval) clearInterval(watcherInterval);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
    if (connectedFolder) localStorage.setItem(FOLDER_KEY, connectedFolder);
    localStorage.setItem(POLICIES_KEY, JSON.stringify(policies));
  }, [files, connectedFolder, policies]);

  // Apply policies
  useEffect(() => {
    const applyPolicies = () => {
      let hasChanges = false;
      const updatedFiles = files.map(file => {
        if (!file.isoMetadata) return file;
        const applicablePolicy = policies.find(p => p.targetDocTypes.includes(file.isoMetadata!.documentType));
        if (applicablePolicy) {
          const createdAt = new Date(file.isoMetadata.createdAt);
          const expiryDate = new Date(createdAt);
          expiryDate.setMonth(createdAt.getMonth() + applicablePolicy.durationMonths);
          const newExpiryStr = expiryDate.toISOString();
          if (file.isoMetadata.retentionPolicy !== applicablePolicy.name || file.isoMetadata.expiryDate !== newExpiryStr) {
            hasChanges = true;
            return {
              ...file,
              isoMetadata: {
                ...file.isoMetadata,
                retentionPolicy: applicablePolicy.name,
                expiryDate: newExpiryStr
              }
            };
          }
        }
        return file;
      });
      if (hasChanges) setFiles(updatedFiles);
    };
    if (files.length > 0) {
       const timer = setTimeout(applyPolicies, 1000);
       return () => clearTimeout(timer);
    }
  }, [policies, files.length]);

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

  const complianceAlerts = useMemo(() => {
    const now = new Date();
    return files.filter(f => 
      f.isoMetadata?.expiryDate && 
      new Date(f.isoMetadata.expiryDate) <= now && 
      f.isoMetadata.status === ArchiveStatus.ACTIVE
    );
  }, [files]);

  const readFilePreview = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      const ext = file.name.split('.').pop()?.toLowerCase();
      
      if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) {
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 800;
            const scaleSize = MAX_WIDTH / img.width;
            canvas.width = MAX_WIDTH;
            canvas.height = img.height * scaleSize;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', 0.8));
          };
          img.src = e.target?.result as string;
        };
        reader.readAsDataURL(file);
      } else if (ext === 'pdf') {
        reader.onload = (e) => {
          resolve(e.target?.result as string);
        };
        reader.readAsDataURL(file);
      } else if (ext === 'docx') {
        reader.onload = async (e) => {
          try {
            const arrayBuffer = e.target?.result as ArrayBuffer;
            const result = await mammoth.extractRawText({ arrayBuffer });
            const text = result.value.trim();
            resolve(text.length > 0 ? text : "المستند فارغ.");
          } catch (error) {
            console.error("DOCX extraction error:", error);
            resolve("تعذر قراءة محتوى ملف Word.");
          }
        };
        reader.readAsArrayBuffer(file);
      } else if (['txt', 'csv', 'json', 'md', 'html', 'css', 'js'].includes(ext || '')) {
        reader.onload = (e) => {
          resolve((e.target?.result as string).substring(0, 5000));
        };
        reader.readAsText(file);
      } else {
        resolve('');
      }
    });
  };

  const handleOpenInBrowser = useCallback((file: FileRecord) => {
    if (!file.preview) {
      alert("لا يمكن فتح الملف: المحتوى غير متوفر");
      return;
    }
    try {
      if (file.preview.startsWith('data:')) {
        fetch(file.preview)
          .then(res => res.blob())
          .then(blob => {
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
          });
      } else {
        const blob = new Blob([file.preview], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      }
    } catch (e) {
      console.error("Error opening file", e);
      alert("حدث خطأ أثناء محاولة فتح الملف");
    }
  }, []);

  // --- NEW FILE WATCHER LOGIC ---

  const processFileChanges = async (newFiles: File[], modifiedFiles: {file: File, existingId: string}[], deletedIds: string[]) => {
    if (newFiles.length === 0 && modifiedFiles.length === 0 && deletedIds.length === 0) return;

    setScanProgress(prev => ({ 
      ...prev, 
      total: newFiles.length + modifiedFiles.length,
      current: 0, 
      status: 'analyzing',
      summary: { added: newFiles.length, modified: modifiedFiles.length, deleted: deletedIds.length }
    }));

    // Generate IDs and map directories
    const directoryMap: Record<string, string[]> = {}; 
    const fileIdMap: Map<File, string> = new Map();
    const newFileObjects: { file: File; id: string }[] = [];

    newFiles.forEach(f => {
      const id = Math.random().toString(36).substring(2, 11);
      fileIdMap.set(f, id);
      newFileObjects.push({ file: f, id });
      const path = f.webkitRelativePath || f.name;
      const parentDir = path.substring(0, path.lastIndexOf('/')) || 'root';
      if (!directoryMap[parentDir]) directoryMap[parentDir] = [];
      directoryMap[parentDir].push(id);
    });

    // Add existing siblings to context
    filesRef.current.forEach(f => {
      const path = f.isoMetadata?.originalPath || f.name;
      const parentDir = path.substring(0, path.lastIndexOf('/')) || 'root';
      if (!directoryMap[parentDir]) directoryMap[parentDir] = [];
      if (!directoryMap[parentDir].includes(f.id)) directoryMap[parentDir].push(f.id);
    });

    const archiveSummary = filesRef.current.slice(0, 100).map(f => `[${f.isoMetadata?.recordId || f.id}] ${f.isoMetadata?.title || f.name}`).join('\n');
    let updatedFileList = filesRef.current.filter(f => !deletedIds.includes(f.id));
    
    const queue = [
      ...newFileObjects.map(obj => ({ file: obj.file, isNew: true, existingId: obj.id })),
      ...modifiedFiles.map(m => ({ file: m.file, isNew: false, existingId: m.existingId }))
    ];

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      setScanProgress(prev => ({ ...prev, current: i + 1, currentFile: item.file.name }));
      try {
        const previewContent = await readFilePreview(item.file);
        const classificationContext = previewContent.startsWith('data:') ? `File: ${item.file.name}` : previewContent.substring(0, 1000);
        const path = item.file.webkitRelativePath || item.file.name;
        const parentDir = path.substring(0, path.lastIndexOf('/')) || 'root';
        const siblings = directoryMap[parentDir] ? directoryMap[parentDir].filter(id => id !== item.existingId) : [];

        const metadata = await classifyFileContent(item.file.name, classificationContext, archiveSummary, siblings);
        
        const record: FileRecord = {
          id: item.existingId,
          name: item.file.name,
          size: item.file.size,
          type: item.file.type,
          lastModified: item.file.lastModified,
          isProcessing: false,
          preview: previewContent,
          isoMetadata: {
            recordId: item.isNew ? `REC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}` : updatedFileList.find(f => f.id === item.existingId)?.isoMetadata?.recordId || '',
            originalPath: item.file.webkitRelativePath || `/local/${item.file.name}`,
            ...metadata as any,
            updatedAt: new Date().toISOString(),
            createdAt: item.isNew ? new Date().toISOString() : updatedFileList.find(f => f.id === item.existingId)?.isoMetadata?.createdAt
          }
        };

        if (item.isNew) updatedFileList = [record, ...updatedFileList];
        else updatedFileList = updatedFileList.map(f => f.id === item.existingId ? record : f);
        
        setFiles([...updatedFileList]);
      } catch (err) {
        console.error(err);
      }
    }

    setScanProgress(prev => ({ ...prev, status: 'completed', currentFile: 'اكتملت المزامنة' }));
    setLastSyncTime(new Date());
    setTimeout(() => setScanProgress(p => ({ ...p, status: 'idle' })), 3000);
  };

  const handleConnectFolder = async () => {
    try {
      const dirName = await fileWatcher.connect();
      setConnectedFolder(dirName);
      performScan(); // Initial scan
      setIsWatching(true);
    } catch (error: any) {
      console.error(error);
      if (error.name === 'SecurityError' || error.message?.includes('Cross origin sub frames')) {
        alert('تنبيه أمني: لا يمكن استخدام ميزة "المراقبة الآلية" داخل هذا العرض (iframe). يرجى فتح التطبيق في تبويب جديد أو استخدام "المزامنة اليدوية".');
      } else if (error.name === 'AbortError') {
        // User cancelled the picker
        return;
      } else {
        alert('لم يتم ربط المجلد. يرجى التأكد من دعم المتصفح وصلاحيات الوصول.');
      }
    }
  };

  const performScan = async () => {
    try {
      setScanProgress(prev => ({ ...prev, status: 'reconciling', currentFile: 'فحص التغييرات...', total: 0, current: 0 }));
      const changes = await fileWatcher.scanForChanges(filesRef.current);
      
      if (changes.added.length === 0 && changes.modified.length === 0 && changes.deletedIds.length === 0) {
        setScanProgress(prev => ({ ...prev, status: 'completed', currentFile: 'لا توجد تغييرات' }));
        setTimeout(() => setScanProgress(p => ({ ...p, status: 'idle' })), 2000);
        return;
      }

      // Convert modified files to correct format for processing
      const modifiedWithIds = changes.modified.map(file => {
        const path = file.webkitRelativePath || file.name;
        const existing = filesRef.current.find(f => f.isoMetadata?.originalPath === path);
        return { file, existingId: existing ? existing.id : '' }; // Should always find existing
      }).filter(i => i.existingId !== '');

      await processFileChanges(changes.added, modifiedWithIds as any, changes.deletedIds);
    } catch (e) {
      console.error("Scan failed", e);
      setScanProgress(prev => ({ ...prev, status: 'error', currentFile: 'فشل الفحص' }));
    }
  };

  const toggleWatcher = () => {
    if (!connectedFolder) {
      alert("يرجى ربط مجلد أولاً");
      return;
    }
    const newState = !isWatching;
    setIsWatching(newState);
  };

  // Watcher Interval
  useEffect(() => {
    if (isWatching && connectedFolder) {
      const interval = setInterval(() => {
        if (scanProgress.status === 'idle') {
           performScan();
        }
      }, 30000); // Check every 30 seconds
      setWatcherInterval(interval);
    } else {
      if (watcherInterval) clearInterval(watcherInterval);
    }
    return () => { if (watcherInterval) clearInterval(watcherInterval); };
  }, [isWatching, connectedFolder, scanProgress.status]);

  // Legacy manual fallback
  const handleManualUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
     // Re-use logic but this is legacy path now
     // For brevity, we can assume the user will primarily use the watcher if available
     // But to keep code working without watcher, we'd need to adapt the `handleIncrementalSync` logic
     // from previous iteration. For this step, I'm refactoring the shared logic into processFileChanges
     // and adapting the input handler.
     const uploadedFiles = e.target.files;
     if (!uploadedFiles || uploadedFiles.length === 0) return;
     const fullFileList = Array.from(uploadedFiles) as File[];
     
     if (fullFileList[0].webkitRelativePath) {
      const pathParts = fullFileList[0].webkitRelativePath.split('/');
      if (pathParts.length > 1) setConnectedFolder(pathParts[0]);
    }

     const newFiles: File[] = [];
     const modifiedFiles: { file: File; existingId: string }[] = [];
     const currentPaths = new Set(fullFileList.map(f => f.webkitRelativePath || f.name));

     fullFileList.forEach(f => {
      const path = f.webkitRelativePath || f.name;
      const existing = files.find(ef => ef.isoMetadata?.originalPath === path);
      if (!existing) {
        newFiles.push(f);
      } else if (existing.size !== f.size || existing.lastModified !== f.lastModified) {
        modifiedFiles.push({ file: f, existingId: existing.id });
      }
    });

    const deletedIds = files
      .filter(f => f.isoMetadata?.originalPath.startsWith(connectedFolder || '') && !currentPaths.has(f.isoMetadata!.originalPath))
      .map(f => f.id);

    processFileChanges(newFiles, modifiedFiles, deletedIds);
  }

  const handleSendMessage = async (text?: string) => {
    const messageText = text || chatInput;
    if (!messageText.trim() || isChatLoading) return;
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', text: messageText, timestamp: new Date() }]);
    setChatInput('');
    setIsChatLoading(true);

    const context = files.slice(0, 50).map(f => `[${f.isoMetadata?.recordId}] ${f.isoMetadata?.title}, ${f.isoMetadata?.documentType}`).join('\n');
    const responseText = await askAgent(messageText, context);
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

  const handleCreatePolicy = () => {
    if (!newPolicyName) return;
    
    const newPolicy: RetentionPolicy = {
      id: Math.random().toString(36).substr(2, 9),
      name: newPolicyName,
      description: `تم الإنشاء يدوياً: ${newPolicyTypes.join(', ')}`,
      durationMonths: newPolicyDuration,
      action: newPolicyAction,
      targetDocTypes: newPolicyTypes
    };

    setPolicies([...policies, newPolicy]);
    setNewPolicyName('');
    setNewPolicyTypes([]);
    alert("تم حفظ سياسة الحفظ الجديدة وتطبيقها على الملفات المطابقة.");
  };

  const deletePolicy = (id: string) => {
    if (window.confirm('هل أنت متأكد من حذف هذه السياسة؟')) {
      setPolicies(policies.filter(p => p.id !== id));
    }
  };

  const Dashboard = () => (
    <div className="space-y-8 animate-in fade-in duration-700">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end bg-white p-10 rounded-[3rem] border border-slate-100 shadow-xl shadow-slate-200/40 gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-indigo-600 font-black text-xs uppercase tracking-widest">
            <Activity size={14} className="animate-pulse" />
            المراقبة الرقمية النشطة
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight">ملخص الأرشفة</h1>
          <div className="flex flex-wrap items-center gap-3">
            {connectedFolder ? (
              <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-4 py-2 rounded-xl text-xs font-black border border-emerald-100 shadow-sm">
                <FolderCheck size={16} />
                المجلد المربوط: {connectedFolder}
              </div>
            ) : (
              <div className="text-slate-400 text-xs font-medium flex items-center gap-2 bg-slate-50 px-4 py-2 rounded-xl border border-slate-100">
                <AlertCircle size={14} />
                بانتظار ربط المجلد...
              </div>
            )}
            <div className="flex items-center gap-2 text-indigo-600 bg-indigo-50 px-4 py-2 rounded-xl text-xs font-black border border-indigo-100 shadow-sm">
              <History size={16} />
              آخر مزامنة: {lastSyncTime ? lastSyncTime.toLocaleTimeString('ar-SA') : 'لم يتم'}
            </div>
             {isWatching && (
                <div className="flex items-center gap-2 text-white bg-rose-500 px-4 py-2 rounded-xl text-xs font-black shadow-lg shadow-rose-500/30 animate-pulse">
                   <RadioIcon />
                   مراقب التغييرات نشط
                </div>
             )}
          </div>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={clearArchive}
            className="bg-white border border-slate-200 text-slate-400 hover:text-rose-500 p-4 rounded-xl transition-all shadow-sm active:scale-95"
            title="حذف الأرشيف"
          >
            <Trash2 size={20} />
          </button>
          
          {fileWatcher.isAPISupported ? (
             <button 
               onClick={handleConnectFolder}
               className="bg-slate-900 hover:bg-black text-white px-8 py-4 rounded-[1.25rem] cursor-pointer flex items-center gap-3 transition-all shadow-xl shadow-slate-900/30 font-black active:scale-95 text-base border border-slate-800"
             >
                <FolderPlus size={20} />
                {connectedFolder ? 'تغيير المجلد' : 'ربط المجلد الذكي'}
             </button>
          ) : (
            <label className="bg-slate-900 hover:bg-black text-white px-8 py-4 rounded-[1.25rem] cursor-pointer flex items-center gap-3 transition-all shadow-xl shadow-slate-900/30 font-black active:scale-95 text-base border border-slate-800">
              <RefreshCw size={20} />
              مزامنة يدوية
              <input type="file" webkitdirectory="" {...({ directory: "" } as any)} multiple className="hidden" onChange={handleManualUpload} />
            </label>
          )}
        </div>
      </header>

      {/* Compliance Alerts Widget */}
      {complianceAlerts.length > 0 && (
         <div className="bg-orange-50 rounded-[2.5rem] border border-orange-100 p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-lg shadow-orange-100/50 animate-in slide-in-from-top-4 duration-500">
            <div className="flex items-center gap-6">
               <div className="bg-orange-100 p-4 rounded-2xl text-orange-600 animate-pulse">
                  <AlertTriangle size={32} />
               </div>
               <div>
                  <h3 className="font-black text-2xl text-orange-900">تنبيهات الامتثال (ISO 15489)</h3>
                  <p className="text-orange-700/80 font-bold mt-1">يوجد {complianceAlerts.length} ملف تجاوز فترة الحفظ القانونية ويستوجب الإجراء.</p>
               </div>
            </div>
            <button 
               onClick={() => { setFilters({...filters, status: 'active'}); setActiveTab('archive'); setSearchQuery(''); }}
               className="bg-orange-500 text-white px-8 py-3 rounded-xl font-black shadow-lg shadow-orange-500/20 hover:bg-orange-600 transition-all active:scale-95"
            >
               مراجعة الملفات
            </button>
         </div>
      )}

      {scanProgress.status !== 'idle' && (
        <div className={`p-8 rounded-[2.5rem] border transition-all duration-500 shadow-2xl ${scanProgress.status === 'completed' ? 'bg-indigo-900 text-white border-indigo-500' : 'bg-white border-indigo-100 text-slate-800'}`}>
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-6">
              <div className={`p-4 rounded-2xl shadow-lg ${scanProgress.status === 'completed' ? 'bg-white/20' : 'bg-indigo-50 shadow-indigo-100'}`}>
                {scanProgress.status === 'completed' ? <CheckCircle2 size={32} /> : <RefreshCw className="animate-spin text-indigo-600" size={32} />}
              </div>
              <div>
                <span className="font-black text-2xl block leading-tight tracking-tight">
                  {scanProgress.status === 'reconciling' && 'جاري فحص التغييرات...'}
                  {scanProgress.status === 'analyzing' && 'جاري الفهرسة والتحليل الذكي...'}
                  {scanProgress.status === 'completed' && 'تمت المزامنة بنجاح'}
                </span>
                <span className={`text-xs block mt-1 ${scanProgress.status === 'completed' ? 'text-indigo-200' : 'text-slate-400'} truncate max-w-sm font-medium`}>
                  {scanProgress.currentFile}
                </span>
              </div>
            </div>
            {scanProgress.summary && (
              <div className="flex gap-8">
                <div className="text-center group">
                  <div className={`flex items-center gap-2 font-black text-3xl ${scanProgress.status === 'completed' ? 'text-emerald-300' : 'text-emerald-500'}`}>
                    <PlusCircle size={18} />
                    <span>{scanProgress.summary.added}</span>
                  </div>
                  <span className="text-[10px] uppercase font-black opacity-60">جديد</span>
                </div>
              </div>
            )}
          </div>
          <div className={`w-full h-4 rounded-full overflow-hidden shadow-inner ${scanProgress.status === 'completed' ? 'bg-indigo-950/50' : 'bg-slate-100'}`}>
            <div 
              className={`h-full transition-all duration-700 shadow-lg ${scanProgress.status === 'completed' ? 'bg-white' : 'bg-indigo-600'}`} 
              style={{ width: scanProgress.total > 0 ? `${(scanProgress.current / scanProgress.total) * 100}%` : '100%' }}
            ></div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { label: 'إجمالي السجلات', value: files.length, icon: <FileText className="text-indigo-600" />, color: 'bg-white' },
          { label: 'سجلات نشطة', value: files.filter(f => f.isoMetadata?.status === ArchiveStatus.ACTIVE).length, icon: <FileCheck className="text-emerald-600" />, color: 'bg-white' },
          { label: 'تنبيهات حرجة', value: files.filter(f => f.isoMetadata?.importance === Importance.CRITICAL).length, icon: <AlertCircle className="text-rose-600" />, color: 'bg-white' },
          { label: 'سياسات الحفظ', value: policies.length, icon: <Scale className="text-amber-600" />, color: 'bg-white' },
        ].map((stat, i) => (
          <div key={i} className={`${stat.color} p-8 rounded-[2rem] border border-slate-100 flex items-center justify-between group hover:shadow-2xl hover:-translate-y-1.5 transition-all duration-500 cursor-default shadow-sm shadow-slate-200/40`}>
            <div>
              <p className="text-[10px] text-slate-400 mb-1 font-black uppercase tracking-widest">{stat.label}</p>
              <h3 className="text-4xl font-black text-slate-800 tracking-tighter">{stat.value}</h3>
            </div>
            <div className="bg-slate-50 p-5 rounded-2xl group-hover:scale-110 group-hover:bg-indigo-50 transition-all shadow-inner">
              {stat.icon}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white rounded-[2.5rem] shadow-xl border border-slate-100 overflow-hidden">
          <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
            <h3 className="font-black text-slate-800 flex items-center gap-3 text-xl">
              <History size={24} className="text-indigo-600" />
              أحدث التحديثات
            </h3>
            <button className="text-indigo-600 text-sm font-black hover:underline px-4 py-2 hover:bg-indigo-50 rounded-xl transition-all" onClick={() => setActiveTab('archive')}>مشاهدة الكل</button>
          </div>
          <div className="divide-y divide-slate-50">
            {files.length === 0 ? (
              <div className="p-24 text-center space-y-4">
                <Archive size={48} className="mx-auto text-slate-200" />
                <p className="text-slate-400 text-sm font-bold">الأرشيف فارغ حالياً.</p>
              </div>
            ) : (
              files.slice(0, 5).map(file => (
                <div key={file.id} className="p-7 flex items-center justify-between hover:bg-slate-50/50 transition-all group cursor-pointer" onClick={() => setSelectedFile(file)}>
                  <div className="flex items-center gap-5">
                    <div className="bg-white p-4 rounded-2xl text-slate-400 shadow-sm border border-slate-100 group-hover:border-indigo-100 transition-all">
                      {getFileIcon(file.name)}
                    </div>
                    <div>
                      <h4 className="font-black text-slate-800 text-base truncate max-w-[300px] group-hover:text-indigo-600 transition-colors">{file.isoMetadata?.title || file.name}</h4>
                      <p className="text-[11px] text-slate-400 font-black mt-1 uppercase tracking-wider">{file.isoMetadata?.recordId} • {file.isoMetadata?.documentType}</p>
                    </div>
                  </div>
                  <ArrowRight size={20} className="text-slate-200 group-hover:text-indigo-600 group-hover:translate-x-1.5 transition-all" />
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-8">
          <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 p-8">
            <h3 className="font-black text-slate-800 mb-8 flex items-center gap-3 text-xl">
              <Zap size={24} className="text-indigo-600" />
              أمان البيانات
            </h3>
            <div className="space-y-5">
              <div className="p-6 bg-indigo-50/50 rounded-2xl border border-indigo-100 flex items-center gap-5">
                <div className="bg-white p-3 rounded-xl shadow-sm">
                   <Database className="text-indigo-600" size={28} />
                </div>
                <div>
                  <p className="text-[10px] font-black text-indigo-700 uppercase tracking-widest">تخزين محلي معزول</p>
                  <p className="text-lg text-indigo-900 font-black">{files.length} ملف مفهرس</p>
                </div>
              </div>
              <div className="p-6 bg-emerald-50/50 rounded-2xl border border-emerald-100 flex items-center gap-5">
                <div className="bg-white p-3 rounded-xl shadow-sm">
                   <Shield className="text-emerald-600" size={28} />
                </div>
                <div>
                  <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">تشفير الخصوصية</p>
                  <p className="text-lg text-emerald-900 font-black">نشط ومؤمن</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 rounded-[3rem] p-10 text-white relative group shadow-2xl overflow-hidden">
            <div className="relative z-10">
               <div className="w-16 h-16 bg-indigo-500/20 rounded-2xl flex items-center justify-center border border-indigo-400/20 mb-6 backdrop-blur-md">
                 <Bot size={32} className="text-indigo-400" />
               </div>
              <h4 className="font-black text-3xl mb-3 tracking-tighter">الوكيل المعرفي</h4>
              <p className="text-slate-400 text-sm leading-relaxed mb-10 font-medium">الذكاء الاصطناعي جاهز للإجابة عن محتوى وثائقك وقواعد الأرشفة.</p>
              <button 
                onClick={() => setActiveTab('agent')}
                className="w-full bg-indigo-600 text-white py-5 rounded-2xl text-sm font-black hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-900/40 active:scale-95 flex items-center justify-center gap-3"
              >
                المساعد الذكي
                <ArrowRight size={20} />
              </button>
            </div>
            <Sparkles size={120} className="absolute -bottom-10 -left-10 text-white/5 rotate-12" />
          </div>
        </div>
      </div>
    </div>
  );

  const ArchiveView = () => (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-10 rounded-[3rem] border border-slate-100 shadow-xl shadow-slate-200/40 gap-6">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight">الأرشيف المركزي</h1>
          <p className="text-slate-500 font-medium mt-2">إدارة وفهرسة السجلات وفق معيار ISO 15489</p>
        </div>
        <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-2xl border border-slate-200">
           <button 
             onClick={() => setViewMode('grid')}
             className={`p-3 rounded-xl transition-all ${viewMode === 'grid' ? 'bg-white shadow-md text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
           >
             <LayoutGrid size={20} />
           </button>
           <button 
             onClick={() => setViewMode('list')}
             className={`p-3 rounded-xl transition-all ${viewMode === 'list' ? 'bg-white shadow-md text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
           >
             <ListIcon size={20} />
           </button>
        </div>
      </header>

      {/* Filters Bar */}
      <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-lg flex flex-col md:flex-row gap-6 items-center">
        <div className="relative flex-1 w-full">
           <Search className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
           <input 
             type="text" 
             placeholder="بحث في السجلات (العنوان، الكود، المحتوى)..." 
             className="w-full pl-6 pr-16 py-5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all font-bold text-slate-700"
             value={searchQuery}
             onChange={(e) => setSearchQuery(e.target.value)}
           />
        </div>
        <div className="flex gap-3 overflow-x-auto w-full md:w-auto pb-2 md:pb-0 scrollbar-hide">
          <select 
            className="p-5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-600 focus:border-indigo-500 outline-none text-sm min-w-[140px]"
            value={filters.type}
            onChange={(e) => setFilters({...filters, type: e.target.value})}
          >
            <option value="">كل الأنواع</option>
            {Object.values(DocumentType).map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select 
            className="p-5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-600 focus:border-indigo-500 outline-none text-sm min-w-[140px]"
            value={filters.status}
            onChange={(e) => setFilters({...filters, status: e.target.value})}
          >
            <option value="">كل الحالات</option>
            {Object.values(ArchiveStatus).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
           {(filters.type || filters.status || searchQuery) && (
              <button 
                onClick={() => { setFilters({type: '', importance: '', confidentiality: '', status: ''}); setSearchQuery(''); }}
                className="p-5 bg-rose-50 text-rose-500 rounded-2xl hover:bg-rose-100 transition-all"
                title="مسح المرشحات"
              >
                 <X size={20} />
              </button>
           )}
        </div>
      </div>

      {/* Content Grid/List */}
      {filteredFiles.length === 0 ? (
        <div className="text-center py-24 bg-white rounded-[3rem] border border-dashed border-slate-200">
           <div className="bg-slate-50 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6">
              <Search size={40} className="text-slate-300" />
           </div>
           <h3 className="text-xl font-black text-slate-800 mb-2">لا توجد سجلات مطابقة</h3>
           <p className="text-slate-400 font-medium">جرب تغيير شروط البحث أو المرشحات.</p>
        </div>
      ) : (
        <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8" : "space-y-4"}>
          {filteredFiles.map(file => (
            <div 
              key={file.id}
              onClick={() => setSelectedFile(file)}
              className={`bg-white border border-slate-100 rounded-[2.5rem] p-8 hover:shadow-2xl hover:-translate-y-2 transition-all duration-300 cursor-pointer group relative overflow-hidden ${viewMode === 'list' ? 'flex items-center gap-8' : ''}`}
            >
               <div className={`absolute top-0 right-0 w-2 h-full ${STATUS_COLORS[file.isoMetadata?.status as keyof typeof STATUS_COLORS]?.split(' ')[0] || 'bg-slate-200'}`} />
               
               <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-4">
                     <div className="bg-slate-50 p-4 rounded-2xl text-slate-500 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-sm">
                        {getFileIcon(file.name)}
                     </div>
                     {viewMode === 'list' && (
                        <div>
                           <h3 className="font-black text-slate-800 text-lg group-hover:text-indigo-600 transition-colors">{file.isoMetadata?.title || file.name}</h3>
                           <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1">{file.isoMetadata?.recordId}</p>
                        </div>
                     )}
                  </div>
                  {viewMode === 'grid' && (
                     <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${STATUS_COLORS[file.isoMetadata?.status as keyof typeof STATUS_COLORS] || 'bg-slate-100 text-slate-500'}`}>
                        {file.isoMetadata?.status}
                     </span>
                  )}
               </div>

               {viewMode === 'grid' && (
                  <>
                     <h3 className="font-black text-slate-800 text-lg mb-2 line-clamp-2 group-hover:text-indigo-600 transition-colors">{file.isoMetadata?.title || file.name}</h3>
                     <p className="text-slate-400 text-xs font-medium line-clamp-2 mb-6 h-10 leading-relaxed">{file.isoMetadata?.description || "لا يوجد وصف متاح..."}</p>
                     
                     <div className="flex items-center gap-2 mt-auto pt-6 border-t border-slate-50">
                        <span className="bg-slate-50 text-slate-500 px-3 py-1.5 rounded-xl text-[10px] font-black border border-slate-100">{file.isoMetadata?.documentType}</span>
                        <span className={`px-3 py-1.5 rounded-xl text-[10px] font-black border border-transparent ${IMPORTANCE_COLORS[file.isoMetadata?.importance as keyof typeof IMPORTANCE_COLORS]}`}>
                           {file.isoMetadata?.importance}
                        </span>
                     </div>
                  </>
               )}
               
               {viewMode === 'list' && (
                  <div className="flex-1 flex items-center justify-between gap-8">
                     <div className="hidden md:block">
                        <p className="text-slate-400 text-xs font-medium line-clamp-1 max-w-md">{file.isoMetadata?.description || "لا يوجد وصف..."}</p>
                     </div>
                     <div className="flex items-center gap-3">
                        <span className="bg-slate-50 text-slate-500 px-3 py-1.5 rounded-xl text-[10px] font-black border border-slate-100 whitespace-nowrap">{file.isoMetadata?.documentType}</span>
                        <span className={`px-3 py-1.5 rounded-xl text-[10px] font-black whitespace-nowrap ${IMPORTANCE_COLORS[file.isoMetadata?.importance as keyof typeof IMPORTANCE_COLORS]}`}>
                           {file.isoMetadata?.importance}
                        </span>
                        <span className={`px-3 py-1.5 rounded-xl text-[10px] font-black whitespace-nowrap ${STATUS_COLORS[file.isoMetadata?.status as keyof typeof STATUS_COLORS] || 'bg-slate-100 text-slate-500'}`}>
                           {file.isoMetadata?.status}
                        </span>
                     </div>
                  </div>
               )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen flex bg-[#fbfcfd] selection:bg-indigo-100 selection:text-indigo-900">
      <aside className="w-80 bg-slate-900 text-slate-300 flex flex-col fixed h-full z-20 shadow-2xl border-l border-slate-800">
        <div className="p-8">
          <div className="flex items-center gap-5 mb-16 group cursor-pointer" onClick={() => setActiveTab('dashboard')}>
            <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-2xl border border-white/20">أ</div>
            <div className="flex flex-col">
              <span className="text-3xl font-black text-white tracking-tighter leading-none">أرشـيـف</span>
              <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em] mt-2">ISO Standard</span>
            </div>
          </div>

          <SidebarSection title="النظام" icon={LayoutDashboard}>
            {NAV_ITEMS.map(item => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center justify-between px-5 py-4.5 rounded-2xl transition-all group mb-1 ${
                    activeTab === item.id 
                      ? 'bg-indigo-600 text-white shadow-2xl font-black' 
                      : 'text-slate-400 hover:bg-slate-800/40 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <Icon size={20} className={activeTab === item.id ? 'text-white' : 'text-slate-600 group-hover:text-indigo-400 transition-colors'} />
                    <span className="text-sm">{item.label}</span>
                  </div>
                  {activeTab === item.id && <div className="w-2 h-2 bg-white rounded-full animate-pulse shadow-sm" />}
                </button>
              );
            })}
          </SidebarSection>

          <SidebarSection title="المراقبة" icon={Activity}>
             <div className="px-5 py-6 bg-slate-800/20 rounded-[2rem] border border-slate-700/30 space-y-5 shadow-inner">
                <div className="flex items-center justify-between">
                   <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${connectedFolder ? 'bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-slate-600'}`}></div>
                      <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{connectedFolder ? 'مراقب نشط' : 'غير متصل'}</span>
                   </div>
                   {scanProgress.status !== 'idle' && <Loader2 size={14} className="animate-spin text-indigo-400" />}
                </div>
                
                {fileWatcher.isAPISupported ? (
                  <button 
                    onClick={toggleWatcher}
                    disabled={!connectedFolder}
                    className={`w-full flex items-center justify-center gap-3 py-4 text-[11px] font-black text-white rounded-2xl transition-all cursor-pointer group shadow-xl ${isWatching ? 'bg-rose-500 hover:bg-rose-600' : 'bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50'}`}
                  >
                     {isWatching ? <Pause size={14} /> : <Play size={14} />}
                     {isWatching ? 'إيقاف المراقبة' : 'بدء المراقبة الآلية'}
                  </button>
                ) : (
                  <label className="w-full flex items-center justify-center gap-3 py-4 text-[11px] font-black text-white bg-indigo-600 rounded-2xl hover:bg-indigo-700 transition-all cursor-pointer group shadow-xl">
                     <RefreshCw size={14} className="group-hover:rotate-180 transition-transform duration-700" />
                     تحديث الأرشيف
                     <input type="file" webkitdirectory="" {...({ directory: "" } as any)} multiple className="hidden" onChange={handleManualUpload} />
                  </label>
                )}
             </div>
          </SidebarSection>
        </div>

        <div className="mt-auto p-8 bg-slate-950/40 border-t border-slate-800/50">
          <div className="flex items-center gap-4 px-2">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 font-black border border-indigo-500/20 text-xl">خ</div>
            <div className="flex flex-col flex-1 overflow-hidden">
              <span className="text-sm font-black text-white truncate">خالد محمد</span>
              <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest mt-1">مسؤول أرشفة</span>
            </div>
            <button onClick={() => window.location.reload()} className="p-3 text-slate-600 hover:text-rose-500 transition-colors"><LogOut size={20} /></button>
          </div>
        </div>
      </aside>

      <main className="flex-1 mr-80 p-8 transition-all duration-500">
        <div className="max-w-[1400px] mx-auto pb-10">
          {activeTab === 'dashboard' && <Dashboard />}
          {activeTab === 'archive' && <ArchiveView />}
          {activeTab === 'agent' && (
            <AgentView 
              messages={messages} 
              chatInput={chatInput} 
              setChatInput={setChatInput} 
              onSendMessage={handleSendMessage} 
              isLoading={isChatLoading} 
            />
          )}
          {activeTab === 'settings' && (
            <div className="animate-in fade-in slide-in-from-bottom-6 duration-700 space-y-8">
              <header className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-xl shadow-slate-200/30">
                 <h1 className="text-4xl font-black text-slate-900 tracking-tight">إدارة سياسات الحفظ (ISO 15489)</h1>
                 <p className="text-slate-500 font-medium mt-2">تعريف مدد الحفظ القانونية وإجراءات الإتلاف أو الأرشفة الدائمة.</p>
              </header>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                 {/* Create Policy Form */}
                 <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-lg h-fit">
                    <h3 className="font-black text-slate-800 text-xl mb-6 flex items-center gap-2">
                       <PlusCircle className="text-indigo-600" />
                       إضافة سياسة جديدة
                    </h3>
                    <div className="space-y-5">
                       <div>
                          <label className="block text-xs font-black text-slate-500 mb-2 uppercase tracking-wider">اسم السياسة</label>
                          <input 
                             type="text" 
                             className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                             placeholder="مثلاً: العقود التجارية"
                             value={newPolicyName}
                             onChange={(e) => setNewPolicyName(e.target.value)}
                          />
                       </div>
                       <div>
                          <label className="block text-xs font-black text-slate-500 mb-2 uppercase tracking-wider">مدة الحفظ (بالأشهر)</label>
                          <input 
                             type="number" 
                             className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                             value={newPolicyDuration}
                             onChange={(e) => setNewPolicyDuration(Number(e.target.value))}
                          />
                       </div>
                       <div>
                          <label className="block text-xs font-black text-slate-500 mb-2 uppercase tracking-wider">الإجراء عند الانتهاء</label>
                          <select 
                             className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                             value={newPolicyAction}
                             onChange={(e) => setNewPolicyAction(e.target.value as RetentionAction)}
                          >
                             {Object.values(RetentionAction).map(action => (
                                <option key={action} value={action}>{action}</option>
                             ))}
                          </select>
                       </div>
                       <div>
                          <label className="block text-xs font-black text-slate-500 mb-2 uppercase tracking-wider">أنواع الوثائق المستهدفة</label>
                          <div className="flex flex-wrap gap-2">
                             {Object.values(DocumentType).map(type => (
                                <button
                                   key={type}
                                   onClick={() => {
                                      if (newPolicyTypes.includes(type)) {
                                         setNewPolicyTypes(newPolicyTypes.filter(t => t !== type));
                                      } else {
                                         setNewPolicyTypes([...newPolicyTypes, type]);
                                      }
                                   }}
                                   className={`px-3 py-1.5 rounded-lg text-[10px] font-black border transition-all ${
                                      newPolicyTypes.includes(type)
                                      ? 'bg-indigo-600 text-white border-indigo-600'
                                      : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'
                                   }`}
                                >
                                   {type}
                                </button>
                             ))}
                          </div>
                       </div>
                       <button 
                          onClick={handleCreatePolicy}
                          disabled={!newPolicyName || newPolicyTypes.length === 0}
                          className="w-full py-4 bg-slate-900 text-white rounded-xl font-black hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg active:scale-95"
                       >
                          حفظ السياسة
                       </button>
                    </div>
                 </div>

                 {/* Existing Policies List */}
                 <div className="lg:col-span-2 space-y-6">
                    {policies.map(policy => (
                       <div key={policy.id} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-6 hover:shadow-lg transition-all group">
                          <div className="flex items-center gap-6">
                             <div className={`p-4 rounded-2xl ${policy.action === RetentionAction.DESTROY ? 'bg-rose-50 text-rose-500' : 'bg-emerald-50 text-emerald-500'}`}>
                                <Scale size={24} />
                             </div>
                             <div>
                                <h4 className="font-black text-lg text-slate-800">{policy.name}</h4>
                                <p className="text-xs text-slate-400 font-bold mt-1 line-clamp-1">{policy.description}</p>
                                <div className="flex flex-wrap gap-2 mt-3">
                                   {policy.targetDocTypes.map(type => (
                                      <span key={type} className="bg-slate-50 text-slate-500 px-2 py-1 rounded-md text-[9px] font-black border border-slate-100">{type}</span>
                                   ))}
                                </div>
                             </div>
                          </div>
                          <div className="flex items-center gap-8 pl-4 border-l border-slate-50">
                             <div className="text-center">
                                <span className="block text-2xl font-black text-slate-900">{policy.durationMonths}</span>
                                <span className="text-[9px] text-slate-400 font-black uppercase">شهر</span>
                             </div>
                             <div className="text-center">
                                <span className={`block text-xs font-black px-3 py-1 rounded-full ${policy.action === RetentionAction.DESTROY ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                   {policy.action}
                                </span>
                             </div>
                             <button onClick={() => deletePolicy(policy.id)} className="text-slate-300 hover:text-rose-500 transition-colors p-2">
                                <Trash2 size={18} />
                             </button>
                          </div>
                       </div>
                    ))}
                 </div>
              </div>

              <div className="flex justify-center gap-6 pt-10 border-t border-slate-100">
                 <button onClick={clearArchive} className="text-rose-500 font-black text-sm hover:underline hover:text-rose-700 transition-all">تصفير كافة البيانات وإعادة الضبط</button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* MODAL - IMPROVED PREVIEW EXPERIENCE */}
      {selectedFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-10 bg-slate-900/80 backdrop-blur-xl animate-in fade-in duration-500">
          <div className={`bg-white w-full rounded-[3.5rem] shadow-[0_50px_150px_rgba(0,0,0,0.6)] overflow-hidden animate-in slide-in-from-bottom-12 duration-500 border border-slate-100 relative max-h-[95vh] flex flex-col transition-all duration-700 ${isPreviewExpanded ? 'max-w-[95vw]' : 'max-w-5xl'}`}>
            
            <div className="p-8 md:p-10 border-b border-slate-100 flex justify-between items-center bg-slate-50/20 shrink-0">
              <div className="flex items-center gap-6">
                <div className="bg-indigo-600 p-5 rounded-2xl text-white shadow-2xl border-4 border-white shrink-0 group-hover:rotate-6 transition-transform">
                   {getFileIcon(selectedFile.name)}
                </div>
                <div className="min-w-0">
                  <h3 className="font-black text-slate-900 text-2xl tracking-tight leading-tight truncate max-w-[500px]" title={selectedFile.isoMetadata?.title || selectedFile.name}>
                    {selectedFile.isoMetadata?.title || selectedFile.name}
                  </h3>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-[11px] text-indigo-600 font-black uppercase tracking-[0.2em] bg-indigo-50 px-3 py-1 rounded-lg">{selectedFile.isoMetadata?.recordId}</span>
                    <span className="text-slate-200">|</span>
                    <span className="text-[11px] text-slate-500 font-bold truncate bg-slate-100 px-3 py-1 rounded-lg">{selectedFile.isoMetadata?.documentType}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <button 
                  onClick={() => setIsPreviewExpanded(!isPreviewExpanded)}
                  className="hidden md:flex items-center gap-2 p-4 bg-white border border-slate-200 text-slate-600 rounded-2xl hover:bg-slate-50 transition-all font-black text-xs active:scale-95 shadow-sm"
                >
                  {isPreviewExpanded ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
                  {isPreviewExpanded ? 'تصغير المعاينة' : 'توسيع العرض'}
                </button>
                <button onClick={() => { setSelectedFile(null); setIsPreviewExpanded(false); }} className="p-4 bg-white hover:bg-slate-50 rounded-2xl transition-all text-slate-400 hover:text-rose-600 shadow-sm border border-slate-200 active:scale-90">
                  <X size={28} />
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 md:p-12 custom-scrollbar">
              <div className={`grid grid-cols-1 gap-12 transition-all duration-700 ${isPreviewExpanded ? 'lg:grid-cols-1' : 'lg:grid-cols-3'}`}>
                 
                 {/* Details Content - Hide when fully expanded for immersive preview */}
                 {!isPreviewExpanded && (
                   <div className="lg:col-span-2 space-y-10 animate-in fade-in slide-in-from-right-4 duration-500">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <DetailItem label="الجهة المصدرة/المعنية" value={selectedFile.isoMetadata?.entity} icon={Layers} />
                        <DetailItem label="تاريخ الأرشفة الرسمية" value={new Date(selectedFile.isoMetadata?.createdAt || '').toLocaleDateString('ar-SA')} icon={Calendar} />
                        <DetailItem label="تصنيف الأهمية (ISO)" value={selectedFile.isoMetadata?.importance} icon={AlertCircle} badge={IMPORTANCE_COLORS[selectedFile.isoMetadata?.importance as keyof typeof IMPORTANCE_COLORS]} />
                        <DetailItem label="درجة السرية والأمان" value={selectedFile.isoMetadata?.confidentiality} icon={Shield} />
                      </div>
                      
                      <div className="space-y-4">
                        <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest block pr-3 border-r-4 border-indigo-500">التحليل العميق والمحتوى</label>
                        <div className="bg-slate-50 p-8 rounded-[2.5rem] border border-slate-200/50 shadow-inner text-slate-800 leading-relaxed font-bold text-lg">
                          {selectedFile.isoMetadata?.description}
                        </div>
                      </div>

                      {selectedFile.isoMetadata?.relatedFileIds && selectedFile.isoMetadata.relatedFileIds.length > 0 && (
                        <div className="space-y-5">
                          <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest block pr-3 border-r-4 border-indigo-500">السجلات ذات الصلة (ذكاء اصطناعي)</label>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {selectedFile.isoMetadata.relatedFileIds.map(rid => {
                              const refFile = files.find(f => f.isoMetadata?.recordId === rid || f.id === rid);
                              if (!refFile) return null;
                              return (
                                <button 
                                  key={rid}
                                  onClick={() => setSelectedFile(refFile)}
                                  className="flex items-center gap-4 p-5 bg-white border border-slate-200 rounded-3xl hover:border-indigo-400 hover:shadow-xl hover:-translate-y-1 transition-all text-right group"
                                >
                                  <div className="p-3 bg-indigo-50 rounded-xl text-indigo-500 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-sm">
                                     <LinkIcon size={18} />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-sm font-black text-slate-800 truncate leading-tight">{refFile.isoMetadata?.title || refFile.name}</p>
                                    <p className="text-[9px] text-slate-400 font-black mt-1 uppercase tracking-widest">{rid}</p>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
                        <DetailItem label="سياسة الحفظ والإتلاف" value={selectedFile.isoMetadata?.retentionPolicy} icon={Clock} />
                        <DetailItem label="تاريخ انتهاء الصلاحية" value={selectedFile.isoMetadata?.expiryDate ? new Date(selectedFile.isoMetadata.expiryDate).toLocaleDateString('ar-SA') : 'غير محدد'} icon={CalendarDays} />
                        <DetailItem label="الحالة في النظام" value={selectedFile.isoMetadata?.status} icon={CheckCircle2} />
                      </div>
                   </div>
                 )}

                 {/* Preview Content Area */}
                 <div className={`${isPreviewExpanded ? 'col-span-1 h-[75vh]' : 'lg:col-span-1'} space-y-8 animate-in fade-in slide-in-from-left-4 duration-500 flex flex-col`}>
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest block pr-3 border-r-4 border-indigo-500">معاينة المستند الرقمي</label>
                      {isPreviewExpanded && (
                        <button 
                          onClick={() => setIsPreviewExpanded(false)}
                          className="text-[10px] font-black text-indigo-600 hover:underline flex items-center gap-1"
                        >
                          <Minimize2 size={12} />
                          العودة للتفاصيل
                        </button>
                      )}
                    </div>
                    
                    <div className="flex-1">
                      <FilePreviewer 
                        record={selectedFile} 
                        expanded={isPreviewExpanded} 
                        onToggleExpand={() => setIsPreviewExpanded(!isPreviewExpanded)} 
                      />
                    </div>
                    
                    {!isPreviewExpanded && (
                      <div className="bg-indigo-50/40 p-8 rounded-[2.5rem] border border-indigo-100/50 space-y-5 shadow-sm">
                         <h5 className="font-black text-indigo-900 flex items-center gap-3 text-sm">
                            <Info size={20} className="text-indigo-500" />
                            الخصائص التقنية
                         </h5>
                         <div className="space-y-3 text-xs font-bold text-indigo-700/80">
                            <div className="flex justify-between items-center pb-2 border-b border-indigo-200/20">
                               <span>حجم الملف:</span>
                               <span className="font-black">{(selectedFile.size / 1024).toFixed(2)} KB</span>
                            </div>
                            <div className="flex justify-between items-center pb-2 border-b border-indigo-200/20">
                               <span>امتداد الملف:</span>
                               <span className="font-black uppercase">{selectedFile.name.split('.').pop()}</span>
                            </div>
                            <div className="flex justify-between items-center">
                               <span>تاريخ التعديل المادي:</span>
                               <span className="font-black">{new Date(selectedFile.lastModified).toLocaleDateString('ar-SA')}</span>
                            </div>
                         </div>
                      </div>
                    )}
                 </div>
              </div>
            </div>

            <div className="p-8 md:p-10 bg-slate-50/50 border-t border-slate-100 flex flex-col md:flex-row justify-end gap-4 shrink-0">
               <button 
                onClick={() => handleOpenInBrowser(selectedFile)}
                className="px-8 py-5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-2xl text-sm font-black transition-all active:scale-95 flex items-center justify-center gap-3 border border-indigo-200"
              >
                <ExternalLink size={22} />
                فتح في المتصفح
              </button>
              <button 
                onClick={() => { setSelectedFile(null); setIsPreviewExpanded(false); }} 
                className="px-10 py-5 text-sm font-black text-slate-500 hover:bg-white rounded-2xl transition-all border border-transparent hover:border-slate-200"
              >
                إغلاق النافذة
              </button>
              <button className="px-12 py-5 bg-slate-900 text-white rounded-2xl text-sm font-black shadow-2xl shadow-slate-900/30 hover:bg-black transition-all active:scale-95 flex items-center justify-center gap-3 border border-slate-800">
                 <Download size={22} />
                 تحميل النسخة الرقمية
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 20px; border: 3px solid transparent; background-clip: content-box; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
      `}</style>
    </div>
  );
};

const RadioIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="2"></circle>
    <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"></path>
  </svg>
);

const DetailItem = ({ label, value, icon: Icon, badge }: any) => (
  <div className="space-y-3">
    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block pr-2 border-r-2 border-slate-200">{label}</label>
    <div className="flex items-center gap-4 bg-slate-50/50 p-5 rounded-2xl border border-slate-100 transition-all shadow-sm hover:bg-white hover:border-indigo-100 group">
       <div className="bg-white p-3 rounded-xl shadow-sm group-hover:text-indigo-600 transition-colors">
          <Icon size={18} />
       </div>
       <span className={`text-sm md:text-base font-black text-slate-800 truncate ${badge || ''}`}>{value || 'غير متوفر'}</span>
    </div>
  </div>
);

const SidebarSection = ({ title, children, icon: Icon }: any) => (
  <div className="mb-12">
    <div className="flex items-center gap-3 px-5 mb-6">
      <Icon size={16} className="text-slate-500 opacity-40" />
      <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">{title}</span>
    </div>
    <div className="space-y-2">{children}</div>
  </div>
);

export default App;
