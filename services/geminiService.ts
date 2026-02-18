
import { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { ArchiveStatus, ISOMetadata, DocumentType } from "../types";

/**
 * تنظيف صارم للنص لاستخراج JSON صالح
 */
const parseGeminiJSON = (text: string): any => {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (e) {
    try {
      let clean = text.replace(/```json/g, "").replace(/```/g, "").trim();
      const firstBrace = clean.indexOf('{');
      const lastBrace = clean.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        clean = clean.substring(firstBrace, lastBrace + 1);
        return JSON.parse(clean);
      }
      return null;
    } catch (finalError) {
      console.error("Gemini JSON Parse Error:", finalError);
      return null;
    }
  }
};

/**
 * دالة مساعدة لإعادة المحاولة في حال فشل الاتصال
 */
const retryOperation = async <T>(operation: () => Promise<T>, retries = 3, delay = 2000): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    if (retries <= 0) throw error;
    console.warn(`Retrying operation... (${retries} attempts left)`);
    await new Promise(resolve => setTimeout(resolve, delay));
    return retryOperation(operation, retries - 1, delay * 2);
  }
};

/**
 * تحليل الوثائق باستخدام Gemini 3 Flash مع إعدادات أمان مخصصة
 */
export const analyzeSpecificFile = async (
  fileName: string, 
  contentOrBase64: string,
  mimeType?: string,
  isBinary: boolean = false
): Promise<Partial<ISOMetadata>> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = "gemini-3-flash-preview";
  
  const promptText = `
  بصفتك خبير أرشفة (ISO 15489)، قم بتحليل الملف "${fileName}" واستخرج البيانات التالية بصيغة JSON حصراً:
  - title: عنوان الوثيقة.
  - executiveSummary: ملخص تنفيذي دقيق وشامل بالعربية.
  - documentType: نوع الوثيقة (عقد، فاتورة، خطاب، تقرير، هوية، أخرى).
  - sender: المرسل.
  - recipient: المستلم.
  - fullDate: التاريخ.
  - importance: (عادي، مهم، سري).
  - confidentiality: (عام، داخلي، سري).
  - incomingNumber: رقم القيد الوارد.
  `;

  const parts: any[] = isBinary && mimeType 
    ? [{ inlineData: { mimeType, data: contentOrBase64 } }, { text: promptText }]
    : [{ text: promptText }, { text: `محتوى الملف:\n${contentOrBase64.substring(0, 25000)}` }];

  // إعدادات الأمان لمنع الحظر الخاطئ للمستندات
  const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  ];

  const generate = async () => {
    const response = await ai.models.generateContent({
      model: model,
      contents: [{ parts }],
      config: { 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
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
          required: ["title", "executiveSummary"]
        },
        safetySettings: safetySettings,
        systemInstruction: "أنت نظام أرشفة رقمي ذكي. استخرج البيانات بدقة وحيادية."
      }
    });
    return response;
  };

  try {
    const response = await retryOperation(generate);
    const result = parseGeminiJSON(response.text);
    if (!result) throw new Error("فشل قراءة هيكل البيانات (JSON Invalid)");
    return result;
  } catch (error) {
    console.error("Gemini Critical Analysis Failed:", error);
    return {
      title: fileName,
      executiveSummary: "فشل التحليل الذكي: يرجى التحقق من اتصال الإنترنت أو صلاحية الملف. (Error: Analysis Timeout or Block)",
      documentType: DocumentType.OTHER,
      status: ArchiveStatus.IN_PROCESS
    };
  }
};

/**
 * الوكيل الذكي (Chat Agent) مع إعادة المحاولة
 */
export const askAgent = async (query: string, archiveContext: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const generate = async () => {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: `معلومات الأرشيف:\n${archiveContext}\n\nطلب المستخدم: ${query}` }] }],
      config: {
        systemInstruction: "أنت مساعد أرشفة ذكي. أجب بدقة بناءً على الملفات المتوفرة."
      }
    });
    return response.text;
  };

  try {
    const text = await retryOperation(generate, 2);
    return text || "عذراً، لا توجد إجابة متاحة.";
  } catch (error) {
    return "عذراً، حدث خطأ في الاتصال بالوكيل الذكي.";
  }
};

export async function* askAgentStream(query: string, archiveContext: string) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const responseStream = await ai.models.generateContentStream({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: `الأرشيف:\n${archiveContext}\n\nسؤال: ${query}` }] }],
      config: { systemInstruction: "أنت مساعد أرشيف." }
    });
    for await (const chunk of responseStream) {
      yield chunk.text;
    }
  } catch (e) {
    yield "خطأ في الاتصال بالخادم.";
  }
}
