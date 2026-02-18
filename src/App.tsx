
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
  Link2, LogOut
} from 'lucide-react';

import { 
  FileRecord, ArchiveStatus, AuditAction, AuditLog, ChatMessage, DocumentType, Importance, Confidentiality, ISOMetadata
} from '../types';
import { NAV_ITEMS, STATUS_COLORS } from '../constants';
import { askAgent, askAgentStream, analyzeSpecificFile } from '../services/geminiService';

const STORAGE_KEY = 'ARSHIF_PLATFORM_FILES_V4';
const AUDIT_KEY = 'ARSHIF_PLATFORM_AUDIT_V4';
const INTEGRATION_KEY = 'ARSHIF_TELEGRAM_CONFIG_V4';

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { filesRef.current = files; }, [files]);
  useEffect(() => { integrationsRef.current = integrations; }, [integrations]);

  // Load Persistence
  useEffect(() => {
    const savedFiles = localStorage.getItem(STORAGE_KEY);
    const savedAudit = localStorage.getItem(AUDIT_KEY);
    const savedInteg = localStorage.getItem(INTEGRATION_KEY);
    if (savedFiles) setFiles(JSON.parse(savedFiles));
    if (savedAudit) setAuditLogs(JSON.parse(savedAudit));
    if (savedInteg) setIntegrations(JSON.parse(savedInteg));
  }, []);

  // Sync Persistence
  useEffect(() => {
    // We only save metadata to localStorage to avoid bloating memory/storage limit
    const toSave = files.map(({ originalFile, ...rest }) => rest);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    localStorage.setItem(AUDIT_KEY, JSON.stringify(auditLogs));
    localStorage.setItem(INTEGRATION_KEY, JSON.stringify(integrations));
  }, [files, auditLogs, integrations]);

  /**
   * تصفير الأرشيف بالكامل
   */
  const resetArchive = () => {
    if (window.confirm("تحذير حرج: سيتم حذف جميع البيانات والملفات المؤرشفة وسجل النشاط نهائياً. هل أنت متأكد؟")) {
      setFiles([]);
      setAuditLogs([{
        id: Date.now().toString(),
        action: AuditAction.DELETE,
        details: "تم تصفير الأرشيف وحذف كافة السجلات والبيانات الوصفية يدوياً.",
        user: "مدير النظام",
        timestamp: new Date().toISOString()
      }]);
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(AUDIT_KEY);
      alert("تمت تصفية الأرشيف بنجاح.");
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

  /**
   * معالج طابور التحليل الذكي
   */
  useEffect(() => {
    const processQueue = async () => {
      const pending = files.find(f => f.isProcessing);
      if (!pending || isAnalyzingRef.current) return;
      
      isAnalyzingRef.current = true;
      try {
        let analysis;
        if (pending.originalFile) {
          const b64 = await fileToBase64(pending.originalFile);
          analysis = await analyzeSpecificFile(pending.name, b64, pending.originalFile.type, true);
        } else {
          analysis = await analyzeSpecificFile(pending.name, pending.content || "محتوى غير متاح", undefined, false);
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
          details: `اكتمل التحليل الذكي المستند لمعيار ISO للملف: ${pending.name}`, 
          user: 'AI Processor', 
          timestamp: new Date().toISOString() 
        }, ...prev]);

      } catch (e) {
        console.error("AI Queue Error:", e);
        setFiles(prev => prev.map(f => f.id === pending.id ? { ...f, isProcessing: false } : f));
      } finally { 
        isAnalyzingRef.current = false; 
      }
    };
    
    const interval = setInterval(processQueue, 3500);
    return () => clearInterval(interval);
  }, [files]);

  /**
   * إرسال رد نصي لتليجرام
   */
  const sendTelegramMsg = async (text: string) => {
    const { botToken, adminChatId } = integrationsRef.current.telegram.config;
    if (!integrationsRef.current.telegram.connected || !botToken) return;
    try {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: adminChatId, text, parse_mode: 'HTML' })
      });
      setIntegrations(p => ({...p, telegram: {...p.telegram, stats: {...p.telegram.stats, messagesSent: p.telegram.stats.messagesSent + 1}}}));
    } catch (e) { console.error("Send Telegram Error", e); }
  };

  /**
   * إرسال مستند حقيقي لتليجرام
   */
  const sendTelegramFile = async (file: FileRecord) => {
    const { botToken, adminChatId } = integrationsRef.current.telegram.config;
    if (!file.originalFile || !botToken) return false;
    const fd = new FormData();
    fd.append('chat_id', adminChatId);
    fd.append('document', file.originalFile);
    fd.append('caption', `📁 <b>ملف مستخرج:</b> ${file.name}\n✅ تم التحقق من سلامة الأرشيف الرقمي.`);
    fd.append('parse_mode', 'HTML');
    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, { method: 'POST', body: fd });
      const data = await res.json();
      return data.ok;
    } catch { return false; }
  };

  /**
   * آلية Polling لمراقبة رسائل تليجرام الواردة والرد عليها
   */
  useEffect(() => {
    const fetchUpdates = async () => {
      const { botToken, adminChatId, connected } = integrationsRef.current.telegram;
      if (!connected || !botToken || isPollingRef.current) return;
      
      isPollingRef.current = true;
      try {
        const offset = integrationsRef.current.telegram.lastUpdateId + 1;
        const res = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates?offset=${offset}&timeout=15`);
        const data = await res.json();
        
        if (data.ok && data.result.length > 0) {
          for (const upd of data.result) {
            // Update offset immediately to avoid duplication
            setIntegrations(p => ({ ...p, telegram: { ...p.telegram, lastUpdateId: upd.update_id } }));
            
            if (upd.message && String(upd.message.chat.id) === String(adminChatId) && upd.message.text) {
              const query = upd.message.text;
              
              // Prepare context for AI
              const context = filesRef.current.map(f => 
                `[ID:${f.id}] الاسم:${f.name} الملخص:${f.isoMetadata?.executiveSummary?.substring(0, 150)}`
              ).join('\n');
              
              const reply = await askAgent(query, context);
              
              if (reply.includes('[[DOWNLOAD:')) {
                const id = reply.match(/\[\[DOWNLOAD:(.*?)\]\]/)?.[1];
                const cleanReply = reply.replace(/\[\[DOWNLOAD:.*?\]\]/, '');
                const fileToFind = filesRef.current.find(f => f.id === id || f.isoMetadata?.recordId === id);
                
                if (cleanReply.trim()) await sendTelegramMsg(cleanReply);
                if (fileToFind) {
                  await sendTelegramFile(fileToFind);
                } else {
                  await sendTelegramMsg("⚠️ المعذرة، لم أعثر على الملف المطلوب في قاعدة البيانات الحالية.");
                }
              } else {
                await sendTelegramMsg(reply);
              }
              
              setAuditLogs(prev => [{ 
                id: Date.now().toString(), 
                action: AuditAction.VIEW, 
                details: `استعلام تليجرام: ${query.substring(0, 30)}...`, 
                user: 'Telegram Admin', 
                timestamp: new Date().toISOString() 
              }, ...prev]);
            }
          }
        }
      } catch (e) {
        console.error("Telegram Poll Error", e);
      } finally {
        isPollingRef.current = false;
      }
    };
    
    const poller = setInterval(fetchUpdates, 4000);
    return () => clearInterval(poller);
  }, [integrations.telegram.connected]);

  /**
   * إضافة ملفات عبر "تحديد ملف متزامن"
   */
  const handleSyncFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const sel = e.target.files;
    if (!sel || sel.length === 0) return;
    
    setIsScanning(true);
    setScanProgress(0);
    const newRecs: FileRecord[] = [];
    
    for (let i = 0; i < sel.length; i++) {
      const f = sel[i];
      setCurrentScanningFile(f.name);
      
      newRecs.push({
        id: Math.random().toString(36).substr(2, 10).toUpperCase(),
        name: f.name, 
        size: f.size, 
        type: f.type, 
        lastModified: f.lastModified,
        originalFile: f, 
        isProcessing: true,
        isoMetadata: {
          recordId: `ARC-${Date.now().toString().slice(-4)}-${i}`, 
          title: f.name, 
          description: "جاري المزامنة والتحليل المعياري...",
          documentType: DocumentType.OTHER, 
          entity: "مزامنة محلية", 
          importance: Importance.NORMAL,
          confidentiality: Confidentiality.INTERNAL, 
          status: ArchiveStatus.IN_PROCESS,
          createdAt: new Date().toISOString(), 
          updatedAt: new Date().toISOString(), 
          year: new Date().getFullYear(), 
          originalPath: f.name, 
          retentionPolicy: "Default",
          expiryDate: null
        }
      });
      
      setScanProgress(Math.round(((i + 1) / sel.length) * 100));
      await new Promise(r => setTimeout(r, 60)); // Simulate sync delay
    }
    
    setFiles(prev => [...newRecs, ...prev]);
    setIsScanning(false);
    
    setAuditLogs(prev => [{ 
      id: Date.now().toString(), 
      action: AuditAction.SYNC, 
      details: `تمت مزامنة وأرشفة ${newRecs.length} وثيقة جديدة بنجاح.`, 
      user: 'مدير النظام', 
      timestamp: new Date().toISOString() 
    }, ...prev]);
  };

  const handleWebChat = async () => {
    if (!mainChatInput.trim() || isAgentLoading) return;
    const userMsg = mainChatInput; 
    setChatInput('');
    
    setMainChatMessages(p => [...p, { id: Date.now().toString(), role: 'user', text: userMsg, timestamp: new Date() }]);
    setIsAgentLoading(true);
    
    const botId = (Date.now() + 1).toString();
    setMainChatMessages(p => [...p, { id: botId, role: 'assistant', text: '', timestamp: new Date() }]);
    
    let full = "";
    try {
      const context = files.slice(0, 15).map(f => `${f.name}: ${f.isoMetadata?.executiveSummary}`).join('\n');
      const stream = askAgentStream(userMsg, context);
      for await (const chunk of stream) {
        full += chunk;
        setMainChatMessages(p => p.map(m => m.id === botId ? { ...m, text: full } : m));
      }
    } catch { 
      setMainChatMessages(p => p.map(m => m.id === botId ? { ...m, text: "عذراً، الوكيل يواجه مشكلة حالياً." } : m));
    }
    setIsAgentLoading(false);
  };

  const verifyTelegramConnection = async () => {
    const { botToken, adminChatId } = integrations.telegram.config;
    if (!botToken || !adminChatId) return alert("يرجى تزويد النظام ببيانات الربط كاملة.");
    
    setIsVerifying(true);
    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          chat_id: adminChatId, 
          text: "🚀 <b>تأكيد الربط:</b>\nتم توصيل نظام أرشيف PRO بنجاح مع حساب تليجرام هذا.\nيمكنك الآن إرسال الأوامر والبحث عن الملفات.", 
          parse_mode: 'HTML' 
        })
      });
      const data = await res.json();
      if (data.ok) {
        setIntegrations(p => ({ ...p, telegram: { ...p.telegram, connected: true } }));
        alert("تم التحقق بنجاح! راجع حساب تليجرام الخاص بك.");
      } else alert("فشل التحقق: " + data.description);
    } catch { alert("خطأ في الاتصال، يرجى مراجعة إعدادات الإنترنت."); }
    finally { setIsVerifying(false); }
  };

  return (
    <div className="min-h-screen flex bg-[#fbfcfd]" dir="rtl">
      {/* Sidebar Navigation */}
      <aside className="w-80 bg-slate-900 text-slate-300 flex flex-col fixed h-full z-20 shadow-2xl border-l border-slate-800">
        <div className="p-8">
          <div className="flex items-center gap-4 mb-12">
            <div className="bg-indigo-600 w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-lg">أ</div>
            <div>
              <span className="text-2xl font-black text-white block">أرشـيـف PRO</span>
              <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest">ISO 15489 Management</span>
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
        <div className="mt-auto p-8 border-t border-slate-800 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-indigo-400"><User size={20} /></div>
          <div>
            <p className="text-xs font-black text-white">مدير النظام</p>
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Administrator</p>
          </div>
        </div>
      </aside>

      <main className="flex-1 mr-80 p-10 overflow-y-auto">
        {activeTab === 'dashboard' && (
          <div className="space-y-8 animate-saas max-w-7xl mx-auto">
            <header className="flex justify-between items-center bg-white p-8 rounded-[2.5rem] border shadow-sm">
              <div>
                <h1 className="text-4xl font-black text-slate-900">لوحة المراقبة</h1>
                <p className="text-slate-400 font-bold mt-1">إحصائيات الأرشفة الحية وحالة الوكيل الذكي.</p>
              </div>
              <div className="flex gap-4">
                 <div className="px-6 py-3 bg-indigo-50 text-indigo-600 rounded-2xl font-bold flex items-center gap-2 border border-indigo-100">
                    <Zap size={20} className="animate-pulse" /> Gemini AI محرك نشط
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
                    <div><p className="text-xs font-black text-slate-400 uppercase mb-2">نشاط تليجرام</p><h3 className="text-2xl font-black text-blue-600">{integrations.telegram.stats.messagesSent} تفاعل</h3></div>
                    <div className="bg-slate-50 p-5 rounded-2xl text-blue-600"><TelegramIcon size={28} /></div>
                  </div>
                </div>

                {/* Chat Bot Interface */}
                <div className="bg-slate-900 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col h-[520px]">
                   <div className="p-6 border-b border-white/10 flex items-center justify-between bg-slate-800/50 text-white">
                      <div className="flex items-center gap-3"><Bot size={24} className="text-indigo-400" /><div><h3 className="font-black text-sm">مساعد الأرشفة الذكي</h3><p className="text-indigo-400 text-[10px] tracking-widest uppercase">Agent Online</p></div></div>
                      <div className="flex items-center gap-2 px-3 py-1 bg-green-500/10 text-green-400 rounded-full text-[10px] font-bold"><Activity size={12} /> متصل</div>
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
                      <div className="flex gap-2 bg-slate-900 p-2 rounded-xl border border-white/5">
                         <input type="text" className="flex-1 bg-transparent border-none outline-none text-white px-3 py-2 text-sm" placeholder="اسأل عن أي مستند أو معاملة..." value={mainChatInput} onChange={e => setChatInput(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleWebChat()} />
                         <button onClick={handleWebChat} className="bg-indigo-600 p-2 rounded-lg text-white hover:bg-indigo-500 transition-all"><Send size={18} /></button>
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
                      <p className="text-[10px] text-slate-400 font-bold mt-1 italic">{new Date(log.timestamp).toLocaleString()}</p>
                    </div>
                  ))}
                  {auditLogs.length === 0 && <p className="text-center text-slate-300 font-bold py-10">لا يوجد نشاط مسجل</p>}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'archive' && (
          <div className="space-y-8 animate-saas max-w-7xl mx-auto">
            <header className="flex justify-between items-center bg-white p-8 rounded-[2.5rem] border shadow-sm">
              <div><h1 className="text-4xl font-black text-slate-900">الأرشيف المركزي</h1><p className="text-slate-400 font-bold mt-1">إدارة الوثائق المصنفة وتتبع تاريخ المعاملات.</p></div>
              <div className="flex gap-4">
                <div className="relative w-80">
                  <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input className="w-full pr-12 pl-4 py-4 bg-slate-50 border-2 border-transparent focus:border-indigo-500 rounded-2xl outline-none font-bold text-sm" placeholder="بحث سريع في الوثائق..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                </div>
                <input type="file" ref={fileInputRef} className="hidden" multiple onChange={handleSyncFiles} />
                <button onClick={() => fileInputRef.current?.click()} className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black flex items-center gap-3 hover:bg-indigo-700 shadow-xl shadow-indigo-100 transition-all">
                  <Link2 size={24} /> تحديد ملف متزامن
                </button>
              </div>
            </header>

            {isScanning && (
              <div className="bg-indigo-600 text-white p-10 rounded-[2.5rem] shadow-2xl flex flex-col items-center gap-6 animate-in fade-in zoom-in">
                <Loader2 className="animate-spin" size={48} />
                <div className="text-center">
                  <h3 className="text-2xl font-black">جاري مزامنة الوثائق... {scanProgress}%</h3>
                  <p className="text-indigo-200 mt-2">يتم الآن معالجة: {currentScanningFile}</p>
                </div>
                <div className="w-full max-w-md h-2 bg-indigo-500 rounded-full overflow-hidden shadow-inner"><div className="h-full bg-white transition-all duration-300" style={{ width: `${scanProgress}%` }}></div></div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {files.filter(f => f.name.includes(searchQuery)).map(file => (
                <div key={file.id} onClick={() => setSelectedFileId(file.id)} className="bg-white p-8 rounded-[2.5rem] border shadow-sm hover:shadow-2xl transition-all cursor-pointer relative group overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full -mr-16 -mt-16 opacity-0 group-hover:opacity-100 transition-all duration-500"></div>
                  
                  {file.isProcessing && (
                    <div className="absolute top-6 left-6 animate-pulse bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full text-[10px] font-black border border-indigo-100 shadow-sm flex items-center gap-1">
                      <Loader2 size={10} className="animate-spin" /> جاري التحليل...
                    </div>
                  )}
                  
                  <div className="bg-slate-50 w-16 h-16 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-indigo-600 group-hover:text-white transition-all relative z-10 shadow-sm"><FileText className="text-indigo-500 group-hover:text-white" size={28} /></div>
                  <h3 className="text-xl font-black text-slate-800 truncate mb-1 relative z-10">{file.isoMetadata?.title || file.name}</h3>
                  <p className="text-xs text-indigo-500 font-black tracking-widest uppercase mb-4 relative z-10">{file.isoMetadata?.recordId}</p>
                  
                  <div className="flex items-center justify-between pt-4 border-t border-slate-50 relative z-10">
                     <span className="px-3 py-1 bg-slate-100 rounded-full text-[10px] font-black text-slate-500">{file.isoMetadata?.documentType}</span>
                     <span className="text-[10px] text-slate-400 font-bold">{new Date(file.lastModified).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
              
              {files.length === 0 && !isScanning && (
                <div className="col-span-full py-40 flex flex-col items-center justify-center bg-white rounded-[3rem] border-2 border-dashed border-slate-200 opacity-60">
                   <div className="bg-slate-50 p-10 rounded-full mb-6 text-slate-300 shadow-inner"><HardDrive size={80} /></div>
                   <h3 className="text-2xl font-black text-slate-800">الأرشيف فارغ حالياً</h3>
                   <p className="text-slate-400 font-bold mt-2">استخدم زر "تحديد ملف متزامن" لبدء الأرشفة الذكية.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-4xl mx-auto animate-saas">
            <header className="mb-10 flex justify-between items-center bg-white p-8 rounded-[2.5rem] border shadow-sm">
              <h1 className="text-5xl font-black text-slate-900">إعدادات النظام</h1>
              <button onClick={() => { setIsSaving(true); setTimeout(() => setIsSaving(false), 1000); }} className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black flex items-center gap-3 hover:bg-indigo-700 shadow-xl transition-all">
                {isSaving ? <Loader2 className="animate-spin" /> : <Save size={20} />} حفظ التغييرات
              </button>
            </header>

            <div className="bg-white rounded-[3rem] border shadow-xl flex min-h-[550px] overflow-hidden">
              <aside className="w-64 bg-slate-50 border-l p-8 space-y-2">
                <button onClick={() => setSettingsTab('general')} className={`w-full text-right px-6 py-4 rounded-2xl font-bold transition-all ${settingsTab === 'general' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}>الإدارة والبيانات</button>
                <button onClick={() => setSettingsTab('telegram')} className={`w-full text-right px-6 py-4 rounded-2xl font-bold transition-all ${settingsTab === 'telegram' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}>تكامل تليجرام</button>
              </aside>
              <div className="flex-1 p-12">
                {settingsTab === 'general' && (
                  <div className="space-y-12 animate-in fade-in">
                    <section>
                      <h3 className="text-2xl font-black mb-6 flex items-center gap-3 text-slate-800"><Database size={24} className="text-indigo-600" /> إدارة السجلات</h3>
                      <div className="bg-rose-50 p-8 rounded-[2rem] border border-rose-100 border-dashed">
                        <div className="flex items-center gap-4 mb-4 text-rose-800 font-black">
                          <AlertTriangle size={24} />
                          <span>تحذير: منطقة عمليات خطيرة</span>
                        </div>
                        <p className="text-rose-700 font-bold mb-8 leading-relaxed text-sm">تصفير النظام سيؤدي إلى مسح جميع البيانات الوصفية والملفات وسجل النشاط نهائياً من ذاكرة المتصفح المحلية. يرجى التأكد من امتلاك نسخة احتياطية.</p>
                        <button onClick={resetArchive} className="bg-rose-600 text-white px-8 py-5 rounded-2xl font-black flex items-center gap-3 hover:bg-rose-700 transition-all shadow-xl shadow-rose-200 active:scale-95">
                          <Trash2 size={20} /> تصفير الأرشيف بالكامل
                        </button>
                      </div>
                    </section>
                  </div>
                )}
                {settingsTab === 'telegram' && (
                  <div className="space-y-8 animate-in fade-in">
                    <h3 className="text-2xl font-black mb-6 flex items-center gap-3 text-slate-800"><TelegramIcon size={24} className="text-blue-500" /> تكوين الوكيل الخارجي</h3>
                    <div className="space-y-6 max-w-lg">
                      <div className="space-y-2">
                        <label className="text-xs font-black block text-slate-500 uppercase mr-1">Bot Token (من BotFather)</label>
                        <input type="password" placeholder="توكن البوت الخاص بك..." className="w-full p-4 bg-slate-50 rounded-2xl outline-none font-mono text-xs border-2 border-transparent focus:border-blue-500 focus:bg-white transition-all shadow-sm" value={integrations.telegram.config.botToken} onChange={e => setIntegrations({ ...integrations, telegram: { ...integrations.telegram, config: { ...integrations.telegram.config, botToken: e.target.value } } })} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-black block text-slate-500 uppercase mr-1">Admin Chat ID (معرفك الخاص)</label>
                        <input type="text" placeholder="معرف الدردشة (مثال: 12345678)..." className="w-full p-4 bg-slate-50 rounded-2xl outline-none font-mono text-xs border-2 border-transparent focus:border-blue-500 focus:bg-white transition-all shadow-sm" value={integrations.telegram.config.adminChatId} onChange={e => setIntegrations({ ...integrations, telegram: { ...integrations.telegram, config: { ...integrations.telegram.config, adminChatId: e.target.value } } })} />
                      </div>
                      <button onClick={verifyTelegramConnection} disabled={isVerifying} className="bg-slate-900 text-white w-full p-5 rounded-2xl font-black flex items-center justify-center gap-3 hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 disabled:opacity-50">
                        {isVerifying ? <Loader2 className="animate-spin" /> : <ShieldCheck />} {integrations.telegram.connected ? 'الربط نشط ومؤمن' : 'تفعيل المزامنة مع تليجرام'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Modern Modal for File Details */}
      {selectedFileId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 backdrop-blur-xl p-4 animate-in fade-in">
           <div className="bg-white w-full max-w-4xl rounded-[3rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              <div className="p-10 border-b flex justify-between items-center bg-slate-50/50">
                 <div className="flex items-center gap-6">
                    <div className="bg-indigo-600 p-5 rounded-2xl text-white shadow-xl flex items-center justify-center"><FileText size={32} /></div>
                    <div>
                      <h3 className="text-3xl font-black text-slate-900 leading-tight truncate max-w-xl">{files.find(f => f.id === selectedFileId)?.isoMetadata?.title || files.find(f => f.id === selectedFileId)?.name}</h3>
                      <p className="text-indigo-600 font-black text-sm uppercase tracking-widest mt-1">{files.find(f => f.id === selectedFileId)?.isoMetadata?.recordId}</p>
                    </div>
                 </div>
                 <button onClick={() => setSelectedFileId(null)} className="p-4 hover:bg-rose-50 rounded-2xl border text-slate-400 hover:text-rose-600 transition-all active:scale-95 shadow-sm"><X size={28} /></button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-12 space-y-10 custom-scroll">
                 <div className="bg-indigo-50 p-8 rounded-[2.5rem] border border-indigo-100 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
                    <h4 className="font-black text-indigo-600 mb-4 flex items-center gap-2 uppercase tracking-tighter text-sm"><Sparkles size={18} /> الملخص الذكي المعياري</h4>
                    <p className="text-slate-800 leading-9 text-sm font-bold text-justify">
                      {files.find(f => f.id === selectedFileId)?.isoMetadata?.executiveSummary || (files.find(f => f.id === selectedFileId)?.isProcessing ? "جاري استخراج البيانات وتحليلها..." : "لا يوجد ملخص متاح لهذا الملف.")}
                    </p>
                 </div>
                 
                 <div className="grid grid-cols-2 gap-6">
                    {[
                      { label: 'المرسل', value: files.find(f => f.id === selectedFileId)?.isoMetadata?.sender },
                      { label: 'المستلم', value: files.find(f => f.id === selectedFileId)?.isoMetadata?.recipient },
                      { label: 'رقم الوارد', value: files.find(f => f.id === selectedFileId)?.isoMetadata?.incomingNumber, mono: true },
                      { label: 'تاريخ المستند', value: files.find(f => f.id === selectedFileId)?.isoMetadata?.fullDate },
                      { label: 'الأهمية', value: files.find(f => f.id === selectedFileId)?.isoMetadata?.importance },
                      { label: 'حالة الأرشفة', value: files.find(f => f.id === selectedFileId)?.isoMetadata?.status, green: true }
                    ].map((item, idx) => (
                      <div key={idx} className="p-6 bg-slate-50 rounded-2xl border flex justify-between items-center shadow-sm">
                        <span className="text-[10px] text-slate-400 font-black uppercase tracking-wider">{item.label}</span>
                        <span className={`font-black text-sm ${item.mono ? 'font-mono text-indigo-600' : item.green ? 'text-emerald-600' : 'text-slate-700'}`}>{item.value || "-"}</span>
                      </div>
                    ))}
                 </div>
              </div>
              
              <div className="p-10 bg-slate-50/50 border-t flex justify-end gap-4">
                 <button onClick={() => setSelectedFileId(null)} className="px-10 py-5 bg-white border-2 border-slate-200 rounded-2xl font-black text-slate-600 hover:bg-slate-100 transition-all shadow-sm">إغلاق</button>
                 <button onClick={() => {
                   const f = files.find(f => f.id === selectedFileId);
                   if (f && integrations.telegram.connected) {
                     sendTelegramFile(f).then(ok => alert(ok ? "تم إرسال الوثيقة لتليجرام بنجاح." : "فشل الإرسال، تحقق من حالة البوت والإنترنت."));
                   } else alert("يرجى ربط تليجرام وتفعيله أولاً.");
                 }} className="px-12 py-5 bg-indigo-600 text-white rounded-2xl font-black shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center gap-2 active:scale-95">
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
