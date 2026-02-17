
export enum DocumentType {
  CONTRACT = 'عقد',
  CORRESPONDENCE_IN = 'مراسلة واردة',
  CORRESPONDENCE_OUT = 'مراسلة صادرة',
  INVOICE = 'فاتورة',
  REPORT = 'تقرير',
  FORM = 'نموذج',
  POLICY = 'سياسة/إجراء',
  OTHER = 'أخرى'
}

export enum Importance {
  NORMAL = 'عادي',
  IMPORTANT = 'مهم',
  HIGH = 'عالي الأهمية',
  CRITICAL = 'حرج'
}

export enum Confidentiality {
  PUBLIC = 'عام',
  INTERNAL = 'داخلي',
  CONFIDENTIAL = 'سري',
  TOP_SECRET = 'سري للغاية'
}

export enum ArchiveStatus {
  ACTIVE = 'نشط',
  IN_PROCESS = 'قيد المعاملة',
  CLOSED = 'مغلق',
  ARCHIVED = 'مؤرشف',
  DESTRUCTION_CANDIDATE = 'مرشح للحذف',
  DESTROYED = 'تم الإتلاف'
}

export enum RetentionAction {
  ARCHIVE = 'أرشفة دائمة',
  DESTROY = 'إتلاف آمن',
  REVIEW = 'مراجعة إدارية'
}

export interface RetentionPolicy {
  id: string;
  name: string; // e.g., "Financial Records - 7 Years"
  description: string;
  durationMonths: number;
  action: RetentionAction;
  targetDocTypes: DocumentType[];
}

export interface ISOMetadata {
  recordId: string;
  originalPath: string;
  title: string;
  description: string; // الغرض المختصر
  executiveSummary?: string; // ملخص تنفيذي شامل (الجديد)
  documentType: DocumentType;
  entity: string;
  sender?: string;         // المرسل
  recipient?: string;      // إلى
  cc?: string;             // نسخة إلى
  category?: string;       // التصنيف
  incomingNumber?: string; // رقم الوارد
  outgoingNumber?: string; // رقم الصادر
  year: number;
  fullDate?: string;       // التاريخ الكامل الموجود في الخطاب
  importance: Importance;
  confidentiality: Confidentiality;
  retentionPolicy: string; // Name of the applied policy
  expiryDate: string | null;
  status: ArchiveStatus;
  createdAt: string;
  updatedAt: string;
  relatedFileIds?: string[]; // IDs of files identified as related
  ocrStatus?: 'pending' | 'completed' | 'failed' | 'skipped'; // New field for OCR status
}

export interface FileRecord {
  id: string;
  name: string;
  size: number;
  type: string;
  lastModified: number;
  content?: string;
  preview?: string; // Base64 thumbnail or truncated text content
  isoMetadata?: ISOMetadata;
  isProcessing: boolean;
  extractedText?: string; // Content extracted via OCR or Mammoth
  originalFile?: File; // مرجع للملف الأصلي في الذاكرة لغرض التحميل والإرسال
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
  relatedFiles?: string[]; // IDs of referenced records
}

// New Interfaces for Audit
export enum AuditAction {
  VIEW = 'عرض سجل',
  CREATE = 'إضافة سجل',
  UPDATE = 'تعديل بيانات',
  DELETE = 'حذف سجل',
  POLICY_CHANGE = 'تغيير سياسة',
  SYSTEM_LOGIN = 'دخول النظام',
  SYNC = 'مزامنة ملفات'
}

export interface AuditLog {
  id: string;
  action: AuditAction;
  details: string;
  user: string;
  timestamp: string;
  resourceId?: string;
}
