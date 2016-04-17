var SunCalc = require("suncalc");
var Promise = require("bluebird");
var fs = Promise.promisifyAll(require("fs"));

const pinNumber = 7;
const pinExport = "/sys/class/gpio/export";
const pinDir = "/sys/class/gpio/gpio" + pinNumber + "/";
const pinValue = pinDir + "value";
const pinDirection = pinDir + "direction";

var actions = {"open":"0", "close":"1"};

function loop() {
  var now = new Date();
  var times = SunCalc.getTimes(new Date(), 37.4852, -122.2364);
  
  var action = (now.getTime() > times.sunrise.getTime() && now.getTime() < times.sunset.getTime()) ?
    "open" : "close";
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
  }).then(() => fs.readFileAsync(pinValue)).
    then(x => {
      x = x.toString().trim();
      if (x == actionPinValue) 
        return //console.error(pinValue, "already set to " + actionPinValue + ". " + action + ". Nothing to do");
      return fs.writeFileAsync(pinValue, actionPinValue).
         then(_ => console.error(pinValue, x + " => " + actionPinValue, action, now))
    }).
    catch(e => console.error(pinValue, " failed to set to " + actions[action],e, e.stack)).
    delay(60*1000).
    then(loop)
}

loop();     
