//----------------------------------------------------------------------------
// AtlasMaker v0.7.4
// A Photoshop script to generate texture atlases from a directory of image
// files. 
//
// Author: Richard Dare
// richardjdare@googlemail.com
// http://richardjdare.com 
//
// This script uses RectanglePacker.js, written by Iván Montes
//
//  This program is free software: you can redistribute it and/or modify
//  it under the terms of the GNU General Public License as published by
//  the Free Software Foundation, either version 2 of the License, or
//  (at your option) any later version.
//  
//  This program is distributed in the hope that it will be useful,
//  but WITHOUT ANY WARRANTY; without even the implied warranty of
//  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//  GNU General Public License for more details.
//  
//  You should have received a copy of the GNU General Public License
//  along with this program.  If not, see <http://www.gnu.org/licenses/>.
//----------------------------------------------------------------------------

#target Photoshop

#include "include/PackerContainer.jsx"
#include "include/Sorters.jsx"
#include "include/ExportOrderWindow.jsx"

var appVersion = "0.7.4";

//----------------------------------------------------------------------------
// main
//----------------------------------------------------------------------------
function main()
{
	var defaultRulerUnits 	= preferences.rulerUnits;
	preferences.rulerUnits	= Units.PIXELS;

	var app = new AtlasMakerApp();
	app.Init();
	app.Run();
	app.ShutDown();
	preferences.rulerUnits = defaultRulerUnits;
}
main();

//----------------------------------------------------------------------------
// AtlasMakerApp() - main application class
//----------------------------------------------------------------------------
function AtlasMakerApp(){
	
	var myDialog;			//main window
	var atlasSettingsPanel;   // panel containing Atlas settings ui
	var destDocPanel;		// ui panel for destination document
	var exportPanel;		 // ui panel for export files
	var homeDirectory;	   //  where we at?
	var resDirectory;		// app resources directory 

	// this contains an array of all the packing methods
	var thePackers = new PackerContainer();

	// this contains an array of custom sorting functions
	var theSorters = new SorterContainer();

	// size of destination document
	var docWidth = 512;
	var docHeight= 512;

	// pixel margin around each sprite. use the same way as CSS margins.
	var margin = 0;

	// does the user want the packer to rotate sprites?
	var usesRotation = false;
	
	// does the current packer allow rotation?
	var allowsRotation= true;

	// folder object containing src images
	var srcFolder = new Folder();
	var gotSrcInfo= false;

	// default photoshop document name for dest image. (NOT filename)
	var docName = "Atlas-#n";

	// array of source images
	var sourceImages = [];
	var numSrcImages = 0;

	// keep track of largest images in a batch
	var greatestWidth = 0;
	var greatestHeight= 0;
	
	// have we got valid dest doc sizes?
	var gotValidSizes = true;
	
	//how many pages are needed to hold all the textures?
	var numPages = 0;

    //file handle for export file
    var exportFile = null;
    
    // are we creating an export file?
    var exportEnabled = false;

    // are we merging layers upon completion?
    var mergeLayers = false;

    // are we making a filled background layer?
    var filledBackground = false;

	//------------------------------------------------------------------------
	// Init - set everything up
	//------------------------------------------------------------------------
	this.Init = function(){    
		// get the file locations we'll need
		homeDirectory = this.GetHomeDirectory();
		resDirectory  = File(homeDirectory.absoluteURI+"/resources/");

		this.CreateUI();
		this.SelectPanel(0);
		this.OnSelectPacker();
	};

	//------------------------------------------------------------------------
	// Run
	//------------------------------------------------------------------------
	this.Run = function(){
		myDialog.center();
		myDialog.show();		
	};

	//------------------------------------------------------------------------
	// ShutDown()
	//------------------------------------------------------------------------
	this.ShutDown = function(){
		myDialog.close();
	};

	//----------------------------------------------------------------------------
	// GetHomeDirectory() - return a Folder object of our application directory
	//----------------------------------------------------------------------------
	this.GetHomeDirectory = function(){
        var scriptFile = new File($.fileName);
        return new File(scriptFile.path);
	};

	//------------------------------------------------------------------------
	// OnSrcDirButton() - put up a file requester and get src directory
	//------------------------------------------------------------------------
	this.OnSrcDirButton = function(){
		srcFolder = Folder.selectDialog("Select Src Directory");
		if(srcFolder !=null)
		{
			myDialog.topSection.srcDirPanel.getDirGrp.srcDirTxt.text = srcFolder.fsName;
	
			// rjd: ugh! if it wasnt 2am I'd look up a tutorial on binding.
			var appContext = this.parent.parent.parent.parent.owner;
			gotSrcInfo = appContext.ProcessSrcDirectory();

			// calculate atlas
			if(appContext.ValidateDocSizes())
				appContext.CalcAtlas();
		}
	};

	//------------------------------------------------------------------------
	// ProcessSrcDirectory() - scan thru each image and get size info etc.
	//------------------------------------------------------------------------
	this.ProcessSrcDirectory = function(){
        
		// rjd: enumerate file types
        var fileTypes = app.windowsFileTypes;
        if($.os.indexOf("macintosh")!=-1)
            fileTypes = app.macintoshFileTypes;

        // rjd: note 'jpeg' does not appear in file types but is common for jpg's 
        var regex  = RegExp('\.(jpeg|'+fileTypes.join('|')+')$','i');
        var files = srcFolder.getFiles(regex);
       
		if(files ==null || files.length ==0)
			return false;

		sourceImages = [];

		//rjd: TODO: put up some kind of notice/progress bar here...
        
		// get size info from source files and store it for later.
		for(var i=0;i<files.length;i++)
		{
			if(files[i] instanceof File)
			{
				var doc = open(files[i]);
				if(doc !=null)
				{
					//rjd: the doc sizes are of the form "n px". We need to change em to plain old int
					var width = ConvertPxToInt(doc.width);
					var height= ConvertPxToInt(doc.height);
				
					// keep track of largest dimensions
					if(width > greatestWidth)
						greatestWidth = width;
					if(height > greatestHeight)
						greatestHeight = height;
	
					sourceImages[sourceImages.length] = new ImageInfo(width,height,files[i].displayName,files[i],numSrcImages++);
					doc.close(SaveOptions.DONOTSAVECHANGES);
				}
			}
		}
		myDialog.topSection.srcDirPanel.srcInfoGrp.numFilesTxt.text = "Number of Files: "+numSrcImages;
		return true;
	};

	//------------------------------------------------------------------------
	// CreateUI() - set up the user interface
	//------------------------------------------------------------------------
	this.CreateUI = function(){
		myDialog = new Window('dialog', 'AtlasMaker v'+appVersion);
		myDialog.alignChildren = "fill";

		// rjd: see OnMainNavChange() for why we add this context variable
		// it should be replaced with some binding technique
		myDialog.owner = this;

		// top section - logo and src directory
		myDialog.topSection = myDialog.add('group');
		var topSectionRef = myDialog.topSection;
		topSectionRef.orientation = "row";

		topSectionRef.logoPanel = topSectionRef.add('panel',undefined,'');
		topSectionRef.logoPanel.preferredSize = [128,84];
		var logofile = new File(resDirectory.absoluteURI+"/amlogo72.png");
		topSectionRef.logoPanel.logoImage = topSectionRef.logoPanel.add('image',undefined,logofile);

		topSectionRef.srcDirPanel = topSectionRef.add('panel',undefined,'Source Directory');
		var srcDirPanelRef = topSectionRef.srcDirPanel;

		srcDirPanelRef.getDirGrp = srcDirPanelRef.add('group');
		srcDirPanelRef.getDirGrp.orientation = "row";
		srcDirPanelRef.getDirGrp.srcDirTxt = srcDirPanelRef.getDirGrp.add('edittext',undefined,'');
         srcDirPanelRef.getDirGrp.srcDirTxt.enabled=false;
		srcDirPanelRef.getDirGrp.srcDirTxt.preferredSize = [300,25];

		srcDirPanelRef.getDirGrp.srcDirBtn = srcDirPanelRef.getDirGrp.add('button',undefined,"Browse...");
		srcDirPanelRef.getDirGrp.srcDirBtn.onClick = this.OnSrcDirButton;

		srcDirPanelRef.srcInfoGrp = srcDirPanelRef.add('group');
		srcDirPanelRef.srcInfoGrp.orientation = "row";
		srcDirPanelRef.srcInfoGrp.alignment = "left";
		srcDirPanelRef.srcInfoGrp.numFilesTxt = srcDirPanelRef.srcInfoGrp.add('statictext',undefined,"Number of Files:");
		srcDirPanelRef.srcInfoGrp.numFilesTxt.preferredSize = [180,20];
		
		srcDirPanelRef.srcInfoGrp.numPagesTxt = srcDirPanelRef.srcInfoGrp.add('statictext',undefined,"Pages needed:");
		srcDirPanelRef.srcInfoGrp.numPagesTxt.preferredSize = [180,20];
        
        srcDirPanelRef.PackInfoGrp = srcDirPanelRef.add('group');
        srcDirPanelRef.PackInfoGrp.orientation = "row";
        srcDirPanelRef.PackInfoGrp.alignment = "left";
        srcDirPanelRef.PackInfoGrp.packerMsgTxt = srcDirPanelRef.PackInfoGrp.add('statictext',undefined,"");
        srcDirPanelRef.PackInfoGrp.packerMsgTxt.preferredSize = [400,20];

		// midsection -
		myDialog.mainSection = myDialog.add('group');
		var mainSectionRef = myDialog.mainSection;
		mainSectionRef.orientation = "row";

		mainSectionRef.mainNav = mainSectionRef.add('listbox');
		mainSectionRef.mainNav.preferredSize = [128,300];

		var mainNavRef = mainSectionRef.mainNav;
		mainNavRef.navItems = new Array();
		mainNavRef.navItems[0] = mainNavRef.add('item',"Atlas Settings");
		mainNavRef.navItems[1] = mainNavRef.add('item',"Destination Image");
		mainNavRef.navItems[2] = mainNavRef.add('item',"Export File");
		mainNavRef.navItems[0].selected =true;
		mainSectionRef.mainNav.onChange = this.OnMainNavChange;

		mainSectionRef.mainPanel = mainSectionRef.add('panel',undefined,'main content');
		mainSectionRef.mainPanel.preferredSize = [425,300];
		mainSectionRef.mainPanel.orientation = "stack";

		//bottom section - system buttons
		myDialog.systemGrp = myDialog.add('group');
		myDialog.systemGrp.orientation = "row";
		myDialog.systemGrp.alignment="right";

		myDialog.systemGrp.aboutButton = myDialog.systemGrp.add('button',undefined,"About");
		myDialog.systemGrp.aboutButton.onClick = this.OnAboutButtonClick;

		myDialog.systemGrp.okButton = myDialog.systemGrp.add('button',undefined,"Create Atlas");
		myDialog.systemGrp.okButton.onClick = this.OnOkButtonClick;
		myDialog.systemGrp.okButton.alignment="right";

		myDialog.systemGrp.cancelButton = myDialog.systemGrp.add('button',undefined,"Cancel");
		//myDialog.systemGrp.cancelButton.onClick = function() {close(); };
		myDialog.systemGrp.okButton.alignment="right";

		// create our panels
		this.CreateAtlasSettingsPanel();
		this.CreateDestDocPanel();
		this.CreateExportPanel();	
	};

	//------------------------------------------------------------------------
	// Create the Atlas Settings Panel
	//------------------------------------------------------------------------
	this.CreateAtlasSettingsPanel = function(){
		atlasSettingsPanel = myDialog.mainSection.mainPanel.add('group',undefined,'');
		atlasSettingsPanel.orientation = "column";
	
		atlasSettingsPanel.atlasSelectorGrp = atlasSettingsPanel.add("group",undefined,'');
	
		var atlasSelRef = atlasSettingsPanel.atlasSelectorGrp;
		atlasSelRef.border="none";
		atlasSelRef.orientation = "row";
		atlasSelRef.alignment = "left";
		atlasSelRef.preferredSize = [400,20];
	
		atlasSelRef.packerTypeLabel = atlasSelRef.add("statictext",undefined,"Packing method");
		atlasSelRef.packerType = atlasSelRef.add('dropdownlist',undefined,'Packing method');
		
		// add all the packers to the dropdown
		for(var i in thePackers.allPackers)
		{
			atlasSelRef.packerType.add('item',thePackers.allPackers[i].name);
		}
		
		atlasSelRef.packerType.selection = atlasSelRef.packerType.items[0];
		atlasSelRef.packerType.onChange = this.OnSelectPacker;

		atlasSettingsPanel.sortSelector = atlasSettingsPanel.add("group",undefined,"");
		var sortSelRef = atlasSettingsPanel.sortSelector;
		
		sortSelRef.border="none";
		sortSelRef.orientation = "row";
		sortSelRef.alignment = "left";
		sortSelRef.preferredSize = [400,20];
	
		sortSelRef.sorterTypeLabel = sortSelRef.add("statictext",undefined,"Sorting method");
		sortSelRef.sorterType = sortSelRef.add('dropdownlist',undefined,'SortingMethod');
                
		// add all the sorters to the dropdown
		for(var i in theSorters.sorters)
		{
			sortSelRef.sorterType.add('item',i);
		}

        sortSelRef.sorterType.selection = sortSelRef.sorterType.items[0];
        sortSelRef.sorterType.onChange = this.OnDocSizeChange;

        atlasSettingsPanel.reverseSortCheck = atlasSettingsPanel.add("checkbox",undefined,"Reverse Sort");
        atlasSettingsPanel.reverseSortCheck.alignment="left";

        atlasSettingsPanel.reverseSortCheck.onClick = this.OnDocSizeChange;

    
        atlasSettingsPanel.allowRotationCheck = atlasSettingsPanel.add("checkbox",undefined,"Allow Rotation");
        atlasSettingsPanel.allowRotationCheck.value=usesRotation;

        atlasSettingsPanel.allowRotationCheck.onClick = function(){
				usesRotation = atlasSettingsPanel.allowRotationCheck.value;
		};
	
		atlasSettingsPanel.allowRotationCheck.alignment="left";
	
		// weve moved margin to atlas settings
		atlasSettingsPanel.marginGrp = atlasSettingsPanel.add('group');
		atlasSettingsPanel.marginGrp.orientation = "row";
		atlasSettingsPanel.marginGrp.alignment = "left";
		atlasSettingsPanel.marginGrp.docMarginTxt = atlasSettingsPanel.marginGrp.add('statictext',undefined,"Margin:");
		atlasSettingsPanel.marginGrp.marginEdit = atlasSettingsPanel.marginGrp.add('edittext',undefined,margin);
		atlasSettingsPanel.marginGrp.marginEdit.preferredSize = [50,25];
		atlasSettingsPanel.marginGrp.docMarginTxt.alignment="right"
		atlasSettingsPanel.marginGrp.marginEdit.onChange = this.OnDocSizeChange;

		// rjd: this is a dummy group. it pushes the rest of the controls up into position.
		// if you add more controls then adjust the height of this panel accordingly.
		atlasSettingsPanel.dummyGrp = atlasSettingsPanel.add("group",undefined,"");
		atlasSettingsPanel.dummyGrp.preferredSize=[400,100];
	
		atlasSettingsPanel.hide();
	};

	//------------------------------------------------------------------------
	// Destination document panel
	//------------------------------------------------------------------------
	this.CreateDestDocPanel = function(){
		destDocPanel = myDialog.mainSection.mainPanel.add('group',undefined,'');
		destDocPanel.orientation = "column";
		destDocPanel.alignment = "left";
	
		destDocPanel.docNameGrp = destDocPanel.add('group');
		destDocPanel.docNameGrp.orientation = "row";
		destDocPanel.docNameGrp.alignment = "left";
		destDocPanel.docNameGrp.docNameTxt = destDocPanel.docNameGrp.add('statictext',undefined,"Document Name:");
		destDocPanel.docNameGrp.docNameEdit = destDocPanel.docNameGrp.add('edittext',undefined,docName);
		destDocPanel.docNameGrp.docNameEdit.preferredSize = [150,25];
		
		// contains 2 columns sidebyside
		destDocPanel.colContainer = destDocPanel.add('group',undefined,'container');
		destDocPanel.colContainer.orientation = "row";
		destDocPanel.colContainer.alignment = "left";
		
		// left column
		destDocPanel.colContainer.leftCol = destDocPanel.colContainer.add('group',undefined,'');
		destDocPanel.colContainer.leftCol.orientation = "row";
		destDocPanel.colContainer.leftCol.alignment = "left";
		
		// right column
		destDocPanel.colContainer.rightCol = destDocPanel.colContainer.add('group',undefined,'');
		destDocPanel.colContainer.rightCol.orientation = "column";
		destDocPanel.colContainer.rightCol.alignment = "left";
		
		// document sizes (left column)
		var lCol = destDocPanel.colContainer.leftCol;
		
		lCol.docSizeGrp = lCol.add('group');
		lCol.docSizeGrp.orientation = "column";
		lCol.docSizeGrp.alignment = "left";
		
		lCol.docSizeGrp.widthGrp = lCol.docSizeGrp.add('group');
		lCol.docSizeGrp.widthGrp.orientation = "row";
		lCol.docSizeGrp.widthGrp.alignment = "left";
		lCol.docSizeGrp.widthGrp.docWidthTxt = lCol.docSizeGrp.widthGrp.add('statictext',undefined,"Width: ");
		lCol.docSizeGrp.widthGrp.widthEdit = lCol.docSizeGrp.widthGrp.add('edittext',undefined,docWidth);
		lCol.docSizeGrp.widthGrp.widthEdit.preferredSize = [50,25];
		lCol.docSizeGrp.widthGrp.widthEdit.onChange = this.OnDocSizeChange;
		
		lCol.docSizeGrp.heightGrp = lCol.docSizeGrp.add('group');
		lCol.docSizeGrp.heightGrp.orientation = "row";
		lCol.docSizeGrp.heightGrp.alignment = "right";
		lCol.docSizeGrp.heightGrp.docHeightTxt = lCol.docSizeGrp.heightGrp.add('statictext',undefined,"Height:");
		lCol.docSizeGrp.heightGrp.heightEdit = lCol.docSizeGrp.heightGrp.add('edittext',undefined,docHeight);
		lCol.docSizeGrp.heightGrp.heightEdit.preferredSize = [50,25];
		lCol.docSizeGrp.heightGrp.heightEdit.onChange = this.OnDocSizeChange;
		
		// document data (right column)
		var rCol = destDocPanel.colContainer.rightCol;

		rCol.mergeLayersGrp = rCol.add('group');
		rCol.mergeLayersGrp.orientation = "column";
		rCol.mergeLayersGrp.alignment="left";
		rCol.mergeLayersGrp.mergeLayersCheck = rCol.mergeLayersGrp.add('checkbox',undefined,'Merge layers');
		rCol.mergeLayersGrp.mergeLayersCheck.value = false;
		         rCol.mergeLayersGrp.mergeLayersCheck.onClick = function(){
				mergeLayers = rCol.mergeLayersGrp.mergeLayersCheck.value;
		};

		rCol.backLayerGrp = rCol.add('group');
		rCol.backLayerGrp.orientation = "column";
		rCol.backLayerGrp.alignment="left";
		rCol.backLayerGrp.backLayerCheck = rCol.backLayerGrp.add('checkbox',undefined,'Fill background layer with background color');
		rCol.backLayerGrp.backLayerCheck.value = false;
		rCol.backLayerGrp.backLayerCheck.onClick = function(){
				filledBackground = rCol.backLayerGrp.backLayerCheck.value;
		};

		//rjd: dummy group to push the others into place
		rCol.dummyGrp = rCol.add("group",undefined,"");
		rCol.dummyGrp.preferredSize=[100,10];
	
		// rjd: this is a dummy group. it pushes the rest of the controls up into position.
		// if you add more controls then adjust the height of this panel accordingly.
		destDocPanel.dummyGrp = destDocPanel.add("group",undefined,"");
		destDocPanel.dummyGrp.preferredSize=[400,150];
		
		destDocPanel.hide();
	};

	//------------------------------------------------------------------------
	// export document panel
	//------------------------------------------------------------------------
	this.CreateExportPanel = function(){
		exportPanel = myDialog.mainSection.mainPanel.add('group',undefined,'');
		exportPanel.orientation = "column";
		exportPanel.alignment = "left";
	
		exportPanel.checkbxGrp = exportPanel.add('group');
		exportPanel.checkbxGrp.orientation = "row";
		exportPanel.checkbxGrp.alignment="left";
		
		exportPanel.checkbxGrp.dataStrCheck = exportPanel.checkbxGrp.add('checkbox',undefined,'Enable datafile export');
		exportPanel.checkbxGrp.dataStrCheck.value = false;

		exportPanel.checkbxGrp.dataStrCheck.onClick = function(){
						exportPanel.exportTextBox.enabled = exportPanel.checkbxGrp.dataStrCheck.value;
						exportPanel.exportFilePanel.getDirGrp.enabled = exportPanel.checkbxGrp.dataStrCheck.value;
						exportPanel.exportOrderPanel.enabled = exportPanel.checkbxGrp.dataStrCheck.value;
                          exportEnabled = exportPanel.checkbxGrp.dataStrCheck.value;
					};

		exportPanel.exportTextLabel = exportPanel.add("statictext",undefined,"Line template: (note: ctrl-enter must be used for newline)");
		exportPanel.exportTextLabel.alignment="left";
	
		exportPanel.exportTextBox = exportPanel.add("edittext",undefined,"",{"multiline":true});
		exportPanel.exportTextBox.preferredSize = [400,100];
		exportPanel.exportTextBox.enabled =  false;
		exportPanel.exportFNLabel = exportPanel.add("statictext",undefined,"Export file name");
		exportPanel.exportFNLabel.alignment="left";
		exportPanel.exportFilePanel = exportPanel.add('group',undefined,'Export Filename');
		
		var exportFilePanelRef = exportPanel.exportFilePanel;
		
		exportFilePanelRef.getDirGrp = exportFilePanelRef.add('group');
		exportFilePanelRef.getDirGrp.orientation = "row";
		exportFilePanelRef.getDirGrp.srcDirTxt = exportFilePanelRef.getDirGrp.add('edittext',undefined,'');

		exportFilePanelRef.getDirGrp.srcDirTxt.preferredSize = [300,25];

		exportFilePanelRef.getDirGrp.srcDirBtn = exportFilePanelRef.getDirGrp.add('button',undefined,"Browse...");
		exportFilePanelRef.getDirGrp.enabled = false;
         exportFilePanelRef.getDirGrp.srcDirBtn.onClick = this.OnBrowseExportFile;

		exportPanel.exportOrderPanel = exportPanel.add("group");
		exportPanel.exportOrderPanel.orientation = "row";
		exportPanel.exportOrderPanel.alignment="left";
		exportPanel.exportOrderPanel.exportOrderBtn = exportPanel.exportOrderPanel.add('button',undefined,"Reorder export file");
		exportPanel.exportOrderPanel.enabled = false;
		exportPanel.exportOrderPanel.exportOrderBtn.onClick = function(){
				if(sourceImages.length>0)
				{
                    var orderWin = new ExportOrderWindow();
                    orderWin.Open(sourceImages);
                    if(orderWin.OrderWasChanged())
                    {
                        sourceImages = eval(orderWin.GetReorderedImages());
                    }
				}
				else
					alert("There is no data to reorder");
			};

		//myDialog.srcDirPanel.getDirGrp.srcDirBtn.onClick = onSrcDirBtnClick;
		// rjd: this is a dummy group. it pushes the rest of the controls up into position.
		// if you add more controls then adjust the height of this panel accordingly.
		exportPanel.dummyGrp = exportPanel.add('group',undefined,"");
		exportPanel.dummyGrp.preferredSize=[400,20];
		
		exportPanel.hide();
	};

	//------------------------------------------------------------------------
	// SelectPanel() - hide/show UI panels
	//------------------------------------------------------------------------
	this.SelectPanel = function(panelId){
		switch(panelId)
		{
			case 0:
				destDocPanel.hide();
				exportPanel.hide();
				atlasSettingsPanel.show();
				myDialog.mainSection.mainPanel.text = "Atlas Settings";
				break;
			case 1:
				atlasSettingsPanel.hide();
				exportPanel.hide();
				destDocPanel.show();
				myDialog.mainSection.mainPanel.text = "Destination Image";
				break;
			case 2:
				atlasSettingsPanel.hide();
				destDocPanel.hide();
				exportPanel.show();
				myDialog.mainSection.mainPanel.text = "Export File";
				break;
		}
	};

	//------------------------------------------------------------------------
	// OnMainNavChange() - User changed main nav selection
	//------------------------------------------------------------------------
	this.OnMainNavChange = function(context){
		var selected =-1;
		for(var v in this.navItems)
		{
			if(this.navItems[v].selected)
				selected = parseInt(v);
		}
	
		// rjd: this sucks bigstyle. i need to learn about binding!
		var appClass = this.parent.parent.owner;
		appClass.SelectPanel(selected);
	};

	//----------------------------------------------------------------------------
	// CalcAtlas() - calculate the texture atlas
	//----------------------------------------------------------------------------
	this.CalcAtlas = function(){
		
		this.ResetImageData();

        // sort images
        var currentSorter = theSorters.sorters[atlasSettingsPanel.sortSelector.sorterType.selection.text];
        if(atlasSettingsPanel.reverseSortCheck.value)
        {
            sourceImages.reverse();
        }
        sourceImages.sort(currentSorter);

		// what kind of packer are we running?
		var currentPacker = thePackers.allPackers[atlasSettingsPanel.atlasSelectorGrp.packerType.selection.index];

		// set up the selected packer
		currentPacker.Init(docWidth,docHeight);
		currentPacker.usesRotation = usesRotation;
		currentPacker.margin = parseInt(atlasSettingsPanel.marginGrp.marginEdit.text);

		currentPacker.ClearErrors();
   
		// we give all the images to the packer in one go
		currentPacker.Calculate(sourceImages);
			
		// we need to know how many pages are required
		numPages = this.CountPages();
		
		var imagesLeft = sourceImages.length;
		var page =0;

		// set the pages needed here..
		myDialog.topSection.srcDirPanel.srcInfoGrp.numPagesTxt.text = "Pages needed:"+numPages;
        
        //update the packer status message area
        myDialog.topSection.srcDirPanel.PackInfoGrp.packerMsgTxt.text = currentPacker.statusMessage;
	};

	//------------------------------------------------------------------------
	// CountPages - get number of pages from sourceImages array.
	//------------------------------------------------------------------------
	this.CountPages = function(){
		var pageCount=0;
		for(var i in sourceImages)
		{
			if((sourceImages[i].pageIndex+1) > pageCount)
			{
				pageCount = sourceImages[i].pageIndex+1;
			}
		}
		return pageCount;
	};

	//------------------------------------------------------------------------
	// OnDocSizeChange() - user changed dest doc sizes
	//------------------------------------------------------------------------
	this.OnDocSizeChange = function(){
		var appContext = myDialog.owner;
		if(appContext.ValidateDocSizes() && sourceImages.length>0)
			appContext.CalcAtlas();
	};

	//----------------------------------------------------------------------------
	// ValidateDocSizes()
	//----------------------------------------------------------------------------
	this.ValidateDocSizes = function(){
		var width = destDocPanel.colContainer.leftCol.docSizeGrp.widthGrp.widthEdit.text;
		var height= destDocPanel.colContainer.leftCol.docSizeGrp.heightGrp.heightEdit.text;
		var margin =atlasSettingsPanel.marginGrp.marginEdit.text;

		//validate dimensions
		if( ! /^-?\d+$/.test(width))
		{
			alert("invalid width");
			gotValidSizes = false;
			return false;
		}
		if( ! /^-?\d+$/.test(height))
		{
			alert("invalid height");
			gotValidSizes = false;
			return false;
		}
		if( ! /^-?\d+$/.test(margin))
		{
			alert("invalid margin");
			gotValidSizes = false;
			return false;
		}
	
		var tempWidth = parseInt(width);
		var tempHeight= parseInt(height);
		var tempMargin= parseInt(margin);

		if(tempWidth <1 || tempHeight < 1)
		{
			alert("Document too small");
			gotValidSizes = false;
			return false;
		}

		if(tempWidth < greatestWidth+tempMargin || tempHeight < greatestHeight+tempMargin)
		{
			alert("The largest image is bigger than your document\n You need a document size of at least "+(greatestWidth+tempMargin)+"px  x "+(greatestHeight+tempMargin)+"px");
			gotValidSizes = false;
			return false;
		}

		gotValidSizes = true;

		docWidth = tempWidth;
		docHeight = tempHeight;
		this.margin = tempMargin;
		return true;
	};

	//----------------------------------------------------------------------------
	// OnOkButtonClick() - Handle "make atlas" button
	//----------------------------------------------------------------------------
	this.OnOkButtonClick = function(){
		var appContext = myDialog.owner;
		if(!gotValidSizes)
		{
			alert("invalid document sizes");
			return;
		}

        if(exportEnabled)
        {
            if(exportFile == null)
            {
                alert("Export file needed");
                return false;
            }
        }
		if(gotSrcInfo)
		{
			appContext.MakeAtlasSheets();
			
			if(exportPanel.checkbxGrp.dataStrCheck.value)
				appContext.CreateExportFile();

			appContext.ShutDown();
		}
		else
			alert("Please select a valid source directory");
	};

	//----------------------------------------------------------------------------
	// MakeAtlasSheets()
	//----------------------------------------------------------------------------
	this.MakeAtlasSheets = function(){
		for(var i=0;i<numPages;i++)
		{
             // get document name
             var docName = destDocPanel.docNameGrp.docNameEdit.text;
             docName = docName.replace(/#n/g,i);

			var sourceImgs = this.GetImagesForPage(i);
			var currentPage = documents.add(docWidth, docHeight, 72.0, docName,NewDocumentMode.RGB, DocumentFill.TRANSPARENT);
            
             // create filled background layer  
             if(filledBackground)
             {
                var c = app.backgroundColor;
                //var l = currentPage.artLayers[0];
                currentPage.selection.selectAll();
                currentPage.selection.fill(c);
                currentPage.selection.deselect();
             }

			for(var j=0;j<sourceImgs.length;j++)
			{
				var imgInfo = sourceImgs[j];
				var srcImg  = open(imgInfo.fullPath);
 
				// paste the sprite in the page
				var layerRef = this.CopyWithEmptyPixels(srcImg,currentPage,imgInfo);
				layerRef.name = imgInfo.fileName;
				srcImg.close(SaveOptions.DONOTSAVECHANGES);
			}

            // merge layers if needed
            if(mergeLayers)
            {
                currentPage.mergeVisibleLayers();
            }
		}
	};

	//----------------------------------------------------------------------------
    // OnBrowseExportFile()
	//----------------------------------------------------------------------------
    this.OnBrowseExportFile = function(){
        exportFile = File.saveDialog ("", "*.txt");
        if(exportFile !=null)
        {
            exportPanel.exportFilePanel.getDirGrp.srcDirTxt.text = exportFile.fsName;
        }
    };

	//----------------------------------------------------------------------------
    // createExportFile()
    //----------------------------------------------------------------------------
    this.CreateExportFile = function(){

        sourceImages.sort(function(a,b){
            if(a.exportIndex>b.exportIndex)
                return 1;
            if(a.exportIndex<b.exportIndex)
                return -1;
            return 0;
        });

        exportFile.open("w");

        for(var i=0;i<sourceImages.length;i++)
        {
            var a = sourceImages[i];

            var posx = a.posX + this.margin;
            var posy = a.posY + this.margin;
            var posx = posx.toString();
            var posy = posy.toString();
		
            var width= a.width.toString();
            var height= a.height.toString();
            var page = a.pageIndex;

            var exportLine = exportPanel.exportTextBox.text;
            exportLine = exportLine.replace(/#filename/g,a.fileName);
            exportLine = exportLine.replace(/#i/g,i);
            exportLine = exportLine.replace(/#x/g,posx);
            exportLine = exportLine.replace(/#y/g,posy);
            exportLine = exportLine.replace(/#width/g,width);
            exportLine = exportLine.replace(/#height/g,height);
            exportLine = exportLine.replace(/#p/g,page);
            exportFile.writeln(exportLine);
        }
        exportFile.close();
    };

	//----------------------------------------------------------------------------
	// CopyWithEmptyPixels - copy+paste an image preserving empty pixels
    // to do this we create a solid filled helper layer, link it to the sprite
    // and duplicate them together to the dest document. then we position them
    // and remove the helper layer.
	//----------------------------------------------------------------------------
	this.CopyWithEmptyPixels = function(src,dest,imageInfo){
        
        // rjd: there is a PS error related to concurrency in this function
        // which can be remedied with an app.refresh().
        // see: http://www.ps-scripts.com/bb/viewtopic.php?p=22750
        //
        // I personally get this only on CS5.
        // Test on other versions and remove it if it works for you
        app.refresh();
    
        app.activeDocument = src;
      
        // make any background layers into normal layers
        src.artLayers[0].isBackgroundLayer = false;

        if(src.artLayers.length>1)
            src.mergeVisibleLayers();

		var imageLayer = src.artLayers[0];
		imageLayer.name = "image";
	
		// add a blank white layer to the src image
		var blankLayer = src.artLayers.add();
		blankLayer.name = "blank";
	
		src.selection.selectAll();
		var c = new RGBColor();
		c.hexValue = "FFFFFF";
		src.selection.fill(c);
	
		// link the blank layer to the one with the texture in
		imageLayer.link(blankLayer);
		this.addToLayerSelection(imageLayer);

		// copy the blank layer (and linked image) to dest
		blankLayer.duplicate(dest);
	
		app.activeDocument = dest;
	
		// translate to origin,then to new position, plus margin
		var dBlank = dest.artLayers["blank"];

		dBlank.translate(-dBlank.bounds[0],-dBlank.bounds[1]);
		dBlank.translate(imageInfo.posX+this.margin,imageInfo.posY+this.margin);

		// unlink and delete the blank layer.
		dest.artLayers["image"].unlink();
		dest.artLayers["blank"].remove();

		return dest.artLayers["image"];
	};

	//----------------------------------------------------------------------------
	// addToLayerSelection - used to select multiple layers.
	// taken from http://ps-scripts.com/bb/viewtopic.php?t=2711
	//----------------------------------------------------------------------------
	this.addToLayerSelection = function(layer) {
		var desc = new ActionDescriptor();
		var ref = new ActionReference();
		ref.putName( charIDToTypeID('Lyr '), layer.name );
		desc.putReference( charIDToTypeID('null'), ref );
		desc.putEnumerated( stringIDToTypeID('selectionModifier'), stringIDToTypeID('selectionModifierType'), stringIDToTypeID('addToSelection') );
		desc.putBoolean( charIDToTypeID('MkVs'), false );
		executeAction( charIDToTypeID('slct'), desc, DialogModes.NO );
	};

	//----------------------------------------------------------------------------
	// ResetImageData() - clear atlas position info from image array
	//----------------------------------------------------------------------------
	this.ResetImageData = function(){
		for(var i in sourceImages)
		{
			sourceImages[i].posX = -1;
			sourceImages[i].posY = -1;
			sourceImages[i].imagePlaced = false;
			sourceImages[i].pageIndex = 0;
		}
	};

	//------------------------------------------------------------------------
	// OnSelectPacker - called when user selects packer from dropdown
	//------------------------------------------------------------------------
	this.OnSelectPacker = function(){
		var i = atlasSettingsPanel.atlasSelectorGrp.packerType.selection.index;
		var selectedPacker = thePackers.allPackers[i];

		// disable the rotation if the packer doesn't use it
		atlasSettingsPanel.allowRotationCheck.enabled = selectedPacker.allowsRotation;
		allowsRotation = selectedPacker.allowsRotation;
        
        myDialog.owner.OnDocSizeChange();
	};


	//------------------------------------------------------------------------
    // GetImagesForPage - return an array of ImageInfos for a single page
    //------------------------------------------------------------------------
	this.GetImagesForPage = function(pageNum){
		var imagesForPage = new Array();
		for(var i in sourceImages)
		{
			if(sourceImages[i].pageIndex == pageNum)
				imagesForPage.push(sourceImages[i]);
		}
		return imagesForPage;
	};

    //------------------------------------------------------------------------
    // onAboutButtonClick
    //------------------------------------------------------------------------
    this.OnAboutButtonClick = function(){
        var aboutWin = new Window('dialog',"About AtlasMaker");
        aboutWin.preferredSize = [400,150];
        //aboutWin.location = {x:100,y:100};
        var aboutText = "Atlas Maker v"+appVersion+"\n\n";
        aboutText+="2009-2016 Richard Dare - http://richardjdare.com\n\n";
        aboutText+="Uses RectanglePacker.js by Ivan Montes <drslump@drslump.biz>\n\n";
 
        aboutWin.aboutTxt = aboutWin.add('statictext',undefined,aboutText,{multiline:true,scrolling:false});
        aboutWin.aboutTxt.preferredSize = [380,100];
        aboutWin.okButton = aboutWin.add('button',undefined,"Ok");
        aboutWin.okButton.onClick = function(){aboutWin.close()};
        aboutWin.okButton.alignment = "center";

        aboutWin.show();
    };
};

//----------------------------------------------------------------------------
// ConvertPxToInt() - photoshop often returns sizes as " nn px". this 
// function turns them into plain old int
//----------------------------------------------------------------------------
function ConvertPxToInt(input)
{
	var inpStr = input.toString();
	inpStr = inpStr.substring(0,inpStr.indexOf(" px"));
	var retVal= parseInt(inpStr);
	
	return retVal;
}
