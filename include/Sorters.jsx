﻿//----------------------------------------------------------------------------
// AtlasMaker
// sort.jsx - image sorting functions
//
// Author: Richard Dare
// richardjdare@googlemail.com
// http://richardjdare.com 
//----------------------------------------------------------------------------

#include "ImageInfo.jsx"

function SorterContainer(){
        this.sorters={
			'none'	: function (a,b) { return 1; },
			'width'	: function (a,b) { return a.width - b.width; },
			'height': function (a,b) { return a.height - b.height; },
			'area'  : function (a,b) { return a.width*a.height - b.width*b.height; },
			'magic' : function (a,b) { return Math.max(a.width,a.height) - Math.max(b.width,b.height); }
}
};