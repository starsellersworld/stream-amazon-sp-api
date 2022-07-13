require('dotenv').config();

let getSpApi = require('./index');

let region = 'eu';
let refresh_token = 'A LONG STRING TO';

let config = {
  region, // The region to use for the SP-API endpoints ("eu", "na" or "fe")
  refresh_token,
  options:{
      credentials_path:'/home/node/code/conf/credentials'
      //only_grantless_operations: true,
      //use_sandbox: true,
  }
}


let spApi = getSpApi(config);
console.log(spApi);
console.log(spApi.callAPI);
