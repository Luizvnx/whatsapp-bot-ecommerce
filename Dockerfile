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

# Expõe a porta que o seu servidor Express usa (porta 3000 do .env)
EXPOSE 3000

# Comando para iniciar o cérebro do bot
CMD ["node", "app.js"]