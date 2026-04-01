/*import { MercadoPagoConfig, Payment } from 'mercadopago'

const client = new MercadoPagoConfig({
    accessToken: process.env.MP_ACCESS_TOKEN,
    options: {
        timeout: 10000, // Tempo  limite de 10 segundos para as requisições
        idempotencyKey: () => Date.now().toString() // Gera uma chave de idempotência única para cada requisição
    }
})

export async function gerarPix(produto, valor) {
    try {
        const pagamento = new Payment(client)
        const resposta = await pagamento.create({
            transaction_amount: valor,
            description: produto,
            payment_method_id: 'pix',
            payer: {
                email: '<EMAIL>'
            }
        })
        return resposta
    } catch (error) {
        console.error('Erro ao gerar PIX:', error)
        throw error
    }
}
*/

// Step 1: Import the parts of the module you want to use
import { MercadoPagoConfig, Order } from "mercadopago";

// Step 2: Initialize the client object
const client = new MercadoPagoConfig({
	accessToken: process.env.MP_ACCESS_TOKEN,
	options: { timeout: 5000 },
});

// Step 3: Initialize the API object
const order = new Order(client);

// Step 4: Create the request object
const body = {
            transaction_amount: valor,
            description: 'TESTE API PIX',
            payment_method_id: 'pix',
            payer: {
                email: 'luizvnx@gmail.com' // Email genérico obrigatório
            }
        };

// Step 5: Create request options object - Optional

// Step 6: Make the request
order.create({ body }).then(console.log).catch(console.error);