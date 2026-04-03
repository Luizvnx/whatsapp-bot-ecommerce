require('dotenv').config();
const express = require('express');
const BotController = require('./src/controllers/botController');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json()); 
app.post('/webhook/evolution', async (req, res) => {
    res.status(200).send('OK'); 

    try {
        const payload = req.body;

        if (payload.event === 'messages.upsert') {
            await BotController.processarMensagem(payload.data);
        }
    } catch (erro) {
        console.error('❌ Erro interno ao processar a mensagem:', erro);
    }
});

//whatsappClient.initialize();

app.listen(PORT, () => {
    console.log(`🤖 Cérebro do Bot rodando na porta ${PORT}`);
    console.log(`🔗 URL do Webhook: http://localhost:${PORT}/webhook/evolution`);
});