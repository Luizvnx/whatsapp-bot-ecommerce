const BotController = require('./botController');

const bufferMensagens = new Map();

class WebhookController {
    static async handleEvolutionWebhook(req, res) {
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
    }
}

module.exports = WebhookController;