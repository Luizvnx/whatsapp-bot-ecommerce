// Arquivo: src/services/MercadoPagoService.js

class MercadoPagoService {
    static async gerarPix(produto, valor) {
        // Puxa o token do seu arquivo .env
        const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN; 

        const payloadMP = {
            transaction_amount: valor,
            description: produto,
            payment_method_id: 'pix',
            payer: {
                email: 'cliente.whatsapp@lojavirtual.com' // Email genérico obrigatório
            }
        };

        try {
            const resposta = await fetch('https://api.mercadopago.com/v1/payments', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${ACCESS_TOKEN}`,
                    'X-Idempotency-Key': Date.now().toString()
                },
                body: JSON.stringify(payloadMP)
            });

            // MUDANÇA AQUI: Vamos ler a resposta de erro antes de travar o código!
            if (!resposta.ok) {
                const erroDetalhado = await resposta.json();
                console.error('⚠️ Detalhes da recusa do Mercado Pago:', JSON.stringify(erroDetalhado, null, 2));
                throw new Error('Falha na API do Mercado Pago');
            }

            const dadosPix = await resposta.json();

            return {
                transacaoId: dadosPix.id.toString(),
                pixCopiaECola: dadosPix.point_of_interaction.transaction_data.qr_code
            };
        } catch (erro) {
            console.error('❌ Erro ao gerar Pix:', erro);
            throw erro;
        }
    }
}

module.exports = MercadoPagoService;