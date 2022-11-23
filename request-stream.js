const https = require('https');
const { URL } = require('url');

// thanks stefanmaric:
// https://gist.github.com/stefanmaric/895f51652060a820e2ee7f164af87948
const defer = () => {
  const bag = {}
  return Object.assign(
    new Promise((resolve, reject) => Object.assign(bag, { resolve, reject })),
    bag
  )
}

module.exports = (req_options) => {
  // returns Promise<response:ReadableStream> | Promise<{req:WritableStream,res:Promise<Object>}
  // the second form if the method is 'PUT'
  // res is an unresolved promise, while req is ready to use WritableStream.
  // ratio: when putting a huge file, typically you get back a small response.
  // also the api want to deal with short error message
  return new Promise((resolve, reject) => {
    let url = new URL(req_options.url);
    let options = {
      method:req_options.method,
      port:443,
      hostname:url.hostname,
      path:url.pathname + url.search,
      headers:req_options.headers || {}
    };
    let resP = defer();
    let req = https.request(options, (res) => {
      if (req_options.method != 'PUT') {
        resolve(res);
      } else {
        let chunks = [];
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
          chunks.push(chunk);
        });
        res.on('end', () => {
          resP.resolve({
            body:body,
            chunks:chunks,
            statusCode:res.statusCode,
            headers:res.headers
          });
        });
      }
      req.end();
    });
    if (req_options.method == 'PUT') {
      resolve({req, res: resP});
    }

    req.on('error', (e) => {
        reject(e);
    });
    if (req_options.method != 'PUT') {
      req.end();
    }
  });
};
