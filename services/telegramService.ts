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

  constructor(config: TelegramConfig) {
    this.config = config;
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

  async sendMessage(chatId: string, text: string) {
    if (!this.config.botToken) return;
    try {
      await fetch(`https://api.telegram.org/bot${this.config.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
      });
    } catch (e) {
      this.log(`Error sending message: ${e}`);
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
    const fd = new FormData();
    fd.append('chat_id', chatId);
    fd.append('document', file);
    fd.append('caption', caption);
    fd.append('parse_mode', 'HTML');
    try {
      const res = await fetch(`https://api.telegram.org/bot${this.config.botToken}/sendDocument`, { method: 'POST', body: fd });
      const data = await res.json();
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

            // Normalize IDs for comparison
            const normalizedChatId = chatId.trim();
            const normalizedAdminId = (this.config.adminChatId || '').trim();

            // Check if authorized
            if (normalizedAdminId && normalizedChatId === normalizedAdminId) {
              this.log("✅ ID Match! Processing message...");
              if (this.onMessageCallback) {
                // Send typing indicator
                await this.sendChatAction(chatId, 'typing');
                
                // Process message
                const reply = await this.onMessageCallback(text, chatId);
                
                // Send response
                if (reply) {
                    await this.sendMessage(chatId, reply);
                }
              } else {
                this.log("❌ No message callback registered!");
              }
            } else {
              this.log(`⛔ Unauthorized/Mismatch. Received: "${normalizedChatId}", Expected: "${normalizedAdminId}"`);
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
