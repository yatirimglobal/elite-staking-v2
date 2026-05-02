const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios'); // Bildirim göndermek için gerekli
const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.static(__dirname));

// --- 🛠 AYARLAR VE GÜVENLİK ---
const ADMIN_PASSWORD = "1Fr.1806Rf21"; 
const dbURI = "mongodb+srv://tgadmin:1Furkan2@cluster0.4bwu4ys.mongodb.net/cryptoInvest?retryWrites=true&w=majority&appName=Cluster0";

// --- SENİN BİLGİLERİN ---
const BOT_TOKEN = "8612171484:AAG-k7i3gwsmDoemUZ2c_T57C47l03JOeyU"; 
const MY_CHAT_ID = "1694656329"; 

// 🔔 TELEGRAM BİLDİRİM FONKSİYONU
async function notifyAdmin(msg) {
    try {
        const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
        await axios.post(url, {
            chat_id: MY_CHAT_ID,
            text: msg,
            parse_mode: 'HTML'
        });
    } catch (err) {
        console.log("❌ Bildirim Hatası:", err.message);
    }
}

mongoose.connect(dbURI).then(() => console.log("✅ MongoDB Bağlı")).catch(err => console.log("❌ DB Hatası:", err));

const UserSchema = new mongoose.Schema({
    telegramId: { type: String, required: true },
    name: String,
    investments: [{
        planDays: Number, amount: Number, totalProfit: Number,
        status: { type: String, default: 'Onay Bekliyor' },
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

// KULLANICI SENKRONİZASYON
app.post('/api/sync', async (req, res) => {
    try {
        const { telegramId, name } = req.body;
        let user = await User.findOne({ telegramId });
        if (!user) { user = new User({ telegramId, name, investments: [], withdrawals: [] }); await user.save(); }
        res.json(user);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// YATIRIM BİLDİRİMİ (BİLDİRİM EKLENDİ)
app.post('/api/invest', async (req, res) => {
    try {
        const { telegramId, planDays, amount, profit } = req.body;
        let user = await User.findOne({ telegramId });
        user.investments.push({ planDays: Number(planDays), amount: Number(amount), totalProfit: Number(profit) });
        await user.save();

        // 🔔 BOT MESAJI
        notifyAdmin(`💰 <b>YENİ YATIRIM GELDİ!</b>\n\n👤 Kullanıcı: <code>${telegramId}</code>\n💵 Miktar: <b>$${amount}</b>\n🗓 Vade: <b>${planDays} Gün</b>\n📈 Kâr: <b>$${profit}</b>\n\n✅ Onaylamak için Admin Paneline girin.`);

        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// PARA ÇEKME TALEBİ (BİLDİRİM EKLENDİ)
app.post('/api/withdraw', async (req, res) => {
    try {
        const { telegramId, amount, wallet } = req.body;
        const user = await User.findOne({ telegramId });
        if(user) {
            user.withdrawals.push({ amount: Number(amount), wallet, status: 'Beklemede' });
            await user.save();

            // 🔔 BOT MESAJI
            notifyAdmin(`🚨 <b>PARA ÇEKME TALEBİ!</b>\n\n👤 Kullanıcı: <code>${telegramId}</code>\n💸 Miktar: <b>$${amount}</b>\n🏦 Cüzdan: <code>${wallet}</code>\n\n⚠️ Ödemeyi yaptıktan sonra panelden "Ödendi" olarak işaretleyin.`);

            res.json({ success: true });
        }
    } catch (e) { res.status(500).json({ success: false }); }
});

// --- ADMIN YOLLARI ---
app.post('/api/admin/all', async (req, res) => {
    if (req.body.password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Yetkisiz" });
    const users = await User.find();
    res.json(users);
});

app.post('/api/admin/approve', async (req, res) => {
    if (req.body.password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Yetkisiz" });
    const { telegramId, investId } = req.body;
    const user = await User.findOne({ telegramId });
    const inv = user.investments.id(investId);
    if(inv) { inv.status = 'Aktif'; inv.createdAt = new Date(); await user.save(); res.json({ success: true }); }
});

app.post('/api/admin/approve-withdraw', async (req, res) => {
    if (req.body.password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Yetkisiz" });
    const { telegramId, withdrawId } = req.body;
    const user = await User.findOne({ telegramId });
    const w = user.withdrawals.id(withdrawId);
    if(w) { w.status = 'Tamamlandı'; await user.save(); res.json({ success: true }); }
});

app.post('/api/admin/delete-invest', async (req, res) => {
    if (req.body.password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Yetkisiz" });
    const { telegramId, investId } = req.body;
    const user = await User.findOne({ telegramId });
    if(user) { user.investments.pull({ _id: investId }); await user.save(); res.json({ success: true }); }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Sunucu Aktif ve Bot Bağlandı`));