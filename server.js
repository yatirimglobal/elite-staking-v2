const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// --- YAPILANDIRMA ---
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://tgadmin:1Furkan2@cluster0.4bwu4ys.mongodb.net/?appName=Cluster0";
const BOT_TOKEN = process.env.BOT_TOKEN || "8612171484:AAG-k7i3gwsmDoemUZ2c_T57C47l03JOeyU";
const ADMIN_ID = process.env.ADMIN_ID || "1694656329";

// --- VERİTABANI BAĞLANTISI ---
mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ MongoDB Bağlantısı Başarılı"))
    .catch(err => console.error("❌ MongoDB Bağlantı Hatası:", err));

// --- VERİ MODELLERİ ---
const UserSchema = new mongoose.Schema({
    telegramId: { type: String, unique: true },
    name: String,
    investments: [{
        planDays: Number,
        amount: Number,
        totalProfit: Number,
        status: { type: String, default: 'Onay Bekliyor' },
        createdAt: { type: Date, default: Date.now }
    }]
});
const User = mongoose.model('User', UserSchema);

// --- TELEGRAM BİLDİRİM FONKSİYONU ---
async function notifyUser(chatId, text) {
    try {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: chatId,
            text: text,
            parse_mode: 'HTML'
        });
    } catch (e) { console.error("Bildirim Hatası:", e.message); }
}

// --- ANA SAYFA (Gelişmiş Arayüz) ---
app.get('/', async (req, res) => {
    try {
        const userCount = await User.countDocuments();
        const activeInvestments = await User.aggregate([
            { $unwind: "$investments" },
            { $match: { "investments.status": "Aktif" } },
            { $count: "count" }
        ]);

        res.send(`
            <div style="font-family: sans-serif; text-align: center; padding: 50px; background: #0f172a; color: white; min-height: 100vh;">
                <h1 style="color: #38bdf8;">🚀 Elite Staking V2 API</h1>
                <p style="font-size: 1.2em; color: #94a3b8;">Sunucu Durumu: <span style="color: #4ade80;">Aktif</span></p>
                <hr style="border: 1px solid #1e293b; width: 50%; margin: 20px auto;">
                <div style="display: flex; justify-content: center; gap: 20px; margin-top: 30px;">
                    <div style="background: #1e293b; padding: 20px; border-radius: 10px; width: 150px;">
                        <h3>${userCount}</h3>
                        <p>Kullanıcı</p>
                    </div>
                    <div style="background: #1e293b; padding: 20px; border-radius: 10px; width: 150px;">
                        <h3>${activeInvestments[0]?.count || 0}</h3>
                        <p>Aktif Yatırım</p>
                    </div>
                </div>
                <p style="margin-top: 40px; color: #64748b;">Bot ve Veritabanı bağlantıları sorunsuz.</p>
            </div>
        `);
    } catch (e) {
        res.send("Sistem çalışıyor ancak verilere şu an ulaşılamıyor.");
    }
});

// --- API ROTLARI ---

app.post('/api/sync', async (req, res) => {
    try {
        const { telegramId, name } = req.body;
        let user = await User.findOne({ telegramId });
        if (!user) {
            user = new User({ telegramId, name, investments: [] });
            await user.save();
        }
        res.json(user);
    } catch (e) { res.status(500).send(e.message); }
});

app.post('/api/invest', async (req, res) => {
    try {
        const { telegramId, planDays, amount, profit } = req.body;
        const user = await User.findOne({ telegramId });
        const newInv = { planDays, amount, totalProfit: profit, status: 'Onay Bekliyor' };
        user.investments.push(newInv);
        await user.save();
        
        await notifyUser(ADMIN_ID, `🔔 <b>YENİ YATIRIM TALEBİ</b>\n\n👤: ${user.name}\n💰: $${amount}\n🗓: ${planDays} Gün`);
        res.json({ success: true });
    } catch (e) { res.status(500).send(e.message); }
});

app.post('/api/cancel-invest', async (req, res) => {
    try {
        const { telegramId, investId, refundWallet } = req.body;
        const user = await User.findOne({ telegramId });
        const inv = user.investments.id(investId);

        if (inv) {
            const refundAmount = inv.amount * 0.98;
            const logMsg = `⚠️ <b>YATIRIM İPTAL EDİLDİ</b>\n\n👤: ${user.name}\n💰 İade: $${refundAmount.toFixed(2)}\n🏦 Cüzdan: <code>${refundWallet}</code>`;
            user.investments.pull({ _id: investId });
            await user.save();
            await notifyUser(ADMIN_ID, logMsg);
            res.json({ success: true });
        } else {
            res.status(404).json({ error: "Yatırım bulunamadı" });
        }
    } catch (e) { res.status(500).send(e.message); }
});

app.post('/api/withdraw', async (req, res) => {
    try {
        const { telegramId, amount, wallet } = req.body;
        const user = await User.findOne({ telegramId });
        await notifyUser(ADMIN_ID, `💰 <b>PARA ÇEKME TALEBİ</b>\n\n👤: ${user.name}\n💵: $${amount}\n🏦: <code>${wallet}</code>`);
        res.json({ success: true });
    } catch (e) { res.status(500).send(e.message); }
});

app.post('/api/admin/approve', async (req, res) => {
    try {
        const { telegramId, investId } = req.body;
        const user = await User.findOne({ telegramId });
        const inv = user.investments.id(investId);

        if (inv) {
            inv.status = 'Aktif';
            inv.createdAt = new Date();
            await user.save();
            const userMsg = `✅ <b>Yatırımınız Onaylandı!</b>\n\n$${inv.amount} tutarındaki paketiniz aktifleşti.`;
            await notifyUser(telegramId, userMsg);
            res.json({ success: true });
        } else {
            res.status(404).json({ error: "Yatırım bulunamadı." });
        }
    } catch (e) { res.status(500).send(e.message); }
});

app.get('/api/admin/users', async (req, res) => {
    try {
        const users = await User.find({});
        res.json(users);
    } catch (e) { res.status(500).send(e.message); }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server ${PORT} portunda aktif!`));