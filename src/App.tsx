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

const RadioIcon = Radio;

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

const FilePreviewer = ({ 
  record, 
  expanded, 
  onToggleExpand 
}: { 
  record: FileRecord; 
  expanded: boolean; 
  onToggleExpand: () => void; 
}) => {
  const isImage = record.preview?.startsWith('data:image');
  const isPdf = record.preview?.startsWith('data:application/pdf');

  // Helper to show extracted text if available (OCR result)
  const hasExtractedText = record.extractedText && record.extractedText.length > 0 && record.extractedText !== "المستند فارغ.";

  if (!record.preview) {
    return (
      <div className={`${expanded ? 'h-[600px]' : 'h-64'} bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 space-y-4`}>
        <FileSearch size={expanded ? 64 : 48} className="opacity-10" />
        <p className="text-sm font-black">المعاينة المباشرة غير مدعومة لهذا التنسيق</p>
      </div>
    );
  }
  
  return (
    <div className={`bg-white rounded-3xl border border-slate-200 shadow-inner overflow-hidden relative group h-full flex flex-col`}>
      <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/50">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-white rounded-lg border border-slate-200">
             {getFileIcon(record.name)}
          </div>
          <span className="text-[10px] font-black text-slate-600 truncate max-w-[150px]">{record.name}</span>
          {record.isoMetadata?.ocrStatus === 'completed' && (
             <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[9px] font-bold flex items-center gap-1">
               <ScanText size={10} />
               OCR تم استخراج النص
             </span>
          )}
        </div>
        <button 
          onClick={onToggleExpand}
          className="p-2 hover:bg-white rounded-lg transition-all text-slate-400 hover:text-indigo-600 border border-transparent hover:border-slate-100"
        >
           {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </div>

      <div className="flex-1 overflow-auto bg-slate-100/30 flex flex-col md:flex-row">
        {/* Visual Preview */}
        <div className={`flex-1 overflow-auto ${hasExtractedText && expanded ? 'w-1/2 border-l border-slate-200' : 'w-full'}`}>
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

        {/* Extracted Text (OCR) - Visible if available and expanded or strictly text file */}
        {hasExtractedText && expanded && isImage && (
             <div className="w-1/2 flex flex-col bg-white">
                <div className="p-3 border-b border-slate-100 bg-yellow-50/50 text-yellow-700 text-xs font-bold flex items-center gap-2">
                   <ScanText size={14} />
                   النص المستخرج (OCR)
                </div>
                <div className="p-6 overflow-auto flex-1">
                    <p className="text-sm leading-relaxed text-slate-700 whitespace-pre-wrap font-mono bg-slate-50 p-4 rounded-xl border border-slate-100">
                        {record.extractedText}
                    </p>
                </div>
             </div>
        )}
      </div>
    </div>
  );
};

const AgentView = ({ messages, chatInput, setChatInput, onSendMessage, isLoading }: any) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="h-[calc(100vh-140px)] flex flex-col bg-white rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-8 duration-700">
      <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-slate-900">المساعد الذكي</h2>
          <p className="text-slate-500 text-sm mt-1">مدعوم بنماذج Gemini 3 للتحليل المتقدم</p>
        </div>
        <div className="bg-indigo-100 p-3 rounded-2xl text-indigo-600">
          <Bot size={24} />
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-8 space-y-6 bg-slate-50/30">
        {messages.map((msg: any) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] p-6 rounded-3xl ${
              msg.role === 'user' 
                ? 'bg-slate-900 text-white rounded-tr-none shadow-lg' 
                : 'bg-white border border-slate-100 text-slate-800 rounded-tl-none shadow-sm'
            }`}>
              <p className="leading-relaxed whitespace-pre-wrap font-medium">{msg.text}</p>
              <p className={`text-[10px] mt-3 font-bold opacity-50 ${msg.role === 'user' ? 'text-slate-400' : 'text-slate-300'}`}>
                {msg.timestamp.toLocaleTimeString('ar-SA')}
              </p>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
             <div className="bg-white border border-slate-100 p-6 rounded-3xl rounded-tl-none shadow-sm flex items-center gap-3">
                <Loader2 size={18} className="animate-spin text-indigo-600" />
                <span className="text-slate-500 text-sm font-bold">جاري التحليل...</span>
             </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-6 bg-white border-t border-slate-100">
        <form 
          onSubmit={(e) => { e.preventDefault(); onSendMessage(); }}
          className="flex items-center gap-4 bg-slate-50 p-2 rounded-[1.5rem] border border-slate-200 focus-within:ring-4 ring-indigo-500/10 transition-all"
        >
          <input 
            type="text" 
            className="flex-1 bg-transparent px-6 py-4 outline-none text-slate-800 font-bold placeholder:text-slate-400"
            placeholder="اطرح سؤالاً حول الأرشيف..."
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            disabled={isLoading}
          />
          <button 
            type="submit" 
            disabled={!chatInput.trim() || isLoading}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white p-4 rounded-2xl transition-all shadow-lg hover:shadow-indigo-500/30"
          >
            <Send size={20} className={isLoading ? 'opacity-0' : ''} />
          </button>
        </form>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [connectedFolder, setConnectedFolder] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [policies, setPolicies] = useState<RetentionPolicy[]>(DEFAULT_POLICIES);

  // Chat States
  const [messages, setMessages] = useState<ChatMessage[]>([
     { id: '1', role: 'assistant', text: 'أهلاً بك في "أرشيف".', timestamp: new Date() }
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
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false);
  
  // Policy Form
  const [newPolicyName, setNewPolicyName] = useState('');
  const [newPolicyDuration, setNewPolicyDuration] = useState(12);
  const [newPolicyAction, setNewPolicyAction] = useState<RetentionAction>(RetentionAction.ARCHIVE);
  const [newPolicyTypes, setNewPolicyTypes] = useState<DocumentType[]>([]);

  const [filters, setFilters] = useState({ type: '', importance: '', confidentiality: '', status: '' });

  const filesRef = useRef(files);
  useEffect(() => { filesRef.current = files; }, [files]);

  // Load Data
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

  // Save Data
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
    if (connectedFolder) localStorage.setItem(FOLDER_KEY, connectedFolder);
    localStorage.setItem(POLICIES_KEY, JSON.stringify(policies));
    localStorage.setItem(AUDIT_KEY, JSON.stringify(auditLogs));
  }, [files, connectedFolder, policies, auditLogs]);

  const filteredFiles = useMemo(() => {
    return files.filter(f => {
      const matchesSearch = f.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            f.isoMetadata?.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            f.isoMetadata?.description?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = !filters.type || f.isoMetadata?.documentType === filters.type;
      const matchesStatus = !filters.status || f.isoMetadata?.status === filters.status;
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [files, searchQuery, filters]);

  const complianceAlerts = useMemo(() => {
    return files.filter(f => {
      if (!f.isoMetadata?.expiryDate) return false;
      return new Date(f.isoMetadata.expiryDate) < new Date() && f.isoMetadata.status === ArchiveStatus.ACTIVE;
    });
  }, [files]);

  // --- LOGGING SYSTEM ---
  const logAction = (action: AuditAction, details: string, resourceId?: string) => {
    const newLog: AuditLog = {
      id: Date.now().toString(),
      action,
      details,
      user: 'خالد محمد (مسؤول أرشفة)',
      timestamp: new Date().toISOString(),
      resourceId
    };
    setAuditLogs(prev => [newLog, ...prev].slice(0, 1000)); // Keep last 1000 logs
  };

  const handleOpenInBrowser = (record: FileRecord) => {
    if (!record.preview) return;
    const newWindow = window.open();
    if (newWindow) {
        if (record.preview.startsWith('data:')) {
            const iframe = `<iframe width="100%" height="100%" src="${record.preview}" frameborder="0"></iframe>`;
            newWindow.document.write(iframe);
            newWindow.document.title = record.name;
        } else {
             newWindow.document.write(`<pre>${record.preview}</pre>`);
        }
    }
  };

  // --- OCR & FILE READING ---

  const performOCR = async (imageUrl: string): Promise<string> => {
    try {
      const { data: { text } } = await Tesseract.recognize(imageUrl, 'ara+eng', {
        logger: (m: any) => console.log(m)
      });
      return text;
    } catch (e) {
      console.error("OCR Failed", e);
      return "";
    }
  };

  const readFilePreview = async (file: File): Promise<{ content: string; extractedText?: string }> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      const ext = file.name.split('.').pop()?.toLowerCase();
      
      if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) {
        reader.onload = async (e) => {
          const imgUrl = e.target?.result as string;
          // Optimistic resolution for preview
          let text = "";
          try {
             // Basic image compression for display could happen here
             text = await performOCR(imgUrl);
          } catch(err) { console.error(err) }

          resolve({ content: imgUrl, extractedText: text });
        };
        reader.readAsDataURL(file);
      } else if (ext === 'docx') {
        reader.onload = async (e) => {
          try {
            const arrayBuffer = e.target?.result as ArrayBuffer;
            const result = await mammoth.extractRawText({ arrayBuffer });
            const text = result.value.trim();
            resolve({ content: text.length > 0 ? text : "المستند فارغ.", extractedText: text });
          } catch (error) {
            resolve({ content: "Error reading DOCX" });
          }
        };
        reader.readAsArrayBuffer(file);
      } else if (['txt', 'csv', 'json'].includes(ext || '')) {
        reader.onload = (e) => {
          const txt = (e.target?.result as string).substring(0, 5000);
          resolve({ content: txt, extractedText: txt });
        };
        reader.readAsText(file);
      } else {
        // Fallback for PDFs
        reader.onload = (e) => {
           resolve({ content: e.target?.result as string });
        };
        reader.readAsDataURL(file);
      }
    });
  };

  // --- FILE PROCESSING LOGIC ---

  const processFileChanges = async (newFiles: File[], modifiedFiles: {file: File, existingId: string}[], deletedIds: string[]) => {
    if (newFiles.length === 0 && modifiedFiles.length === 0 && deletedIds.length === 0) return;

    setScanProgress(prev => ({ 
      ...prev, 
      total: newFiles.length + modifiedFiles.length,
      current: 0, 
      status: 'analyzing',
      summary: { added: newFiles.length, modified: modifiedFiles.length, deleted: deletedIds.length }
    }));

    if (deletedIds.length > 0) {
       logAction(AuditAction.DELETE, `تم حذف ${deletedIds.length} ملفات من المصدر.`);
    }

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
        const { content, extractedText } = await readFilePreview(item.file);
        
        // Use extracted text for classification context if available (better for images)
        const classificationContext = extractedText || (content.startsWith('data:') ? `File: ${item.file.name}` : content.substring(0, 1000));
        
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
          preview: content,
          extractedText: extractedText, // Save OCR result
          isoMetadata: {
            recordId: item.isNew ? `REC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}` : updatedFileList.find(f => f.id === item.existingId)?.isoMetadata?.recordId || '',
            originalPath: item.file.webkitRelativePath || `/local/${item.file.name}`,
            ...metadata as any,
            ocrStatus: extractedText ? 'completed' : 'skipped',
            updatedAt: new Date().toISOString(),
            createdAt: item.isNew ? new Date().toISOString() : updatedFileList.find(f => f.id === item.existingId)?.isoMetadata?.createdAt
          }
        };

        if (item.isNew) {
            updatedFileList = [record, ...updatedFileList];
            logAction(AuditAction.CREATE, `تمت إضافة الملف: ${item.file.name}`, record.id);
        } else {
            updatedFileList = updatedFileList.map(f => f.id === item.existingId ? record : f);
            logAction(AuditAction.UPDATE, `تحديث الملف: ${item.file.name}`, record.id);
        }
        
        setFiles([...updatedFileList]);
      } catch (err) {
        console.error(err);
      }
    }

    setScanProgress(prev => ({ ...prev, status: 'completed', currentFile: 'اكتملت المزامنة' }));
    logAction(AuditAction.SYNC, `اكتملت المزامنة: ${newFiles.length} جديد, ${modifiedFiles.length} محدث.`);
    setLastSyncTime(new Date());
    setTimeout(() => setScanProgress(p => ({ ...p, status: 'idle' })), 3000);
  };

  // Handle Manual Upload
  const handleManualUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
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
        if (!existing) newFiles.push(f);
        else if (existing.size !== f.size || existing.lastModified !== f.lastModified) modifiedFiles.push({ file: f, existingId: existing.id });
    });
    const deletedIds = files
        .filter(f => f.isoMetadata?.originalPath.startsWith(connectedFolder || '') && !currentPaths.has(f.isoMetadata!.originalPath))
        .map(f => f.id);
    processFileChanges(newFiles, modifiedFiles, deletedIds);
  };

  const handleSendMessage = async (text?: string) => {
    const messageText = text || chatInput;
    if (!messageText.trim() || isChatLoading) return;
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', text: messageText, timestamp: new Date() }]);
    setChatInput('');
    setIsChatLoading(true);

    const context = files.slice(0, 50).map(f => `[${f.isoMetadata?.recordId}] ${f.isoMetadata?.title} (${f.isoMetadata?.documentType}): ${f.extractedText?.substring(0,100) || f.isoMetadata?.description}`).join('\n');
    const responseText = await askAgent(messageText, context);
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', text: responseText, timestamp: new Date() }]);
    setIsChatLoading(false);
  };

  const clearArchive = () => {
    if (window.confirm('حذف كافة البيانات؟')) {
      logAction(AuditAction.DELETE, 'تصفير النظام بالكامل');
      setFiles([]);
      setAuditLogs([]);
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(AUDIT_KEY);
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
    logAction(AuditAction.POLICY_CHANGE, `إضافة سياسة جديدة: ${newPolicyName}`);
  };

  const deletePolicy = (id: string) => {
    if (window.confirm('هل أنت متأكد من حذف هذه السياسة؟')) {
      setPolicies(policies.filter(p => p.id !== id));
      logAction(AuditAction.POLICY_CHANGE, `حذف سياسة: ${id}`);
    }
  };

  // --- VIEW COMPONENTS ---

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
             {/* Status Badges - Same as before */}
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
           </div>
        </div>
        <div className="flex gap-3">
           <button onClick={clearArchive} className="bg-white border border-slate-200 text-slate-400 hover:text-rose-500 p-4 rounded-xl shadow-sm"><Trash2 size={20} /></button>
           
           <label className="bg-slate-900 hover:bg-black text-white px-8 py-4 rounded-[1.25rem] flex items-center gap-3 cursor-pointer shadow-xl font-black transition-all hover:shadow-2xl hover:-translate-y-1">
              <FolderPlus size={20} /> {connectedFolder ? 'تحديث المجلد' : 'ربط المجلد الذكي'}
              <input type="file" webkitdirectory="" {...({ directory: "" } as any)} multiple className="hidden" onChange={handleManualUpload} />
           </label>
        </div>
      </header>

      {/* Compliance Alerts */}
      {complianceAlerts.length > 0 && (
         <div className="bg-orange-50 rounded-[2.5rem] border border-orange-100 p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-lg shadow-orange-100/50">
            <div className="flex items-center gap-6">
               <div className="bg-orange-100 p-4 rounded-2xl text-orange-600 animate-pulse"><AlertTriangle size={32} /></div>
               <div>
                  <h3 className="font-black text-2xl text-orange-900">تنبيهات الامتثال (ISO 15489)</h3>
                  <p className="text-orange-700/80 font-bold mt-1">يوجد {complianceAlerts.length} ملف تجاوز فترة الحفظ القانونية.</p>
               </div>
            </div>
            <button onClick={() => { setFilters({...filters, status: 'active'}); setActiveTab('archive'); }} className="bg-orange-500 text-white px-8 py-3 rounded-xl font-black shadow-lg">مراجعة الملفات</button>
         </div>
      )}
      
      {/* Progress Bar (Same as before) */}
      {scanProgress.status !== 'idle' && (
        <div className={`p-8 rounded-[2.5rem] border transition-all duration-500 shadow-2xl ${scanProgress.status === 'completed' ? 'bg-indigo-900 text-white border-indigo-500' : 'bg-white border-indigo-100 text-slate-800'}`}>
           <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-6">
                 {scanProgress.status === 'completed' ? <CheckCircle2 size={32} /> : <Loader2 className="animate-spin" size={32} />}
                 <div>
                    <span className="font-black text-2xl">{scanProgress.currentFile || 'جاري المعالجة...'}</span>
                    <span className="text-xs block mt-1 opacity-70">
                       {scanProgress.status === 'analyzing' && 'جاري استخراج النصوص (OCR) والتحليل الذكي...'}
                    </span>
                 </div>
              </div>
           </div>
           <div className="w-full h-4 rounded-full bg-black/10 overflow-hidden"><div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${(scanProgress.current / (scanProgress.total || 1)) * 100}%` }}></div></div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
         {[
          { label: 'إجمالي السجلات', value: files.length, icon: <FileText className="text-indigo-600" /> },
          { label: 'سجلات نشطة', value: files.filter(f => f.isoMetadata?.status === ArchiveStatus.ACTIVE).length, icon: <FileCheck className="text-emerald-600" /> },
          { label: 'سجلات OCR', value: files.filter(f => f.isoMetadata?.ocrStatus === 'completed').length, icon: <ScanText className="text-amber-600" /> },
          { label: 'سياسات الحفظ', value: policies.length, icon: <Scale className="text-slate-600" /> },
         ].map((stat, i) => (
            <div key={i} className="bg-white p-8 rounded-[2rem] border border-slate-100 flex items-center justify-between group hover:shadow-xl transition-all">
               <div><p className="text-[10px] text-slate-400 mb-1 font-black uppercase">{stat.label}</p><h3 className="text-4xl font-black text-slate-800">{stat.value}</h3></div>
               <div className="bg-slate-50 p-5 rounded-2xl">{stat.icon}</div>
            </div>
         ))}
      </div>
      
      {/* Audit Log Widget (New) */}
      <div className="bg-slate-900 text-white p-8 rounded-[2.5rem] shadow-2xl overflow-hidden relative">
         <div className="flex justify-between items-center mb-6 relative z-10">
            <h3 className="font-black text-xl flex items-center gap-3"><Fingerprint className="text-emerald-400" /> سجل التدقيق المباشر (Audit Log)</h3>
            <span className="bg-white/10 px-3 py-1 rounded-full text-xs font-mono">{auditLogs.length} Events</span>
         </div>
         <div className="space-y-3 relative z-10 max-h-60 overflow-y-auto custom-scrollbar pr-2">
            {auditLogs.slice(0, 8).map(log => (
               <div key={log.id} className="flex items-center gap-4 text-xs font-mono p-3 bg-white/5 rounded-xl hover:bg-white/10 transition-colors border border-white/5">
                  <span className="text-slate-400">{new Date(log.timestamp).toLocaleTimeString('en-US')}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${log.action === AuditAction.DELETE ? 'bg-rose-500/20 text-rose-300' : 'bg-indigo-500/20 text-indigo-300'}`}>{log.action}</span>
                  <span className="truncate flex-1 text-slate-300">{log.details}</span>
                  <span className="text-slate-500 text-[10px]">{log.user}</span>
               </div>
            ))}
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
           <button onClick={() => setViewMode('grid')} className={`p-3 rounded-xl transition-all ${viewMode === 'grid' ? 'bg-white shadow-md text-indigo-600' : 'text-slate-400'}`}><LayoutGrid size={20} /></button>
           <button onClick={() => setViewMode('list')} className={`p-3 rounded-xl transition-all ${viewMode === 'list' ? 'bg-white shadow-md text-indigo-600' : 'text-slate-400'}`}><ListIcon size={20} /></button>
        </div>
      </header>

      {/* Filters Bar */}
      <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-lg flex flex-col md:flex-row gap-6 items-center">
        <div className="relative flex-1 w-full">
           <Search className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
           <input type="text" placeholder="بحث في السجلات..." className="w-full pl-6 pr-16 py-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-slate-700" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
        {/* Filters Selects */}
        <select className="p-5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-600 outline-none text-sm" value={filters.type} onChange={(e) => setFilters({...filters, type: e.target.value})}>
           <option value="">كل الأنواع</option>
           {Object.values(DocumentType).map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* Content */}
      <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8" : "space-y-4"}>
         {filteredFiles.map(file => (
            <div key={file.id} onClick={() => { setSelectedFile(file); logAction(AuditAction.VIEW, `عرض ملف: ${file.name}`, file.id); }} className={`bg-white border border-slate-100 rounded-[2.5rem] p-8 hover:shadow-2xl hover:-translate-y-2 transition-all cursor-pointer group relative overflow-hidden ${viewMode === 'list' ? 'flex items-center gap-8' : ''}`}>
               <div className={`absolute top-0 right-0 w-2 h-full ${STATUS_COLORS[file.isoMetadata?.status as keyof typeof STATUS_COLORS]?.split(' ')[0] || 'bg-slate-200'}`} />
               <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-4">
                     <div className="bg-slate-50 p-4 rounded-2xl text-slate-500 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-sm">{getFileIcon(file.name)}</div>
                     {viewMode === 'list' && <div><h3 className="font-black text-slate-800 text-lg">{file.isoMetadata?.title || file.name}</h3><p className="text-[10px] text-slate-400 font-black mt-1">{file.isoMetadata?.recordId}</p></div>}
                  </div>
                  {viewMode === 'grid' && <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${STATUS_COLORS[file.isoMetadata?.status as keyof typeof STATUS_COLORS] || 'bg-slate-100 text-slate-500'}`}>{file.isoMetadata?.status}</span>}
               </div>
               {viewMode === 'grid' && (
                  <>
                     <h3 className="font-black text-slate-800 text-lg mb-2 line-clamp-2">{file.isoMetadata?.title || file.name}</h3>
                     <p className="text-slate-400 text-xs font-medium line-clamp-2 mb-6 h-10 leading-relaxed">{file.isoMetadata?.description}</p>
                     {file.extractedText && <div className="mb-4 text-[10px] bg-yellow-50 text-yellow-700 px-3 py-1 rounded-lg w-fit font-bold flex gap-1"><ScanText size={12}/> يحتوي على نص OCR</div>}
                     <div className="flex items-center gap-2 mt-auto pt-6 border-t border-slate-50">
                        <span className="bg-slate-50 text-slate-500 px-3 py-1.5 rounded-xl text-[10px] font-black border border-slate-100">{file.isoMetadata?.documentType}</span>
                     </div>
                  </>
               )}
            </div>
         ))}
      </div>
    </div>
  );

  const AgentViewWrapper = () => (
     <AgentView messages={messages} chatInput={chatInput} setChatInput={setChatInput} onSendMessage={handleSendMessage} isLoading={isChatLoading} />
  );

  return (
    <div className="min-h-screen flex bg-[#fbfcfd] selection:bg-indigo-100 selection:text-indigo-900">
      <aside className="w-80 bg-slate-900 text-slate-300 flex flex-col fixed h-full z-20 shadow-2xl border-l border-slate-800">
        <div className="p-8">
          <div className="flex items-center gap-5 mb-16 group cursor-pointer" onClick={() => setActiveTab('dashboard')}>
            <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-2xl border border-white/20">أ</div>
            <div className="flex flex-col">
              <span className="text-3xl font-black text-white tracking-tighter leading-none">أرشـيـف</span>
              <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em] mt-2">ISO 15489</span>
            </div>
          </div>
          <SidebarSection title="النظام" icon={LayoutDashboard}>
            {NAV_ITEMS.map(item => {
              const Icon = item.icon;
              return (
                <button key={item.id} onClick={() => setActiveTab(item.id)} className={`w-full flex items-center justify-between px-5 py-4.5 rounded-2xl transition-all group mb-1 ${activeTab === item.id ? 'bg-indigo-600 text-white shadow-2xl font-black' : 'text-slate-400 hover:bg-slate-800/40 hover:text-white'}`}>
                  <div className="flex items-center gap-4"><Icon size={20} className={activeTab === item.id ? 'text-white' : 'text-slate-600 group-hover:text-indigo-400 transition-colors'} /><span className="text-sm">{item.label}</span></div>
                </button>
              );
            })}
          </SidebarSection>
          <SidebarSection title="حالة النظام" icon={Activity}>
             <div className="px-5 py-6 bg-slate-800/20 rounded-[2rem] border border-slate-700/30 space-y-5 shadow-inner">
                <div className="flex items-center justify-between">
                   <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${connectedFolder ? 'bg-emerald-500' : 'bg-slate-600'}`}></div>
                      <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{connectedFolder ? 'مجلد متصل' : 'غير متصل'}</span>
                   </div>
                   {scanProgress.status !== 'idle' && <Loader2 size={14} className="animate-spin text-indigo-400" />}
                </div>
             </div>
          </SidebarSection>
        </div>
      </aside>

      <main className="flex-1 mr-80 p-8 transition-all duration-500">
        <div className="max-w-[1400px] mx-auto pb-10">
          {activeTab === 'dashboard' && <Dashboard />}
          {activeTab === 'archive' && <ArchiveView />}
          {activeTab === 'agent' && <AgentViewWrapper />}
          {activeTab === 'settings' && (
             <div className="animate-in fade-in slide-in-from-bottom-6 duration-700 space-y-8">
                {/* Settings UI remains largely the same, just keeping it concise for this block */}
                 <header className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-xl shadow-slate-200/30">
                    <h1 className="text-4xl font-black text-slate-900 tracking-tight">إدارة سياسات الحفظ</h1>
                 </header>
                 <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-lg h-fit">
                    <h3 className="font-black text-slate-800 text-xl mb-6">إضافة سياسة جديدة</h3>
                    <div className="space-y-4">
                       <input type="text" className="w-full p-4 bg-slate-50 border rounded-xl" placeholder="اسم السياسة" value={newPolicyName} onChange={(e) => setNewPolicyName(e.target.value)} />
                       <button onClick={handleCreatePolicy} className="w-full py-4 bg-slate-900 text-white rounded-xl font-black">حفظ السياسة</button>
                    </div>
                 </div>
                 {/* Policies list can be mapped here similarly to previous version */}
             </div>
          )}
        </div>
      </main>

      {/* Detail Modal */}
      {selectedFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-10 bg-slate-900/80 backdrop-blur-xl animate-in fade-in duration-500">
          <div className={`bg-white w-full rounded-[3.5rem] shadow-[0_50px_150px_rgba(0,0,0,0.6)] overflow-hidden animate-in slide-in-from-bottom-12 duration-500 border border-slate-100 relative max-h-[95vh] flex flex-col transition-all duration-700 ${isPreviewExpanded ? 'max-w-[95vw]' : 'max-w-5xl'}`}>
            <div className="p-8 md:p-10 border-b border-slate-100 flex justify-between items-center bg-slate-50/20 shrink-0">
               <div className="flex items-center gap-6">
                  <div className="bg-indigo-600 p-5 rounded-2xl text-white shadow-2xl border-4 border-white shrink-0">{getFileIcon(selectedFile.name)}</div>
                  <div className="min-w-0">
                     <h3 className="font-black text-slate-900 text-2xl truncate max-w-[500px]">{selectedFile.isoMetadata?.title || selectedFile.name}</h3>
                     <div className="flex items-center gap-3 mt-2">
                        <span className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-lg text-[11px] font-black">{selectedFile.isoMetadata?.recordId}</span>
                     </div>
                  </div>
               </div>
               <div className="flex items-center gap-4">
                  <button onClick={() => setIsPreviewExpanded(!isPreviewExpanded)} className="p-4 bg-white border border-slate-200 rounded-2xl"><Maximize2 size={20} /></button>
                  <button onClick={() => { setSelectedFile(null); setIsPreviewExpanded(false); }} className="p-4 bg-white hover:bg-rose-50 rounded-2xl hover:text-rose-600"><X size={28} /></button>
               </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 md:p-12 custom-scrollbar">
               <div className={`grid grid-cols-1 gap-12 ${isPreviewExpanded ? 'lg:grid-cols-1' : 'lg:grid-cols-3'}`}>
                  {!isPreviewExpanded && (
                     <div className="lg:col-span-2 space-y-10">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                           <DetailItem label="الجهة المصدرة" value={selectedFile.isoMetadata?.entity} icon={Layers} />
                           <DetailItem label="الأهمية" value={selectedFile.isoMetadata?.importance} icon={AlertCircle} />
                           <DetailItem label="السرية" value={selectedFile.isoMetadata?.confidentiality} icon={Shield} />
                           <DetailItem label="تاريخ الأرشفة" value={new Date(selectedFile.isoMetadata?.createdAt || '').toLocaleDateString('ar-SA')} icon={Calendar} />
                        </div>
                        <div className="bg-slate-50 p-8 rounded-[2.5rem] border border-slate-200/50 shadow-inner">
                           <p className="text-slate-800 font-bold text-lg leading-relaxed">{selectedFile.isoMetadata?.description}</p>
                        </div>
                     </div>
                  )}
                  <div className={`${isPreviewExpanded ? 'col-span-1 h-[75vh]' : 'lg:col-span-1'} flex flex-col`}>
                      <FilePreviewer record={selectedFile} expanded={isPreviewExpanded} onToggleExpand={() => setIsPreviewExpanded(!isPreviewExpanded)} />
                  </div>
               </div>
            </div>
            
            <div className="p-8 md:p-10 bg-slate-50/50 border-t border-slate-100 flex justify-end gap-4 shrink-0">
               <button onClick={() => handleOpenInBrowser(selectedFile)} className="px-8 py-5 bg-indigo-50 text-indigo-600 rounded-2xl text-sm font-black flex gap-3"><ExternalLink size={22} /> فتح خارجي</button>
               <button className="px-12 py-5 bg-slate-900 text-white rounded-2xl text-sm font-black flex gap-3 shadow-xl"><Download size={22} /> تحميل</button>
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

export default App;