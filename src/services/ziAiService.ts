// ZI AI Service - communicates with backend which uses ZI AI
// No API key required from user - the server handles all AI requests

import { ArchiveStatus, ISOMetadata, FileRecord } from "../../types";

export const APP_VERSION = "2.0.0-ZI";

const getSystemInstruction = (archiveContext: string) => `أنت مساعد ذكي ومحترف لأرشفة الملفات وتحليلها.
أنت تعمل حالياً بالإصدار رقم ${APP_VERSION} من النظام. إذا سألك المستخدم عن إصدارك الحالي، أجب بهذا الرقم.

تعليمات صارمة جداً:
1. اعتمد على "TOTAL_FILES_COUNT" و "CURRENT_DATE" في بداية السياق للإجابة على الأسئلة الكمية والزمنية.
2. عند سؤال المستخدم عن ملفات "اليوم" أو الملفات "المضافة حديثاً"، قارن بين "CURRENT_DATE" و "تاريخ الأرشفة" المذكور لكل ملف.
3. كن موجزاً ومباشراً جداً، ولكن احترافياً في صياغتك.
4. **الملخص التنفيذي (Executive Summary):** عند طلب معلومات عن ملف أو مجموعة ملفات، ابدأ دائماً بتقديم "ملخص تنفيذي" دقيق ومباشر يوضح جوهر الموضوع قبل سرد التفاصيل.
5. **الربط والتحليل الذكي (أولوية قصوى)**: 
   - ابحث عن الروابط بين الملفات باستخدام "رقم القيد/الإشارة" و "المراجع المرتبطة".
   - إذا سألك المستخدم عن خطاب معين، ابحث عن الخطابات الأخرى التي تذكره في "المراجع المرتبطة" أو التي تحمل نفس "رقم القيد".
6. انتبه جيداً لـ "الموقع" (صاحب الصلاحية) و "رقم الوارد" و "المشفوعات".
7. **ممنوع الهلوسة منعاً باتاً (CRITICAL)**: 
   - لا تخترع أو تفترض وجود ملفات أو روابط أو خطابات غير موجودة في السياق المرسل لك.
   - إذا سألك المستخدم عن خطاب أو ملف غير موجود، اعتذر بلباقة.
   - لا تقم بتأليف بيانات أو أرقام قيود أو تواريخ من عندك أبداً.

السياق (الأرشيف المتاح لك للبحث فيه حصراً):
${archiveContext}`;

/**
 * Analyze a specific file using ZI AI backend
 */
export const analyzeSpecificFile = async (
  fileName: string, 
  contentOrBase64: string,
  mimeType?: string,
  isBinary: boolean = false
): Promise<Partial<ISOMetadata>> => {
  try {
    const response = await fetch('/api/ai/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName,
        content: contentOrBase64,
        mimeType,
        isBinary
      })
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.success && data.analysis) {
      return {
        ...data.analysis,
        status: ArchiveStatus.ACTIVE
      };
    } else {
      return {
        title: fileName,
        executiveSummary: data.error || "⚠️ فشل التحليل",
        status: ArchiveStatus.ERROR
      };
    }
  } catch (e: any) {
    console.error("Analysis Error:", e);
    return {
      title: fileName,
      executiveSummary: `⚠️ خطأ في الاتصال: ${e.message}`,
      status: ArchiveStatus.ERROR
    };
  }
};

/**
 * Ask the AI agent a question
 */
export const askAgent = async (
  query: string, 
  archiveContext: string, 
  chatHistory: {role: string, text: string}[] = [],
  files: FileRecord[] = [],
  retries = 2
): Promise<string> => {
  try {
    const messages = [
      ...chatHistory.map(m => ({ role: m.role, content: m.text })),
      { role: 'user', content: query }
    ];

    const response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        systemPrompt: getSystemInstruction(archiveContext)
      })
    });

    if (!response.ok) {
      if (retries > 0) {
        await new Promise(r => setTimeout(r, 1000));
        return askAgent(query, archiveContext, chatHistory, files, retries - 1);
      }
      throw new Error(`Server error: ${response.status}`);
    }

    const data = await response.json();
    return data.response || "⚠️ لم يتم استلام رد";
  } catch (e: any) {
    console.error("Agent Error:", e);
    if (retries > 0) {
      await new Promise(r => setTimeout(r, 2000));
      return askAgent(query, archiveContext, chatHistory, files, retries - 1);
    }
    return `⚠️ خطأ في الاتصال: ${e.message}`;
  }
};

/**
 * Stream response from AI agent
 */
export async function* askAgentStream(
  query: string, 
  archiveContext: string, 
  chatHistory: {role: string, text: string}[] = [],
  files: FileRecord[] = []
) {
  // For now, we'll use non-streaming and yield the full response
  // In production, you could implement Server-Sent Events (SSE) for true streaming
  try {
    const response = await askAgent(query, archiveContext, chatHistory, files);
    yield response;
  } catch (e: any) {
    yield `⚠️ خطأ: ${e.message}`;
  }
}

/**
 * Set API Key - No longer needed, kept for compatibility
 */
export const setApiKey = (_key: string): void => {
  console.log("API Key is no longer required - using ZI AI backend");
};

/**
 * Check if API Key is configured - Always returns true now
 */
export const hasApiKey = (): boolean => {
  return true;
};
