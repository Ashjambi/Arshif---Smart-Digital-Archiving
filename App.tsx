
import React, { useState, useEffect, useRef } from 'react';
import { 
  FileText, Search, X, Send, Loader2, 
  Bot, Database, History, Zap, Save, Trash2,
  Sparkles, Link2, RotateCcw, ShieldCheck, 
  HardDrive, Menu, LogOut, Settings as SettingsIcon,
  Activity
} from 'lucide-react';

import { 
  FileRecord, ArchiveStatus, AuditAction, AuditLog, ChatMessage, DocumentType, Importance, Confidentiality, ISOMetadata
} from './types';
import { NAV_ITEMS } from './constants';
import { askAgent, askAgentStream, analyzeSpecificFile } from './services/geminiService';

const STORAGE_KEY = 'ARSHIF_SAS_PLATFORM_V8_FILES';
const AUDIT_KEY = 'ARSHIF_SAS_PLATFORM_V8_AUDIT';
const INTEGRATION_KEY = 'ARSHIF_SAS_PLATFORM_V8_TELEGRAM';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [settingsTab, setSettingsTab] = useState('general');
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [mainChatMessages, setMainChatMessages] = useState<ChatMessage[]>([]);
  const [mainChatInput, setChatInput] = useState('');
  const [isAgentLoading, setIsAgentLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [integrations, setIntegrations] = useState({
    telegram: {
      connected: false,
      lastUpdateId: 0,
      config: { botToken: '', adminChatId: '' },
      stats: { messagesSent: 0 }
    }
  });

  const isAnalyzingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // تحميل البيانات
  useEffect(() => {
    const savedFiles = localStorage.getItem(STORAGE_KEY);
    const savedAudit = localStorage.getItem(AUDIT_KEY);
    const savedInteg = localStorage.getItem(INTEGRATION_KEY);
    if (savedFiles) setFiles(JSON.parse(savedFiles));
    if (savedAudit) setAuditLogs(JSON.parse(savedAudit));
    if (savedInteg) setIntegrations(JSON.parse(savedInteg));
  }, []);

  // حفظ البيانات
  useEffect(() => {
    const toSave = files.map(({ originalFile, ...rest }) => rest);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    localStorage.setItem(AUDIT_KEY, JSON.stringify(auditLogs));
    localStorage.setItem(INTEGRATION_KEY, JSON.stringify(integrations));
  }, [files, auditLogs, integrations]);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // محرك التحليل الخلفي
  useEffect(() => {
    const runAnalysis = async () => {
      const pending = files.find(f => f.isProcessing);
      if (!pending || isAnalyzingRef.current) return;
      
      isAnalyzingRef.current = true;
      try {
        let analysis;
        if (pending.originalFile) {
          const b64 = await fileToBase64(pending.originalFile);
          analysis = await analyzeSpecificFile(pending.name, b64, pending.originalFile.type, true);
        } else {
          analysis = await analyzeSpecificFile(pending.name, pending.content || "", undefined, false);
        }
        
        setFiles(prev => prev.map(f => f.id === pending.id ? {
          ...f, 
          isProcessing: false,
          isoMetadata: { 
            ...f.isoMetadata!, 
            ...analysis, 
            updatedAt: new Date().toISOString(), 
            status: ArchiveStatus.ACTIVE,
            expiryDate: null
          }
        } : f));

        setAuditLogs(prev => [{ 
          id: Date.now().toString(), 
          action: AuditAction.UPDATE, 
          details: `تم تحليل الوثيقة: ${pending.name}`, 
          user: 'الذكاء الاصطناعي', 
          timestamp: new Date().toISOString() 
        }, ...prev]);

      } catch (e) {
        console.error("Analysis failed for file:", pending.id, e);
        setFiles(prev => prev.map(f => f.id === pending.id ? { ...f, isProcessing: false } : f));
      } finally { 
        isAnalyzingRef.current = false; 
      }
    };
    
    const interval = setInterval(runAnalysis, 4000);
    return () => clearInterval(interval);
  }, [files]);

  const handleSyncFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const sel = e.target.files;
    if (!sel || sel.length === 0) return;
    setIsScanning(true);
    const newRecords: FileRecord[] = [];
    for (let i = 0; i < sel.length; i++) {
      const f = sel[i];
      newRecords.push({
        id: Math.random().toString(36).substr(2, 9).toUpperCase(),
        name: f.name, size: f.size, type: f.type, lastModified: f.lastModified,
        originalFile: f, isProcessing: true,
        isoMetadata: {
          recordId: `ARC-${Date.now().toString().slice(-4)}-${i}`, title: f.name, 
          description: "تحليل جاري...", documentType: DocumentType.OTHER, 
          entity: "نظام الأرشفة", importance: Importance.NORMAL,
          confidentiality: Confidentiality.INTERNAL, status: ArchiveStatus.IN_PROCESS,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), 
          year: new Date().getFullYear(), originalPath: f.name, retentionPolicy: "معياري",
          expiryDate: null
        }
      });
      setScanProgress(Math.round(((i + 1) / sel.length) * 100));
    }
    setFiles(prev => [...newRecords, ...prev]);
    setIsScanning(false);
  };

  const handleChat = async () => {
    if (!mainChatInput.trim() || isAgentLoading) return;
    const input = mainChatInput; setChatInput('');
    setMainChatMessages(p => [...p, { id: Date.now().toString(), role: 'user', text: input, timestamp: new Date() }]);
    setIsAgentLoading(true);
    const botId = (Date.now() + 1).toString();
    setMainChatMessages(p => [...p, { id: botId, role: 'assistant', text: '', timestamp: new Date() }]);
    let full = "";
    try {
      const ctx = files.slice(0, 10).map(f => `${f.name}: ${f.isoMetadata?.executiveSummary}`).join('\n');
      const stream = askAgentStream(input, ctx);
      for await (const chunk of stream) {
        full += chunk;
        setMainChatMessages(p => p.map(m => m.id === botId ? { ...m, text: full } : m));
      }
    } catch { 
      setMainChatMessages(p => p.map(m => m.id === botId ? { ...m, text: "عذراً، المحرك يواجه ضغطاً حالياً." } : m));
    }
    setIsAgentLoading(false);
  };

  const handleReset = () => {
    if (confirm("⚠️ هل تود مسح الأرشيف بالكامل؟ لا يمكن التراجع عن هذا الإجراء.")) {
      setFiles([]);
      setAuditLogs([]);
      localStorage.clear();
      location.reload();
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      {/* Sidebar */}
      <aside className="w-72 bg-slate-900 text-white flex flex-col shadow-2xl relative z-30">
        <div className="p-8">
          <div className="flex items-center gap-3 mb-10">
            <div className="bg-indigo-600 w-10 h-10 rounded-xl flex items-center justify-center font-black text-xl shadow-lg">أ</div>
            <h1 className="text-xl font-bold tracking-tight">أرشيف PRO</h1>
          </div>
          <nav className="space-y-1">
            {NAV_ITEMS.map(item => (
              <button 
                key={item.id} 
                onClick={() => setActiveTab(item.id)} 
                className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all ${activeTab === item.id ? 'bg-indigo-600 shadow-xl' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
              >
                <item.icon size={20} /> <span className="text-sm font-bold">{item.label}</span>
              </button>
            ))}
          </nav>
        </div>
        <div className="mt-auto p-8 border-t border-slate-800 flex items-center gap-3">
           <div className="bg-emerald-500 w-3 h-3 rounded-full animate-pulse"></div>
           <span className="text-xs font-bold text-slate-400">النظام متصل</span>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-10 relative">
        {activeTab === 'dashboard' && (
          <div className="max-w-6xl mx-auto space-y-8 animate-saas">
            <header className="flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-black">الرئيسية</h1>
                <p className="text-slate-500 font-bold">ملخص الأداء والذكاء الاصطناعي</p>
              </div>
              <div className="bg-white p-2 rounded-2xl border shadow-sm flex items-center gap-4">
                 <div className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl font-black text-xs flex items-center gap-2">
                    <Zap size={14} /> محرك Gemini نشط
                 </div>
              </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-8">
                <div className="grid grid-cols-2 gap-6">
                  <div className="bg-white p-8 rounded-3xl border shadow-sm flex items-center justify-between">
                    <div><p className="text-xs font-black text-slate-400 uppercase mb-1">إجمالي الوثائق</p><h3 className="text-4xl font-black">{files.length}</h3></div>
                    <Database className="text-indigo-600" size={32} />
                  </div>
                  <div className="bg-white p-8 rounded-3xl border shadow-sm flex items-center justify-between">
                    <div><p className="text-xs font-black text-slate-400 uppercase mb-1">سجلات النشاط</p><h3 className="text-4xl font-black">{auditLogs.length}</h3></div>
                    <History className="text-blue-600" size={32} />
                  </div>
                </div>

                <div className="bg-slate-900 rounded-[2rem] shadow-2xl overflow-hidden flex flex-col h-[500px]">
                   <div className="p-5 border-b border-white/10 flex items-center gap-3 bg-slate-800/50 text-white">
                      <Bot size={22} className="text-indigo-400" />
                      <h3 className="font-bold text-sm">مساعد الأرشفة الذكي</h3>
                   </div>
                   <div className="flex-1 overflow-y-auto p-6 space-y-4 text-sm">
                      {mainChatMessages.length === 0 && <div className="text-slate-500 text-center py-20 italic">ابدأ الدردشة مع الوكيل حول وثائقك...</div>}
                      {mainChatMessages.map(msg => (
                         <div key={msg.id} className={`max-w-[80%] p-4 rounded-2xl leading-relaxed ${msg.role === 'assistant' ? 'bg-slate-800 text-slate-200 self-start' : 'bg-indigo-600 text-white mr-auto self-end'}`}>
                            {msg.text}
                         </div>
                      ))}
                      {isAgentLoading && <div className="p-4 bg-slate-800 rounded-2xl w-20 flex justify-center"><Loader2 className="animate-spin text-indigo-500" size={16} /></div>}
                   </div>
                   <div className="p-4 bg-slate-800 border-t border-white/10">
                      <div className="flex gap-2 bg-slate-900 p-2 rounded-xl border border-white/5 shadow-inner">
                         <input type="text" className="flex-1 bg-transparent border-none outline-none text-white px-3 py-2 text-sm" placeholder="اسأل الوكيل..." value={mainChatInput} onChange={e => setChatInput(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleChat()} />
                         <button onClick={handleChat} className="bg-indigo-600 p-2 rounded-lg text-white hover:bg-indigo-500 active:scale-95 transition-all"><Send size={18} /></button>
                      </div>
                   </div>
                </div>
              </div>

              <div className="bg-white p-8 rounded-3xl border shadow-sm flex flex-col">
                <h3 className="text-lg font-black mb-6 flex items-center gap-2 text-slate-800"><Activity size={20} className="text-indigo-600" /> النشاط الأخير</h3>
                <div className="space-y-4 flex-1 overflow-y-auto max-h-[400px]">
                  {auditLogs.slice(0, 10).map(log => (
                    <div key={log.id} className="border-r-2 border-slate-100 pr-4 py-1">
                      <p className="text-xs font-black text-indigo-600 uppercase leading-none mb-1">{log.action}</p>
                      <p className="text-xs font-bold text-slate-600">{log.details}</p>
                      <p className="text-[10px] text-slate-400 mt-1">{new Date(log.timestamp).toLocaleTimeString()}</p>
                    </div>
                  ))}
                  {auditLogs.length === 0 && <p className="text-slate-400 text-xs text-center py-10">لا توجد سجلات بعد.</p>}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'archive' && (
          <div className="max-w-7xl mx-auto space-y-8 animate-saas">
            <header className="flex justify-between items-center bg-white p-8 rounded-3xl border shadow-sm">
              <div><h1 className="text-3xl font-black">الأرشيف المركزي</h1><p className="text-slate-500 font-bold">إدارة الوثائق المصنفة ISO 15489</p></div>
              <div className="flex gap-4">
                <div className="relative">
                  <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input className="w-64 pr-12 pl-4 py-3 bg-slate-50 border-2 border-transparent focus:border-indigo-500 rounded-2xl outline-none font-bold text-sm transition-all" placeholder="بحث سريع..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                </div>
                <input type="file" ref={fileInputRef} className="hidden" multiple onChange={handleSyncFiles} />
                <button onClick={() => fileInputRef.current?.click()} className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-black flex items-center gap-2 hover:bg-indigo-700 shadow-xl transition-all">
                  <Link2 size={20} /> رفع ملفات
                </button>
              </div>
            </header>

            {isScanning && (
              <div className="bg-indigo-600 text-white p-8 rounded-3xl shadow-2xl flex flex-col items-center gap-4 animate-in fade-in zoom-in">
                <Loader2 className="animate-spin" size={32} />
                <h3 className="text-xl font-black">جاري المعالجة... {scanProgress}%</h3>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase())).map(file => (
                <div key={file.id} onClick={() => setSelectedFileId(file.id)} className="bg-white p-6 rounded-3xl border shadow-sm hover:shadow-xl transition-all cursor-pointer relative group overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500 opacity-0 group-hover:opacity-100 transition-all"></div>
                  {file.isProcessing && <div className="absolute top-4 left-4 bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full text-[10px] font-black border flex items-center gap-1 shadow-sm animate-pulse"><Loader2 size={10} className="animate-spin" /> تحليل...</div>}
                  <div className="bg-slate-50 w-12 h-12 rounded-xl flex items-center justify-center mb-4 text-slate-400 group-hover:bg-indigo-600 group-hover:text-white transition-all"><FileText size={24} /></div>
                  <h3 className="text-sm font-black text-slate-800 truncate mb-1">{file.isoMetadata?.title || file.name}</h3>
                  <p className="text-[10px] text-indigo-500 font-black tracking-widest uppercase">{file.isoMetadata?.recordId}</p>
                </div>
              ))}
              {files.length === 0 && !isScanning && (
                <div className="col-span-full py-40 flex flex-col items-center justify-center bg-white rounded-3xl border-2 border-dashed border-slate-200 opacity-60">
                   <HardDrive size={64} className="text-slate-300 mb-4" />
                   <h3 className="text-xl font-black text-slate-800">الأرشيف فارغ</h3>
                   <p className="text-slate-500 font-bold">ابدأ برفع الملفات ليتم أرشفتها ذكياً.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-4xl mx-auto animate-saas space-y-8">
            <header className="flex justify-between items-center bg-white p-8 rounded-3xl border shadow-sm">
              <h1 className="text-3xl font-black">الإعدادات</h1>
              <button onClick={() => { setIsSaving(true); setTimeout(() => setIsSaving(false), 1000); }} className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-black flex items-center gap-2 hover:bg-indigo-700 shadow-xl transition-all active:scale-95">
                {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />} حفظ
              </button>
            </header>

            <div className="bg-white rounded-[2.5rem] border shadow-xl flex min-h-[500px] overflow-hidden">
              <aside className="w-60 bg-slate-50 border-l p-6 space-y-1">
                <button onClick={() => setSettingsTab('general')} className={`w-full text-right px-5 py-3 rounded-xl font-bold text-sm transition-all ${settingsTab === 'general' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}>الإدارة العامة</button>
                <button onClick={() => setSettingsTab('security')} className={`w-full text-right px-5 py-3 rounded-xl font-bold text-sm transition-all ${settingsTab === 'security' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}>الأمن والسرية</button>
              </aside>
              <div className="flex-1 p-10">
                {settingsTab === 'general' && (
                  <div className="space-y-10 animate-in fade-in">
                    <section>
                      <h3 className="text-xl font-black mb-4 flex items-center gap-3 text-slate-800"><RotateCcw size={20} className="text-indigo-600" /> بيانات الأرشيف</h3>
                      <div className="bg-rose-50 p-6 rounded-3xl border border-rose-100">
                        <p className="text-rose-700 font-bold mb-6 text-sm">سيتم حذف كافة الملفات وسجلات النشاط نهائياً عند تصفير الأرشيف.</p>
                        <button onClick={handleReset} className="bg-rose-600 text-white px-6 py-3 rounded-xl font-black flex items-center gap-2 hover:bg-rose-700 transition-all shadow-lg active:scale-95">
                          <Trash2 size={18} /> تصفير الأرشيف بالكامل
                        </button>
                      </div>
                    </section>
                  </div>
                )}
                {settingsTab === 'security' && (
                  <div className="space-y-10 animate-in fade-in">
                    <section>
                      <h3 className="text-xl font-black mb-4 flex items-center gap-3 text-slate-800"><ShieldCheck size={20} className="text-emerald-600" /> سياسات الوصول</h3>
                      <div className="p-6 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
                        <p className="text-slate-500 text-sm font-bold italic">سيتم تفعيل ميزات الأمان المتقدمة في التحديث القادم.</p>
                      </div>
                    </section>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Detail Modal */}
      {selectedFileId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-6 animate-in fade-in">
           <div className="bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              <div className="p-8 border-b flex justify-between items-center bg-slate-50/50">
                 <div className="flex items-center gap-5">
                    <div className="bg-indigo-600 p-4 rounded-2xl text-white shadow-xl flex items-center justify-center"><FileText size={28} /></div>
                    <div>
                      <h3 className="text-2xl font-black text-slate-900 leading-tight truncate max-w-md">{files.find(f => f.id === selectedFileId)?.isoMetadata?.title || files.find(f => f.id === selectedFileId)?.name}</h3>
                      <p className="text-indigo-600 font-black text-xs uppercase tracking-widest">{files.find(f => f.id === selectedFileId)?.isoMetadata?.recordId}</p>
                    </div>
                 </div>
                 <button onClick={() => setSelectedFileId(null)} className="p-3 hover:bg-rose-50 rounded-xl text-slate-400 hover:text-rose-600 transition-all active:scale-90"><X size={24} /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-10 space-y-8 custom-scroll">
                 <div className="bg-indigo-50 p-6 rounded-3xl border border-indigo-100 relative overflow-hidden">
                    <h4 className="font-black text-indigo-600 mb-3 flex items-center gap-2 text-xs uppercase"><Sparkles size={16} /> الملخص الذكي (AI Analysis)</h4>
                    <p className="text-slate-800 leading-loose text-sm font-bold text-justify">
                      {files.find(f => f.id === selectedFileId)?.isoMetadata?.executiveSummary || "جاري التحليل واستخراج البيانات..."}
                    </p>
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    {[
                      { label: 'المرسل', value: files.find(f => f.id === selectedFileId)?.isoMetadata?.sender },
                      { label: 'المستلم', value: files.find(f => f.id === selectedFileId)?.isoMetadata?.recipient },
                      { label: 'رقم القيد', value: files.find(f => f.id === selectedFileId)?.isoMetadata?.incomingNumber },
                      { label: 'التاريخ', value: files.find(f => f.id === selectedFileId)?.isoMetadata?.fullDate },
                      { label: 'الأهمية', value: files.find(f => f.id === selectedFileId)?.isoMetadata?.importance },
                      { label: 'السرية', value: files.find(f => f.id === selectedFileId)?.isoMetadata?.confidentiality }
                    ].map((item, idx) => (
                      <div key={idx} className="p-4 bg-slate-50 rounded-2xl border flex flex-col shadow-sm">
                        <span className="text-[10px] text-slate-400 font-black uppercase mb-1">{item.label}</span>
                        <span className="font-bold text-sm text-slate-700">{item.value || "-"}</span>
                      </div>
                    ))}
                 </div>
              </div>
              <div className="p-8 bg-slate-50/50 border-t flex justify-end gap-3">
                 <button onClick={() => setSelectedFileId(null)} className="px-8 py-3 bg-white border-2 rounded-xl font-black text-slate-600 text-sm hover:bg-slate-100 transition-all">إغلاق</button>
                 <button className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-black text-sm shadow-xl hover:bg-indigo-700 active:scale-95 transition-all flex items-center gap-2">
                    تصدير البيانات
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default App;
