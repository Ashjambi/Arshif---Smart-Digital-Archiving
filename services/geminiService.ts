
import { GoogleGenAI, Type } from "@google/genai";
import { ArchiveStatus, ISOMetadata, DocumentType } from "../types";

/**
 * دالة لاستخراج JSON بشكل احترافي من استجابة النموذج لتفادي الأخطاء النصية
 */
const extractFirstJSON = (text: string): string => {
  if (!text) return "{}";
  // البحث عن أول قوس فتح وآخر قوس إغلاق
  const startIndex = text.indexOf('{');
  const lastIndex = text.lastIndexOf('}');
  
  if (startIndex === -1 || lastIndex === -1 || lastIndex < startIndex) return "{}";
  
  return text.substring(startIndex, lastIndex + 1);
};

/**
 * دالة طلب مع إعادة محاولة ذكية في حالة ضغط الخادم أو أخطاء الشبكة
 */
async function generateWithRetry(params: any, retries = 3): Promise<any> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent(params);
    return response;
  } catch (error: any) {
    console.error("Gemini API Error Detail:", error);
    if (retries > 0 && (error.status === 503 || error.status === 429 || error.status === 500)) {
      await new Promise(r => setTimeout(r, 2000));
      return generateWithRetry(params, retries - 1);
    }
    throw error;
  }
}

/**
 * تصنيف نوع الوثيقة بناءً على الكلمات المفتاحية
 */
export const classifyFileContent = async (content: string): Promise<string> => {
  try {
    const response = await generateWithRetry({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: `صنف نوع الوثيقة بناءً على محتواها إلى (عقد، مراسلة، فاتورة، تقرير، نموذج، سياسة، أخرى). أجب بكلمة واحدة فقط:\n\n${content.substring(0, 1500)}` }] }],
    });
    return response.text?.trim() || "أخرى";
  } catch (error) {
    return "أخرى";
  }
};

/**
 * التحليل العميق للوثائق واستخراج البيانات الوصفية بمعيار ISO 15489
 */
export const analyzeSpecificFile = async (
  fileName: string, 
  contentOrBase64: string,
  mimeType?: string,
  isBinary: boolean = false
): Promise<Partial<ISOMetadata>> => {
  // تعليمات صارمة للنموذج لضمان الحصول على JSON صحيح ومحتوى عربي دقيق
  const promptText = `
  بصفتك خبير أرشفة رقمية (معيار ISO 15489)، قم بتحليل الوثيقة المرفقة واستخرج البيانات التالية بصيغة JSON فقط:
  1. title: عنوان رسمي ومناسب للوثيقة.
  2. description: وصف موجز جداً (سطر واحد).
  3. executiveSummary: ملخص تنفيذي مفصل يشرح جوهر المعاملة، الأطراف المعنية، الإجراءات المطلوبة، والتواريخ الهامة.
  4. documentType: (عقد، مراسلة واردة، مراسلة صادرة، فاتورة، تقرير، نموذج، سياسة/إجراء، أخرى).
  5. sender: اسم الجهة المرسلة.
  6. recipient: اسم الجهة المستلمة.
  7. incomingNumber: رقم الوارد إن وجد.
  8. outgoingNumber: رقم الصادر إن وجد.
  9. fullDate: التاريخ المذكور في الوثيقة (YYYY-MM-DD).
  10. importance: (عادي، مهم، عالي الأهمية، حرج).
  11. confidentiality: (عام، داخلي، سري، سري للغاية).
  12. entity: الجهة التابع لها الخطاب.
  
  اسم الملف: ${fileName}
  `;

  const parts: any[] = isBinary && mimeType 
    ? [{ inlineData: { mimeType, data: contentOrBase64 } }, { text: promptText }]
    : [{ text: promptText }, { text: `محتوى النص المستخرج:\n${contentOrBase64.substring(0, 35000)}` }];

  try {
    const response = await generateWithRetry({
      model: "gemini-3-pro-preview", // استخدام برو لضمان دقة تحليل الخطابات المعقدة
      contents: [{ parts }],
      config: { 
        responseMimeType: "application/json",
        systemInstruction: "أنت نظام خبير في تحليل الخطابات والمراسلات الرسمية واستخراج البيانات الوصفية بدقة متناهية باللغة العربية."
      }
    });
    
    const jsonStr = extractFirstJSON(response.text || "{}");
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error("Critical AI Analysis Error:", error);
    // العودة ببيانات وصفية أساسية في حالة الفشل
    return {
      title: fileName,
      description: "فشل التحليل التلقائي للملف.",
      executiveSummary: "لم يتمكن الذكاء الاصطناعي من قراءة محتوى هذا الملف بشكل صحيح. يرجى التأكد من وضوح النص أو الملف."
    };
  }
};

/**
 * الرد على استفسارات تليجرام والدردشة المباشرة
 */
export const askAgent = async (query: string, archiveContext: string): Promise<string> => {
  try {
    const response = await generateWithRetry({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: `سياق الأرشيف الحالي (قائمة الملفات):\n${archiveContext}\n\nاستفسار المستخدم: ${query}` }] }],
      config: {
        systemInstruction: `أنت مساعد "أرشيف PRO" الذكي. مهمتك هي:
        1. الرد على استفسارات المستخدمين حول الملفات الموجودة في الأرشيف باللغة العربية.
        2. كن مهنياً، دقيقاً، ومختصراً في ردودك.
        3. إذا طلب المستخدم "تحميل" أو "إرسال" ملف، قم بالبحث عن الملف في السياق، وإذا وجدته، أضف في نهاية ردك الكود التالي: [[DOWNLOAD:ID_OR_RECORDID]]
        4. إذا لم تجد المعلومة في السياق، أخبر المستخدم بكل أدب أن المعلومة غير متوفرة في الأرشيف الحالي.`
      }
    });
    return response.text || "عذراً، لم أتمكن من استيعاب الطلب، هل يمكنك إعادة الصياغة؟";
  } catch (error) {
    console.error("Telegram Agent Error:", error);
    return "عذراً، الوكيل الذكي يواجه ضغطاً حالياً. يرجى المحاولة مرة أخرى لاحقاً.";
  }
};

/**
 * بث الرد المباشر (Streaming) للواجهة الرسومية
 */
export async function* askAgentStream(query: string, archiveContext: string) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const responseStream = await ai.models.generateContentStream({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: `سياق الأرشيف:\n${archiveContext}\n\nالسؤال: ${query}` }] }],
      config: { 
        systemInstruction: "أنت مساعد أرشيف PRO ذكي. أجب باللغة العربية بوضوح." 
      }
    });
    for await (const chunk of responseStream) {
      yield chunk.text;
    }
  } catch (error) {
    yield "خطأ في الاتصال بالوكيل الذكي.";
  }
}
