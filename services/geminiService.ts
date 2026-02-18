
import { GoogleGenAI, Type } from "@google/genai";
import { ArchiveStatus, ISOMetadata, DocumentType } from "../types";

/**
 * دالة متقدمة لاستخراج الـ JSON وتطهيره من أي نصوص زائدة أو علامات Markdown
 * لضمان نجاح عملية Parsing حتى في الحالات غير المتوقعة.
 */
const robustParseJSON = (text: string): any => {
  if (!text) return {};
  
  // إزالة علامات Markdown البرمجية إذا وجدت
  let sanitized = text.replace(/```json/g, "").replace(/```/g, "").trim();
  
  // محاولة العثور على أول قوس فتح وآخر قوس إغلاق
  const firstBrace = sanitized.indexOf('{');
  const lastBrace = sanitized.lastIndexOf('}');
  
  if (firstBrace !== -1 && lastBrace !== -1) {
    sanitized = sanitized.substring(firstBrace, lastBrace + 1);
  }

  try {
    return JSON.parse(sanitized);
  } catch (e) {
    console.error("JSON Parse Error at content:", sanitized);
    // محاولة أخيرة: إزالة النيولاينز داخل القيم النصية التي قد تكسر الـ JSON
    try {
      const fixed = sanitized.replace(/\n/g, "\\n");
      return JSON.parse(fixed);
    } catch (innerE) {
      throw e; // إرجاع الخطأ الأصلي إذا فشلت المحاولة الإضافية
    }
  }
};

/**
 * تنفيذ الطلبات مع نظام إعادة محاولة ذكي (Exponential Backoff)
 */
async function generateWithRetry(params: any, retries = 3): Promise<any> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    return await ai.models.generateContent(params);
  } catch (error: any) {
    console.warn(`Gemini API Attempt Failed. Retries left: ${retries}`, error?.message);
    if (retries > 0 && (error.status === 503 || error.status === 429 || error.status === 500)) {
      await new Promise(r => setTimeout(r, 2000 * (4 - retries)));
      return generateWithRetry(params, retries - 1);
    }
    throw error;
  }
}

/**
 * التحليل الذكي للوثائق (ISO 15489)
 */
export const analyzeSpecificFile = async (
  fileName: string, 
  contentOrBase64: string,
  mimeType?: string,
  isBinary: boolean = false
): Promise<Partial<ISOMetadata>> => {
  // استخدام gemini-3-flash-preview لاستقرار الأداء في السحاب
  const model = "gemini-3-flash-preview";
  
  const promptText = `
  تحليل وثيقة رسمية: "${fileName}".
  المطلوب استخراج البيانات الوصفية بدقة وفق معايير الأرشفة الدولية.
  يجب أن يكون الملخص التنفيذي (executiveSummary) شاملاً وواضحاً باللغة العربية.
  `;

  const parts: any[] = isBinary && mimeType 
    ? [{ inlineData: { mimeType, data: contentOrBase64 } }, { text: promptText }]
    : [{ text: promptText }, { text: `محتوى الوثيقة:\n${contentOrBase64.substring(0, 12000)}` }];

  try {
    const response = await generateWithRetry({
      model: model,
      contents: [{ parts }],
      config: { 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            executiveSummary: { type: Type.STRING },
            documentType: { type: Type.STRING },
            sender: { type: Type.STRING },
            recipient: { type: Type.STRING },
            incomingNumber: { type: Type.STRING },
            outgoingNumber: { type: Type.STRING },
            fullDate: { type: Type.STRING },
            importance: { type: Type.STRING },
            confidentiality: { type: Type.STRING },
            entity: { type: Type.STRING }
          },
          required: ["title", "executiveSummary", "documentType"]
        },
        systemInstruction: "أنت نظام خبير في تحليل الأرشيف. رد فقط بصيغة JSON نظيفة."
      }
    });
    
    return robustParseJSON(response.text);
  } catch (error) {
    console.error("Critical Analysis Error:", error);
    return {
      title: fileName,
      description: "فشل التحليل الذكي التلقائي.",
      executiveSummary: "تعذر تحليل محتوى الملف بواسطة الذكاء الاصطناعي حالياً. يرجى مراجعة جودة الملف أو المحتوى النصي."
    };
  }
};

/**
 * الوكيل الذكي للرد عبر الويب وتليجرام
 */
export const askAgent = async (query: string, archiveContext: string): Promise<string> => {
  try {
    const response = await generateWithRetry({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: `سياق الأرشيف الحالي:\n${archiveContext.substring(0, 15000)}\n\nسؤال المستخدم: ${query}` }] }],
      config: {
        systemInstruction: "أنت مساعد أرشيف PRO. أجب باللغة العربية. إذا سأل المستخدم عن ملف موجود في السياق، اذكر اسمه ومعرفه. للتحميل، أضف كود [[DOWNLOAD:ID]] في نهاية ردك."
      }
    });
    return response.text || "لا توجد استجابة من الوكيل حالياً.";
  } catch (error) {
    console.error("Agent Request Error:", error);
    return "عذراً، يواجه الوكيل الذكي صعوبات تقنية حالياً.";
  }
};

export async function* askAgentStream(query: string, archiveContext: string) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const responseStream = await ai.models.generateContentStream({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: `الأرشيف:\n${archiveContext}\n\nسؤال: ${query}` }] }],
      config: { systemInstruction: "أنت مساعد أرشيف PRO ذكي ومختصر باللغة العربية." }
    });
    for await (const chunk of responseStream) yield chunk.text;
  } catch {
    yield "خطأ في الاتصال بالوكيل.";
  }
}

export const classifyFileContent = async (content: string): Promise<string> => {
  try {
    const response = await generateWithRetry({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: `صنف نوع الوثيقة بكلمة واحدة فقط: ${content.substring(0, 500)}` }] }],
    });
    return response.text?.trim() || "أخرى";
  } catch {
    return "أخرى";
  }
};
