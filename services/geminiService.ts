
import { GoogleGenAI, Type } from "@google/genai";
import { ArchiveStatus, ISOMetadata, DocumentType } from "../types";

/**
 * دالة ذكية لتنظيف استجابة الذكاء الاصطناعي وتحويلها إلى كائن JSON سليم.
 */
const parseGeminiJSON = (text: string): any => {
  if (!text) return null;
  try {
    // إزالة علامات الماركدوان المحتملة
    const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
    // محاولة استخراج أول كائن JSON يظهر في النص
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      return JSON.parse(cleaned.substring(firstBrace, lastBrace + 1));
    }
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("JSON Parsing Error:", e, "Raw Text:", text);
    return null;
  }
};

/**
 * تحليل الوثائق باستخدام Gemini-3-Flash.
 */
export const analyzeSpecificFile = async (
  fileName: string, 
  contentOrBase64: string,
  mimeType?: string,
  isBinary: boolean = false
): Promise<Partial<ISOMetadata>> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = "gemini-3-flash-preview";
  
  const promptText = `تحليل الوثيقة "${fileName}" واستخراج البيانات الوصفية كـ JSON باللغة العربية.
  المطلوب: استخراج العنوان، ملخص تنفيذي شامل، نوع الوثيقة، المرسل، المستلم، التاريخ، الأهمية، والسرية.
  يجب أن يكون الرد JSON سليم فقط.`;

  const parts: any[] = isBinary && mimeType 
    ? [{ inlineData: { mimeType, data: contentOrBase64 } }, { text: promptText }]
    : [{ text: promptText }, { text: `المحتوى النصي:\n${contentOrBase64.substring(0, 15000)}` }];

  try {
    const response = await ai.models.generateContent({
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
            confidentiality: { type: Type.STRING }
          },
          required: ["title", "executiveSummary"]
        },
        systemInstruction: "أنت خبير أرشفة دولي وفق معيار ISO 15489. رد دائماً بصيغة JSON نظيفة وباللغة العربية."
      }
    });
    
    return parseGeminiJSON(response.text) || { title: fileName, executiveSummary: "فشل التحليل الهيكلي للبيانات." };
  } catch (error) {
    console.error("Gemini Analysis Failure:", error);
    return {
      title: fileName,
      executiveSummary: "تعذر تحليل الوثيقة ذكياً بسبب خطأ في الاتصال بالخادم."
    };
  }
};

/**
 * الوكيل الذكي للدردشة التفاعلية.
 */
export const askAgent = async (query: string, archiveContext: string): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: `سياق الأرشيف:\n${archiveContext.substring(0, 10000)}\n\nسؤال المستخدم: ${query}` }] }],
      config: {
        systemInstruction: "أنت مساعد أرشيف PRO ذكي. أجب باللغة العربية. اذكر أسماء الملفات ومعرفاتها بوضوح عند الحاجة."
      }
    });
    return response.text || "لم أتمكن من صياغة رد مناسب.";
  } catch (error) {
    console.error("Agent Error:", error);
    return "عذراً، الوكيل يواجه صعوبة فنية حالياً.";
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
    for await (const chunk of responseStream) {
      yield chunk.text;
    }
  } catch {
    yield "خطأ في الاتصال بالوكيل.";
  }
}
