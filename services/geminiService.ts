import { GoogleGenAI, Type } from "@google/genai";
import { ArchiveStatus, ISOMetadata } from "../types";

// Helper function to extract and parse JSON from model output
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
 * Classifies file content using Gemini AI based on ISO 15489 archiving standards.
 */
export const classifyFileContent = async (
  fileName: string, 
  content: string,
  archiveSummary?: string,
  siblings?: string[]
): Promise<Partial<ISOMetadata>> => {
  // Always initialize GoogleGenAI with a named parameter as per guidelines.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Construct a prompt optimized for ISO 15489 metadata extraction with available context.
  let prompt = `أرشفة ISO 15489 للمستند: ${fileName}. المحتوى المستخرج: ${content.substring(0, 1500)}.`;
  if (archiveSummary) prompt += `\nسياق الأرشيف الحالي: ${archiveSummary}`;
  if (siblings && siblings.length > 0) prompt += `\nالملفات ذات الصلة في المجلد: ${siblings.join(', ')}`;
  prompt += `\nأرجع JSON فقط: {title, description, sender, recipient, category, documentType, importance, confidentiality}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        // Setting thinkingBudget to 0 for rapid classification response as per guidelines for Gemini 3 models.
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
    
    // Use .text property to access content directly from GenerateContentResponse.
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
      description: "تمت الفهرسة السريعة بالاسم نتيجة خطأ في المعالجة الآلية.",
      status: ArchiveStatus.ACTIVE 
    };
  }
};

/**
 * Answers questions about the archive using the context provided from the file records.
 */
export const askAgent = async (query: string, filesContext: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `أنت مساعد أرشفة ذكي. السياق:\n${filesContext}\nالسؤال: ${query}`;
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    // Use .text property directly as recommended.
    return response.text || "لا توجد إجابة متاحة بناءً على السياق الحالي.";
  } catch (error) {
    console.error("AI Agent error:", error);
    return "حدث خطأ أثناء الاتصال بمحرك الذكاء الاصطناعي.";
  }
};
