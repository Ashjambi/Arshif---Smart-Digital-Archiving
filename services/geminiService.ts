import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { DocumentType, Importance, Confidentiality, ArchiveStatus, ISOMetadata } from "../types";

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

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  retries = 1,
  delay = 1000
): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    if (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
      return retryWithBackoff(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

export const classifyFileContent = async (
  fileName: string, 
  content: string, 
  otherFilesSummary: string = ""
): Promise<Partial<ISOMetadata>> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `أنت محرك فهرسة ذكي (ISO 15489). حلل المستند:
  - الاسم: ${fileName}
  - المحتوى: ${content.substring(0, 2000)}
  
  استخرج JSON بالحقول: 
  title, description, sender, recipient, category, documentType, importance (عادي، مهم، حرج), confidentiality (عام، سري).`;

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
            sender: { type: Type.STRING },
            recipient: { type: Type.STRING },
            category: { type: Type.STRING },
            documentType: { type: Type.STRING },
            importance: { type: Type.STRING },
            confidentiality: { type: Type.STRING },
          },
          required: ["title"],
        }
      }
    }));
    const result = extractJson(response.text || "{}");
    return { 
      ...result, 
      status: ArchiveStatus.ACTIVE, 
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error("Classification error:", error);
    // إرجاع بيانات أساسية لضمان عدم توقف النظام
    return { 
      title: fileName, 
      documentType: DocumentType.OTHER, 
      description: "تمت الفهرسة آلياً بناءً على اسم الملف بسبب تعذر تحليل المحتوى.",
      status: ArchiveStatus.ACTIVE 
    };
  }
};

export const askAgent = async (query: string, filesContext: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `أنت خبير أرشفة. أجب بناءً على: ${filesContext}\nالسؤال: ${query}`;
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    return response.text || "لا توجد إجابة.";
  } catch (error) {
    return "خطأ في الاتصال بالذكاء الاصطناعي.";
  }
};