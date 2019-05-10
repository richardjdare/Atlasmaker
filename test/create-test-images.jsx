//------------------------------------------------------------------------
// Generate some random test images for AtlasMaker
// 2019 Richard Dare - richardjdare.com
//------------------------------------------------------------------------

var numImages = 20;
var maxWidth = 100;
var maxHeight= 100;

// set this to true to only make images of maxWidth * maxHeight - ie. tiled images.
var fixedSize = false;

// where to save images
var destDir = Folder.selectDialog("Select Destination Directory");

if(destDir!=null){
    for(var i = 0;i<numImages;i++){
        
        var width = maxWidth;
        var height = maxHeight;
        
        if(!fixedSize){
         width = randomInt(maxWidth);
         height= randomInt(maxHeight);
        }
   
        var img = documents.add(width,height, 72.0, "AtlasMaker-test-00"+i,NewDocumentMode.RGB, DocumentFill.TRANSPARENT);
        img.artLayers[0].applyClouds();
        
        var file = new File(destDir.absoluteURI+"/AtlasMaker-test-00"+i);
        saveOptions = new JPEGSaveOptions();
        saveOptions.embedColorProfile = true;
        saveOptions.formatOptions = FormatOptions.STANDARDBASELINE;
        saveOptions.matte = MatteType.NONE;
        saveOptions.quality = 9;
        
        img.saveAs(file, saveOptions, true,Extension.LOWERCASE);
        img.close(SaveOptions.DONOTSAVECHANGES);
    }
}

function randomInt(max) {
  return Math.floor(Math.random() * Math.floor(max));
}