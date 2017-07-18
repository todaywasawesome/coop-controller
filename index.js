/*************************************
* Setup configuration schedules
* 
* Timings Definition
*   gpio      - The pin number that will be activated
*   setting   - low or high, should the gpio be set to 1 or 0. 
*   name      - Used for the logging and identifying the action
*   duration  - The length of time the action should remain intialized. Use 0 to not set a timer. Given in ms
*   when      - Pass a time in HH:MM format, or specify a suncalc value (eg, sunrise, sunriseEnd, etc). See https://github.com/mourner/suncalc#reference
*         
**************************************/
var location = {long: "37.4852", lat: "-122.2364"};

var timings = [
  {gpio: 23, setting: "low", name: "open", duration: 20000, when: "sunrise"},
  {gpio: 24, setting: "low", name: "close", duration: 20000, when: "dusk"},
];


//Do not edit below this line
/*************************************/
var SunCalc = require("suncalc");
var Promise = require("bluebird");
const http = require('http')
var url = require('url');  
var fs = Promise.promisifyAll(require("fs"));

//const pinNumber = 7;
const pinExport = "/sys/class/gpio/export";
const pinUnExport = "/sys/class/gpio/unexport";
//const pinDir = "/sys/class/gpio/gpio" + pinNumber + "/";
//const openDir = "/sys/class/gpio/gpio" + openPin + "/";
//const closeDir = "/sys/class/gpio/gpio" + closePin + "/";
//const pinValueFile = pinDir + "value";
//const pinDirection = pinDir + "direction";

//var actions = {"open":"0", "close":"1"};
//var pinValues = {"0":"open", "1":"close"};
var gOverride = null;

function readState() {
  return fs.readFileAsync(pinValueFile).then(x => x.toString().trim())
}

function getOpenCloseTimes() {
  var times = SunCalc.getTimes(new Date(), 37.4852, -122.2364)
  var sunRiseTime = times.sunrise.getTime()
  var hour = 60 * 60 * 1000
  return {
      open: new Date(sunRiseTime + hour),
      close: times.sunset
    }
}
function loop() {
  var times = getOpenCloseTimes()
  var now = new Date();
  var action = (now.getTime() > times.open.getTime() && now.getTime() < times.close.getTime()) ?
    "open" : "close";
  if (gOverride)
    action = gOverride;
  var actionPinValue = actions[action];  

  function setDirection() {
      return fs.writeFileAsync(pinDirection, "out\n").then(x=>console.log(pinDirection));
  }
  
  function setupPin() {
    return fs.writeFileAsync(pinExport, pinNumber).delay(1000).
      then(setDirection);
  }
  
  fs.readFileAsync(pinDirection).catch(e => {
    if (e.code === 'ENOENT') {
      console.error(pinExport, "adding pin " + pinNumber);
      return setupPin().then(() => fs.readFileAsync(pinDirection));
    } else {
      console.error("readFileAsync else",e, e.code); 
      throw e;
    }
  }).then(x => {
    x = x.toString().trim();
    if (x == "out") {
      return Promise.resolve();
    } else {
      console.error(pinDirection, "out => in")
      return setDirection();
    }
  }).then(readState).
    then(x => {
      if (x == actionPinValue) 
        return //console.error(pinValue, "already set to " + actionPinValue + ". " + action + ". Nothing to do");
      return fs.writeFileAsync(pinValueFile, actionPinValue).
         then(_ => console.error(pinValueFile, x + " => " + actionPinValue, action, now))
    }).
    catch(e => console.error(pinValueFile, " failed to set to " + actions[action],e, e.stack)).
    delay(1000).
    then(loop)
}


function server() {
  const requestHandler = (request, response) => {  
    var parts = url.parse(request.url, false);
    if (parts.pathname != "/") {
      response.statusCode = 404;
      console.error("404", request.url)
      return response.end("No " + parts.pathname);
    }
    if (parts.query) {
      var firstPromise = Promise.resolve(0);
      var query = parts.query.split('=')[0]
      if (query == "auto") {
        gOverride = null;
      } else if (query in actions) {
        gOverride = query;
        firstPromise = fs.writeFileAsync(pinValueFile, actions[query]).catch(e => {
              response.statusCode = 500;
              response.end(e.toString())
            }).delay(1000)
      }
      return firstPromise.then(x => {
        response.writeHead(302, {'Location': '/' });
        response.end();
      })      
    }
    console.log(request.url, parts.query, parts.pathname)
    
    readState().then(state => {
      var times = getOpenCloseTimes()
      var autoString = gOverride ? "manual" : "auto"
      var stateString = pinValues[state]
      return response.end(
      `<html>
      <head>
      <title>coop: ${stateString}</title>
      <meta name="viewport" content="width=device-width; initial-scale=1.0; maximum-scale=1.0; user-scalable=0;"/> 
      <style>
button {
    width:100%;
    height:20%;
}
.${stateString},
.${autoString}
{ font-weight: bold;
  text-transform: uppercase;
   } 
</style>
      </head>
      <body>
      ${stateString} (${autoString})<br>
      <div class=open>open@${times.open.toLocaleTimeString()}</div>
      <div class=close>close@${times.close.toLocaleTimeString()}</div>
      <form>
      <button name=open class=open>open</button>
      <button name=close class=close>close</button>
      <button name=auto class=auto>auto</button>
      </form>
      </body>
      </html>`
      )
    }
      )
  }


  const server = http.createServer(requestHandler)

  function listen(port) {
    server.listen(port, (err) => {  
      if (err) {
        console.log('failed to listen on port ' + port, err)
        if (port == 80)
          listen(8080)
        return
      }

      console.log(`server is listening on ${port}`)
    })
  }
  listen(80)
}

console.error("starting coop controller");
server();
loop();     
