
import { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { ArchiveStatus, ISOMetadata, DocumentType } from "../types";

// Helper to safely access API Key without crashing if process is undefined
const getApiKey = (): string => {
  try {
    // @ts-ignore
    const key = process.env.GEMINI_API_KEY || process.env.API_KEY || "";
    if (!key) {
      console.warn("API Key is missing or empty");
    } else {
      console.log("API Key found (length):", key.length);
    }
    return key;
  } catch (e) {
    console.error("API Key Access Error:", e);
    return "";
  }
};

/**
 * Strict JSON parsing with fallback cleanup
 */
const parseGeminiJSON = (text: string): any => {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (e) {
    try {
      // Remove code blocks
      let clean = text.replace(/```json/g, "").replace(/```/g, "").trim();
      // Find JSON object
      const firstBrace = clean.indexOf('{');
      const lastBrace = clean.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        clean = clean.substring(firstBrace, lastBrace + 1);
        return JSON.parse(clean);
      }
      return null;
    } catch (finalError) {
      console.error("JSON Parse Failed. Raw Text:", text);
      return null;
    }
  }
};

const retryOperation = async <T>(operation: () => Promise<T>, retries = 2, delay = 2000): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    if (retries <= 0) throw error;
    await new Promise(resolve => setTimeout(resolve, delay));
    return retryOperation(operation, retries - 1, delay * 2);
  }
};

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

export const analyzeSpecificFile = async (
  fileName: string, 
  contentOrBase64: string,
  mimeType?: string,
  isBinary: boolean = false
): Promise<Partial<ISOMetadata>> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("API_KEY غير موجود. يرجى تحديد مفتاح API.");
  }

  const ai = new GoogleGenAI({ apiKey });
  
  // Use Flash as primary for speed, Pro as fallback for depth if needed
  const models = ["gemini-3-flash-preview", "gemini-3.1-pro-preview"];
  
  const promptText = `
  أنت خبير أرشفة رقمية ومحلل وثائق استراتيجي. قم بإجراء تحليل معمق للملف المرفق "${fileName}" لإنتاج ملخص تنفيذي رفيع المستوى.
  
  المهام المطلوبة:
  1. **العنوان الرسمي**: استخلص المسمى الوثائقي الدقيق (مثلاً: تعميم إداري، قرار وزاري، محضر اجتماع).
  2. **الملخص التنفيذي**: اكتب ملخصاً احترافياً بأسلوب "نقاط القوة والقرار". يجب أن يتضمن:
     - الغرض الأساسي من الوثيقة.
     - القرارات أو التوجيهات الرئيسية.
     - الجهات المعنية والإجراءات المطلوبة.
     - أي تواريخ نهائية أو التزامات قانونية.
  3. **التصنيف**: حدد نوع الوثيقة (خطاب رسمي، تعميم، تقرير فني، إلخ).
  4. **الأطراف**: حدد الجهة المصدرة (المرسل) والجهة الموجه إليها (المستلم).
  5. **البيانات المرجعية**: استخرج التاريخ ورقم القيد بدقة.
  6. **التقييم**: حدد درجة الأهمية (عادي، مهم، سري) بناءً على حساسية المحتوى.
  
  يجب أن تكون الإجابة بتنسيق JSON حصراً:
  {
    "title": "العنوان الرسمي",
    "executiveSummary": "الملخص التنفيذي الاحترافي",
    "documentType": "نوع الوثيقة",
    "sender": "الجهة المصدرة",
    "recipient": "الجهة المستلمة",
    "fullDate": "YYYY-MM-DD",
    "importance": "عادي/مهم/سري",
    "incomingNumber": "رقم القيد/الإشارة"
  }
  `;

  const parts: any[] = isBinary && mimeType 
    ? [{ inlineData: { mimeType, data: contentOrBase64 } }, { text: promptText }]
    : [{ text: promptText }, { text: `المحتوى النصي للوثيقة:\n${contentOrBase64.substring(0, 100000)}` }];

  for (const modelName of models) {
    try {
      const generate = async () => {
        return await ai.models.generateContent({
          model: modelName,
          contents: [{ parts }],
          config: { 
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                executiveSummary: { type: Type.STRING },
                documentType: { type: Type.STRING },
                sender: { type: Type.STRING },
                recipient: { type: Type.STRING },
                incomingNumber: { type: Type.STRING },
                fullDate: { type: Type.STRING },
                importance: { type: Type.STRING }
              },
              required: ["title", "executiveSummary"]
            },
            safetySettings: [
              { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
              { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
              { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
              { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            ]
          }
        });
      };

      const response = await retryOperation(generate);
      
      if (!response.candidates || response.candidates.length === 0) {
        continue; // Try next model if possible
      }

      if (!response.text) {
        continue;
      }

      const result = parseGeminiJSON(response.text);
      if (result) {
        return { ...result, status: ArchiveStatus.COMPLETED };
      }
    } catch (error: any) {
      const errorMsg = error.message || "";
      console.warn(`Model ${modelName} failed:`, errorMsg);
      
      // If it's a quota error and we have more models, continue
      if ((errorMsg.includes("429") || errorMsg.includes("quota")) && modelName !== models[models.length - 1]) {
        console.log("Quota exceeded for Pro, falling back to Flash...");
        continue;
      }
      
      // If it's the last model or not a quota error, handle it
      if (modelName === models[models.length - 1]) {
          let userFriendlyError = "⚠️ فشل التحليل الذكي.";
          if (errorMsg.includes("429") || errorMsg.includes("quota")) {
              userFriendlyError = "⚠️ انتهت حصة الاستخدام (Quota) لمفتاح API الخاص بك. يرجى التحقق من خطة الدفع أو المحاولة لاحقاً.";
          } else if (errorMsg.includes("Safety")) {
              userFriendlyError = "⚠️ تم حظر المحتوى لأسباب أمنية.";
          }
          
          return {
            title: fileName,
            executiveSummary: userFriendlyError,
            status: ArchiveStatus.ERROR
          };
      }
    }
  }

  return {
    title: fileName,
    executiveSummary: "⚠️ فشل التحليل: لم يتمكن النظام من معالجة الملف باستخدام النماذج المتاحة.",
    status: ArchiveStatus.ERROR
  };
};

export const askAgent = async (query: string, archiveContext: string): Promise<string> => {
  const apiKey = getApiKey();
  if (!apiKey) return "خطأ: مفتاح API غير موجود في النظام.";
  
  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: `أنت مساعد ذكي لأرشفة الملفات. استخدم السياق التالي للإجابة على سؤال المستخدم بدقة واحترافية.
      
      هام جداً:
      إذا كان المستخدم يطلب ملفاً محدداً أو يسأل عن محتوى ملف معين، ووجدت هذا الملف في السياق، يجب عليك إضافة الوسم التالي في نهاية إجابتك: [[DOWNLOAD:ID]] حيث ID هو معرف الملف من السياق.
      لا تطلب من المستخدم تزويدك بالمعرف، بل استخرجه بنفسك من السياق إذا تطابق الوصف.
      
      السياق:
      ${archiveContext}
      
      سؤال المستخدم: ${query}` }] }]
    });
    
    if (!response || !response.text) {
        return "⚠️ لم يتمكن المحرك من توليد إجابة حالياً.";
    }
    
    return response.text;
  } catch (e: any) {
    console.error("Agent Error Details:", e);
    // Return detailed error to help user debug
    return `⚠️ حدث خطأ في محرك الذكاء الاصطناعي:
السبب: ${e.message || "خطأ غير معروف"}
الموديل: gemini-3-flash-preview`;
  }
};

export async function* askAgentStream(query: string, archiveContext: string) {
  const apiKey = getApiKey();
  if (!apiKey) { yield "⚠️ مفتاح API غير موجود."; return; }
  
  const ai = new GoogleGenAI({ apiKey });
  try {
    const stream = await ai.models.generateContentStream({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: `أنت مساعد ذكي لأرشفة الملفات. استخدم السياق التالي للإجابة على سؤال المستخدم بدقة واحترافية باللغة العربية.\n\nالسياق:\n${archiveContext}\n\nسؤال المستخدم: ${query}` }] }]
    });
    for await (const chunk of stream) {
      if (chunk.text) yield chunk.text;
    }
  } catch (e: any) {
    console.error("Stream Agent Error:", e);
    yield `⚠️ خطأ في الاتصال بالمحرك: ${e.message || "خطأ غير معروف"}`;
  }
}
