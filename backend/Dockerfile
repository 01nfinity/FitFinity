FROM node:20-slim
RUN apt-get update -y && apt-get install -y openssl

WORKDIR /app

COPY package*.json ./
# Install ALL dependencies, including dev (like ts-node) because we might build here
RUN npm install

COPY . .

RUN npx prisma generate
RUN npm run build

EXPOSE 5001

CMD ["npm", "start"]
