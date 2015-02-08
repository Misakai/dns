var http = require("http"),
    url = require("url"),
    path = require("path"),
    fs = require("fs"),
    AWS = require("aws-sdk"),
    dns = require("dns"),
    Q = require("q"),
    Marathon = require("./lib/marathon.js"),
    debug = require("debug")("dns"),
    port = process.argv[2] || 8888;

debug.marathon = require("debug")("dns:marathon");
debug.route53 = require("debug")("dns:route53");

/*http.createServer(function(request, response) {

  var uri = url.parse(request.url).pathname
    , filename = path.join(process.cwd(), uri);

  path.exists(filename, function(exists) {
    if(!exists) {
      response.writeHead(404, {"Content-Type": "text/plain"});
      response.write("404 Not Found\n");
      response.end();
      return;
    }

    if (fs.statSync(filename).isDirectory()) filename += '/index.html';

    fs.readFile(filename, "binary", function(err, file) {
      if(err) {        
        response.writeHead(500, {"Content-Type": "text/plain"});
        response.write(err + "\n");
        response.end();
        return;
      }

      response.writeHead(200);
      response.write(file, "binary");
      response.end();
    });
  });
}).listen(parseInt(port, 10));*/

// Connect to AWS
AWS.config.region = 'eu-west-1';
AWS.config.credentials = {
	accessKeyId: process.env.AWS_ACCESS_KEY, 
	secretAccessKey: process.env.AWS_SECRET_KEY
};

// Create Route53 client
var route53  = new AWS.Route53();
var marathon = new Marathon({base_url: process.env.MARATHON_HOST});

// Start the polling timer 
setTimeout(function(){

	marathon.apps.list().then(function(res) {
		// Get the apps and filter them out by 'DNS' environment variable
		debug.marathon('querying marathon applications');
		var targets = [];
		res.apps.forEach(function(app){
			if(typeof app.env['DNS'] != 'undefined')
				targets.push({
					id: app.id,
					dns: app.env['DNS']
				});
		});
		return targets;
	})
	.then(function(apps){
		var q = Q.defer()
		debug.marathon('querying marathon tasks');
		marathon.tasks.list().then(function(res){
			var records = [];
			res.tasks.forEach(function(task){
				for(var i=0; i< apps.length; ++i){
					var app = apps[i];
					if(app.id != task.appId)
						continue;

					debug.marathon('creating record: ' + app.dns + '@' + task.host);
					records.push({
						name: app.dns,
						host: task.host
					})
				}
			});

			q.resolve(records);
		});
		return q.promise;
	})
	.then(function(records){
		debug('updating route53');
		update(records);
	})
	.fail(function(err){
		debug(err);
	});

	

	/*update([{ 
		name: "test.misakai.com",
		host: "127.0.0.1"
	}, { 
		name: "http://test.misakai.com",
		host: "api.misakai.com"
	}, { 
		name: "some.service.here.misakai.com",
		host: "api.misakai.com"
	}])*/

}, 1000);


// Update route53
function update(records){
	// Add the IP Addresses to the table
	buildTable(records).then(function(t){
		// Retrieve the hosted zones
		var q = Q.defer();
		debug('retrieving route53 hosted zones');
		route53.listHostedZones({}, function(err, data){
			if (err) return q.reject(err);
			return q.resolve({table: t, zones: data});
		});
		return q.promise;
	}).then(function(data){
		var groupByZone = {};
		for(var name in data.table){
			var hname = name.split('.')
			if(hname.length < 3)
				continue;

			// Get a hosted zone name and a prefix
			var zone = hname[hname.length - 2] + '.' + hname[hname.length - 1];
			var zone = zone + '.';

			// Find the appropriate hosting zone (must exist)
			for(var i=0; i< data.zones.HostedZones.length; ++i){
				var hostedZone = data.zones.HostedZones[i];
				if(hostedZone.Name == zone){
					if(typeof groupByZone[zone] === 'undefined'){
						groupByZone[zone] = {
							id: hostedZone.Id,
							changes: []
						}
					}

					groupByZone[zone].changes.push({
						name: name,
						records: data.table[name]
					});
					break;
				}
			}
		}

		// Update the records
		for(var zoneName in groupByZone){
			var zone = groupByZone[zoneName];
			updateRecords(zone).then(function(){
				debug.route53('updated ' + zoneName);
			})
			.fail(function(err){
				debug.route53(err);
			});
		}
		
	})
	.fail(function(err){
		debug.route53(err);
	});
}

// Updates a single hosted zone 
function updateRecords(zone){
	var q = Q.defer();

	// Create the list of records
	var changes = [];
	zone.changes.forEach(function(change){
		var recordSet = [];
		change.records.addr.forEach(function(addr){
			recordSet.push({
				Value: addr
			})
		});

		
		changes.push({
			Action: 'UPSERT',
			ResourceRecordSet: {
				Name: change.name, 
				Type: 'A',
				ResourceRecords: recordSet,
				TTL: 300
			}
		});

	});

	// Prepare the request
	var request = {
		HostedZoneId: zone.id,
		ChangeBatch: {
			Changes: changes
		}
	};

	// Send the request
	/*route53.changeResourceRecordSets(request, function(err, data) {
		if(err) return q.reject(err);
		return q.resolve()
	});*/

	return q.promise;
}

// Build a dns table from the records provided
function buildTable(records){	
	var table = {};
	debug('building dns table');

	// Create the records in the table
	records.forEach(function(record){
		record.name = (record.name.indexOf('://') != -1) 
			? url.parse(record.name).hostname
			: record.name;

		if(typeof table[record.name] === 'undefined')
			table[record.name] = {
				name: record.name,
				resolve: [],
				addr: []
			};

		// Push resolve functions
		table[record.name].resolve.push(ipv4(record.host));	
	});

	// Resolve each record
	var q = [];
	for(var name in table){
		table[name].resolve.forEach(function(promise){
			q.push(promise);
		})
	}

	return Q.allSettled(q).then(function(results){
		for(var name in table){
			var requests = table[name].resolve;
			for(var i=0; i< requests.length; ++i){
				var request = requests[i];
				if(request.isFulfilled()){
					var value = request.inspect().value;
					debug('node ipv4 for ' + name + ' = ' + value);
					value.forEach(function(addr){
						// If we have an array, iterate through
						if( Object.prototype.toString.call( addr ) === '[object Array]' ) {
							addr.forEach(function(subAddr){
								table[name].addr.push(subAddr);
							});
						}

						// Single address
						if( typeof addr === 'string' ){
							table[name].addr.push(addr);
						}
					})
				}
			}
		}
		return table;
	}).fail(function(err){
		debug(err);
	});
}

// Retrieves & validates an IPv4 value
function ipv4(value) {
	if (/^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(value)){
		return Q.fcall(function(){ return [value]});
	}
	
	return Q.fcall(function(){ 
		var q = Q.defer();
		dns.resolve4(value, function (err, addresses) {
			if (err){ q.reject(err); }
			return q.resolve(addresses);
		});
		return q.promise;
	});
}

// Mixin unique/distinct
Array.prototype.distinct = function(){
   var u = {}, a = [];
   for(var i = 0, l = this.length; i < l; ++i){
      if(u.hasOwnProperty(this[i])) {
         continue;
      }
      a.push(this[i]);
      u[this[i]] = 1;
   }
   return a;
}

console.log("Static file server running at\n  => http://localhost:" + port + "/\nCTRL + C to shutdown");