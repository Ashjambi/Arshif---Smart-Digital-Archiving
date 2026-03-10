
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  FileText, Search, Plus, X, Send, Loader2, 
  ArrowRight, Bot, FileImage, 
  FileBox, Activity, MessageSquare, Database, 
  Clock, Download, Trash2,
  AlertTriangle, Sparkles, Eye, AlertCircle,
  Settings as SettingsIcon, ShieldCheck,
  ChevronLeft, Trash, Save, Info, Bell, Shield,
  Layers, Edit3, PlusCircle,
  History, CheckCircle2, Zap, Globe, ShieldAlert, Cpu,
  ChevronRight, Lock, Key, ExternalLink,
  MessageCircle, CheckCircle, Verified, Server, Code2, Globe2,
  Send as TelegramIcon, UserSquare2,
  HardDrive, FolderPlus, RefreshCw, FolderOpen, FolderSync,
  User, FileCheck, Archive, Scale, Smartphone, Hash, FileInput,
  Link2, LogOut, RotateCcw
} from 'lucide-react';

import { 
  FileRecord, ArchiveStatus, AuditAction, AuditLog, ChatMessage, DocumentType, Importance, Confidentiality, ISOMetadata
} from '../types';
import { NAV_ITEMS, STATUS_COLORS } from '../constants';
import { askAgent, askAgentStream, analyzeSpecificFile, APP_VERSION, setApiKey, hasApiKey } from '../services/geminiService';
import { TelegramService } from '../services/telegramService';
import { saveFileToDB, getFileFromDB, getAllFilesFromDB, clearDB, saveDirectoryHandle, getDirectoryHandle } from './services/storageService';

const STORAGE_KEY = 'ARSHIF_PLATFORM_V7_FILES';
const AUDIT_KEY = 'ARSHIF_PLATFORM_V7_AUDIT';
const INTEGRATION_KEY = 'ARSHIF_PLATFORM_V7_TELEGRAM';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [settingsTab, setSettingsTab] = useState('general');
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [directoryHandle, setDirectoryHandle] = useState<any>(null);
  const [isAutoSyncEnabled, setIsAutoSyncEnabled] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<number>(0);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [mainChatMessages, setMainChatMessages] = useState<ChatMessage[]>([]);
  const [mainChatInput, setChatInput] = useState('');
  const [isAgentLoading, setIsAgentLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [currentScanningFile, setCurrentScanningFile] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [apiKey, setApiKeyState] = useState('');
  const [isApiKeySet, setIsApiKeySet] = useState(false);

  // Function to set API Key
  const handleSetApiKey = (key: string) => {
    setApiKeyState(key);
    localStorage.setItem('GEMINI_API_KEY', key);
    setIsApiKeySet(true);
  };

  const [integrations, setIntegrations] = useState({
    telegram: {
      connected: false,
      lastUpdateId: 0,
      config: { botToken: '', adminChatId: '' },
      stats: { messagesSent: 0 },
      allowedUsers: [] as string[]
    }
  });

  const [newUserChatId, setNewUserChatId] = useState('');

  const filesRef = useRef(files);
  const integrationsRef = useRef(integrations);
  const activeAnalysisIds = useRef<Set<string>>(new Set());
  const isPollingRef = useRef(false);
  const lastUpdateIdRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { filesRef.current = files; }, [files]);
  useEffect(() => { 
    integrationsRef.current = integrations; 
    if (telegramServiceRef.current) {
        telegramServiceRef.current.updateConfig(integrations.telegram.config);
    }
  }, [integrations]);

  useEffect(() => {
    if (!localStorage.getItem('instance_id')) {
        localStorage.setItem('instance_id', `NODE-${Math.random().toString(36).substr(2, 6).toUpperCase()}`);
    }
  }, []);

  // Check if API Key is set
  useEffect(() => {
    const storedKey = localStorage.getItem('GEMINI_API_KEY');
    if (storedKey && storedKey.length > 0) {
      setIsApiKeySet(true);
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
        const savedFiles = localStorage.getItem(STORAGE_KEY);
        const savedAudit = localStorage.getItem(AUDIT_KEY);
        const savedInteg = localStorage.getItem(INTEGRATION_KEY);
        
        if (savedFiles) {
            const parsedFiles: FileRecord[] = JSON.parse(savedFiles);
            // Hydrate with large data from IndexedDB
            try {
                const dbFiles = await getAllFilesFromDB();
                const hydratedFiles = parsedFiles.map(f => {
                    const dbRecord = dbFiles.find(d => d.id === f.id);
                    return dbRecord ? { ...f, base64Data: dbRecord.base64Data } : f;
                });
                setFiles(hydratedFiles);
            } catch (e) {
                console.error("Failed to load from IndexedDB", e);
                setFiles(parsedFiles);
            }
        }
        if (savedAudit) setAuditLogs(JSON.parse(savedAudit));
        if (savedInteg) {
          const parsedInteg = JSON.parse(savedInteg);
          setIntegrations(parsedInteg);
          lastUpdateIdRef.current = parsedInteg.telegram.lastUpdateId || 0;
        }
    };
    loadData();
  }, []);

  useEffect(() => {
    // Save metadata to LocalStorage (lightweight)
    // Exclude 'base64Data' and 'originalFile' from LocalStorage to prevent quota crash
    const toSave = files.map(({ originalFile, base64Data, ...rest }) => rest);
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch (e) {
        console.error("LocalStorage Quota Exceeded", e);
        alert("⚠️ تنبيه: مساحة التخزين المحلية ممتلئة. قد لا يتم حفظ بعض التغييرات.");
    }
    
    // Save large data to IndexedDB (heavyweight)
    files.forEach(f => {
        if (f.base64Data) {
            saveFileToDB(f).catch(e => console.error("IndexedDB Save Error", e));
        }
    });

    localStorage.setItem(AUDIT_KEY, JSON.stringify(auditLogs));
    localStorage.setItem(INTEGRATION_KEY, JSON.stringify(integrations));
  }, [files, auditLogs, integrations]);

  const handleResetArchive = async () => {
    if (window.confirm("⚠️ هل تود مسح كافة البيانات؟")) {
      setFiles([]);
      setAuditLogs([]);
      setIntegrations({
        telegram: { connected: false, lastUpdateId: 0, config: { botToken: '', adminChatId: '' }, stats: { messagesSent: 0 }, allowedUsers: [] }
      });
      localStorage.clear();
      await clearDB(); // Clear IndexedDB too
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
      // Increase parallel processing to 5 for faster batch analysis
      const pendingFiles = files.filter(f => f.isProcessing).slice(0, 5);
      if (pendingFiles.length === 0) return;
      
      // Filter out files that are already being handled by an active promise
      const filesToAnalyze = pendingFiles.filter(f => !activeAnalysisIds.current.has(f.id));
      if (filesToAnalyze.length === 0) return;

      filesToAnalyze.forEach(async (pending) => {
        activeAnalysisIds.current.add(pending.id);
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
              status: analysis.status || ArchiveStatus.ACTIVE,
              expiryDate: null
            }
          } : f));

          setAuditLogs(prev => [{ 
            id: Date.now().toString(), 
            action: AuditAction.UPDATE, 
            details: `تم تحليل الوثيقة: ${pending.name}`, 
            user: 'Gemini AI', 
            timestamp: new Date().toISOString() 
          }, ...prev]);

          // Auto-send to Telegram if connected
          if (integrationsRef.current.telegram.connected && analysis.status !== ArchiveStatus.ERROR) {
             const extInbound = analysis.externalInboundNumber ? `📥 <b>وارد خارجي:</b> ${analysis.externalInboundNumber}\n` : '';
             const attachments = analysis.attachments ? `📎 <b>المشفوعات:</b> ${analysis.attachments}\n` : '';
             const signatory = analysis.signatory ? `✍️ <b>الموقع:</b> ${analysis.signatory}\n` : '';
             
             const summaryText = `📄 <b>تحليل وثيقة جديد:</b>\n\n` +
               `📌 <b>العنوان:</b> ${analysis.title}\n` +
               `📝 <b>الملخص:</b> ${analysis.executiveSummary}\n` +
               `🏢 <b>الجهة:</b> ${analysis.sender || '-'}\n` +
               `📅 <b>التاريخ:</b> ${analysis.fullDate || '-'}\n` +
               extInbound + attachments + signatory +
               `\n[[DOWNLOAD:${pending.id}]]`;
             sendToTelegram(summaryText);
          }

        } catch (e: any) {
          console.error("Analysis Queue Error:", e);
          setFiles(prev => prev.map(f => f.id === pending.id ? { 
            ...f, 
            isProcessing: false,
            isoMetadata: {
              ...f.isoMetadata!,
              status: ArchiveStatus.ERROR,
              executiveSummary: `⚠️ خطأ تقني: ${e.message || 'تعذر الاتصال بالخادم'}`
            }
          } : f));
        } finally { 
          activeAnalysisIds.current.delete(pending.id);
        }
      });
    };
    
    const interval = setInterval(runAnalysis, 1000);
    return () => clearInterval(interval);
  }, [files]);

  const handleRetryAnalysis = (id: string) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, isProcessing: true, retryCount: 0 } : f));
  };

  const sendToTelegram = async (text: string) => {
    const { config, connected } = integrationsRef.current.telegram;
    const { botToken, adminChatId } = config;
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
    const { config, connected } = integrationsRef.current.telegram;
    const { botToken, adminChatId } = config;
    if (!connected || !file.originalFile || !botToken) return false;
    const fd = new FormData();
    fd.append('chat_id', adminChatId);
    fd.append('document', file.originalFile);
    
    // Enhanced Caption with Executive Summary
    const summary = file.isoMetadata?.executiveSummary 
        ? `\n\n📝 <b>الملخص التنفيذي:</b>\n${file.isoMetadata.executiveSummary.substring(0, 800)}${file.isoMetadata.executiveSummary.length > 800 ? '...' : ''}` 
        : '';
    
    fd.append('caption', `📂 <b>المستند:</b> ${file.name}\n✅ تم التحليل الذكي.${summary}`);
    fd.append('parse_mode', 'HTML');
    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, { method: 'POST', body: fd });
      const data = await res.json();
      return data.ok;
    } catch { return false; }
  };

  const [systemHealth, setSystemHealth] = useState({
    gemini: { status: 'unknown', message: '' },
    telegram: { status: 'unknown', lastCheck: null as Date | null, error: '' }
  });

  const [isDetectingChatId, setIsDetectingChatId] = useState(false);

  // New State for Logs
  const [telegramLogs, setTelegramLogs] = useState<string[]>([]);
  const telegramServiceRef = useRef<TelegramService | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Diagnostics State
  const [diagStep, setDiagStep] = useState(0);
  const [diagResults, setDiagResults] = useState<{ step: string; status: 'pending' | 'ok' | 'error'; details: string }[]>([]);

  const runDiagnostics = async () => {
    if (!telegramServiceRef.current) return;
    setDiagStep(1);
    setDiagResults([]);

    // Step 1: Check Token (getMe)
    setDiagResults(p => [...p, { step: 'Checking Token (getMe)', status: 'pending', details: 'Connecting...' }]);
    const me = await telegramServiceRef.current.getMe();
    if (me && me.ok) {
        setDiagResults(p => p.map(r => r.step.includes('Token') ? { ...r, status: 'ok', details: `Authenticated as @${me.result.username}` } : r));
    } else {
        setDiagResults(p => p.map(r => r.step.includes('Token') ? { ...r, status: 'error', details: 'Invalid Token or Connection Failed' } : r));
        setDiagStep(0);
        return;
    }

    // Step 2: Check Webhook (getWebhookInfo)
    setDiagStep(2);
    setDiagResults(p => [...p, { step: 'Checking Webhook Status', status: 'pending', details: 'Analyzing...' }]);
    const wh = await telegramServiceRef.current.getWebhookInfo();
    if (wh && wh.ok) {
        if (wh.result.url) {
            setDiagResults(p => p.map(r => r.step.includes('Webhook') ? { ...r, status: 'error', details: `CONFLICT: Webhook is active at ${wh.result.url}. This blocks the app.` } : r));
            // Auto-offer fix
            if (confirm("⚠️ تعارض: يوجد Webhook نشط يمنع التطبيق من العمل. هل تريد حذفه الآن؟")) {
                await telegramServiceRef.current.deleteWebhook();
                setDiagResults(p => [...p, { step: 'Fixing Webhook', status: 'ok', details: 'Webhook deleted successfully.' }]);
            }
        } else {
            setDiagResults(p => p.map(r => r.step.includes('Webhook') ? { ...r, status: 'ok', details: 'Clean. No Webhook active (Correct for this app).' } : r));
        }
    } else {
        setDiagResults(p => p.map(r => r.step.includes('Webhook') ? { ...r, status: 'error', details: 'Failed to fetch webhook info' } : r));
    }

    // Step 3: Test Polling
    setDiagStep(3);
    setDiagResults(p => [...p, { step: 'Testing Polling', status: 'pending', details: 'Waiting for response...' }]);
    try {
        // We just check if we can reach the endpoint
        const lastId = await telegramServiceRef.current.poll();
        setDiagResults(p => p.map(r => r.step.includes('Polling') ? { ...r, status: 'ok', details: `Connection successful. Last Update ID: ${lastId}` } : r));
    } catch (e) {
        setDiagResults(p => p.map(r => r.step.includes('Polling') ? { ...r, status: 'error', details: 'Polling failed.' } : r));
    }
    
    setDiagStep(4);
  };

  // Initialize Instance ID
  useEffect(() => {
    if (!localStorage.getItem('instance_id')) {
        localStorage.setItem('instance_id', `NODE-${Math.random().toString(36).substr(2, 6).toUpperCase()}`);
    }
  }, []);

  // Initialize Service
  useEffect(() => {
    telegramServiceRef.current = new TelegramService(integrations.telegram.config);
    telegramServiceRef.current.setOnLog((log) => {
      setTelegramLogs(prev => {
        const newLogs = [`[${new Date().toLocaleTimeString()}] ${log}`, ...prev].slice(0, 100);
        return newLogs;
      });
    });
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    if (logsEndRef.current) {
        logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [telegramLogs]);

  // Update Config when it changes
  useEffect(() => {
    if (telegramServiceRef.current) {
      telegramServiceRef.current.updateConfig(integrations.telegram.config);
      // Restore last update ID to avoid re-processing old messages
      telegramServiceRef.current.setLastUpdateId(integrations.telegram.lastUpdateId);
    }
  }, [integrations.telegram.config, integrations.telegram.lastUpdateId]);

  // Hybrid Mode State - Default to FALSE for robustness
  const [useWebhookRelay, setUseWebhookRelay] = useState(false);

  // --- Background Auto-Repair Logic ---
  useEffect(() => {
    const repairInterval = setInterval(async () => {
      if (isScanning || files.length === 0) return;

      // Find files that need re-analysis (failed or missing summary)
      const failedFiles = files.filter(f => {
        const summary = f.isoMetadata?.executiveSummary || '';
        const hasError = f.isoMetadata?.status === ArchiveStatus.ERROR || 
                         summary.includes('{"error"') || 
                         summary.includes('503') || 
                         summary.includes('429') ||
                         summary.includes('تعذر تحليل') ||
                         summary === 'No summary';
        
        const retries = f.retryCount || 0;
        return !f.isoMetadata || (hasError && !f.isProcessing && retries < 3);
      });

      if (failedFiles.length > 0) {
        const target = failedFiles[0]; // Process one at a time
        
        // Mark as processing and increment retry count
        setFiles(prev => prev.map(f => f.id === target.id ? { 
          ...f, 
          isProcessing: true, 
          retryCount: (f.retryCount || 0) + 1 
        } : f));
        
        try {
          // We need the file object.
          if (!target.originalFile && !target.base64Data) {
            setFiles(prev => prev.map(f => f.id === target.id ? { ...f, isProcessing: false } : f));
            return;
          }

          let b64 = "";
          if (target.originalFile) {
            b64 = await fileToBase64(target.originalFile);
          } else {
            b64 = target.base64Data!;
          }

          const result = await analyzeSpecificFile(target.name, b64, target.type, true);
          if (result && result.status !== ArchiveStatus.ERROR) {
            setFiles(prev => prev.map(f => f.id === target.id ? { 
              ...f, 
              isProcessing: false,
              isoMetadata: { ...f.isoMetadata, ...result, status: ArchiveStatus.ACTIVE } 
            } : f));
          } else {
            // If it failed again, just mark as not processing
            setFiles(prev => prev.map(f => f.id === target.id ? { ...f, isProcessing: false } : f));
          }
        } catch (e: any) {
          setFiles(prev => prev.map(f => f.id === target.id ? { ...f, isProcessing: false } : f));
          const errorMsg = e?.message || "";
          if (errorMsg.includes("API key expired") || errorMsg.includes("API_KEY_INVALID")) {
            console.error("[Auto-Repair] API Key Invalid. Stopping repair cycle.");
            return; // Stop this interval execution
          }
        }
      }
    }, 30000); // Check every 30 seconds to be gentle on API

    return () => clearInterval(repairInterval);
  }, [files, isScanning]);

  // Main Polling Effect
  useEffect(() => {
    if (!telegramServiceRef.current) {
        telegramServiceRef.current = new TelegramService(integrations.telegram.config);
    }
    const service = telegramServiceRef.current;
    if (!service) return;

    // Define the message handler with access to current 'files' state
    service.setOnMessage(async (query, chatId) => {
      // Authorization Check
      const telegramData = integrationsRef.current?.telegram;
      if (!telegramData) return "⚠️ خطأ في تكوين النظام.";

      const adminChatId = telegramData.config?.adminChatId;
      const allowedUsers = telegramData.allowedUsers || [];
      
      // Allow if it's the admin OR if it's in the allowed list
      const isAuthorized = (adminChatId && String(chatId) === String(adminChatId)) || allowedUsers.includes(String(chatId));
      
      if (!isAuthorized) {
          console.warn(`Unauthorized access attempt from ${chatId}`);
          service.log(`🚫 Unauthorized access attempt from ID: ${chatId}`);
          return "⛔ عذراً، ليس لديك صلاحية الوصول لهذا البوت. يرجى التواصل مع المسؤول لإضافتك.";
      }

      service.log(`🤖 Processing query: "${query.substring(0, 20)}..."`);

      // Use ref to get latest files without re-binding
      const currentFiles = filesRef.current;
      
      // Command: /status
      if (query.trim() === '/repair' || query.trim() === 'إصلاح') {
          const failedCount = currentFiles.filter(f => {
              const summary = f.isoMetadata?.executiveSummary || '';
              return !f.isoMetadata || summary.includes('503') || summary.includes('429') || summary.includes('تعذر تحليل');
          }).length;
          if (failedCount === 0) return "✅ جميع الملفات في الأرشيف تم تحليلها بنجاح. لا توجد ملفات تحتاج لإصلاح.";
          return `⚙️ تم اكتشاف (${failedCount}) ملفات تحتاج لإعادة تحليل.\n\nالنظام يقوم الآن بإعادة معالجتها تلقائياً في الخلفية (ملف كل 45 ثانية).`;
      }

      if (query.trim() === '/status' || query.trim() === 'الوضع') {
          const fileCount = currentFiles.length;
          const totalSize = (currentFiles.reduce((acc, f) => acc + f.size, 0) / (1024 * 1024)).toFixed(2);
          const instanceId = localStorage.getItem('instance_id') || 'UNKNOWN';
          
          return `📊 <b>حالة النظام:</b>
✅ <b>الحالة:</b> متصل
🏷️ <b>الإصدار:</b> ${APP_VERSION}
📂 <b>عدد الملفات المؤرشفة:</b> ${fileCount}
💾 <b>حجم البيانات:</b> ${totalSize} MB
🆔 <b>معرف النسخة:</b> <code>${instanceId}</code>

⚠️ <b>ملاحظة:</b> إذا كنت تستخدم التطبيق من عدة أجهزة (مثل VPS وجهاز محلي)، فإن كل جهاز يمتلك أرشيفاً منفصلاً. تأكد من أنك تتحدث مع النسخة التي تحتوي على ملفاتك.`;
      }

      if (query.trim() === '/clear' || query.trim() === 'مسح الذاكرة') {
          service.clearChatHistory(chatId);
          return "🧹 تم مسح ذاكرة المحادثة بنجاح. المساعد الآن لا يتذكر السياق السابق.";
      }

      // Gemini Flash has a large context window, but we limit to 300 to prevent 502 Gateway errors.
      const fileList = currentFiles.slice(0, 300).map((f, index) => {
        let summary = f.isoMetadata?.executiveSummary || 'No summary';
        if (summary.includes('{"error"') || summary.includes('503') || summary.includes('429')) {
            summary = "⚠️ (تعذر تحليل محتوى هذا الملف مؤقتاً - يتطلب إعادة معالجة)";
        }
        const related = f.isoMetadata?.relatedReferences?.length 
            ? `\n   🔗 مراجع مرتبطة: ${f.isoMetadata.relatedReferences.join(', ')}` 
            : '';
        const signatory = f.isoMetadata?.signatory ? `\n   ✍️ الموقع: ${f.isoMetadata.signatory}` : '';
        const stamps = (f.isoMetadata?.externalInboundNumber || f.isoMetadata?.attachments) 
            ? `\n   📥 وارد خارجي: ${f.isoMetadata.externalInboundNumber || '-'} | 📎 مشفوعات: ${f.isoMetadata.attachments || '-'}` 
            : '';
        const incomingNum = f.isoMetadata?.incomingNumber ? `\n   🔢 رقم القيد/الإشارة: ${f.isoMetadata.incomingNumber}` : '';
        const archivingDate = f.isoMetadata?.createdAt ? `\n   📅 تاريخ الأرشفة: ${new Date(f.isoMetadata.createdAt).toLocaleDateString('ar-SA')}` : '';
            
        return `${index + 1}. [ID:${f.id}] ${f.name} (${f.isoMetadata?.fullDate || 'N/A'}): ${summary.substring(0, 400)}${incomingNum}${archivingDate}${signatory}${stamps}${related}`;
      }).join('\n---\n');

      const context = `
      --- إحصائيات النظام ---
      CURRENT_DATE: ${new Date().toLocaleDateString('ar-SA')}
      CURRENT_TIME: ${new Date().toLocaleTimeString('ar-SA')}
      TOTAL_FILES_COUNT: ${currentFiles.length}
      TOTAL_DATA_SIZE: ${(currentFiles.reduce((acc, f) => acc + f.size, 0) / (1024 * 1024)).toFixed(2)} MB
      LAST_UPDATE: ${new Date().toLocaleString('ar-SA')}
      -----------------------
      
      قائمة الملفات (أحدث 500 ملف):
      ${fileList}
      `;

      // Send thinking message
      const thinkingMsgId = await service.sendMessage(chatId, "⏳ جاري البحث والتحليل...");

      let reply = "";
      try {
        const chatHistory = service.getChatHistory(chatId);
        const agentReply = await askAgent(query, context, chatHistory, currentFiles);
        reply = agentReply || "⚠️ لم يتم استلام رد من المحرك.";
        
        // Save to chat history if successful
        if (agentReply) {
            service.addChatMessage(chatId, 'user', query);
            service.addChatMessage(chatId, 'assistant', agentReply);
        }
      } catch (error: any) {
        console.error("Gemini Error:", error);
        const errorMsg = error?.message || String(error);
        if (errorMsg.includes("API key expired") || errorMsg.includes("API_KEY_INVALID")) {
          reply = "⚠️ عذراً، انتهت صلاحية مفتاح التشغيل (API Key). يرجى تحديث الصفحة أو التأكد من إعدادات المفتاح في واجهة AI Studio لاستعادة الخدمة.";
        } else if (errorMsg.includes("502") || errorMsg.includes("Bad Gateway") || errorMsg.includes("<html>")) {
          reply = "⚠️ الخادم مزدحم حالياً (502 Bad Gateway) أو حجم البيانات المرسلة كبير جداً. يرجى المحاولة مرة أخرى بعد قليل.";
        } else {
          let cleanMsg = errorMsg.replace(/<[^>]*>?/gm, '').trim();
          if (cleanMsg.length > 150) cleanMsg = cleanMsg.substring(0, 150) + "...";
          reply = `⚠️ حدث خطأ في محرك الذكاء الاصطناعي:
السبب: ${cleanMsg}
الموديل: gemini-3-flash-preview`;
        }
      }
      
      // Ensure reply is a string
      if (typeof reply !== 'string') {
          reply = String(reply);
      }
      
      // Append Instance Info to footer for debugging
      const instanceId = localStorage.getItem('instance_id')?.substring(0, 6) || 'UNK';
      const footer = `\n\n_Ref: ${instanceId} | Files: ${currentFiles.length}_`;

      // Handle file downloads if needed
      const downloadMatches = reply.match(/\[\[DOWNLOAD:(.*?)\]\]/g);
      const cleanReply = reply.replace(/\[\[DOWNLOAD:.*?\]\]/g, ''); // Remove ALL tags globally

      if (downloadMatches && downloadMatches.length === 1) {
        const rawId = downloadMatches[0].match(/\[\[DOWNLOAD:(.*?)\]\]/)?.[1];
        const id = rawId ? rawId.trim() : null;
        
        // Search by ID or Record ID
        const target = currentFiles.find(f => f.id === id || f.isoMetadata?.recordId === id);
        
        if (target) {
           await service.sendChatAction(chatId, 'upload_document');
           
           // Use the AI's clean reply as the caption for the document
           // Telegram captions have a limit, so we'll trim if necessary
           const finalCaption = `📂 <b>المستند:</b> ${target.name}\n\n${cleanReply.trim()}`.substring(0, 1024);

           let dataToUse = target.base64Data;
           
           // If data is missing in memory, try to fetch from IndexedDB
           if (!target.originalFile && !dataToUse) {
               try {
                   const dbRecord = await getFileFromDB(target.id);
                   if (dbRecord && dbRecord.base64Data) {
                       dataToUse = dbRecord.base64Data;
                   }
               } catch (dbErr) {
                   console.error("Failed to fetch from IndexedDB", dbErr);
               }
           }

           let sentDoc = false;
           if (target.originalFile) {
               sentDoc = await service.sendDocument(chatId, target.originalFile, finalCaption);
           } else if (dataToUse) {
               try {
                   const byteCharacters = atob(dataToUse);
                   const byteNumbers = new Array(byteCharacters.length);
                   for (let i = 0; i < byteCharacters.length; i++) {
                       byteNumbers[i] = byteCharacters.charCodeAt(i);
                   }
                   const byteArray = new Uint8Array(byteNumbers);
                   const blob = new Blob([byteArray], { type: target.type });
                   const file = new File([blob], target.name, { type: target.type });
                   
                   sentDoc = await service.sendDocument(chatId, file, finalCaption + "\n(نسخة محفوظة)");
               } catch (e) {
                   reply = "⚠️ عذراً، فشل استرجاع الملف من قاعدة البيانات.";
               }
           } else {
               const sizeMB = (target.size / (1024 * 1024)).toFixed(1);
               if (target.size > 50 * 1024 * 1024) {
                   reply = `⚠️ عذراً، حجم الملف كبير جداً (${sizeMB} MB). الحد الأقصى للإرسال عبر البوت هو 50 MB لضمان استقرار النظام.`;
               } else {
                   reply = "⚠️ عذراً، الملف المؤرشف لا يحتوي على بيانات ثنائية متاحة حالياً. يرجى محاولة إعادة رفع الملف.";
               }
           }
           
           if (sentDoc) {
               if (thinkingMsgId) {
                   await service.editMessageText(chatId, thinkingMsgId, "✅ تم إرسال الملف بنجاح." + footer);
               }
               return null; // Don't send anything else
           }
        } else {
           reply = "⚠️ عذراً، الملف المطلوب غير موجود في الأرشيف.";
        }
      }
      
      const finalReply = cleanReply + footer;
      if (thinkingMsgId) {
          await service.editMessageText(chatId, thinkingMsgId, finalReply);
          return null;
      }
      
      return finalReply;
    });

  // ... inside useEffect for polling ...
    const pollInterval = setInterval(async () => {
      const { config } = integrationsRef.current.telegram;
      
      // Poll if we have a token, even if not "connected" (helps with initial setup)
      if (config.botToken) {
        if (useWebhookRelay) {
            // ... relay logic ...
            try {
                const res = await fetch('/api/telegram-updates');
                const updates = await res.json();
                if (updates && updates.length > 0) {
                    for (const upd of updates) {
                        const msg = upd.message || upd.channel_post;
                        if (msg && msg.text) {
                            const chatId = String(msg.chat.id);
                            const text = msg.text;
                            if (telegramServiceRef.current?.onMessageCallback) {
                                try {
                                    const reply = await telegramServiceRef.current.onMessageCallback(text, chatId);
                                    if (reply) await telegramServiceRef.current.sendMessage(chatId, reply);
                                } catch (err: any) {
                                    console.error("Relay Callback Error", err);
                                    await telegramServiceRef.current.sendMessage(chatId, `⚠️ حدث خطأ في معالجة الرسالة: ${err.message}`);
                                }
                            }
                        }
                    }
                }
            } catch (e) { console.error("Relay Poll Error", e); }
        } else {
            // Standard Long Polling - Primary Method
            const newLastId = await service.poll();
            if (newLastId && newLastId !== integrationsRef.current.telegram.lastUpdateId) {
                 setIntegrations(p => ({ ...p, telegram: { ...p.telegram, lastUpdateId: newLastId } }));
            }
        }
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [isDetectingChatId, integrations.telegram.config.botToken]); // Re-bind if token changes or detection mode changes

  // ... existing code ...

  // --- Automatic Folder Sync Logic ---
  useEffect(() => {
    let syncInterval: any;
    if (isAutoSyncEnabled && directoryHandle) {
      syncInterval = setInterval(async () => {
        try {
          const filesInDir: File[] = [];
          
          async function scan(handle: any) {
            try {
              for await (const entry of handle.values()) {
                if (entry.kind === 'file') {
                  const file = await entry.getFile();
                  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
                    filesInDir.push(file);
                  }
                } else if (entry.kind === 'directory') {
                  await scan(entry);
                }
              }
            } catch (err) {
              console.warn("Could not scan sub-directory during auto-sync", err);
            }
          }
          
          await scan(directoryHandle);
          
          // Find new files that aren't in our archive yet
          // We check by name and size as a simple heuristic
          const newFiles = filesInDir.filter(f => {
            return !files.some(existing => existing.name === f.name && existing.size === f.size);
          });

          if (newFiles.length > 0) {
            console.log(`[Auto-Sync] Found ${newFiles.length} new files.`);
            // Process them using handleSyncFiles logic (we'll refactor it to a helper)
            await processNewFiles(newFiles);
          }
          setLastSyncTime(Date.now());
        } catch (e) {
          console.error("Auto-Sync Error:", e);
          setIsAutoSyncEnabled(false); // Disable on error (e.g. permission revoked)
        }
      }, 60000); // Check every minute
    }
    return () => clearInterval(syncInterval);
  }, [isAutoSyncEnabled, directoryHandle, files]);

  const processNewFiles = async (pdfFiles: File[]) => {
    setIsScanning(true);
    setScanProgress(0);
    const newRecords: FileRecord[] = [];
    for (let i = 0; i < pdfFiles.length; i++) {
      const f = pdfFiles[i];
      setCurrentScanningFile(f.name);
      
      let base64Data = "";
      try {
          if (f.size < 50 * 1024 * 1024) {
             base64Data = await fileToBase64(f);
          }
      } catch (e) { console.error("Base64 Gen Error", e); }

      newRecords.push({
        id: Math.random().toString(36).substr(2, 10).toUpperCase(),
        name: f.name, size: f.size, type: f.type, lastModified: f.lastModified,
        originalFile: f, isProcessing: true,
        base64Data: base64Data,
        isoMetadata: {
          recordId: `ARC-${Date.now().toString().slice(-4)}-${i}`, title: f.name, 
          description: "مزامنة تلقائية...", documentType: DocumentType.OTHER, 
          entity: "مزامنة ذكية", importance: Importance.NORMAL,
          confidentiality: Confidentiality.INTERNAL, status: ArchiveStatus.IN_PROCESS,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), 
          year: new Date().getFullYear(), originalPath: f.name, retentionPolicy: "ISO 15489",
          expiryDate: null
        }
      });
      setScanProgress(Math.round(((i + 1) / pdfFiles.length) * 100));
    }
    setFiles(prev => [...newRecords, ...prev]);
    setIsScanning(false);
  };

  useEffect(() => {
    const loadSyncHandle = async () => {
      try {
        const handle = await getDirectoryHandle();
        if (handle) {
          setDirectoryHandle(handle);
          // We don't auto-enable it because it requires user gesture to request permission
          // But we have the handle ready for when they click the button
        }
      } catch (e) {
        console.error("Failed to load sync handle", e);
      }
    };
    loadSyncHandle();
  }, []);

  const handleSmartSync = async () => {
    try {
      if (!('showDirectoryPicker' in window)) {
        alert("⚠️ متصفحك لا يدعم خاصية المزامنة الذكية. يرجى استخدام متصفح Chrome أو Edge.");
        return;
      }

      if (isAutoSyncEnabled) {
        setIsAutoSyncEnabled(false);
        alert("🛑 تم إيقاف المزامنة التلقائية.");
        return;
      }
      
      let handle = directoryHandle;
      
      // If we already have a handle, check permission
      if (handle) {
        const permission = await handle.queryPermission({ mode: 'read' });
        if (permission !== 'granted') {
          // Request permission (requires user gesture, which we have here)
          const newPerm = await handle.requestPermission({ mode: 'read' });
          if (newPerm !== 'granted') {
            handle = null; // User denied, let them pick a new folder
          }
        }
      }
      
      // If no handle or user denied permission for the old one, ask for a new one
      if (!handle) {
        handle = await (window as any).showDirectoryPicker();
        await saveDirectoryHandle(handle);
      }
      
      setDirectoryHandle(handle);
      setIsAutoSyncEnabled(true);
      
      // Initial scan
      const filesInDir: File[] = [];
      async function scan(h: any) {
        try {
          for await (const entry of h.values()) {
            if (entry.kind === 'file') {
              const file = await entry.getFile();
              if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
                filesInDir.push(file);
              }
            } else if (entry.kind === 'directory') {
              await scan(entry);
            }
          }
        } catch (err) {
          console.warn("Could not scan sub-directory", err);
        }
      }
      await scan(handle);
      const newFiles = filesInDir.filter(f => !files.some(existing => existing.name === f.name && existing.size === f.size));
      if (newFiles.length > 0) await processNewFiles(newFiles);
      
      alert("✅ تم تفعيل المزامنة التلقائية. سيقوم النظام بمراقبة المجلد وإضافة أي ملفات جديدة تلقائياً.");
    } catch (e) {
      console.error("Smart Sync Error", e);
      if ((e as Error).name !== 'AbortError') {
        alert("⚠️ حدث خطأ أثناء تفعيل المزامنة. يرجى المحاولة مرة أخرى.");
      }
    }
  };

  const handleSyncFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const sel = e.target.files;
    if (!sel || sel.length === 0) return;
    const pdfFiles = (Array.from(sel) as File[]).filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    if (pdfFiles.length === 0) {
        alert("⚠️ عذراً، النظام يقبل ملفات PDF فقط.");
        return;
    }
    await processNewFiles(pdfFiles);
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
      const fileList = files.slice(0, 500).map((f, index) => {
        const meta = f.isoMetadata;
        return `${index + 1}. [ID:${f.id}] ${f.name}
        - العنوان: ${meta?.title || 'غير متوفر'}
        - الملخص: ${meta?.executiveSummary?.substring(0, 400) || 'غير متوفر'}
        - الجهة: ${meta?.sender || 'غير متوفر'}
        - التاريخ: ${meta?.fullDate || 'غير متوفر'}
        - رقم القيد/الإشارة: ${meta?.incomingNumber || 'لا يوجد'}
        - المراجع المرتبطة: ${meta?.relatedReferences?.join(', ') || 'لا يوجد'}
        - رقم الوارد: ${meta?.externalInboundNumber || 'لا يوجد'}
        - المشفوعات: ${meta?.attachments || 'لا يوجد'}
        - الموقع: ${meta?.signatory || 'غير متوفر'}`;
      }).join('\n---\n');

      const ctx = `
      --- إحصائيات النظام ---
      CURRENT_DATE: ${new Date().toLocaleDateString('ar-SA')}
      CURRENT_TIME: ${new Date().toLocaleTimeString('ar-SA')}
      TOTAL_FILES_COUNT: ${files.length}
      TOTAL_DATA_SIZE: ${(files.reduce((acc, f) => acc + f.size, 0) / (1024 * 1024)).toFixed(2)} MB
      LAST_UPDATE: ${new Date().toLocaleString('ar-SA')}
      -----------------------
      
      قائمة الملفات (أحدث 500 ملف):
      ${fileList}
      `;
      
      const chatHistory = mainChatMessages.slice(-10).map(m => ({ role: m.role, text: m.text }));
      
      const stream = askAgentStream(input, ctx, chatHistory, files);
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
          <nav className="space-y-2 flex-1">
            {NAV_ITEMS.map(item => (
              <button key={item.id} onClick={() => setActiveTab(item.id)} className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all ${activeTab === item.id ? 'bg-indigo-600 text-white shadow-xl' : 'text-slate-400 hover:bg-slate-800'}`}>
                <item.icon size={20} /> <span className="text-sm font-bold">{item.label}</span>
              </button>
            ))}
          </nav>
        </div>
        <div className="mt-auto p-8 border-t border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-500 font-bold">
            <span>الإصدار {APP_VERSION}</span>
            <span className="flex items-center gap-1"><Zap size={12} className="text-indigo-400" /> الذكاء الاصطناعي نشط</span>
          </div>
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
                <div className="grid grid-cols-3 gap-6">
                  <div className="bg-white p-8 rounded-[2rem] border shadow-sm flex items-center justify-between">
                    <div><p className="text-xs font-black text-slate-400 uppercase mb-2">إجمالي الوثائق</p><h3 className="text-4xl font-black text-slate-800">{files.length}</h3></div>
                    <div className="bg-slate-50 p-5 rounded-2xl text-indigo-600"><Database size={28} /></div>
                  </div>
                  <div className="bg-white p-8 rounded-[2rem] border shadow-sm flex items-center justify-between">
                    <div><p className="text-xs font-black text-slate-400 uppercase mb-2">تفاعل تليجرام</p><h3 className="text-2xl font-black text-blue-600">{integrations.telegram.stats.messagesSent}</h3></div>
                    <div className="bg-slate-50 p-5 rounded-2xl text-blue-600"><TelegramIcon size={28} /></div>
                  </div>
                  <div className="bg-white p-8 rounded-[2rem] border shadow-sm flex items-center justify-between">
                    <div><p className="text-xs font-black text-slate-400 uppercase mb-2">تحليلات فاشلة</p><h3 className="text-2xl font-black text-rose-600">{files.filter(f => f.isoMetadata?.status === ArchiveStatus.ERROR).length}</h3></div>
                    <div className="bg-slate-50 p-5 rounded-2xl text-rose-600"><AlertCircle size={28} /></div>
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
                  <input className="w-full pr-12 pl-4 py-4 bg-slate-50 border-2 border-transparent focus:border-indigo-500 rounded-2xl outline-none font-bold text-sm" placeholder="بحث بالاسم، المعرف، أو المحتوى..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                </div>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  multiple 
                  {...({ webkitdirectory: "", directory: "" } as any)} 
                  onChange={handleSyncFiles} 
                />
                <div className="flex flex-col gap-1 items-end">
                  <div className="flex gap-2">
                    <button onClick={handleSmartSync} className={`flex items-center gap-2 px-6 py-4 rounded-2xl font-black text-sm transition-all shadow-sm border ${isAutoSyncEnabled ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-white text-slate-600 border-slate-100 hover:bg-slate-50'}`}>
                      <RefreshCw size={18} className={isAutoSyncEnabled ? 'animate-spin' : ''} />
                      {isAutoSyncEnabled ? 'مزامنة تلقائية نشطة' : 'تفعيل المزامنة الذكية'}
                    </button>
                    <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-6 py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100">
                      <FolderSync size={18} />
                      مزامنة يدوية
                    </button>
                  </div>
                  {lastSyncTime > 0 && (
                    <span className="text-[10px] font-bold text-slate-400 mr-2">آخر تحديث تلقائي: {new Date(lastSyncTime).toLocaleTimeString('ar-SA')}</span>
                  )}
                </div>
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
              {files.filter(f => 
                f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                f.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                f.isoMetadata?.recordId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                f.isoMetadata?.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                f.isoMetadata?.executiveSummary?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                f.isoMetadata?.sender?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                f.isoMetadata?.recipient?.toLowerCase().includes(searchQuery.toLowerCase())
              ).map(file => (
                <div key={file.id} onClick={() => setSelectedFileId(file.id)} className={`bg-white p-8 rounded-[2.5rem] border shadow-sm hover:shadow-2xl transition-all cursor-pointer relative group ${file.isoMetadata?.status === ArchiveStatus.ERROR ? 'border-rose-300 bg-rose-50/40 shadow-rose-100' : ''}`}>
                  {file.isProcessing && <div className="absolute top-6 left-6 animate-pulse bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full text-[10px] font-black border border-indigo-100 flex items-center gap-1 shadow-sm"><Loader2 size={10} className="animate-spin" /> تحليل Pro...</div>}
                  {file.isoMetadata?.status === ArchiveStatus.ERROR && <div className="absolute top-6 left-6 bg-rose-100 text-rose-700 px-3 py-1 rounded-full text-[10px] font-black border border-rose-200 flex items-center gap-1 shadow-sm animate-bounce"><AlertCircle size={10} /> فشل التحليل</div>}
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-sm ${file.isoMetadata?.status === ArchiveStatus.ERROR ? 'bg-rose-100 text-rose-600' : 'bg-slate-50 text-slate-600'}`}><FileText size={28} /></div>
                  <h3 className="text-xl font-black text-slate-800 truncate mb-1 relative z-10">{file.isoMetadata?.title || file.name}</h3>
                  <p className="text-[10px] text-indigo-500 font-black tracking-widest uppercase mb-4 relative z-10">{file.isoMetadata?.recordId}</p>
                  
                  {file.isoMetadata?.status === ArchiveStatus.ERROR && !file.isProcessing && (
                    <div className="flex flex-col gap-2">
                      <p className="text-[10px] font-bold text-rose-500 line-clamp-2">{file.isoMetadata?.executiveSummary}</p>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleRetryAnalysis(file.id); }}
                        className="flex items-center gap-2 text-xs font-black text-rose-600 hover:text-rose-700 transition-colors bg-rose-100/50 w-fit px-3 py-1.5 rounded-lg"
                      >
                        <RotateCcw size={14} /> إعادة المحاولة
                      </button>
                    </div>
                  )}
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
                <button onClick={() => setSettingsTab('api')} className={`w-full text-right px-6 py-4 rounded-2xl font-bold transition-all ${settingsTab === 'api' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}>مفتاح Gemini API</button>
                <button onClick={() => setSettingsTab('telegram')} className={`w-full text-right px-6 py-4 rounded-2xl font-bold transition-all ${settingsTab === 'telegram' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}>تكامل تليجرام</button>
              </aside>
              <div className="flex-1 p-12">
                {settingsTab === 'general' && (
                  <div className="space-y-12 animate-in fade-in">
                    <section className="bg-slate-50 p-6 rounded-[2rem] border border-slate-200">
                        <h3 className="text-lg font-black mb-4 flex items-center gap-2 text-slate-800"><Activity size={20} className="text-indigo-600" /> حالة النظام</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-white p-4 rounded-2xl border shadow-sm">
                                <p className="text-xs font-bold text-slate-400 uppercase">Telegram Polling</p>
                                <div className="flex items-center gap-2 mt-2">
                                    <div className={`w-3 h-3 rounded-full ${systemHealth.telegram.status === 'healthy' ? 'bg-emerald-500' : systemHealth.telegram.status === 'error' ? 'bg-rose-500' : 'bg-slate-300'}`}></div>
                                    <span className="font-black text-sm">{systemHealth.telegram.status === 'healthy' ? 'نشط' : 'متوقف/خطأ'}</span>
                                </div>
                                {systemHealth.telegram.error && <p className="text-[10px] text-rose-500 mt-1 font-bold">{systemHealth.telegram.error}</p>}
                                <p className="text-[10px] text-slate-400 mt-2">{systemHealth.telegram.lastCheck ? `آخر فحص: ${systemHealth.telegram.lastCheck.toLocaleTimeString()}` : 'لم يتم الفحص'}</p>
                            </div>
                            <div className="bg-white p-4 rounded-2xl border shadow-sm">
                                <p className="text-xs font-bold text-slate-400 uppercase">Gemini API</p>
                                <div className="flex items-center gap-2 mt-2">
                                    <div className={`w-3 h-3 rounded-full ${files.some(f => f.isoMetadata?.executiveSummary?.includes("فشل")) ? 'bg-rose-500' : 'bg-emerald-500'}`}></div>
                                    <span className="font-black text-sm">حالة الخدمة</span>
                                </div>
                                <p className="text-[10px] text-slate-400 mt-2">يتم التحقق عند الطلب</p>
                            </div>
                        </div>
                        <div className="mt-4 bg-indigo-50 p-4 rounded-2xl border border-indigo-100 flex items-center justify-between">
                            <div>
                                <p className="text-xs font-bold text-indigo-400 uppercase">معرف النسخة (Instance ID)</p>
                                <p className="text-lg font-black text-indigo-900 font-mono tracking-wider">{localStorage.getItem('instance_id') || 'Loading...'}</p>
                            </div>
                            <div className="text-indigo-300"><Server size={24} /></div>
                        </div>
                    </section>

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
                {settingsTab === 'api' && (
                  <div className="space-y-8 animate-in fade-in">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-2xl font-black flex items-center gap-3 text-slate-800"><Key size={24} className="text-indigo-500" /> مفتاح Gemini API</h3>
                        <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-full border">
                            <div className={`w-2 h-2 rounded-full ${isApiKeySet ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></div>
                            <span className="text-[10px] font-black text-slate-500 uppercase">{isApiKeySet ? 'تم الإعداد' : 'غير مُعد'}</span>
                        </div>
                    </div>
                    
                    <div className="bg-indigo-50 p-6 rounded-[2rem] border border-indigo-100">
                      <p className="text-sm text-indigo-700 font-bold mb-4">
                        ℹ️ للتشغيل على Cloudflare Pages، يرجى إدخال مفتاح Gemini API الخاص بك. 
                        يمكنك الحصول عليه من <a href="https://aistudio.google.com/apikey" target="_blank" className="text-indigo-600 underline">Google AI Studio</a>
                      </p>
                    </div>

                    <div className="space-y-6 max-w-lg">
                      <div className="space-y-2">
                        <label className="text-xs font-black block text-slate-500 uppercase mr-1">مفتاح API</label>
                        <input 
                          type="password" 
                          placeholder="AIza..." 
                          className="w-full p-4 bg-slate-50 rounded-2xl outline-none font-mono text-xs border border-slate-200 focus:border-indigo-500 shadow-sm" 
                          value={apiKey} 
                          onChange={e => setApiKeyState(e.target.value)} 
                        />
                      </div>
                      <button 
                        onClick={() => {
                          if (apiKey.trim().length < 10) {
                            alert("يرجى إدخال مفتاح API صالح");
                            return;
                          }
                          handleSetApiKey(apiKey.trim());
                          alert("✅ تم حفظ مفتاح API بنجاح!");
                        }}
                        className="w-full bg-indigo-600 text-white p-5 rounded-2xl font-black flex items-center justify-center gap-3 hover:bg-indigo-700 transition-all shadow-xl"
                      >
                        <Save size={20} /> حفظ المفتاح
                      </button>
                      {isApiKeySet && (
                        <button 
                          onClick={() => {
                            localStorage.removeItem('GEMINI_API_KEY');
                            setIsApiKeySet(false);
                            setApiKeyState('');
                            alert("تم حذف المفتاح");
                          }}
                          className="w-full bg-rose-100 text-rose-600 p-4 rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-rose-200 transition-all"
                        >
                          <Trash2 size={18} /> حذف المفتاح
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {settingsTab === 'telegram' && (
                  <div className="space-y-8 animate-in fade-in">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-2xl font-black flex items-center gap-3 text-slate-800"><TelegramIcon size={24} className="text-blue-500" /> إعدادات الربط</h3>
                        <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-full border">
                            <div className={`w-2 h-2 rounded-full ${integrations.telegram.config.botToken ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></div>
                            <span className="text-[10px] font-black text-slate-500 uppercase">{integrations.telegram.config.botToken ? 'Polling Active' : 'Polling Inactive'}</span>
                        </div>
                    </div>
                    <div className="space-y-6 max-w-lg">
                      <div className="space-y-2">
                        <label className="text-xs font-black block text-slate-500 uppercase mr-1">Bot Token</label>
                        <input type="password" placeholder="توكن البوت..." className="w-full p-4 bg-slate-50 rounded-2xl outline-none font-mono text-xs border border-slate-200 focus:border-indigo-500 shadow-sm" value={integrations.telegram.config.botToken} onChange={e => setIntegrations({ ...integrations, telegram: { ...integrations.telegram, config: { ...integrations.telegram.config, botToken: e.target.value } } })} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-black block text-slate-500 uppercase mr-1">Admin Chat ID (المالك)</label>
                        <div className="flex gap-2">
                            <input type="text" placeholder="معرف المسؤول..." className="flex-1 p-4 bg-slate-50 rounded-2xl outline-none font-mono text-xs border border-slate-200 focus:border-indigo-500 shadow-sm" value={integrations.telegram.config.adminChatId} onChange={e => setIntegrations({ ...integrations, telegram: { ...integrations.telegram, config: { ...integrations.telegram.config, adminChatId: e.target.value } } })} />
                            <button 
                                onClick={() => {
                                    if (!integrations.telegram.config.botToken) return alert("أدخل Bot Token أولاً");
                                    setIsDetectingChatId(true);
                                    // The polling loop will pick this up via isDetectingChatId dependency
                                    
                                    // Also override the onMessage temporarily for detection
                                    if (telegramServiceRef.current) {
                                        telegramServiceRef.current.setOnMessage(async (text, chatId) => {
                                            if (isDetectingChatId) {
                                                setIntegrations(p => ({ ...p, telegram: { ...p.telegram, config: { ...p.telegram.config, adminChatId: chatId } } }));
                                                setIsDetectingChatId(false);
                                                alert(`تم اكتشاف Chat ID بنجاح: ${chatId}`);
                                                return "✅ تم ضبط هذا المحادثة كقناة اتصال مع الأرشيف.";
                                            }
                                            return "";
                                        });
                                    }
                                }} 
                                disabled={isDetectingChatId}
                                className={`px-4 rounded-2xl font-bold text-xs transition-all ${isDetectingChatId ? 'bg-indigo-100 text-indigo-600 animate-pulse' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                            >
                                {isDetectingChatId ? 'أرسل رسالة للبوت الآن...' : 'اكتشاف تلقائي'}
                            </button>
                        </div>
                      </div>

                      <div className="space-y-2 pt-4 border-t border-slate-100">
                        <label className="text-xs font-black block text-slate-500 uppercase mr-1">المستخدمين المصرح لهم (Allowed Users)</label>
                        <div className="flex gap-2 mb-3">
                            <input 
                                type="text" 
                                placeholder="Chat ID للمستخدم..." 
                                className="flex-1 p-4 bg-slate-50 rounded-2xl outline-none font-mono text-xs border border-slate-200 focus:border-indigo-500 shadow-sm" 
                                value={newUserChatId} 
                                onChange={e => setNewUserChatId(e.target.value)} 
                            />
                            <button 
                                onClick={() => {
                                    if (!newUserChatId.trim()) return;
                                    if (integrations.telegram.allowedUsers?.includes(newUserChatId.trim())) return alert("المستخدم موجود بالفعل");
                                    setIntegrations(p => ({
                                        ...p,
                                        telegram: {
                                            ...p.telegram,
                                            allowedUsers: [...(p.telegram.allowedUsers || []), newUserChatId.trim()]
                                        }
                                    }));
                                    setNewUserChatId('');
                                }}
                                className="bg-indigo-600 text-white px-4 rounded-2xl font-bold text-xs hover:bg-indigo-700 transition-all"
                            >
                                <Plus size={16} /> إضافة
                            </button>
                        </div>
                        <div className="space-y-2 max-h-40 overflow-y-auto custom-scroll">
                            {(integrations.telegram.allowedUsers || []).map((uid, idx) => (
                                <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                                    <span className="font-mono text-xs text-slate-600">{uid}</span>
                                    <button 
                                        onClick={() => {
                                            setIntegrations(p => ({
                                                ...p,
                                                telegram: {
                                                    ...p.telegram,
                                                    allowedUsers: p.telegram.allowedUsers.filter(id => id !== uid)
                                                }
                                            }));
                                        }}
                                        className="text-rose-500 hover:bg-rose-50 p-1 rounded-lg transition-all"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                            {(integrations.telegram.allowedUsers || []).length === 0 && (
                                <p className="text-[10px] text-slate-400 text-center py-2">لا يوجد مستخدمين إضافيين. فقط المالك (Admin) يمكنه الوصول.</p>
                            )}
                        </div>
                      </div>

                      <button onClick={handleVerifyTelegram} disabled={isVerifying} className="bg-slate-900 text-white w-full p-5 rounded-2xl font-black flex items-center justify-center gap-3 hover:bg-slate-800 transition-all shadow-xl">
                        {isVerifying ? <Loader2 className="animate-spin" /> : <ShieldCheck />} {integrations.telegram.connected ? 'متصل ومؤمن' : 'تفعيل الربط والتحقق'}
                      </button>

                      <div className="flex items-center justify-between bg-slate-100 p-4 rounded-2xl mb-4">
                        <div className="flex items-center gap-2">
                            <Globe size={16} className={useWebhookRelay ? "text-indigo-600" : "text-slate-400"} />
                            <span className="text-xs font-bold text-slate-700">وضع الـWebhook (Server Relay)</span>
                        </div>
                        <button 
                            onClick={() => setUseWebhookRelay(!useWebhookRelay)} 
                            className={`w-10 h-6 rounded-full transition-all relative ${useWebhookRelay ? 'bg-indigo-600' : 'bg-slate-300'}`}
                        >
                            <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${useWebhookRelay ? 'left-5' : 'left-1'}`}></div>
                        </button>
                      </div>
                      
                      <div className="pt-4 border-t border-slate-100">
                        <div className="flex gap-2">
                            <button onClick={async () => {
                                if (telegramServiceRef.current) await telegramServiceRef.current.deleteWebhook();
                            }} className="text-xs text-slate-400 hover:text-rose-500 font-bold flex items-center gap-1">
                                <RefreshCw size={12} /> حذف Webhook (إصلاح سريع)
                            </button>
                            <button onClick={runDiagnostics} className="text-xs text-indigo-500 hover:text-indigo-700 font-bold flex items-center gap-1">
                                <Activity size={12} /> تشخيص شامل (Full Diagnostics)
                            </button>
                        </div>
                      </div>

                      {diagStep > 0 && (
                        <div className="mt-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                            <h4 className="font-black text-xs uppercase text-slate-500 mb-3">تقرير التشخيص</h4>
                            <div className="space-y-2">
                                {diagResults.map((res, idx) => (
                                    <div key={idx} className="flex items-start gap-3 text-xs">
                                        <div className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center ${res.status === 'ok' ? 'bg-emerald-100 text-emerald-600' : res.status === 'error' ? 'bg-rose-100 text-rose-600' : 'bg-slate-200 animate-pulse'}`}>
                                            {res.status === 'ok' ? <CheckCircle size={10} /> : res.status === 'error' ? <X size={10} /> : <Loader2 size={10} className="animate-spin" />}
                                        </div>
                                        <div>
                                            <p className="font-bold text-slate-800">{res.step}</p>
                                            <p className={`${res.status === 'error' ? 'text-rose-600' : 'text-slate-500'}`}>{res.details}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                      )}
                      
                      <div className="mt-6 bg-slate-900 rounded-2xl p-4 font-mono text-[10px] text-green-400 h-64 overflow-y-auto shadow-inner flex flex-col-reverse">
                        <div ref={logsEndRef} />
                        {telegramLogs.length === 0 && <span className="opacity-50">Waiting for activity...</span>}
                        {telegramLogs.map((log, i) => (
                            <div key={i} className="mb-1 border-l-2 border-green-900 pl-2 break-all">{log}</div>
                        ))}
                        <div className="flex justify-between items-center mb-2 border-b border-white/10 pb-2 shrink-0">
                            <span className="font-bold text-white">Live Terminal (Debug)</span>
                            <span className="text-slate-500">{telegramLogs.length} logs</span>
                        </div>
                      </div>
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
                    <div className="flex justify-between items-start mb-4">
                        <h4 className={`font-black mb-0 flex items-center gap-2 uppercase tracking-tighter text-xs font-bold ${files.find(f => f.id === selectedFileId)?.isoMetadata?.status === ArchiveStatus.ERROR ? 'text-rose-600' : 'text-indigo-600'}`}>
                           <Sparkles size={18} /> الملخص التنفيذي الذكي (Pro AI Analysis)
                        </h4>
                        {files.find(f => f.id === selectedFileId)?.isoMetadata?.status === ArchiveStatus.ERROR && (
                           <button 
                             onClick={() => handleRetryAnalysis(selectedFileId!)}
                             className="bg-rose-600 text-white px-4 py-2 rounded-xl text-[10px] font-black hover:bg-rose-700 transition-all flex items-center gap-2 shadow-lg"
                           >
                             <RefreshCw size={12} /> إعادة المحاولة
                           </button>
                        )}
                     </div>
                     <p className="text-slate-800 leading-9 text-sm font-bold text-justify">
                        {files.find(f => f.id === selectedFileId)?.isProcessing ? "جاري التحليل..." : (files.find(f => f.id === selectedFileId)?.isoMetadata?.executiveSummary || "لا يوجد ملخص متاح.")}
                     </p>
                 </div>
                 <div className="grid grid-cols-2 gap-6">
                    {[
                      { label: 'المرسل', value: files.find(f => f.id === selectedFileId)?.isoMetadata?.sender },
                      { label: 'المستلم', value: files.find(f => f.id === selectedFileId)?.isoMetadata?.recipient },
                      { label: 'رقم القيد', value: files.find(f => f.id === selectedFileId)?.isoMetadata?.incomingNumber, highlight: true },
                      { label: 'تاريخ الوثيقة', value: files.find(f => f.id === selectedFileId)?.isoMetadata?.fullDate },
                      { label: 'الأهمية', value: files.find(f => f.id === selectedFileId)?.isoMetadata?.importance },
                      { label: 'الحالة', value: files.find(f => f.id === selectedFileId)?.isoMetadata?.status, status: true },
                      { label: 'رقم الوارد الخارجي', value: files.find(f => f.id === selectedFileId)?.isoMetadata?.externalInboundNumber },
                      { label: 'المشفوعات', value: files.find(f => f.id === selectedFileId)?.isoMetadata?.attachments },
                      { label: 'الموقع (صاحب الصلاحية)', value: files.find(f => f.id === selectedFileId)?.isoMetadata?.signatory },
                      { label: 'مراجع مرتبطة', value: files.find(f => f.id === selectedFileId)?.isoMetadata?.relatedReferences?.join(', ') }
                    ].map((item, idx) => (
                      <div key={idx} className="p-6 bg-slate-50 rounded-2xl border flex justify-between items-center shadow-sm">
                        <span className="text-[10px] text-slate-400 font-black uppercase tracking-wider">{item.label}</span>
                        <span className={`font-black text-sm text-left max-w-[60%] truncate ${item.highlight ? 'text-indigo-600 font-mono' : item.status ? 'text-emerald-600' : 'text-slate-700'}`} title={item.value || "-"}>{item.value || "-"}</span>
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
