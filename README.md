# patching `download()` method

After short discussion in https://github.com/amz-tools/amazon-sp-api/issues/56
here is the code that stream the download of a file, sparing memory and resource for large report files coming from amazon

~~**Streaming upload is disabled** because it is still untested. It will be enabled by default as soon it get tested.~~

~~**Streaming for upload** is enabled from v1.0.5, it has no option, it just stream out over http from `content` or from `file`.~~

**Streaming for upload: uploadStream()** from v1.0.6 there is a new method `uploadStream()`, I did not tested all feeds API, for upload of files that does not need a cypher it works, if a cypher is needed the stream version of upload probably will fails. Reason is the required header `Content-Length` which I have no idea how to inject after (or how to evaluate the encrypted size before actually encode data (aes is a block algo, I suppose is not impossible to do it by very simple math)).

Some credits goes to @stefanmaric for defer() staff used in request-stream-PUT version.


NOTE: **breaking change** the option `returns` became `returnType`.

## Quick test

> let spApi = require('stream-amazon-sp-api');

> let SellingPartner = spApi(options);

then try to use download:

```
try {
  let reportDocument = await SellingPartner.callAPI({
      operation:'getReportDocument',
      endpoint:'reports',
      path:{
          reportDocumentId
      }
  });
  let targetFile = "/your/absolute/path/filename.json";
  await SellingPartner.download(reportDocument, {
      //charset:'cp1252',
      json: true,
      returnType: 'none', // 'none' ,'string', or 'stream'
      file: targetFile
  });
} catch (err) {
  console.log("ERROR", err);
}
// check targetFile content
}
```

upload example (feeds API):

```
  let feedDocument = await spApi.callAPI({
    operation:'createFeedDocument',
    endpoint: "feeds",
    body: {
      "contentType": feedInfos.contentType
    },
    options: {
      version: "2021-06-30"
    }
  })
  // simply upload the document. Use spApi for convenience
  let feed = {
    "file": feedInfos.filename,
    "contentType": feedInfos.contentType,
  }
  // new method! use .upload() if it does not work
  let response = await spApi.uploadStream(feedDocument, feed);
  // it is {success:true}
  let res = await spApi.callAPI({
    operation:'createFeed',
    endpoint: "feeds",
    body: {
      marketplaceIds: ["MARKETID"],
      feedType: feedInfos.feedType,
      inputFeedDocumentId: feedDocument.feedDocumentId
    }
  });
  return res;
```
Note that this is the only case I really tested.

## Oddities

`returnType:stream` and `json:true` are "partially compatible options": when used together and upstream document content-type is an xml, then this patch will throw Error.
Note that most of the time amazon compress xml, and that xml content-type is taken from http headers, and so I am not really sure the code works.
Anyway it is better not to transform xml-to-json large files, or adopt some clever strategy (see section below).

If `returnType:none` and no `file:filename` was specified, the patched method will return undefined, after doing nothing, I can suppose that errors also are not detected, in fact stream are opened, piped, but no writable is passed to it.

## dependency added

~~It add dependency to `xml-to-json-stream` module, that support stream as transformer.~~
none

## WIP

`request-stream.js` is just for GET request, then upload request should have an out version.


## Streaming csv-to-json transformation

csvtojson is more clever than one would expect, see https://github.com/Keyang/node-csvtojson/blob/master/src/Result.ts
In fact it adds a '[' at begin then it parse line by line adding a regular json for each line, separated by commas.
So, it really stream the content.

### streaming XML-to-JSON transformation

as commented in upstream issue report, I found this in StackOverflow
https://stackoverflow.com/a/52562921/250970
and https://www.npmjs.com/package/xml-flow https://www.npmjs.com/package/xml-stream so
https://www.npmjs.com/package/xtreamer

The example in xtreamer is simple enough to be used with `returnType:stream`
