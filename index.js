const DEFAULT_TTL = 60;

function hashRequestCache(cachemanOpts, hashOpts, routes) {
  var self = this || {};
  if(!cachemanOpts || !hashOpts || !routes || !routes.length)
    throw Error("cachemanOpts and routes required!");
  var cache = self._cache = new Cacheman(cachemanOpts);
  function get(key) {
    key = key.toString();
    var defer = Promise.defer();
    cache.get(key, function(err, value) {
      if(err) defer.reject(err);
      defer.resolve(value);
    })
    return defer.promise;
  }
  function set(key, value) {
    key = key.toString();
    var defer = Promise.defer();
    cache.set(key, value, DEFAULT_TTL, function(err, value) {
      if(err) defer.reject(err);
      defer.resolve(value);
    })
    return defer.promise;
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
          yield Promise.delay(1000);
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
      //weirdly, twice tinatawag ung send ni express..
      if(this.__sendIsCalled) return _send.call(res, responseBody);
      this.__sendIsCalled = true;
      return Promise.coroutine(function *() {
        var cached = yield get(`${req["HRS:hashValue"]}`);
        if(cached == undefined){
          yield set(`${req["HRS:hashValue"]}:status`, true);
          yield set(`${req["HRS:hashValue"]}`, responseBody);
          cached = responseBody;
        }
        return _send.call(res, cached);
      })();
    }
    
    return Promise.coroutine(function *() {
      var hash = _getHash(req);
      var hashValue = req["HRS:hashValue"] = yield hash.promise;
      var valueWaiting = yield get(`${hashValue}:status`);
      if(valueWaiting == undefined){
        yield set(`${hashValue}:status`, "__waiting__");
        return next();
      }
      var isSuccess = yield wait(hashValue);
      var value = yield get(hashValue);
      if(isSuccess){
        return _send.call(res, value);
      }else{
        //dapat buuin ulit yung error dito eh. Malamang di gumagana yung serializer ng error ni Cacheman
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

var XXHASH = require("xxhashjs").h32
  , Cacheman = require("cacheman-memory")
  , Promise = require("bluebird")
  ;