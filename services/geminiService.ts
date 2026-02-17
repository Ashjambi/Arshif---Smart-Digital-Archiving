
import { GoogleGenAI, Type } from "@google/genai";
import { ArchiveStatus, ISOMetadata, DocumentType } from "../types";

/**
 * Helper to extract the first valid JSON object from a string.
 * It counts braces to handle nested objects and ignores braces inside strings.
 * This fixes errors where the model outputs multiple JSON objects or trailing text.
 */
const extractFirstJSON = (text: string): string => {
  const startIndex = text.indexOf('{');
  if (startIndex === -1) return "{}";
  
  let braceCount = 0;
  let inString = false;
  let isEscaped = false;
  
  for (let i = startIndex; i < text.length; i++) {
    const char = text[i];
    
    if (isEscaped) {
      isEscaped = false;
      continue;
    }
    
    if (char === '\\') {
      isEscaped = true;
      continue;
    }
    
    if (char === '"') {
      inString = !inString;
      continue;
    }
    
    if (!inString) {
      if (char === '{') braceCount++;
      else if (char === '}') {
        braceCount--;
        if (braceCount === 0) {
          return text.substring(startIndex, i + 1);
        }
      }
    }
  }
  // Fallback: If braces aren't balanced, try to just grab everything up to the last brace
  return text.substring(startIndex, text.lastIndexOf('}') + 1);
};

/**
 * Helper to retry Gemini API calls on 503/429 errors with exponential backoff.
 */
async function generateContentWithRetry(ai: GoogleGenAI, params: any, retries = 3, delay = 2000): Promise<any> {
  try {
    return await ai.models.generateContent(params);
  } catch (error: any) {
    // Check for common temporary error codes
    const isOverloaded = error?.status === 503 || error?.code === 503 || error?.message?.includes('503');
    const isRateLimited = error?.status === 429 || error?.code === 429;
    
    if (retries > 0 && (isOverloaded || isRateLimited)) {
      console.warn(`Gemini API busy/rate-limited (${error.status || error.code || '503'}), retrying in ${delay}ms... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return generateContentWithRetry(ai, params, retries - 1, delay * 2);
    }
    throw error;
  }
}

/**
 * Deep analysis of a specific document for ISO 15489 classification
 * Updated to extract rich structured data directly formatted into the executive summary
 */
export const analyzeSpecificFile = async (
  fileName: string, 
  content: string,
  archiveContext?: string,
  siblings?: string[]
): Promise<Partial<ISOMetadata>> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `أنت خبير أرشفة ومحلل وثائق استراتيجي.
  مهمتك: تحليل الملف بدقة واستخراج البيانات الهيكلية، ثم بناء "ملخص تنفيذي" منسق.

  ⚠️ **تعليمات هامة جداً للترويسة والأرقام (Header Analysis):**
  ابحث بدقة عالية في الجزء العلوي من النص (أو البيانات المستخرجة) عن:
  1. **رقم المعاملة (Transaction Number)**: غالباً يظهر بجانب شعار (مثل jedco أو SGS) بصيغة "رقم المعاملة : XXXXX". خزنه في الحقل \`incomingNumber\`.
  2. **وارد خارجي / رقم خارجي (External Ref)**: يظهر بصيغة "وارد خارجي : XXXXX". خزنه في الحقل \`outgoingNumber\` (سنستخدم هذا الحقل للرقم المرجعي الخارجي).
  3. **تاريخ المعاملة**: يظهر بصيغة هجرية أو ميلادية (مثل 2026/02/01). خزنه في الحقل \`fullDate\`.

  اسم الملف: ${fileName}
  المحتوى:
  ---
  ${content.substring(0, 30000)}
  ---
  
  المطلوب:
  1. استخراج الحقول الوصفية بدقة.
  2. بناء نص "executiveSummary" منسق كالتالي:

  📋 الملخص التنفيذي
  ━━━━━━━━━━━━━━━━━━━━━━
  📌 رقم المعاملة: [incomingNumber]
  📎 الرقم الخارجي: [outgoingNumber أو "لا يوجد"]
  📅 تاريخ المعاملة: [fullDate]
  📤 الجهة المرسلة: [sender]
  📥 الجهة المستقبلة: [recipient]
  ⏰ الأهمية: [عادي/مهم/حرج]

  ━━━━━━━━━━━━━━━━━━━━━━
  📝 الموضوع:
  [وصف موجز للموضوع]

  ━━━━━━━━━━━━━━━━━━━━━━
  💡 النقاط الرئيسية:
  • [نقطة 1]
  • [نقطة 2]

  ━━━━━━━━━━━━━━━━━━━━━━
  ✅ الإجراء المطلوب:
  [الإجراء الواجب اتخاذه]
  
  👤 المسؤول: [اسم أو منصب]
  ⏳ الموعد: [تاريخ أو لا يوجد]

  ━━━━━━━━━━━━━━━━━━━━━━
  💰 الآثار المالية:
  [المبلغ أو لا يوجد]
  ━━━━━━━━━━━━━━━━━━━━━━

  قم بإرجاع النتيجة بصيغة JSON فقط تحتوي على:
  title, description, executiveSummary, documentType, importance, confidentiality, sender, recipient, incomingNumber, outgoingNumber, fullDate, year, retentionPolicy
  `;

  try {
    const response = await generateContentWithRetry(ai, {
      model: "gemini-3-flash-preview", 
      contents: prompt,
      config: {
        systemInstruction: "أنت محرك تحليل بيانات OCR دقيق. استخرج أرقام المعاملات والتواريخ كما هي مكتوبة في المستند تماماً. تجاهل الأحرف غير المفهومة وركز على البيانات الجوهرية.",
        responseMimeType: "application/json"
      }
    });
    
    let text = response.text || "{}";

    // CLEANUP
    text = text.replace(/```json/g, "").replace(/```/g, "");
    const jsonString = extractFirstJSON(text);
    const result = JSON.parse(jsonString);
    
    return { 
      ...result, 
      status: ArchiveStatus.ACTIVE, 
      updatedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error("Deep Analysis error:", error);
    return {
        title: fileName,
        description: "فشل التحليل الذكي",
        executiveSummary: "تعذر إنشاء الملخص بسبب خطأ في الخادم (503) أو البيانات.",
        status: ArchiveStatus.IN_PROCESS
    };
  }
};

export const askAgent = async (query: string, archiveContext: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const response = await generateContentWithRetry(ai, {
      model: "gemini-3-flash-preview", 
      contents: `
لديك صلاحية الوصول الكامل لمحتوى الأرشيف أدناه.
اعتمد بشكل أساسي على "الملخص التنفيذي" الغني بالمعلومات للإجابة.

--- الأرشيف ---
${archiveContext}
--- نهاية الأرشيف ---

سؤال المستخدم: ${query}
`,
      config: {
        temperature: 0.3, 
        systemInstruction: `
أنت المساعد الذكي لنظام الأرشفة.
استخدم البيانات الموجودة في الملخصات التنفيذية (مثل الإجراء المطلوب، المبالغ المالية، المواعيد) لتقديم إجابات دقيقة جداً.

⚠️ **بروتوكول تسليم الملفات (File Delivery Protocol):**
إذا طلب المستخدم صراحة "تحميل" أو "إرسال" أو "الحصول على نسخة" من ملف معين، وتأكدت من وجود الملف في الأرشيف:
1. رد برسالة تأكيدية قصيرة جداً (مثال: "جاري تحضير ملف [الاسم] للإرسال...").
2. في نهاية ردك، يجب أن تضع هذا الكود السري بدقة: [[DOWNLOAD:RecordID]]
حيث RecordID هو معرف السجل (مثل ARC-2024-5021) أو معرف الملف (id).
لا تضع هذا الكود إلا إذا طلب المستخدم الملف بوضوح.
`
      }
    });
    return response.text || "عذراً، لم أستطع تحليل الطلب.";
  } catch (error) {
    console.error("Agent Chat error:", error);
    return "نواجه ضغطاً عالياً على الخوادم حالياً (503). يرجى المحاولة مرة أخرى بعد قليل.";
  }
};

export const classifyFileContent = analyzeSpecificFile;
