const DEFAULT_TTL = 60;

function hashRequestCache(cachemanMongoOpts, hashOpts, routes) {
  var self = this || {};
  if(!cachemanMongoOpts || !hashOpts || !routes || !routes.length)
    throw Error("cachemanMongoOpts and routes required!");
  var cache = self._cache = new CachemanMongo(cachemanMongoOpts);
  var get = Promise.promisify(cache.get, {context: cache});
  var _set = Promise.promisify(cache.set, {context: cache});
  function set() {
    var args = Array.prototype.slice.call(arguments);
    args.push(DEFAULT_TTL);
    return _set.apply(undefined, args);
  }
  
  function wait(hashValue) {
    return Promise.coroutine(function *() {
      var value;
      var waitedFor = 0;
      while(true){
        if(waitedFor > DEFAULT_TTL)
          throw Error("Wait waited for 60 sec ++");
        value = yield get(`${hashValue}:status`);
        if(value === "__waiting__"){
          yield Promise.defer(1000);
          waitedFor++;
          continue;
        }
        return value;
      }
    })();
  }
  
  function _getHash(req) {
    var defer = Promise.defer();
    var hasher = new XXHASH(hashOpts);
    req
      .on("data", function(buffer) {
        hasher.update(buffer);
      })
      .on("end", function() {
        var hash = hasher.digest();
        defer.resolve(hash);
      })
      .on("error", function(err) {
        defer.reject(err);
      });
      
    return {
      defer: defer,
      promise: defer.promise
    }
  }
  
  self.middleware = function(req, res, next) {
    var shouldHandle = false;
    for (var i = 0; i < routes.length; i++) {
      var route = routes[i];
      shouldHandle = route.indexOf(req.url) != -1;
      if(shouldHandle) break;
    }
    if(!shouldHandle)
      next();
      
    var _send = res.send;
    res.send = function(responseBody) {
      return Promise.coroutine(function *() {
        var cached = yield get(`${req["HRS:hashValue"]}`);
        if(!cached){
          yield set(`${req["HRS:hashValue"]}:status`, true);
          yield set(`${req["HRS:hashValue"]}`, responseBody);
        }
        return _send(responseBody);
      })();
    }
    
    return Promise.coroutine(function *() {
      var hash = _getHash(req);
      var hashValue = req["HRS:hashValue"] = yield hash.promise;
      var isSuccess = yield wait(hashValue);
      var value = yield get(hashValue);
      if(isSuccess){
        return _send(value);
      }else{
        //dapat buuin ulit yung error dito eh. Malamang di gumagana yung serializer ng error ni CachemanMongo
        next(value);
      }
    })()
    .catch(function(err) {
      next(err);
    });
  }
  
  self.errorMiddleware = function(err, req, res, next) {
    var shouldHandle = false;
    for (var i = 0; i < routes.length; i++) {
      var route = routes[i];
      shouldHandle = route.indexOf(req.url) != -1;
      if(shouldHandle) break;
    }
    if(!shouldHandle)
      next();
      
    return Promise.coroutine(function *() {
      yield set(`${req["HRS:hashValue"]}:status`, false);
      yield set(`${req["HRS:hashValue"]}`, err);
      next(err);
    })();
  }
  
  return self;
}

module.exports = hashRequestCache;

var XXHASH = require("xxhash")
  , CachemanMongo = require("cacheman-mongo")
  , Promise = require("bluebird")
  ;