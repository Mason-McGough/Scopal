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

//(function() {                 // immediately invoked function expression (IIFE)
var config = {}

var ImageInfo = {};
var imageOrder = [];

var view = {
    viewer: undefined,
    magicV: 1000,
    imagingHelper: undefined,
    prevImage: undefined,
    currentImage: undefined,
    currentImageInfo: undefined,
    currentDataset: undefined,
    currentDatasetInfo: undefined,
    currentRegion: null,
    prevRegion: null,
    copyRegion: null,
    currentHandle: undefined,
    selectedTool: undefined,
    navEnabled: true,
    mouseUndo: undefined,
    undoStack: [],
    redoStack: [],
    shortcuts: [],
    isDrawingRegion: false,
    isDrawingPolygon: false,
    isAnnotationLoading: false,
    updateCurrentImage: function(name) {
        this.prevImage = this.currentImage;
        this.currentImage = name;
        this.currentImageInfo = this.currentDatasetInfo.images[this.currentImage];
    },
    cmdUndo: function() {
        if( view.undoStack.length > 0 ) {
            var redoInfo = this.getUndo();
            var undoInfo = this.undoStack.pop();
            this.applyUndo(undoInfo);
            this.redoStack.push(redoInfo);
            paper.view.draw();
        }
    },
    cmdRedo: function() {
        if( view.redoStack.length > 0 ) {
            var undoInfo = this.getUndo();
            var redoInfo = this.redoStack.pop();
            applyUndo(redoInfo);
            this.undoStack.push(undoInfo);
            paper.view.draw();
        }
    },
    getUndo: function() {
        var undo = {imageNumber: this.currentImage, 
                    regions: [], 
                    isDrawingPolygon: this.isDrawingPolygon};
        var info = this.currentImageInfo.regions;

        for(var i = 0; i < info.length; i++) {
            var el = {
                json: JSON.parse(info[i].path.exportJSON()),
                name: info[i].name,
                selected: info[i].path.selected,
                fullySelected: info[i].path.fullySelected
            }
            undo.regions.push(el);
        }
        return undo;
    },
    saveUndo: function(undoInfo) {
        this.undoStack.push(undoInfo);
        this.redoStack = [];
    },
    setImage: function(imageNumber) {
        if( config.debug ) console.log("> setImage");
        var index = imageOrder.indexOf(imageNumber);

        loadImage(imageOrder[index]);
    },
    applyUndo: function(undo) {
    	if( undo.imageNumber !== view.currentImage )
        this.setImage(undo.imageNumber);
        var info = ImageInfo[undo.imageNumber].regions;
        while( info.length > 0 )
        removeRegion(info[0]);
        this.currentRegion = null;
        for( var i = 0; i < undo.regions.length; i++ ) {
            var el = undo.regions[i];
            var project = paper.projects[ImageInfo[undo.imageNumber].projectID];
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
                if( this.currentRegion === null ) {
                    this.currentRegion = reg;
                } else {
                    console.log("Should not happen: two regions selected?");
                }
            }
        }
        this.isDrawingPolygon = undo.isDrawingPolygon;
    },
    commitMouseUndo: function() {
        if( this.mouseUndo !== undefined ) {
            this.saveUndo(this.mouseUndo);
            this.mouseUndo = undefined;
        }
    }
};


/***1
Region handling functions
*/
function newRegion(arg, imageNumber) {
    /* called whenever a new region is created */
	// if( config.debug ) console.log("> newRegion");
    
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
		imageNumber = view.currentImage;
	}
	if( imageNumber === view.currentImage ) {
		// append region tag to regionList
		$("#regionList").append($(regionTag(reg.name, reg.uid)));
	}
    
    // set audio file
    reg.audio = 'static/audio/'+view.currentDatasetInfo.folder+'/'+view.currentImageInfo.name+'/'+'region'+reg.uid+'.mp3';
    $("#menuAudioPlayer").attr("src", reg.audio);

	// Select region name in list
	$("#regionList > .region-tag").each(function(i){
		$(this).addClass("deselected");
		$(this).removeClass("selected");
	});

	var tag = $("#regionList > .region-tag#" + reg.uid);
	$(tag).removeClass("deselected");
	$(tag).addClass("selected");

	// push the new region to the Regions array
	view.currentImageInfo.regions.push(reg);
	return reg;
}

function removeRegion(reg) {
	if( config.debug ) console.log("> removeRegion");

	// remove from Regions array
//	ImageInfo[imageNumber]["Regions"].splice(ImageInfo[imageNumber]["Regions"].indexOf(reg),1);
	view.currentImageInfo.regions.splice(view.currentImageInfo.regions.indexOf(reg),1);
	// remove from paths
	reg.path.remove();
    var	tag = $("#regionList > .region-tag#" + reg.uid);
    $(tag).remove();
    resetAudio();
}

function selectRegion(reg) {
	if( config.debug ) console.log("> selectRegion");

	var i;

	// Select path
	for( i = 0; i < view.currentImageInfo.regions.length; i++ ) {
		var region_id = view.currentImageInfo.regions[i].uid;
		if( view.currentImageInfo.regions[i] == reg ) {
			reg.path.selected = true;
			reg.path.fullySelected = true;
			view.currentRegion = reg;
			$("#desp-"+region_id).show();
		} else {
			view.currentImageInfo.regions[i].path.selected = false;
			view.currentImageInfo.regions[i].path.fullySelected = false;
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
    
    // change audio source
    setAudio(reg);

	if(config.debug) console.log("< selectRegion");
}

function findRegionByUID(uid) {
	// if( config.debug ) console.log("> findRegionByUID");

	if( config.debug > 2 ) console.log( "look for uid: " + uid);
	// if( config.debug > 2 ) console.log( ImageInfo );
	if( config.debug > 2 ) console.log( "region array length: " + view.currentImage.regions.length );

	for(var i = 0; i < view.currentImageInfo.regions.length; i++) {

		if( view.currentImageInfo.regions[i].uid == uid ) {
			if(config.debug > 2) console.log("region " + view.currentImageInfo.regions[i].uid + ": " );
			if(config.debug > 2) console.log(view.currentImageInfo.regions[i]);
			return view.currentImageInfo.regions[i];
		}
	}
	console.log("Region with unique ID "+uid+" not found");
	return null;
}

function findRegionByName(name) {
	if(config.debug) console.log("> findRegionByName");

	for(var i = 0; i < view.currentImageInfo.regions.length; i++ ) {
		if( view.currentImageInfo.regions[i].name == name ) {
			return view.currentImageInfo.regions[i];
		}
	}
	console.log("Region with name " + name + " not found");
	return null;
}

function regionUniqueID() {
	// if( config.debug ) console.log("> regionUniqueID");

	var found = false;
	var counter = 1;
	while( found == false ) {
		found = true;
		for( var i = 0; i < view.currentImageInfo.regions.length; i++ ) {
			if( view.currentImageInfo.regions[i].uid == counter ) {
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
	//if(config.debug) console.log("> regionHashColor");

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
	//if( config.debug ) console.log("> regionTag");

	var str;
	var color;
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
        
        str = "<div class='region-tag' id='"+uid+"' style='padding:3px 3px 0px 3px'> \
		<img class='eye' title='Region visible' id='eye_"+uid+"' \
        src='../static/img/eyeOpened.svg' /> \
		<div class='region-color' \
		style='background-color:rgba("+
            parseInt(color.red*mult)+","+parseInt(color.green*mult)+","+parseInt(color.blue*mult)+",0.67)'></div> \
		<span class='region-name'>"+name+"</span> \
		<div><textarea id='desp-"+uid+"' rows='5' wrap='soft' style='display:none'> \
        </textarea></div></div>"
    } else {
        color = regionHashColor(name);
        str = "<div class='region-tag' style='padding:2px'> \
        <div class='region-color' \
        style='background-color:rgba("+color.red+","+color.green+","+color.blue+",0.67 \
        )'></div> \
        <span class='region-name'>"+name+"</span> \
        </div>"
    }
    return str;
}

//function regionPicker(parent) {
//	if( config.debug ) console.log("> regionPicker");
//
//	$("div#regionPicker").appendTo("body");
//	$("div#regionPicker").show();
//}

function changeRegionName(reg, name) {
	if( config.debug ) console.log("> changeRegionName");

	var i;
	var color = regionHashColor(name);

	// Update path
	reg.name = name;
	reg.path.fillColor = 'rgba('+color.red+','+color.green+','+color.blue+',0.5)';
	paper.view.draw();

	// Update region tag
	$(".region-tag#" + reg.uid + ">.region-name").text(name);
	$(".region-tag#" + reg.uid + ">.region-color").css('background-color','rgba('+color.red+','+color.green+','+color.blue+',0.67)');
    setAudio(reg);
}

/*** toggle visibility of region
***/
function toggleRegion(reg) {
	if( view.currentRegion !== null ) {
		if( config.debug ) console.log("> toggle region");

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
	if( config.debug ) console.log("> updateRegionList");

	// remove all entries in the regionList
	$("#regionList > .region-tag").each(function() {
		$(this).remove();
	});

	//var def = $.Deferred();
	// adding entries corresponding to the currentImage
	for( var i = 0; i < view.currentImageInfo.regions.length; i++ ) {

		var reg = view.currentImageInfo.regions[i];
		if( config.debug ) console.log("> restoring region..",reg.uid);
		$("#regionList").append($(regionTag(reg.name,reg.uid)));

		// add the transcript
		if(reg.transcript!=undefined || reg.transcript!="undefined")
		{
			$("#desp-"+reg.uid).val(reg.transcript);
		}
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
        selectRegion(reg);
		return;
	}
	else {
		removeRegion(view.currentRegion);
	}
}


/*****************************************************************************
    EVENT HANDLERS
 *****************************************************************************/
var tap = false

function clickHandler(event){
	if( config.debug ) console.log("> clickHandler");

	event.stopHandlers = !view.navEnabled;
	if( view.selectedTool == "draw" ) {
		checkRegionSize(view.currentRegion);
	}
}

function pressHandler(event){
	if( config.debug ) console.log("> pressHandler");

	if( !view.navEnabled ) {
		event.stopHandlers = true;
		mouseDown(event.originalEvent.layerX,event.originalEvent.layerY);
	}
}

function dragHandler(event){
	if( config.debug > 1 )	console.log("> dragHandler");

	if( !view.navEnabled ) {
		event.stopHandlers = true;
		mouseDrag(event.originalEvent.layerX,event.originalEvent.layerY,event.delta.x,event.delta.y);
	}
}

function dragEndHandler(event){
	if( config.debug ) console.log("> dragEndHandler");

	if( !view.navEnabled ) {
		event.stopHandlers = true;
		mouseUp();
	}
}

function singlePressOnRegion(event) {
	if( config.debug ) console.log("> singlePressOnRegion");
    
	event.preventDefault();

    if (event.target !== event.currentTarget) {
        var el = $(this);
        var regionId;
        var reg;

        if ($(event.target).hasClass("region-tag")) {
            regionId = event.target.id;
        } else {
            regionId = event.target.parentNode.id;
        }
        
        if ($(event.target).hasClass("eye")) {
            var reg = findRegionByUID(regionId);
            toggleRegion(reg);
        } else if( event.clientX > 20 ) {
            if( event.clientX > 50 ) {
                // Click on regionList (list or annotated regions)
                reg = findRegionByUID(regionId);
                if( reg ) {
                    selectRegion(reg);
                } else {
                console.log("region undefined");
                }
            }
            else {
                reg = findRegionByUID(regionId);
                if( reg.path.fillColor != null ) {
                    if( reg ) {
                        selectRegion(reg);
                    }
                    annotationStyle(reg);
                }
            }
        }
//        else {
//            var reg = findRegionByUID(this.id);
//            toggleRegion(reg);
//        }
    }
	event.stopPropagation();
}

function doublePressOnRegion(event) {
	if( config.debug ) console.log("> doublePressOnRegion");

	event.preventDefault();

    var regionId;
    if ($(event.target).hasClass("region-tag")) {
        regionId = event.target.id;
    } else {
        regionId = event.target.parentNode.id;
    }
    
    if (event.target !== event.currentTarget) {
        if( event.clientX > 20 ) {
            if( event.clientX > 50 ) {
                if( config.isDrawingEnabled ) {
                    var name = prompt("Region name", findRegionByUID(regionId).name);
                    if( name != null ) {
                        changeRegionName(findRegionByUID(regionId), name);
                    }
                }
            }
            else {
                var reg = findRegionByUID(regionId);
                if( reg.path.fillColor != null ) {
                    if( reg ) {
                        selectRegion(reg);
                    }
                    annotationStyle(reg);
                }
            }
        }
        else {
            var reg = findRegionByUID(regionId);
            toggleRegion(reg);
        }
    }
	event.stopPropagation();
}

function handleRegionTap(event) {
	/* Handles single and double tap in touch devices */
	if( config.debug ) console.log("> handleRegionTap");

	if( !tap ){ //if tap is not set, set up single tap
		tap = setTimeout(function() {
			tap = null;
		}, 300);

		// call singlePressOnRegion(event) using 'this' as context
		singlePressOnRegion.call(this, event);
	} else {
		clearTimeout(tap);
		tap = null;

		// call doublePressOnRegion(event) using 'this' as context
		doublePressOnRegion.call(this, event);
	}
	if( config.debug ) console.log("< handleRegionTap");
}

function mouseDown(x,y) {
	if( config.debug > 1 ) console.log("> mouseDown");

	view.mouseUndo = view.getUndo();
	var point = paper.view.viewToProject(new paper.Point(x,y));

	view.currentHandle = null;

	switch( view.selectedTool ) {
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

			view.isDrawingRegion = false;
			if( hitResult ) {
				var i;
				for( i = 0; i < view.currentImageInfo.regions.length; i++ ) {
					if( view.currentImageInfo.regions[i].path == hitResult.item ) {
						re = view.currentImageInfo.regions[i];
						break;
					}
				}

				// select path
				if( view.currentRegion && view.currentRegion != re ) {
					view.currentRegion.path.selected = false;
					view.prevRegion = view.currentRegion;
				}
				selectRegion(re);

				if( hitResult.type == 'handle-in' ) {
					view.currentHandle = hitResult.segment.handleIn;
					view.currentHandle.point = point;
				}
				else if( hitResult.type == 'handle-out' ) {
					view.currentHandle = hitResult.segment.handleOut;
					view.currentHandle.point = point;
				}
				else if( hitResult.type == 'segment' ) {
					if( view.selectedTool == "select" ) {
						view.currentHandle = hitResult.segment.point;
						view.currentHandle.point = point;
					}
					if( view.selectedTool == "delpoint" ) {
						hitResult.segment.remove();
						view.commitMouseUndo();
					}
				}
				else if( hitResult.type == 'stroke' && view.selectedTool == "addpoint" ) {
					view.currentRegion.path
					.curves[hitResult.location.index]
					.divide(hitResult.location);
					view.currentRegion.path.fullySelected = true;
					view.commitMouseUndo();
					paper.view.draw();
				}
				else if( view.selectedTool == "addregion" ) {
					if( view.prevRegion ) {
						var newPath = view.currentRegion.path.unite(view.prevRegion.path);
						removeRegion(view.prevRegion);
						view.currentRegion.path.remove();
						view.currentRegion.path = newPath;
						updateRegionList();
						selectRegion(view.currentRegion);
						paper.view.draw();
						view.commitMouseUndo();
						backToSelect();
					}
				}
				else if( view.selectedTool == "delregion" ) {
					if( view.prevRegion ) {
						var newPath = view.prevRegion.path.subtract(view.currentRegion.path);
						removeRegion(view.prevRegion);
						view.prevRegion.path.remove();
						newRegion({path:newPath});
						updateRegionList();
						selectRegion(view.currentRegion);
						paper.view.draw();
						view.commitMouseUndo();
						backToSelect();
					}
				}
				else if( view.selectedTool == "splitregion" ) {
					/*selected region is prevRegion!
					region is the region that should be split based on prevRegion
					newRegionPath is outlining that part of region which has not been overlaid by prevRegion
					i.e. newRegion is what was region
					and prevRegion color should go to the other part*/
					if( view.prevRegion ) {
						var prevColor = view.prevRegion.path.fillColor;
						//color of the overlaid part
						var color = view.currentRegion.path.fillColor;
						var newPath = view.currentRegion.path.divide(view.prevRegion.path);

						removeRegion(view.prevRegion);
						view.currentRegion.path.remove();

						view.currentRegion.path = newPath;
						var newReg;
						for( i = 0; i < newPath._children.length; i++ )
						{
							if( i == 0 ) {
								view.currentRegion.path = newPath._children[i];
							}
							else {
								newReg = newRegion({path:newPath._children[i]});
							}
						}
						view.currentRegion.path.fillColor = color;
						if( newReg ) {
							newReg.path.fillColor = prevColor;
						}
						updateRegionList();
						selectRegion(view.currentRegion);
						paper.view.draw();

						view.commitMouseUndo();
						backToSelect();
					}
				}
				break;
			}
			if( hitResult == null && view.currentRegion ) {
				//deselect paths
				view.currentRegion.path.selected = false;
				view.currentRegion = null;
			}
			break;
		}
		case "draw": {
			// Start a new region
			// if there was an older region selected, unselect it
			if( view.currentRegion ) {
				view.currentRegion.path.selected = false;
			}
			// start a new region
			var path = new paper.Path({segments:[point]})
			path.strokeWidth = config.defaultStrokeWidth;
			view.currentRegion = newRegion({path:path});
			// signal that a new region has been created for drawing
			view.isDrawingRegion = true;

			view.commitMouseUndo();
			break;
		}
		case "draw-polygon": {
			// is already drawing a polygon or not?
			if( view.isDrawingPolygon == false ) {
				// deselect previously selected region
				if( view.currentRegion )
				view.currentRegion.path.selected = false;

				// Start a new Region with alpha 0
				var path = new paper.Path({segments:[point]})
				path.strokeWidth = config.defaultStrokeWidth;
				view.currentRegion = newRegion({path:path});
				view.currentRegion.path.fillColor.alpha = 0;
				view.currentRegion.path.selected = true;
				view.isDrawingPolygon = true;
				view.commitMouseUndo();
			} else {
				var hitResult = paper.project.hitTest(point, {tolerance:10, segments:true});
				if( hitResult && hitResult.item == view.currentRegion.path && hitResult.segment.point == view.currentRegion.path.segments[0].point ) {
					// clicked on first point of current path
					// --> close path and remove drawing flag
					finishDrawingPolygon(true);
				} else {
					// add point to region
					view.currentRegion.path.add(point);
					view.commitMouseUndo();
				}
			}
			break;
		}
		case "rotate":
		view.currentRegion.origin = point;
		break;
	}
	paper.view.draw();
}

function mouseDrag(x,y,dx,dy) {
	//if( config.debug ) console.log("> mouseDrag");

	// transform screen coordinate into world coordinate
	var point = paper.view.viewToProject(new paper.Point(x,y));

	// transform screen delta into world delta
	var orig = paper.view.viewToProject(new paper.Point(0,0));
	var dpoint = paper.view.viewToProject(new paper.Point(dx,dy));
	dpoint.x -= orig.x;
	dpoint.y -= orig.y;

	if( view.currentHandle ) {
		view.currentHandle.x += point.x-view.currentHandle.point.x;
		view.currentHandle.y += point.y-view.currentHandle.point.y;
		view.currentHandle.point = point;
		view.commitMouseUndo();
	} else
	if( view.selectedTool == "draw" ) {
		view.currentRegion.path.add(point);
	} else
	if( view.selectedTool == "select" ) {
		// event.stopHandlers = true;
		for( var i in view.currentImageInfo.regions ) {
			var reg = view.currentImageInfo.regions[i];
			if( reg.path.selected ) {
				reg.path.position.x += dpoint.x;
				reg.path.position.y += dpoint.y;
				view.commitMouseUndo();
			}
		}
	}
	if( view.selectedTool == "rotate" ) {
		event.stopHandlers = true;
		var degree = parseInt(dpoint.x);
		for( var i in view.currentImageInfo.regions ) {
			if( view.currentImageInfo.regions[i].path.selected ) {
				view.currentImageInfo.Regions[i].path.rotate(degree, view.currentRegion.origin);
				view.commitMouseUndo();
			}
		}
	}
	paper.view.draw();
}

function mouseUp() {
	if( config.debug ) console.log("> mouseUp");

	if( view.isDrawingRegion == true ) {
		view.currentRegion.path.closed = true;
		view.currentRegion.path.fullySelected = true;
		// to delete all unnecessary segments while preserving the form of the region to make it modifiable; & adding handles to the segments
		var orig_segments = view.currentRegion.path.segments.length;
		view.currentRegion.path.simplify(0.02);
		var final_segments = view.currentRegion.path.segments.length;
		if( config.debug > 2 ) console.log( parseInt(final_segments/orig_segments*100) + "% segments conserved" );
	}
	paper.view.draw();
}

function simplify() {
    /* calls simplify method of region path to resample the contour */
	if( view.currentRegion !== null ) {
		if( config.debug ) console.log("> simplifying region path");

		var orig_segments = view.currentRegion.path.segments.length;
		view.currentRegion.path.simplify();
		var final_segments = view.currentRegion.path.segments.length;
		console.log( parseInt(final_segments/orig_segments*100) + "% segments conserved" );
		paper.view.draw();
	}
}

function flipRegion(reg) {
    /* flip region along y-axis around its center point */
    if( view.currentRegion !== null ) {
		if( config.debug ) console.log("> flipping region");

		for( var i in view.currentImageInfo.regions ) {
			if( view.currentImageInfo.regions[i].path.selected ) {
				view.currentImageInfo.regions[i].path.scale(-1, 1);
			}
		}
		paper.view.draw();
	}
}

function toggleHandles() {
	if(config.debug) console.log("> toggleHandles");
	if (view.currentRegion != null) {
		if (view.currentRegion.path.hasHandles()) {
			if (confirm('Do you really want to remove the handles?')) {
				var undoInfo = view.getUndo();
				view.currentRegion.path.clearHandles();
				view.saveUndo(undoInfo);
			}
		}
		else {
			var undoInfo = view.getUndo();
			view.currentRegion.path.smooth();
			view.saveUndo(undoInfo);
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
    if( config.debug ) console.log(reg.path.fillColor);

	if( view.currentRegion !== null ) {
		if( config.debug ) console.log("> changing annotation style");

		currentColorRegion = reg;
		var alpha = reg.path.fillColor.alpha;
		$('#alphaSlider').val(alpha*100);
		$('#alphaFill').val(parseInt(alpha*100));

		var hexColor = '#' + pad(( parseInt(reg.path.fillColor.red * 255) ).toString(16),2) + pad(( parseInt(reg.path.fillColor.green * 255) ).toString(16),2) + pad(( parseInt(reg.path.fillColor.blue * 255) ).toString(16),2);
		if( config.debug ) console.log(hexColor);

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
	reg.path.strokeWidth = Math.max(view.currentRegion.path.strokeWidth - 1, 1);
	paper.view.draw();
}

function onStrokeWidthInc() {
	var reg = currentColorRegion;
	reg.path.strokeWidth = Math.min(view.currentRegion.path.strokeWidth + 1, 10);
	paper.view.draw();
}


/***3
Tool selection
*/

function finishDrawingPolygon(closed){
	// finished the drawing of the polygon
	if( closed == true ) {
		view.currentRegion.path.closed = true;
		view.currentRegion.path.fillColor.alpha = config.defaultFillAlpha;
	} else {
		view.currentRegion.path.fillColor.alpha = 0;
	}
	view.currentRegion.path.fullySelected = true;
	//view.currentRegion.path.smooth();
	view.isDrawingPolygon = false;
	view.commitMouseUndo();
}

function backToPreviousTool(prevTool) {
	setTimeout(function() {
		view.selectedTool = prevTool;
		selectTool()
	},500);
}

function backToSelect() {
	setTimeout(function() {
		view.selectedTool = "select";
		selectTool()
	},500);
}

/**
* This function deletes the currently selected object.
*/
function cmdDeleteSelected() {

	if($(document.activeElement).is('textarea')) return;

	var undoInfo = view.getUndo();
//	var i;
//	for( i in ImageInfo[view.currentImage]["Regions"] ) {
//		if( ImageInfo[view.currentImage]["Regions"][i].path.selected ) {
//			removeRegion(ImageInfo[view.currentImage]["Regions"][i]);
//			view.saveUndo(undoInfo);
//			paper.view.draw();
//			break;
//		}
//	}
    removeRegion(view.currentRegion);
    view.saveUndo(undoInfo)
}

function cmdPaste() {
	if( view.copyRegion !== null ) {
		var undoInfo = view.getUndo();
		view.saveUndo(undoInfo);
		console.log( "paste " + view.copyRegion.name );
		if( findRegionByName(view.copyRegion.name) ) {
			view.copyRegion.name += " Copy";
		}
		var reg = JSON.parse(JSON.stringify(view.copyRegion));
		reg.path = new paper.Path();
		reg.path.importJSON(view.copyRegion.path);
		reg.path.fullySelected = true;
		var color = regionHashColor(reg.name);
		reg.path.fillColor = 'rgba(' + color.red + ',' + color.green + ',' + color.blue + ',0.5)';
		newRegion({name:view.copyRegion.name,path:reg.path});
	}
	paper.view.draw();
}

function cmdCopy() {
	if( view.currentRegion !== null ) {
		var json = view.currentRegion.path.exportJSON();
		view.copyRegion = JSON.parse(JSON.stringify(view.currentRegion));
		view.copyRegion.path = json;
		console.log( "< copy " + view.copyRegion.name );
	}
}

function toolSelection(event) {
	if( config.debug ) console.log("> toolSelection");

	//end drawing of polygons and make open form
	if( view.isDrawingPolygon == true )
	finishDrawingPolygon(true);

	var prevTool = view.selectedTool;
	view.selectedTool = $(this).attr("id");
	selectTool();

	switch(view.selectedTool) {
		case "select":
		case "addpoint":
		case "delpoint":
		case "addregion":
		case "delregion":
		case "draw":
		case "rotate":
		case "draw-polygon":
            view.navEnabled = false;
            break;
		case "zoom":
            view.navEnabled = true;
            view.currentHandle = null;
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
            simplify(view.currentRegion);
            //backToPreviousTool(prevTool);
            backToSelect();
            break;
		case "flip":
            flipRegion(view.currentRegion);
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
            backToPreviousTool(prevTool);
            break;
		case "handle":
            toggleHandles();
            backToPreviousTool(prevTool);
            break;
        case "segment":
            segmentation();
            backToPreviousTool(prevTool);
            break;
	}
}

function selectTool() {
	if( config.debug ) console.log("> selectTool");
	$("img.button").removeClass("selected");
	$("img.button#" + view.selectedTool).addClass("selected");
	//$("svg").removeClass("selected");
	//$("svg#"+view.selectedTool).addClass("selected");
}


/***4
Annotation storage
*/

//function microdrawDBIP() {
//	/*
//	Get my IP
//	*/
//	if( config.debug ) console.log("> microdrawDBIP promise");
//	$("#regionList").html("<br />Connecting to database...");
//	return $.get(dbroot,{
//		"action":"remote_address"
//	}).success(function(data) {
//		if( config.debug ) console.log("< microdrawDBIP resolve: success");
//		$("#regionList").html("");
//		myIP = data;
//	}).error(function(jqXHR, textStatus, errorThrown) {
//		console.log("< microdrawDBIP resolve: ERROR, " + textStatus + ", " + errorThrown);
//		$("#regionList").html("<br />Error: Unable to connect to database.");
//	});
//}

/***5
Initialisation
*/
function buildImageUrl() {
    return config.urlSlides+'/'+view.currentDatasetInfo.folder+'/'+view.currentImage;
}

function loadImage(name) {
	if( config.debug ) console.log("> loadImage(" + name + ")");
    if (!view.currentDatasetInfo.images[name]) {
        console.log("ERROR: Image not found.");
        return;
    }
    
    clearRegions();
	view.updateCurrentImage(name);
    if (name !== undefined) {
        $.ajax({
            type: 'GET',
            url: buildImageUrl(),
            async: true,
            success: function(obj){
                view.viewer.open(obj); // localhost/name.dzi
                var viewport = view.viewer.viewport;
                window.setTimeout(function () {
                   viewport.goHome(true);
                }, 200 );
                
                view.viewer.scalebar({
                    pixelsPerMeter: view.currentImageInfo.pixelsPerMeter
                });
            }
        }).done(function() {
            if(config.debug) console.log("> "+name+" loaded");
            highlightCurrentSlide();
        }).fail(function() {
            if(config.debug) console.log("> "+name+" failed to load");
        });
    } else {
        if(config.debug) console.log("> "+name+" could not be found");
        var viewport = view.viewer.viewport;
        window.setTimeout(function () {
           viewport.goHome(true);
        }, 200 );
    }
}

function loadNextImage() {
	if($(document.activeElement).is('textarea')) return;
	if( config.debug ) console.log("> loadNextImage");
	var index = imageOrder.indexOf(view.currentImage);
	var nextIndex = (index + 1) % imageOrder.length;

	loadImage(imageOrder[nextIndex]);
}

function loadPreviousImage() {
	if($(document.activeElement).is('textarea')) return;
	if(config.debug) console.log("> loadPrevImage");
	var index = imageOrder.indexOf(view.currentImage);
	var previousIndex = ((index - 1 >= 0)? index - 1 : imageOrder.length - 1 );

	loadImage(imageOrder[previousIndex]);
}


function resizeAnnotationOverlay() {
	// if( config.debug ) console.log("> resizeAnnotationOverlay");

	var width = $("body").width();
	var height = $("body").height();
	$("canvas.overlay").width(width);
	$("canvas.overlay").height(height);
	paper.view.viewSize = [width,height];
}

function initAnnotationOverlay(data) {
	if( config.debug ) console.log("> initAnnotationOverlay");

	// do not start loading a new annotation if a previous one is still being loaded
	if (view.isAnnotationLoading == true) {
		return;
	}

	// if this is the first time a slice is accessed, create its canvas, its project,
	// and load its regions from the database
	if( view.currentImageInfo.projectID == undefined ) {

		// create canvas
		var canvas = $("<canvas class='overlay' id='" + view.currentImage + "'>");
		$("body").append(canvas);

		// create project
		paper.setup(canvas[0]);
		view.currentImageInfo.projectID = paper.project.index;
		// load regions from database
		if( config.isSavingEnabled ) {
			microdrawDBLoad()
			.then(function(){
				$("#regionList").height($(window).height() - $("#regionList").offset().top);
				updateRegionList();
				paper.view.draw();
			});
		}

		if( config.debug ) console.log('Set up new project, currentImage: ' + view.currentImage + ', ID: ' + view.currentImageInfo.projectID);
	}

	// updateDiagResult();

	// activate the current slice and make it visible
	paper.projects[view.currentImageInfo.projectID].activate();
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
	view.magicV = view.viewer.world.getItemAt(0).getContentSize().x / 100;

	transform();
}

function clearRegions() {
    if ( view.currentImageInfo &&
         paper.projects[view.currentImageInfo.projectID] ) {
        paper.projects[view.currentImageInfo.projectID].activeLayer.visible = false;
        $(paper.projects[view.currentImageInfo.projectID].view.element).hide();
	}
}

function transform() {
	//if( config.debug ) console.log("> transform");
	var z = view.viewer.viewport.viewportToImageZoom(view.viewer.viewport.getZoom(true));
	var sw = view.viewer.source.width;
	var bounds = view.viewer.viewport.getBounds(true);
	var x = view.magicV * bounds.x;
	var y = view.magicV * bounds.y;
	var w = view.magicV * bounds.width;
	var h = view.magicV * bounds.height;
	paper.view.setCenter(x + w / 2, y + h / 2);
	paper.view.zoom=(sw * z) / view.magicV;
}

//function loginChanged() {
//	if( config.debug ) console.log("> loginChanged");
//
//	updateUser();
//
//	// remove all annotations and paper projects from old user
//	// TODO maybe save to db??
//	paper.projects[ImageInfo[view.currentImage]["projectID"]].activeLayer.visible = false;
//	$(paper.projects[ImageInfo[view.currentImage]["projectID"]].view.element).hide();
//	for( var i = 0; i < imageOrder.length; i++ ){
//
//		ImageInfo[imageOrder[i]]["Regions"] = [];
//		if( ImageInfo[imageOrder[i]]["projectID"] != undefined ) {
//			paper.projects[ImageInfo[imageOrder[i]]["projectID"]].clear();
//			paper.projects[ImageInfo[imageOrder[i]]["projectID"]].remove();
//			ImageInfo[imageOrder[i]]["projectID"] = undefined;
//		}
//		$("<canvas class='overlay' id='" + view.currentImage + "'>").remove();
//	}
//
//	view.viewer.open(ImageInfo[view.currentImage]["source"]);
//}
//
//function updateUser() {
//	if( config.debug ) console.log("> updateUser");
//
//	if( MyLoginWidget.username )
//	myOrigin.user = MyLoginWidget.username;
//	else {
//		var username = {};
//		username.IP = myIP;
//		username.hash = hash(navigator.userAgent).toString(16);
//		myOrigin.user = username;
//	}
//}

function makeSVGInline() {
	if( config.debug ) console.log("> makeSVGInline promise");

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
			if( config.debug ) console.log("< makeSVGInline resolve: success");
			def.resolve();
		}, 'xml');
	});

	return def.promise();
}


function updateSliceName() {
	if(config.debug) console.log("updateslidename:"+view.currentImage);
	$("#slice-name").html(view.currentImage);
	$("title").text("Muscle Annotation | " + view.currentImage);

	// adding setting for diagnosis results for updateSlice
	var cur_diag = 'n/a';
	if ('diag_res' in view.currentImageInfo)
		cur_diag = view.currentImageInfo.diag_res;

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
		if( view.shortcuts[key] ) {
			var callback = view.shortcuts[key];
			callback();
			if(!$(document.activeElement).is('textarea'))
				e.preventDefault();
		}
	});
}

function shortCutHandler(key,callback) {
	var key = config.isMac ? key.mac : key.pc;
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
	view.shortcuts[key] = callback;
}

function collapseMenu () {
    /* hides or displays menu bar */
	if( config.debug ) console.log("> collapseMenu");
    
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
	if( config.debug ) console.log("> toggleMenu");
    
	if( $('#menuRegion').css('display') == 'none' ) {
		$('#menuRegion').css('display', 'block');
		$('#menuFilmstrip').css('display', 'none');
	}
	else {
		$('#menuRegion').css('display', 'none');
		$('#menuFilmstrip').css('display', 'block');
	}
}

//function find_slice_number(number_str) {
//	/* Searches for the given slice-number. 
//    If the number could be found its index will be returned. Otherwise -1 */
//	var number = parseInt(number_str); // number = NaN if cast to int failed!
//	if( !isNaN(number) ) {
//		for( i = 0; i < imageOrder.length; i++ )  {
//			var slice_number = parseInt(imageOrder[i]);
//			// Compare the int values because the string values might be different (e.g. "0001" != "1")
//			if( number == slice_number ) {
//				return i;
//			}
//		}
//	}
//	return -1;
//}
//
//function slice_name_onenter(event) {
//	/* Eventhandler to open a specific slice by the enter key */
//	if( config.debug ) console.log("> slice_name_onenter promise");
//	if( event.keyCode == 13 ) { // enter key
//		var slice_number = $(this).val();
//		var index = find_slice_number(slice_number);
//		if( index > -1 ) { // if slice number exists
//			loadImage(imageOrder[index]);
//		}
//	}
//	event.preventDefault(); // prevent the default action (scroll / move caret)
//}



/*****************************************************************************
    MICRODRAW CORE
 *****************************************************************************/

function microdrawDBSave() {
	if( config.debug ) console.log("> save promise");
	// key
	var key = "regionPaths";
	var value = {};

	for( var slicename in view.currentDatasetInfo.images ) {
        var slice = view.currentDatasetInfo.images[slicename];
		if ((config.multiImageSave == false) && (slice != view.currentImageInfo)) {
			continue;
		}
		// configure value to be saved
		value.regions = [];
        // cycle through regions
		for( var reg in slice.regions ) {
			var el = {};
            // converted to JSON and then immediately parsed from JSON?
			el.path = JSON.parse(reg.path.exportJSON());
			var contour={};
			contour.Points=[];
            // cycle through points on region, converting to image coordinates
			for( var seg in reg.path.segments ) {
				var point = paper.view.projectToView(seg.point);
				var x = view.imagingHelper.physicalToDataX(point.x);
				var y = view.imagingHelper.physicalToDataY(point.y);
				contour.Points.push({"x": x, "y": y});
			}

			el.contour = contour;
			el.uid = reg.uid;
			el.name = reg.name;
//			el.mp3name = ($('#rl-'+el.uid).children().length>0)?('region'+el.uid+'.mp3'):'undefined';
			el.mp3name = 'region'+el.uid+'.mp3';
			el.transcript = $('#desp-'+el.uid).val();
			value.regions.push(el);
		}
		var img_diagnosis = $('#selectConclusions').find(":selected").text();
		slice.diag_res = img_diagnosis; // saving diag_res results for all annotation.

		// check if the slice annotations have changed since loaded by computing a hash
		var h = hash(JSON.stringify(value.regions)).toString(16);
		if( config.debug ) console.log("hash:",h,"original hash:",slice.Hash);

		// if the slice hash is undefined, this slice has not yet been loaded. do not save anything for this slice
		if( slice.Hash == undefined || h==slice.Hash ) {
			//if( config.debug > 1 ) console.log("No change, no save");
			//value.Hash = h;
			//continue;
		}
		value.Hash = h;

		var formdata = new FormData();
		formdata.append('name', slice.name);
        formdata.append('dataset', view.currentDatasetInfo.folder);
		formdata.append('diagnosis', img_diagnosis);
		formdata.append('info', JSON.stringify(value));
		formdata.append('action', 'save');
		(function(slice, h) {
			if(config.debug) console.log("< start post of contours information");
			$.ajax({
				type: 'POST',
				url: '/uploadinfo/',
				data: formdata,
				processData: false,
				contentType: false,
				success: function(result) {
					slice.Hash = h;
					if(config.debug) console.log("< Save" + result);
					//show dialog box with timeout
					if (result === "success")
						$('#saveDialog').html("Conclusion Saved").fadeIn();
						setTimeout(function() { $("#saveDialog").fadeOut(500);},2000);
					if (result === "error")
						$('#saveDialog').html("Saving Error").fadeIn();
						setTimeout(function() { $("#saveDialog").fadeOut(500);},2000);
				},
				error: function(jqXHR, textStatus, errorThrown) {
					if(config.debug) console.log("< microdrawDBSave resolve: ERROR: " + textStatus + " " + errorThrown,"slice: "+slice.name.toString());
					//show dialog box with timeout
					$('#saveDialog').html("Saving Error").fadeIn();
					setTimeout(function() { $("#saveDialog").fadeOut(500);},2000);
				}
			});
		})(slice, h);

		if(config.debug) console.log("> end of saving contour inforation");
	}
}

function microdrawDBLoad() {
	if( config.debug ) console.log("> microdrawDBLoad promise");

	var	def = $.Deferred();
	var	key = "regionPaths";
	var slice = view.currentImage;

	//=======MODIFY THIS FOR OUR PURPOSE========
	var formdata = new FormData();
    formdata.append('name', view.currentImageInfo.name);
    formdata.append('dataset', view.currentDatasetInfo.folder);
	formdata.append('action', 'load');

	$.ajax({
		type: 'POST',
		url: '/uploadinfo/',
		data: formdata,
		processData: false,
		contentType: false,
		success: function(data) {
			if( config.debug ) console.log("> got the regions data from the server");
			view.isAnnotationLoading = false;

			// do not display this one and load the current slice.
			if( slice != view.currentImage ) {
				microdrawDBLoad()
				.then(function() {
					$("#regionList").height($(window).height()-$("#regionList").offset().top);
					updateRegionList();
					paper.view.draw();
				});
				def.fail();
				return;
			}
			if( config.debug ) console.log('[',data,']');
			// if there is no data on the current slice
			// save hash for the image nonetheless
			if( data.length == 0 ) {
				view.currentImageInfo.Hash = hash(JSON.stringify(view.currentImageInfo.regions)).toString(16);
				return;
			}

			// parse the data and add to the current canvas
			var obj = data; //JSON.parse(data);

			if( JSON.stringify(obj) != JSON.stringify({})) {
				if( config.debug ) console.log("> got the regions data from the server");
				for( var i = 0; i < obj.regions.length; i++ ) {
					var reg = {};
					var	json;
					reg.name = obj.regions[i].name;
					reg.description = obj.regions[i].description;
					reg.uid = obj.regions[i].uid;
					reg.transcript = obj.regions[i].transcript;
					reg.foldername = obj.img_name;
					json = obj.regions[i].path;
					reg.path = new paper.Path();
					reg.path.importJSON(json);
					newRegion({name:reg.name,path:reg.path,uid:reg.uid,foldername:reg.foldername,description:reg.description,transcript:reg.transcript});
				}

				 // if (config.debug) console.log('From db', obj.diag_res );
				 $('#div_conclu').children().each(function(){
					 if( obj.diag_res===$(this).val())
						$(this).prop('checked',true);
					 else
						 $(this).prop('checked',false);
				 });

				// saving diag_res for current image, for slider back and forth usage. in Load:
				view.currentImageInfo.diag_res = obj.diag_res;
				paper.view.draw();
				// if image has no hash, save one
				view.currentImageInfo.Hash = (obj.Hash ? obj.Hash : hash(JSON.stringify(view.currentImageInfo.regions)).toString(16));
			}
			if( config.debug ) console.log("> success. Number of regions: ", view.currentImageInfo.regions.length);

			def.resolve();
		},
		error: function(jqXHR, textStatus, errorThrown) {
			if(config.debug) console.log("< microdrawDBLoad resolve ERROR: " + textStatus + " " + errorThrown);
			view.isAnnotationLoading = false;
		}
	});

	return def.promise();
}

// LOADING SETTING Start using all following functions
function initMicrodraw() {
	var def = $.Deferred();
	view.isAnnotationLoading = false;
    configTools();

    // load config settings from server 
	if( config.debug )	console.log("Reading settings from json");
	$.ajax({
		type: 'GET',
		url: config.urlSlides,
		dataType: "json",
		contentType: "application/json",
		success: function(obj){
            ImageInfo = obj;
            initOpenSeadragon(obj);    // load database data from server
            initDatasets();
            initRegionsMenu();
            initFilmstrip();
			def.resolve();
		}
	});

    // resize window to fit display
	$(window).resize(function() {
		$("#regionList").height($(window).height() - $("#regionList").offset().top);
		resizeAnnotationOverlay();
	});

	return def.promise();
}

function loadSlideData() {
    /* load config settings from server */
	var def = $.Deferred();
	if( config.debug )	console.log("> loadSlideData");
	$.ajax({
		type: 'GET',
		url: config.urlSlides,
		dataType: "json",
		contentType: "application/json",
		success: function(obj){
            // set up the ImageInfo array and imageOrder array
            if(config.debug) console.log(obj);
            ImageInfo = obj;
            def.resolve();
		}
	});

	return def.promise();
}

function initOpenSeadragon (obj) {
    // create OpenSeadragon viewer
	if( config.debug ) console.log("> initOpenSeadragon");
    
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
    
	view.viewer = OpenSeadragon({
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
  	view.imagingHelper = view.viewer.activateImagingHelper({});

	// add the scalebar
	view.viewer.scalebar({
		type: OpenSeadragon.ScalebarType.MICROSCOPE,
		minWidth:'150px',
		pixelsPerMeter: config.pixelsPerMeter,
		color:'black',
		fontColor:'black',
		backgroundColor:"rgba(255,255,255,0.5)",
		barThickness:4,
		location: OpenSeadragon.ScalebarLocation.TOP_RIGHT,
		xOffset:5,
		yOffset:5
	});

	// add handlers: update slice name, animation, page change, mouse actions
	view.viewer.addHandler('open',function(){
		initAnnotationOverlay();
		updateSliceName();
	});
	view.viewer.addHandler('animation', function(event){
		transform();
	});
	view.viewer.addHandler("page", function (data) {
		if(config.debug) console.log(data.page,config.tileSources[data.page]);
	});
	view.viewer.addViewerInputHook({hooks: [
		{tracker: 'viewer', handler: 'clickHandler', hookHandler: clickHandler},
		{tracker: 'viewer', handler: 'pressHandler', hookHandler: pressHandler},
		{tracker: 'viewer', handler: 'dragHandler', hookHandler: dragHandler},
		{tracker: 'viewer', handler: 'dragEndHandler', hookHandler: dragEndHandler}
	]});
}

function initRegionsMenu() {
    /* initializes regions menu */
    if (config.debug) console.log("> initRegionsMenu");
    
//    $("#regionList").click(singlePressOnRegion);
//    $("#regionList").click(doublePressOnRegion);
    $("#regionList").click(handleRegionTap);
}

function initFilmstrip() {
    /* initializes filmstrip menu */
	if( config.debug ) console.log("> initFilmstrip");
//    $("#menuFilmstrip").click(onClickSlide);
    document.querySelector("#menuFilmstrip").addEventListener("click", onClickSlide, false);
}

function configTools() {
    /* initializes toolbar buttons, sets default tool, and sets hotkeys */
	if( config.debug ) console.log("> configTools");
    
    // Enable click on toolbar buttons
	$("img.button").click(toolSelection);

	// Change current slice by typing in the slice number and pessing the enter key
//	$("#slice-name").keyup(slice_name_onenter);

	// Configure currently selected tool
	view.selectedTool = "zoom";
	selectTool();

	// Initialize the control key handler and set shortcuts
	initShortCutHandler();
	shortCutHandler({pc:'^ z',mac:'cmd z'}, view.cmdUndo);
	shortCutHandler({pc:'^ y',mac:'cmd y'}, view.cmdRedo);
	if( config.isDrawingEnabled ) {
		shortCutHandler({pc:'^ x',mac:'cmd x'},function() { if (config.debug) console.log("cut!")});
		shortCutHandler({pc:'^ v',mac:'cmd v'},cmdPaste);
		shortCutHandler({pc:'^ a',mac:'cmd a'},function() { if (config.debug) console.log("select all!")});
		shortCutHandler({pc:'^ c',mac:'cmd c'},cmdCopy);
		shortCutHandler({pc:'#46',mac:'#8'},cmdDeleteSelected);  // delete key
	}
	shortCutHandler({pc:'#37',mac:'#37'},loadPreviousImage); // left-arrow key
	shortCutHandler({pc:'#39',mac:'#39'},loadNextImage);     // right-arrow key

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
}

function initDatasets() {
    /* updates the contents of "selectDataset" */
    // getJSON automatically parses the response
	if( config.debug ) console.log("> initDatasets");
    
//    $.getJSON(config.urlDatasets, {}, function(data) {
//        availableDatasets = data;
//        $("#selectDataset").empty();
//        for (var set in data) {
//            $("#selectDataset").append("<option value='"+set+"'>"+set+"</option>");
//        }
//        switchDataset();
//        
//        $("#selectDataset").change(switchDataset);
//    });
    
    
//    $.when(loadSlideData())
//    .then(function() {
//        $("#selectDataset").empty();
//        for (var set in ImageInfo["datasets"]) {
//            $("#selectDataset").append("<option value='"+set+"'>"+set+"</option>");
//        }
//        switchDataset(Object.keys(ImageInfo["datasets"])[0]);
//        
//        $("#selectDataset").change(switchDataset);
//    });
    
    $("#selectDataset").empty();
    for (var dataset in ImageInfo["datasets"]) {
        $("#selectDataset").append("<option value='"+dataset+"'>"+dataset+"</option>");
    }
    switchDataset();

    $("#selectDataset").change(switchDataset);
}

function switchDataset() {
    /* callback to update conclusions when dataset selector is changed */
	if( config.debug ) console.log("> switchDataset");

    view.currentDataset = $("#selectDataset").val()
    view.currentDatasetInfo = ImageInfo.datasets[view.currentDataset];
    var firstImage = Object.keys(view.currentDatasetInfo.images)[0];
    loadImage(firstImage);
    updateConclusions(view.currentDatasetInfo.conclusions);
    updateFilmstrip();
    highlightCurrentSlide();
    resetAudio();
}

function updateFilmstrip() {
    /* updates the filmstrip panel with thumbnails from the current dataset */	
	if( config.debug ) console.log("> updateFilmstrip");
    
    $("#menuFilmstrip").empty();
    if (ImageInfo.length === 0) {
        $("#menuFilmstrip").append(
            "<div class='cell slide'> \
                <span class='caption' style='color: rgb(255,100,100);'>Directory is empty</span> \
            </div>"
        );
        return;
    }
    var selected = '';
//    for ( var name in ImageInfo) {
//        $("#menuFilmstrip").append(
//            "<div id='"+name+"' class='cell slide'> \
//                <img src="+"data:image/png;base64,"+ImageInfo[name]['thumbnail']+" /> \
//                <span class='caption'>"+name+"</span> \
//            </div>"
//        );
//    }
    for (var name in view.currentDatasetInfo.images) {
        $("#menuFilmstrip").append(
            "<div id='"+name+"' class='cell slide'> \
                <img src='"+view.currentDatasetInfo.images[name].thumbnail+"' /> \
                <span class='caption'>"+name+"</span> \
            </div>"
        );
    }
}

function highlightCurrentSlide() {
    $(".slide").removeClass("selected");
    $(".slide").each(function() {
        if ($(this).children(".caption").html() == view.currentImage) {
            $(this).addClass("selected");
        }
    });
}

function updateConclusions(conclusions) {
    /* updates the contents of conclusion selector */
	if( config.debug ) console.log("> updateConclusions");
    
    $("#selectConclusions").empty();
    for (var i = 0; i < conclusions.length; i++) {
        $("#selectConclusions").append("<option value='"+conclusions[i]+"'>"+conclusions[i]+"</option>");
    }
}

function onClickSlide(e) {
    // event handlers run from bottom (clicked element) to top of the DOM.
    // e.currentTarget is the object that the handler was attached to.
    // e.target is the element that was clicked.
	if( config.debug ) console.log("> onClickSlide");
    
    if (e.target !== e.currentTarget) {
        if ($(e.target).hasClass('slide')) {
            var imgName = e.target.id;
            loadImage(imgName);
        } else {
            var imgName = e.target.parentNode.id;
            loadImage(imgName);
        }
    }
    // stops searching once we reach the element that called the event
    e.stopPropagation();
}

function setAudio(reg) {
    $("#menuAudioPlayer").attr("src", reg.audio);
    $("#region-msg").html(reg.name);
    $("#audioPanel").removeClass("inactive");
}

function resetAudio() {
    $("#menuAudioPlayer").attr("src", "");
    $("#region-msg").html("No region selected");
    $("#audioPanel").addClass("inactive");
}

function segmentation() {
    var formdata = new FormData();
    formdata.append('imageidx', view.currentImage);
    $.ajax({
		type: 'POST',
		url: '/segmentation/',
        data: formdata,
        processData: false,
        contentType: false,
		success: function(response){
			console.log(response);
		}
	});
}

function loadConfiguration() {
	var def = $.Deferred();
	// load general microdraw configuration
	if( config.debug ) console.log("> loadConfiguration");
    
	$.getJSON("/static/config/configuration.json", function(data) {
		config = data;

		drawingTools = ["select", "draw", "draw-polygon", "simplify", "addpoint",
		"delpoint", "addregion", "delregion", "splitregion", "rotate",
		"save", "copy", "paste", "delete"];
		if( config.isDrawingEnabled == false ) {
			// remove drawing tools from ui
			for( var i = 0; i < drawingTools.length; i++ ){
				$("#" + drawingTools[i]).remove();
			}
		}
		for( var i = 0; i < config.disabledTools.length; i++ ) {
			$("#" + config.disabledTools[i]).remove();
		}
		if( config.isSavingEnabled == false ) {
			$("#save").remove();
		}
		def.resolve();
	});
    
    config.isMac = navigator.platform.match(/Mac/i)?true:false;
    config.isIOS = navigator.platform.match(/(iPhone|iPod|iPad)/i)?true:false;

	return def.promise();
}


$(function() {
	$.when(
		loadConfiguration()
	).then(initMicrodraw);
});
