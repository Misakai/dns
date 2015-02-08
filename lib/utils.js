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
			debug('resolving ipv4 for ' + value);
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


	clone: function(obj){
		return JSON.parse(JSON.stringify(obj));
	}

}