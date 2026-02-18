
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  FileText, Search, Plus, X, Send, Loader2, 
  ArrowRight, Bot, FileImage, 
  FileBox, Activity, MessageSquare, Database, 
  Clock, Download, Trash2,
  AlertTriangle, Sparkles, Eye,
  Settings as SettingsIcon, ShieldCheck,
  ChevronLeft, Trash, Save, Info, Bell, Shield,
  Layers, Edit3, PlusCircle,
  History, CheckCircle2, Zap, Globe, ShieldAlert, Cpu,
  ChevronRight, Lock, Key, ExternalLink,
  MessageCircle, CheckCircle, Verified, Server, Code2, Globe2,
  Send as TelegramIcon, UserSquare2,
  HardDrive, FolderPlus, RefreshCw, FolderOpen,
  User, FileCheck, Archive, Scale, Smartphone, Hash, FileInput,
  Link2, LogOut, RotateCcw
} from 'lucide-react';

import { 
  FileRecord, ArchiveStatus, AuditAction, AuditLog, ChatMessage, DocumentType, Importance, Confidentiality, ISOMetadata
} from '../types';
import { NAV_ITEMS, STATUS_COLORS } from '../constants';
import { askAgent, askAgentStream, analyzeSpecificFile } from '../services/geminiService';

const STORAGE_KEY = 'ARSHIF_PLATFORM_V7_FILES';
const AUDIT_KEY = 'ARSHIF_PLATFORM_V7_AUDIT';
const INTEGRATION_KEY = 'ARSHIF_PLATFORM_V7_TELEGRAM';

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
  const [currentScanningFile, setCurrentScanningFile] = useState('');
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

  const filesRef = useRef(files);
  const integrationsRef = useRef(integrations);
  const isAnalyzingRef = useRef(false);
  const isPollingRef = useRef(false);
  const lastUpdateIdRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { filesRef.current = files; }, [files]);
  useEffect(() => { integrationsRef.current = integrations; }, [integrations]);

  useEffect(() => {
    const savedFiles = localStorage.getItem(STORAGE_KEY);
    const savedAudit = localStorage.getItem(AUDIT_KEY);
    const savedInteg = localStorage.getItem(INTEGRATION_KEY);
    if (savedFiles) setFiles(JSON.parse(savedFiles));
    if (savedAudit) setAuditLogs(JSON.parse(savedAudit));
    if (savedInteg) {
      const parsedInteg = JSON.parse(savedInteg);
      setIntegrations(parsedInteg);
      lastUpdateIdRef.current = parsedInteg.telegram.lastUpdateId || 0;
    }
  }, []);

  useEffect(() => {
    const toSave = files.map(({ originalFile, ...rest }) => rest);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    localStorage.setItem(AUDIT_KEY, JSON.stringify(auditLogs));
    localStorage.setItem(INTEGRATION_KEY, JSON.stringify(integrations));
  }, [files, auditLogs, integrations]);

  const handleResetArchive = () => {
    if (window.confirm("⚠️ هل تود مسح كافة البيانات؟")) {
      setFiles([]);
      setAuditLogs([]);
      setIntegrations({
        telegram: { connected: false, lastUpdateId: 0, config: { botToken: '', adminChatId: '' }, stats: { messagesSent: 0 } }
      });
      localStorage.clear();
      window.location.reload();
    }
  };

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
          user: 'Gemini Pro AI', 
          timestamp: new Date().toISOString() 
        }, ...prev]);

      } catch (e) {
        console.error("Analysis Queue Error:", e);
        setFiles(prev => prev.map(f => f.id === pending.id ? { ...f, isProcessing: false } : f));
      } finally { 
        isAnalyzingRef.current = false; 
      }
    };
    
    const interval = setInterval(runAnalysis, 5000);
    return () => clearInterval(interval);
  }, [files]);

  const sendToTelegram = async (text: string) => {
    const { botToken, adminChatId, connected } = integrationsRef.current.telegram;
    if (!connected || !botToken || !adminChatId) return;
    try {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: adminChatId, text, parse_mode: 'HTML' })
      });
      setIntegrations(p => ({...p, telegram: {...p.telegram, stats: {...p.telegram.stats, messagesSent: p.telegram.stats.messagesSent + 1}}}));
    } catch {}
  };

  const sendFileToTelegram = async (file: FileRecord) => {
    const { botToken, adminChatId, connected } = integrationsRef.current.telegram;
    if (!connected || !file.originalFile || !botToken) return false;
    const fd = new FormData();
    fd.append('chat_id', adminChatId);
    fd.append('document', file.originalFile);
    fd.append('caption', `📂 <b>المستند:</b> ${file.name}\n✅ تم التحليل الذكي.`);
    fd.append('parse_mode', 'HTML');
    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, { method: 'POST', body: fd });
      const data = await res.json();
      return data.ok;
    } catch { return false; }
  };

  useEffect(() => {
    const monitor = async () => {
      const { botToken, adminChatId, connected } = integrationsRef.current.telegram;
      if (!connected || !botToken || !adminChatId || isPollingRef.current) return;
      
      isPollingRef.current = true;
      try {
        const offset = lastUpdateIdRef.current + 1;
        const res = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates?offset=${offset}&timeout=15`);
        const data = await res.json();
        
        if (data.ok && data.result && data.result.length > 0) {
          for (const upd of data.result) {
            lastUpdateIdRef.current = upd.update_id;
            setIntegrations(p => ({ ...p, telegram: { ...p.telegram, lastUpdateId: upd.update_id } }));
            
            if (upd.message && String(upd.message.chat.id) === String(adminChatId) && upd.message.text) {
              const query = upd.message.text;
              const context = filesRef.current.slice(0, 10).map(f => 
                `[ID:${f.id}] ${f.name}: ${f.isoMetadata?.executiveSummary?.substring(0, 150)}`
              ).join('\n');
              
              const reply = await askAgent(query, context);
              
              if (reply.includes('[[DOWNLOAD:')) {
                const id = reply.match(/\[\[DOWNLOAD:(.*?)\]\]/)?.[1];
                const clean = reply.replace(/\[\[DOWNLOAD:.*?\]\]/, '');
                const target = filesRef.current.find(f => f.id === id || f.isoMetadata?.recordId === id);
                if (clean.trim()) await sendToTelegram(clean);
                if (target) await sendFileToTelegram(target);
                else await sendToTelegram("⚠️ عذراً، لم أجد الملف.");
              } else {
                await sendToTelegram(reply);
              }
            }
          }
        }
      } catch (e) {
        console.error("Polling Error", e);
      } finally {
        isPollingRef.current = false;
      }
    };
    
    const interval = setInterval(monitor, 3500);
    return () => clearInterval(interval);
  }, [integrations.telegram.connected]);

  const handleSyncFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const sel = e.target.files;
    if (!sel || sel.length === 0) return;
    setIsScanning(true);
    setScanProgress(0);
    const newRecords: FileRecord[] = [];
    for (let i = 0; i < sel.length; i++) {
      const f = sel[i];
      setCurrentScanningFile(f.name);
      newRecords.push({
        id: Math.random().toString(36).substr(2, 10).toUpperCase(),
        name: f.name, size: f.size, type: f.type, lastModified: f.lastModified,
        originalFile: f, isProcessing: true,
        isoMetadata: {
          recordId: `ARC-${Date.now().toString().slice(-4)}-${i}`, title: f.name, 
          description: "تحليل جاري...", documentType: DocumentType.OTHER, 
          entity: "مزامنة سحابية", importance: Importance.NORMAL,
          confidentiality: Confidentiality.INTERNAL, status: ArchiveStatus.IN_PROCESS,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), 
          year: new Date().getFullYear(), originalPath: f.name, retentionPolicy: "ISO 15489",
          expiryDate: null
        }
      });
      setScanProgress(Math.round(((i + 1) / sel.length) * 100));
      await new Promise(r => setTimeout(r, 20));
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
      setMainChatMessages(p => p.map(m => m.id === botId ? { ...m, text: "عذراً، المحرك مشغول." } : m));
    }
    setIsAgentLoading(false);
  };

  const handleVerifyTelegram = async () => {
    const { botToken, adminChatId } = integrations.telegram.config;
    if (!botToken || !adminChatId) return alert("البيانات ناقصة.");
    setIsVerifying(true);
    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: adminChatId, text: "🟢 <b>متصل:</b> أرشيف PRO نشط.", parse_mode: 'HTML' })
      });
      const data = await res.json();
      if (data.ok) {
        setIntegrations(p => ({ ...p, telegram: { ...p.telegram, connected: true } }));
        alert("نجح الربط!");
      } else alert("خطأ: " + data.description);
    } catch { alert("خطأ اتصال."); }
    finally { setIsVerifying(false); }
  };

  return (
    <div className="min-h-screen flex bg-[#fbfcfd]" dir="rtl">
      <aside className="w-80 bg-slate-900 text-slate-300 flex flex-col fixed h-full z-20 shadow-2xl border-l border-slate-800">
        <div className="p-8">
          <div className="flex items-center gap-4 mb-12">
            <div className="bg-indigo-600 w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-lg">أ</div>
            <div>
              <span className="text-2xl font-black text-white block">أرشـيـف PRO</span>
              <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest">ISO 15489 AI</span>
            </div>
          </div>
          <nav className="space-y-2">
            {NAV_ITEMS.map(item => (
              <button key={item.id} onClick={() => setActiveTab(item.id)} className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all ${activeTab === item.id ? 'bg-indigo-600 text-white shadow-xl' : 'text-slate-400 hover:bg-slate-800'}`}>
                <item.icon size={20} /> <span className="text-sm font-bold">{item.label}</span>
              </button>
            ))}
          </nav>
        </div>
      </aside>

      <main className="flex-1 mr-80 p-10 overflow-y-auto">
        {activeTab === 'dashboard' && (
          <div className="space-y-8 animate-saas max-w-7xl mx-auto">
            <header className="flex justify-between items-center bg-white p-8 rounded-[2.5rem] border shadow-sm">
              <div>
                <h1 className="text-4xl font-black text-slate-900">نظرة عامة</h1>
                <p className="text-slate-400 font-bold mt-1">نظام الأرشفة الذكي - مدعوم بـ Gemini 3 Pro.</p>
              </div>
              <div className="flex gap-4">
                 <div className="px-6 py-3 bg-indigo-50 text-indigo-600 rounded-2xl font-bold flex items-center gap-2 border border-indigo-100 shadow-sm">
                    <Zap size={20} className="animate-pulse" /> المحرك نشط (Thinking Mode)
                 </div>
              </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-8">
                <div className="grid grid-cols-2 gap-6">
                  <div className="bg-white p-8 rounded-[2rem] border shadow-sm flex items-center justify-between">
                    <div><p className="text-xs font-black text-slate-400 uppercase mb-2">إجمالي الوثائق</p><h3 className="text-4xl font-black text-slate-800">{files.length}</h3></div>
                    <div className="bg-slate-50 p-5 rounded-2xl text-indigo-600"><Database size={28} /></div>
                  </div>
                  <div className="bg-white p-8 rounded-[2rem] border shadow-sm flex items-center justify-between">
                    <div><p className="text-xs font-black text-slate-400 uppercase mb-2">تفاعل تليجرام</p><h3 className="text-2xl font-black text-blue-600">{integrations.telegram.stats.messagesSent}</h3></div>
                    <div className="bg-slate-50 p-5 rounded-2xl text-blue-600"><TelegramIcon size={28} /></div>
                  </div>
                </div>

                <div className="bg-slate-900 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col h-[520px]">
                   <div className="p-6 border-b border-white/10 flex items-center justify-between bg-slate-800/50 text-white">
                      <div className="flex items-center gap-3"><Bot size={24} className="text-indigo-400" /><div><h3 className="font-black text-sm">مساعد الأرشفة</h3><p className="text-indigo-400 text-[10px]">AGENT ACTIVE</p></div></div>
                   </div>
                   <div className="flex-1 overflow-y-auto p-6 space-y-4">
                      {mainChatMessages.map(msg => (
                         <div key={msg.id} className={`max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed ${msg.role === 'assistant' ? 'bg-slate-800 text-slate-200 self-start' : 'bg-indigo-600 text-white mr-auto self-end'}`}>
                            {msg.text}
                            <div className="text-[9px] mt-2 opacity-40 font-bold">{new Date(msg.timestamp).toLocaleTimeString()}</div>
                         </div>
                      ))}
                      {isAgentLoading && <div className="p-4 bg-slate-800 rounded-2xl w-24 flex justify-center"><Loader2 className="animate-spin text-indigo-500" size={16} /></div>}
                   </div>
                   <div className="p-4 bg-slate-800 border-t border-white/10">
                      <div className="flex gap-2 bg-slate-900 p-2 rounded-xl border border-white/5 shadow-inner">
                         <input type="text" className="flex-1 bg-transparent border-none outline-none text-white px-3 py-2 text-sm font-bold" placeholder="اسأل الوكيل عن أي ملف..." value={mainChatInput} onChange={e => setChatInput(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleChat()} />
                         <button onClick={handleChat} className="bg-indigo-600 p-2 rounded-lg text-white hover:bg-indigo-500 transition-all"><Send size={18} /></button>
                      </div>
                   </div>
                </div>
              </div>

              <div className="bg-white p-8 rounded-[2.5rem] border shadow-sm flex flex-col">
                <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2"><History size={20} className="text-indigo-600" /> النشاط الأخير</h3>
                <div className="space-y-6 flex-1 overflow-y-auto max-h-[600px] pr-2 custom-scroll">
                  {auditLogs.map(log => (
                    <div key={log.id} className="border-r-2 border-slate-100 pr-4 py-1">
                      <p className="text-xs font-black text-indigo-600 uppercase tracking-tighter">{log.action}</p>
                      <p className="text-sm font-bold text-slate-700 mt-1">{log.details}</p>
                      <p className="text-[10px] text-slate-400 font-bold mt-1">{new Date(log.timestamp).toLocaleTimeString()}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'archive' && (
          <div className="space-y-8 animate-saas max-w-7xl mx-auto">
            <header className="flex justify-between items-center bg-white p-8 rounded-[2.5rem] border shadow-sm">
              <div><h1 className="text-4xl font-black text-slate-900">الأرشيف المركزي</h1><p className="text-slate-400 font-bold">إدارة السجلات الرقمية.</p></div>
              <div className="flex gap-4">
                <div className="relative w-80">
                  <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input className="w-full pr-12 pl-4 py-4 bg-slate-50 border-2 border-transparent focus:border-indigo-500 rounded-2xl outline-none font-bold text-sm" placeholder="بحث..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                </div>
                <input type="file" ref={fileInputRef} className="hidden" multiple onChange={handleSyncFiles} />
                <button onClick={() => fileInputRef.current?.click()} className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black flex items-center gap-3 hover:bg-indigo-700 shadow-xl transition-all">
                  <Link2 size={24} /> تحديد ملف متزامن
                </button>
              </div>
            </header>

            {isScanning && (
              <div className="bg-indigo-600 text-white p-10 rounded-[2.5rem] shadow-2xl flex flex-col items-center gap-6 animate-in fade-in zoom-in">
                <Loader2 className="animate-spin" size={48} />
                <h3 className="text-2xl font-black">جاري المزامنة... {scanProgress}%</h3>
                <p className="font-bold opacity-80">{currentScanningFile}</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase())).map(file => (
                <div key={file.id} onClick={() => setSelectedFileId(file.id)} className="bg-white p-8 rounded-[2.5rem] border shadow-sm hover:shadow-2xl transition-all cursor-pointer relative group">
                  {file.isProcessing && <div className="absolute top-6 left-6 animate-pulse bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full text-[10px] font-black border border-indigo-100 flex items-center gap-1 shadow-sm"><Loader2 size={10} className="animate-spin" /> تحليل Pro...</div>}
                  <div className="bg-slate-50 w-16 h-16 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-sm"><FileText size={28} /></div>
                  <h3 className="text-xl font-black text-slate-800 truncate mb-1 relative z-10">{file.isoMetadata?.title || file.name}</h3>
                  <p className="text-[10px] text-indigo-500 font-black tracking-widest uppercase mb-4 relative z-10">{file.isoMetadata?.recordId}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-4xl mx-auto animate-saas">
            <header className="mb-10 flex justify-between items-center bg-white p-8 rounded-[2.5rem] border shadow-sm">
              <h1 className="text-5xl font-black text-slate-900">الإعدادات</h1>
              <button onClick={() => { setIsSaving(true); setTimeout(() => setIsSaving(false), 1000); }} className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black flex items-center gap-3 hover:bg-indigo-700 shadow-xl transition-all active:scale-95">
                {isSaving ? <Loader2 className="animate-spin" /> : <Save size={20} />} حفظ
              </button>
            </header>

            <div className="bg-white rounded-[3rem] border shadow-xl flex min-h-[500px] overflow-hidden">
              <aside className="w-64 bg-slate-50 border-l p-8 space-y-2">
                <button onClick={() => setSettingsTab('general')} className={`w-full text-right px-6 py-4 rounded-2xl font-bold transition-all ${settingsTab === 'general' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}>الإدارة العامة</button>
                <button onClick={() => setSettingsTab('telegram')} className={`w-full text-right px-6 py-4 rounded-2xl font-bold transition-all ${settingsTab === 'telegram' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}>تكامل تليجرام</button>
              </aside>
              <div className="flex-1 p-12">
                {settingsTab === 'general' && (
                  <div className="space-y-12 animate-in fade-in">
                    <section>
                      <h3 className="text-2xl font-black mb-6 flex items-center gap-3 text-slate-800"><RotateCcw size={24} className="text-indigo-600" /> مسح البيانات</h3>
                      <div className="bg-rose-50 p-8 rounded-[2rem] border border-rose-100 border-dashed">
                        <p className="text-rose-700 font-bold mb-8 text-sm">سيتم حذف كافة الملفات وسجلات النشاط نهائياً.</p>
                        <button onClick={handleResetArchive} className="bg-rose-600 text-white px-8 py-5 rounded-2xl font-black flex items-center gap-3 hover:bg-rose-700 transition-all shadow-xl shadow-rose-200">
                          <Trash2 size={20} /> تصفير الأرشيف بالكامل
                        </button>
                      </div>
                    </section>
                  </div>
                )}
                {settingsTab === 'telegram' && (
                  <div className="space-y-8 animate-in fade-in">
                    <h3 className="text-2xl font-black mb-6 flex items-center gap-3 text-slate-800"><TelegramIcon size={24} className="text-blue-500" /> إعدادات الربط</h3>
                    <div className="space-y-6 max-w-lg">
                      <div className="space-y-2">
                        <label className="text-xs font-black block text-slate-500 uppercase mr-1">Bot Token</label>
                        <input type="password" placeholder="توكن البوت..." className="w-full p-4 bg-slate-50 rounded-2xl outline-none font-mono text-xs border border-slate-200 focus:border-indigo-500 shadow-sm" value={integrations.telegram.config.botToken} onChange={e => setIntegrations({ ...integrations, telegram: { ...integrations.telegram, config: { ...integrations.telegram.config, botToken: e.target.value } } })} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-black block text-slate-500 uppercase mr-1">Admin Chat ID</label>
                        <input type="text" placeholder="معرف المسؤول..." className="w-full p-4 bg-slate-50 rounded-2xl outline-none font-mono text-xs border border-slate-200 focus:border-indigo-500 shadow-sm" value={integrations.telegram.config.adminChatId} onChange={e => setIntegrations({ ...integrations, telegram: { ...integrations.telegram, config: { ...integrations.telegram.config, adminChatId: e.target.value } } })} />
                      </div>
                      <button onClick={handleVerifyTelegram} disabled={isVerifying} className="bg-slate-900 text-white w-full p-5 rounded-2xl font-black flex items-center justify-center gap-3 hover:bg-slate-800 transition-all shadow-xl">
                        {isVerifying ? <Loader2 className="animate-spin" /> : <ShieldCheck />} {integrations.telegram.connected ? 'متصل ومؤمن' : 'تفعيل الربط والتحقق'}
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
                    <div className="bg-indigo-600 p-5 rounded-2xl text-white shadow-xl flex items-center justify-center"><FileText size={32} /></div>
                    <div>
                      <h3 className="text-3xl font-black text-slate-900 leading-tight truncate max-w-xl">{files.find(f => f.id === selectedFileId)?.isoMetadata?.title || files.find(f => f.id === selectedFileId)?.name}</h3>
                      <p className="text-indigo-600 font-black text-sm uppercase mt-1 tracking-widest">{files.find(f => f.id === selectedFileId)?.isoMetadata?.recordId}</p>
                    </div>
                 </div>
                 <button onClick={() => setSelectedFileId(null)} className="p-4 hover:bg-rose-50 rounded-2xl border text-slate-400 hover:text-rose-600 transition-all shadow-sm"><X size={28} /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-12 space-y-10 custom-scroll">
                 <div className="bg-indigo-50 p-8 rounded-[2.5rem] border border-indigo-100 shadow-inner relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-2 h-full bg-indigo-500/20"></div>
                    <h4 className="font-black text-indigo-600 mb-4 flex items-center gap-2 uppercase tracking-tighter text-xs font-bold"><Sparkles size={18} /> الملخص التنفيذي الذكي (Pro AI Analysis)</h4>
                    <p className="text-slate-800 leading-9 text-sm font-bold text-justify">{files.find(f => f.id === selectedFileId)?.isoMetadata?.executiveSummary || "جاري التحليل..."}</p>
                 </div>
                 <div className="grid grid-cols-2 gap-6">
                    {[
                      { label: 'المرسل', value: files.find(f => f.id === selectedFileId)?.isoMetadata?.sender },
                      { label: 'المستلم', value: files.find(f => f.id === selectedFileId)?.isoMetadata?.recipient },
                      { label: 'رقم القيد', value: files.find(f => f.id === selectedFileId)?.isoMetadata?.incomingNumber, highlight: true },
                      { label: 'تاريخ الوثيقة', value: files.find(f => f.id === selectedFileId)?.isoMetadata?.fullDate },
                      { label: 'الأهمية', value: files.find(f => f.id === selectedFileId)?.isoMetadata?.importance },
                      { label: 'الحالة', value: files.find(f => f.id === selectedFileId)?.isoMetadata?.status, status: true }
                    ].map((item, idx) => (
                      <div key={idx} className="p-6 bg-slate-50 rounded-2xl border flex justify-between items-center shadow-sm">
                        <span className="text-[10px] text-slate-400 font-black uppercase tracking-wider">{item.label}</span>
                        <span className={`font-black text-sm ${item.highlight ? 'text-indigo-600 font-mono' : item.status ? 'text-emerald-600' : 'text-slate-700'}`}>{item.value || "-"}</span>
                      </div>
                    ))}
                 </div>
              </div>
              <div className="p-10 bg-slate-50/50 border-t flex justify-end gap-4">
                 <button onClick={() => setSelectedFileId(null)} className="px-10 py-5 bg-white border-2 border-slate-200 rounded-2xl font-black text-slate-600 hover:bg-slate-100 transition-all shadow-sm">إغلاق</button>
                 <button onClick={() => {
                   const f = files.find(f => f.id === selectedFileId);
                   if (f && integrations.telegram.connected) {
                     sendFileToTelegram(f).then(ok => alert(ok ? "تم إرسال الوثيقة." : "فشل الإرسال."));
                   } else alert("تليجرام غير مربوط.");
                 }} className="px-12 py-5 bg-indigo-600 text-white rounded-2xl font-black shadow-xl hover:bg-indigo-700 transition-all flex items-center gap-2 active:scale-95">
                   <Send size={20} /> تصدير لتليجرام
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default App;
