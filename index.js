var database = require('./database.js');
const request = require('request');

function addEnergy(energy,deviceIdentifier, currentValue,yesterdayValue,totalValue){
	console.log("currentValue:"+currentValue);
	console.log("yesterdayValue:"+yesterdayValue);
	console.log("totalValue:"+totalValue);
	
  var date = new Date(energy.timestamp);
	date.setHours(date.getHours() + 2);
	database.insertSmappeeEnergy(totalValue, yesterdayValue, currentValue, deviceIdentifier ,date);
}


function getData(device){
	var lastDateTime = device.energy_time;
        var lastDateTimeUTC = 1549663200000;
	if (lastDateTime != null){
		lastDateTime.setHours(lastDateTime.getHours()-2);
		lastDateTime.setMinutes(lastDateTime.getMinutes()+5);
		lastDateTimeUTC = lastDateTime.getTime();		
	}
	var getCurrentDateTimeUTC = new Date().getTime();
	console.log('getDataReading ' + device)
	getDataReading(device.device_id, device.location_identifier,  lastDateTimeUTC, getCurrentDateTimeUTC, device.energy_total, device.energy_yesterday, device.energy_today);
}

//https://app1pub.smappee.net/dev/v2/servicelocation/35205/consumption?aggregation=3&from=1546624646088&to=1548624766770

function getDataReading(deviceId, locationIdentifier, fromTime,toTime, total,yesterday,today){

	if(locationIdentifier == null){
		return;
	}

	var url = "https://app1pub.smappee.net/dev/v2/servicelocation/"+locationIdentifier+"/consumption?aggregation=1&from="+fromTime+"&to="+toTime+"";
	var currentValue = today;
	var yesterdayValue = yesterday;
	var totalValue=total;
	var lastdate = fromTime;
	
	console.log('url ' + url)
	const options = {
		url: url,
		headers: {
			'Authorization': 'Bearer 424883e3-a785-31a9-bfe6-3c020057f872'
		}
	  };

	  function callback(error, response, body) {
		if (!error && response.statusCode == 200) {
			const info = JSON.parse(body);
			console.log(info);
			var len = info.consumptions.length;
			var i=0;
		  for(var data of info.consumptions) {
				i++;
				if(i == len){
					console.log("dont add the last one...");
					break;
				}

			  if(nextday(lastdate,data.timestamp)){
					yesterdayValue = currentValue;
					currentValue = 0;
			  }
				lastdate = data.timestamp;
				currentValue = (parseFloat(parseFloat(currentValue) + parseFloat(data.consumption/1000)).toFixed(4));
				totalValue = (parseFloat(parseFloat(totalValue) + parseFloat(data.consumption/1000)).toFixed(4));
				addEnergy(data, deviceId, currentValue,yesterdayValue,totalValue);		
		  }
		  console.log("and we out...");
		}else{
			console.log('Error'+error + response.statusCode);
		}
			console.log("getDataReading callback done");
	  }
	  request(options, callback);
}

function nextday(dateFrom,dateTo){
	var dateBefore = new Date(dateFrom);
//	dateBefore.setHours(dateBefore.getHours() + 2);
	var dayBefore = dateBefore.getDay();

	var dateNow = new Date(dateTo);
//	dateNow.setHours(dateNow.getHours() + 2);
    var dayNow = dateNow.getDay();


    if(dayBefore !== dayNow){
		return true;
   }else{
	   return false;
   }
}

database.getDevicesInfoByDeviceType(2).then(devices => {
	for(var device of devices) {
		console.log('device ' + device)
			getData(device);
	}
});


console.log("end of script");

