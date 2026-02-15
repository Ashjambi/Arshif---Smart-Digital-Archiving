
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
  description: string;
  documentType: DocumentType;
  entity: string;
  year: number;
  importance: Importance;
  confidentiality: Confidentiality;
  retentionPolicy: string; // Name of the applied policy
  expiryDate: string | null;
  status: ArchiveStatus;
  createdAt: string;
  updatedAt: string;
  relatedFileIds?: string[]; // IDs of files identified as related
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
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
  relatedFiles?: string[]; // IDs of referenced records
}
