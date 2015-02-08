FROM nano/node.js
MAINTAINER Roman Atachiants "roman@misakai.com"

# Extract & Install
COPY . /app
WORKDIR /app
RUN npm install

# Http Port
EXPOSE 80

CMD ["/usr/bin/node", "/app/dns.js"]