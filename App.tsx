import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { 
  FileText, Shield, Clock, AlertCircle, Search, Filter, Plus, X, Send, Loader2, 
  CheckCircle2, Download, FolderPlus, ArrowRight, Bot, Tag, FileImage, 
  FileSpreadsheet, FileBox, RefreshCw, Sparkles, User, Hash, ScanText, LayoutGrid, List as ListIcon, Maximize2, ExternalLink
} from 'lucide-react';
// @ts-ignore
import mammoth from 'mammoth';

import { 
  FileRecord, ISOMetadata, ChatMessage, DocumentType, Importance, Confidentiality, 
  ArchiveStatus
} from './types';
import { NAV_ITEMS } from './constants';
import { classifyFileContent, askAgent } from './services/geminiService';

const STORAGE_KEY = 'arshif_v7_final';

const getFileIcon = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) return <FileImage size={24} className="text-pink-500" />;
  if (['xlsx', 'xls', 'csv'].includes(ext || '')) return <FileSpreadsheet size={24} className="text-emerald-500" />;
  if (['doc', 'docx'].includes(ext || '')) return <FileText size={24} className="text-blue-500" />;
  if (['pdf'].includes(ext || '')) return <FileBox size={24} className="text-red-500" />;
  return <FileText size={24} className="text-slate-400" />;
};

const DetailCard = ({ label, value, icon: Icon, colorClass = "text-indigo-600" }: { label: string, value?: string | number, icon: any, colorClass?: string }) => (
  <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-md transition-all group flex flex-col h-full">
    <div className="flex items-center gap-3 mb-3">
      <div className={`p-2.5 rounded-xl bg-slate-50 group-hover:bg-indigo-50 transition-colors ${colorClass}`}>
        <Icon size={18} />
      </div>
      <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.1em]">{label}</p>
    </div>
    <p className="text-slate-800 text-sm font-bold leading-relaxed break-words">{value || 'غير محدد'}</p>
  </div>
);

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [scanProgress, setScanProgress] = useState({ total: 0, current: 0, currentFile: '', status: 'idle' });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  
  const selectedFile = useMemo(() => files.find(f => f.id === selectedFileId) || null, [files, selectedFileId]);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) try { setFiles(JSON.parse(saved)); } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    if (files.length > 0) localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
  }, [files]);

  const extractSafeText = async (file: File): Promise<string> => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    
    // سباق مع الزمن: 3 ثوانٍ فقط لاستخراج النص
    return new Promise(async (resolve) => {
      const timeout = setTimeout(() => resolve(""), 3000);

      try {
        if (ext === 'docx') {
          const buffer = await file.arrayBuffer();
          const res = await mammoth.extractRawText({ arrayBuffer: buffer });
          clearTimeout(timeout);
          resolve(res.value.substring(0, 3000));
        } else if (['txt', 'csv', 'json'].includes(ext || '')) {
          const text = await file.text();
          clearTimeout(timeout);
          resolve(text.substring(0, 3000));
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

  const processFileChanges = async (newFilesList: File[]) => {
    if (newFilesList.length === 0) return;
    setScanProgress({ total: newFilesList.length, current: 0, currentFile: 'تحضير الملفات...', status: 'scanning' });

    for (let i = 0; i < newFilesList.length; i++) {
      const f = newFilesList[i];
      const tempId = Math.random().toString(36).substr(2, 9);
      
      setScanProgress(p => ({ ...p, current: i, currentFile: f.name }));

      // 1. إضافة السجل فوراً كـ "قيد المعالجة"
      const initialRecord: FileRecord = {
        id: tempId, name: f.name, size: f.size, type: f.type, lastModified: f.lastModified,
        isProcessing: true, extractedText: "جاري القراءة والتحليل...",
        isoMetadata: { title: f.name, documentType: DocumentType.OTHER, recordId: "PENDING", status: ArchiveStatus.IN_PROCESS } as any
      };
      setFiles(prev => [initialRecord, ...prev]);

      try {
        // 2. استخراج النص
        const text = await extractSafeText(f);
        
        // 3. التحليل
        const metadata = await classifyFileContent(f.name, text || f.name);
        
        // 4. تحديث السجل نفسه
        setFiles(prev => prev.map(rec => rec.id === tempId ? {
          ...rec,
          isProcessing: false,
          extractedText: text || "لم يتم العثور على نص داخلي، تمت الفهرسة بالاسم.",
          isoMetadata: {
            ...rec.isoMetadata,
            ...metadata as any,
            recordId: `AR-${Date.now().toString().slice(-4)}`,
            status: ArchiveStatus.ACTIVE,
            updatedAt: new Date().toISOString()
          }
        } : rec));
      } catch (err) {
        setFiles(prev => prev.map(rec => rec.id === tempId ? { ...rec, isProcessing: false } : rec));
      }

      setScanProgress(p => ({ ...p, current: i + 1 }));
      await new Promise(r => setTimeout(r, 50)); 
    }

    setScanProgress(p => ({ ...p, status: 'idle' }));
  };

  const handleManualUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFileChanges(Array.from(e.target.files));
  };

  const filteredFiles = useMemo(() => {
    return files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()) || f.isoMetadata?.title?.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [files, searchQuery]);

  return (
    <div className="min-h-screen flex bg-[#fbfcfd]" dir="rtl">
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
          <div className="space-y-8 animate-in fade-in duration-500">
            <header className="flex justify-between items-end bg-white p-10 rounded-[3rem] border border-slate-100 shadow-xl">
              <div>
                <h1 className="text-5xl font-black text-slate-900 tracking-tight">الرئيسية</h1>
                <p className="text-slate-500 mt-2 font-bold text-lg">معالجة فورية للمستندات</p>
              </div>
              <label className="bg-slate-900 text-white px-10 py-5 rounded-2xl flex items-center gap-3 cursor-pointer shadow-xl font-black hover:bg-black transition-all">
                <FolderPlus size={22} /> أرشفة مجلد
                <input type="file" multiple webkitdirectory="" className="hidden" onChange={handleManualUpload} />
              </label>
            </header>

            {scanProgress.status !== 'idle' && (
              <div className="bg-slate-900 text-white p-10 rounded-[3rem] shadow-2xl">
                <div className="flex items-center gap-6 mb-4">
                  <RefreshCw className="animate-spin text-indigo-400" />
                  <span className="font-black text-xl">جاري معالجة: {scanProgress.currentFile}</span>
                </div>
                <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${(scanProgress.current / scanProgress.total) * 100}%` }}></div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
               {[
                 { label: 'إجمالي الأرشيف', value: files.length, icon: <FileText className="text-indigo-600" /> },
                 { label: 'جاري التحليل', value: files.filter(f => f.isProcessing).length, icon: <Loader2 className="animate-spin text-blue-500" /> },
                 { label: 'سجلات مكتملة', value: files.filter(f => !f.isProcessing).length, icon: <CheckCircle2 className="text-emerald-500" /> }
               ].map((s, i) => (
                 <div key={i} className="bg-white p-8 rounded-[2rem] border border-slate-100 flex items-center justify-between shadow-sm">
                   <div><p className="text-xs text-slate-400 font-black mb-1">{s.label}</p><h3 className="text-4xl font-black text-slate-800">{s.value}</h3></div>
                   <div className="bg-slate-50 p-5 rounded-3xl">{s.icon}</div>
                 </div>
               ))}
            </div>
          </div>
        )}

        {activeTab === 'archive' && (
          <div className="space-y-8">
            <header className="flex justify-between items-center bg-white p-10 rounded-[3rem] border border-slate-100 shadow-xl">
               <h1 className="text-4xl font-black text-slate-900">الأرشيف المركزي</h1>
               <div className="relative w-96">
                <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input type="text" placeholder="بحث..." className="w-full pr-12 pl-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {filteredFiles.map(f => (
                <div key={f.id} onClick={() => !f.isProcessing && setSelectedFileId(f.id)} className={`bg-white border border-slate-100 rounded-[2.5rem] p-8 transition-all relative ${f.isProcessing ? 'opacity-60 cursor-wait' : 'hover:shadow-2xl cursor-pointer group'}`}>
                   <div className="flex items-center gap-4 mb-6">
                    <div className={`p-4 rounded-2xl transition-all ${f.isProcessing ? 'bg-slate-100' : 'bg-slate-50 group-hover:bg-indigo-600 group-hover:text-white'}`}>{getFileIcon(f.name)}</div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-black text-slate-800 text-lg truncate">{f.isoMetadata?.title || f.name}</h3>
                      <span className="text-[10px] font-black text-slate-400 block mt-1">{f.isProcessing ? 'جاري التحليل...' : f.isoMetadata?.recordId}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-6 pt-6 border-t border-slate-50">
                    <span className="bg-slate-50 text-slate-600 px-3 py-1 rounded-lg text-[10px] font-black">{f.isoMetadata?.documentType}</span>
                    {f.isProcessing ? <Loader2 className="animate-spin text-indigo-500" size={18} /> : <ArrowRight size={18} className="text-slate-300" />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {selectedFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-xl animate-in fade-in">
          <div className="bg-white w-full max-w-6xl h-full max-h-[90vh] rounded-[3rem] shadow-2xl overflow-hidden flex flex-col">
            <div className="p-10 border-b border-slate-100 flex justify-between items-center">
              <div className="flex items-center gap-6">
                <div className="bg-indigo-600 p-5 rounded-2xl text-white">{getFileIcon(selectedFile.name)}</div>
                <h3 className="text-3xl font-black text-slate-900 truncate max-w-xl">{selectedFile.isoMetadata?.title}</h3>
              </div>
              <button onClick={() => setSelectedFileId(null)} className="p-4 bg-rose-50 text-rose-600 rounded-2xl hover:bg-rose-100"><X size={32}/></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-12 space-y-12 custom-scrollbar">
              <section className="bg-indigo-50/50 p-10 rounded-[2.5rem] border border-indigo-100">
                <h4 className="text-xl font-black text-indigo-900 mb-4 flex items-center gap-3"><Sparkles size={20}/> الملخص التنفيذي</h4>
                <p className="text-xl font-bold text-slate-800 leading-relaxed">{selectedFile.isoMetadata?.description}</p>
              </section>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <DetailCard label="المرسل" value={selectedFile.isoMetadata?.sender} icon={User} />
                <DetailCard label="المستلم" value={selectedFile.isoMetadata?.recipient} icon={User} colorClass="text-emerald-600" />
                <DetailCard label="التصنيف" value={selectedFile.isoMetadata?.category} icon={Tag} colorClass="text-amber-600" />
              </div>

              <section className="bg-slate-50 p-10 rounded-[2.5rem] border border-slate-100">
                <h4 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2"><ScanText size={20} /> النص المستخرج</h4>
                <div className="bg-white p-8 rounded-2xl border border-slate-200 text-slate-700 leading-relaxed font-mono text-sm max-h-[400px] overflow-y-auto whitespace-pre-wrap">
                   {selectedFile.extractedText}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 8px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
      `}</style>
    </div>
  );
};

export default App;