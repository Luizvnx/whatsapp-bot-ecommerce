const BotController = require('./botController');
const DatabaseService = require('../services/DatabaseService');

const bufferMensagens = new Map();
const MAX_BUFFER_SIZE = 1000; // Evita estouro de memória

class WebhookController {
    static async handleEvolutionWebhook(req, res) {
        res.sendStatus(200); // Resposta imediata para a Evolution API

        const { event, data } = req.body;
        if (event !== 'messages.upsert' || data?.key?.fromMe) return;

        const remoteJid = data.key.remoteJid;
        const texto = data.message?.conversation || data.message?.extendedTextMessage?.text || '';
        if (!texto) return;

        // Limpeza preventiva de memória
        if (bufferMensagens.size > MAX_BUFFER_SIZE) bufferMensagens.clear();

        if (!bufferMensagens.has(remoteJid)) {
            bufferMensagens.set(remoteJid, { 
                data, 
                textos: [], 
                timer: null,
                nome: data.pushName || 'Cliente' 
            });
        }

        const sessaoBuffer = bufferMensagens.get(remoteJid);
        sessaoBuffer.textos.push(texto);

        clearTimeout(sessaoBuffer.timer);
        sessaoBuffer.timer = setTimeout(() => WebhookController.finalizarProcessamento(remoteJid), 3500);
    }

    static async finalizarProcessamento(remoteJid) {
        const buffer = bufferMensagens.get(remoteJid);
        if (!buffer) return;

        const textoCompleto = buffer.textos.join(' ');
        buffer.data.message.conversation = textoCompleto; // Normaliza para o BotController

        try {
            // Upsert seguro
            const sql = `
                INSERT INTO tb_bot_sessoes (id_cliente, nome_contato) 
                VALUES ($1, $2)
                ON CONFLICT (id_cliente) DO UPDATE SET 
                    nome_contato = EXCLUDED.nome_contato, 
                    ultima_msg = NOW();
            `;
            await DatabaseService.executar(sql, [remoteJid, buffer.nome]);
            
            await BotController.processarMensagem(buffer.data);
        } catch (err) {
            console.error('❌ Erro no processamento final:', err.message);
        } finally {
            bufferMensagens.delete(remoteJid);
        }
    }
}

module.exports = WebhookController;