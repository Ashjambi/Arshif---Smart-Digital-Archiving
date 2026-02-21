
import React, { useState, useEffect, useRef } from 'react';
import { 
  FileText, Search, X, Send, Loader2, 
  Bot, Database, History, Zap, Save, Trash2,
  Sparkles, Link2, RotateCcw, ShieldCheck, 
  HardDrive, Menu, LogOut, Settings as SettingsIcon,
  Activity, FolderOpen, ChevronRight, Bell, FolderPlus,
  AlertTriangle
} from 'lucide-react';

import { 
  FileRecord, ArchiveStatus, AuditAction, AuditLog, ChatMessage, DocumentType, Importance, Confidentiality, ISOMetadata
} from './types';
import { NAV_ITEMS } from './constants';
import { askAgent, askAgentStream, analyzeSpecificFile } from './services/geminiService';

const STORAGE_KEY = 'ARSHIF_PRO_V12_FILES';
const AUDIT_KEY = 'ARSHIF_PRO_V12_AUDIT';
const INTEG_KEY = 'ARSHIF_PRO_V12_TELEGRAM';

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
  const [isSaving, setIsSaving] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const [integrations, setIntegrations] = useState({
    telegram: {
      connected: false,
      lastUpdateId: 0,
      config: { botToken: '', adminChatId: '' },
      stats: { messagesSent: 0 }
    }
  });

  const filesRef = useRef(files);
  const integrationsRef = useRef(integrations);
  const isAnalyzingRef = useRef(false);
  const isPollingRef = useRef(false);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { filesRef.current = files; }, [files]);
  useEffect(() => { integrationsRef.current = integrations; }, [integrations]);

  useEffect(() => {
    const savedFiles = localStorage.getItem(STORAGE_KEY);
    const savedAudit = localStorage.getItem(AUDIT_KEY);
    const savedInteg = localStorage.getItem(INTEG_KEY);
    if (savedFiles) { try { setFiles(JSON.parse(savedFiles)); } catch {} }
    if (savedAudit) { try { setAuditLogs(JSON.parse(savedAudit)); } catch {} }
    if (savedInteg) { try { setIntegrations(JSON.parse(savedInteg)); } catch {} }
  }, []);

  useEffect(() => {
    const toSave = files.map(({ originalFile, ...rest }) => rest);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    localStorage.setItem(AUDIT_KEY, JSON.stringify(auditLogs));
    localStorage.setItem(INTEG_KEY, JSON.stringify(integrations));
  }, [files, auditLogs, integrations]);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

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
          analysis = await analyzeSpecificFile(pending.name, pending.content || "No Content", undefined, false);
        }
        
        const isError = analysis.executiveSummary?.includes("فشل");

        if (isError && analysis.executiveSummary?.includes("API key")) {
             alert("⚠️ خطأ: مفتاح API غير صالح أو مفقود. يرجى التحقق من الإعدادات.");
        }

        setFiles(prev => prev.map(f => f.id === pending.id ? {
          ...f, 
          isProcessing: false,
          isoMetadata: { 
            ...f.isoMetadata!, 
            ...analysis, 
            updatedAt: new Date().toISOString(), 
            status: isError ? ArchiveStatus.IN_PROCESS : ArchiveStatus.ACTIVE,
            description: isError ? "تحتاج مراجعة" : (analysis.description || f.isoMetadata?.description || "")
          }
        } : f));

        if (!isError) {
            setAuditLogs(prev => [{ 
                id: Date.now().toString(), 
                action: AuditAction.UPDATE, 
                details: `تم تحليل: ${pending.name}`, 
                user: 'Gemini V2', 
                timestamp: new Date().toISOString() 
            }, ...prev]);
        }
      } catch (e) {
        console.error("Critical Failure:", e);
        setFiles(prev => prev.map(f => f.id === pending.id ? { ...f, isProcessing: false } : f));
      } finally { 
        isAnalyzingRef.current = false; 
      }
    };
    const interval = setInterval(runAnalysis, 4000);
    return () => clearInterval(interval);
  }, [files]);

  const sendToTelegram = async (text: string) => {
    const { botToken, adminChatId, connected } = integrationsRef.current.telegram;
    if (!connected || !botToken || !adminChatId) return;
    try {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: adminChatId, text: text, parse_mode: 'HTML' })
      });
      setIntegrations(p => ({...p, telegram: {...p.telegram, stats: {...p.telegram.stats, messagesSent: p.telegram.stats.messagesSent + 1}}}));
    } catch {}
  };

  useEffect(() => {
    const pollUpdates = async () => {
      const { botToken, adminChatId, connected, lastUpdateId } = integrationsRef.current.telegram;
      if (!connected || !botToken || !adminChatId || isPollingRef.current) return;
      
      isPollingRef.current = true;
      try {
        const offset = lastUpdateId + 1;
        const res = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates?offset=${offset}&timeout=5`);
        const data = await res.json();
        
        if (data.ok && data.result.length > 0) {
          for (const upd of data.result) {
            setIntegrations(p => ({ ...p, telegram: { ...p.telegram, lastUpdateId: upd.update_id } }));
            if (upd.message && String(upd.message.chat.id) === String(adminChatId) && upd.message.text) {
              const query = upd.message.text;
              const ctx = filesRef.current.slice(0, 10).map(f => `FILE: ${f.name} | SUMMARY: ${f.isoMetadata?.executiveSummary}`).join('\n');
              const reply = await askAgent(query, ctx);
              await sendToTelegram(reply);
            }
          }
        }
      } catch (e) { console.error(e); } finally { isPollingRef.current = false; }
    };
    const interval = setInterval(pollUpdates, 5000);
    return () => clearInterval(interval);
  }, [integrations.telegram.connected]);

  const handleSelectFolder = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (window.aistudio) {
      const hasKey = await window.aistudio.hasSelectedApiKey();
      if (!hasKey) {
        await window.aistudio.openSelectKey();
      }
    }

    const sel = e.target.files;
    if (!sel || sel.length === 0) return;
    setIsScanning(true);
    setScanProgress(0);
    const newRecords: FileRecord[] = [];
    for (let i = 0; i < sel.length; i++) {
      const f = sel[i];
      if (f.name.startsWith('.')) continue;
      newRecords.push({
        id: Math.random().toString(36).substr(2, 9).toUpperCase(),
        name: f.name, size: f.size, type: f.type, lastModified: f.lastModified,
        originalFile: f, isProcessing: true,
        isoMetadata: {
          recordId: `R-${Date.now().toString().slice(-6)}-${i}`, title: f.name, 
          description: "...", documentType: DocumentType.OTHER, 
          entity: "General", importance: Importance.NORMAL,
          confidentiality: Confidentiality.INTERNAL, status: ArchiveStatus.IN_PROCESS,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), 
          year: new Date().getFullYear(), originalPath: (f as any).webkitRelativePath || f.name, 
          retentionPolicy: "Standard", expiryDate: null
        }
      });
      setScanProgress(Math.round(((i + 1) / sel.length) * 100));
    }
    setFiles(prev => [...newRecords, ...prev]);
    setIsScanning(false);
  };

  const handleChat = async () => {
    if (!mainChatInput.trim() || isAgentLoading) return;
    
    if (window.aistudio) {
      const hasKey = await window.aistudio.hasSelectedApiKey();
      if (!hasKey) {
        await window.aistudio.openSelectKey();
        return; // Stop and let user select key
      }
    }

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
      setMainChatMessages(p => p.map(m => m.id === botId ? { ...m, text: "خطأ في الاتصال." } : m));
    }
    setIsAgentLoading(false);
  };

  const handleVerifyTelegram = async () => {
    const { botToken, adminChatId } = integrations.telegram.config;
    if (!botToken || !adminChatId) return alert("يرجى إدخال البيانات.");
    setIsVerifying(true);
    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
      const data = await res.json();
      if (data.ok) {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: adminChatId, text: "✅ <b>تم الاتصال:</b> النظام جاهز.", parse_mode: 'HTML' })
        });
        setIntegrations(p => ({ ...p, telegram: { ...p.telegram, connected: true } }));
        alert(`تم الربط مع: ${data.result.first_name}`);
      } else alert("فشل التحقق.");
    } catch { alert("خطأ في الاتصال."); } finally { setIsVerifying(false); }
  };

  const handleReset = () => {
    if (confirm("سيتم حذف كل البيانات. هل أنت متأكد؟")) {
      setFiles([]); setAuditLogs([]); localStorage.clear(); location.reload();
    }
  };

  return (
    <div className="min-h-screen flex bg-[#f8fafc] text-slate-900" dir="rtl">
      <aside className="w-80 bg-slate-900 text-slate-400 flex flex-col fixed h-full z-20 shadow-2xl border-l border-slate-800">
        <div className="p-8">
          <div className="flex items-center gap-4 mb-12">
            <div className="bg-indigo-600 w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-xl">أ</div>
            <div>
              <span className="text-2xl font-black text-white block tracking-tighter">أرشيف PRO</span>
              <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest">System V12</span>
            </div>
          </div>
          <nav className="space-y-2">
            {NAV_ITEMS.map(item => (
              <button key={item.id} onClick={() => setActiveTab(item.id)} className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all ${activeTab === item.id ? 'bg-indigo-600 text-white shadow-xl' : 'hover:bg-slate-800 hover:text-white'}`}>
                <item.icon size={20} /> <span className="text-sm font-bold">{item.label}</span>
              </button>
            ))}
          </nav>
        </div>
        <div className="mt-auto p-8 border-t border-slate-800">
           <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)] ${integrations.telegram.connected ? 'bg-emerald-500' : 'bg-orange-500'}`}></div>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">{integrations.telegram.connected ? 'Online' : 'Offline'}</span>
           </div>
        </div>
      </aside>

      <main className="flex-1 mr-80 p-10 overflow-y-auto">
        {activeTab === 'dashboard' && (
          <div className="max-w-6xl mx-auto space-y-8 animate-saas">
            <header className="flex justify-between items-center bg-white p-8 rounded-[2.5rem] border shadow-sm">
              <div><h1 className="text-4xl font-black text-slate-900">الرئيسية</h1><p className="text-slate-400 font-bold mt-1">نظام إدارة الأرشيف.</p></div>
              <div className="flex gap-4">
                 <div className="px-6 py-3 bg-indigo-50 text-indigo-600 rounded-2xl font-bold flex items-center gap-2 border border-indigo-100 shadow-sm"><Zap size={18} className="animate-pulse" /> Gemini Online</div>
              </div>
            </header>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-8">
                <div className="grid grid-cols-2 gap-6">
                  <div className="bg-white p-8 rounded-[2rem] border shadow-sm flex items-center justify-between">
                    <div><p className="text-xs font-black text-slate-400 uppercase mb-2">الملفات</p><h3 className="text-4xl font-black text-slate-800">{files.length}</h3></div>
                    <div className="bg-indigo-50 p-5 rounded-2xl text-indigo-600"><Database size={28} /></div>
                  </div>
                  <div className="bg-white p-8 rounded-[2rem] border shadow-sm flex items-center justify-between">
                    <div><p className="text-xs font-black text-slate-400 uppercase mb-2">تليجرام</p><h3 className="text-4xl font-black text-blue-600">{integrations.telegram.stats.messagesSent}</h3></div>
                    <div className="bg-blue-50 p-5 rounded-2xl text-blue-600"><Bot size={28} /></div>
                  </div>
                </div>
                <div className="bg-slate-900 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col h-[520px] relative">
                   <div className="p-6 border-b border-white/10 flex items-center gap-3 bg-slate-800/50 text-white"><Bot size={24} className="text-indigo-400" /><h3 className="font-black text-sm">المساعد الذكي</h3></div>
                   <div className="flex-1 overflow-y-auto p-6 space-y-4">
                      {mainChatMessages.map(msg => (
                         <div key={msg.id} className={`max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed ${msg.role === 'assistant' ? 'bg-slate-800 text-slate-200 self-start' : 'bg-indigo-600 text-white mr-auto self-end'}`}>{msg.text}</div>
                      ))}
                      {isAgentLoading && <div className="p-4 bg-slate-800 rounded-2xl w-24 flex justify-center"><Loader2 className="animate-spin text-indigo-500" size={16} /></div>}
                   </div>
                   <div className="p-4 bg-slate-800 border-t border-white/10">
                      <div className="flex gap-2 bg-slate-900 p-2 rounded-xl border border-white/5 shadow-inner">
                         <input type="text" className="flex-1 bg-transparent border-none outline-none text-white px-3 py-2 text-sm font-bold" placeholder="كيف أساعدك؟" value={mainChatInput} onChange={e => setChatInput(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleChat()} />
                         <button onClick={handleChat} className="bg-indigo-600 p-2 rounded-lg text-white hover:bg-indigo-500 transition-all"><Send size={18} /></button>
                      </div>
                   </div>
                </div>
              </div>
              <div className="bg-white p-8 rounded-[2.5rem] border shadow-sm flex flex-col">
                <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2"><History size={20} className="text-indigo-600" /> آخر الأنشطة</h3>
                <div className="space-y-6 flex-1 overflow-y-auto max-h-[500px] pr-2 custom-scroll">
                  {auditLogs.slice(0, 15).map(log => (
                    <div key={log.id} className="border-r-2 border-slate-100 pr-4 py-1">
                      <p className="text-[10px] font-black text-indigo-600 uppercase">{log.action}</p>
                      <p className="text-sm font-bold text-slate-700 mt-1">{log.details}</p>
                      <p className="text-[10px] text-slate-400 font-bold mt-1">{new Date(log.timestamp).toLocaleTimeString('ar-SA')}</p>
                    </div>
                  ))}
                  {auditLogs.length === 0 && <p className="text-slate-400 text-xs text-center py-20 font-bold">لا سجلات.</p>}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'archive' && (
          <div className="max-w-7xl mx-auto space-y-8 animate-saas">
            <header className="flex justify-between items-center bg-white p-8 rounded-[2.5rem] border shadow-sm">
              <div><h1 className="text-4xl font-black text-slate-900">الأرشيف المركزي</h1><p className="text-slate-400 font-bold mt-1">رفع المجلدات والملفات.</p></div>
              <div className="flex gap-4">
                <div className="relative w-80 shadow-sm rounded-2xl overflow-hidden">
                  <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input className="w-full pr-12 pl-4 py-4 bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none font-bold text-sm" placeholder="بحث..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                </div>
                <input type="file" ref={folderInputRef} className="hidden" multiple {...({ webkitdirectory: "", directory: "" } as any)} onChange={handleSelectFolder} />
                <button onClick={() => folderInputRef.current?.click()} className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black flex items-center gap-3 hover:bg-indigo-700 shadow-xl transition-all active:scale-95">
                  <FolderPlus size={24} /> رفع مجلد
                </button>
              </div>
            </header>

            {isScanning && (
              <div className="bg-indigo-600 text-white p-12 rounded-[2.5rem] shadow-2xl flex flex-col items-center gap-6 animate-in fade-in zoom-in">
                <Loader2 className="animate-spin" size={48} />
                <h3 className="text-2xl font-black">جاري المعالجة... {scanProgress}%</h3>
                <p className="font-bold opacity-80">يتم الفحص والتحليل...</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
              {files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase())).map(file => (
                <div key={file.id} onClick={() => setSelectedFileId(file.id)} className={`bg-white p-8 rounded-[2.5rem] border hover:shadow-2xl transition-all cursor-pointer relative group overflow-hidden ${file.isoMetadata?.executiveSummary?.includes("فشل") ? "border-rose-200 bg-rose-50" : "border-slate-100"}`}>
                  {file.isProcessing && <div className="absolute top-6 left-6 animate-pulse bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full text-[10px] font-black border border-indigo-100 flex items-center gap-1 shadow-sm z-20"><Loader2 size={10} className="animate-spin" /> تحليل...</div>}
                  {file.isoMetadata?.executiveSummary?.includes("فشل") && <div className="absolute top-6 left-6 bg-rose-100 text-rose-600 px-3 py-1 rounded-full text-[10px] font-black border border-rose-200 flex items-center gap-1 z-20"><AlertTriangle size={10} /> خطأ</div>}
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-6 transition-all shadow-sm ${file.isoMetadata?.executiveSummary?.includes("فشل") ? "bg-rose-100 text-rose-500" : "bg-slate-50 text-slate-400 group-hover:bg-indigo-600 group-hover:text-white"}`}><FileText size={28} /></div>
                  <h3 className="text-xl font-black text-slate-800 truncate mb-1 relative z-10">{file.isoMetadata?.title || file.name}</h3>
                  <p className="text-[10px] text-indigo-500 font-black tracking-widest uppercase mb-4 relative z-10">{file.isoMetadata?.recordId}</p>
                  <div className="flex items-center justify-between text-[10px] font-black text-slate-400 border-t pt-4 relative z-10">
                     <span>{file.isoMetadata?.documentType}</span>
                     <span className="text-indigo-600">{new Date(file.lastModified).toLocaleDateString('ar-EG')}</span>
                  </div>
                </div>
              ))}
              {files.length === 0 && !isScanning && (
                <div className="col-span-full py-40 flex flex-col items-center justify-center bg-white rounded-[3rem] border-2 border-dashed border-slate-200 opacity-60">
                   <FolderOpen size={64} className="text-slate-300 mb-6" />
                   <h3 className="text-2xl font-black text-slate-800">لا توجد ملفات</h3>
                   <p className="text-slate-500 font-bold mt-2">ابدأ برفع مجلد.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-4xl mx-auto animate-saas space-y-8">
            <header className="flex justify-between items-center bg-white p-8 rounded-[2.5rem] border shadow-sm">
              <h1 className="text-4xl font-black text-slate-900">الإعدادات</h1>
              <button onClick={() => { setIsSaving(true); setTimeout(() => setIsSaving(false), 1000); }} className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black flex items-center gap-3 hover:bg-indigo-700 shadow-xl transition-all active:scale-95">
                {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />} حفظ التغييرات
              </button>
            </header>

            <div className="bg-white rounded-[3rem] border shadow-xl flex min-h-[550px] overflow-hidden">
              <aside className="w-64 bg-slate-50 border-l p-8 space-y-2">
                <button onClick={() => setSettingsTab('general')} className={`w-full text-right px-6 py-4 rounded-2xl font-bold transition-all ${settingsTab === 'general' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}>الإدارة العامة</button>
                <button onClick={() => setSettingsTab('telegram')} className={`w-full text-right px-6 py-4 rounded-2xl font-bold transition-all ${settingsTab === 'telegram' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}>تكامل تليجرام</button>
              </aside>
              <div className="flex-1 p-12 overflow-y-auto custom-scroll">
                {settingsTab === 'general' && (
                  <div className="space-y-12 animate-in fade-in">
                    <section>
                      <h3 className="text-2xl font-black mb-6 flex items-center gap-3 text-slate-800"><RotateCcw size={24} className="text-indigo-600" /> إدارة البيانات</h3>
                      <div className="bg-rose-50 p-8 rounded-[2rem] border border-rose-100 border-dashed">
                        <p className="text-rose-700 font-bold mb-8 text-sm leading-relaxed">تصفير النظام سيؤدي لحذف جميع الأرشيف والإعدادات والربط مع تليجرام.</p>
                        <button onClick={handleReset} className="bg-rose-600 text-white px-8 py-4 rounded-2xl font-black flex items-center gap-3 hover:bg-rose-700 transition-all shadow-xl shadow-rose-200 active:scale-95">
                          <Trash2 size={20} /> تصفير شامل
                        </button>
                      </div>
                    </section>
                  </div>
                )}
                {settingsTab === 'telegram' && (
                  <div className="space-y-10 animate-in fade-in">
                    <div className="flex items-center justify-between">
                       <h3 className="text-2xl font-black text-slate-800 flex items-center gap-3"><Bot size={24} className="text-blue-500" /> إعدادات البوت</h3>
                       <div className={`px-4 py-1 rounded-full text-[10px] font-black border ${integrations.telegram.connected ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                          {integrations.telegram.connected ? 'متصل' : 'غير متصل'}
                       </div>
                    </div>
                    <div className="space-y-6 max-w-lg">
                      <div className="space-y-2">
                        <label className="text-xs font-black block text-slate-500 uppercase mr-1">Bot Token</label>
                        <input type="password" placeholder="123456:ABC-DEF..." className="w-full p-4 bg-slate-50 rounded-2xl outline-none font-mono text-xs border border-slate-200 focus:border-indigo-500 focus:bg-white transition-all shadow-sm" value={integrations.telegram.config.botToken} onChange={e => setIntegrations({ ...integrations, telegram: { ...integrations.telegram, config: { ...integrations.telegram.config, botToken: e.target.value } } })} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-black block text-slate-500 uppercase mr-1">Admin Chat ID</label>
                        <input type="text" placeholder="123456789..." className="w-full p-4 bg-slate-50 rounded-2xl outline-none font-mono text-xs border border-slate-200 focus:border-indigo-500 focus:bg-white transition-all shadow-sm" value={integrations.telegram.config.adminChatId} onChange={e => setIntegrations({ ...integrations, telegram: { ...integrations.telegram, config: { ...integrations.telegram.config, adminChatId: e.target.value } } })} />
                      </div>
                      <button onClick={handleVerifyTelegram} disabled={isVerifying} className="bg-slate-900 text-white w-full p-5 rounded-2xl font-black flex items-center justify-center gap-3 hover:bg-slate-800 transition-all shadow-xl disabled:opacity-50">
                        {isVerifying ? <Loader2 className="animate-spin" /> : <ShieldCheck />} حفظ والتحقق
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {selectedFileId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 backdrop-blur-xl p-4 animate-in fade-in">
           <div className="bg-white w-full max-w-4xl rounded-[3rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              <div className="p-10 border-b flex justify-between items-center bg-slate-50/50">
                 <div className="flex items-center gap-6">
                    <div className={`p-5 rounded-2xl text-white shadow-xl flex items-center justify-center ${files.find(f => f.id === selectedFileId)?.isoMetadata?.executiveSummary?.includes("فشل") ? "bg-rose-500" : "bg-indigo-600"}`}><FileText size={32} /></div>
                    <div>
                      <h3 className="text-3xl font-black text-slate-900 leading-tight truncate max-w-xl">{files.find(f => f.id === selectedFileId)?.isoMetadata?.title || files.find(f => f.id === selectedFileId)?.name}</h3>
                      <p className={`${files.find(f => f.id === selectedFileId)?.isoMetadata?.executiveSummary?.includes("فشل") ? "text-rose-600" : "text-indigo-600"} font-black text-sm uppercase mt-1 tracking-widest`}>{files.find(f => f.id === selectedFileId)?.isoMetadata?.recordId}</p>
                    </div>
                 </div>
                 <button onClick={() => setSelectedFileId(null)} className="p-4 hover:bg-rose-50 rounded-2xl border text-slate-400 hover:text-rose-600 transition-all shadow-sm"><X size={28} /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-12 space-y-10 custom-scroll">
                 <div className={`p-8 rounded-[2.5rem] border shadow-inner relative overflow-hidden ${files.find(f => f.id === selectedFileId)?.isoMetadata?.executiveSummary?.includes("فشل") ? "bg-rose-50 border-rose-100" : "bg-indigo-50 border-indigo-100"}`}>
                    <h4 className={`font-black mb-4 flex items-center gap-2 uppercase tracking-tighter text-xs font-bold ${files.find(f => f.id === selectedFileId)?.isoMetadata?.executiveSummary?.includes("فشل") ? "text-rose-600" : "text-indigo-600"}`}><Sparkles size={18} /> {files.find(f => f.id === selectedFileId)?.isoMetadata?.executiveSummary?.includes("فشل") ? "تقرير الخطأ" : "التحليل الذكي"}</h4>
                    <p className="text-slate-800 leading-9 text-sm font-bold text-justify whitespace-pre-wrap">{files.find(f => f.id === selectedFileId)?.isoMetadata?.executiveSummary}</p>
                 </div>
                 <div className="grid grid-cols-2 gap-6">
                    {[
                      { label: 'المرسل', value: files.find(f => f.id === selectedFileId)?.isoMetadata?.sender },
                      { label: 'المستلم', value: files.find(f => f.id === selectedFileId)?.isoMetadata?.recipient },
                      { label: 'رقم القيد', value: files.find(f => f.id === selectedFileId)?.isoMetadata?.incomingNumber, highlight: true },
                      { label: 'تاريخ الوثيقة', value: files.find(f => f.id === selectedFileId)?.isoMetadata?.fullDate },
                      { label: 'الأهمية', value: files.find(f => f.id === selectedFileId)?.isoMetadata?.importance },
                      { label: 'المسار الأصلي', value: files.find(f => f.id === selectedFileId)?.isoMetadata?.originalPath }
                    ].map((item, idx) => (
                      <div key={idx} className="p-6 bg-slate-50 rounded-2xl border flex justify-between items-center shadow-sm">
                        <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{item.label}</span>
                        <span className={`font-black text-sm ${item.highlight ? 'text-indigo-600 font-mono' : 'text-slate-700'}`}>{item.value || "-"}</span>
                      </div>
                    ))}
                 </div>
              </div>
              <div className="p-10 bg-slate-50/50 border-t flex justify-end gap-4">
                 <button onClick={() => setSelectedFileId(null)} className="px-10 py-5 bg-white border-2 border-slate-200 rounded-2xl font-black text-slate-600 hover:bg-slate-100 transition-all shadow-sm">إغلاق</button>
                 <button onClick={() => {
                    const f = files.find(f => f.id === selectedFileId);
                    if (f && integrations.telegram.connected) {
                        sendToTelegram(`📄 <b>مشاركة وثيقة:</b>\nعنوان: ${f.isoMetadata?.title}\nملخص: ${f.isoMetadata?.executiveSummary?.substring(0, 150)}...`).then(() => alert("تم الإرسال لتليجرام"));
                    } else alert("تليجرام غير متصل.");
                 }} className="px-12 py-5 bg-indigo-600 text-white rounded-2xl font-black shadow-xl hover:bg-indigo-700 transition-all flex items-center gap-2 active:scale-95">
                   <Send size={20} /> إرسال لتليجرام
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default App;
