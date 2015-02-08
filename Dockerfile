FROM nano/nodejs
MAINTAINER Roman Atachiants "roman@misakai.com"

# Extract & Install
COPY . /app
WORKDIR /app
RUN npm install

# Http Port
EXPOSE 80

CMD ["node", "/app/dns.js"]