(function() {
  var Api, AppApi, AppTasksApi, AppVersionApi, AppVersionsApi, AppsApi, Marathon, Rest, TasksApi,
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  Rest = require('rest.node');

  Api = {
    Apps: AppsApi = (function() {
      function AppsApi(client) {
        this.client = client;
      }

      AppsApi.prototype.list = function(cb) {
        return this.client.get('/v2/apps', cb);
      };

      AppsApi.prototype.create = function(data, cb) {
        return this.client.post('/v2/apps', data, cb);
      };

      return AppsApi;

    })(),
    App: AppApi = (function() {
      function AppApi(client, app_id) {
        this.client = client;
        this.app_id = app_id;
        this.tasks = new Api.AppTasks(this.client, this.app_id);
        this.versions = new Api.AppVersions(this.client, this.app_id);
      }

      AppApi.prototype.get = function(cb) {
        return this.client.get("/v2/apps/" + this.app_id, cb);
      };

      AppApi.prototype.update = function(data, cb) {
        return this.client.put("/v2/apps/" + this.app_id, data, cb);
      };

      AppApi.prototype.destroy = function(cb) {
        return this.client["delete"]("/v2/apps/" + this.app_id, cb);
      };

      AppApi.prototype.version = function(version_id) {
        return new ApiAppVersion(this.client, this.app_id, this.version_id);
      };

      return AppApi;

    })(),
    AppVersions: AppVersionsApi = (function() {
      function AppVersionsApi(client, app_id) {
        this.client = client;
        this.app_id = app_id;
      }

      AppVersionsApi.prototype.list = function(cb) {
        return this.client.get("/v2/apps/" + this.app_id + "/versions", cb);
      };

      return AppVersionsApi;

    })(),
    AppVersion: AppVersionApi = (function() {
      function AppVersionApi(client, app_id, version_id) {
        this.client = client;
        this.app_id = app_id;
        this.version_id = version_id;
      }

      AppVersionApi.prototype.get = function(cb) {
        return this.client.get("/v2/apps/" + this.app_id + "/versions/" + this.version_id, cb);
      };

      return AppVersionApi;

    })(),
    AppTasks: AppTasksApi = (function() {
      function AppTasksApi(client, app_id) {
        this.client = client;
        this.app_id = app_id;
      }

      AppTasksApi.prototype.list = function(cb) {
        return this.client.get("/v2/apps/" + this.app_id + "/tasks", cb);
      };

      AppTasksApi.prototype.killAll = function(cb) {
        return this.client["delete"]("/v2/apps/" + this.app_id + "/tasks", cb);
      };

      AppTasksApi.prototype.kill = function(task_id, cb) {
        return this.client["delete"]("/v2/apps/" + this.app_id + "/tasks/" + task_id, cb);
      };

      return AppTasksApi;

    })(),
    Tasks: TasksApi = (function() {
      function TasksApi(client) {
        this.client = client;
      }

      TasksApi.prototype.list = function(cb) {
        return this.client.get('/v2/tasks', cb);
      };

      return TasksApi;

    })()
  };

  Marathon = (function(_super) {
    __extends(Marathon, _super);

    Marathon.hooks = {
      json: function(request_opts, opts) {
        if (request_opts.headers == null) {
          request_opts.headers = {};
        }
        if(typeof process.env.MARATHON_AUTH !== 'undefined'){
          request_opts.headers['Authorization'] = 'Basic ' + new Buffer(process.env.MARATHON_AUTH).toString('base64')
        }

        request_opts.headers.Accept = 'application/json';
        return request_opts.headers['Content-Type'] = 'application/json';
      },
      json_data: function(request_opts, opts) {
        if (request_opts.headers == null) {
          request_opts.headers = {};
        }
        if(typeof process.env.MARATHON_AUTH !== 'undefined'){
          request_opts.headers['Authorization'] = 'Basic ' + new Buffer(process.env.MARATHON_AUTH).toString('base64')
        }

        return request_opts.json = opts;
      },
      querystring_data: function(request_opts, opts) {
        if (request_opts.headers == null) {
          request_opts.headers = {};
        }
        if(typeof process.env.MARATHON_AUTH !== 'undefined'){
          request_opts.headers['Authorization'] = 'Basic ' + new Buffer(process.env.MARATHON_AUTH).toString('base64')
        }

        return request_opts.qs = opts;
      }
    };

    function Marathon(options) {
      this.options = options != null ? options : {};
      if (this.options.base_url == null) {
        throw new Error('Must supply base_url to the Marathon constructor. e.g. new Marathon({base_url: "http://marathon.example.com:8080"})');
      }
      if(this.options.base_url.indexOf('://') == -1)
        this.options.base_url = 'http://' + this.options.base_url;
      
      Marathon.__super__.constructor.call(this, {
        base_url: this.options.base_url.replace(/v[0-9]\/?$/g, '')
      });
      this.hook('pre:request', Marathon.hooks.json);
      this.hook('pre:get', Marathon.hooks.querystring_data);
      this.hook('pre:put', Marathon.hooks.json_data);
      this.hook('pre:post', Marathon.hooks.json_data);
      this.apps = new Api.Apps(this);
      this.tasks = new Api.Tasks(this);
    }

    Marathon.prototype.app = function(app_id) {
      return new Api.App(this, app_id);
    };

    Marathon.prototype.task = function(task_id) {
      return new Api.Task(this, task_id);
    };

    Marathon.prototype.info = function(cb) {
      return this.client.get('/info');
    };

    Marathon.prototype.ping = function(cb) {
      return this.client.get('/ping');
    };

    Marathon.prototype.metrics = function(cb) {
      return this.client.get('/metrics');
    };

    return Marathon;

  })(Rest);

  module.exports = Marathon;

}).call(this);
