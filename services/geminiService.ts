
import { GoogleGenAI, Type } from "@google/genai";
import { ArchiveStatus, ISOMetadata, DocumentType } from "../types";

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
        throw new Error("Failed to parse JSON");
      }
    }
    throw e;
  }
};

/**
 * Deep analysis of a specific document for ISO 15489 classification
 * Updated signature to include archiveContext and siblings as passed in src/App.tsx
 */
export const analyzeSpecificFile = async (
  fileName: string, 
  content: string,
  archiveContext?: string,
  siblings?: string[]
): Promise<Partial<ISOMetadata>> => {
  // Always use process.env.API_KEY directly via a new instance before call
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `بصفتك خبير أرشفة رقمية عالمي (ISO 15489)، قم بتحليل هذا المستند بدقة متناهية:
  اسم الملف: ${fileName}
  النص المستخرج: 
  ---
  ${content.substring(0, 10000)}
  ---
  
  سياق الأرشيف الحالي:
  ${archiveContext || 'لا يوجد'}
  
  معرفات الملفات في المجلد المرتبط:
  ${siblings?.join(', ') || 'لا يوجد'}

  المطلوب استخراج البيانات التالية بتنسيق JSON حصراً:
  - title: عنوان رسمي ومهني للمستند.
  - description: ملخص تنفيذي (50-100 كلمة) يشرح جوهر الوثيقة.
  - sender: الجهة أو الشخص المرسل.
  - recipient: الجهة أو الشخص المستلم.
  - category: تصنيف الموضوع.
  - documentType: نوع الوثيقة (يجب أن يكون أحد القيم التالية: ${Object.values(DocumentType).join(', ')}).
  - importance: (عادي، مهم، حرج).
  - confidentiality: (عام، داخلي، سري، سري للغاية).
  - retentionPolicy: سياسة الحفظ المقترحة.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        // Enforcing JSON structure with responseSchema
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            sender: { type: Type.STRING },
            recipient: { type: Type.STRING },
            category: { type: Type.STRING },
            documentType: { type: Type.STRING },
            importance: { type: Type.STRING },
            confidentiality: { type: Type.STRING },
            retentionPolicy: { type: Type.STRING },
          },
          required: ["title", "description", "documentType", "importance", "confidentiality"]
        }
      }
    });
    
    // Using .text property directly as per Gemini 3 SDK guidelines
    const result = JSON.parse(response.text || "{}");
    return { 
      ...result, 
      status: ArchiveStatus.ACTIVE, 
      updatedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error("Deep Analysis error:", error);
    throw error;
  }
};

/**
 * Chat with a specific file context
 */
export const chatWithFile = async (query: string, fileName: string, fileContent: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `أنت مساعد أرشفة رقمي محترف. سياق العمل هو المستند التالي:
  اسم الملف: ${fileName}
  المحتوى المستخرج:
  ---
  ${fileContent}
  ---
  
  بناءً على هذا المحتوى، أجب على السؤال التالي باللغة العربية: ${query}
  ملاحظة: إذا كان المحتوى يبدو مختصراً، حاول تقديم استنتاجات منطقية بناءً على اسم الملف والمعلومات المتاحة.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt
    });
    // .text is a property in GenerateContentResponse
    return response.text || "لم أتمكن من استخراج إجابة دقيقة.";
  } catch (error) {
    return "حدث خطأ أثناء معالجة استفسارك حول الملف.";
  }
};

/**
 * General archive agent chat
 */
export const askAgent = async (query: string, archiveContext: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `أنت خبير الأرشفة الرقمي (أرشيف PRO). لديك نظرة عامة على الملفات التالية:
  ---
  ${archiveContext}
  ---
  
  أجب على سؤال المستخدم بمهنية عالية وباللغة العربية: ${query}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt
    });
    // .text is a property in GenerateContentResponse
    return response.text || "عذراً، لم أستطع العثور على المعلومات المطلوبة.";
  } catch (error) {
    return "حدث خطأ أثناء التواصل مع محرك الذكاء الاصطناعي.";
  }
};

export const classifyFileContent = analyzeSpecificFile;
