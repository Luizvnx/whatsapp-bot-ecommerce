const pool = require('../config/db');

class PedidoRepository {

    static async criarPedido(transacaoId, produto, valor) {
        try {
            const [resultado] = await pool.execute(
                'INSERT INTO pedidos (transacao_id, produto, valor, status_pagamento) VALUES (?, ?, ?, ?)',
                [transacaoId, produto, valor, 'pendente']
            );
            return resultado.insertId;
        } catch (erro) {
            console.error('❌ Erro ao criar pedido no banco:', erro);
            throw erro;
        }
    }

    static async atualizarStatusPagamento(transacaoId, status) {
        try {
            let query = 'UPDATE pedidos SET status_pagamento = ? WHERE transacao_id = ?';
            
            if (status === 'pago' || status === 'approved') {
                query = 'UPDATE pedidos SET status_pagamento = ?, data_pagamento = NOW() WHERE transacao_id = ?';
            }

            const [resultado] = await pool.execute(query, [status, transacaoId]);
            return resultado.affectedRows > 0;

        } catch (erro) {
            console.error('❌ Erro de banco de dados:', erro);
            throw erro; 
        }
    }
}

module.exports = PedidoRepository;