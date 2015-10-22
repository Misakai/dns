FROM nano/node.js
MAINTAINER Roman Atachiants "roman@misakai.com"

# Extract & Install
COPY . /app
WORKDIR /app

# since we are using nano image, we can't run npm
#RUN npm install

# Http Port
EXPOSE 8053
ENV AWS_REGION eu-west-1

CMD ["/usr/bin/node", "/app/dns.js"]