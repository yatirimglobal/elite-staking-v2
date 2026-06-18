const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();

// Render.com için modern JSON ve CORS ayarları
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==================== CONFIGURATION ====================
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://root:root@cluster0.abcde.mongodb.net/cryptoInvest?retryWrites=true&w=majority"; 
const BOT_TOKEN = process.env.BOT_TOKEN || "7330554279:AAH-P3M_YourActualBotTokenHere";
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || "1694656329"; // Furkan'ın Telegram ID'si

mongoose.connect(MONGO_URI)
  .then(() => console.log("🟢 MongoDB Bağlantısı Başarılı."))
  .catch(err => console.error("🔴 MongoDB Bağlantı Hatası:", err));

// ==================== MONGOOSE MODELS ====================

// Para Yatırma Talepleri Şeması
const DepositSchema = new mongoose.Schema({
    telegramId: String,
    amount: Number,
    status: { type: String, default: 'Beklemede' }, // Beklemede, Onaylandı, Reddedildi
    date: { type: Date, default: Date.now }
});
const Deposit = mongoose.model('Deposit', DepositSchema);

// Kullanıcı Şeması
const UserSchema = new mongoose.Schema({
    telegramId: { type: String, unique: true, required: true },
    name: String,
    balance: { type: Number, default: 0.00 }, // Serbest Bakiye
    luckyBoxHistory: [{
        resultType: String,
        wonAmount: Number,
        date: { type: Date, default: Date.now }
    }],
    investments: [{
        planDays: Number,
        amount: Number,
        profit: Number,
        status: { type: String, default: 'Aktif' }, // Aktif, Beklemede, İptal Edildi, Tamamlandı
        date: { type: Date, default: Date.now }
    }],
    withdrawals: [{
        amount: Number,
        wallet: String,
        status: { type: String, default: 'Beklemede' },
        date: { type: Date, default: Date.now }
    }]
});
const User = mongoose.model('User', UserSchema);

// ==================== TELEGRAM BOT HELPER ====================
async function sendAdminNotification(text, replyMarkup = null) {
    try {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: ADMIN_CHAT_ID,
            text: text,
            parse_mode: 'HTML',
            reply_markup: replyMarkup
        });
    } catch (err) {
        console.error("🔴 Telegram bildirim hatası:", err.response?.data || err.message);
    }
}

// ==================== API ENDPOINTS ====================

// 1. Kullanıcı Senkronizasyonu (Giriş)
app.post('/api/sync', async (req, res) => {
    const { telegramId, name } = req.body;
    if (!telegramId) return res.status(400).json({ error: "telegramId gerekli" });

    try {
        let user = await User.findOne({ telegramId });
        if (!user) {
            user = new User({ telegramId, name, balance: 10.00 }); // Yeni üyeye $10 hoşgeldin hediyesi
            await user.save();
        } else if (name && user.name !== name) {
            user.name = name;
            await user.save();
        }
        return res.json(user);
    } catch (err) {
        return res.status(500).json({ error: "Veritabanı hatası" });
    }
});

// 2. Para Yatırma Talebi Oluşturma
app.post('/api/deposit', async (req, res) => {
    const { telegramId, amount } = req.body;
    if (!telegramId || !amount || amount <= 0) return res.status(400).json({ error: "Geçersiz veriler" });

    try {
        const user = await User.findOne({ telegramId });
        if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı" });

        const newDeposit = new Deposit({ telegramId, amount, status: 'Beklemede' });
        await newDeposit.save();

        const message = `<b>💰 YENİ BAKİYE YÜKLEME TALEBİ</b>\n\n` +
                        `👤 <b>Kullanıcı:</b> ${user.name} (${telegramId})\n` +
                        `💵 <b>Miktar:</b> $${Number(amount).toFixed(2)} USDT (TRC20)\n` +
                        `🕒 <b>Tarih:</b> ${new Date().toLocaleString('tr-TR')}\n\n` +
                        `Lütfen aşağıdaki butonları kullanarak işlemi onaylayın veya reddedin.`;

        const inlineKeyboard = {
            inline_keyboard: [
                [
                    { text: "✅ Onayla", callback_data: `dep_approve_${newDeposit._id}` },
                    { text: "❌ Reddet", callback_data: `dep_reject_${newDeposit._id}` }
                ]
            ]
        };

        await sendAdminNotification(message, inlineKeyboard);
        return res.json({ success: true, message: "Talep admine iletildi" });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Sistem hatası" });
    }
});

// 3. Şanslı Kutu Oyunu
app.post('/api/luckybox/play', async (req, res) => {
    const { telegramId, resultType, wonAmount } = req.body;
    const BOX_COST = 5.00;

    try {
        const user = await User.findOne({ telegramId });
        if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı" });
        if (user.balance < BOX_COST) return res.status(400).json({ error: "Yetersiz serbest bakiye" });

        user.balance = user.balance - BOX_COST + Number(wonAmount);
        user.luckyBoxHistory.push({ resultType, wonAmount });
        await user.save();

        if (resultType === 'WIN' || resultType === 'JACKPOT') {
            await sendAdminNotification(`🎲 <b>${user.name}</b> bir kutu açtı ve <b>$${wonAmount} (${resultType})</b> kazandı!`);
        }

        return res.json({ success: true, newBalance: user.balance });
    } catch (err) {
        return res.status(500).json({ error: "Oyun kaydedilemedi" });
    }
});

// 4. Staking Yatırım Paketi Başlatma
app.post('/api/invest', async (req, res) => {
    const { telegramId, planDays, amount, profit } = req.body;

    try {
        const user = await User.findOne({ telegramId });
        if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı" });
        if (user.balance < amount) return res.status(400).json({ error: "Yetersiz serbest bakiye" });

        user.balance -= Number(amount);
        user.investments.push({ planDays, amount, profit, status: 'Aktif' });
        await user.save();

        await sendAdminNotification(`🚀 <b>${user.name}</b> serbest bakiyesiyle yeni bir yatırım başlattı!\n💵 Tutar: $${amount}\n📅 Vade: ${planDays} Gün\n📈 Beklenen Kar: +$${profit}`);
        return res.json({ success: true, newBalance: user.balance });
    } catch (err) {
        return res.status(500).json({ error: "Yatırım başlatılamadı" });
    }
});

// 5. Yatırım İptal Talebi
app.post('/api/invest/cancel', async (req, res) => {
    const { telegramId, investId } = req.body;

    try {
        const user = await User.findOne({ telegramId });
        if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı" });

        const investment = user.investments.id(investId);
        if (!investment) return res.status(404).json({ error: "Yatırım kaydı bulunamadı" });

        investment.status = 'Beklemede'; 
        await user.save();

        const msg = `🚨 <b>YATIRIM İPTAL TALEBİ</b>\n\n👤 Kullanıcı: ${user.name}\n💵 Tutar: $${investment.amount}\n\nİptali onaylamak için admin paneline bakın veya manuel müdahale edin.`;
        await sendAdminNotification(msg);

        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ error: "İptal talebi işlenemedi" });
    }
});

// 6. Para Çekme Talebi Oluşturma
app.post('/api/withdraw', async (req, res) => {
    const { telegramId, amount, wallet } = req.body;

    try {
        const user = await User.findOne({ telegramId });
        if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı" });
        if (user.balance < amount) return res.status(400).json({ error: "Yetersiz serbest bakiye" });

        user.balance -= Number(amount);
        user.withdrawals.push({ amount, wallet, status: 'Beklemede' });
        await user.save();

        const msg = `💸 <b>PARA ÇEKME TALEBİ</b>\n\n👤 Kullanıcı: ${user.name}\n💵 Tutar: $${amount}\n🏦 Cüzdan: <code>${wallet}</code>`;
        await sendAdminNotification(msg);

        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ error: "Çekim talebi oluşturulamadı" });
    }
});

// ==================== TELEGRAM WEBHOOK / CALLBACK HANDLING ====================
app.post(`/bot${BOT_TOKEN}`, async (req, res) => {
    // Render.com'un zaman aşımına düşmemesi için hemen 200 OK yanıtı veriyoruz
    res.status(200).send('OK'); 

    const { callback_query } = req.body;
    if (!callback_query) return;

    const data = callback_query.data;
    const chatId = callback_query.message.chat.id;
    const messageId = callback_query.message.message_id;

    if (data.startsWith('dep_approve_') || data.startsWith('dep_reject_')) {
        const isApprove = data.startsWith('dep_approve_');
        const depositId = data.replace(isApprove ? 'dep_approve_' : 'dep_reject_', '');

        try {
            const depositTask = await Deposit.findById(depositId);
            if (!depositTask || depositTask.status !== 'Beklemede') return;

            const targetUser = await User.findOne({ telegramId: depositTask.telegramId });
            
            if (isApprove) {
                depositTask.status = 'Onaylandı';
                if (targetUser) {
                    targetUser.balance += Number(depositTask.amount); 
                    await targetUser.save();
                }
                await depositTask.save();

                await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
                    chat_id: chatId,
                    message_id: messageId,
                    text: callback_query.message.text + `\n\n🟢 <b>İŞLEM DURUMU: ONAYLANDI ✅</b>\n(Kullanıcının serbest bakiyesine $${depositTask.amount} eklendi.)`,
                    parse_mode: 'HTML'
                });
            } else {
                depositTask.status = 'Reddedildi';
                await depositTask.save();

                await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
                    chat_id: chatId,
                    message_id: messageId,
                    text: callback_query.message.text + `\n\n🔴 <b>İŞLEM DURUMU: REDDEDİLDİ ❌</b>`,
                    parse_mode: 'HTML'
                });
            }
        } catch (e) {
            console.error("Callback işleme hatası:", e.message);
        }
    }
});

// Statik Dosya Dağıtımı
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// START SERVER (Render.com PORT atamasını otomatik algılar)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Sunucu ${PORT} portunda başarıyla başlatıldı.`);
});
