
import { GoogleGenAI, Type } from "@google/genai";
import { ArchiveStatus, ISOMetadata } from "../types";

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
 */
export const analyzeSpecificFile = async (
  fileName: string, 
  content: string
): Promise<Partial<ISOMetadata>> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `بصفتك خبير أرشفة رقمية عالمي (ISO 15489)، قم بتحليل هذا المستند بدقة متناهية:
  اسم الملف: ${fileName}
  النص المستخرج: 
  ---
  ${content.substring(0, 10000)}
  ---
  
  المطلوب استخراج البيانات التالية بتنسيق JSON حصراً:
  - title: عنوان رسمي ومهني للمستند.
  - description: ملخص تنفيذي (50-100 كلمة) يشرح جوهر الوثيقة.
  - sender: الجهة أو الشخص المرسل.
  - recipient: الجهة أو الشخص المستلم.
  - category: تصنيف الموضوع.
  - documentType: نوع الوثيقة (عقد، فاتورة، تعميم، محضر اجتماع، تقرير، سياسة).
  - importance: (عادي، مهم، حرج).
  - confidentiality: (عام، داخلي، سري، سري للغاية).
  - retentionPolicy: سياسة الحفظ المقترحة.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });
    
    const result = extractJson(response.text || "{}");
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
  
  // Enhanced prompt to force AI to answer even if content is simple
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
    return response.text || "عذراً، لم أستطع العثور على المعلومات المطلوبة.";
  } catch (error) {
    return "حدث خطأ أثناء التواصل مع محرك الذكاء الاصطناعي.";
  }
};

export const classifyFileContent = analyzeSpecificFile;
