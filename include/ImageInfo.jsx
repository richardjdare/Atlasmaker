﻿//----------------------------------------------------------------------------// AtlasMaker// ImageInfo.jsx - All images we work on are represented by one of these.//// Author: Richard Dare// richardjdare@googlemail.com// http://richardjdare.com //----------------------------------------------------------------------------function ImageInfo(width,height,fileName,fullPath,exportIndex){	this.width = width;	this.height= height;	this.fileName=fileName;	this.fullPath = fullPath;		// is this image rotated (0 or 90')	this.angle = 0;	// has this image been placed on the atlas?	this.imagePlaced = false;		// what page is this image on?	this.pageIndex = 0;		// location in export file. This can be modified by the user	this.exportIndex = exportIndex;		// position on atlas	this.posX = -1;	this.posY = -1;};