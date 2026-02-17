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

export const classifyFileContent = async (
  fileName: string, 
  content: string
): Promise<Partial<ISOMetadata>> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // استخدام برومبت مباشر ومختصر جداً لتسريع الاستجابة
  const prompt = `أرشفة ISO 15489 للمستند: ${fileName}. المحتوى: ${content.substring(0, 1500)}. 
  أرجع JSON فقط: {title, description, sender, recipient, category, documentType, importance, confidentiality}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        // تعطيل ميزانية التفكير لزيادة السرعة (Flash Mode)
        thinkingConfig: { thinkingBudget: 0 },
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
    });
    
    const result = extractJson(response.text || "{}");
    return { 
      ...result, 
      status: ArchiveStatus.ACTIVE, 
      updatedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error("Fast classification failed:", error);
    return { 
      title: fileName, 
      description: "تمت الفهرسة السريعة بالاسم.",
      status: ArchiveStatus.ACTIVE 
    };
  }
};

export const askAgent = async (query: string, filesContext: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `أنت خبير أرشفة. السياق: ${filesContext}\nالسؤال: ${query}`;
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