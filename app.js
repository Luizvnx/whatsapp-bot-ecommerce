require('dotenv').config();
const express = require('express');
const BotController = require('./src/controllers/botController');
const DatabaseService = require('./src/services/DatabaseService');

const app = express();
const PORT = process.env.PORT || 3000;
DatabaseService.inicializar();

app.use(express.json()); 
// 👇 1. Criamos um "estacionamento" temporário na memória RAM
const bufferMensagens = new Map();

app.post(['/webhook/evolution', '/webhook/evolution/messages-upsert'], async (req, res) => {
    res.status(200).send('OK');

    try {
        const payload = req.body;

        if (payload.event === 'messages.upsert') {
            const data = payload.data;
            if (!data?.key || !data?.message) return;

            const remoteJid = data.key.remoteJid;
            
            const textoMensagem = data.message.conversation || data.message.extendedTextMessage?.text || '';
            if (!textoMensagem) return;

            if (!bufferMensagens.has(remoteJid)) {
                bufferMensagens.set(remoteJid, {
                    dadosOriginais: data,
                    textos: [],
                    timer: null
                });
            }

            const sessaoBuffer = bufferMensagens.get(remoteJid);
            sessaoBuffer.textos.push(textoMensagem);
            clearTimeout(sessaoBuffer.timer);

            sessaoBuffer.timer = setTimeout(async () => {
                const textoCombinado = sessaoBuffer.textos.join(' ');
                
                if (sessaoBuffer.dadosOriginais.message.conversation) {
                    sessaoBuffer.dadosOriginais.message.conversation = textoCombinado;
                } else if (sessaoBuffer.dadosOriginais.message.extendedTextMessage) {
                    sessaoBuffer.dadosOriginais.message.extendedTextMessage.text = textoCombinado;
                }

                const dadosParaProcessar = sessaoBuffer.dadosOriginais;
                bufferMensagens.delete(remoteJid);
                
                await BotController.processarMensagem(dadosParaProcessar);
                
            }, 3500);
        }
    } catch (erro) {
        console.error('❌ Erro interno ao processar a mensagem:', erro);
    }
});

setInterval(() => {
    DatabaseService.limparSessoesInativas();
}, 24 * 60 * 60 * 1000);

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🤖 Cérebro do Bot rodando na porta ${PORT}`);
    console.log(`🔗 URL do Webhook: http://localhost:${PORT}/webhook/evolution`);
});