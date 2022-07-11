# patching `download()` method

After short discussion in https://github.com/amz-tools/amazon-sp-api/issues/56
here is the code that stream the download of a file, sparing memory and resource for large report files coming from amazon

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
      returns: 'none',
      file: targetFile
  });
} catch (err) {
  console.log("ERROR", err);
}
// check targetFile content
}
```


## dependency added

It add dependency to `xml-to-json-stream` module, that support stream as transformer.

## WIP

`request-stream.js` is just for GET request, then upload request should have an out version.
