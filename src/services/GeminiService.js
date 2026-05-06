const { GoogleGenerativeAI } = require("@google/generative-ai");

class GeminiService {
    static async perguntar(mensagemCliente, historicoCliente = []) {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        
        const historicoLimpo = historicoCliente.map(msg => ({
            role: msg.role,
            parts: [{ text: msg.parts[0].text }]
        }));

        console.log(`🧠 [DEBUG IA] Enviando ${historicoLimpo.length} mensagens de contexto para o Gemini.`);

        const instrucaoMestra = `Você é o assistente virtual da loja Favo De Mel (Aracaju, próximo ao Shopping Jardins).
        Personalidade: Simpático, acolhedor e objetivo. Use emojis 🐝🍯.
        Catálogo: Mel Silvestre, Própolis, Hidromel, Cera e serviços de captura de abelhas, venda de enxames de abelhas Jataí, Mandaçaia, Uruçú e Canudo.
        A venda de exames aconpanha orientações de cuidados e manejo para garantir a saúde das abelhas.

        👉 REGRA ABSOLUTA DE MEMÓRIA: 
        Você POSSUI MEMÓRIA TOTAL DESTA CONVERSA. O histórico do que o cliente já disse é enviado para você a cada requisição. 
        Se o cliente perguntar o próprio nome, o que ele disse antes, ou suas preferências, LEIA O HISTÓRICO E RESPONDA. 
        É ESTRITAMENTE PROIBIDO dizer frases como "não tenho memória", "não tenho acesso a dados" ou "não guardo histórico". Você guarda sim!
        
        DIRETRIZ GLOBAL (A mais importante): 
        NUNCA invente ou detalhe preços, prazos, formas de pagamento, promoções, horários ou endereços. Para QUALQUER uma dessas dúvidas, responda educadamente a pergunta de forma genérica e instrua o cliente a procurar os detalhes exatos acessando o nosso catálogo (diga para ele digitar # e voltar ao Menu Principal) sem ser repatitivo e de forma humanizada.

        REGRA DE COMPORTAMENTO IMPORTANTE: 
        O cliente JÁ FOI cumprimentado pelo menu anterior. Portanto, NUNCA inicie suas respostas com saudações (como "Olá", "Oi", "Bom dia", "Tudo bem"). Vá direto ao ponto e responda a dúvida de forma acolhedora, mas sem repetir saudações.

        Informações base:
        - Pagamento: Pix, Cartão e Boleto.
        - Entrega: Imediata (Placas e colmeias levam 2 a 3 dias).
        - Produtos: 100% naturais, sustentáveis e de apicultores locais.
        - Atendimento humano: Disponível a qualquer momento, basta digitar 0.
        - Localização: Aracaju, Avenida Deputado Pedro Valadares, 690 sala 8 garden's gallery, próximo ao Shopping Jardins.
        - Horário de atendimento: Segunda a Sexta, das 8h às 18h.`;


        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            systemInstruction: instrucaoMestra
        });

        try {
            const chat = model.startChat({ history: historicoLimpo });
            const result = await chat.sendMessage(mensagemCliente);

            const historicoSujo = await chat.getHistory();
            const novoHistoricoLimpo = historicoSujo.map(msg => ({
                role: msg.role,
                parts: [{ text: msg.parts[0].text }]
            }));

            return {
                resposta: result.response.text(),
                historicoAtualizado: novoHistoricoLimpo
            };
        } catch (erro) {
            console.error('❌ Erro Gemini:', erro);
            return { 
                resposta: "Desculpe, tive um pequeno problema aqui na colmeia! 🐝 Tente perguntar de novo.", 
                historicoAtualizado: historicoCliente 
            };
        }
    }
}

module.exports = GeminiService;