var {Pool} = require('pg');
var {database_config} = require('./config.js');
const format = require('pg-format')

const pool = new Pool(database_config)
let DefaultParentLocationId = 574
 
const getDevicesInfoByDeviceType = async (deviceTypeId) => {
      var results = [];
      var sql = `SELECT d.device_id, d.tele_period, d.identifier, l.identifier as location_identifier,
      l.username as location_username,l.password as location_password, d.created, e2.time as energy_time,
      COALESCE(e2.total,\'0\') as energy_total ,COALESCE(e2.yesterday,\'0\') as energy_yesterday ,COALESCE(e2.today,\'0\') as energy_today,
  dt.is_node, dt.is_brain
  FROM public.device d 
  inner join public.location l on l.location_id = d.location_id 
  inner join public.devicetype dt on dt.devicetype_id = d.devicetype_id 
  left join (  select e1.device_id,e1.time,e1.total,e1.yesterday,e1.today from energy e1 inner join  
    (select max(time) as time ,ei.device_id from energy ei group by ei.device_id) e on e.time = e1.time and e.device_id = e1.device_id)  e2 on e2.device_id = d.device_id 
  WHERE d.devicetype_id = $1 and l.is_active = true 
      ORDER BY d.device_id ASC`;
      try {
        const { rows } = await pool.query(sql,[deviceTypeId]);
        return rows;
      }catch(err){
          console.error('getDevicesInfoByDeviceType Database ' + err)
      }
  
  return results;
}
exports.getDevicesInfoByDeviceType = getDevicesInfoByDeviceType; 

const getDevicesNodesByDevice = async(deviceId,isGrid) => {
  var devicetype_id = 15;
  if(isGrid){
    devicetype_id = 17;
  }

  var results = [];
  var sql = `SELECT d.device_id, d.tele_period, d.identifier, l.identifier as location_identifier,
  l.username as location_username,l.password as location_password, d.created,
e2.time as energy_time ,COALESCE(e2.total,\'0\') as energy_total ,COALESCE(e2.yesterday,\'0\') as energy_yesterday ,COALESCE(e2.today,\'0\') as energy_today
FROM public.device d 
inner join public.location l on l.location_id = d.location_id 
left join (  select e1.device_id,e1.time,e1.total,e1.yesterday,e1.today from energy e1 inner join  
(select max(time) as time ,ei.device_id from energy ei group by ei.device_id) e on e.time = e1.time and e.device_id = e1.device_id)  e2 on e2.device_id = d.device_id 
WHERE d.parent_device_id = $1 and l.is_active = true and devicetype_id = $2
  ORDER BY d.device_id ASC`;
  try {
    const { rows } = await pool.query(sql,[deviceId, devicetype_id]);
    return rows;
  }catch(err){
      console.error('getDevicesNodesByDevice Database ' + err)
  }

return results;
}
exports.getDevicesNodesByDevice = getDevicesNodesByDevice; 

const insertSmappeeEnergy = async (total, yesterday,today, power, kva, device_id, time,utcdate,hourlyfactor) => {
    //ON CONFLICT (time,device_id,utcdate) DO UPDATE SET total = EXCLUDED.total, yesterday = EXCLUDED.yesterday, today = EXCLUDED.today
    await pool.query('INSERT INTO energy (time, device_id, total, yesterday,today, power, kva, factor, voltage, current, utcdate, hourlyfactor) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)  ',
      [time, device_id, total, yesterday, today, power, kva, 0, 0, 0,utcdate,hourlyfactor],(err,res)=> {
      if(err){
          console.error(device_id+ ": Database " + err + " "+  time) 
      }
  });
}
exports.insertSmappeeEnergy = insertSmappeeEnergy;

const insertBulkSmappeeEnergy = async (data) => {
  if(data.length  == 0){
    return;
  }

  var records = [];
  for (d of data) {
    var record = [];
    record.push(d.time, d.device_id, d.total,d.yesterday, d.today,d.power, d.kva,  d.hourlyfactor,  0,  0, 0,2);
    records.push(record);
  }

  let query = format(`INSERT INTO energy (time, device_id, total, yesterday,today, power, kva, hourlyfactor, factor, voltage, current, utcdate)
  values %L`, records);
  console.log(query)
  await pool.query(query,(err,res)=> {
    if(err){
        console.error(": Database insertBulkSmappeeEnergy " + err + " ") 
        console.error(time) 
    }
});
}
exports.insertBulkSmappeeEnergy = insertBulkSmappeeEnergy;

const getLocationByIdentifier = async(identifier) => {
  try {
    const { rows } = await pool.query('SELECT * FROM location WHERE identifier = $1',[identifier]);
    if(rows.length > 0){
      return rows[0];
    }
  }catch(err){
      console.error('getLocationByIdentifier Database ' + err)
  }
  return null;
}
exports.getLocationByIdentifier = getLocationByIdentifier;

const insertSmappeeLocationAndDevice = async (identifier, name, serialnumber, username,password)=>{
  var timezone_id = 1;
  var customer_id = 2;
  var devicetype_id = 2;
 
  var tele_period =  3000;
  
  if(serialnumber != undefined && serialnumber !== null && serialnumber.startsWith("20")){
    devicetype_id = 12;
  }

  var location_id = await insertLocation({"Name":name,"TimezoneId":timezone_id,"CustomerId":customer_id,"Identifier":identifier, "ParentLocationId":DefaultParentLocationId,"IsActive": true});
  var device = { 
    "Identifier": identifier, "Name": name, "Description": "Entire Store", "CustomerId":customer_id,"DeviceTypeId": devicetype_id, 
  "LocationId":location_id, "TelePeriod": tele_period,"Username":username,"Password":password,"ParentDeviceId":null }
  var device_id = await insertDevice(device);
  device["DeviceId"] = device_id;
 
  return device;
};
exports.insertSmappeeLocationAndDevice = insertSmappeeLocationAndDevice;

const insertSmappeeNodeDevice = async (parentDevice, identifier, name, channelConnection)=>{
  var customer_id = 2;
  var devicetype_id = 15;
 
  var tele_period =  3000;
  if(channelConnection == "GRID"){
    devicetype_id = 17;
  }
  var device = { 
    "Identifier": identifier, "Name": name, "Description": name, "CustomerId":customer_id,"DeviceTypeId": devicetype_id, 
  "LocationId": parentDevice.LocationId, "TelePeriod": tele_period,"ParentDeviceId":parentDevice.DeviceId }
  var device_id = await insertDevice(device);
  device["DeviceId"] = device_id;
  return device;
};
exports.insertSmappeeNodeDevice = insertSmappeeNodeDevice;

const insertLocation = async(data)=>{
  console.log('insertLocaton '); 
  let result = await pool.query(`INSERT INTO location (name, timezone_id, customer_id,identifier,parent_location_id,is_active) 
  values ($1,$2,$3,$4,$5,$6) RETURNING location_id`,
  [ data.Name, data.TimezoneId,data.CustomerId,data.Identifier,data.ParentLocationId, data.IsActive]);
  var location_id =  result.rows[0].location_id;
  console.log('result ' + location_id);
  return location_id;
}
exports.insertLocation = insertLocation;

const insertDevice = async(device)=>{
  console.log(JSON.stringify(device)); 
  let device_id = await pool.query(`INSERT INTO device 
    (identifier, name, description, customer_id, devicetype_id, location_id,tele_period, username, password, parent_device_id )
    values($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING device_id`,
    [ device.Identifier, device.Name, device.Description, device.CustomerId, device.DeviceTypeId, 
      device.LocationId, device.TelePeriod, device.Username,device.Password, device.ParentDeviceId],(err,res)=> {
    if(err){
        console.error('Database insertDevice: ' + err) 
    }
  });
  return device_id;
}
exports.insertDevice = insertDevice;

