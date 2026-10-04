# Usa uma imagem leve e segura do Node.js
FROM node:22-alpine

# Define o diretório de trabalho dentro do container
WORKDIR /usr/src/app

# Copia os arquivos de dependência primeiro (para otimizar o cache do Docker)
COPY package*.json ./

# Instala as dependências
RUN npm install --production

# Copia todo o resto do código para dentro do container
COPY . .

# Expõe a porta que o seu servidor Express usa (padrão 8080)
EXPOSE 8080

# Comando para iniciar o cérebro do bot com otimização de memória
CMD ["node", "--max-old-space-size=128", "--optimize-for-size", "app.js"]