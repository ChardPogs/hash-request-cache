var express = require('express')
  , app = express()
  , bodyParser = require('body-parser')
  , XXHASH = require("xxhash")
  , requestHash = require("./index.js")
  ;
  
var Promise = require("bluebird");
  
app.use(requestHash);
// app.use(bodyParser.json());

app.use("*", function(req, res) {
  return Promise.coroutine(function *() {
    // yield Promise.delay(3000000);
    var hash = yield req.requestHash;
    res.send(hash.toString());
  })();
});
  
app.listen(3000, function () {
  console.log('Example app listening on port 3000!');
});



var Promise = require('bluebird')
  , superagent = require('superagent')
  ;
  
function get(url) {
  return superagent.get(`http://localhost:3000`);
}
  
describe("RequestHash", function() {
  before(function() {
    this.timeout(3000000);
    return Promise.coroutine(function *() {
      while(true){
        try{
          yield get().then();
          break;
        }catch(err){}
      }
    })();
  });
  it("Should return hash", function() {
    this.timeout(3000000);
    return Promise.coroutine(function *() {
      yield Promise.delay(3000000);
    })();
  });
});