# DNS Service Discovery
### Service Discovery with AWS Route53, Mesos, Marathon & Docker

Misakai.Dns is a service discovery project which takes advantage of AWS Route53 DNS service and Mesos Marathon to automatically register the applications deployed with Marathon to Route53 DNS. This build creates a tiny Docker image you can simply deploy into your infrastructure, and the configuration is managed on per-app basis using *environment variables*.

It is *recommended* to launch misakai/dns into your cluster using Marathon for availability. You will need only one instance of the DNS running, since it simply queries both Marathon and AWS Route53.

# Deploying Misakai.DNS
In order to deploy **Misakai.Dns** into your cluster, submit a Marathon app with similar configuration:
```json
{
  "id": "dns",
  "cpus": 0.1,
  "mem": 32.0,
  "instances": 1,
  "ports": [8053],
  "requirePorts": true,
  "container": {
    "type": "DOCKER",
    "docker": {
      "image": "misakai/dns:latest"
    }
  },
  "env": {
    "DNS": "dns.example.com",
    "MARATHON_HOST": "http://127.0.0.1",
    "MARATHON_AUTH": "username:password",
    "AWS_ACCESS_KEY": "XXX",
    "AWS_SECRET_KEY": "XXX",
    "AWS_REGION": "eu-west-1"
  },
  "healthChecks": [{
      "protocol": "HTTP",
      "path": "/",
      "portIndex": 0,
      "gracePeriodSeconds": 5,
      "intervalSeconds": 10,
      "timeoutSeconds": 10,
      "maxConsecutiveFailures": 3
    }
  ] 
}

```

The parameters:
* **MARATHON_HOST**: the URL of marathon REST API 
* **MARATHON_AUTH**: the optional username:password combination for marathon REST API
* **AWS_ACCESS_KEY, AWS_SECRET_KEY**, **AWS_REGION**: AWS Access, Secret Key, and Region. This only requires Route53 access.
* **DNS**: optional hostname to register itself into

# Using Misakai.DNS
Using the DNS is rather straightforward, you simply need to add **'DNS' environment variable*** with the entire name you wish that service to register. In the example below, we have **myservice.example.com** where **example.com** will be the target hosted zone in AWS Route53 to register the service into.
```json
"env": {
  "DNS": "myservice.example.com"
}
```

A more complete example:
```json
{
  "id": "solr",
  "cpus": 0.25,
  "mem": 256.0,
  "instances": 1,
  "ports": [8990],
  "requirePorts": true,
  "container": {
    "type": "DOCKER",
    "docker": {
      "image": "manycore/solr"
    }
  },
  "env": {
    "DNS": "solr.example.com"
  }
}
```
