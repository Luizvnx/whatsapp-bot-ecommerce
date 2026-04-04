const axios = require('axios');
const apiKey = process.env.EVOLUTION_API_KEY;
require('dotenv').config();


class EvolutionService {
    static async enviarMensagemText(numero, texto) {
        const url = 'http://localhost:8081/message/sendText/FavoDeMel'; 

        try {
            await axios.post(url, { number: numero, text: texto }, {
                headers: { 'apikey': apiKey, 'Content-Type': 'application/json' }
            });
        } catch (erro) {
            console.error('[Erro Evolution] Falha ao enviar mensagem:', erro.response ? erro.response.data : erro.message);
        }
    }
    
    static async gerenciarEtiqueta(numero, labelId, acao = 'add') {
        const url = 'http://localhost:8081/label/handleLabel/FavoDeMel'; 
        try {
            await axios.post(url, { number: numero, labelId: String(labelId), action: acao }, {
                headers: { 'apikey': apiKey, 'Content-Type': 'application/json' }
            });
        } catch (erro) {
            // Silencioso para não travar o bot
        }
    }
}

module.exports = EvolutionService;