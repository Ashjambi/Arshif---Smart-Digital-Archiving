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
  retries = 2,
  delay = 1000,
  factor = 2
): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    if (retries > 0) {
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
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `أنت محرك فهرسة ذكي (ISO 15489). حلل المستند:
  - الاسم: ${fileName}
  - المحتوى: ${content.substring(0, 3000)}
  
  استخرج JSON بالحقول: 
  title (عنوان مهني), description (ملخص تنفيذي للمحتوى), sender (المرسل), recipient (المستلم), cc, category, incomingNumber, outgoingNumber, documentType, importance (عادي، مهم، حرج), confidentiality (عام، سري).
  
  السياق السابق: ${otherFilesSummary.substring(0, 500)}`;

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
            cc: { type: Type.STRING },
            category: { type: Type.STRING },
            incomingNumber: { type: Type.STRING },
            outgoingNumber: { type: Type.STRING },
            documentType: { type: Type.STRING },
            importance: { type: Type.STRING },
            confidentiality: { type: Type.STRING },
          },
          required: ["title", "documentType"],
        }
      }
    }));
    const result = extractJson(response.text || "{}");
    return { ...result, status: ArchiveStatus.ACTIVE, createdAt: new Date().toISOString() };
  } catch (error) {
    console.error("Classification error:", error);
    return { title: fileName, documentType: DocumentType.OTHER };
  }
};

export const askAgent = async (query: string, filesContext: string, currentFileText?: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `أنت "خبير الأرشفة الاستراتيجي". أجب بدقة بناءً على الأرشيف التالي:
  ${filesContext}
  ${currentFileText ? `\nالمستند الحالي: ${currentFileText}` : ""}
  المستخدم يسأل: ${query}`;

  try {
    const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    }));
    return response.text || "عذراً، لا توجد إجابة.";
  } catch (error) {
    return "حدث خطأ في الاتصال بالذكاء الاصطناعي.";
  }
};