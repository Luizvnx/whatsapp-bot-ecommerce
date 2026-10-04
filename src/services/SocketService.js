const { Server } = require('socket.io');

class SocketService {
    static io = null;

    /**
     * Inicializa a instância do Socket.io vinculada ao servidor HTTP
     * @param {import('http').Server} httpServer 
     */
    static inicializar(httpServer) {
        this.io = new Server(httpServer, {
            cors: {
                origin: '*',
                methods: ['GET', 'POST']
            }
        });

        this.io.on('connection', (socket) => {
            console.log(`🔌 [Socket.io] Novo painel conectado: ${socket.id}`);

            socket.on('disconnect', (reason) => {
                console.log(`🔌 [Socket.io] Painel desconectado (${socket.id}): ${reason}`);
            });
        });

        console.log('⚡ [SocketService] Servidor WebSocket (Socket.io) inicializado com sucesso.');
        return this.io;
    }

    /**
     * Emite uma nova mensagem para todos os clientes conectados ao painel
     */
    static emitirNovaMensagem(idCliente, mensagem, nomeContato = 'Cliente') {
        if (!this.io) return;

        const numeroLimpo = idCliente.split('@')[0];
        this.io.emit('nova_mensagem', {
            idCliente,
            numeroLimpo,
            nomeContato,
            mensagem
        });
    }

    /**
     * Emite atualização no status da conexão com o WhatsApp/Evolution
     */
    static emitirStatusInstancia(statusData) {
        if (!this.io) return;
        this.io.emit('status_instancia', statusData);
    }

    /**
     * Emite notificação de mensagem apagada / marcada como excluída
     */
    static emitirMensagemApagada(idCliente, idMensagem, info = {}) {
        if (!this.io) return;

        const numeroLimpo = idCliente.split('@')[0];
        this.io.emit('mensagem_apagada', {
            idCliente,
            numeroLimpo,
            idMensagem,
            ...info
        });
    }
}

module.exports = SocketService;
