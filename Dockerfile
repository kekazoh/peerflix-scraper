# Use a base image with Node.js installed
FROM ghcr.io/puppeteer/puppeteer:23.2.1

USER root

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

RUN mkdir -p /home/pptruser/Downloads \
    && chown -R pptruser:pptruser /home/pptruser \
    && chown -R pptruser:pptruser /app \
    && chown -R pptruser:pptruser /app/node_modules \
    && chown -R pptruser:pptruser /app/package.json \
    && chown -R pptruser:pptruser /app/package-lock.json

USER pptruser

# Set the command to execute when the container starts
CMD ["npm", "start"]