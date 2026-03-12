const express = require('express');
const axios = require('axios');
const app = express();

// 1. Middleware to parse JSON bodies (Crucial for Telegram)
app.use(express.json());

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET; // Optional: for security

// 2. The Webhook Route
// Must match the URL you set via setWebhook
app.post('/telegram-webhook', async (req, res) => {
    const update = req.body;

    // 3. Detailed Logging for Debugging
    console.log('--- Incoming Webhook ---');
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Body:', JSON.stringify(update, null, 2));

    // 4. Security Check (Optional but recommended)
    // if (req.headers['x-telegram-bot-api-secret-token'] !== WEBHOOK_SECRET) {
    //     console.warn('Unauthorized webhook attempt');
    //     return res.status(403).send('Forbidden');
    // }

    // 5. Immediate Response to prevent Telegram Timeouts
    // Telegram expects a 200 OK quickly. If you process heavy logic, do it asynchronously.
    res.status(200).send('OK');

    // 6. Handle the Update
    if (update.message && update.message.text) {
        const chatId = update.message.chat.id;
        const text = update.message.text;

        console.log(`Received message from ${chatId}: ${text}`);

        try {
            // Example: Echo logic
            await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                chat_id: chatId,
                text: `You said: ${text}`,
                parse_mode: 'HTML'
            });
            console.log('Reply sent successfully');
        } catch (error) {
            console.error('Failed to send reply:', error.response ? error.response.data : error.message);
        }
    }
});

// Health Check
app.get('/', (req, res) => {
    res.send('Telegram Bot Server is Running');
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Webhook URL should be set to: https://YOUR-DOMAIN.com/telegram-webhook`);
});
