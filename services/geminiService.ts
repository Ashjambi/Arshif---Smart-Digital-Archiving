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
  retries = 3,
  delay = 2000,
  factor = 2
): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const isOverloaded = error?.status === 503 || error?.code === 503 || (error?.message && error.message.includes('high demand'));
    if (retries > 0 && isOverloaded) {
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
  // تهيئة المحرك داخل الدالة لتفادي أخطاء مفتاح API عند بدء التطبيق
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `أنت خبير أرشفة رقمية محترف (ISO 15489). حلل هذا المستند واستخرج البيانات التالية بدقة من محتواه:
  - اسم الملف: ${fileName}
  - المحتوى المستخرج: ${content.substring(0, 4000)}
  
  المطلوب استخراج الحقول التالية (باللغة العربية):
  1. sender: المرسل (الجهة أو الشخص المرسل)
  2. recipient: إلى (المستلم الرئيسي)
  3. cc: نسخة إلى (الجهات المذكورة للعلم)
  4. title: موضوع المعاملة (ملخص دقيق جداً للمحتوى)
  5. category: التصنيف الموضوعي (مثال: مالي، إداري، شؤون موظفين، فني)
  6. documentType: نوع المعاملة (اختر من القائمة المتاحة)
  7. incomingNumber: رقم القيد أو الوارد المكتوب على الخطاب
  8. outgoingNumber: رقم الصادر المكتوب على الخطاب (إن وجد)
  9. description: وصف موجز للسياق الإداري
  10. importance: الأهمية (عادي، مهم، عالي الأهمية، حرج)
  11. confidentiality: السرية (عام، داخلي، سري، سري للغاية)

  قارن مع سياق الأرشيف المتاح لإيجاد أي روابط منطقية:
  ${otherFilesSummary}`;

  try {
    const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
      model: "gemini-3-pro-preview",
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
            entity: { type: Type.STRING },
            year: { type: Type.NUMBER },
            importance: { type: Type.STRING },
            confidentiality: { type: Type.STRING },
          },
          required: ["title", "documentType", "importance", "confidentiality"],
        }
      }
    }));
    const result = extractJson(response.text || "{}");
    return { ...result, status: ArchiveStatus.ACTIVE, createdAt: new Date().toISOString() };
  } catch (error) {
    return { title: fileName, documentType: DocumentType.OTHER };
  }
};

export const askAgent = async (query: string, filesContext: string, currentFileText?: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `أنت "خبير الأرشفة الاستراتيجي"، وكيل ذكي ملم بمعايير ISO 15489 وإجراءات الحوكمة الرقمية. لديك ذاكرة قوية تمكنك من الربط بين المعاملات بناءً على أرقامها ومواضيعها.
  
  السياق المتاح من الأرشيف:
  ${filesContext}
  
  ${currentFileText ? `سياق المستند الذي يناقشه المستخدم حالياً: \n${currentFileText}` : "لا يوجد مستند محدد مفتوح حالياً."}

  تعليمات الرد الاحترافي:
  1. كن رسمياً، دقيقاً، واستخدم مصطلحات إدارية فصحى.
  2. ابحث في "رقم الوارد" و "رقم الصادر" و "الموضوع" للإجابة عن الاستفسارات.
  3. اربط المستندات ببعضها (مثال: "بالإشارة إلى الخطاب الوارد رقم...، يتبين أن هذه المعاملة مرتبطة بـ...").
  4. استدل بنصوص مباشرة من محتوى المستندات (OCR) لتعزيز موثوقية إجابتك.
  5. اقترح تصنيفات أو سياسات حفظ إذا شعرت بوجود خلل في الأرشفة.

  استعلام المستخدم: ${query}`;

  try {
    const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
    }));
    return response.text || "عذراً، لم أتمكن من صياغة إجابة دقيقة حالياً.";
  } catch (error) {
    return "نعتذر، واجهنا مشكلة تقنية في محرك الذكاء الاصطناعي. يرجى المحاولة لاحقاً.";
  }
};