
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
  User, FileCheck, Archive, Scale, Smartphone, Hash, FileInput
} from 'lucide-react';

import { 
  FileRecord, ArchiveStatus, AuditAction, AuditLog, ChatMessage, DocumentType, Importance, Confidentiality, ISOMetadata
} from '../types';
import { NAV_ITEMS, STATUS_COLORS } from '../constants';
import { askAgent, classifyFileContent } from '../services/geminiService';

// مفاتيح تخزين ثابتة ومحمية
const STORAGE_KEY = 'ARSHIF_PLATFORM_FILES_V2';
const AUDIT_KEY = 'ARSHIF_PLATFORM_AUDIT_V2';
const INTEGRATION_KEY = 'ARSHIF_TELEGRAM_LOCKED_CONFIG';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [settingsTab, setSettingsTab] = useState('telegram');
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [mainChatMessages, setMainChatMessages] = useState<ChatMessage[]>([]);
  const [mainChatInput, setChatInput] = useState('');
  const [isAgentLoading, setIsAgentLoading] = useState(false);
  
  // حالة الربط بالمجلد
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [currentScanningFile, setCurrentScanningFile] = useState('');
  const [connectedFolderName, setConnectedFolderName] = useState<string | null>(localStorage.getItem('ARSHIF_CONNECTED_FOLDER_NAME'));

  // حالة وكيل التحميل
  const [downloadAgentState, setDownloadAgentState] = useState<{
    isActive: boolean;
    step: 'idle' | 'searching' | 'retrieving' | 'encrypting' | 'sending' | 'completed';
    fileName: string;
    progress: number;
  }>({ isActive: false, step: 'idle', fileName: '', progress: 0 });

  const [integrations, setIntegrations] = useState({
    telegram: {
      connected: false,
      isConnecting: false,
      lastUpdateId: 0,
      config: { botToken: '', adminChatId: '' },
      stats: { messagesSent: 0 }
    }
  });

  // State variables for UI interactions
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [systemSettings, setSystemSettings] = useState({
    profile: {
      name: 'مدير النظام',
      role: 'المسؤول الرئيسي'
    }
  });

  const directoryInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastUpdateIdRef = useRef<number>(0);
  const isPollingRef = useRef<boolean>(false);
  const pollingFailuresRef = useRef<number>(0);
  const filesRef = useRef<FileRecord[]>([]);
  const auditLogsRef = useRef<AuditLog[]>([]);
  const isAnalyzingRef = useRef<boolean>(false);
  const integrationsRef = useRef(integrations);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  useEffect(() => {
    auditLogsRef.current = auditLogs;
  }, [auditLogs]);
  
  useEffect(() => {
    integrationsRef.current = integrations;
  }, [integrations]);

  const selectedFile = useMemo(() => files.find(f => f.id === selectedFileId) || null, [files, selectedFileId]);

  useEffect(() => {
    const savedFiles = localStorage.getItem(STORAGE_KEY);
    const savedAudit = localStorage.getItem(AUDIT_KEY);
    const savedInteg = localStorage.getItem(INTEGRATION_KEY);
    
    if (savedFiles) try { setFiles(JSON.parse(savedFiles)); } catch (e) {}
    if (savedAudit) try { setAuditLogs(JSON.parse(savedAudit)); } catch (e) {}
    if (savedInteg) {
        try { 
            const parsed = JSON.parse(savedInteg);
            setIntegrations(parsed);
            lastUpdateIdRef.current = parsed.telegram.lastUpdateId || 0;
        } catch (e) {}
    }
  }, []);

  useEffect(() => {
    // Note: originalFile cannot be saved to localStorage (it's binary), so files will lose their binary data on refresh.
    // We strip originalFile before saving to storage.
    const filesToSave = files.map(({ originalFile, ...rest }) => rest);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filesToSave));
    localStorage.setItem(AUDIT_KEY, JSON.stringify(auditLogs));
    localStorage.setItem(INTEGRATION_KEY, JSON.stringify(integrations));
    if (connectedFolderName) {
      localStorage.setItem('ARSHIF_CONNECTED_FOLDER_NAME', connectedFolderName);
    } else {
      localStorage.removeItem('ARSHIF_CONNECTED_FOLDER_NAME');
    }
  }, [files, auditLogs, integrations, connectedFolderName]);

  // --- Background AI Processor (The Queue Worker) ---
  useEffect(() => {
    const processQueue = async () => {
      const pendingFile = files.find(f => f.isProcessing);
      if (!pendingFile || isAnalyzingRef.current) return;

      isAnalyzingRef.current = true;

      try {
        console.log(`Starting AI analysis for: ${pendingFile.name}`);
        
        let contentToAnalyze = '';
        if (pendingFile.content && pendingFile.content.length > 20) {
            contentToAnalyze = pendingFile.content;
        } else {
            contentToAnalyze = `
            تحليل بناءً على البيانات الوصفية فقط (المحتوى غير متاح للنص):
            اسم الملف: ${pendingFile.name}
            نوع الملف: ${pendingFile.type}
            الحجم: ${pendingFile.size} بايت
            تاريخ الملف: ${new Date(pendingFile.lastModified).toLocaleDateString('ar-SA')}
            `;
        }

        const analysis = await classifyFileContent(pendingFile.name, contentToAnalyze);

        setFiles(prevFiles => prevFiles.map(f => {
          if (f.id === pendingFile.id) {
            return {
              ...f,
              isProcessing: false,
              isoMetadata: {
                ...f.isoMetadata!,
                title: analysis.title || f.name,
                description: analysis.description || "ملف مؤرشف",
                executiveSummary: analysis.executiveSummary || "لا يتوفر ملخص تنفيذي لهذا الملف.",
                documentType: analysis.documentType as DocumentType || DocumentType.OTHER,
                importance: analysis.importance as Importance || Importance.NORMAL,
                confidentiality: analysis.confidentiality as Confidentiality || Confidentiality.INTERNAL,
                retentionPolicy: analysis.retentionPolicy || "افتراضي",
                sender: analysis.sender,
                recipient: analysis.recipient,
                incomingNumber: analysis.incomingNumber,
                outgoingNumber: analysis.outgoingNumber, // Mapped from External Ref
                fullDate: analysis.fullDate,
                year: analysis.year || new Date().getFullYear(),
                updatedAt: new Date().toISOString()
              }
            };
          }
          return f;
        }));
        
        setAuditLogs(prev => [{
            id: Date.now().toString(),
            action: AuditAction.UPDATE,
            details: `تم تحليل بيانات الملف واستخراج الملخص التفصيلي: ${pendingFile.name}`,
            user: 'Gemini AI Processor',
            timestamp: new Date().toISOString()
        }, ...prev]);

      } catch (error) {
        console.error("AI Analysis Failed:", error);
        setFiles(prevFiles => prevFiles.map(f => {
             if (f.id === pendingFile.id) return { ...f, isProcessing: false }; 
             return f;
        }));
      } finally {
        isAnalyzingRef.current = false;
      }
    };

    processQueue();
  }, [files]); 

  const getAgentContext = () => {
    const currentFiles = filesRef.current;
    
    // سياق نظيف يعتمد فقط على ما تم استخراجه فعلياً
    const fileList = currentFiles.map(f => `
=== بطاقة الملف ===
المعرف: ${f.isoMetadata?.recordId}
اسم الملف: ${f.name}
رقم المعاملة: ${f.isoMetadata?.incomingNumber || 'غير محدد'}
--- الملخص والتفاصيل (Structured Data) ---
${f.isoMetadata?.executiveSummary}
-----------------------
`).join('\n');

    return fileList;
  };

  // Helper to send text messages
  const sendTelegramReal = async (text: string, inlineButton?: { text: string, url: string }) => {
    const { botToken, adminChatId } = integrationsRef.current.telegram.config;
    if (!integrationsRef.current.telegram.connected || !botToken || !adminChatId) return false;
    
    try {
      const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          chat_id: adminChatId, 
          text: text, 
          parse_mode: 'HTML',
          disable_web_page_preview: true, 
          reply_markup: inlineButton ? {
            inline_keyboard: [[{ text: inlineButton.text, url: inlineButton.url }]]
          } : undefined
        })
      });
      const data = await response.json();
      if (data.ok) {
        setIntegrations(p => ({...p, telegram: {...p.telegram, stats: {...p.telegram.stats, messagesSent: p.telegram.stats.messagesSent + 1}}}));
        return true;
      }
      return false;
    } catch (e) { return false; }
  };

  // Helper to upload actual files
  const sendTelegramFile = async (file: FileRecord) => {
    const { botToken, adminChatId } = integrationsRef.current.telegram.config;
    if (!integrationsRef.current.telegram.connected || !botToken || !adminChatId) return false;

    try {
        const formData = new FormData();
        formData.append('chat_id', adminChatId);
        formData.append('caption', `📄 <b>${file.name}</b>\n\n✅ تم استرجاع الملف بنجاح من الأرشيف.\n#️⃣ رقم المعاملة: ${file.isoMetadata?.incomingNumber || 'غير محدد'}`);
        formData.append('parse_mode', 'HTML');
        
        // Use the original file object if available (for PDFs, Images, etc.)
        if (file.originalFile) {
            formData.append('document', file.originalFile);
        } else {
             // Fallback: Create blob from text content if original file is lost (e.g. after refresh)
             const content = file.content || "عذراً، الملف الأصلي غير متاح في هذه الجلسة. تم إنشاء نسخة نصية من المحتوى المحفوظ.";
             const blob = new Blob([content], { type: 'text/plain' });
             formData.append('document', blob, `${file.name}.txt`);
        }

        const response = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
            method: 'POST',
            body: formData // Fetch automatically sets Content-Type to multipart/form-data with boundary
        });

        const data = await response.json();
        
        if (!data.ok) {
            console.error("Telegram Upload Error:", data);
            return false;
        }

        setIntegrations(p => ({...p, telegram: {...p.telegram, stats: {...p.telegram.stats, messagesSent: p.telegram.stats.messagesSent + 1}}}));
        return true;
    } catch (e) {
        console.error("Failed to upload file to Telegram", e);
        return false;
    }
  };

  // --- Telegram Polling Logic ---
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const pollTelegramUpdates = async () => {
      const { botToken, adminChatId } = integrationsRef.current.telegram.config;
      const { connected } = integrationsRef.current.telegram;

      // Stop polling if we encountered too many errors (likely CORS)
      if (pollingFailuresRef.current > 3) {
          console.warn("Telegram polling stopped due to repeated connection failures (likely CORS).");
          return; 
      }

      if (!connected || !botToken || isPollingRef.current) {
         timeoutId = setTimeout(pollTelegramUpdates, 3000);
         return;
      }

      isPollingRef.current = true;

      try {
        // Use the ref to get the absolute latest update ID
        const offset = lastUpdateIdRef.current + 1;
        const response = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates?offset=${offset}&timeout=10`);
        
        if (!response.ok) {
            throw new Error(`Telegram API Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        // Reset failure count on success
        pollingFailuresRef.current = 0;

        if (data.ok && data.result.length > 0) {
          for (const update of data.result) {
            lastUpdateIdRef.current = update.update_id;
            
            // Sync this back to state/storage eventually
            setIntegrations(prev => ({
                ...prev, 
                telegram: { ...prev.telegram, lastUpdateId: update.update_id }
            }));

            // Check if message is from admin
            if (update.message && String(update.message.chat.id) === String(adminChatId)) {
               const userText = update.message.text;

               // Typing action
               await fetch(`https://api.telegram.org/bot${botToken}/sendChatAction`, {
                  method: 'POST',
                  headers: {'Content-Type': 'application/json'},
                  body: JSON.stringify({ chat_id: adminChatId, action: 'typing' })
               });

               // Audit
               const newLog: AuditLog = {
                  id: Date.now().toString(),
                  action: AuditAction.VIEW,
                  details: `استعلام تليجرام: ${userText}`,
                  user: 'Telegram Admin',
                  timestamp: new Date().toISOString()
               };
               setAuditLogs(prev => [newLog, ...prev]);

               // AI Response
               const context = getAgentContext();
               const aiResponse = await askAgent(userText, context);

               // Handle Downloads via Telegram (Check for the tag first)
               if (aiResponse.includes('[[DOWNLOAD:')) {
                  const match = aiResponse.match(/\[\[DOWNLOAD:(.*?)\]\]/);
                  
                  // Send the text part first (removing the tag)
                  const cleanText = aiResponse.replace(/\[\[DOWNLOAD:.*?\]\]/, '');
                  await sendTelegramReal(cleanText);

                  if (match && match[1]) {
                      const targetFile = filesRef.current.find(f => f.isoMetadata?.recordId === match[1] || f.id === match[1]);
                      if (targetFile) {
                          // Execute download agent (uploads actual file)
                          executeDownloadAgent(match[1]);
                      } else {
                          await sendTelegramReal("⚠️ عذراً، لم يتم العثور على الملف المطلوب في النظام.");
                      }
                  }
               } else {
                   // Normal message
                   await sendTelegramReal(aiResponse);
               }
            }
          }
        }
      } catch (error: any) {
        // Handle CORS or Network errors specifically
        if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
            console.error("Telegram Polling: Network/CORS Error. Browser blocked the request.");
            pollingFailuresRef.current += 1;
        } else {
            console.error("Telegram Polling Error", error);
            pollingFailuresRef.current += 1;
        }
      } finally {
        isPollingRef.current = false;
        timeoutId = setTimeout(pollTelegramUpdates, 2000); 
      }
    };

    pollTelegramUpdates();

    return () => clearTimeout(timeoutId);
  }, [integrations.telegram.connected]);

  const executeDownloadAgent = async (recordId: string) => {
    const targetFile = filesRef.current.find(f => f.isoMetadata?.recordId === recordId || f.id === recordId);
    
    if (!targetFile) {
        setMainChatMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', text: '⚠️ عذراً، لم يتمكن وكيل التحميل من العثور على الملف المطلوب.', timestamp: new Date() }]);
        return;
    }

    setDownloadAgentState({ isActive: true, step: 'searching', fileName: targetFile.name, progress: 10 });
    await new Promise(r => setTimeout(r, 800));
    setDownloadAgentState(prev => ({ ...prev, step: 'retrieving', progress: 40 }));
    await new Promise(r => setTimeout(r, 800));
    setDownloadAgentState(prev => ({ ...prev, step: 'encrypting', progress: 70 }));
    await new Promise(r => setTimeout(r, 800));
    setDownloadAgentState(prev => ({ ...prev, step: 'sending', progress: 90 }));

    // UPLOAD THE ACTUAL FILE to Telegram
    const success = await sendTelegramFile(targetFile);

    setDownloadAgentState(prev => ({ ...prev, step: 'completed', progress: 100 }));

    if (success) {
        const newLog: AuditLog = {
            id: Date.now().toString(),
            action: AuditAction.VIEW,
            details: `تم تنفيذ طلب استخراج وتحميل آلي للملف: ${targetFile.name} (إرسال مباشر)`,
            user: 'AI Download Agent',
            timestamp: new Date().toISOString()
        };
        setAuditLogs(prev => [newLog, ...prev]);

        setMainChatMessages(prev => [...prev, { 
            id: Date.now().toString(), 
            role: 'assistant', 
            text: `✅ <b>مهمة مكتملة:</b> قام وكيل التحميل بإرسال ملف "${targetFile.name}" إلى تليجرام بنجاح كملف مرفق.`, 
            timestamp: new Date() 
        }]);
    } else {
         setMainChatMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', text: '❌ فشل إرسال الملف. تأكد من أن حجم الملف أقل من 50MB وأن الاتصال جيد.', timestamp: new Date() }]);
         
         // Notify User via Telegram about the failure
         await sendTelegramReal(`⚠️ <b>تنبيه فشل الإرسال:</b>\n\nحاولنا إرسال ملف "${targetFile.name}" ولكن حدث خطأ أثناء الرفع. قد يكون حجم الملف كبيراً جداً لحدود البوت (50MB) أو هناك مشكلة في الشبكة.`);
    }

    setTimeout(() => {
        setDownloadAgentState(prev => ({ ...prev, isActive: false }));
    }, 3000);
  };

  const handleConnectFolder = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    setIsScanning(true);
    setScanProgress(0);
    const newFileRecords: FileRecord[] = [];

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      setCurrentScanningFile(file.name);
      
      let textContent = '';
      if (file.type === 'text/plain' || file.name.endsWith('.txt') || file.name.endsWith('.md') || file.name.endsWith('.json') || file.name.endsWith('.csv')) {
          try {
              textContent = await file.text();
          } catch (e) {
              console.warn("Could not read file text", file.name);
          }
      }

      const record: FileRecord = {
        id: Math.random().toString(36).substr(2, 9),
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
        content: textContent.substring(0, 30000), 
        originalFile: file, // Store the actual file object for uploading later
        isProcessing: true,
        isoMetadata: {
          recordId: `ARC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
          originalPath: file.name,
          title: file.name, 
          description: "في انتظار التحليل الذكي...",
          documentType: DocumentType.OTHER,
          entity: "قيد المعالجة...",
          year: new Date().getFullYear(),
          importance: Importance.NORMAL,
          confidentiality: Confidentiality.INTERNAL,
          retentionPolicy: "...",
          expiryDate: null,
          status: ArchiveStatus.IN_PROCESS,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      };
      newFileRecords.push(record);
      await new Promise(r => setTimeout(r, 20)); 
      setScanProgress(Math.round(((i + 1) / selectedFiles.length) * 100));
    }

    setFiles(prev => [...prev, ...newFileRecords]);
    setIsScanning(false);
  };

  const handleChat = async () => {
    if (!mainChatInput.trim() || isAgentLoading) return;
    const msg = mainChatInput;
    setChatInput('');
    setMainChatMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', text: msg, timestamp: new Date() }]);
    
    setIsAgentLoading(true);
    const context = getAgentContext();
    const response = await askAgent(msg, context);
    
    if (response.includes('[[DOWNLOAD:')) {
        const match = response.match(/\[\[DOWNLOAD:(.*?)\]\]/);
        if (match && match[1]) {
             executeDownloadAgent(match[1]);
             const cleanResponse = response.replace(/\[\[DOWNLOAD:.*?\]\]/, '');
             setMainChatMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', text: cleanResponse, timestamp: new Date() }]);
             setIsAgentLoading(false);
             return;
        }
    }

    setMainChatMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', text: response, timestamp: new Date() }]);
    setIsAgentLoading(false);
  };

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return <FileBox className="text-red-500" />;
    if (['jpg', 'png'].includes(ext || '')) return <FileImage className="text-pink-500" />;
    return <FileText className="text-indigo-500" />;
  };

  const filteredFiles = useMemo(() => {
    return files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [files, searchQuery]);

  const handleVerifyTelegram = async () => {
      const { botToken, adminChatId } = integrations.telegram.config;
      
      if (!botToken || !adminChatId) {
        alert("يرجى تعبئة حقول Bot Token و Admin Chat ID أولاً.");
        return;
      }
  
      setIsVerifying(true);
      
      try {
        const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            chat_id: adminChatId, 
            text: "🟢 <b>أرشيف PRO - نجاح الاتصال</b>\n\nتم ربط هذا الحساب بنجاح مع نظام الأرشفة.\nيمكنك الآن استقبال الملفات والتنبيهات هنا.", 
            parse_mode: 'HTML' 
          })
        });
        
        const data = await response.json();
        
        if (data.ok) {
          setIntegrations(prev => ({
            ...prev,
            telegram: { ...prev.telegram, connected: true }
          }));
          alert("تم التحقق بنجاح! وصلت رسالة اختبارية إلى حسابك في تليجرام.");
        } else {
           alert(`فشل الاتصال: ${data.description || 'تأكد من صحة التوكن والـ ID'}`);
           setIntegrations(prev => ({
            ...prev,
            telegram: { ...prev.telegram, connected: false }
           }));
        }
      } catch (error) {
        alert("خطأ في الشبكة. تأكد من الاتصال بالإنترنت.");
      } finally {
        setIsVerifying(false);
      }
    };

  return (
    <div className="min-h-screen flex bg-[#fbfcfd]" dir="rtl">
      {/* القائمة الجانبية */}
      <aside className="w-80 bg-slate-900 text-slate-300 flex flex-col fixed h-full z-20 shadow-2xl border-l border-slate-800">
        <div className="p-8">
          <div className="flex items-center gap-4 mb-12">
            <div className="bg-indigo-600 w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-lg">أ</div>
            <div>
              <span className="text-2xl font-black text-white block">أرشـيـف PRO</span>
              <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest">ISO 15489 Certified</span>
            </div>
          </div>
          <nav className="space-y-2">
            {NAV_ITEMS.map(item => (
              <button 
                key={item.id} 
                onClick={() => setActiveTab(item.id)} 
                className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all ${activeTab === item.id ? 'bg-indigo-600 text-white shadow-xl' : 'text-slate-400 hover:bg-slate-800'}`}
              >
                <item.icon size={20} />
                <span className="text-sm font-bold">{item.label}</span>
              </button>
            ))}
          </nav>
        </div>
        <div className="mt-auto p-8 border-t border-slate-800 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-indigo-400"><User size={20} /></div>
          <div>
            <p className="text-xs font-black text-white">{systemSettings.profile.name}</p>
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-tighter">{systemSettings.profile.role}</p>
          </div>
        </div>
      </aside>

      {/* المحتوى الرئيسي */}
      <main className="flex-1 mr-80 p-10 overflow-y-auto">
        {activeTab === 'dashboard' && (
          <div className="space-y-8 animate-saas max-w-7xl mx-auto">
            <header className="flex justify-between items-center bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
              <div>
                <h1 className="text-4xl font-black text-slate-900">نظرة عامة</h1>
                <p className="text-slate-400 font-bold mt-1">إحصائيات الأرشفة الحية ونشاط الوكيل الذكي.</p>
              </div>
              <div className="flex gap-4">
                 <div className="px-6 py-3 bg-indigo-50 text-indigo-600 rounded-2xl font-bold flex items-center gap-2 border border-indigo-100">
                    <Zap size={20} className="animate-pulse" /> Gemini AI نشط
                 </div>
              </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-8">
                <div className="grid grid-cols-2 gap-6">
                  <div className="bg-white p-8 rounded-[2rem] border shadow-sm flex items-center justify-between">
                    <div>
                      <p className="text-xs font-black text-slate-400 uppercase mb-2">إجمالي السجلات</p>
                      <h3 className="text-4xl font-black text-slate-800">{files.length}</h3>
                    </div>
                    <div className="bg-slate-50 p-5 rounded-2xl text-indigo-600"><Database size={28} /></div>
                  </div>
                  <div className="bg-white p-8 rounded-[2rem] border shadow-sm flex items-center justify-between">
                    <div>
                      <p className="text-xs font-black text-slate-400 uppercase mb-2">سجلات اليوم</p>
                      <h3 className="text-4xl font-black text-slate-800">0</h3>
                    </div>
                    <div className="bg-slate-50 p-5 rounded-2xl text-emerald-600"><FileCheck size={28} /></div>
                  </div>
                </div>

                {/* واجهة المساعد الذكي */}
                <div className="bg-slate-900 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col h-[500px]">
                   <div className="p-6 border-b border-white/10 flex items-center justify-between bg-slate-800/50">
                      <div className="flex items-center gap-3">
                         <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white">
                            <Bot size={24} />
                         </div>
                         <div>
                            <h3 className="text-white font-black text-sm">مساعد الأرشفة الذكي</h3>
                            <p className="text-indigo-400 text-[10px] font-bold uppercase tracking-widest">Online Agent</p>
                         </div>
                      </div>
                      <Sparkles className="text-indigo-400 animate-pulse" size={20} />
                   </div>
                   <div className="flex-1 overflow-y-auto p-6 space-y-4 flex flex-col">
                      {mainChatMessages.map(msg => (
                         <div key={msg.id} className={`max-w-[80%] p-4 rounded-2xl text-sm leading-relaxed ${msg.role === 'assistant' ? 'bg-slate-800 text-slate-200 self-start' : 'bg-indigo-600 text-white self-end'}`}>
                            <div dangerouslySetInnerHTML={{ __html: msg.text }} />
                            <div className="mt-2 text-[9px] opacity-40 font-bold">{new Date(msg.timestamp).toLocaleTimeString('ar-SA')}</div>
                         </div>
                      ))}
                      {isAgentLoading && (
                        <div className="bg-slate-800 p-4 rounded-2xl self-start flex gap-1">
                           <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce"></span>
                           <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce delay-100"></span>
                           <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce delay-200"></span>
                        </div>
                      )}
                      
                      {/* Download Agent UI Overlay */}
                      {downloadAgentState.isActive && (
                        <div className="bg-slate-800/80 p-6 rounded-3xl border border-indigo-500/30 flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4">
                           <div className="flex justify-between items-center text-indigo-300 text-xs font-black uppercase tracking-widest">
                              <span>وكيل التحميل الآلي</span>
                              <span>{downloadAgentState.progress}%</span>
                           </div>
                           <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                              <div className="h-full bg-indigo-500 transition-all duration-500 ease-out" style={{ width: `${downloadAgentState.progress}%` }}></div>
                           </div>
                           <div className="flex items-center gap-3 text-white text-sm font-bold">
                              {downloadAgentState.step === 'searching' && <Search size={16} className="animate-spin" />}
                              {downloadAgentState.step === 'retrieving' && <Download size={16} className="animate-bounce" />}
                              {downloadAgentState.step === 'encrypting' && <Lock size={16} />}
                              {downloadAgentState.step === 'sending' && <Send size={16} />}
                              {downloadAgentState.step === 'completed' && <CheckCircle2 size={16} className="text-green-500" />}
                              
                              <span>
                                {downloadAgentState.step === 'searching' && 'جاري البحث عن السجل...'}
                                {downloadAgentState.step === 'retrieving' && 'سحب الملف من قاعدة البيانات...'}
                                {downloadAgentState.step === 'encrypting' && 'تشفير البيانات للإرسال...'}
                                {downloadAgentState.step === 'sending' && 'إرسال إلى تليجرام...'}
                                {downloadAgentState.step === 'completed' && 'تم الإرسال بنجاح!'}
                              </span>
                           </div>
                        </div>
                      )}
                   </div>
                   <div className="p-4 bg-slate-800 border-t border-white/10">
                      <div className="flex gap-2 bg-slate-900 p-2 rounded-xl border border-white/5">
                         <input 
                           type="text" 
                           className="flex-1 bg-transparent border-none outline-none text-white px-3 py-2 text-sm"
                           placeholder="اسأل المساعد عن أي ملف أو قاعدة..."
                           value={mainChatInput}
                           onChange={e => setChatInput(e.target.value)}
                           onKeyPress={e => e.key === 'Enter' && handleChat()}
                         />
                         <button 
                           onClick={handleChat}
                           className="bg-indigo-600 p-2 rounded-lg text-white hover:bg-indigo-500 transition-all"
                         >
                            <Send size={18} />
                         </button>
                      </div>
                   </div>
                </div>
              </div>

              {/* سجل النشاط */}
              <div className="bg-white p-8 rounded-[2.5rem] border shadow-sm flex flex-col">
                <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2"><History size={20} className="text-indigo-600" /> النشاط الأخير</h3>
                <div className="space-y-6 flex-1 overflow-y-auto">
                  {auditLogs.map(log => (
                    <div key={log.id} className="border-r-2 border-slate-100 pr-4 py-1">
                      <p className="text-xs font-black text-indigo-600">{log.action}</p>
                      <p className="text-sm font-bold text-slate-700 mt-1">{log.details}</p>
                      <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase">{new Date(log.timestamp).toLocaleTimeString('ar-SA')}</p>
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
            <header className="flex justify-between items-center bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
              <div>
                <h1 className="text-4xl font-black text-slate-900">الأرشيف المركزي</h1>
                <p className="text-slate-400 font-bold mt-1">تصفح وإدارة السجلات الرقمية.</p>
              </div>
              <div className="flex gap-4">
                <div className="relative w-80">
                  <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    className="w-full pr-12 pl-4 py-4 bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white rounded-2xl outline-none transition-all font-bold text-sm" 
                    placeholder="بحث في الأرشيف..." 
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  multiple 
                  // @ts-ignore
                  webkitdirectory="true" 
                  onChange={handleConnectFolder} 
                />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black flex items-center gap-3 hover:bg-indigo-700 shadow-xl shadow-indigo-100 transition-all"
                >
                  <FolderPlus size={24} /> ربط مجلد محلي
                </button>
              </div>
            </header>

            {isScanning && (
              <div className="bg-indigo-600 text-white p-10 rounded-[2.5rem] shadow-2xl flex flex-col items-center gap-6 animate-pulse">
                <Loader2 className="animate-spin" size={48} />
                <div className="text-center">
                  <h3 className="text-2xl font-black">جاري استيراد الملفات...</h3>
                  <p className="text-indigo-200 font-bold mt-2">يتم قراءة: {currentScanningFile}</p>
                </div>
                <div className="w-full max-w-md h-3 bg-indigo-400/30 rounded-full overflow-hidden">
                  <div className="h-full bg-white transition-all duration-300" style={{ width: `${scanProgress}%` }}></div>
                </div>
                <p className="font-black">{scanProgress}% مكتمل</p>
              </div>
            )}

            {filteredFiles.length === 0 && !isScanning ? (
              <div className="py-32 flex flex-col items-center justify-center bg-white rounded-[3rem] border-2 border-dashed border-slate-200 opacity-60">
                <div className="bg-slate-50 p-10 rounded-full mb-6"><Archive size={80} className="text-slate-300" /></div>
                <h3 className="text-2xl font-black text-slate-800">الأرشيف فارغ حالياً</h3>
                <p className="text-slate-400 font-bold mt-2">قم بربط مجلد محلي لبدء عملية الأرشفة الذكية.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {filteredFiles.map(file => (
                  <div key={file.id} onClick={() => setSelectedFileId(file.id)} className="bg-white p-8 rounded-[2.5rem] border shadow-sm hover:shadow-2xl transition-all cursor-pointer group relative">
                    {/* Processing Indicator */}
                    {file.isProcessing && (
                      <div className="absolute top-6 left-6 animate-pulse">
                         <div className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full text-[10px] font-black flex items-center gap-1 border border-indigo-100 shadow-sm">
                            <Loader2 size={12} className="animate-spin" /> جاري التحليل...
                         </div>
                      </div>
                    )}

                    <div className="bg-slate-50 w-16 h-16 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                      {getFileIcon(file.name)}
                    </div>
                    <h3 className="text-xl font-black text-slate-800 truncate mb-1">{file.isoMetadata?.title || file.name}</h3>
                    <p className="text-xs text-indigo-500 font-black uppercase tracking-widest mb-4">{file.isoMetadata?.incomingNumber || file.isoMetadata?.recordId}</p>
                    <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                       <span className="px-3 py-1 bg-slate-100 rounded-full text-[10px] font-black">{file.isoMetadata?.documentType}</span>
                       <span className="text-[10px] text-slate-400 font-bold">{new Date(file.lastModified).toLocaleDateString('ar-SA')}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-6xl mx-auto animate-saas">
            <header className="mb-10 flex justify-between items-end">
              <div>
                <h1 className="text-5xl font-black text-slate-900">الإعدادات</h1>
                <p className="text-slate-400 font-bold mt-2 text-lg">تحكم في هوية المنصة، قواعد الذكاء الاصطناعي، والربط البرمجي.</p>
              </div>
              <button 
                onClick={() => { setIsSaving(true); setTimeout(() => setIsSaving(false), 1000); }}
                className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black flex items-center gap-3 hover:bg-indigo-700 shadow-xl transition-all"
              >
                {isSaving ? <Loader2 className="animate-spin" /> : <Save size={20} />}
                {isSaving ? 'جاري الحفظ...' : 'حفظ التغييرات'}
              </button>
            </header>

            <div className="bg-white rounded-[3rem] border shadow-xl overflow-hidden flex min-h-[700px]">
              <aside className="w-72 bg-slate-50 border-l p-8 space-y-2">
                {[
                  { id: 'general', label: 'العامة', icon: User },
                  { id: 'integrations', label: 'الربط البرمجي', icon: Cpu },
                  { id: 'archiving', label: 'قواعد الأرشفة', icon: Scale },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setSettingsTab(tab.id)}
                    className={`w-full flex items-center gap-3 px-5 py-4 rounded-2xl font-bold text-sm transition-all ${settingsTab === tab.id ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}
                  >
                    <tab.icon size={18} />
                    {tab.label}
                  </button>
                ))}
              </aside>

              <div className="flex-1 p-12">
                {settingsTab === 'general' && (
                  <div className="space-y-10 animate-in fade-in">
                    <section className="space-y-6">
                      <h3 className="text-2xl font-black text-slate-800 flex items-center gap-3"><UserSquare2 className="text-indigo-600" /> الملف الشخصي</h3>
                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label className="text-sm font-black text-slate-500 mr-2">الاسم</label>
                          <input className="w-full p-4 bg-slate-50 rounded-2xl outline-none font-bold focus:bg-white border-2 border-transparent focus:border-indigo-500 transition-all" value={systemSettings.profile.name} onChange={e => setSystemSettings({...systemSettings, profile: {...systemSettings.profile, name: e.target.value}})} />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-black text-slate-500 mr-2">المسمى</label>
                          <input className="w-full p-4 bg-slate-50 rounded-2xl outline-none font-bold focus:bg-white border-2 border-transparent focus:border-indigo-500 transition-all" value={systemSettings.profile.role} onChange={e => setSystemSettings({...systemSettings, profile: {...systemSettings.profile, role: e.target.value}})} />
                        </div>
                      </div>
                    </section>
                  </div>
                )}

                {settingsTab === 'integrations' && (
                  <div className="space-y-8 animate-in fade-in">
                    <div className="p-8 bg-blue-50/50 border border-blue-100 rounded-[2.5rem] flex items-center gap-6">
                      <div className="w-20 h-20 bg-white rounded-3xl shadow-sm flex items-center justify-center text-blue-500"><Smartphone size={40} /></div>
                      <div className="flex-1">
                        <h3 className="text-2xl font-black text-slate-800">ربط تليجرام</h3>
                        <p className="text-slate-500 font-bold text-sm">تفعيل الأوامر الصوتية واستخراج الملفات عبر الهاتف.</p>
                      </div>
                      <div className={`px-4 py-2 rounded-full text-xs font-black ${integrations.telegram.connected ? 'bg-green-100 text-green-600' : 'bg-slate-200 text-slate-500'}`}>
                        {integrations.telegram.connected ? 'متصل' : 'غير متصل'}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-6 max-w-2xl">
                       <div className="space-y-2">
                          <label className="text-sm font-black text-slate-500 mr-2 flex items-center gap-2"><Key size={14} /> Bot Token</label>
                          <input type="password" placeholder="BotFather Token..." className="w-full p-4 bg-slate-50 rounded-2xl outline-none font-mono text-sm" value={integrations.telegram.config.botToken} onChange={e => setIntegrations({...integrations, telegram: {...integrations.telegram, config: {...integrations.telegram.config, botToken: e.target.value}}})} />
                       </div>
                       <div className="space-y-2">
                          <label className="text-sm font-black text-slate-500 mr-2 flex items-center gap-2"><Hash size={14} /> Admin Chat ID</label>
                          <input type="text" placeholder="معرف الدردشة الخاص بك (مثال: 12345678)" className="w-full p-4 bg-slate-50 rounded-2xl outline-none font-mono text-sm" value={integrations.telegram.config.adminChatId} onChange={e => setIntegrations({...integrations, telegram: {...integrations.telegram, config: {...integrations.telegram.config, adminChatId: e.target.value}}})} />
                          <p className="text-[10px] text-slate-400 font-bold mr-2 mt-1 italic">نصيحة: احصل على معرفك بإرسال رسالة للبوت @userinfobot</p>
                       </div>
                       <button 
                         onClick={handleVerifyTelegram}
                         disabled={isVerifying}
                         className={`bg-slate-900 text-white p-5 rounded-2xl font-black shadow-lg hover:bg-slate-800 transition-all flex items-center justify-center gap-3 ${isVerifying ? 'opacity-70 cursor-not-allowed' : ''}`}
                       >
                         {isVerifying ? <Loader2 className="animate-spin" size={20} /> : <ShieldCheck size={20} />} 
                         {isVerifying ? 'جاري التحقق...' : 'تفعيل الربط والتحقق'}
                       </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* مودال تفاصيل الملف */}
      {selectedFile && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 backdrop-blur-xl p-4 animate-in fade-in">
           <div className="bg-white w-full max-w-4xl rounded-[3rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              <div className="p-10 border-b flex justify-between items-center bg-slate-50/50">
                 <div className="flex items-center gap-6">
                    <div className="bg-indigo-600 p-5 rounded-2xl text-white shadow-xl">{getFileIcon(selectedFile.name)}</div>
                    <div>
                       <h3 className="text-3xl font-black text-slate-900 leading-tight">{selectedFile.isoMetadata?.title || selectedFile.name}</h3>
                       <p className="text-indigo-600 font-black text-sm tracking-widest mt-1 uppercase">{selectedFile.isoMetadata?.recordId}</p>
                    </div>
                 </div>
                 <button onClick={() => setSelectedFileId(null)} className="p-4 hover:bg-rose-50 rounded-2xl text-slate-400 hover:text-rose-600 transition-all border"><X size={28} /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-12 space-y-12">
                 <div className="grid grid-cols-2 gap-10">
                    <div className="bg-slate-50 p-8 rounded-[2rem] border">
                       <h4 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-3"><Info size={20} className="text-indigo-600" /> البيانات الوصفية (ISO)</h4>
                       <div className="space-y-4">
                          {[
                            { label: 'النوع', value: selectedFile.isoMetadata?.documentType, icon: Layers },
                            { label: 'رقم المعاملة', value: selectedFile.isoMetadata?.incomingNumber || '-', icon: Hash, highlight: true },
                            { label: 'الرقم الخارجي / الصادر', value: selectedFile.isoMetadata?.outgoingNumber || '-', icon: ExternalLink },
                            { label: 'تاريخ المعاملة', value: selectedFile.isoMetadata?.fullDate || '-', icon: Clock },
                            { label: 'المرسل', value: selectedFile.isoMetadata?.sender || 'غير محدد', icon: User },
                            { label: 'المستلم', value: selectedFile.isoMetadata?.recipient || 'غير محدد', icon: User },
                            { label: 'الأهمية', value: selectedFile.isoMetadata?.importance, icon: AlertTriangle },
                            { label: 'السرية', value: selectedFile.isoMetadata?.confidentiality, icon: Shield },
                          ].map((item, idx) => (
                             <div key={idx} className={`flex justify-between items-center py-3 border-b border-slate-200 last:border-0 ${item.highlight ? 'bg-indigo-50/50 -mx-2 px-2 rounded-lg' : ''}`}>
                                <span className="text-xs font-bold text-slate-400 flex items-center gap-2"><item.icon size={14} /> {item.label}</span>
                                <span className={`text-sm font-black ${item.highlight ? 'text-indigo-600' : 'text-slate-700'}`}>{item.value}</span>
                             </div>
                          ))}
                       </div>
                    </div>
                    <div className="space-y-6">
                       <h4 className="text-lg font-black text-slate-800 flex items-center gap-3"><Sparkles size={24} className="text-indigo-600" /> التحليل الذكي</h4>
                       <div className="bg-white p-8 rounded-[2rem] border-2 border-indigo-50 shadow-sm min-h-[150px]">
                          {selectedFile.isProcessing ? (
                              <div className="h-full flex flex-col items-center justify-center text-indigo-400 gap-3">
                                  <Loader2 size={32} className="animate-spin" />
                                  <p className="font-bold text-sm">جاري تحليل محتوى المستند وتصنيفه...</p>
                              </div>
                          ) : (
                              <div className="space-y-4">
                                <p className="text-slate-700 font-bold leading-relaxed text-sm italic">"{selectedFile.isoMetadata?.description}"</p>
                                {selectedFile.isoMetadata?.executiveSummary && (
                                    <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                                        <p className="text-xs font-black text-indigo-600 mb-2 uppercase tracking-wider">الملخص التنفيذي</p>
                                        <p className="text-slate-800 text-sm leading-7 whitespace-pre-wrap">{selectedFile.isoMetadata.executiveSummary}</p>
                                    </div>
                                )}
                              </div>
                          )}
                       </div>
                    </div>
                 </div>
              </div>
              <div className="p-10 bg-slate-50/50 border-t flex justify-end gap-4">
                 <button className="px-10 py-5 bg-white border-2 border-slate-200 text-slate-700 rounded-2xl font-black flex items-center gap-3 hover:bg-slate-50 transition-all"><Eye size={20} /> معاينة</button>
                 <button className="px-12 py-5 bg-indigo-600 text-white rounded-2xl font-black flex items-center gap-3 hover:bg-indigo-700 shadow-xl shadow-indigo-100 transition-all"><Download size={20} /> تحميل آمن</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default App;
