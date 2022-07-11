const SellingPartnerAPI = require('amazon-sp-api');
const CustomError = require('amazon-sp-api/lib/CustomError');

const crypto = require('crypto');
const csv = require('csvtojson');
const iconv = require('iconv-lite');
const requestStream = require('./request-stream');
const zlib = require('zlib');

const xmlToJson = require('xml-to-json-stream');

async function download(details, options = {}) {
  options = Object.assign({
    unzip:true,
    returns: "string"
  }, options);

  const streamToString = (iStream) => new Promise((resolve, reject) => {
      var bufs = [];
      iStream.on('data', function(d){ bufs.push(d); });
      iStream.on('end', function(){
          var buf = Buffer.concat(bufs);
          resolve(buf.toString());
      });
      iStream.on('error', error => {
          reject(error);
      });
  })

  this._validateEncryptionDetails(details);
  // Result will be a tab-delimited flat file or an xml document
  let hRes = await requestStream({
    url:details.url
  });
  let iRes = hRes;
  if(iRes.statusCode !== 200) {
      iRes.body = await streamToString(iRes);
      this._validateUpOrDownloadSuccess(iRes, 'DOWNLOAD');
  }

  // Decrypt buffer
  if (details.encryptionDetails) {
    let decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      Buffer.from(details.encryptionDetails.key, 'base64'),
      Buffer.from(details.encryptionDetails.initializationVector, 'base64')
    );
    iRes = iRes.pipe(decipher);
  }
  // Decompress if content is compressed and unzip option is true
  if (details.compressionAlgorithm && options.unzip){
      iRes = iRes.pipe(zlib.createGunzip());
  }
  if (!details.compressionAlgorithm || options.unzip){
    // Decode buffer with given charset
    if (options.charset){
      try {
          var converterStream = iconv.decodeStream(options.charset);
          iRes = iRes.pipe(converterStream);
          //console.log("is iCONVED");
      } catch(e){
        throw new CustomError({
          code:'DECODE_ERROR',
          message:e.message
        });
      }
    }
    if (options.json){ // TODO
      // Transform content to json --> take content type from which to transform to json from result header
      try {
        if (hRes.headers['content-type'].includes('xml')){
            /*
             - doing a parser is too complex:
            https://codeforgeek.com/parse-large-xml-files-node/
             - almost the same:
            https://www.npmjs.com/package/node-xml-stream-parser

             - what they are saying here?
            https://github.com/NaturalIntelligence/fast-xml-parser/blob/master/nexttodo.md
             - and here?
            https://github.com/NaturalIntelligence/fast-xml-parser/issues/347

            why is:
             const {XMLParser} = require('fast-xml-parser/src/fxp');
            ?

            Suggest to use:
            https://www.npmjs.com/package/arraybuffer-xml-parser
            */
            const parser = xmlToJson();
            const stream = parser.createStream();
            iRes = iRes.pipe(stream);
      } else if (hRes.headers['content-type'].includes('plain')){
          let iCsv = csv({
              delimiter:'\t',
              quote:'off'
          });
          iRes = iRes.pipe(iCsv);
        }
      } catch(e){
        throw new CustomError({
          code:'PARSE_ERROR',
          message:'Could not parse result to JSON.',
          details:decrypted
        });
      }
    }
  }
  if (options.file){
      let oFile = require('fs').createWriteStream(options.file);
      iRes = iRes.pipe(oFile);
  }
  switch (options.returns) {
      case 'none':
      {
          return new Promise((resolve, reject) => {
              iRes.on('end', ()=>{
                  resolve();
              })
              iRes.on('error', error => {
                  reject(error);
              })
          })
      }
      case 'stream':
      return Promise.resolve(iRes);
      case 'string':
      default:
      {
          return streamToString(iRes);
      }
  }
}

module.exports = (options) => {
  let spApi = new SellingPartnerAPI(options);
  spApi.download = download.bind(spApi);
  return spApi;
}