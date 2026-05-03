require('dotenv').config(); // 1. O config deve vir antes de tudo para carregar as variáveis
const axios = require('axios');

// 2. Buscamos as configurações das variáveis de ambiente da Railway
const evolutionUrl = process.env.EVOLUTION_URL; 
const instanceName = process.env.EVOLUTION_INSTANCE_NAME || 'FavoDeMel';
const apiKey = process.env.EVOLUTION_API_KEY;

class EvolutionService {
    static async enviarMensagemText(numero, texto) {
        // 3. Montamos a URL dinâmica usando a variável da nuvem
        const url = `${evolutionUrl}/message/sendText/${instanceName}`; 

        try {
            await axios.post(url, { 
                number: numero, 
                text: texto 
            }, {
                headers: { 
                    'apikey': apiKey, 
                    'Content-Type': 'application/json' 
                }
            });
            console.log(`✅ Mensagem enviada para ${numero}`);
        } catch (erro) {
            console.error('[Erro Evolution] Falha ao enviar mensagem:', erro.response ? erro.response.data : erro.message);
        }
    }
    
    static async gerenciarEtiqueta(numero, labelId, acao = 'add') {
        if (!labelId) {
            console.error(`⚠️ [Aviso] Tentativa de ${acao} etiqueta, mas labelId está undefined.`);
            return;
        }

        const url = `${evolutionUrl}/label/handleLabel/${instanceName}`; 
        try {
            await axios.post(url, { 
                number: numero, 
                labelId: String(labelId), 
                action: acao 
            }, {
                headers: { 
                    'apikey': apiKey, 
                    'Content-Type': 'application/json' 
                }
            });
            console.log(`🏷️ Etiqueta ${labelId} ${acao === 'add' ? 'adicionada' : 'removida'} para ${numero}`);
        } catch (erro) {
            console.error(`[Erro Evolution] Falha ao ${acao} etiqueta ${labelId} para ${numero}:`, erro.response ? erro.response.data : erro.message);
        }
    }
}

module.exports = EvolutionService;