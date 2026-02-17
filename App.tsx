
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
  HardDrive, FolderPlus, RefreshCw, FolderOpen
} from 'lucide-react';

import { 
  FileRecord, ArchiveStatus, AuditAction, AuditLog, ChatMessage, DocumentType, Importance, Confidentiality, ISOMetadata
} from './types';
import { NAV_ITEMS, STATUS_COLORS } from './constants';
import { askAgent, classifyFileContent } from './services/geminiService';

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

  const directoryInputRef = useRef<HTMLInputElement>(null);
  const lastUpdateIdRef = useRef<number>(0);
  const isPollingRef = useRef<boolean>(false);
  const filesRef = useRef<FileRecord[]>([]);
  const auditLogsRef = useRef<AuditLog[]>([]);
  
  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  useEffect(() => {
    auditLogsRef.current = auditLogs;
  }, [auditLogs]);

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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
    localStorage.setItem(AUDIT_KEY, JSON.stringify(auditLogs));
    localStorage.setItem(INTEGRATION_KEY, JSON.stringify(integrations));
    if (connectedFolderName) {
      localStorage.setItem('ARSHIF_CONNECTED_FOLDER_NAME', connectedFolderName);
    } else {
      localStorage.removeItem('ARSHIF_CONNECTED_FOLDER_NAME');
    }
  }, [files, auditLogs, integrations, connectedFolderName]);

  const getAgentContext = () => {
    const currentFiles = filesRef.current;
    const currentLogs = auditLogsRef.current.slice(0, 15);

    const logsContext = currentLogs.map(l => 
        `- [${new Date(l.timestamp).toLocaleTimeString('ar-SA')}] ${l.user}: ${l.details} (${l.action})`
    ).join('\n');

    const fileList = currentFiles.map(f => {
      const directViewLink = `https://onedrive.live.com/view.aspx?resid=${f.id}&cid=${f.id}&authkey=!ArshifSecureView`;
      return `
---
معرف السجل: ${f.isoMetadata?.recordId}
اسم الملف: ${f.name}
النوع: ${f.isoMetadata?.documentType}
السرية: ${f.isoMetadata?.confidentiality}
الأهمية: ${f.isoMetadata?.importance}
تاريخ الأرشفة: ${new Date(f.lastModified).toLocaleDateString('ar-SA')}
التحليل المختصر: ${f.isoMetadata?.description}
رابط المعاينة المباشر (OneDrive): ${directViewLink}
---
`;
    }).join('\n');
    
    return `
قائمة الملفات في الأرشيف المركزي (ISO 15489):
${fileList}

سجل أحداث النظام الأخيرة (مهم للإجابة على "ماذا حدث"):
${logsContext || 'لا توجد أحداث حديثة.'}
`;
  };

  const sendTelegramReal = async (text: string, inlineButton?: { text: string, url: string }) => {
    const { botToken, adminChatId } = integrations.telegram.config;
    if (!integrations.telegram.connected || !botToken || !adminChatId) return false;
    
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

    const directLink = `https://onedrive.live.com/view.aspx?resid=${targetFile.id}&cid=${targetFile.id}&authkey=!ArshifSecureView`;
    
    const success = await sendTelegramReal(
        `📦 <b>وكيل التحميل الآلي:</b>\n\nتم استخراج الملف <b>"${targetFile.name}"</b> بنجاح من الأرشيف.\nجاهز للتنزيل الآن.`,
        { text: "📥 تحميل الملف الآن (OneDrive Direct)", url: directLink }
    );

    setDownloadAgentState(prev => ({ ...prev, step: 'completed', progress: 100 }));

    if (success) {
        const newLog: AuditLog = {
            id: Date.now().toString(),
            action: AuditAction.VIEW,
            details: `تم تنفيذ طلب استخراج وتحميل آلي للملف: ${targetFile.name}`,
            user: 'AI Download Agent',
            timestamp: new Date().toISOString()
        };
        setAuditLogs(prev => [newLog, ...prev]);

        setMainChatMessages(prev => [...prev, { 
            id: Date.now().toString(), 
            role: 'assistant', 
            text: `✅ <b>مهمة مكتملة:</b> قام وكيل التحميل بإرسال ملف "${targetFile.name}" إلى تليجرام بنجاح.`, 
            timestamp: new Date() 
        }]);
    } else {
         setMainChatMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', text: '❌ حدث خطأ أثناء محاولة وكيل التحميل الاتصال بتليجرام.', timestamp: new Date() }]);
    }

    setTimeout(() => {
        setDownloadAgentState(prev => ({ ...prev, isActive: false }));
    