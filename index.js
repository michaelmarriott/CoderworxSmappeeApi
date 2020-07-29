var database = require('./database.js');
const request = require('request');
var {app_config} = require('./config.js');

var AUTH_TOKEN = 'Bearer ';
var API_URL = app_config.apiUrl;

async function addEnergy(datetime, deviceIdentifier, currentValue, yesterdayValue, totalValue, power, hourlyfactor) {
	await database.insertSmappeeEnergy(totalValue, yesterdayValue, currentValue, power, deviceIdentifier, datetime, 2, hourlyfactor);
}

// 5 minute values	10 days -1
// Hourly values	90 days -2
// Day values	365 days -3
// Monthly values	5 years -4

async function getData(device) {
	var lastDateTime = device.energy_time;

	if (lastDateTime != null) {
		var getCurrentDateTimeUTC = new Date().getTime();
		var measureDayCurrentDateTime = new Date();
		var measureHourlyCurrentDateTime = new Date();
		measureHourlyCurrentDateTime.setHours(0);
		measureDayCurrentDateTime.setDate(measureDayCurrentDateTime.getDate() - 88);
		measureHourlyCurrentDateTime.setDate(measureHourlyCurrentDateTime.getDate() - 10);
		console.log('getDataReading ' + device)	
		console.log('lastDateTime ' + lastDateTime.getTime())	
		if (futureDateTime(lastDateTime, 1, 0, 0) < measureDayCurrentDateTime.getTime()) {
			getDataReading(3, device.device_id, device.location_identifier, lastDateTime.getTime(), measureDayCurrentDateTime.getTime(), device.energy_total, device.energy_yesterday, device.energy_today, true);
		} else if (futureDateTime(lastDateTime, 0, 1, 0) < measureHourlyCurrentDateTime.getTime()) {
			getDataReading(2, device.device_id, device.location_identifier, lastDateTime.getTime(), measureHourlyCurrentDateTime.getTime(), device.energy_total, device.energy_yesterday, device.energy_today, true);
		} else {
			getDataReading(1, device.device_id, device.location_identifier, lastDateTime.getTime(), getCurrentDateTimeUTC, device.energy_total, device.energy_yesterday, device.energy_today, false);
		}
	} else {
		var lastDateTime = new Date();
		lastDateTime.setDate(lastDateTime.getDate() - (365 * 5));
		var measureMonthCurrentDateTime = new Date();
		measureMonthCurrentDateTime.setDate(measureMonthCurrentDateTime.getDate() - 365)
		getDataReading(4, device.device_id, device.location_identifier, lastDateTime.getTime(),
			measureMonthCurrentDateTime.getTime(), device.energy_total, device.energy_yesterday, device.energy_today, true);
	}
}

//https://app1pub.smappee.net/dev/v2/servicelocation/39918/consumption?aggregation=3&from=1514768400000&to=1548624766770

function getDataReading(aggregation, deviceId, locationIdentifier, fromTime, toTime, total, yesterday, today, forceSave) {

	if (locationIdentifier == null) {
		return;
	}

	var url = API_URL + "servicelocation/" + locationIdentifier + "/consumption?aggregation=" + aggregation + "&from=" + fromTime + "&to=" + toTime + "";
	var currentValue = today;
	var yesterdayValue = yesterday;
	var totalValue = total;
	var lastdate = fromTime;
	var aggregation_closure = aggregation;


		console.log(deviceId + ': url ' + url)
	const options = {
		url: url,
		headers: {
			'Authorization': AUTH_TOKEN
		}
	};

	async function callback(error, response, body) {
		//console.log(deviceId +": callback");
		var hourlyfactor = 1;
		if (aggregation_closure == 1) {
			hourlyfactor = 0.16666667;
		} else if (aggregation_closure == 3) {
			hourlyfactor = 24;
		} else if (aggregation_closure == 4) {
			hourlyfactor = 24 * 30;
		}

		if (!error && response.statusCode == 200) {
			const info = JSON.parse(body);
			var len = info.consumptions.length;
			var i = 0;
			if (len == 0) {
				await addEnergy(new Date(lastdate), deviceId, 0, 0, 0, 0);
			}
			var previousDatetimeStamp = lastdate;
			for (var data of info.consumptions) {
				i++;
				if (i == len && !forceSave) {
						console.log(deviceId + ": dont add the last one...");
					break;
				} else {
						console.log(deviceId + ": " + i + "-" + len);
				}

				currentDateTime = new Date(data.timestamp);
				if (currentDateTime <= new Date(lastdate)) {
							console.log(deviceId + ":currentDateTime" + currentDateTime + "lastdate" + new Date(lastdate));
							console.log(deviceId + ":already added.....................................");
					continue;
				}

				if (nextday(previousDatetimeStamp, data.timestamp)) {
							console.log(deviceId + ":new day" + previousDatetimeStamp + "-" + data.timestamp);
					yesterdayValue = currentValue;
					currentValue = 0;
				}

				currentValue = (parseFloat(parseFloat(currentValue) + parseFloat(data.consumption / 1000)).toFixed(4));
				totalValue = (parseFloat(parseFloat(totalValue) + parseFloat(data.consumption / 1000)).toFixed(4));
				let power = (parseFloat(parseFloat(data.consumption) * (5 / 60)).toFixed(4));
				if (aggregation_closure == 4) {
					hourlyfactor = 24 * daysInMonth(currentDateTime.getFullYear(), currentDateTime.getMonth());
				}
					console.log(deviceId + ":hourlyfactor: " + hourlyfactor);
				await addEnergy(currentDateTime, deviceId, currentValue, yesterdayValue, totalValue, power, hourlyfactor);
				previousDatetimeStamp = data.timestamp;
			}
				console.log(deviceId + " and we out...");

		} else {
			console.error('Error: ' + error + JSON.stringify(response));
		}
		console.log("getDataReading callback done");
	}
	request(options, callback);
}

function nextday(dateFrom, dateTo) {
	var dateBefore = new Date(dateFrom);
	//	dateBefore.setHours(dateBefore.getHours() + 2);
	var dayBefore = dateBefore.getDay();

	var dateNow = new Date(dateTo);
	//	dateNow.setHours(dateNow.getHours() + 2);
	var dayNow = dateNow.getDay();


	if (dayBefore !== dayNow) {
		return true;
	} else {
		return false;
	}
}


function daysInMonth(year, month) {
	var x = new Date(year, month + 1, 0).getDate();
	//console.log("daysInMonth" + x);
	return x;
}

function addNewServiceLocation() {
	console.log("addNewServiceLocation");
	var url = API_URL + "servicelocation/";
	const options = {
		url: url,
		headers: {
			'Authorization': AUTH_TOKEN
		}
	};

	async function callbackInsertSmappeeLocationAndDevice(error, response, body) {
		if (!error && response.statusCode == 200) {
			const info = JSON.parse(body);
			console.log('----------', info);
			for (var data of info.serviceLocations) {
				var location = await database.getLocationByIdentifier(data.serviceLocationId);
				if (location == null) {
					console.log("insertSmappeeLocationAndDevice");
					await database.insertSmappeeLocationAndDevice(data.serviceLocationId, data.name, null, null);
				}
			}
			console.log("and we out...");
		} else {
			console.error('Error' + error + response);
		}
		console.log("insertSmappeeLocationAndDevice callback done");
		return;
	}

	request(options, callbackInsertSmappeeLocationAndDevice);
}

function futureDateTime(inputTime, day, hour, minute) {
	var returnDate = new Date(inputTime.getTime());
	returnDate.setDate(returnDate.getDate() + day);
	returnDate.setHours(returnDate.getHours() + hour);
	returnDate.setMinutes(returnDate.getMinutes() + minute);
	return returnDate;
}

function sleep(milliseconds) {
	const date = Date.now();
	let currentDate = null;
	do {
		currentDate = Date.now();
	} while (currentDate - date < milliseconds);
}
function setAuth(){

	const options = {
		url: 'https://app1pub.smappee.net/dev/v2/oauth2/token',
		method: 'POST',
		headers: {},
		form:{ 
			'grant_type': 'password',
			'client_id': 'CodeworxAPI',
			'client_secret': 'FUuQqn52Yi',
			'username': 'Energyrite_API',
			'password': 'smappee'
		}
	};

	request(options, setAuthVariables);

}

function setAuthVariables(error, response, body){
	console.log('----------', error);
	const info = JSON.parse(body);
	
	if (!error && response.statusCode == 200) {
		const info = JSON.parse(body);
		console.log('----------', info);
		AUTH_TOKEN = 'Bearer ' +info.access_token

		let x = (Math.random() * 10).toFixed(0)
		if(x == 9){
			addNewServiceLocation();
		}
		database.getDevicesInfoByDeviceType(2).then(devices => {
			console.log('-----///???-');
			for (var device of devices) {
				console.log(device)
				getData(device);
			}
		});

	}

}


while (true){
	setAuth();
	setTimeout(() => { console.log("end of sleep!"); }, 40000);
}

console.log('finished at  ' + new Date());
