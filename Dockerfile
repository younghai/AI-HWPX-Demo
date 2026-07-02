FROM node:20-slim

RUN apt-get update && apt-get install -y python3 python3-pip python3-venv libcairo2 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm install

COPY . .

ENV PORT=8792
EXPOSE 8792

CMD ["npm", "run", "dev"]
