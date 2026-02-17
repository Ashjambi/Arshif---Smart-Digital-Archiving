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
 * تحليل ملف واحد محدد بعمق
 */
export const analyzeSpecificFile = async (
  fileName: string, 
  content: string
): Promise<Partial<ISOMetadata>> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `بصفتك خبير أرشفة ISO 15489، قم بقراءة وتحليل محتوى هذا الملف بدقة:
  اسم الملف: ${fileName}
  المحتوى المستخرج: 
  ---
  ${content.substring(0, 5000)}
  ---
  قم باستخراج البيانات التالية بدقة من النص أعلاه وأرجعها بتنسيق JSON:
  - title: عنوان رسمي للمستند.
  - description: ملخص تنفيذي دقيق لما يحتويه المستند.
  - sender: الجهة المرسلة (إذا وجدت).
  - recipient: الجهة المستلمة (إذا وجدت).
  - category: تصنيف الموضوع (مالي، إداري، تقني، إلخ).
  - documentType: نوع المستند (عقد، فاتورة، تعميم، إلخ).
  - importance: درجة الأهمية (عادي، مهم، حرج).
  - confidentiality: مستوى السرية (عام، سري، إلخ).`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 }
      }
    });
    
    const result = extractJson(response.text || "{}");
    return { 
      ...result, 
      status: ArchiveStatus.ACTIVE, 
      updatedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error("Analysis error:", error);
    throw error;
  }
};

/**
 * الدردشة مع محتوى ملف واحد محدد
 */
export const chatWithFile = async (query: string, fileName: string, fileContent: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `أنت الآن مساعد ذكي يقرأ ملفاً واحداً فقط ويجيب على الأسئلة المتعلقة به.
  
  الملف الحالي: ${fileName}
  محتوى الملف:
  ---
  ${fileContent.substring(0, 10000)}
  ---
  
  أجب على السؤال التالي بناءً على محتوى الملف فقط: ${query}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 0 }
      }
    });
    return response.text || "لم أتمكن من العثور على إجابة داخل الملف.";
  } catch (error) {
    return "حدث خطأ أثناء محاولة قراءة الملف.";
  }
};

export const classifyFileContent = analyzeSpecificFile;
export const askAgent = async (query: string, filesContext: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `أنت مساعد أرشفة ذكي. السياق العام للملفات المتاحة:\n${filesContext}\nالسؤال: ${query}`;
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
  });
  return response.text || "";
};