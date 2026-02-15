
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { DocumentType, Importance, Confidentiality, ArchiveStatus, ISOMetadata } from "../types";

// Initialize Gemini API with the provided key
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Robust JSON extraction from model response.
 */
const extractJson = (text: string) => {
  const cleaned = text.trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (innerE) {
        throw new Error("Failed to parse extracted JSON block");
      }
    }
    throw e;
  }
};

/**
 * Helper function to retry promises with exponential backoff.
 * Useful for handling 503 "High Demand" errors from the API.
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 2000,
  factor = 2
): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    // Check for 503 status code or specific error messages related to load
    const isOverloaded = 
      error?.status === 503 || 
      error?.code === 503 || 
      (error?.message && error.message.includes('high demand'));

    if (retries > 0 && isOverloaded) {
      console.warn(`API overloaded (503), retrying in ${delay}ms... (${retries} attempts left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return retryWithBackoff(fn, retries - 1, delay * factor, factor);
    }
    throw error;
  }
}

export const classifyFileContent = async (
  fileName: string, 
  content: string, 
  otherFilesSummary: string = "",
  folderRelatedIds: string[] = []
): Promise<Partial<ISOMetadata>> => {
  const fileExt = fileName.split('.').pop()?.toLowerCase() || '';
  
  const prompt = `أنت خبير أرشفة رقمية وفق معيار ISO 15489. حلل بيانات هذا الملف:
  - اسم الملف: ${fileName}
  - النوع: ${fileExt}
  - عينة المحتوى: ${content.substring(0, 1000)}
  
  السجلات الموجودة حالياً في الأرشيف (لإيجاد روابط إضافية):
  ${otherFilesSummary}

  **معلومات هيكلية هامة:**
  يوجد هذا الملف في نفس المجلد مع الملفات التالية (معرفاتها): ${JSON.stringify(folderRelatedIds)}.
  يجب عليك تضمين هذه المعرفات في قائمة relatedFileIds بشكل تلقائي لأنها مرتبطة هيكلياً.
  
  المطلوب:
  استخرج البيانات بدقة بصيغة JSON. 
  في حقل relatedFileIds، قم بدمج:
  1. المعرفات الهيكلية المذكورة أعلاه (${JSON.stringify(folderRelatedIds)}).
  2. أي معرفات لسجلات أخرى من "قائمة السجلات الموجودة" إذا اكتشفت علاقة منطقية أو دلالية (Semantic Link) في المحتوى (مثلاً: فاتورة تشير إلى رقم عقد موجود في مجلد آخر).`;

  try {
    const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            documentType: { type: Type.STRING, enum: Object.values(DocumentType) },
            entity: { type: Type.STRING },
            year: { type: Type.NUMBER },
            importance: { type: Type.STRING, enum: Object.values(Importance) },
            confidentiality: { type: Type.STRING, enum: Object.values(Confidentiality) },
            retentionPolicy: { type: Type.STRING },
            expiryDate: { type: Type.STRING },
            relatedFileIds: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING },
              description: "قائمة بمعرفات السجلات المرتبطة (الهيكلية والدلالية)"
            }
          },
          required: ["title", "documentType", "entity", "importance", "confidentiality"],
        }
      }
    }));

    const result = extractJson(response.text || "{}");
    
    return {
      ...result,
      status: ArchiveStatus.ACTIVE,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Gemini classification failed:", error);
    return {
      title: fileName,
      description: "تعذر التحليل العميق بسبب انشغال الخدمة مؤقتاً.",
      documentType: DocumentType.OTHER,
      entity: "غير محدد",
      importance: Importance.NORMAL,
      confidentiality: Confidentiality.INTERNAL,
      status: ArchiveStatus.ACTIVE,
      relatedFileIds: folderRelatedIds // Ensure structural links are preserved even on error
    };
  }
};

export const askAgent = async (query: string, filesContext: string): Promise<string> => {
  const prompt = `أنت الوكيل الذكي لنظام "أرشيف". أنت خبير في معايير ISO 15489.
  تعامل مع قاعدة البيانات المحلية المتاحة في السياق أدناه للإجابة على استفسار المستخدم.
  
  السياق المتاح:
  ${filesContext}
  
  استعلام المستخدم:
  ${query}`;

  try {
    const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    }));
    return response.text || "عذراً، لم أتمكن من استخراج إجابة دقيقة حالياً.";
  } catch (error) {
    console.error("Agent interaction failed:", error);
    return "نعتذر، الخادم مشغول حالياً. يرجى المحاولة مرة أخرى بعد قليل.";
  }
};
