
import { GoogleGenAI, Type } from "@google/genai";
import { ArchiveStatus, ISOMetadata, DocumentType } from "../types";

/**
 * دالة لتنظيف الرد في حالة وجود زوائد نصية خارج الـ JSON
 */
const cleanJsonResponse = (text: string): string => {
  if (!text) return "{}";
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
    return text.substring(firstBrace, lastBrace + 1);
  }
  return text.trim();
};

/**
 * دالة تنفيذ الطلبات مع نظام إعادة المحاولة لضمان استمرارية الخدمة.
 */
async function generateWithRetry(params: any, retries = 3): Promise<any> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    return await ai.models.generateContent(params);
  } catch (error: any) {
    console.error("Gemini API Error:", error?.message || error);
    if (retries > 0 && (error.status === 503 || error.status === 429 || error.status === 500)) {
      await new Promise(r => setTimeout(r, 2000));
      return generateWithRetry(params, retries - 1);
    }
    throw error;
  }
}

/**
 * التحليل المعياري للوثائق (ISO 15489) باستخدام Schema لضمان دقة الـ JSON
 */
export const analyzeSpecificFile = async (
  fileName: string, 
  contentOrBase64: string,
  mimeType?: string,
  isBinary: boolean = false
): Promise<Partial<ISOMetadata>> => {
  const model = "gemini-3-flash-preview";
  
  const promptText = `قم بتحليل الوثيقة "${fileName}" واستخرج البيانات بدقة متناهية وفق معايير الأرشفة الدولية.`;

  const parts: any[] = isBinary && mimeType 
    ? [{ inlineData: { mimeType, data: contentOrBase64 } }, { text: promptText }]
    : [{ text: promptText }, { text: `محتوى النص المستخرج:\n${contentOrBase64.substring(0, 15000)}` }];

  try {
    const response = await generateWithRetry({
      model: model,
      contents: [{ parts }],
      config: { 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "عنوان رسمي للوثيقة" },
            description: { type: Type.STRING, description: "وصف موجز جداً" },
            executiveSummary: { type: Type.STRING, description: "ملخص تنفيذي شامل يشرح المحتوى والأطراف" },
            documentType: { type: Type.STRING, description: "نوع الوثيقة (عقد، مراسلة، فاتورة، تقرير، إلخ)" },
            sender: { type: Type.STRING, description: "الجهة المرسلة" },
            recipient: { type: Type.STRING, description: "الجهة المستلمة" },
            incomingNumber: { type: Type.STRING, description: "رقم الوارد" },
            outgoingNumber: { type: Type.STRING, description: "رقم الصادر" },
            fullDate: { type: Type.STRING, description: "التاريخ بتنسيق YYYY-MM-DD" },
            importance: { type: Type.STRING, description: "عادي، مهم، حرج" },
            confidentiality: { type: Type.STRING, description: "عام، داخلي، سري" },
            entity: { type: Type.STRING, description: "الجهة التابع لها" }
          },
          required: ["title", "executiveSummary", "documentType"]
        },
        systemInstruction: "أنت محرك ذكاء اصطناعي متخصص في الأرشفة وتصنيف الخطابات الرسمية. يجب أن يكون الرد JSON متوافقاً تماماً مع المخطط المطلوب."
      }
    });
    
    const resultText = cleanJsonResponse(response.text || "{}");
    return JSON.parse(resultText);
  } catch (error) {
    console.error("AI Analysis Parse Error:", error);
    return {
      title: fileName,
      description: "حدث خطأ أثناء تحليل البيانات.",
      executiveSummary: "لم نتمكن من تحليل الوثيقة بشكل كامل. يرجى التأكد من أن الملف يحتوي على نص واضح أو تجربة ملف آخر."
    };
  }
};

/**
 * الوكيل الذكي للرد على التفاعلات
 */
export const askAgent = async (query: string, archiveContext: string): Promise<string> => {
  try {
    const response = await generateWithRetry({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: `سياق الأرشيف المتوفر حالياً:\n${archiveContext.substring(0, 18000)}\n\nسؤال المستخدم: ${query}` }] }],
      config: {
        systemInstruction: "أنت مساعد أرشيف PRO. أجب باللغة العربية بوضوح ومهنية. إذا طلب المستخدم ملفاً محدداً موجوداً في السياق، اذكر اسمه بوضوح وأضف الكود [[DOWNLOAD:ID]] حيث ID هو معرف الملف."
      }
    });
    return response.text || "لم أتمكن من العثور على إجابة دقيقة حالياً.";
  } catch (error) {
    return "عذراً، يواجه النظام ضغطاً حالياً في معالجة طلبات الدردشة.";
  }
};

export async function* askAgentStream(query: string, archiveContext: string) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const responseStream = await ai.models.generateContentStream({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: `الأرشيف:\n${archiveContext}\n\nسؤال: ${query}` }] }],
      config: { systemInstruction: "أنت مساعد أرشيف PRO ذكي ومختصر." }
    });
    for await (const chunk of responseStream) yield chunk.text;
  } catch {
    yield "خطأ في الاتصال بالوكيل.";
  }
}

export const classifyFileContent = async (content: string): Promise<string> => {
  try {
    const response = await generateWithRetry({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: `صنف نوع الوثيقة بكلمة واحدة فقط: ${content.substring(0, 500)}` }] }],
    });
    return response.text?.trim() || "أخرى";
  } catch {
    return "أخرى";
  }
};
