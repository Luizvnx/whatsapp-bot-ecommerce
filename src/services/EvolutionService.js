require('dotenv').config(); // 1. O config deve vir antes de tudo para carregar as variáveis
const axios = require('axios');

/**
 * Envia um produto individual do catálogo nativo do WhatsApp Business
 * @param {string} numeroCliente - Número do destinatário (sem o @s.whatsapp.net)
 * @param {string} productId - ID do produto gerado pelo WhatsApp
 * @param {string} textoIntroducao - Mensagem opcional de texto que acompanha o card do produto
 */

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
                text: texto,
                linkPreview: true
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

    static async enviarProdutoNativo(numeroCliente, productIdOrUrl, textoIntroducao = "Veja este produto:") {
        try {
            // Como a versão atual da Evolution API não possui o endpoint /message/sendProduct,
            // a solução recomendada é enviar a URL do catálogo. O WhatsApp do cliente
            // irá gerar automaticamente um "Card Preview" igual ao do catálogo nativo.
            
            let productUrl = String(productIdOrUrl).trim();
            
            // Se o usuário tiver cadastrado apenas o ID (ex: 6609979085680039), reconstruímos o link
            if (!productUrl.includes('wa.me')) {
                const numeroLoja = process.env.NUMERO_DA_LOJA || process.env.EVOLUTION_BUSINESS_NUMBER || '557988125726';
                productUrl = `https://wa.me/p/${productUrl}/${numeroLoja}`;
            }

            const textoComLink = `${textoIntroducao}\n\n🛒 Acesse o produto aqui:\n${productUrl}`;
            
            // Reutiliza a função de texto que agora tem linkPreview: true
            await this.enviarMensagemText(numeroCliente, textoComLink);
            
            return { status: 'success', method: 'link_preview' };
        } catch (error) {
            console.error(`❌ Erro ao enviar produto para ${numeroCliente}:`, error?.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Envia um botão para o cliente abrir a vitrine completa do catálogo no WhatsApp
     * @param {string} numeroCliente - Número do destinatário
     * @param {string} textoMensagem - Texto do corpo da mensagem
     * @param {string} textoBotao - Texto que aparece no botão (Ex: "Ver Catálogo")
     */
    static async enviarCatalogoCompleto(numeroCliente, textoMensagem = "Confira nossos produtos disponíveis!", textoBotao = "Ver Catálogo") {
        try {
            const url = `${evolutionUrl}/message/sendCatalog/${instanceName}`;

            const payload = {
                number: numeroCliente,
                title: textoMensagem,
                buttonText: textoBotao,
                delay: 1000
            };

            const response = await axios.post(url, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': apiKey
                }
            });

            return response.data;
        } catch (error) {
            console.error(`❌ Erro ao enviar catálogo completo para ${numeroCliente}:`, error?.response?.data || error.message);
            throw error;
        }
    }
}

module.exports = EvolutionService;