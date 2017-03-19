/**
* @Author: Pingjun Chen <Pingjun>
* @Date:   2017-02-01T11:24:38-05:00
* @Email:  codingPingjun@gmail.com
* @Filename: muscledraw.js
* @Last modified by:   pingjun
* @Last modified time: 2017-Feb-17 21:56:40
* @License: The MIT License (MIT)
* @Copyright: Lab BICI2. All Rights Reserved.
*/

//(function() {                 // force everything local.
var debug = 1;
var localhost='';
var dbroot = "http://"+localhost+"/php/microdraw_db.php";
var ImageInfo = {};             // regions, and projectID (for the paper.js canvas) for each slices, can be accessed by the slice name. (e.g. ImageInfo[imageOrder[viewer.current_page()]])
// regions contain a paper.js path, a unique ID and a name
var imageOrder = [];            // names of slices ordered by their openseadragon page numbers
var currentImage = undefined;   // name of the current image
var prevImage = undefined;      // name of the last image
var region = null;	            // currently selected region (one element of Regions[])
var copyRegion;		            // clone of the currently selected region for copy/paste
var handle;			            // currently selected control point or handle (if any)
var selectedTool;	            // currently selected tool
var viewer;			            // open seadragon viewer
var navEnabled = true;          // flag indicating whether the navigator is enabled (if it's not, the annotation tools are)
var magicV = 1000;	            // resolution of the annotation canvas - is changed automatically to reflect the size of the tileSource
var myOrigin = {};	            // Origin identification for DB storage
var	params;			            // URL parameters
var	myIP;			            // user's IP
var UndoStack = [];
var RedoStack = [];
var mouseUndo;                  // tentative undo information.
var shortCuts = [];             // List of shortcuts
var newRegionFlag;	            // true when a region is being drawn
var drawingPolygonFlag = false; // true when drawing a polygon
var annotationLoadingFlag;      // true when an annotation is being loaded
var config = {}                 // App configuration object
var isMac = navigator.platform.match(/Mac/i)?true:false;
var isIOS = navigator.platform.match(/(iPhone|iPod|iPad)/i)?true:false;
var imagingHelper;

// https://codepen.io/vsync/pen/czgrf textarea autoresize

/***1
Region handling functions
*/
function newRegion(arg, imageNumber) {
	// if( debug ) console.log("> newRegion");
    
    // define region properties
	var reg = {};
	reg.uid = regionUniqueID();
	if( arg.name ) {
		reg.name = arg.name;
	} else {
		reg.name = "region " + reg.uid;
	}
    if( arg.description ) {
        reg.description = arg.description;
    }
    if( arg.foldername ) {
        reg.foldername = arg.foldername;
    }
    if (arg.transcript) {
        reg.transcript = arg.transcript;
    } else {
        reg.transcript="";
    }
	var color = regionHashColor(reg.name);
	if( arg.path ) {
		reg.path = arg.path;
		reg.path.strokeWidth = arg.path.strokeWidth ? arg.path.strokeWidth : config.defaultStrokeWidth;
		reg.path.strokeColor = arg.path.strokeColor ? arg.path.strokeColor : config.defaultStrokeColor;
		reg.path.strokeScaling = false;
		reg.path.fillColor = arg.path.fillColor ? arg.path.fillColor :'rgba('+color.red+','+color.green+','+color.blue+','+config.defaultFillAlpha+')';
		reg.path.selected = false;
	}

	if( imageNumber === undefined ) {
		imageNumber = currentImage;
	}
	if( imageNumber === currentImage ) {
		// append region tag to regionList
		var el = $(regionTag(reg.name,reg.uid));
		$("#regionList").append(el);

		// handle single click on computers
		el.click(singlePressOnRegion);

		// handle double click on computers
		el.dblclick(doublePressOnRegion);

		// handle single and double tap on touch devices
		/*
		RT: it seems that a click event is also fired on touch devices,
		making this one redundant
		*/
		el.on("touchstart",handleRegionTap);
	}

	// Select region name in list
	$("#regionList > .region-tag").each(function(i){
		$(this).addClass("deselected");
		$(this).removeClass("selected");
	});

	var tag = $("#regionList > .region-tag#" + reg.uid);
	$(tag).removeClass("deselected");
	$(tag).addClass("selected");

	// push the new region to the Regions array
	ImageInfo[imageNumber]["Regions"].push(reg);
	return reg;
}

function removeRegion(reg, imageNumber) {
	if( debug ) console.log("> removeRegion");

	if( imageNumber === undefined ) {
		imageNumber = currentImage;
	}

	// remove from Regions array
	ImageInfo[imageNumber]["Regions"].splice(ImageInfo[imageNumber]["Regions"].indexOf(reg),1);
	// remove from paths
	reg.path.remove();
	if( imageNumber == currentImage ) {
		// remove from regionList
		var	tag = $("#regionList > .region-tag#" + reg.uid);
		$(tag).remove();
	}
}

function selectRegion(reg) {
	if( debug ) console.log("> selectRegion");

	var i;

	// Select path
	for( i = 0; i < ImageInfo[currentImage]["Regions"].length; i++ ) {
		var region_id = ImageInfo[currentImage]["Regions"][i].uid;
		if( ImageInfo[currentImage]["Regions"][i] == reg ) {
			reg.path.selected = true;
			reg.path.fullySelected = true;
			region = reg;
			$("#desp-"+region_id).show();
		} else {
			ImageInfo[currentImage]["Regions"][i].path.selected = false;
			ImageInfo[currentImage]["Regions"][i].path.fullySelected = false;
			$("#desp-"+region_id).hide();
		}
	}
	paper.view.draw();

	// Select region name in list
	$("#regionList > .region-tag").each(function(i){
		$(this).addClass("deselected");
		$(this).removeClass("selected");
	});

	var tag = $("#regionList > .region-tag#" + reg.uid);
	$(tag).removeClass("deselected");
	$(tag).addClass("selected");

	if(debug) console.log("< selectRegion");
}

function findRegionByUID(uid) {
	// if( debug ) console.log("> findRegionByUID");

	var i;
	if( debug > 2 ) console.log( "look for uid: " + uid);
	// if( debug > 2 ) console.log( ImageInfo );
	if( debug > 2 ) console.log( "region array lenght: " + ImageInfo[currentImage]["Regions"].length );

	for( i = 0; i < ImageInfo[currentImage]["Regions"].length; i++ ) {

		if( ImageInfo[currentImage]["Regions"][i].uid == uid ) {
			if( debug > 2 ) console.log( "region " + ImageInfo[currentImage]["Regions"][i].uid + ": " );
			if( debug > 2 ) console.log( ImageInfo[currentImage]["Regions"][i] );
			return ImageInfo[currentImage]["Regions"][i];
		}
	}
	console.log("Region with unique ID "+uid+" not found");
	return null;
}

function findRegionByName(name) {
	if( debug ) console.log("> findRegionByName");

	var i;
	for( i = 0; i < ImageInfo[currentImage]["Regions"].length; i++ ) {
		if( ImageInfo[currentImage]["Regions"][i].name == name ) {
			return ImageInfo[currentImage]["Regions"][i];
		}
	}
	console.log("Region with name " + name + " not found");
	return null;
}

var counter = 1;
function regionUniqueID() {
	// if( debug ) console.log("> regionUniqueID");

	var i;
	var found = false;
	counter=1;
	while( found == false ) {
		found = true;
		for( i = 0; i < ImageInfo[currentImage]["Regions"].length; i++ ) {
			if( ImageInfo[currentImage]["Regions"][i].uid == counter ) {
				counter++;
				found = false;
				break;
			}
		}
	}
	return counter;
}

function hash(str) {
    /* splits string into array of characters, then applies the function to every element */
	var result = str.split("").reduce(function(a,b) {
        // a<<5 bit-shifts a to the left 5 times
		a = ((a<<5)-a) + b.charCodeAt(0);
        // & means bitwise AND 
		return a&a;
	},0);
	return result;
}

function regionHashColor(name) {
	//if(debug) console.log("> regionHashColor");

	var color = {};
	var h = hash(name);

	// add some randomness
	h = Math.sin(h++)*10000;
	h = 0xffffff*(h-Math.floor(h));

	color.red = h&0xff;
	color.green = (h&0xff00)>>8;
	color.blue = (h&0xff0000)>>16;
	return color;
}

function regionTag(name,uid) {
	//if( debug ) console.log("> regionTag");

	var str;
	var color = regionHashColor(name);
	if( uid ) {
		var reg = findRegionByUID(uid);
		var mult = 1.0;
		if( reg ) {
			mult = 255;
			color = reg.path.fillColor;
		}
		else {
			color = regionHashColor(name);
		}

		// if mp3 files load the mp3 files here
		str = [ "<div class='region-tag' id='" + uid + "' style='padding:3px 3px 0px 3px'>",
		"<img class='eye' title='Region visible' id='eye_" + uid + "' src='../static/img/eyeOpened.svg' />",
		"<div class='region-color'",
		"style='background-color:rgba(",
		parseInt(color.red*mult),",",parseInt(color.green*mult),",",parseInt(color.blue*mult),",0.67",
		")'></div>",
		"<span class='region-name'>" + name + "</span>",
		"<span class='region-recording' style='display:none;' id='region-msg"+uid+"'>Recording...</span>",
		"<div style='float:right;'><input type='image' class='eye' style='width:24px;height:24px;' src='../static/img/startrecord.png' onclick='startRecording(this);' />",
		"<input type='image' class='eye' style='width:24px;height:24px;display: none;' src='../static/img/stoprecord.png' onclick='stopRecording(this);' disabled='disabled'/></div>",
		"<div><ul id='rl-"+uid+"' style='margin:0px;padding:4px 4px 0px 4px;'></ul></div>",
		"<div><textarea id='desp-"+uid+"' rows='5' wrap='soft' style='display:none'></textarea></div>",
		"</div>", ].join(" ");
    } else {
        color = regionHashColor(name);
        str = [ "<div class='region-tag' style='padding:2px'>",
        "<div class='region-color'",
        "style='background-color:rgba(",
        color.red,",",color.green,",",color.blue,",0.67",
        ")'></div>",
        "<span class='region-name'>" + name + "</span>",
        "</div>",
        ].join(" ");
    }
    return str;
}

function regionPicker(parent) {
	if( debug ) console.log("> regionPicker");

	$("div#regionPicker").appendTo("body");
	$("div#regionPicker").show();
}

function changeRegionName(reg,name) {
	if( debug ) console.log("> changeRegionName");

	var i;
	var color = regionHashColor(name);

	// Update path
	reg.name = name;
	reg.path.fillColor = 'rgba('+color.red+','+color.green+','+color.blue+',0.5)';
	paper.view.draw();

	// Update region tag
	$(".region-tag#" + reg.uid + ">.region-name").text(name);
	$(".region-tag#" + reg.uid + ">.region-color").css('background-color','rgba('+color.red+','+color.green+','+color.blue+',0.67)');
}

/*** toggle visibility of region
***/
function toggleRegion(reg) {
	if( region !== null ) {
		if( debug ) console.log("> toggle region");

		var color = regionHashColor(reg.name);
		if( reg.path.fillColor !== null ) {
			reg.path.storeColor = reg.path.fillColor;
			reg.path.fillColor = null;

			reg.path.strokeWidth = 0;
			reg.path.fullySelected = false;
			reg.storeName = reg.name;
			//reg.name=reg.name+'*';
			$('#eye_' + reg.uid).attr('src','../static/img/eyeClosed.svg');
		}
		else {
			reg.path.fillColor = reg.path.storeColor;
			reg.path.strokeWidth = 1;
			reg.name = reg.storeName;
			$('#eye_' + reg.uid).attr('src','../static/img/eyeOpened.svg');
		}
		paper.view.draw();
		$(".region-tag#" + reg.uid + ">.region-name").text(reg.name);
	}
}


function updateRegionList() {
	if( debug ) console.log("> updateRegionList");

	// remove all entries in the regionList
	$("#regionList > .region-tag").each(function() {
		$(this).remove();
	});

	//var def = $.Deferred();
	// adding entries corresponding to the currentImage
	for( var i = 0; i < ImageInfo[currentImage]["Regions"].length; i++ ) {

		var reg = ImageInfo[currentImage]["Regions"][i];
		if( debug ) console.log("> restoring region..",reg.uid);
		// append region tag to regionList
		var el = $(regionTag(reg.name,reg.uid));
		$("#regionList").append(el);

		// add mp3 name if not undefined to the region list
		if(reg.description!=undefined || reg.description!="undefined")
		{
			if( debug ) console.log(reg.description);

			var url = '../static/Annotations/' +ImageInfo[currentImage].foldername+'/'+'region' + reg.uid + '.mp3';
			var li = document.createElement('li');
			var au = document.createElement('audio');

			au.controls = true;
			au.src = url;
			au.style.width='100%';

			li.appendChild(au);
			$('#rl-'+reg.uid).empty();
			$('#rl-'+reg.uid).append(li);

		}// end if

		// add the transcript
		if(reg.transcript!=undefined || reg.transcript!="undefined")
		{
			$("#desp-"+reg.uid).val(reg.transcript);
		}

		// handle single click on computers
		el.click(singlePressOnRegion);
		// handle double click on computers
		el.dblclick(doublePressOnRegion);
		// handle single and double tap on touch devices
		el.on("touchstart",handleRegionTap);
	}
	//return def.promise();
}

function encode64alt(buffer) {
	var binary = '',
	bytes = new Uint8Array( buffer ),
	len = bytes.byteLength;
	for (var i = 0; i < len; i++) {
		binary += String.fromCharCode( bytes[ i ] );
	}
	return window.btoa( binary );
}

function checkRegionSize(reg) {
	if( reg.path.length > 3 ) {
		return;
	}
	else {
		removeRegion(region, currentImage);
	}
}


/*****************************************************************************
    EVENT HANDLERS
 *****************************************************************************/
var tap = false

function clickHandler(event){
	if( debug ) console.log("> clickHandler");

	event.stopHandlers = !navEnabled;
	if( selectedTool == "draw" ) {
		checkRegionSize(region);
	}
}

function pressHandler(event){
	if( debug ) console.log("> pressHandler");

	if( !navEnabled ) {
		event.stopHandlers = true;
		mouseDown(event.originalEvent.layerX,event.originalEvent.layerY);
	}
}

function dragHandler(event){
	if( debug > 1 )
	console.log("> dragHandler");

	if( !navEnabled ) {
		event.stopHandlers = true;
		mouseDrag(event.originalEvent.layerX,event.originalEvent.layerY,event.delta.x,event.delta.y);
	}
}

function dragEndHandler(event){
	if( debug ) console.log("> dragEndHandler");

	if( !navEnabled ) {
		event.stopHandlers = true;
		mouseUp();
	}
}

function singlePressOnRegion(event) {
	if( debug ) console.log("> singlePressOnRegion");

	event.stopPropagation();
	event.preventDefault();

	var el = $(this);
	var uid;
	var reg;

	if( debug ) console.log(event);
	if( event.clientX > 20 ) {
		if( event.clientX > 50 ) {
            // Click on regionList (list or annotated regions)
            uid = $(this).attr('id');
            reg = findRegionByUID(uid);
            if( reg ) {
                selectRegion(reg);
            }
            else
            console.log("region undefined");
		}
		else {
			var reg = findRegionByUID(this.id);
			if( reg.path.fillColor != null ) {
				if( reg ) {
					selectRegion(reg);
				}
				annotationStyle(reg);
			}
		}
	}
	else {
		var reg = findRegionByUID(this.id);
		toggleRegion(reg);
	}
}

function doublePressOnRegion(event) {
	if( debug ) console.log("> doublePressOnRegion");

	event.stopPropagation();
	event.preventDefault();

	if( event.clientX > 20 ) {
		if( event.clientX > 50 ) {
			if( config.drawingEnabled ) {
                var name = prompt("Region name", findRegionByUID(this.id).name);
                if( name != null ) {
                    changeRegionName(findRegionByUID(this.id), name);
				}
			}
		}
		else {
			var reg = findRegionByUID(this.id);
			if( reg.path.fillColor != null ) {
				if( reg ) {
					selectRegion(reg);
				}
				annotationStyle(reg);
			}
		}
	}
	else {
		var reg = findRegionByUID(this.id);
		toggleRegion(reg);
	}
}

function handleRegionTap(event) {
	/*
	Handles single and double tap in touch devices
	*/
	if( debug ) console.log("> handleRegionTap");

	var caller = this;

	if( !tap ){ //if tap is not set, set up single tap
		tap = setTimeout(function() {
			tap = null
		},300);

		// call singlePressOnRegion(event) using 'this' as context
		singlePressOnRegion.call(this,event);
	} else {
		clearTimeout(tap);
		tap = null;

		// call doublePressOnRegion(event) using 'this' as context
		doublePressOnRegion.call(this,event);
	}
	if( debug ) console.log("< handleRegionTap");
}

function mouseDown(x,y) {
	if( debug > 1 ) console.log("> mouseDown");

	mouseUndo = getUndo();
	var prevRegion = null;
	var point = paper.view.viewToProject(new paper.Point(x,y));

	handle = null;

	switch( selectedTool ) {
		case "select":
		case "addpoint":
		case "delpoint":
		case "addregion":
		case "delregion":
		case "splitregion": {
			var hitResult = paper.project.hitTest(point, {
				tolerance: 10,
				stroke: true,
				segments: true,
				fill: true,
				handles: true
			});

			newRegionFlag = false;
			if( hitResult ) {
				var i;
				for( i = 0; i < ImageInfo[currentImage]["Regions"].length; i++ ) {
					if( ImageInfo[currentImage]["Regions"][i].path == hitResult.item ) {
						re = ImageInfo[currentImage]["Regions"][i];
						break;
					}
				}

				// select path
				if( region && region != re ) {
					region.path.selected = false;
					prevRegion = region;
				}
				selectRegion(re);

				if( hitResult.type == 'handle-in' ) {
					handle = hitResult.segment.handleIn;
					handle.point = point;
				}
				else if( hitResult.type == 'handle-out' ) {
					handle = hitResult.segment.handleOut;
					handle.point = point;
				}
				else if( hitResult.type == 'segment' ) {
					if( selectedTool == "select" ) {
						handle = hitResult.segment.point;
						handle.point = point;
					}
					if( selectedTool == "delpoint" ) {
						hitResult.segment.remove();
						commitMouseUndo();
					}
				}
				else if( hitResult.type == 'stroke' && selectedTool == "addpoint" ) {
					region.path
					.curves[hitResult.location.index]
					.divide(hitResult.location);
					region.path.fullySelected = true;
					commitMouseUndo();
					paper.view.draw();
				}
				else if( selectedTool == "addregion" ) {
					if( prevRegion ) {
						var newPath = region.path.unite(prevRegion.path);
						removeRegion(prevRegion);
						region.path.remove();
						region.path = newPath;
						updateRegionList();
						selectRegion(region);
						paper.view.draw();
						commitMouseUndo();
						backToSelect();
					}
				}
				else if( selectedTool == "delregion" ) {
					if( prevRegion ) {
						var newPath = prevRegion.path.subtract(region.path);
						removeRegion(prevRegion);
						prevRegion.path.remove();
						newRegion({path:newPath});
						updateRegionList();
						selectRegion(region);
						paper.view.draw();
						commitMouseUndo();
						backToSelect();
					}
				}
				else if( selectedTool == "splitregion" ) {
					/*selected region is prevRegion!
					region is the region that should be split based on prevRegion
					newRegionPath is outlining that part of region which has not been overlaid by prevRegion
					i.e. newRegion is what was region
					and prevRegion color should go to the other part*/
					if( prevRegion ) {
						var prevColor = prevRegion.path.fillColor;
						//color of the overlaid part
						var color = region.path.fillColor;
						var newPath = region.path.divide(prevRegion.path);

						removeRegion(prevRegion);
						region.path.remove();

						region.path = newPath;
						var newReg;
						for( i = 0; i < newPath._children.length; i++ )
						{
							if( i == 0 ) {
								region.path = newPath._children[i];
							}
							else {
								newReg = newRegion({path:newPath._children[i]});
							}
						}
						region.path.fillColor = color;
						if( newReg ) {
							newReg.path.fillColor = prevColor;
						}
						updateRegionList();
						selectRegion(region);
						paper.view.draw();

						commitMouseUndo();
						backToSelect();
					}
				}
				break;
			}
			if( hitResult == null && region ) {
				//deselect paths
				region.path.selected = false;
				region = null;
			}
			break;
		}
		case "draw": {
			// Start a new region
			// if there was an older region selected, unselect it
			if( region ) {
				region.path.selected = false;
			}
			// start a new region
			var path = new paper.Path({segments:[point]})
			path.strokeWidth = config.defaultStrokeWidth;
			region = newRegion({path:path});
			// signal that a new region has been created for drawing
			newRegionFlag = true;

			commitMouseUndo();
			break;
		}
		case "draw-polygon": {
			// is already drawing a polygon or not?
			if( drawingPolygonFlag == false ) {
				// deselect previously selected region
				if( region )
				region.path.selected = false;

				// Start a new Region with alpha 0
				var path = new paper.Path({segments:[point]})
				path.strokeWidth = config.defaultStrokeWidth;
				region = newRegion({path:path});
				region.path.fillColor.alpha = 0;
				region.path.selected = true;
				drawingPolygonFlag = true;
				commitMouseUndo();
			} else {
				var hitResult = paper.project.hitTest(point, {tolerance:10, segments:true});
				if( hitResult && hitResult.item == region.path && hitResult.segment.point == region.path.segments[0].point ) {
					// clicked on first point of current path
					// --> close path and remove drawing flag
					finishDrawingPolygon(true);
				} else {
					// add point to region
					region.path.add(point);
					commitMouseUndo();
				}
			}
			break;
		}
		case "rotate":
		region.origin = point;
		break;
	}
	paper.view.draw();
}

function mouseDrag(x,y,dx,dy) {
	//if( debug ) console.log("> mouseDrag");

	// transform screen coordinate into world coordinate
	var point = paper.view.viewToProject(new paper.Point(x,y));

	// transform screen delta into world delta
	var orig = paper.view.viewToProject(new paper.Point(0,0));
	var dpoint = paper.view.viewToProject(new paper.Point(dx,dy));
	dpoint.x -= orig.x;
	dpoint.y -= orig.y;

	if( handle ) {
		handle.x += point.x-handle.point.x;
		handle.y += point.y-handle.point.y;
		handle.point = point;
		commitMouseUndo();
	} else
	if( selectedTool == "draw" ) {
		region.path.add(point);
	} else
	if( selectedTool == "select" ) {
		// event.stopHandlers = true;
		for( i in ImageInfo[currentImage]["Regions"] ) {
			var reg = ImageInfo[currentImage]["Regions"][i];
			if( reg.path.selected ) {
				reg.path.position.x += dpoint.x;
				reg.path.position.y += dpoint.y;
				commitMouseUndo();
			}
		}
	}
	if( selectedTool == "rotate" ) {
		event.stopHandlers = true;
		var degree = parseInt(dpoint.x);
		var i;
		for( i in ImageInfo[currentImage]["Regions"] ) {
			if( ImageInfo[currentImage]["Regions"][i].path.selected ) {
				ImageInfo[currentImage]["Regions"][i].path.rotate(degree, region.origin);
				commitMouseUndo();
			}
		}
	}
	paper.view.draw();
}

function mouseUp() {
	if( debug ) console.log("> mouseUp");

	if( newRegionFlag == true ) {
		region.path.closed = true;
		region.path.fullySelected = true;
		// to delete all unnecessary segments while preserving the form of the region to make it modifiable; & adding handles to the segments
		var orig_segments = region.path.segments.length;
		region.path.simplify(0.02);
		var final_segments = region.path.segments.length;
		if( debug > 2 ) console.log( parseInt(final_segments/orig_segments*100) + "% segments conserved" );
	}
	paper.view.draw();
}

function simplify() {
    /* calls simplify method of region path to resample the contour */
	if( region !== null ) {
		if( debug ) console.log("> simplifying region path");

		var orig_segments = region.path.segments.length;
		region.path.simplify();
		var final_segments = region.path.segments.length;
		console.log( parseInt(final_segments/orig_segments*100) + "% segments conserved" );
		paper.view.draw();
	}
}

function flipRegion(reg) {
    /* flip region along y-axis around its center point */
    if( region !== null ) {
		if( debug ) console.log("> flipping region");

		var i;
		for( i in ImageInfo[currentImage]["Regions"] ) {
			if( ImageInfo[currentImage]["Regions"][i].path.selected ) {
				ImageInfo[currentImage]["Regions"][i].path.scale(-1, 1);
			}
		}
		paper.view.draw();
	}
}

function toggleHandles() {
	console.log("> toggleHandles");
	if (region != null) {
		if (region.path.hasHandles()) {
			if (confirm('Do you really want to remove the handles?')) {
				var undoInfo = getUndo();
				region.path.clearHandles();
				saveUndo(undoInfo);
			}
		}
		else {
			var undoInfo = getUndo();
			region.path.smooth();
			saveUndo(undoInfo);
		}
		paper.view.draw();
	}
}



/*****************************************************************************
    ANNOTATION STYLE
 *****************************************************************************/
var currentColorRegion;

function pad(number, length) {
    /* add leading zeros to (string)number */
	var str = '' + number;
	while( str.length < length )
	str = '0' + str;
	return str;
}

// called when regions are single- or double-clicked
function annotationStyle(reg) {
    /* get current alpha & color values for colorPicker display */
    if( debug ) console.log(reg.path.fillColor);

	if( region !== null ) {
		if( debug ) console.log("> changing annotation style");

		currentColorRegion = reg;
		var alpha = reg.path.fillColor.alpha;
		$('#alphaSlider').val(alpha*100);
		$('#alphaFill').val(parseInt(alpha*100));

		var hexColor = '#' + pad(( parseInt(reg.path.fillColor.red * 255) ).toString(16),2) + pad(( parseInt(reg.path.fillColor.green * 255) ).toString(16),2) + pad(( parseInt(reg.path.fillColor.blue * 255) ).toString(16),2);
		if( debug ) console.log(hexColor);

		$('#fillColorPicker').val( hexColor );

		if( $('#colorSelector').css('display') == 'none' ) {
			$('#colorSelector').css('display', 'block');
		}
		else {
			$('#colorSelector').css('display', 'none');
		}
	}
}

// NOT USED
function setRegionColor() {
    /* set picked color & alpha */
	var reg = currentColorRegion;
	var hexColor = $('#fillColorPicker').val();
	var red = parseInt( hexColor.substring(1,3), 16 );
	var green = parseInt( hexColor.substring(3,5), 16 );
	var blue = parseInt( hexColor.substring(5,7), 16 );

	reg.path.fillColor.red = red / 255;
	reg.path.fillColor.green = green / 255;
	reg.path.fillColor.blue = blue / 255;
	reg.path.fillColor.alpha = $('#alphaSlider').val() / 100;

	// update region tag
	$(".region-tag#" + reg.uid + ">.region-color").css('background-color','rgba('+red+','+green+','+blue+',0.67)');

	// update stroke color
	switch( $('#selectStrokeColor')[0].selectedIndex ) {
		case 0:
            reg.path.strokeColor = "black";
            break;
		case 1:
            reg.path.strokeColor = "white";
            break;
		case 2:
            reg.path.strokeColor = "red";
            break;
		case 3:
            reg.path.strokeColor = "green";
            break;
		case 4:
            reg.path.strokeColor = "blue";
            break;
		case 5:
            reg.path.strokeColor = "yellow";
            break;
	}
	$('#colorSelector').css('display', 'none');
}

// NOT USED
function onFillColorPicker(value) {
    /* update all values on the fly */
	$('#fillColorPicker').val(value);
	var reg = currentColorRegion;
	var hexColor = $('#fillColorPicker').val();
	var red = parseInt( hexColor.substring(1,3), 16 );
	var green = parseInt( hexColor.substring(3,5), 16);
	var blue = parseInt( hexColor.substring(5,7), 16);
	reg.path.fillColor.red = red / 255;
	reg.path.fillColor.green = green / 255;
	reg.path.fillColor.blue = blue / 255;
	reg.path.fillColor.alpha = $('#alphaSlider').val() / 100;
	paper.view.draw();
}

function onSelectStrokeColor() {
	var reg = currentColorRegion;
	switch( $('#selectStrokeColor')[0].selectedIndex ) {
		case 0:
		reg.path.strokeColor = "black";
		break;
		case 1:
		reg.path.strokeColor = "white";
		break;
		case 2:
		reg.path.strokeColor = "red";
		break;
		case 3:
		reg.path.strokeColor = "green";
		break;
		case 4:
		reg.path.strokeColor = "blue";
		break;
		case 5:
		reg.path.strokeColor = "yellow";
		break;
	}
	paper.view.draw();
}

function onAlphaSlider(value) {
	$('#alphaFill').val(value);
	var reg = currentColorRegion;
	reg.path.fillColor.alpha = $('#alphaSlider').val() / 100;
	paper.view.draw();
}

function onAlphaInput(value) {
	$('#alphaSlider').val(value);
	var reg = currentColorRegion;
	reg.path.fillColor.alpha = $('#alphaSlider').val() / 100;
	paper.view.draw();
}

function onStrokeWidthDec() {
	var reg = currentColorRegion;
	reg.path.strokeWidth = Math.max(region.path.strokeWidth - 1, 1);
	paper.view.draw();
}

function onStrokeWidthInc() {
	var reg = currentColorRegion;
	reg.path.strokeWidth = Math.min(region.path.strokeWidth + 1, 10);
	paper.view.draw();
}

/*** UNDO ***/

/**
* Command to actually perform an undo.
*/
function cmdUndo() {
	if( UndoStack.length > 0 ) {
		var redoInfo = getUndo();
		var undoInfo = UndoStack.pop();
		applyUndo(undoInfo);
		RedoStack.push(redoInfo);
		paper.view.draw();
	}
}

/**
* Command to actually perform a redo.
*/
function cmdRedo() {
	if( RedoStack.length > 0 ) {
		var undoInfo = getUndo();
		var redoInfo = RedoStack.pop();
		applyUndo(redoInfo);
		UndoStack.push(undoInfo);
		paper.view.draw();
	}
}

/**
* Return a complete copy of the current state as an undo object.
*/
function getUndo() {
	var undo = { imageNumber: currentImage, regions: [], drawingPolygonFlag: drawingPolygonFlag };
	var info = ImageInfo[currentImage]["Regions"];

	for( var i = 0; i < info.length; i++ ) {
		var el = {
			json: JSON.parse(info[i].path.exportJSON()),
			name: info[i].name,
			selected: info[i].path.selected,
			fullySelected: info[i].path.fullySelected
		}
		undo.regions.push(el);
	}
	return undo;
}

/**
* Save an undo object. This has the side-effect of initializing the
* redo stack.
*/
function saveUndo(undoInfo) {
	UndoStack.push(undoInfo);
	RedoStack = [];
}

function setImage(imageNumber) {
	if( debug ) console.log("> setImage");
	var index = imageOrder.indexOf(imageNumber);

	// update image slider
	update_slider_value(index);

	loadImage(imageOrder[index]);
}

/**
* Restore the current state from an undo object.
*/
function applyUndo(undo) {
	if( undo.imageNumber !== currentImage )
	setImage(undo.imageNumber);
	var info = ImageInfo[undo.imageNumber]["Regions"];
	while( info.length > 0 )
	removeRegion(info[0], undo.imageNumber);
	region = null;
	for( var i = 0; i < undo.regions.length; i++ ) {
		var el = undo.regions[i];
		var project = paper.projects[ImageInfo[undo.imageNumber]["projectID"]];
		/* Create the path and add it to a specific project.
		*/
		var path = new paper.Path();
		project.addChild(path);
		path.importJSON(el.json);
		reg = newRegion({name:el.name, path:path}, undo.imageNumber);
		// here order matters. if fully selected is set after selected, partially selected paths will be incorrect
		reg.path.fullySelected = el.fullySelected;
		reg.path.selected = el.selected;
		if( el.selected ) {
			if( region === null )
			region = reg;
			else
			console.log("Should not happen: two regions selected?");
		}
	}
	drawingPolygonFlag = undo.drawingPolygonFlag;
}

/**
* If we have actually made a change with a mouse operation, commit
* the undo information.
*/
function commitMouseUndo() {
	if( mouseUndo !== undefined ) {
		saveUndo(mouseUndo);
		mouseUndo = undefined;
	}
}


/***3
Tool selection
*/

function finishDrawingPolygon(closed){
	// finished the drawing of the polygon
	if( closed == true ) {
		region.path.closed = true;
		region.path.fillColor.alpha = config.defaultFillAlpha;
	} else {
		region.path.fillColor.alpha = 0;
	}
	region.path.fullySelected = true;
	//region.path.smooth();
	drawingPolygonFlag = false;
	commitMouseUndo();
}

function backToPreviousTool(prevTool) {
	setTimeout(function() {
		selectedTool = prevTool;
		selectTool()
	},500);
}

function backToSelect() {
	setTimeout(function() {
		selectedTool = "select";
		selectTool()
	},500);
}

/**
* This function deletes the currently selected object.
*/
function cmdDeleteSelected() {

	if($(document.activeElement).is('textarea')) return;

	var undoInfo = getUndo();
	var i;
	for( i in ImageInfo[currentImage]["Regions"] ) {
		if( ImageInfo[currentImage]["Regions"][i].path.selected ) {
			removeRegion(ImageInfo[currentImage]["Regions"][i]);
			saveUndo(undoInfo);
			paper.view.draw();
			break;
		}
	}
}

function cmdPaste() {
	if( copyRegion !== null ) {
		var undoInfo = getUndo();
		saveUndo(undoInfo);
		console.log( "paste " + copyRegion.name );
		if( findRegionByName(copyRegion.name) ) {
			copyRegion.name += " Copy";
		}
		var reg = JSON.parse(JSON.stringify(copyRegion));
		reg.path = new paper.Path();
		reg.path.importJSON(copyRegion.path);
		reg.path.fullySelected = true;
		var color = regionHashColor(reg.name);
		reg.path.fillColor = 'rgba(' + color.red + ',' + color.green + ',' + color.blue + ',0.5)';
		newRegion({name:copyRegion.name,path:reg.path});
	}
	paper.view.draw();
}

function cmdCopy() {
	if( region !== null ) {
		var json = region.path.exportJSON();
		copyRegion = JSON.parse(JSON.stringify(region));
		copyRegion.path = json;
		console.log( "< copy " + copyRegion.name );
	}
}

function toolSelection(event) {
	if( debug ) console.log("> toolSelection");

	//end drawing of polygons and make open form
	if( drawingPolygonFlag == true )
	finishDrawingPolygon(true);

	var prevTool = selectedTool;
	selectedTool = $(this).attr("id");
	selectTool();

	switch(selectedTool) {
		case "select":
		case "addpoint":
		case "delpoint":
		case "addregion":
		case "delregion":
		case "draw":
		case "rotate":
		case "draw-polygon":
            navEnabled = false;
            break;
		case "zoom":
            navEnabled = true;
            handle = null;
            break;
		case "delete":
            cmdDeleteSelected();
            backToPreviousTool(prevTool);
            break;
		case "save":
            microdrawDBSave();
            backToPreviousTool(prevTool);
            break;
		case "zoom-in":
		case "zoom-out":
		case "home":
            backToPreviousTool(prevTool);
            break;
		case "prev":
            loadPreviousImage();
            backToPreviousTool(prevTool);
            break;
		case "next":
            loadNextImage();
            backToPreviousTool(prevTool);
            break;
		case "copy":
            cmdCopy();
            //backToPreviousTool(prevTool);
            backToSelect();
            break;
		case "paste":
            cmdPaste();
            //backToPreviousTool(prevTool);
            backToSelect();
            break;
		case "simplify":
            simplify(region);
            //backToPreviousTool(prevTool);
            backToSelect();
            break;
		case "flip":
            flipRegion(region);
            //backToPreviousTool(prevTool);
            backToSelect();
            break;
		case "closeMenu":
            collapseMenu();
            backToPreviousTool(prevTool);
            break;
		case "openMenu":
            collapseMenu();
            backToPreviousTool(prevTool);
            break;
        case "toggleMenu":
            toggleMenu();
            break;
		case "handle":
            toggleHandles();
            backToPreviousTool(prevTool);
            break;
	}
}

function selectTool() {
	if( debug ) console.log("> selectTool");
	$("img.button").removeClass("selected");
	$("img.button#" + selectedTool).addClass("selected");
	//$("svg").removeClass("selected");
	//$("svg#"+selectedTool).addClass("selected");
}


/***4
Annotation storage
*/

function microdrawDBIP() {
	/*
	Get my IP
	*/
	if( debug ) console.log("> microdrawDBIP promise");
	$("#regionList").html("<br />Connecting to database...");
	return $.get(dbroot,{
		"action":"remote_address"
	}).success(function(data) {
		if( debug ) console.log("< microdrawDBIP resolve: success");
		$("#regionList").html("");
		myIP = data;
	}).error(function(jqXHR, textStatus, errorThrown) {
		console.log("< microdrawDBIP resolve: ERROR, " + textStatus + ", " + errorThrown);
		$("#regionList").html("<br />Error: Unable to connect to database.");
	});
}

/***5
Initialisation
*/

function loadImage(name) {
	if( debug ) console.log("> loadImage(" + name + ")");
	// save previous image for some (later) cleanup
	prevImage = currentImage;

	// set current image to new image
	currentImage = name;

	// open the currentImage
	$.ajax({
		type: 'GET',
		url: ImageInfo[currentImage]["source"],
		async: true,
		success: function(obj){
			viewer.open(obj); // localhost/name.dzi
			var viewport = viewer.viewport;
	    window.setTimeout(function () {
	        viewport.goHome(true);
	    	}, 200 );
			}
	});
}

function loadNextImage() {
	if($(document.activeElement).is('textarea')) return;
	if( debug ) console.log("> loadNextImage");
	var index = imageOrder.indexOf(currentImage);
	var nextIndex = (index + 1) % imageOrder.length;

	// update image slider
	update_slider_value(nextIndex);

	loadImage(imageOrder[nextIndex]);
}

function loadPreviousImage() {
	if($(document.activeElement).is('textarea')) return;
	console.log("> loadPrevImage");
	var index = imageOrder.indexOf(currentImage);
	var previousIndex = ((index - 1 >= 0)? index - 1 : imageOrder.length - 1 );

	// update image slider
	update_slider_value(previousIndex);

	loadImage(imageOrder[previousIndex]);
}


function resizeAnnotationOverlay() {
	// if( debug ) console.log("> resizeAnnotationOverlay");

	var width = $("body").width();
	var height = $("body").height();
	$("canvas.overlay").width(width);
	$("canvas.overlay").height(height);
	paper.view.viewSize = [width,height];
}

function initAnnotationOverlay(data) {
	if( debug ) console.log("> initAnnotationOverlay");

	// do not start loading a new annotation if a previous one is still being loaded
	if(annotationLoadingFlag==true) {
		return;
	}

	// change myOrigin (for loading and saving)
	myOrigin.slice = currentImage;

	// hide previous slice
	if( prevImage && paper.projects[ImageInfo[prevImage]["projectID"]] ) {
		paper.projects[ImageInfo[prevImage]["projectID"]].activeLayer.visible = false;
		$(paper.projects[ImageInfo[prevImage]["projectID"]].view.element).hide();
	}

	// if this is the first time a slice is accessed, create its canvas, its project,
	// and load its regions from the database
	if( ImageInfo[currentImage]["projectID"] == undefined ) {

		// create canvas
		var canvas = $("<canvas class='overlay' id='" + currentImage + "'>");
		$("body").append(canvas);

		// create project
		paper.setup(canvas[0]);
		ImageInfo[currentImage]["projectID"] = paper.project.index;
		// load regions from database
		if( config.useDatabase ) {
			microdrawDBLoad()
			.then(function(){
				$("#regionList").height($(window).height() - $("#regionList").offset().top);

				updateRegionList();
				paper.view.draw();
			});
		}

		if( debug ) console.log('Set up new project, currentImage: ' + currentImage + ', ID: ' + ImageInfo[currentImage]["projectID"]);
	}

	// updateDiagResult();

	// activate the current slice and make it visible
	paper.projects[ImageInfo[currentImage]["projectID"]].activate();
	paper.project.activeLayer.visible = true;
	$(paper.project.view.element).show();

	// resize the view to the correct size
	var width = $("body").width();
	var height = $("body").height();
	paper.view.viewSize = [width, height];
	paper.settings.handleSize = 10;
	updateRegionList();
	paper.view.draw();

	/* RT: commenting this line out solves the image size issues */
	// set size of the current overlay to match the size of the current image
	magicV = viewer.world.getItemAt(0).getContentSize().x / 100;

	transform();
}

function transform() {
	//if( debug ) console.log("> transform");
	var z = viewer.viewport.viewportToImageZoom(viewer.viewport.getZoom(true));
	var sw = viewer.source.width;
	var bounds = viewer.viewport.getBounds(true);
	var x = magicV * bounds.x;
	var y = magicV * bounds.y;
	var w = magicV * bounds.width;
	var h = magicV * bounds.height;
	paper.view.setCenter(x + w / 2, y + h / 2);
	paper.view.zoom=(sw * z) / magicV;
}

function loginChanged() {
	if( debug ) console.log("> loginChanged");

	updateUser();

	// remove all annotations and paper projects from old user
	// TODO maybe save to db??
	paper.projects[ImageInfo[currentImage]["projectID"]].activeLayer.visible = false;
	$(paper.projects[ImageInfo[currentImage]["projectID"]].view.element).hide();
	for( var i = 0; i < imageOrder.length; i++ ){

		ImageInfo[imageOrder[i]]["Regions"] = [];
		if( ImageInfo[imageOrder[i]]["projectID"] != undefined ) {
			paper.projects[ImageInfo[imageOrder[i]]["projectID"]].clear();
			paper.projects[ImageInfo[imageOrder[i]]["projectID"]].remove();
			ImageInfo[imageOrder[i]]["projectID"] = undefined;
		}
		$("<canvas class='overlay' id='" + currentImage + "'>").remove();
	}

	viewer.open(ImageInfo[currentImage]["source"]);
}

function updateUser() {
	if( debug ) console.log("> updateUser");

	if( MyLoginWidget.username )
	myOrigin.user = MyLoginWidget.username;
	else {
		var username = {};
		username.IP = myIP;
		username.hash = hash(navigator.userAgent).toString(16);
		myOrigin.user = username;
	}
}

function makeSVGInline() {
	if( debug ) console.log("> makeSVGInline promise");

	var def = $.Deferred();
	$('img.button').each(function() {
		var $img = $(this);
		var imgID = $img.attr('id');
		var imgClass = $img.attr('class');
		var imgURL = $img.attr('src');

		$.get(imgURL, function(data) {
			// Get the SVG tag, ignore the rest
			var $svg = $(data).find('svg');
			// Add replaced image's ID to the new SVG
			if( typeof imgID !== 'undefined' ) {
				$svg = $svg.attr('id', imgID);
			}
			// Add replaced image's classes to the new SVG
			if( typeof imgClass !== 'undefined' ) {
				$svg = $svg.attr('class', imgClass + ' replaced-svg');
			}
			// Remove any invalid XML tags as per http://validator.w3.org
			$svg = $svg.removeAttr('xmlns:a');
			// Replace image with new SVG
			$img.replaceWith($svg);
			if( debug ) console.log("< makeSVGInline resolve: success");
			def.resolve();
		}, 'xml');
	});

	return def.promise();
}


function updateSliceName() {
	if(debug) console.log("updateslidename:"+currentImage);
	$("#slice-name").val(currentImage);
	var slash_index = params.source.lastIndexOf("/") + 1;
	var filename    = params.source.substr(slash_index);
	$("title").text("Muscle Annotation|" + filename + "|" + currentImage);

	// adding setting for diagnosis results for updateSlice
	var cur_diag = 'n/a';
	if ('diag_res' in ImageInfo[currentImage])
		cur_diag = ImageInfo[currentImage].diag_res;

	$('#div_conclu').children().each(function(){
		if(cur_diag===$(this).val())
		 $(this).prop('checked',true);
		else
			$(this).prop('checked',false);
	});

}

function initShortCutHandler() {
	$(document).keydown(function(e) {
		var key = [];
		if( e.ctrlKey ) key.push("^");
		if( e.altKey ) key.push("alt");
		if( e.shiftKey ) key.push("shift");
		if( e.metaKey ) key.push("cmd");
		key.push(String.fromCharCode(e.keyCode));
		key = key.join(" ");
		if( shortCuts[key] ) {
			var callback = shortCuts[key];
			callback();
			if(!$(document.activeElement).is('textarea'))
				e.preventDefault();
		}
	});
}

function shortCutHandler(key,callback) {
	var key = isMac?key.mac:key.pc;
	var arr = key.split(" ");
	for( var i = 0; i < arr.length; i++ ) {
		if( arr[i].charAt(0) == "#" ) {
			arr[i] = String.fromCharCode(parseInt(arr[i].substring(1)));
		} else
		if( arr[i].length == 1 ) {
			arr[i] = arr[i].toUpperCase();
		}
	}
	key = arr.join(" ");
	shortCuts[key] = callback;
}

function collapseMenu () {
    /* hides or displays menu bar */
	if( $('#menuPanel').css('display') == 'none' ) {
		$('#menuPanel').css('display', 'block');
		$('#menuButton').css('display', 'none');
	}
	else {
		$('#menuPanel').css('display', 'none');
		$('#menuButton').css('display', 'block');
	}
}

function toggleMenu () {
    /* hides or displays menu bar */
	if( $('#menuRegion').css('display') == 'none' ) {
		$('#menuRegion').css('display', 'block');
		$('#menuSlides').css('display', 'none');
	}
	else {
		$('#menuRegion').css('display', 'none');
		$('#menuSlides').css('display', 'block');
	}
}

// SLIDER CONTROLS
function initSlider(min_val, max_val, step, default_value) {
	/* Initializes a slider to easily change between slices */
	if( debug ) console.log("> initSlider promise");
	var slider = $("#slider");

	if( slider.length > 0 ) { // only if slider could be found
		slider.attr("min", min_val);
		slider.attr("max", max_val - 1);
		slider.attr("step", step);
		slider.val(default_value);

		slider.on("change", function() {
			slider_onchange(this.value);
		});

		// Input event can only be used when not using database, otherwise the annotations will be loaded several times
		// TODO fix the issue with the annotations for real
		if (config.useDatabase == false) {
			slider.on("input", function() {
				slider_onchange(this.value);
			});
		}
	}
}

function slider_onchange(newImageIndex) {
	/* Called when the slider value is changed to load a new slice */
	if( debug ) console.log("> slider_onchange promise");
	var imageNumber = imageOrder[newImageIndex];
	loadImage(imageNumber);
}

function update_slider_value(newIndex) {
	/* Used to update the slider value if the slice was changed by another control */
	if( debug ) console.log("> update_slider_value promise");
	var slider = $("#slider");
	if( slider.length > 0 ) { // only if slider could be found
		slider.val(newIndex);
	}
	// to load for change the slide
	// microdrawDBLoad();
}

function find_slice_number(number_str) {
	/* Searches for the given slice-number. 
    If the number could be found its index will be returned. Otherwise -1 */
	var number = parseInt(number_str); // number = NaN if cast to int failed!
	if( !isNaN(number) ) {
		for( i = 0; i < imageOrder.length; i++ )  {
			var slice_number = parseInt(imageOrder[i]);
			// Compare the int values because the string values might be different (e.g. "0001" != "1")
			if( number == slice_number ) {
				return i;
			}
		}
	}
	return -1;
}

function slice_name_onenter(event) {
	/* Eventhandler to open a specific slice by the enter key */
	if( debug ) console.log("> slice_name_onenter promise");
	if( event.keyCode == 13 ) { // enter key
		var slice_number = $(this).val();
		var index = find_slice_number(slice_number);
		if( index > -1 ) { // if slice number exists
			update_slider_value(index);
			loadImage(imageOrder[index]);
		}
	}
	event.preventDefault(); // prevent the default action (scroll / move caret)
}



/*****************************************************************************
    MICRODRAW CORE
 *****************************************************************************/

function microdrawDBSave() {
	if( debug ) console.log("> save promise");
	// key
	var key = "regionPaths";
	var value = {};

	for( var sl in ImageInfo ) {
		if ((config.multiImageSave == false) && (sl != currentImage)) {
			continue;
		}
		// configure value to be saved
		var slice = ImageInfo[sl];
		value.Regions = [];
        // cycle through regions
		for( var i = 0; i < slice.Regions.length; i++ ) {
			var el = {};
            // converted to JSON and then immediately parsed from JSON?
			el.path = JSON.parse(slice.Regions[i].path.exportJSON());
			var contour={};
			contour.Points=[];
            var seg = slice.Regions[i].path.segments;
            console.log(seg);
            // cycle through points on region, converting to image coordinates
			for( var j = 0; j < slice.Regions[i].path.segments.length; j++ ) {
				var point = paper.view.projectToView(slice.Regions[i].path.segments[j].point);
				var x = imagingHelper.physicalToDataX(point.x);
				var y = imagingHelper.physicalToDataY(point.y);
				contour.Points.push({"x": x, "y": y});
			}

			el.contour = contour;
			el.uid = slice.Regions[i].uid;
			el.name = slice.Regions[i].name;
			el.mp3name = ($('#rl-'+el.uid).children().length>0)?('region'+el.uid+'.mp3'):'undefined';
			el.transcript = $('#desp-'+el.uid).val();
			value.Regions.push(el);
		}
		var img_diagnosis = $('input[name=conclusion]:checked').val();
		ImageInfo[sl].diag_res = img_diagnosis; // saving diag_res results for all annotation.
		var formdata = new FormData();
		formdata.append('imageidx', currentImage);
		formdata.append('diagnosis', img_diagnosis);
		formdata.append('info', JSON.stringify(value));
		formdata.append('action','save');

		// check if the slice annotations have changed since loaded by computing a hash
		var h = hash(JSON.stringify(value.Regions)).toString(16);
		if( debug ) console.log("hash:",h,"original hash:",slice.Hash);

		// if the slice hash is undefined, this slice has not yet been loaded. do not save anything for this slice
		if( slice.Hash == undefined || h==slice.Hash ) {
			//if( debug > 1 ) console.log("No change, no save");
			//value.Hash = h;
			//continue;
		}
		value.Hash = h;

        // post 
		(function(sl, h) {
			if(debug) console.log("< start post contours information");
			$.ajax({
				type: 'POST',
				url: '/uploadinfo',
				data: formdata,
				processData: false,
				contentType: false,
				success: function(result) {
					ImageInfo[sl].Hash = h;
					if(debug) console.log("< Save" + result);
					//show dialog box with timeout
					if (result === "success")
						$('#saveDialog').html("Conclusion Saved").fadeIn();
						setTimeout(function() { $("#saveDialog").fadeOut(500);},2000);
					if (result === "error")
						$('#saveDialog').html("Saving Error").fadeIn();
						setTimeout(function() { $("#saveDialog").fadeOut(500);},2000);
				},
				error: function(jqXHR, textStatus, errorThrown) {
					if(debug) console.log("< microdrawDBSave resolve: ERROR: " + textStatus + " " + errorThrown,"slice: "+sl.toString());
					//show dialog box with timeout
					$('#saveDialog').html("Saving Error").fadeIn();
					setTimeout(function() { $("#saveDialog").fadeOut(500);},2000);
				}
			});
		})(sl, h);

		if(debug) console.log("> end of saving contour inforation");
	}
}

function microdrawDBLoad() {
	if( debug ) console.log("> microdrawDBLoad promise");

	var	def = $.Deferred();
	var	key = "regionPaths";
	var slice = myOrigin.slice;

	//=======MODIFY THIS FOR OUR PURPOSE========
	var formdata = new FormData();
	formdata.append('action', 'load');
	formdata.append('imageidx', currentImage);

	$.ajax({
		type: 'POST',
		url: '/uploadinfo',
		data: formdata,
		processData: false,
		contentType: false,
		success: function(data) {
			if( debug ) console.log("> got the regions data from the server");
			var	i, obj, reg;
			annotationLoadingFlag = false;

			// do not display this one and load the current slice.
			if( slice != currentImage ) {
				microdrawDBLoad()
				.then(function() {
					$("#regionList").height($(window).height()-$("#regionList").offset().top);
					updateRegionList();
					paper.view.draw();
				});
				def.fail();
				return;
			}
			if( debug ) console.log('[',data,']');
			// if there is no data on the current slice
			// save hash for the image nonetheless
			if( data.length == 0 ) {
				ImageInfo[currentImage]["Hash"] = hash(JSON.stringify(ImageInfo[currentImage]["Regions"])).toString(16);
				return;
			}

			// parse the data and add to the current canvas
			obj = data; //JSON.parse(data);

			if( JSON.stringify(obj) != JSON.stringify({})) {
				if( debug ) console.log("> got the regions data from the server");
				for( i = 0; i < obj.Regions.length; i++ ) {
					var reg = {};
					var	json;
					reg.name = obj.Regions[i].name;
					reg.description = obj.Regions[i].description;
					reg.uid = obj.Regions[i].uid;
					reg.transcript = obj.Regions[i].transcript;
					reg.foldername = obj.img_name;
					json = obj.Regions[i].path;
					reg.path = new paper.Path();
					reg.path.importJSON(json);
					newRegion({name:reg.name,path:reg.path,uid:reg.uid,foldername:reg.foldername,description:reg.description,transcript:reg.transcript});
				}

				 // if (debug) console.log('From db', obj.diag_res );
				 $('#div_conclu').children().each(function(){
					 if( obj.diag_res===$(this).val())
						$(this).prop('checked',true);
					 else
						 $(this).prop('checked',false);
				 });

				// saving diag_res for current image, for slider back and forth usage. in Load:
				ImageInfo[currentImage].diag_res = obj.diag_res;
				paper.view.draw();
				// if image has no hash, save one
				ImageInfo[currentImage]["Hash"] = (obj.Hash ? obj.Hash : hash(JSON.stringify(ImageInfo[currentImage]["Regions"])).toString(16));
			}
			if( debug ) console.log("> success. Number of regions: ", ImageInfo[currentImage]['Regions'].length);

			def.resolve();
		},
		error: function(jqXHR, textStatus, errorThrown) {
			if(debug) console.log("< microdrawDBLoad resolve ERROR: " + textStatus + " " + errorThrown);
			annotationLoadingFlag = false;
		}
	});

	return def.promise();
}

// LOADING SETTING Start using all following functions
function initMicrodraw() {
	var def = $.Deferred();

	// Subscribe to login changes
	//MyLoginWidget.subscribe(loginChanged);

	// Enable click on toolbar buttons
	$("img.button").click(toolSelection);

	// set annotation loading flag to false
	annotationLoadingFlag = false;

	// Initialize the control key handler and set shortcuts
	initShortCutHandler();
	shortCutHandler({pc:'^ z',mac:'cmd z'},cmdUndo);
	shortCutHandler({pc:'^ y',mac:'cmd y'},cmdRedo);
	if( config.drawingEnabled ) {
		shortCutHandler({pc:'^ x',mac:'cmd x'},function() { console.log("cut!")});
		shortCutHandler({pc:'^ v',mac:'cmd v'},cmdPaste);
		shortCutHandler({pc:'^ a',mac:'cmd a'},function() { console.log("select all!")});
		shortCutHandler({pc:'^ c',mac:'cmd c'},cmdCopy);
		shortCutHandler({pc:'#46',mac:'#8'},cmdDeleteSelected);  // delete key
	}
	shortCutHandler({pc:'#37',mac:'#37'},loadPreviousImage); // left-arrow key
	shortCutHandler({pc:'#39',mac:'#39'},loadNextImage);     // right-arrow key

	// Configure currently selected tool
	selectedTool = "zoom";
	selectTool();

	if( debug )
	console.log("Reading local json file");
	$.ajax({
		type: 'GET',
		url: params.source,
		dataType: "json",
		contentType: "application/json",
		success: function(obj){
			initMicrodraw2(obj);
			def.resolve();
		}
	});

	// Change current slice by typing in the slice number and pessing the enter key
	$("#slice-name").keyup(slice_name_onenter);

	// Show and hide menu
	if( config.hideToolbar ) {
		var mouse_position;
		var animating = false;
		$(document).mousemove(function (e) {
			if( animating ) {
				return;
			}
			mouse_position = e.clientX;

			if( mouse_position <= 100 ) {
				//SLIDE IN MENU
				animating = true;
				$('#menuBar').animate({
					left: 0,
					opacity: 1
				}, 200, function () {
					animating = false;
				});
			} else if( mouse_position > 200 ) {
				animating = true;
				$('#menuBar').animate({
					left: -100,
					opacity: 0
				}, 500, function () {
					animating = false;
				});
			}
		});
	}

	$(window).resize(function() {
		$("#regionList").height($(window).height() - $("#regionList").offset().top);
		resizeAnnotationOverlay();
	});

	return def.promise();
}

function initMicrodraw2(obj) {
	// set up the ImageInfo array and imageOrder array
	if(debug) console.log(obj);
	for( var i = 0; i < obj.tileSources.length; i++ ) {
		// name is either the index of the tileSource or a named specified in the json file
		var name = ((obj.names && obj.names[i]) ? String(obj.names[i]) : String(i));
		imageOrder.push(name);
		ImageInfo[name] = {"source": obj.tileSources[i], "foldername": obj.foldernames[i], "Regions": [], "projectID": undefined};
	}
    console.log(ImageInfo);

	// set default values for new regions (general configuration)
	if (config.defaultStrokeColor == undefined) config.defaultStrokeColor = 'black';
	if (config.defaultStrokeWidth == undefined) config.defaultStrokeWidth = 1;
	if (config.defaultFillAlpha == undefined) config.defaultFillAlpha = 0.5;
	// set default values for new regions (per-brain configuration)
	if (obj.configuration) {
		if (obj.configuration.defaultStrokeColor != undefined) config.defaultStrokeColor = obj.configuration.defaultStrokeColor;
		if (obj.configuration.defaultStrokeWidth != undefined) config.defaultStrokeWidth = obj.configuration.defaultStrokeWidth;
		if (obj.configuration.defaultFillAlpha != undefined) config.defaultFillAlpha = obj.configuration.defaultFillAlpha;
	}

	// init slider that can be used to change between slides

	// initSlider(0, obj.tileSources.length, 1, Math.round(obj.tileSources.length / 2));
	// currentImage = imageOrder[Math.floor(obj.tileSources.length / 2)];
	var start_slice = 0;
	initSlider(0, obj.tileSources.length, 1, start_slice);
	currentImage = imageOrder[start_slice];

	params.tileSources = obj.tileSources;
	viewer = OpenSeadragon({
		id: "openseadragon1",
		prefixUrl: "../static/js/openseadragon/images/",
		tileSources: [],
		showReferenceStrip: false,
		referenceStripSizeRatio: 0.2,
		showNavigator: true,
		sequenceMode: false,
		navigatorId:"myNavigator",
		zoomInButton:"zoom-in",
		zoomOutButton:"zoom-out",
		homeButton:"home",
		preserveViewport: true
	});
  	imagingHelper = viewer.activateImagingHelper({});
    
	// open the currentImage
	//if( debug ) console.log("current url:", ImageInfo[currentImage]["source"]);
	$.ajax({
		type: 'GET',
		url: ImageInfo[currentImage]["source"],
		async: true,
		success: function(obj){
			viewer.open(obj); // localhost/name.dzi
		}
	});

	// add the scalebar
	viewer.scalebar({
		type: OpenSeadragon.ScalebarType.MICROSCOPE,
		minWidth:'150px',
		pixelsPerMeter:obj.pixelsPerMeter,
		color:'black',
		fontColor:'black',
		backgroundColor:"rgba(255,255,255,0.5)",
		barThickness:4,
		location: OpenSeadragon.ScalebarLocation.TOP_RIGHT,
		xOffset:5,
		yOffset:5
	});

	// add handlers: update slice name, animation, page change, mouse actions
	viewer.addHandler('open',function(){
		initAnnotationOverlay();
		updateSliceName();
	});
	viewer.addHandler('animation', function(event){
		transform();
	});
	viewer.addHandler("page", function (data) {
		console.log(data.page,params.tileSources[data.page]);
	});
	viewer.addViewerInputHook({hooks: [
		{tracker: 'viewer', handler: 'clickHandler', hookHandler: clickHandler},
		{tracker: 'viewer', handler: 'pressHandler', hookHandler: pressHandler},
		{tracker: 'viewer', handler: 'dragHandler', hookHandler: dragHandler},
		{tracker: 'viewer', handler: 'dragEndHandler', hookHandler: dragEndHandler}
	]});

	if( debug ) console.log("< initMicrodraw2 resolve: success");
}

function loadConfiguration() {
	var def = $.Deferred();
	// load general microdraw configuration
	$.getJSON("/static/config/configuration.json", function(data) {
		config = data;

		drawingTools = ["select", "draw", "draw-polygon", "simplify", "addpoint",
		"delpoint", "addregion", "delregion", "splitregion", "rotate",
		"save", "copy", "paste", "delete"];
		if( config.drawingEnabled == false ) {
			// remove drawing tools from ui
			for( var i = 0; i < drawingTools.length; i++ ){
				$("#" + drawingTools[i]).remove();
			}
		}
		for( var i = 0; i < config.removeTools.length; i++ ) {
			$("#" + config.removeTools[i]).remove();
		}
		if( config.useDatabase == false ) {
			$("#save").remove();
		}
		def.resolve();
	});

	return def.promise();
}

function deparam() {
	var result={};
	result.source="/slides";
	// if( debug ) console.log("url parametres:",result);
	return result;
}

$(function() {
	$.when(
		loadConfiguration()
	).then(function(){
		if( config.useDatabase ) {
			$.when(
				//microdrawDBIP(),
				//MyLoginWidget.init()
			).then(function(){
				params = deparam();
				// myOrigin.appName = "microdraw";
				if ( debug )console.log("> using database");

				 myOrigin.slice = currentImage;
				// myOrigin.source = params.source;
				//updateUser();
			}).then(initMicrodraw);
		} else {
			params = deparam();
			initMicrodraw();
		}
	});
});
