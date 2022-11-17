const SellingPartnerAPI = require('amazon-sp-api');
const CustomError = require('amazon-sp-api/lib/CustomError');

const crypto = require('crypto');
const csv = require('csvtojson');
const iconv = require('iconv-lite');
const requestStream = require('./request-stream');
const zlib = require('zlib');

async function download(details, options = {}) {
  options = Object.assign({
    unzip:true,
    returnType: 'none', // 'none' ,'string', or 'stream'
  }, options);
  
  let content = null; // if filled then some transform is not-streamable
  
  let oFile = options.file?require('fs').createWriteStream(options.file):null;
  
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
    // NOTE: error message generally is short
    iRes.body = await streamToString(iRes);
    this._validateUpOrDownloadSuccess(iRes, 'DOWNLOAD');
    // this always throw
  }
  
  // Decrypt buffer
  if (details.encryptionDetails) {
    let decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(details.encryptionDetails.key, 'base64'), Buffer.from(details.encryptionDetails.initializationVector, 'base64'));
    iRes = iRes.pipe(decipher);
  }
  // Decompress if content is compressed and unzip option is true
  if (details.compressionAlgorithm && options.unzip){
    iRes = iRes.pipe(zlib.createGunzip());
  }
  if (!details.compressionAlgorithm || options.unzip){
    // Decode buffer with given charset
    let charset = options.charset;
    if(!charset) {
      let charset_match = hRes.headers['content-type'].match(/\.*charset=([^;]*)/);
      if (charset_match && charset_match[1]){
        charset = charset_match[1];
      }
      if(charset == 'utf8' || charset == 'UTF-8') { // do not iconv utf8.
        charset = undefined;
      }
    }
    if (charset){
      try {
        var converterStream = iconv.decodeStream(charset);
        iRes = iRes.pipe(converterStream);
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
          // de-stream
          content = await streamToString(iRes);
          content = this._xml_parser.parse(content);
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
          details: iRes
        });
      }
    }
  }
  if(oFile) {
    if(content) {
      iRes = oFile;
      oFile.end(content);
    } else {
      iRes.pipe(oFile);
    }
  }
  switch (options.returnType) {
    case 'none':
    {
      if(!oFile) {
        return undefined;
      }
      return new Promise((resolve, reject) => {
        oFile.on('end',resolve);
        iRes.on('end', ()=>{
          resolve();
        })
        iRes.on('error', error => {
          reject(error);
        })
      })
    }
    case 'stream':
    if(!content) {
      return Promise.resolve(iRes);
    }
    case 'string':
    default:
    {
      if(content) {
        return content;
      } else {
        return streamToString(iRes);
      }
    }
  }
  throw new CustomError({
    code:'PARSE_ERROR',
    message:'It is not possible XML to JSON and to stream together.',
    details: iRes
  }); 
}

async function upload(details, feed) {
  this._validateEncryptionDetails(details);
  if (!feed || (!feed.content && !feed.file)){
    throw new CustomError({
      code:'NO_FEED_CONTENT_PROVIDED',
      message:'Please provide "content" (string) or "file" (absolute path) of feed.'
    });
  }
  if (!feed.contentType){
    throw new CustomError({
      code:'NO_FEED_CONTENT_TYPE_PROVIDED',
      message:'Please provide "contentType" of feed (should be identical to the contentType used in "createFeedDocument" operation).'
    });
  }
  let iStream;// = feed.content?
  if(feed.content) {
    const { Readable } = require("stream");
    iStream = Readable.from(feed.content);
  } else {
    iStream = require('fs').createReadStream(feed.file);
  }
  //let feed_content = feed.content || await this._readFile(feed.file, feed.contentType);
  //let content_buffer;
  if (details.encryptionDetails) {
    // Encrypt content to upload
    let decipher = crypto.createCipheriv(
      'aes-256-cbc',
      Buffer.from(details.encryptionDetails.key, 'base64'),
      Buffer.from(details.encryptionDetails.initializationVector, 'base64')
      );
    iStream = iStream.pipe(decipher);
  }
  return new Promise((resolve,reject) => {
    let uploadStream = require('https').request(details.url, {
      method: "PUT",
      headers: {
        "Content-Type": feed.contentType,
      },
    }, (res) => {
      res.on('end', () => {
        this._validateUpOrDownloadSuccess(res, 'UPLOAD');
        if (!res.complete) {
          console.error('The connection was terminated while the message was still being sent');
        }
      });
    });
    iStream.pipe(uploadStream);
    iStream.on('end', resolve);
    iStream.on('error', reject);
    uploadStream.on('error', reject);
  }).then(r=>{
    return {success:true};
  });
}

module.exports = (options) => {
  let spApi = new SellingPartnerAPI(options);
  spApi.download = download.bind(spApi);
  spApi.upload = upload.bind(spApi);
  return spApi;
}
