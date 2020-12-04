var database = require('./database.js');
const request = require('request');
//var log = require('./log.js');
var { app_config } = require('./config.js');

var AUTH_TOKEN = 'Bearer ';
var API_URL = app_config.apiUrl;
let dailyDays = 128;
let hourlyDays = 10;
console.log('....................');
async function addEnergy(datetime, deviceIdentifier, currentValue, yesterdayValue, totalValue, power, kva, hourlyfactor) {
	await database.insertSmappeeEnergy(totalValue, yesterdayValue, currentValue, power, kva, deviceIdentifier, datetime, 2, hourlyfactor);
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
		measureDayCurrentDateTime.setDate(measureDayCurrentDateTime.getDate() - dailyDays);
		measureHourlyCurrentDateTime.setDate(measureHourlyCurrentDateTime.getDate() - hourlyDays);
		// console.log('getDataReading ' + device)
		// console.log('lastDateTime ' + lastDateTime.getTime())
		if (futureDateTime(lastDateTime, 1, 0, 0) < measureDayCurrentDateTime.getTime()) {
			getDataReading(3, device.device_id, device.identifier, futureDateTime(lastDateTime, 1, 0, 0).getTime(), measureDayCurrentDateTime.getTime(), device.energy_total, device.energy_yesterday, device.energy_today, true, device.is_brain);
		} else if (futureDateTime(lastDateTime, 0, 1, 0) < measureHourlyCurrentDateTime.getTime()) {
			getDataReading(2, device.device_id, device.identifier, futureDateTime(lastDateTime, 0, 1, 0).getTime(), measureHourlyCurrentDateTime.getTime(), device.energy_total, device.energy_yesterday, device.energy_today, true, device.is_brain);
		} else {
			getDataReading(1, device.device_id, device.identifier, lastDateTime.getTime(), getCurrentDateTimeUTC,
				device.energy_total, device.energy_yesterday, device.energy_today, false, device.is_brain);
		}
	} else {
		var lastDateTime = device.created;
		console.log(lastDateTime.getTime())
		var measureMonthCurrentDateTime = new Date();
		measureMonthCurrentDateTime.setDate(measureMonthCurrentDateTime.getDate() - 365);
		getDataReading(4, device.device_id, device.identifier, lastDateTime.getTime(),
			measureMonthCurrentDateTime.getTime(), device.energy_total, device.energy_yesterday, device.energy_today, true, device.is_brain);
	}
}

//https://app1pub.smappee.net/dev/v2/servicelocation/39918/consumption?aggregation=3&from=1514768400000&to=1548624766770

function getDataReading(aggregation, deviceId, identifier, fromTime, toTime, total, yesterday, today, forceSave, isBrain) {

	if (identifier == null) {
		return;
	}

	var url = API_URL + "servicelocation/" + identifier + "/consumption?aggregation=" + aggregation + "&from=" + fromTime + "&to=" + toTime + "";

	var currentValue = today;
	var yesterdayValue = yesterday;
	var totalValue = total;

	var lastdate = fromTime;
	var lastdateTo = toTime;
	var aggregation_closure = aggregation;

	console.log(deviceId + ': url ' + url)

	const options = {
		url: url,
		headers: {
			'Authorization': AUTH_TOKEN
		}
	};

	async function callback(error, response, body) {
		// console.log(deviceId + ": callback");
		// console.log(JSON.stringify(response) + ": response");
		var hourlyfactor = 1;
		if (aggregation_closure == 1) {
			hourlyfactor = 0.08333333;
		} else if (aggregation_closure == 3) {
			hourlyfactor = 24;
		} else if (aggregation_closure == 4) {
			hourlyfactor = 24 * daysInMonth(currentDateTime.getFullYear(), currentDateTime.getMonth());;
		}

		var hourlyfactor_reverse = 1;
		if (aggregation_closure == 1) {
			hourlyfactor_reverse = 60/5;
		} else if (aggregation_closure == 3) {
			hourlyfactor_reverse = 1/24;
		} else if (aggregation_closure == 4) {
			hourlyfactor_reverse = 1/(24 * daysInMonth(currentDateTime.getFullYear(), currentDateTime.getMonth()));
		}

		if (!error && response.statusCode == 200) {
			const info = JSON.parse(body);
			var len = info.consumptions.length;
			var i = 0;

			var nodeDevices = [];
			if (isBrain) {
			//	console.log("getDevicesNodesByDevice", deviceId)
				nodeDevices = await database.getDevicesNodesByDevice(deviceId);
			}
			//console.log("nodeDevices", nodeDevices.length)
			if (len == 0) {
				//console.log("len == 0")
				if (`aggregation_closure` == 4) {
					lastdate = lastdateTo.setDate(lastdateTo.getDate() - dailyDays);
				}
				await addEnergy(new Date(lastdate), deviceId, 0, 0, 0, 0);
				for (var nodeDevice of nodeDevices) {
					await addEnergy(new Date(lastdate), nodeDevice.device_id, 0, 0, 0, 0);
				}
				return;
			}
			var previousDatetimeStamp = lastdate;

			for (var data of info.consumptions) {
			//	console.log("data")
				i++;
				if (i == len && !forceSave) {
				//	console.log("break")
					break;
				}

				currentDateTime = new Date(data.timestamp);
				if (currentDateTime <= new Date(lastdate)) {
				//	console.log("continue")
					continue;
				}

				if (nextday(previousDatetimeStamp, data.timestamp)) {
					yesterdayValue = currentValue;
					currentValue = 0;
				}
				let kva = 0
				currentValue = (parseFloat(parseFloat(currentValue) + parseFloat(data.consumption / 1000)).toFixed(4));
				totalValue = (parseFloat(parseFloat(totalValue) + parseFloat(data.consumption / 1000)).toFixed(4));
				let power = (parseFloat(parseFloat(data.consumption/1000) * hourlyfactor_reverse).toFixed(4));	
				if (isBrain) {
				  kva = (parseFloat(parseFloat(getKva(data)/1000) * hourlyfactor_reverse).toFixed(4));	
				}		

				if (isBrain) {
					for (var i = 0; i < nodeDevices.length; i++) {
						await addNodeEnergy(nodeDevices[i], data, currentDateTime, previousDatetimeStamp, hourlyfactor, hourlyfactor_reverse)
					}
				}
				await addEnergy(currentDateTime, deviceId, currentValue, yesterdayValue, totalValue, power, kva, hourlyfactor);
				previousDatetimeStamp = data.timestamp;
			}
		} else {
			console.error('Error: ' + error + JSON.stringify(response));
		}
	}

	request(options, callback);
}

//FIrst 3 are for 3 phase power
function getKva(data){
	if(data.active.length <= 2 || data.reactive.length <= 2){
		return 0;
	}
	var consumption = data.active[0] + data.active[1] + data.active[2];
	var reactive = data.reactive[0] + data.reactive[1] + data.reactive[2];
	var kvaConsumption = Math.sqrt(Math.pow(consumption ,2) + Math.pow(reactive,2));
	return kvaConsumption;
}

async function addNodeEnergy(nodeDevice, data, currentDateTime, previousDatetimeStamp, hourlyfactor, hourlyfactor_reverse) {

	var id = parseInt(nodeDevice.identifier);
	if (id == 0 && id > nodeDevice.active.length()) {
		return;
	}
	var consumption = data.active[id - 1];
	var reactive = data.reactive[id - 1];
	var kvaConsumption = Math.sqrt(Math.pow(consumption ,2) + Math.pow(reactive,2));
	//voltage = data.voltages[id - 1];

	if (nextday(previousDatetimeStamp, data.timestamp)) {
		nodeDevice.energy_yesterday = nodeDevice.energy_today;
		nodeDevice.energy_today = 0;
	}

	nodeDevice.energy_today = (parseFloat(parseFloat(nodeDevice.energy_today) + parseFloat(consumption / 1000)).toFixed(4));
	nodeDevice.energy_total = (parseFloat(parseFloat(nodeDevice.energy_total) + parseFloat(consumption / 1000)).toFixed(4));
	let power = (parseFloat(parseFloat(consumption/1000) * hourlyfactor_reverse).toFixed(4));
	let kva = (parseFloat(parseFloat(kvaConsumption/1000) * hourlyfactor_reverse).toFixed(4));

	await addEnergy(currentDateTime, nodeDevice.device_id,
		nodeDevice.energy_today, nodeDevice.energy_yesterday, nodeDevice.energy_total, power, kva, hourlyfactor);

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
			for (var data of info.serviceLocations) {
				var location = await database.getLocationByIdentifier(data.serviceLocationId);
				if (location == null) {
					await database.insertSmappeeLocationAndDevice(data.serviceLocationId, data.name, data.deviceSerialNumbernull, null);
				}
			}
		} else {
			console.error('Error' + error + response);
		}
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

async function setAuth() {

	const options = {
		url: 'https://app1pub.smappee.net/dev/v2/oauth2/token',
		method: 'POST',
		headers: {},
		form: {
			'grant_type': 'password',
			'client_id': 'CodeworxAPI',
			'client_secret': 'FUuQqn52Yi',
			'username': 'Energyrite_API',
			'password': 'smappee'
		}
	};

	await request(options, setAuthVariables);
	console.log("done");
}

async function setAuthVariables(error, response, body) {

	const info = JSON.parse(body);

	if (!error && response.statusCode == 200) {
		const info = JSON.parse(body);
		AUTH_TOKEN = 'Bearer ' + info.access_token

		let x = (Math.random() * 10).toFixed(0)
		if (x == 9) {
			addNewServiceLocation();
		}
		database.getDevicesInfoByDeviceType(2).then(devices => {
			for (var device of devices) {
				getData(device);
			}
		});
		database.getDevicesInfoByDeviceType(12).then(devices => {
			for (var device of devices) {
				getData(device);
			}
		});
	} else {
		console.error('----------', error);
	}
}


setAuth();
setTimeout(() => { console.log("end of sleep!"); }, 180000);

console.log('finished at  ' + new Date());
