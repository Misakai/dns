var dns = require("dns"),
    Q = require("q"),
    debug = require("debug")("dns");


module.exports = {

	// Retrieves & validates an IPv4 value
	ipv4: function(value) {
		if(value.indexOf('compute.internal') != -1){
			value = value.replace('ip-', '');
			value = value.split('.')[0];
			value = value.replace(/-/g, '.');
		}

		if (/^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(value)){
			return Q.fcall(function(){ return [value]});
		}
		
		return Q.fcall(function(){ 
			var q = Q.defer();
			//debug('resolving ipv4 for ' + value);
			dns.resolve4(value, function (err, addresses) {
				if (err){ q.reject(err); }
				return q.resolve(addresses);
			});
			return q.promise;
		});
	},

	// Mixin unique/distinct
	distinct: function(arr){
	   var a = [];
	    for (var i=0, l=arr.length; i<l; i++)
	        if (a.indexOf(arr[i]) === -1 && arr[i] !== '')
	            a.push(arr[i]);
	    return a;
	},


	// Clones an object
	clone: function(obj){
		return JSON.parse(JSON.stringify(obj));
	},


	// Compare current and previous states, modifying it
	diff: function (previous, current){
		if(previous == null)
			return current;

		// test:
		//previous = current;
		//current = new Object();

		// Check if we have hosted zone deletions
		for(var zone in previous){
			if(typeof current[zone] === 'undefined'){
				debug('delete: ' + zone);
				current[zone] = {
					id: JSON.parse(JSON.stringify(previous[zone].id)),
					rec: [],
					del: JSON.parse(JSON.stringify(previous[zone].rec))
				}
			}
		}

		for(var zone in previous){
			var pZone = previous[zone];
			var cZone = current[zone];

			// Do we have any changes?
			if(JSON.stringify(pZone) == JSON.stringify(cZone)){
				// No actual changes, remove from the current
				debug('no changes for ' + zone);
				delete current[zone];
			}

			// Already done
			if(cZone.rec.length == 0)
				continue;

			// Detect changes
			for(var i=0; i<pZone.rec.length;++i){
				var pName = pZone.rec[i].name;
				var match = false;
				for(var j=0; j<cZone.rec.length;++j){
					var cName = cZone.rec[j].name;
					if(cName == pName){
						// We still have the subdomain
						match = true;
						break;	
					} 
				}

				// If we didn't find a match, we have to delete it
				if(!match){
					debug('delete: ' + pName);
					current[zone].del.push(pZone.rec[i]);
				}
			}
			
		}

		return current;
	}

}