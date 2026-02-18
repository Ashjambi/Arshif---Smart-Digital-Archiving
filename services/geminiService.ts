
import { GoogleGenAI, Type } from "@google/genai";
import { ArchiveStatus, ISOMetadata, DocumentType } from "../types";

/**
 * دالة ذكية لتحويل النص إلى كائن JSON مع معالجة الأخطاء الشائعة
 */
const safeParseJSON = (text: string): any => {
  if (!text) return null;
  try {
    // محاولة التنظيف من علامات الماركدوان
    const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleaned);
  } catch (e) {
    // البحث عن أول وآخر قوس متعرج لاستخراج الـ JSON
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      try {
        return JSON.parse(text.substring(start, end + 1));
      } catch (innerError) {
        console.error("Failed to parse JSON even after cleaning", innerError);
        return null;
      }
    }
    return null;
  }
};

/**
 * تحليل الوثائق باستخدام Gemini-3-Flash لضمان السرعة والموثوقية
 */
export const analyzeSpecificFile = async (
  fileName: string, 
  contentOrBase64: string,
  mimeType?: string,
  isBinary: boolean = false
): Promise<Partial<ISOMetadata>> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = "gemini-3-flash-preview";
  
  const promptText = `تحليل الوثيقة "${fileName}" واستخراج البيانات الوصفية بدقة وفق معايير الأرشفة الدولية (ISO 15489).
  المطلوب استخراج: العنوان، الوصف، ملخص تنفيذي (شامل)، نوع الوثيقة، المرسل، المستلم، الأرقام المرجعية، التاريخ، درجة الأهمية، والسرية.
  يجب أن يكون الرد باللغة العربية وفي صيغة JSON فقط.`;

  const parts: any[] = isBinary && mimeType 
    ? [{ inlineData: { mimeType, data: contentOrBase64 } }, { text: promptText }]
    : [{ text: promptText }, { text: `محتوى النص المستخرج:\n${contentOrBase64.substring(0, 10000)}` }];

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
            confidentiality: { type: Type.STRING },
            entity: { type: Type.STRING }
          },
          required: ["title", "executiveSummary"]
        },
        systemInstruction: "أنت خبير أرشفة رقمية محترف. رد دائماً بصيغة JSON نظيفة باللغة العربية."
      }
    });
    
    const text = response.text;
    if (!text) throw new Error("استجابة فارغة من المحرك");

    const result = safeParseJSON(text);
    if (!result) throw new Error("فشل تحويل الاستجابة إلى JSON");
    
    return result;
  } catch (error) {
    console.error("Gemini Critical Error:", error);
    return {
      title: fileName,
      description: "فشل التحليل الذكي.",
      executiveSummary: "المعذرة، تعذر على النظام تحليل محتوى الملف حالياً. قد يكون السبب قيوداً في حجم الملف أو جودة النص. يرجى المحاولة مرة أخرى أو إدخال البيانات يدوياً."
    };
  }
};

/**
 * الوكيل الذكي للدردشة التفاعلية
 */
export const askAgent = async (query: string, archiveContext: string): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: `سياق الأرشيف:\n${archiveContext.substring(0, 10000)}\n\nسؤال المستخدم: ${query}` }] }],
      config: {
        systemInstruction: "أنت مساعد أرشيف PRO ذكي. أجب باللغة العربية بأسلوب مهني وواضح."
      }
    });
    return response.text || "لا توجد استجابة حالياً.";
  } catch (error) {
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
