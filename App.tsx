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

import { 
  FileRecord, ISOMetadata, ChatMessage, DocumentType, Importance, Confidentiality, 
  ArchiveStatus, RetentionPolicy, RetentionAction, AuditLog, AuditAction
} from './types';
import { NAV_ITEMS, STATUS_COLORS, IMPORTANCE_COLORS } from './constants';
import { classifyFileContent, askAgent } from './services/geminiService';

const STORAGE_KEY = 'arshif_records_v6';

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
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  
  const selectedFile = useMemo(() => files.find(f => f.id === selectedFileId) || null, [files, selectedFileId]);

  useEffect(() => {
    const savedFiles = localStorage.getItem(STORAGE_KEY);
    if (savedFiles) {
      try { setFiles(JSON.parse(savedFiles)); } catch (e) { console.error(e); }
    }
  }, []);

  useEffect(() => {
    if (files.length > 0) localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
  }, [files]);

  const readFileData = async (file: File): Promise<{ preview: string; text: string }> => {
    return new Promise(async (resolve) => {
      const ext = file.name.split('.').pop()?.toLowerCase();
      const reader = new FileReader();

      // معالجة ملفات الوورد
      if (ext === 'docx') {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const result = await mammoth.extractRawText({ arrayBuffer });
          resolve({ preview: "", text: result.value.substring(0, 4000) });
          return;
        } catch (err) {
          console.error("Word Error:", err);
          resolve({ preview: "", text: "" });
          return;
        }
      }

      // معالجة الصور والـ PDF للمعاينة
      if (['jpg', 'jpeg', 'png', 'pdf', 'webp'].includes(ext || '')) {
        reader.onload = (e) => resolve({ preview: e.target?.result as string, text: "" });
        reader.readAsDataURL(file);
        return;
      }

      // معالجة النصوص
      if (['txt', 'csv', 'json'].includes(ext || '')) {
        reader.onload = (e) => {
          const content = e.target?.result as string;
          resolve({ preview: content.substring(0, 1000), text: content.substring(0, 4000) });
        };
        reader.readAsText(file);
        return;
      }

      resolve({ preview: "", text: "" });
    });
  };

  const processFileChanges = async (newFiles: File[]) => {
    if (newFiles.length === 0) return;
    setScanProgress({ total: newFiles.length, current: 0, currentFile: 'تهيئة...', status: 'analyzing', phase: 'تحضير' });

    for (let i = 0; i < newFiles.length; i++) {
      const f = newFiles[i];
      const tempId = Math.random().toString(36).substr(2, 9);
      
      setScanProgress(p => ({ ...p, current: i, currentFile: f.name, phase: 'جاري القراءة والمعالجة...' }));

      const initialRecord: FileRecord = {
        id: tempId, name: f.name, size: f.size, type: f.type, lastModified: f.lastModified,
        isProcessing: true, extractedText: "جاري استخراج البيانات...",
        isoMetadata: { title: "جاري التحليل...", documentType: DocumentType.OTHER, recordId: "PENDING", status: ArchiveStatus.IN_PROCESS } as any
      };

      setFiles(prev => [initialRecord, ...prev]);

      try {
        // 1. القراءة المادية للملف
        const { preview, text } = await readFileData(f);
        
        // 2. التحليل بالذكاء الاصطناعي
        const archiveSummary = files.slice(0, 5).map(af => af.isoMetadata?.title).join(', ');
        const metadata = await classifyFileContent(f.name, text || `الملف: ${f.name}`, archiveSummary);
        
        // 3. تحديث السجل ببيانات كاملة
        setFiles(prev => prev.map(rec => rec.id === tempId ? {
          ...rec,
          isProcessing: false,
          preview,
          extractedText: text || "تمت الفهرسة بناءً على اسم الملف لعدم توفر نص داخلي.",
          isoMetadata: {
            ...rec.isoMetadata,
            ...metadata as any,
            recordId: `AR-${Date.now().toString().slice(-4)}-${i}`,
            status: ArchiveStatus.ACTIVE,
            updatedAt: new Date().toISOString()
          }
        } : rec));

      } catch (err) {
        console.error("Critical Processing Error:", err);
        setFiles(prev => prev.map(rec => rec.id === tempId ? {
          ...rec, isProcessing: false, 
          extractedText: "فشل استخراج النص، ولكن الملف مؤرشف بالاسم.",
          isoMetadata: { ...rec.isoMetadata!, title: f.name, status: ArchiveStatus.ACTIVE }
        } : rec));
      }

      setScanProgress(p => ({ ...p, current: i + 1 }));
      await new Promise(r => setTimeout(r, 100)); // للسماح بتحديث الـ UI
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
            <div className="bg-indigo-600 w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-2xl">أ</div>
            <span className="text-2xl font-black text-white">أرشـيـف</span>
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
                <h1 className="text-5xl font-black text-slate-900 tracking-tight">لوحة التحكم</h1>
                <p className="text-slate-500 mt-2 font-bold text-lg">الأرشفة الذكية بمعالجة لحظية</p>
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
                    <span className="font-black text-2xl block mb-1">جاري معالجة: {scanProgress.currentFile}</span>
                    <span className="text-indigo-400 text-sm font-bold uppercase tracking-widest">{scanProgress.phase}</span>
                  </div>
                </div>
                <div className="w-full h-4 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${(scanProgress.current / scanProgress.total) * 100}%` }}></div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {[
                { label: 'إجمالي السجلات', value: files.length, icon: <FileText className="text-indigo-600"/> },
                { label: 'سجلات مكتملة', value: files.filter(f => !f.isProcessing).length, icon: <CheckCircle2 className="text-emerald-600"/> },
                { label: 'جاري التحليل', value: files.filter(f => f.isProcessing).length, icon: <Loader2 className={`text-blue-600 ${files.some(f => f.isProcessing) ? 'animate-spin' : ''}`}/> },
                { label: 'الحالة', value: 'آمن', icon: <Zap className="text-amber-600"/> },
              ].map((s, i) => (
                <div key={i} className="bg-white p-8 rounded-[2rem] border border-slate-100 flex items-center justify-between shadow-sm">
                  <div><p className="text-[10px] text-slate-400 mb-1 font-black uppercase">{s.label}</p><h3 className="text-4xl font-black text-slate-800">{s.value}</h3></div>
                  <div className="bg-slate-50 p-5 rounded-3xl">{s.icon}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'archive' && (
          <div className="space-y-8">
            <header className="flex justify-between items-center bg-white p-10 rounded-[3rem] border border-slate-100 shadow-xl">
              <h1 className="text-4xl font-black text-slate-900 tracking-tight">الأرشيف المركزي</h1>
              <div className="relative w-96">
                <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input type="text" placeholder="بحث..." className="w-full pr-12 pl-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {filteredFiles.map(f => (
                <div key={f.id} onClick={() => !f.isProcessing && setSelectedFileId(f.id)} className={`bg-white border border-slate-100 rounded-[2.5rem] p-8 transition-all relative overflow-hidden ${f.isProcessing ? 'opacity-60 cursor-wait' : 'hover:shadow-2xl cursor-pointer group'}`}>
                  {f.isProcessing && (
                    <div className="absolute inset-0 bg-white/40 backdrop-blur-[1px] z-10 flex flex-col items-center justify-center gap-2">
                       <Loader2 className="animate-spin text-indigo-600" size={24} />
                       <span className="font-black text-[10px] text-indigo-900 uppercase">جاري المعالجة...</span>
                    </div>
                  )}
                  <div className="flex items-center gap-4 mb-6">
                    <div className={`p-4 rounded-2xl transition-all ${f.isProcessing ? 'bg-slate-100' : 'bg-slate-50 group-hover:bg-indigo-600 group-hover:text-white'}`}>{getFileIcon(f.name)}</div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-black text-slate-800 text-lg truncate">{f.isoMetadata?.title || f.name}</h3>
                      <span className="text-[10px] font-black text-slate-400 block mt-1">{f.isProcessing ? 'بانتظار المعالجة...' : `ID: ${f.isoMetadata?.recordId}`}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-6 pt-6 border-t border-slate-50">
                    <span className="bg-slate-50 text-slate-600 px-3 py-1.5 rounded-xl text-[10px] font-black">{f.isoMetadata?.documentType}</span>
                    <ArrowRight size={18} className="text-slate-300" />
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
          <div className="bg-white w-full max-w-6xl h-full max-h-[92vh] rounded-[3.5rem] shadow-2xl overflow-hidden flex flex-col border border-white/20">
            <div className="p-10 border-b border-slate-100 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-8 min-w-0 flex-1">
                <div className="bg-indigo-600 p-6 rounded-3xl text-white shadow-2xl">{getFileIcon(selectedFile.name)}</div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-4xl font-black text-slate-900 truncate">
                    {selectedFile.isoMetadata?.title || selectedFile.name}
                  </h3>
                </div>
              </div>
              <button onClick={() => setSelectedFileId(null)} className="p-4 bg-rose-50 text-rose-600 rounded-2xl hover:bg-rose-100"><X size={32}/></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-12 custom-scrollbar space-y-12">
              <section className="bg-indigo-50/50 p-12 rounded-[3.5rem] border border-indigo-100">
                <h4 className="text-2xl font-black text-indigo-900 mb-4 flex items-center gap-3"><Sparkles size={24}/> الملخص التنفيذي</h4>
                <p className="text-2xl font-bold text-slate-800 leading-[1.8]">
                  {selectedFile.isoMetadata?.description || 'لا يوجد ملخص متاح لهذا الملف.'}
                </p>
              </section>

              <section className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <DetailCard label="المرسل" value={selectedFile.isoMetadata?.sender} icon={User} />
                <DetailCard label="المستلم" value={selectedFile.isoMetadata?.recipient} icon={UserCheck} />
                <DetailCard label="التصنيف" value={selectedFile.isoMetadata?.category} icon={Tag} colorClass="text-amber-600" />
              </section>

              <section className="bg-slate-50 p-10 rounded-[2.5rem] border border-slate-100 shadow-inner">
                <h4 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2"><ScanText size={20} /> محتوى الملف المستخرج</h4>
                
                {selectedFile.preview?.startsWith('data:image') || selectedFile.preview?.startsWith('data:application/pdf') ? (
                  <div className="bg-white p-4 rounded-3xl border border-slate-200 mb-6 flex justify-center">
                    <iframe src={selectedFile.preview} className="w-full h-[500px] border-none rounded-2xl" />
                  </div>
                ) : null}

                <div className="bg-white p-10 rounded-3xl border border-slate-200 text-slate-700 leading-[2] font-mono text-sm max-h-[400px] overflow-y-auto custom-scrollbar whitespace-pre-wrap">
                   {selectedFile.extractedText || "لم يتم استخراج نص من هذا الملف."}
                </div>
              </section>
            </div>
            
            <div className="p-10 bg-slate-50 border-t border-slate-100 flex justify-end gap-6 shrink-0">
               <button onClick={() => setSelectedFileId(null)} className="px-10 py-5 bg-white border border-slate-200 text-slate-600 rounded-2xl text-lg font-black">إغلاق</button>
               <button className="px-16 py-5 bg-indigo-600 text-white rounded-2xl text-lg font-black shadow-2xl">تحميل</button>
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