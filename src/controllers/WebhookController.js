const BotController = require('./botController');
const DatabaseService = require('../services/DatabaseService');

const bufferMensagens = new Map();

class WebhookController {
    static async handleEvolutionWebhook(req, res) {
        res.status(200).send('OK');

        try {
            const payload = req.body;

            // 1. FILTRO CRUCIAL: Só processa mensagens recebidas (ignora o que você envia)
            if (payload.event === 'messages.upsert') {
                const data = payload.data;
                
                // Se a mensagem foi enviada por você (pelo celular da loja), ignoramos
                if (!data?.key || data.key.fromMe === true) return;
                if (!data?.message) return;

                const remoteJid = data.key.remoteJid;
                
                // Captura o texto da mensagem
                const textoMensagem = data.message.conversation || data.message.extendedTextMessage?.text || '';
                
                // Captura o nome de quem enviou (pushName do cliente)
                const nomeContato = data.pushName || 'Desconhecido';
                
                if (!textoMensagem) return;

                // Gerenciamento de Buffer (Agrupamento de mensagens)
                if (!bufferMensagens.has(remoteJid)) {
                    bufferMensagens.set(remoteJid, {
                        dadosOriginais: data,
                        nomeContato: nomeContato,
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
                    
                    // 2. ID COMPLETO: Mantemos o @s.whatsapp.net para bater com o Dashboard
                    const id_cliente = remoteJid;

                    // 3. UPSERT PARAMETRIZADO: Protege contra nomes com aspas e SQL Injection
                    try {
                        const sql = `
                            INSERT INTO tb_bot_sessoes (id_cliente, nome_contato, etapa, ultima_msg, dados_sessao)
                            VALUES ($1, $2, 'inicio', NOW(), '{}')
                            ON CONFLICT (id_cliente) 
                            DO UPDATE SET 
                                nome_contato = EXCLUDED.nome_contato,
                                ultima_msg = NOW();
                        `;
                        // Usamos parâmetros [$1, $2] para evitar erros com nomes tipo "D'Agostino"
                        await DatabaseService.executar(sql, [id_cliente, nomeFinal]);
                    } catch (dbError) {
                        console.error('⚠️ Erro ao processar UPSERT do contato:', dbError.message);
                    }

                    // 4. Envia para a IA
                    await BotController.processarMensagem(dadosParaProcessar);
                    
                }, 3500);
            }
        } catch (erro) {
            console.error('❌ Erro interno ao processar a mensagem:', erro);
        }
    }
}

module.exports = WebhookController;