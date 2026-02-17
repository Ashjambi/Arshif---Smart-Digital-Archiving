import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { 
  FileText, Shield, Clock, AlertCircle, Search, Filter, Plus, MoreVertical, X, Send, Loader2, 
  FileSearch, CheckCircle2, Download, FolderPlus, ArrowRight, ChevronDown, Info, Calendar, 
  LayoutDashboard, Archive, Bot, Settings as SettingsIcon, Tag, FileCode, FileImage, 
  FileSpreadsheet, FileBox, FolderCheck, Zap, Trash2, Database, History, Sparkles, 
  RefreshCw, LogOut, User, Command, Activity, Layers, PlusCircle, MinusCircle, Edit3, 
  HardDrive, LayoutGrid, List as ListIcon, Eye, CalendarDays, Hash, Maximize2, Link as LinkIcon, 
  Minimize2, FileCheck, ExternalLink, AlertTriangle, Scale, Play, Pause, ScanText, FileDigit, 
  Fingerprint, MessageSquare, FileSignature, FileBadge, Users, UserCheck, Briefcase
} from 'lucide-react';
// @ts-ignore
import mammoth from 'mammoth';
// @ts-ignore
import Tesseract from 'tesseract.js';

import { 
  FileRecord, ISOMetadata, ChatMessage, DocumentType, Importance, Confidentiality, 
  ArchiveStatus, RetentionPolicy, RetentionAction, AuditLog, AuditAction
} from './types';
import { NAV_ITEMS, STATUS_COLORS, IMPORTANCE_COLORS } from './constants';
import { classifyFileContent, askAgent } from './services/geminiService';

const STORAGE_KEY = 'arshif_records_v3';
const BATCH_SIZE = 2; // تقليل حجم الدفعة لضمان عدم استهلاك الذاكرة بالكامل

const getFileIcon = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext || '')) return <FileImage size={24} className="text-pink-500" />;
  if (['xlsx', 'xls', 'csv'].includes(ext || '')) return <FileSpreadsheet size={24} className="text-emerald-500" />;
  if (['doc', 'docx'].includes(ext || '')) return <FileText size={24} className="text-blue-500" />;
  if (['pdf'].includes(ext || '')) return <FileBox size={24} className="text-red-500" />;
  return <FileText size={24} className="text-slate-400" />;
};

const DetailCard = ({ label, value, icon: Icon, colorClass = "text-indigo-600" }: { label: string, value?: string | number, icon: any, colorClass?: string }) => (
  <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-md hover:border-indigo-100 transition-all group flex flex-col h-full">
    <div className="flex items-center gap-3 mb-3">
      <div className={`p-2.5 rounded-xl bg-slate-50 group-hover:bg-indigo-50 transition-colors ${colorClass}`}>
        <Icon size={18} />
      </div>
      <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.1em]">{label}</p>
    </div>
    <p className="text-slate-800 text-sm font-bold leading-relaxed break-words text-wrap flex-1">{value || 'غير محدد'}</p>
  </div>
);

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [scanProgress, setScanProgress] = useState({ total: 0, current: 0, currentFile: '', status: 'idle', phase: '' });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFile, setSelectedFile] = useState<FileRecord | null>(null);
  
  const [messages, setMessages] = useState<ChatMessage[]>([{ id: '1', role: 'assistant', text: 'أهلاً بك، أنا خبير الأرشفة الاستراتيجي. كيف يمكنني مساعدتك اليوم؟', timestamp: new Date() }]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);

  useEffect(() => {
    const savedFiles = localStorage.getItem(STORAGE_KEY);
    if (savedFiles) setFiles(JSON.parse(savedFiles));
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
  }, [files]);

  const safeExtractText = async (file: File): Promise<string> => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    
    if (ext === 'docx') {
      try {
        // تنفيذ Mammoth مع وعد (Promise) خارجي لتجنب التعليق
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        return result.value.substring(0, 3000);
      } catch (err) {
        console.error("Mammoth failed:", err);
        return ""; // العودة بنص فارغ والاعتماد على اسم الملف
      }
    }
    
    if (['txt', 'json', 'csv'].includes(ext || '')) {
      return await file.text().then(t => t.substring(0, 3000));
    }

    return "";
  };

  const processFileChanges = async (newFiles: File[]) => {
    if (newFiles.length === 0) return;
    setScanProgress({ total: newFiles.length, current: 0, currentFile: 'تهيئة الأرشفة...', status: 'analyzing', phase: 'تحضير' });

    let updatedFileList = [...files];
    const archiveSummary = updatedFileList.slice(0, 10).map(f => f.isoMetadata?.title).join(', ');

    for (let i = 0; i < newFiles.length; i += BATCH_SIZE) {
      const batch = newFiles.slice(i, i + BATCH_SIZE);
      
      const batchPromises = batch.map(async (f) => {
        setScanProgress(p => ({ ...p, currentFile: f.name, phase: 'جاري فحص المستند...' }));
        
        // محاولة استخراج النص بهدوء، إذا فشل سنستخدم اسم الملف فقط
        const extractedText = await safeExtractText(f);
        
        setScanProgress(p => ({ ...p, phase: 'تحليل البيانات ذكياً...' }));
        
        // استدعاء Gemini - سيتم الاعتماد على اسم الملف إذا كان extractedText فارغاً
        const metadata = await classifyFileContent(f.name, extractedText || `اسم الملف: ${f.name}`, archiveSummary);
        
        const record: FileRecord = {
          id: Math.random().toString(36).substr(2, 9),
          name: f.name, size: f.size, type: f.type, lastModified: f.lastModified,
          isProcessing: false,
          extractedText: extractedText || "تعذر استخراج النص التفصيلي لهذا الملف.",
          isoMetadata: { 
            ...metadata as any, 
            originalPath: f.name, 
            recordId: `AR-${Date.now().toString().slice(-4)}${Math.floor(Math.random()*100)}` 
          }
        };
        return record;
      });

      try {
        const results = await Promise.all(batchPromises);
        updatedFileList = [...results, ...updatedFileList];
        setFiles([...updatedFileList]);
        setScanProgress(p => ({ ...p, current: Math.min(i + BATCH_SIZE, newFiles.length) }));
      } catch (err) {
        console.error("Batch error:", err);
      }
    }

    setScanProgress(p => ({ ...p, status: 'idle', phase: '' }));
  };

  const handleManualUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = e.target.files;
    if (uploadedFiles) processFileChanges(Array.from(uploadedFiles));
  };

  const filteredFiles = useMemo(() => {
    return files.filter(f => 
      f.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      f.isoMetadata?.title?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [files, searchQuery]);

  return (
    <div className="min-h-screen flex bg-[#fbfcfd] dir-rtl" dir="rtl">
      {/* Sidebar */}
      <aside className="w-80 bg-slate-900 text-slate-300 flex flex-col fixed h-full z-20 shadow-2xl">
        <div className="p-8">
          <div className="flex items-center gap-4 mb-16 group cursor-pointer" onClick={() => setActiveTab('dashboard')}>
            <div className="bg-indigo-600 w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-2xl group-hover:scale-110 transition-transform shadow-lg shadow-indigo-500/20">أ</div>
            <span className="text-2xl font-black text-white tracking-tight">أرشـيـف</span>
          </div>
          <div className="space-y-2">
            {NAV_ITEMS.map(item => (
              <button key={item.id} onClick={() => setActiveTab(item.id)} className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all ${activeTab === item.id ? 'bg-indigo-600 text-white font-black shadow-xl' : 'text-slate-400 hover:bg-slate-800'}`}>
                <item.icon size={20} /> <span className="text-sm">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      </aside>

      <main className="flex-1 mr-80 p-8">
        {activeTab === 'dashboard' && (
          <div className="space-y-8 animate-in fade-in duration-700">
            <header className="flex justify-between items-end bg-white p-10 rounded-[3rem] border border-slate-100 shadow-xl">
              <div>
                <h1 className="text-5xl font-black text-slate-900 tracking-tight">الأرشفة الذكية</h1>
                <p className="text-slate-500 mt-2 font-bold text-lg">نظام أرشفة إداري فائق السرعة والاستقرار</p>
              </div>
              <label className="bg-slate-900 text-white px-10 py-5 rounded-2xl flex items-center gap-3 cursor-pointer shadow-xl font-black hover:bg-black transition-all">
                <FolderPlus size={22} /> أرشفة مجلد
                <input type="file" multiple webkitdirectory="" className="hidden" onChange={handleManualUpload} />
              </label>
            </header>
            
            {scanProgress.status !== 'idle' && (
              <div className="bg-slate-900 text-white p-10 rounded-[3rem] shadow-2xl border border-indigo-500/30">
                <div className="flex items-center gap-6 mb-6">
                  <div className="bg-indigo-600 p-4 rounded-2xl animate-spin"><RefreshCw size={24} /></div>
                  <div className="flex-1">
                    <span className="font-black text-2xl block mb-1">جاري أرشفة: {scanProgress.currentFile}</span>
                    <span className="text-indigo-400 text-sm font-bold uppercase tracking-widest">{scanProgress.phase}</span>
                  </div>
                </div>
                <div className="w-full h-4 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: `${(scanProgress.current / scanProgress.total) * 100}%` }}></div>
                </div>
                <div className="flex justify-between mt-4">
                  <p className="text-xs text-slate-400 font-bold">تم إنجاز {scanProgress.current} من {scanProgress.total} ملف</p>
                  <p className="text-xs text-indigo-400 font-black animate-pulse text-left">النظام يعمل في الخلفية بثبات...</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {[
                { label: 'إجمالي السجلات', value: files.length, icon: <FileText className="text-indigo-600"/> },
                { label: 'سجلات نشطة', value: files.length, icon: <CheckCircle2 className="text-emerald-600"/> },
                { label: 'وضع التشغيل', value: 'آمن', icon: <Zap className="text-amber-600"/> },
                { label: 'المحرك الذكي', value: 'Flash 3', icon: <Bot className="text-rose-600"/> },
              ].map((s, i) => (
                <div key={i} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 flex items-center justify-between shadow-sm hover:shadow-xl transition-all">
                  <div><p className="text-xs text-slate-400 font-black mb-1 uppercase">{s.label}</p><h3 className="text-4xl font-black text-slate-800">{s.value}</h3></div>
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
                <p className="text-slate-500 mt-2 font-medium">حوكمة الوثائق والمراسلات الإدارية</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setViewMode('grid')} className={`p-4 rounded-2xl ${viewMode === 'grid' ? 'bg-indigo-600 text-white' : 'bg-slate-50'}`}><LayoutGrid size={22}/></button>
                <button onClick={() => setViewMode('list')} className={`p-4 rounded-2xl ${viewMode === 'list' ? 'bg-indigo-600 text-white' : 'bg-slate-50'}`}><ListIcon size={22}/></button>
              </div>
            </header>

            <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-lg">
              <div className="relative">
                <Search className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input type="text" placeholder="بحث سريع في العناوين..." className="w-full pl-6 pr-16 py-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              </div>
            </div>

            <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-3 gap-8" : "space-y-4"}>
              {filteredFiles.map(f => (
                <div key={f.id} onClick={() => setSelectedFile(f)} className="bg-white border border-slate-100 rounded-[2.5rem] p-8 hover:shadow-2xl transition-all cursor-pointer group">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="bg-slate-50 p-4 rounded-2xl group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-sm">{getFileIcon(f.name)}</div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-black text-slate-800 text-lg truncate">{f.isoMetadata?.title || f.name}</h3>
                      <span className="text-[10px] font-black text-slate-400 block mt-1">ID: {f.isoMetadata?.recordId}</span>
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
      </main>

      {/* Detail Modal */}
      {selectedFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/95 backdrop-blur-2xl animate-in fade-in">
          <div className="bg-white w-full max-w-6xl h-full max-h-[92vh] rounded-[3.5rem] shadow-2xl overflow-hidden flex flex-col border border-white/20 animate-in slide-in-from-bottom-12">
            <div className="p-10 border-b border-slate-100 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-8 min-w-0 flex-1">
                <div className="bg-indigo-600 p-6 rounded-3xl text-white shadow-2xl border-4 border-white">{getFileIcon(selectedFile.name)}</div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-4xl font-black text-slate-900 tracking-tight leading-tight whitespace-normal break-words text-wrap">
                    {selectedFile.isoMetadata?.title || selectedFile.name}
                  </h3>
                </div>
              </div>
              <button onClick={() => setSelectedFile(null)} className="p-4 bg-rose-50 text-rose-600 rounded-2xl hover:bg-rose-100 transition-colors"><X size={32}/></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-12 custom-scrollbar space-y-12">
              <section className="bg-gradient-to-br from-indigo-50 to-white p-12 rounded-[3.5rem] border border-indigo-100 relative overflow-hidden">
                <div className="absolute top-0 left-0 p-10 opacity-[0.05] pointer-events-none"><Sparkles size={180} /></div>
                <div className="flex items-center gap-5 mb-8">
                  <div className="p-4 bg-indigo-600 rounded-2xl text-white shadow-lg"><FileSignature size={32} /></div>
                  <h4 className="text-3xl font-black text-slate-900">الملخص التنفيذي الذكي</h4>
                </div>
                <p className="text-2xl font-bold text-slate-800 leading-[1.8] break-words whitespace-pre-wrap">
                  {selectedFile.isoMetadata?.description || 'تمت أرشفة المستند بنجاح بناءً على بيانات الملف المتاحة.'}
                </p>
              </section>

              <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                <DetailCard label="المرسل / الجهة" value={selectedFile.isoMetadata?.sender} icon={User} />
                <DetailCard label="المستلم الرئيسي" value={selectedFile.isoMetadata?.recipient} icon={UserCheck} />
                <DetailCard label="رقم القيد / الصادر" value={selectedFile.isoMetadata?.outgoingNumber || selectedFile.isoMetadata?.incomingNumber} icon={Hash} colorClass="text-emerald-600" />
                <DetailCard label="التصنيف الموضوعي" value={selectedFile.isoMetadata?.category} icon={Tag} colorClass="text-amber-600" />
                <DetailCard label="درجة السرية" value={selectedFile.isoMetadata?.confidentiality} icon={Shield} colorClass="text-rose-600" />
                <DetailCard label="الأهمية الإدارية" value={selectedFile.isoMetadata?.importance} icon={AlertCircle} colorClass="text-orange-600" />
              </section>
            </div>
            
            <div className="p-10 bg-slate-50 border-t border-slate-100 flex justify-end gap-6 shrink-0">
               <button onClick={() => setSelectedFile(null)} className="px-10 py-5 bg-white border border-slate-200 text-slate-600 rounded-2xl text-lg font-black hover:bg-slate-50 transition-all shadow-sm">إغلاق</button>
               <button className="px-16 py-5 bg-indigo-600 text-white rounded-2xl text-lg font-black shadow-2xl hover:bg-black transition-all shadow-indigo-500/20">تحميل المستند</button>
            </div>
          </div>
        </div>
      )}
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 10px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 20px; border: 4px solid transparent; background-clip: content-box; }
        .dir-rtl { direction: rtl; }
      `}</style>
    </div>
  );
};

export default App;