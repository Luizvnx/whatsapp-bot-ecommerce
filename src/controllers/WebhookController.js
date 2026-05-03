const BotController = require('./botController');
const DatabaseService = require('../services/DatabaseService');

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
                // 1. Captura o nome do WhatsApp (ou define como Desconhecido)
                const nomeContato = data.pushName || 'Desconhecido';
                
                if (!textoMensagem) return;

                if (!bufferMensagens.has(remoteJid)) {
                    bufferMensagens.set(remoteJid, {
                        dadosOriginais: data,
                        nomeContato: nomeContato, // 👈 Guarda o nome no estado do buffer
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
                    const nomeFinal = sessaoBuffer.nomeContato;
                    bufferMensagens.delete(remoteJid);
                    
                    // 2. Extrai o ID limpo (apenas números)
                    const id_cliente = remoteJid.replace(/\D/g, '');

                    // 3. UPSERT: Grava o nome no banco de dados ANTES de chamar o BotController
                    try {
                        const sql = `
                            INSERT INTO tb_bot_sessoes (id_cliente, nome_contato, etapa, ultima_msg, dados_sessao)
                            VALUES ('${id_cliente}', '${nomeFinal}', 'inicio', NOW(), '{}')
                            ON CONFLICT (id_cliente) 
                            DO UPDATE SET 
                                nome_contato = EXCLUDED.nome_contato,
                                ultima_msg = NOW();
                        `;
                        await DatabaseService.executar(sql);
                    } catch (dbError) {
                        console.error('⚠️ Erro ao processar UPSERT do contato:', dbError);
                    }

                    // 4. Envia os dados para a IA continuar o atendimento
                    await BotController.processarMensagem(dadosParaProcessar);
                    
                }, 3500);
            }
        } catch (erro) {
            console.error('❌ Erro interno ao processar a mensagem:', erro);
        }
    }
}

module.exports = WebhookController;