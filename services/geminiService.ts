
import { GoogleGenAI, Type } from "@google/genai";
import { ArchiveStatus, ISOMetadata, DocumentType } from "../types";

/**
 * تنظيف صارم للنص لاستخراج JSON صالح
 */
const parseGeminiJSON = (text: string): any => {
  if (!text) return null;
  try {
    // 1. المحاولة المباشرة
    return JSON.parse(text);
  } catch (e) {
    try {
      // 2. إزالة Markdown وعلامات الكود
      let clean = text.replace(/```json/g, "").replace(/```/g, "").trim();
      
      // 3. البحث عن حدود الكائن {}
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
 * تحليل الوثائق باستخدام Gemini 3 Flash مع فرض Schema
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
  قم بتحليل الوثيقة المرفقة "${fileName}" واستخرج البيانات الوصفية بدقة للأرشفة.
  المخرجات المطلوبة (JSON فقط):
  - title: عنوان الوثيقة.
  - executiveSummary: ملخص تنفيذي دقيق باللغة العربية يشرح محتوى الوثيقة.
  - documentType: نوع الوثيقة (عقد، خطاب، فاتورة، تقرير...).
  - sender: الجهة المرسلة.
  - recipient: الجهة المستلمة.
  - fullDate: التاريخ المذكور في الوثيقة.
  - importance: (عادي، مهم، سري).
  - incomingNumber: رقم الوارد إن وجد.
  `;

  const parts: any[] = isBinary && mimeType 
    ? [{ inlineData: { mimeType, data: contentOrBase64 } }, { text: promptText }]
    : [{ text: promptText }, { text: `محتوى الملف:\n${contentOrBase64.substring(0, 20000)}` }];

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
        systemInstruction: "أنت نظام أرشفة ذكي (ISO 15489). استخرج البيانات بدقة متناهية وباللغة العربية."
      }
    });

    const result = parseGeminiJSON(response.text);
    if (!result) throw new Error("فشل استخراج البيانات الهيكلية");
    
    return result;

  } catch (error) {
    console.error("Analysis Failed:", error);
    return {
      title: fileName,
      executiveSummary: "تعذر التحليل الآلي لهذا الملف حالياً. يرجى التحقق من الملف أو إدخال البيانات يدوياً.",
      documentType: DocumentType.OTHER
    };
  }
};

/**
 * الوكيل الذكي (Chat Agent)
 */
export const askAgent = async (query: string, archiveContext: string): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    // استخدام نموذج Pro للإجابات المعقدة إذا توفر، أو Flash للسرعة
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: `قائمة الملفات المتوفرة في الأرشيف:\n${archiveContext}\n\nسؤال المستخدم: ${query}` }] }],
      config: {
        systemInstruction: "أنت مساعد أرشفة ذكي. أجب على أسئلة المستخدم بناءً على الملفات الموجودة في السياق فقط. كن دقيقاً ومساعداً."
      }
    });
    return response.text || "عذراً، لم أستطع تكوين إجابة.";
  } catch (error) {
    console.error("Agent Error:", error);
    return "واجهت مشكلة في الاتصال بمحرك الذكاء الاصطناعي.";
  }
};

export async function* askAgentStream(query: string, archiveContext: string) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const responseStream = await ai.models.generateContentStream({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: `سياق الأرشيف:\n${archiveContext}\n\nسؤال: ${query}` }] }],
      config: { systemInstruction: "أنت مساعد أرشيف. أجب بإيجاز ودقة." }
    });
    for await (const chunk of responseStream) {
      yield chunk.text;
    }
  } catch (e) {
    yield "خطأ في الاتصال.";
  }
}
