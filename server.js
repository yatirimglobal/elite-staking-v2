require('dotenv').config(); // .env dosyasındaki değişkenleri güvenli bir şekilde yükler
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());
// Orijinal dosya düzenine sadık kalındı (Render.com hata vermez)
app.use(express.static(__dirname));

// --- 🛠 AYARLAR VE GÜVENLİK (Çevre Değişkenleri ile Güvenli Hale Getirildi) ---
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "1Fr.1806Rf21"; 
const dbURI = process.env.MONGODB_URI || "mongodb+srv://tgadmin:1Furkan2@cluster0.4bwu4ys.mongodb.net/cryptoInvest?retryWrites=true&w=majority";

// --- TELEGRAM BOT BİLGİLERİN ---
const BOT_TOKEN = process.env.BOT_TOKEN || "8612171484:AAG-k7i3gwsmDoemUZ2c_T57C47l03JOeyU"; 
const MY_CHAT_ID = process.env.MY_CHAT_ID || "1694656329"; 
const SERVER_URL = process.env.SERVER_URL || ""; // Örn: https://projeniz.onrender.com (Boş bırakılırsa webhook kurulumunu atlar)

// 🔔 ADMİNE BİLDİRİM GÖNDERME
async function notifyAdmin(msg, replyMarkup = null) {
    try {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: MY_CHAT_ID,
            text: msg,
            parse_mode: 'HTML',
            reply_markup: replyMarkup
        });
    } catch (err) {
        console.log("Admin bildirim hatası:", err.response ? err.response.data : err.message);
    }
}

// 🔔 KULLANICIYA BİLDİRİM GÖNDERME
async function notifyUser(userId, msg) {
    try {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: userId,
            text: msg,
            parse_mode: 'HTML'
        });
    } catch (err) {
        console.log("Kullanıcıya mesaj iletilemedi:", err.response ? err.response.data : err.message);
    }
}

// --- VERİTABANI BAĞLANTISI VE OTOMATİK WEBHOOK ---
mongoose.connect(dbURI)
    .then(() => {
        console.log("✅ MongoDB Bağlı");
        if (SERVER_URL && SERVER_URL.trim() !== "") {
            axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${SERVER_URL}/bot${BOT_TOKEN}`)
                .then(() => console.log("🤖 Telegram Webhook başarıyla senkronize edildi."))
                .catch(err => console.log("❌ Webhook Kurulum Hatası:", err.message));
        }
    })
    .catch(err => console.log("❌ DB Hatası:", err));

// --- PARA YATIRMA TALEPLERİ ŞEMASI ---
const DepositSchema = new mongoose.Schema({
    telegramId: String,
    amount: Number,
    status: { type: String, default: 'Beklemede' }, // Beklemede, Onaylandı, Reddedildi
    date: { type: Date, default: Date.now }
});
const Deposit = mongoose.model('Deposit', DepositSchema);

// --- KULLANICI ŞEMASI ---
const UserSchema = new mongoose.Schema({
    telegramId: { type: String, required: true },
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
        totalProfit: Number,
        status: { type: String, default: 'Onay Bekliyor' },
        returnWallet: { type: String, default: '' },
        createdAt: { type: Date, default: Date.now }
    }],
    withdrawals: [{
        amount: Number,
        wallet: String,
        status: { type: String, default: 'Beklemede' },
        date: { type: Date, default: Date.now }
    }]
});
const User = mongoose.model('User', UserSchema);

// --- ⚙️ KULLANICI ROTALARI ---

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Kullanıcı Senkronizasyon
app.post('/api/sync', async (req, res) => {
    try {
        const { telegramId, name } = req.body;
        let user = await User.findOne({ telegramId });
        if (!user) { 
            user = new User({ telegramId, name, balance: 0.00, investments: [], withdrawals: [], luckyBoxHistory: [] }); 
            await user.save(); 
        }
        return res.json(user);
    } catch (err) { 
        return res.status(500).json({ error: err.message }); 
    }
});

// Para Yatırma Talebi Oluşturma (Admin Botuna Inline Buton Gönderir)
app.post('/api/deposit', async (req, res) => {
    try {
        const { telegramId, amount } = req.body;
        const user = await User.findOne({ telegramId });
        if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı." });

        const newDeposit = new Deposit({ telegramId, amount: Number(amount), status: 'Beklemede' });
        await newDeposit.save();

        const message = `<b>💰 YENİ BAKİYE YÜKLEME TALEBİ</b>\n\n` +
                        `👤 Kullanıcı: <code>${user.name || telegramId}</code> (${telegramId})\n` +
                        `💵 Miktar: <b>$${Number(amount).toFixed(2)} USDT</b>\n` +
                        `🕒 Tarih: ${new Date().toLocaleString('tr-TR')}\n\n` +
                        `Lütfen aşağıdaki butonları kullanarak işlemi onaylayın veya reddedin.`;

        const inlineKeyboard = {
            inline_keyboard: [
                [
                    { text: "✅ Onayla", callback_data: `dep_approve_${newDeposit._id}` },
                    { text: "❌ Reddet", callback_data: `dep_reject_${newDeposit._id}` }
                ]
            ]
        };

        await notifyAdmin(message, inlineKeyboard);
        return res.json({ success: true, message: "Talep admine iletildi." });
    } catch (e) { 
        return res.status(500).json({ error: e.message }); 
    }
});

// Yeni Yatırım Bildirimi (Serbest Bakiyeden Düşer, Onay Bekliyor Durumuna Geçer)
app.post('/api/invest', async (req, res) => {
    try {
        const { telegramId, planDays, amount, profit } = req.body;
        let user = await User.findOne({ telegramId });
        
        if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı." });
        if (user.balance < Number(amount)) {
            return res.status(400).json({ error: "Yetersiz serbest bakiye." });
        }
        
        user.balance -= Number(amount);

        user.investments.push({ 
            planDays: Number(planDays), 
            amount: Number(amount), 
            totalProfit: Number(profit),
            status: 'Onay Bekliyor'
        });
        await user.save();
        
        await notifyAdmin(`💰 <b>YENİ YATIRIM GELDİ (ONAY BEKLİYOR)!</b>\n\n👤 Kullanıcı: <code>${telegramId}</code>\n💵 Miktar: <b>$${amount}</b>\n🗓 Plan: <b>${planDays} Gün</b>\n\nNot: Kullanıcının serbest bakiyesinden düşüldü, admin panelinden aktifleştirilmesi gerekir.`);
        return res.json({ success: true, newBalance: user.balance });
    } catch (e) { 
        return res.status(500).json({ error: e.message }); 
    }
});

// Şanslı Kutu Oyunu Rotası (Serbest Bakiyeden Harcar ve Kazanılanı Ekler)
app.post('/api/luckybox/play', async (req, res) => {
    const BOX_COST = 5.00;
    try {
        const { telegramId, resultType, wonAmount } = req.body;
        const user = await User.findOne({ telegramId });
        if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı." });
        if (user.balance < BOX_COST) return res.status(400).json({ error: "Yetersiz serbest bakiye." });

        user.balance = user.balance - BOX_COST + Number(wonAmount);
        user.luckyBoxHistory.push({ resultType, wonAmount: Number(wonAmount) });
        await user.save();

        if (resultType === 'WIN' || resultType === 'JACKPOT') {
            await notifyAdmin(`🎲 <b>KUTUDAN BÜYÜK ÖDÜL!</b>\n\n👤 Kullanıcı: <code>${user.name || telegramId}</code>\n🎁 Sonuç: <b>${resultType}</b>\n💵 Kazanç: <b>$${wonAmount}</b>`);
        }

        return res.json({ success: true, newBalance: user.balance });
    } catch (err) { 
        return res.status(500).json({ error: err.message }); 
    }
});

// İptal ve İade Talebi Oluşturma
app.post('/api/invest/cancel-request', async (req, res) => {
    try {
        const { telegramId, investId, returnWallet } = req.body;
        const user = await User.findOne({ telegramId });
        if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı." });

        const inv = user.investments.id(investId);
        if (inv && inv.status === 'Aktif') {
            inv.status = 'İptal Bekliyor';
            inv.returnWallet = returnWallet;
            await user.save();

            await notifyAdmin(`⚠️ <b>İPTAL TALEBİ!</b>\n\n👤 Kullanıcı: <code>${telegramId}</code>\n💵 Anapara: <b>$${inv.amount}</b>\n🏦 İade Adresi: <code>${returnWallet}</code>`);
            return res.json({ success: true });
        } else {
            return res.status(400).json({ error: "İşlem başarısız veya aktif yatırım bulunamadı." });
        }
    } catch (e) { 
        return res.status(500).json({ error: e.message }); 
    }
});

// Para Çekme Talebi Oluşturma (Serbest Bakiyeden Kontrol Edilir)
app.post('/api/withdraw', async (req, res) => {
    try {
        const { telegramId, amount, wallet } = req.body;
        const user = await User.findOne({ telegramId });
        
        if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı." });
        if (user.balance < Number(amount)) {
            return res.status(400).json({ error: "Yetersiz serbest bakiye." });
        }

        user.balance -= Number(amount);
        user.withdrawals.push({ amount: Number(amount), wallet, status: 'Beklemede' });
        await user.save();

        await notifyAdmin(`🚨 <b>ÇEKİM TALEBİ!</b>\n\n👤 Kullanıcı: <code>${telegramId}</code>\n💸 Miktar: <b>$${amount}</b>\n🏦 Cüzdan: <code>${wallet}</code>`);
        return res.json({ success: true, newBalance: user.balance });
    } catch (e) { 
        return res.status(500).json({ success: false, error: e.message }); 
    }
});

// --- 👮 ADMİN ROTALARI ---

// Tüm Kullanıcıları Çekme
app.post('/api/admin/all', async (req, res) => {
    try {
        if (req.body.password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Yetkisiz" });
        const users = await User.find();
        return res.json(users);
    } catch (e) { 
        return res.status(500).json({ error: e.message }); 
    }
});

// Admin Panelinde Bakiye Yükleme Taleplerini Listeleme
app.post('/api/admin/deposits', async (req, res) => {
    try {
        if (req.body.password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Yetkisiz" });
        const deposits = await Deposit.find().sort({ date: -1 });
        return res.json(deposits);
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// ⚡ YENİ EKLENEN ROTA: Admin Panelinde Tüm Para Çekme Taleplerini Listeleme
app.post('/api/admin/withdrawals', async (req, res) => {
    try {
        if (req.body.password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Yetkisiz" });
        
        const users = await User.find();
        let allWithdrawals = [];

        users.forEach(user => {
            if (user.withdrawals && user.withdrawals.length > 0) {
                user.withdrawals.forEach(w => {
                    allWithdrawals.push({
                        _id: w._id,
                        telegramId: user.telegramId,
                        name: user.name || "Bilinmiyor",
                        amount: w.amount,
                        wallet: w.wallet,
                        status: w.status,
                        date: w.date
                    });
                });
            }
        });

        allWithdrawals.sort((a, b) => new Date(b.date) - new Date(a.date));
        return res.json(allWithdrawals);
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// Admin Panelinden Bakiye Yüklemeyi Onaylama
app.post('/api/admin/deposit/approve', async (req, res) => {
    try {
        if (req.body.password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Yetkisiz" });
        const { depositId } = req.body;
        
        const depositTask = await Deposit.findById(depositId);
        if (!depositTask) return res.status(404).json({ error: "Yükleme talebi bulunamadı." });
        if (depositTask.status !== 'Beklemede') return res.status(400).json({ error: "Bu talep zaten işleme alınmış." });

        depositTask.status = 'Onaylandı';
        await depositTask.save();

        const targetUser = await User.findOne({ telegramId: depositTask.telegramId });
        if (targetUser) {
            targetUser.balance = (targetUser.balance || 0) + Number(depositTask.amount);
            await targetUser.save();
            await notifyUser(depositTask.telegramId, `🟢 <b>Bakiye Yükleme Talebiniz Onaylandı!</b>\n\n$${depositTask.amount} tutarı serbest bakiyenize eklenmiştir.`);
        }

        return res.json({ success: true });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// Admin Panelinden Bakiye Yüklemeyi Reddetme
app.post('/api/admin/deposit/reject', async (req, res) => {
    try {
        if (req.body.password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Yetkisiz" });
        const { depositId } = req.body;

        const depositTask = await Deposit.findById(depositId);
        if (!depositTask) return res.status(404).json({ error: "Yükleme talebi bulunamadı." });
        if (depositTask.status !== 'Beklemede') return res.status(400).json({ error: "Bu talep zaten işleme alınmış." });

        depositTask.status = 'Reddedildi';
        await depositTask.save();

        await notifyUser(depositTask.telegramId, `🔴 <b>Bakiye Yükleme Talebiniz Reddedildi.</b>\n\nLütfen gönderdiğiniz tutarı ve işlemi kontrol edin.`);
        return res.json({ success: true });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// Yatırım Onaylama (Aktif Etme)
app.post('/api/admin/approve', async (req, res) => {
    try {
        if (req.body.password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Yetkisiz" });
        const { telegramId, investId } = req.body;
        const user = await User.findOne({ telegramId });
        if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı." });
        
        const inv = user.investments.id(investId);
        if(inv) { 
            inv.status = 'Aktif'; 
            inv.createdAt = new Date(); 
            await user.save(); 

            await notifyUser(telegramId, `✅ <b>Yatırımınız Onaylandı!</b>\n\n$${inv.amount} tutarındaki paketiniz aktif edildi.`);
            return res.json({ success: true }); 
        }
        return res.status(404).json({ error: "Yatırım bulunamadı." });
    } catch (e) { 
        return res.status(500).json({ error: e.message }); 
    }
});

// İptal Talebini Onaylama
app.post('/api/admin/approve-cancel', async (req, res) => {
    try {
        if (req.body.password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Yetkisiz" });
        const { telegramId, investId } = req.body;
        const user = await User.findOne({ telegramId });
        if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı." });
        
        const inv = user.investments.id(investId);
        if (inv) {
            inv.status = 'İptal Edildi';
            await user.save();
            await notifyUser(telegramId, `🔴 <b>İptal Talebiniz Onaylandı!</b>\n\nAnaparanız (%2 kesintiyle) belirttiğiniz TRC20 adresine gönderilmiştir.`);
            return res.json({ success: true });
        } else { 
            return res.status(404).json({ error: "Yatırım bulunamadı" }); 
        }
    } catch (e) { 
        return res.status(500).json({ error: e.message }); 
    }
});

// Çekim Talebini Onaylama
app.post('/api/admin/approve-withdraw', async (req, res) => {
    try {
        if (req.body.password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Yetkisiz" });
        const { telegramId, withdrawId } = req.body;
        const user = await User.findOne({ telegramId });
        if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı." });
        
        const withdraw = user.withdrawals.id(withdrawId);
        if (withdraw) {
            withdraw.status = 'Tamamlandı';
            await user.save();
            await notifyUser(telegramId, `💰 <b>Para Çekme Talebiniz Tamamlandı!</b>\n\n$${withdraw.amount} cüzdan adresinize transfer edildi.`);
            return res.json({ success: true });
        } else { 
            return res.status(404).json({ error: "Talep bulunamadı" }); 
        }
    } catch (e) { 
        return res.status(500).json({ error: e.message }); 
    }
});

// Yatırım Silme/Reddetme
app.post('/api/admin/delete-invest', async (req, res) => {
    try {
        if (req.body.password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Yetkisiz" });
        const { telegramId, investId } = req.body;
        const user = await User.findOne({ telegramId });
        if(user) { 
            user.investments.pull({ _id: investId }); 
            await user.save(); 
            return res.json({ success: true }); 
        }
        return res.status(404).json({ error: "Kullanıcı bulunamadı." });
    } catch (e) { 
        return res.status(500).json({ error: e.message }); 
    }
});

// ==================== TELEGRAM WEBHOOK / CALLBACK HANDLING ====================
app.post(`/bot${BOT_TOKEN}`, async (req, res) => {
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
                    targetUser.balance = (targetUser.balance || 0) + Number(depositTask.amount);
                    await targetUser.save();
                    await notifyUser(depositTask.telegramId, `🟢 <b>Bakiye Yükleme Talebiniz Onaylandı!</b>\n\n$${depositTask.amount} tutarı serbest bakiyenize eklenmiştir.`);
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
                await notifyUser(depositTask.telegramId, `🔴 <b>Bakiye Yükleme Talebiniz Reddedildi.</b>\n\nLütfen gönderdiğiniz tutarı ve işlemi kontrol edin.`);

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

// --- SUNUCU BAŞLATMA ---
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Sunucu ${PORT} portunda yayında!`));
