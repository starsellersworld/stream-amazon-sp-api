const https = require('https');
const { URL } = require('url');

module.exports = (req_options) => {
  return new Promise((resolve, reject) => {
    let url = new URL(req_options.url);
    let options = {
      method:req_options.method,
      port:443,
      hostname:url.hostname,
      path:url.pathname + url.search,
      headers:req_options.headers || {}
    };
    let req = https.request(options, (res) => {
        resolve(res);
    });

    req.on('error', (e) => {
        reject(e);
    });
    req.end();
  });
};
