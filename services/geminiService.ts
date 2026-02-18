
import { GoogleGenAI, Type } from "@google/genai";
import { ArchiveStatus, ISOMetadata, DocumentType } from "../types";

/**
 * دالة متقدمة جداً لتنظيف النصوص المستلمة من الذكاء الاصطناعي وتحويلها إلى JSON سليم.
 * تعالج مشاكل الرموز المخفية والنيولاينز غير المهربة.
 */
const cleanAndParseJSON = (text: string): any => {
  if (!text) return {};
  try {
    // 1. محاولة استخراج الجزء المحصور بين الأقواس فقط في حال وجود نصوص خارجية
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    let jsonContent = (firstBrace !== -1 && lastBrace !== -1) 
      ? text.substring(firstBrace, lastBrace + 1) 
      : text;

    // 2. تنظيف الرموز التي قد تكسر الـ JSON (التحكم بالرموز غير المرئية)
    jsonContent = jsonContent.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");

    return JSON.parse(jsonContent);
  } catch (e) {
    console.error("JSON Clean Parse Error:", e, "Raw Text:", text);
    // محاولة أخيرة: تنظيف يدوي للنيولاينز داخل القيم
    try {
      const fixed = text.replace(/\n/g, "\\n").replace(/\r/g, "\\r");
      return JSON.parse(fixed);
    } catch {
      return null;
    }
  }
};

/**
 * تنفيذ الطلبات مع نظام إعادة محاولة تصاعدي (Backoff) لضمان العمل في البيئات السحابية.
 */
async function generateWithRetry(params: any, retries = 3): Promise<any> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    return await ai.models.generateContent(params);
  } catch (error: any) {
    if (retries > 0 && (error.status === 429 || error.status === 503 || error.status === 500)) {
      await new Promise(r => setTimeout(r, 1500 * (4 - retries)));
      return generateWithRetry(params, retries - 1);
    }
    throw error;
  }
}

/**
 * التحليل المعياري للوثائق (ISO 15489)
 */
export const analyzeSpecificFile = async (
  fileName: string, 
  contentOrBase64: string,
  mimeType?: string,
  isBinary: boolean = false
): Promise<Partial<ISOMetadata>> => {
  const model = "gemini-3-flash-preview";
  
  const promptText = `حلل الوثيقة "${fileName}" واستخرج البيانات الوصفية كـ JSON.
  مهم جداً: اجعل قيمة executiveSummary مفصلة وشاملة باللغة العربية.
  تأكد من عدم وجود أخطاء في تنسيق JSON.`;

  const parts: any[] = isBinary && mimeType 
    ? [{ inlineData: { mimeType, data: contentOrBase64 } }, { text: promptText }]
    : [{ text: promptText }, { text: `النص المستخرج:\n${contentOrBase64.substring(0, 8000)}` }];

  try {
    const response = await generateWithRetry({
      model: model,
      contents: [{ parts }],
      config: { 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            executiveSummary: { type: Type.STRING },
            documentType: { type: Type.STRING },
            sender: { type: Type.STRING },
            recipient: { type: Type.STRING },
            incomingNumber: { type: Type.STRING },
            outgoingNumber: { type: Type.STRING },
            fullDate: { type: Type.STRING },
            importance: { type: Type.STRING },
            confidentiality: { type: Type.STRING },
            entity: { type: Type.STRING }
          },
          required: ["title", "executiveSummary"]
        },
        systemInstruction: "أنت خبير أرشفة رقمية عالمي. ردك يجب أن يكون JSON سليم بنسبة 100% ولا يحتوي على أي نصوص خارج الأقواس."
      }
    });
    
    const parsed = cleanAndParseJSON(response.text);
    if (!parsed) throw new Error("Parsing failed");
    return parsed;
  } catch (error) {
    console.error("Gemini Analysis Critical Failure:", error);
    return {
      title: fileName,
      description: "فشل التحليل الذكي.",
      executiveSummary: "لم يتمكن النظام من تحليل الوثيقة حالياً. تأكد من أن الملف يحتوي على نص مقروء وباللغة العربية، أو حاول مرة أخرى لاحقاً."
    };
  }
};

/**
 * الوكيل الذكي للدردشة والمساعدة
 */
export const askAgent = async (query: string, archiveContext: string): Promise<string> => {
  try {
    const response = await generateWithRetry({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: `سياق الأرشيف الحالي:\n${archiveContext.substring(0, 10000)}\n\nسؤال المستخدم: ${query}` }] }],
      config: {
        systemInstruction: "أنت مساعد أرشيف PRO ذكي. أجب باللغة العربية دائماً بوضوح ومصداقية. إذا سأل المستخدم عن ملف موجود، اذكر تفاصيله وأضف كود [[DOWNLOAD:ID]] للتحميل."
      }
    });
    return response.text || "المعذرة، لم أتمكن من معالجة الطلب حالياً.";
  } catch (error) {
    return "عذراً، يواجه الوكيل الذكي ضغطاً في الطلبات حالياً.";
  }
};

export async function* askAgentStream(query: string, archiveContext: string) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const responseStream = await ai.models.generateContentStream({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: `الأرشيف:\n${archiveContext}\n\nسؤال: ${query}` }] }],
      config: { systemInstruction: "أنت مساعد أرشيف PRO ذكي ومختصر باللغة العربية." }
    });
    for await (const chunk of responseStream) yield chunk.text;
  } catch {
    yield "خطأ في الاتصال بالوكيل الذكي.";
  }
}

export const classifyFileContent = async (content: string): Promise<string> => {
  try {
    const response = await generateWithRetry({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: `صنف نوع الوثيقة بكلمة واحدة فقط: ${content.substring(0, 400)}` }] }],
    });
    return response.text?.trim() || "أخرى";
  } catch {
    return "أخرى";
  }
};
