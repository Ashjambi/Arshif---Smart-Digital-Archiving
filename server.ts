import express from "express";
import { createServer as createViteServer } from "vite";
import cors from "cors";
import ZAI from 'z-ai-web-dev-sdk';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));

  // Initialize ZI AI
  let zai: any = null;
  try {
    zai = await ZAI.create();
    console.log("✅ ZI AI initialized successfully");
  } catch (e) {
    console.error("Failed to initialize ZI AI:", e);
  }

  // --- Webhook Logic ---
  const pendingUpdates: any[] = [];

  app.post("/api/telegram-webhook", (req, res) => {
    try {
      const update = req.body;
      console.log("--- Webhook Received ---", JSON.stringify(update, null, 2));
      
      if (update.message || update.channel_post) {
        pendingUpdates.push(update);
        if (pendingUpdates.length > 50) pendingUpdates.shift();
      }
      
      res.status(200).send("OK");
    } catch (e) {
      console.error("Webhook Error:", e);
      res.status(200).send("OK");
    }
  });

  app.get("/api/telegram-updates", (req, res) => {
    const updates = [...pendingUpdates];
    pendingUpdates.length = 0;
    res.json(updates);
  });

  // --- End Webhook Logic ---

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", ai: zai ? "connected" : "disconnected" });
  });

  // --- AI Endpoints ---
  
  // Chat completion endpoint
  app.post("/api/ai/chat", async (req, res) => {
    try {
      if (!zai) {
        return res.status(503).json({ error: "AI service not available" });
      }

      const { messages, systemPrompt } = req.body;
      
      const formattedMessages = [];
      if (systemPrompt) {
        formattedMessages.push({ role: 'system', content: systemPrompt });
      }
      
      for (const msg of messages || []) {
        formattedMessages.push({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.content || msg.text
        });
      }

      const completion = await zai.chat.completions.create({
        messages: formattedMessages,
        temperature: 0.1,
      });

      const responseText = completion.choices[0]?.message?.content || "";
      res.json({ success: true, response: responseText });
    } catch (e: any) {
      console.error("Chat Error:", e);
      res.status(500).json({ error: e.message || "AI request failed" });
    }
  });

  // File analysis endpoint
  app.post("/api/ai/analyze", async (req, res) => {
    try {
      if (!zai) {
        return res.status(503).json({ error: "AI service not available" });
      }

      const { fileName, content, mimeType, isBinary } = req.body;
      
      const systemPrompt = `أنت خبير أرشفة رقمية ومحلل وثائق استراتيجي. قم بإجراء تحليل معمق للملف المرفق "${fileName}" لإنتاج ملخص تنفيذي رفيع المستوى.

المهام المطلوبة:
1. **العنوان الرسمي**: استخلص المسمى الوثائقي الدقيق (مثلاً: تعميم إداري، قرار وزاري، محضر اجتماع).
2. **الملخص التنفيذي**: اكتب ملخصاً احترافياً بأسلوب "نقاط القوة والقرار". يجب أن يتضمن:
   - الغرض الأساسي من الوثيقة.
   - القرارات أو التوجيهات الرئيسية.
   - الجهات المعنية والإجراءات المطلوبة.
   - أي تواريخ نهائية أو التزامات قانونية.
3. **التصنيف**: حدد نوع الوثيقة (خطاب رسمي، تعميم، تقرير فني، إلخ).
4. **الأطراف**: حدد الجهة المصدرة (المرسل) والجهة الموجه إليها (المستلم).
5. **صاحب الصلاحية/الموقع**: ابحث بدقة في نهاية الوثيقة عن الشخص الذي وقع الخطاب أو أصدر القرار.
6. **البيانات المرجعية**: استخرج التاريخ ورقم القيد.
7. **التقييم**: حدد درجة الأهمية (عادي، مهم، سري) بناءً على حساسية المحتوى.

أجب بتنسيق JSON فقط:
{
  "title": "العنوان الرسمي",
  "executiveSummary": "الملخص التنفيذي",
  "documentType": "نوع الوثيقة",
  "sender": "الجهة المصدرة",
  "recipient": "الجهة المستلمة",
  "signatory": "الاسم والمنصب للموقع",
  "fullDate": "YYYY-MM-DD",
  "importance": "عادي/مهم/سري",
  "incomingNumber": "رقم القيد"
}`;

      const messages: any[] = [{ role: 'system', content: systemPrompt }];
      
      if (isBinary && content && mimeType) {
        // For binary files (PDFs, images), we'll analyze the content
        messages.push({ 
          role: 'user', 
          content: `قم بتحليل هذا الملف: ${fileName}. المحتوى (Base64): ${content.substring(0, 50000)}...` 
        });
      } else {
        messages.push({ 
          role: 'user', 
          content: `قم بتحليل هذا الملف: ${fileName}\n\nالمحتوى:\n${(content || "").substring(0, 100000)}` 
        });
      }

      const completion = await zai.chat.completions.create({
        messages,
        temperature: 0.1,
      });

      const responseText = completion.choices[0]?.message?.content || "";
      
      // Try to parse JSON from response
      let analysisResult: any = {};
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          analysisResult = JSON.parse(jsonMatch[0]);
        } else {
          analysisResult = {
            title: fileName,
            executiveSummary: responseText,
            documentType: "أخرى",
            importance: "عادي"
          };
        }
      } catch {
        analysisResult = {
          title: fileName,
          executiveSummary: responseText,
          documentType: "أخرى",
          importance: "عادي"
        };
      }

      res.json({ success: true, analysis: analysisResult });
    } catch (e: any) {
      console.error("Analysis Error:", e);
      res.status(500).json({ 
        success: false, 
        error: e.message || "Analysis failed",
        analysis: {
          title: req.body.fileName,
          executiveSummary: `⚠️ خطأ في التحليل: ${e.message}`,
          documentType: "أخرى",
          importance: "عادي"
        }
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`🤖 ZI AI Status: ${zai ? "Connected" : "Disconnected"}`);
    console.log(`📡 Webhook URL: https://<YOUR_APP_URL>/api/telegram-webhook`);
  });
}

startServer();
