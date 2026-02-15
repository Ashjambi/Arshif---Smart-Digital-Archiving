
import { GoogleGenAI, Type } from "@google/genai";
import { DocumentType, Importance, Confidentiality, ArchiveStatus, ISOMetadata } from "../types";

// Initialize Gemini API with the provided key
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Robust JSON extraction from model response.
 * Handles cases where the model might include markdown backticks despite the MIME type config.
 */
const extractJson = (text: string) => {
  const cleaned = text.trim();
  try {
    // Attempt direct parse
    return JSON.parse(cleaned);
  } catch (e) {
    // Fallback: try to find JSON block in markdown
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

export const classifyFileContent = async (fileName: string, content: string): Promise<Partial<ISOMetadata>> => {
  const fileExt = fileName.split('.').pop()?.toLowerCase() || '';
  
  // Refined prompt to avoid overly long responses that break JSON structure
  const prompt = `أنت خبير أرشفة رقمية وفق معيار ISO 15489. حلل بيانات هذا الملف المكتشف في المجلد المحلي:
  - اسم الملف: ${fileName}
  - النوع: ${fileExt}
  - عينة المحتوى: ${content.substring(0, 1000)}
  
  استخرج البيانات بدقة متناهية. لا تضف أي نصوص خارج هيكل JSON المطلوب. 
  اجعل الوصف (description) مركزاً (بحد أقصى 200 حرف).`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { 
              type: Type.STRING,
              description: "عنوان مهني للمستند باللغة العربية"
            },
            description: { 
              type: Type.STRING, 
              description: "وصف موجز جداً للمحتوى"
            },
            documentType: { 
              type: Type.STRING,
              enum: Object.values(DocumentType),
              description: "نوع الوثيقة"
            },
            entity: { 
              type: Type.STRING,
              description: "الجهة المعنية"
            },
            year: { 
              type: Type.NUMBER,
              description: "سنة المستند"
            },
            importance: { 
              type: Type.STRING,
              enum: Object.values(Importance),
              description: "درجة الأهمية"
            },
            confidentiality: { 
              type: Type.STRING,
              enum: Object.values(Confidentiality),
              description: "مستوى السرية"
            },
            retentionPolicy: { 
              type: Type.STRING,
              description: "سياسة الحفظ المقترحة"
            },
            expiryDate: { 
              type: Type.STRING,
              description: "تاريخ الانتهاء YYYY-MM-DD أو null"
            },
          },
          required: ["title", "documentType", "entity", "importance", "confidentiality"],
        }
      }
    });

    const result = extractJson(response.text);
    
    return {
      ...result,
      status: ArchiveStatus.ACTIVE,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Gemini classification failed:", error);
    // Safe fallback to prevent sync engine crash
    return {
      title: fileName,
      description: "تمت الفهرسة الأولية. تعذر التحليل العميق بسبب خطأ في هيكلية البيانات المستلمة.",
      documentType: DocumentType.OTHER,
      entity: "غير محدد",
      year: new Date().getFullYear(),
      importance: Importance.NORMAL,
      confidentiality: Confidentiality.INTERNAL,
      status: ArchiveStatus.ACTIVE,
    };
  }
};

export const askAgent = async (query: string, filesContext: string): Promise<string> => {
  const prompt = `أنت الوكيل الذكي لنظام "أرشيف". أنت خبير في معايير ISO 15489.
  تعامل مع قاعدة البيانات المحلية المتاحة في السياق أدناه للإجابة على استفسار المستخدم.
  
  السياق المتاح (سجلات من المجلد المربوط):
  ${filesContext}
  
  استعلام المستخدم:
  ${query}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    return response.text || "عذراً، لم أتمكن من استخراج إجابة دقيقة حالياً.";
  } catch (error) {
    console.error("Agent interaction failed:", error);
    return "حدث خطأ أثناء معالجة طلبك ذكياً. يرجى المحاولة لاحقاً.";
  }
};
