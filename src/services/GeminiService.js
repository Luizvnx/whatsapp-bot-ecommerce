const axios = require('axios');

class GeminiService {
    static get apiKey() {
        return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || null;
    }

    /**
     * Responde dúvidas sobre a Favo de Mel utilizando a API do Gemini via REST
     */
    static async perguntar(mensagemCliente, historicoCliente = []) {
        const key = this.apiKey;
        if (!key) {
            console.warn('⚠️ GEMINI_API_KEY não configurada no .env');
            return {
                resposta: "Desculpe, nosso assistente virtual está temporariamente indisponível. Para falar com a equipe, por favor aguarde um momento! 🐝",
                transferirHumano: true
            };
        }

        const systemInstruction = `Você é a Assistente Virtual Inteligente da loja Favo de Mel (Aracaju/SE).
Sua personalidade: Simpática, acolhedora, objetiva e apaixonada por abelhas e produtos naturais. Use emojis com moderação (🐝🍯🌼).

CONHECIMENTO DA FAVO DE MEL:
- Loja física: Av. Deputado Pedro Valadares, 690, loja 8, Garden's Gallery - Bairro Jardins, Aracaju/SE (próximo ao Shopping Jardins).
- Horário: Segunda a Sexta, das 8h às 18h.
- Produtos:
  * Méis de Abelhas Nativas sem Ferrão (Mel de Jataí R$ 100, Moça Branca R$ 90, Uruçu R$ 80 - ricos em propriedades medicinais e com sabor floral único).
  * Mel com Favo de Cera 700g (R$ 70), Mel de Melato de Bracatinga (R$ 60 - escuro, sabor amadeirado, não cristaliza facilmente), Mel Puro Tradicional 1400g (R$ 67).
  * Própolis Verde e Vermelha (extratos concentrados R$ 30).
  * Geleia Real pura in natura (R$ 53) e em cápsulas (R$ 51).
  * Bebidas e Delícias: Hidromel tradicional (R$ 57 / R$ 28), Melomel de frutas (R$ 28), Molhos artesanais de maracujá, mostarda ou pimenta com mel (R$ 17 a R$ 25).
  * Cera de abelha bruta e alveolada para apicultura e artesanato.
- Serviços Especializados:
  * Captura e Resgate Seguro de Abelhas (remoção ecológica de enxames de residências e empresas para preservação em apiário).
  * Consultoria Apícola e Manejo (capacitação para novos e experientes criadores).
- Dica de ouro sobre mel: A cristalização é um fenômeno natural do mel 100% puro e cru, provando que ele não foi superaquecido ou adulterado!

DIRETRIZES DE RESPOSTA:
1. Responda de forma direta e concisa (máximo de 3 a 4 parágrafos curtos).
2. Se o cliente perguntar o preço ou como comprar, informe o valor e diga para digitar *1* para ver o catálogo e fazer o pedido.
3. Se for uma dúvida que você NÃO saiba responder com certeza (ex: frete para um CEP específico, pedidos de desconto em atacado, parcerias comerciais, reclamações ou assuntos fora do tema):
   RESPONDA OBRIGATORIAMENTE contendo a frase:
   "Essa é uma solicitação específica que vou encaminhar para nossos atendentes humanos. Por favor, aguarde só um momento que já vamos te responder por aqui! 🐝🍯"
4. NUNCA invente informações que você não tem certeza.`;

        // Monta o histórico recente
        const historicoRecente = (historicoCliente || []).slice(-8);
        const contents = [];

        historicoRecente.forEach(item => {
            const role = item.role === 'model' ? 'model' : 'user';
            const texto = (item.parts && item.parts[0]?.text) ? item.parts[0].text : (item.text || '');
            if (texto.trim()) {
                contents.push({ role, parts: [{ text: texto }] });
            }
        });

        contents.push({
            role: 'user',
            parts: [{ text: mensagemCliente }]
        });

        const modelos = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.5-flash-lite'];
        let respostaTexto = '';

        for (const model of modelos) {
            try {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
                const response = await axios.post(url, {
                    system_instruction: {
                        parts: [{ text: systemInstruction }]
                    },
                    contents,
                    generationConfig: {
                        temperature: 0.6,
                        maxOutputTokens: 600
                    }
                }, { timeout: 12000 });

                const cand = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (cand) {
                    respostaTexto = cand.trim();
                    break;
                }
            } catch (err) {
                console.warn(`[GeminiService] Falha no modelo ${model}, tentando fallback...`);
            }
        }

        if (!respostaTexto) {
            return {
                resposta: "Estou com uma pequena instabilidade para consultar as informações no momento. Vou transferir para nossa equipe te atender em instantes! 🐝",
                transferirHumano: true
            };
        }

        const transferirHumano = respostaTexto.includes('encaminhar para nossos atendentes humanos') ||
                                 respostaTexto.includes('solicitação específica que vou encaminhar') ||
                                 respostaTexto.includes('aguarde só um momento que já vamos te responder');

        return {
            resposta: respostaTexto,
            transferirHumano
        };
    }
}

module.exports = GeminiService;