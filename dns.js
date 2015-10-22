var http = require("http"),
    url = require("url"),
    util = require("util"),
    AWS = require("aws-sdk"),
    dns = require("dns"),
    Q = require("q"),
    Marathon = require("./lib/marathon.js"),
    utils = require("./lib/utils.js"),
    debug = require("debug")("dns");

debug.marathon = require("debug")("dns:marathon");
debug.route53 = require("debug")("dns:route53");

// Connect to AWS
AWS.config.region = process.env.AWS_REGION;
AWS.config.credentials = {
	accessKeyId: process.env.AWS_ACCESS_KEY,
	secretAccessKey: process.env.AWS_SECRET_KEY
};

// Create Route53 client
var route53  = new AWS.Route53();
var marathon = new Marathon({base_url: process.env.MARATHON_HOST});

// State of the previous update
var state = null;
var stateTable = null;

// Start the polling timer 
setInterval(function(){

	marathon.apps.list().then(function(res) {
		// Get the apps and filter them out by 'DNS' environment variable
		debug.marathon('querying marathon');
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
		//debug.marathon('querying marathon tasks');
		marathon.tasks.list().then(function(res){
			var records = [];
			res.tasks.forEach(function(task){
				for(var i=0; i< apps.length; ++i){
					var app = apps[i];
					if(app.id != task.appId)
						continue;

					//debug.marathon('creating record: ' + app.dns + '@' + task.host);
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
		update(records);
	})
	.fail(function(err){
		debug(err);
	});

}, 15000);


// Update route53
function update(records){
	// Add the IP Addresses to the table
	buildTable(records).then(function(t){
		// Quick comparison of the tables to avoid additional calls to Route53
		var t0 = stateTable;
		var t1 = utils.clone(t);
		stateTable = t1;

		// Compare now
		if(JSON.stringify(t0) == JSON.stringify(t1)){
			debug('no changes detected');
			return;
		}

		// Retrieve the hosted zones
		var q = Q.defer();
		debug.route53('retrieving route53 hosted zones');
		route53.listHostedZones({}, function(err, data){
			if (err) return q.reject(err);
			return q.resolve({table: t, zones: data});
		});
		return q.promise;
	}).then(function(data){
		// We must have a data to proceed
		if(typeof data === 'undefined' || data == null)
			return;

		// Group by zone for Route53
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
							rec: [],
							del: []
						}
					}

					delete data.table[name]['resolve'];
					groupByZone[zone].rec.push({
						name: name,
						records: data.table[name]
					});
					break;
				}
			}
		}

		// create also public records
		var qPubRec = [];
		for(var zoneName in groupByZone){
			var zone = groupByZone[zoneName];

			// for each subdomain
			zone.rec.forEach(function(r){
				var qAddr = [];
				var vAddr = [];
				var q = Q.defer();
				qPubRec.push(q.promise);
				r.records.addr.forEach(function(addr){
					
					qAddr.push(utils.beacon(addr).then(function(b){
						vAddr.push(JSON.parse(b).public)
					}).fail(function(err){
						debug(err);
					}));
				});

				// When we have the vAddr populated
				Q.allSettled(qAddr).then(function(){
					var pub = utils.clone(r);
					pub.name = 'pub.' + pub.name;
					pub.records.name = pub.name;
					pub.records.addr = vAddr;
					groupByZone[zoneName].rec.push(pub);
					q.resolve();
				});
			});
		}

		// Wait for every ip resolved
		Q.allSettled(qPubRec).then(function(){
			// make sure the data is comparable
			groupByZone = utils.clone(groupByZone);

			// Compare current and previous states, modifying it
			var current = utils.diff(utils.clone(state), utils.clone(groupByZone));
			state = utils.clone(groupByZone);

			// Update the records
			for(var zoneName in current){
				var zone = current[zoneName];
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
		})
	})
	.fail(function(err){
		debug.route53(err);
	});
}


// Updates a single hosted zone 
function updateRecords(zone){
	var q = Q.defer();
	var changes = [];

	// Create the list of records
	zone.rec.forEach(function(change){
		var recordSet = [];
		var addresses = utils.distinct(change.records.addr);
		addresses.forEach(function(addr){
			recordSet.push({
				Value: addr
			})
		});

		debug.route53('changing ' + change.name + " to " +addresses);
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

	// Create the list of deletions
	zone.del.forEach(function(deletion){
		var recordSet = [];
		var addresses = utils.distinct(deletion.records.addr);
		addresses.forEach(function(addr){
			recordSet.push({
				Value: addr
			})
		});

		debug.route53('deleting ' + deletion.name);
		changes.push({
			Action: 'DELETE',
			ResourceRecordSet: {
				Name: deletion.name, 
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
	debug.route53('changing resource record sets: ' + zone.id);
	route53.changeResourceRecordSets(request, function(err, data) {
		if(err) {
			debug.route53(err);
			return q.reject(err);
		}
		return q.resolve()
	});

	return q.promise;
}

// Build a dns table from the records provided
function buildTable(records){	
	var table = {};
	//debug('building dns table');

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
		table[record.name].resolve.push(utils.ipv4(record.host));	
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
					debug(name + ' => ' + value);
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

// Start the server
http.createServer(function (req, res) {  
  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.write('Misakai.Dns')
  res.end();
}).listen(8053);