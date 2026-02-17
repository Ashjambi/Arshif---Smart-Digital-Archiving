import React from 'react';
import { 
  Home, 
  Settings, 
  FolderOpen
} from 'lucide-react';

export const NAV_ITEMS = [
  { id: 'dashboard', label: 'لوحة التحكم', icon: Home },
  { id: 'archive', label: 'الأرشيف الذكي', icon: FolderOpen },
  { id: 'settings', label: 'الإعدادات', icon: Settings },
];

export const STATUS_COLORS = {
  'نشط': 'bg-green-100 text-green-700',
  'قيد المعاملة': 'bg-blue-100 text-blue-700',
  'مغلق': 'bg-gray-100 text-gray-700',
  'مؤرشف': 'bg-indigo-100 text-indigo-700',
  'مرشح للحذف': 'bg-red-100 text-red-700',
};

export const IMPORTANCE_COLORS = {
  'عادي': 'text-slate-500',
  'مهم': 'text-blue-500 font-semibold',
  'عالي الأهمية': 'text-orange-500 font-semibold',
  'حرج': 'text-red-600 font-bold',
};