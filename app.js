const express = require('express');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const webhookRoutes = require('./src/routes/webhookRoutes');
const whatsappClient = require('./src/config/whatsapp');
const botController = require('./src/controllers/botController');

app.use(express.json()); 
app.use('/webhook', webhookRoutes);

whatsappClient.initialize();

whatsappClient.on('message_create', async (msg) => {
    try {
        await botController.processarMensagem(msg);
    } catch (error) {
        console.error('Erro ao processar mensagem:', error);
    }
});


app.listen(PORT, () => {
    console.log(`🚀 Servidor de Webhooks rodando na porta ${PORT}`);
});