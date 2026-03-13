import { FileRecord } from '../types';

export interface TelegramConfig {
  botToken: string;
  adminChatId: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: { id: number; is_bot: boolean; first_name: string };
    chat: { id: number; type: string };
    date: number;
    text?: string;
  };
  channel_post?: {
    message_id: number;
    chat: { id: number };
    text?: string;
  };
}

export class TelegramService {
  private config: TelegramConfig;
  private lastUpdateId: number = 0;
  private isPolling: boolean = false;
  private onMessageCallback: ((text: string, chatId: string) => Promise<string>) | null = null;
  private onLogCallback: ((log: string) => void) | null = null;
  private chatHistory: Map<string, {role: string, text: string}[]> = new Map();

  constructor(config: TelegramConfig) {
    this.config = config;
  }

  getChatHistory(chatId: string) {
    return this.chatHistory.get(chatId) || [];
  }

  addChatMessage(chatId: string, role: string, text: string) {
    const history = this.getChatHistory(chatId);
    history.push({ role, text });
    // Keep only last 10 messages to avoid context overflow
    if (history.length > 10) {
      history.shift();
    }
    this.chatHistory.set(chatId, history);
  }
  
  clearChatHistory(chatId: string) {
    this.chatHistory.delete(chatId);
  }

  updateConfig(config: TelegramConfig) {
    this.config = config;
  }

  setLastUpdateId(id: number) {
    this.lastUpdateId = id;
  }

  setOnMessage(callback: (text: string, chatId: string) => Promise<string>) {
    this.onMessageCallback = callback;
  }

  setOnLog(callback: (log: string) => void) {
    this.onLogCallback = callback;
  }

  private log(message: string) {
    if (this.onLogCallback) this.onLogCallback(message);
    console.log(`[Telegram] ${message}`);
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  async sendMessage(chatId: string, text: string) {
    if (!this.config.botToken) return null;
    try {
      // We escape HTML to prevent "Bad Request: can't parse entities" errors
      // but we might want to preserve some basic tags if we trust the source.
      // For now, let's escape everything to be safe, or selectively allow.
      // Actually, many parts of the app use <b> and <code>, so we should be careful.
      
      // If the text already looks like it has intentional HTML, we might not want to escape it.
      // But the error "Unsupported start tag html" suggests the AI is sending raw HTML.
      
      // Let's implement a smarter sanitizer that escapes everything EXCEPT allowed tags.
      const allowedTags = ['b', 'i', 'u', 's', 'a', 'code', 'pre'];
      let sanitized = text
        .replace(/&/g, '&amp;')
        .replace(/<(?!(\/?(b|i|u|s|a|code|pre)\b))[^>]*>/gi, (match) => {
           // Escape any tag that isn't in the whitelist
           return match.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        });
      
      // Also escape standalone < and > that aren't part of tags
      // This is complex with regex. A simpler approach:
      // If we use parse_mode: 'HTML', we MUST ensure all < and > are part of valid tags.
      
      // Let's try a simpler approach: if it fails with HTML, retry without parse_mode or with escaped text.
      
      const truncatedText = sanitized.length > 4000 ? sanitized.substring(0, 3900) + "...\n\n(تم اختصار الرسالة لطولها)" : sanitized;
      
      const res = await fetch(`https://api.telegram.org/bot${this.config.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: truncatedText, parse_mode: 'HTML' })
      });
      const data = await res.json();
      if (!res.ok) {
        this.log(`Error sending message: ${data.description}. Retrying without HTML...`);
        // Fallback: send as plain text if HTML parsing fails
        const plainRes = await fetch(`https://api.telegram.org/bot${this.config.botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: text.substring(0, 4000) })
        });
        return null;
      }
      return data.result?.message_id;
    } catch (e) {
      this.log(`Error sending message: ${e}`);
      return null;
    }
  }

  async editMessageText(chatId: string, messageId: number, text: string) {
    if (!this.config.botToken) return;
    try {
      const allowedTags = ['b', 'i', 'u', 's', 'a', 'code', 'pre'];
      let sanitized = text
        .replace(/&/g, '&amp;')
        .replace(/<(?!(\/?(b|i|u|s|a|code|pre)\b))[^>]*>/gi, (match) => {
           return match.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        });

      const truncatedText = sanitized.length > 4000 ? sanitized.substring(0, 3900) + "...\n\n(تم اختصار الرسالة لطولها)" : sanitized;
      
      const res = await fetch(`https://api.telegram.org/bot${this.config.botToken}/editMessageText`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, message_id: messageId, text: truncatedText, parse_mode: 'HTML' })
      });
      if (!res.ok) {
        const errData = await res.json();
        this.log(`Error editing message: ${errData.description}. Retrying without HTML...`);
        // Fallback
        await fetch(`https://api.telegram.org/bot${this.config.botToken}/editMessageText`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, message_id: messageId, text: text.substring(0, 4000) })
        });
      }
    } catch (e) {
      this.log(`Error editing message: ${e}`);
    }
  }

  async sendChatAction(chatId: string, action: 'typing' | 'upload_document' = 'typing') {
    if (!this.config.botToken) return;
    try {
      await fetch(`https://api.telegram.org/bot${this.config.botToken}/sendChatAction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, action })
      });
    } catch (e) {}
  }

  async sendDocument(chatId: string, file: File, caption: string) {
    if (!this.config.botToken) return false;
    
    const allowedTags = ['b', 'i', 'u', 's', 'a', 'code', 'pre'];
    let sanitizedCaption = caption
      .replace(/&/g, '&amp;')
      .replace(/<(?!(\/?(b|i|u|s|a|code|pre)\b))[^>]*>/gi, (match) => {
         return match.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      });

    const fd = new FormData();
    fd.append('chat_id', chatId);
    fd.append('document', file);
    fd.append('caption', sanitizedCaption);
    fd.append('parse_mode', 'HTML');
    try {
      const res = await fetch(`https://api.telegram.org/bot${this.config.botToken}/sendDocument`, { method: 'POST', body: fd });
      const data = await res.json();
      
      if (!res.ok) {
        this.log(`Error sending document: ${data.description}. Retrying without HTML...`);
        // Fallback
        const fdFallback = new FormData();
        fdFallback.append('chat_id', chatId);
        fdFallback.append('document', file);
        fdFallback.append('caption', caption.substring(0, 1024));
        const resFallback = await fetch(`https://api.telegram.org/bot${this.config.botToken}/sendDocument`, { method: 'POST', body: fdFallback });
        const dataFallback = await resFallback.json();
        return dataFallback.ok;
      }
      
      return data.ok;
    } catch { return false; }
  }

  async getMe() {
    if (!this.config.botToken) return null;
    try {
      const res = await fetch(`https://api.telegram.org/bot${this.config.botToken}/getMe`);
      return await res.json();
    } catch (e) {
      this.log(`getMe failed: ${e}`);
      return null;
    }
  }

  async getWebhookInfo() {
    if (!this.config.botToken) return null;
    try {
      const res = await fetch(`https://api.telegram.org/bot${this.config.botToken}/getWebhookInfo`);
      return await res.json();
    } catch (e) {
      this.log(`getWebhookInfo failed: ${e}`);
      return null;
    }
  }

  async deleteWebhook() {
    if (!this.config.botToken) return;
    try {
      const res = await fetch(`https://api.telegram.org/bot${this.config.botToken}/deleteWebhook`);
      const data = await res.json();
      this.log(`Webhook deleted: ${data.description}`);
      return data;
    } catch (e) {
      this.log(`Failed to delete webhook: ${e}`);
    }
  }

  async poll() {
    if (this.isPolling || !this.config.botToken) return;
    this.isPolling = true;

    try {
      const offset = this.lastUpdateId + 1;
      // Short timeout for responsive UI, but long enough to not spam
      const res = await fetch(`https://api.telegram.org/bot${this.config.botToken}/getUpdates?offset=${offset}&timeout=5`);
      
      if (res.status === 409) {
        this.log("⚠️ Conflict: Webhook is active. Deleting it now...");
        await this.deleteWebhook();
        // Wait a bit before retrying
        await new Promise(r => setTimeout(r, 1000));
        this.isPolling = false;
        return;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      
      if (data.ok && data.result.length > 0) {
        this.log(`Received ${data.result.length} updates`);
        
        for (const upd of data.result as TelegramUpdate[]) {
          this.lastUpdateId = upd.update_id;
          
          const msg = upd.message || upd.channel_post;
          if (msg && msg.text) {
            const chatId = String(msg.chat.id);
            const text = msg.text;
            
            this.log(`Received msg from ID: "${chatId}" | Text: "${text.substring(0, 10)}..."`);

            // Pass all messages to the callback and let it handle authorization
            this.log(`Processing message from ID: "${chatId}"`);
            if (this.onMessageCallback) {
              // Send typing indicator
              await this.sendChatAction(chatId, 'typing');
              
              // Process message
              try {
                const reply = await this.onMessageCallback(text, chatId);
                
                // Send response
                if (reply) {
                    await this.sendMessage(chatId, reply);
                }
              } catch (callbackError: any) {
                this.log(`❌ Callback Error: ${callbackError.message}`);
                await this.sendMessage(chatId, `⚠️ حدث خطأ أثناء معالجة طلبك: ${callbackError.message || 'خطأ داخلي'}`);
              }
            } else {
              this.log("❌ No message callback registered!");
            }
          }
        }
      }
    } catch (e: any) {
      this.log(`Polling error: ${e.message}`);
      // Backoff slightly on error
      await new Promise(r => setTimeout(r, 2000));
    } finally {
      this.isPolling = false;
    }
    
    return this.lastUpdateId;
  }
}
