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
var scopal;
function Scopal() {
    this.imageInfo = {};
    this.config = {};
    this.viewer = undefined;
    this.magicV = 1000;
    this.imagingHelper = undefined;
    this.prevImage = undefined;
    this.currentImage = undefined;
    this.currentImageInfo = undefined;
    this.currentDataset = undefined;
    this.currentDatasetInfo = undefined;
    this.currentRegion = null;
    this.currentColorRegion = undefined;
    this.prevRegion = null;
    this.copyRegion = null;
    this.currentHandle = undefined;
    this.selectedTool = undefined;
    this.navEnabled = true;
    this.mouseUndo = undefined;
    this.undoStack = [];
    this.redoStack = [];
    this.shortcuts = [];
    this.isDrawingRegion = false;
    this.isDrawingPolygon = false;
    this.isAnnotationLoading = false;
    this.isTapDevice = false;
    this.updateCurrentImage = function(name) {
        this.prevImage = this.currentImage;
        this.currentImage = name;
        this.currentImageInfo = this.currentDatasetInfo.images[this.currentImage];
    };
    this.cmdUndo = function() {
        if( view.undoStack.length > 0 ) {
            var redoInfo = this.getUndo();
            var undoInfo = this.undoStack.pop();
            this.applyUndo(undoInfo);
            this.redoStack.push(redoInfo);
            paper.view.draw();
        }
    };
    this.cmdRedo = function() {
        if( view.redoStack.length > 0 ) {
            var undoInfo = this.getUndo();
            var redoInfo = this.redoStack.pop();
            applyUndo(redoInfo);
            this.undoStack.push(undoInfo);
            paper.view.draw();
        }
    };
    this.getUndo = function() {
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
    };
    this.saveUndo = function(undoInfo) {
        this.undoStack.push(undoInfo);
        this.redoStack = [];
    };
    this.setImage = function(imageNumber) {
        if( view.config.debug ) console.log("> setImage");
        var index = view.currentDatasetInfo.imageOrder.indexOf(imageNumber);

        loadImage(view.currentDatasetInfo.imageOrder[index]);
    };
    this.applyUndo = function(undo) {
    	if( undo.imageNumber !== view.currentImage )
        this.setImage(undo.imageNumber);
        var info = this.imageInfo[undo.imageNumber].regions;
        while( info.length > 0 )
        removeRegion(info[0]);
        this.currentRegion = null;
        for( var i = 0; i < undo.regions.length; i++ ) {
            var el = undo.regions[i];
            var project = paper.projects[this.imageInfo[undo.imageNumber].projectID];
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
    };
    this.commitMouseUndo = function() {
        if( this.mouseUndo !== undefined ) {
            this.saveUndo(this.mouseUndo);
            this.mouseUndo = undefined;
        }
    };
    
    /* Region handling functions */
    this.newRegion = function(arg, imageNumber) {
        /* called whenever a new region is created */
         if( this.config.debug ) console.log("> newRegion");

        // define region properties
        var region = {};
        region.uid = this.regionUniqueID();
        if( arg.name ) {
            region.name = arg.name;
        } else {
            region.name = "region " + region.uid;
        }
        if( arg.description ) {
            region.description = arg.description;
        }
        if( arg.foldername ) {
            region.foldername = arg.foldername;
        }
        if (arg.transcript) {
            region.transcript = arg.transcript;
        } else {
            region.transcript="";
        }
        var color = this.regionHashColor(region.name);
        if( arg.path ) {
            region.path = arg.path;
            region.path.strokeWidth = arg.path.strokeWidth ? arg.path.strokeWidth : this.config.defaultStrokeWidth;
            region.path.strokeColor = arg.path.strokeColor ? arg.path.strokeColor : this.config.defaultStrokeColor;
            region.path.strokeScaling = false;
            region.path.fillColor = arg.path.fillColor ? arg.path.fillColor :'rgba('+color.red+','+color.green+','+color.blue+','+this.config.defaultFillAlpha+')';
            region.path.selected = false;
        }

        if( imageNumber === undefined ) {
            imageNumber = this.currentImage;
        }
        if( imageNumber === this.currentImage ) {
            // append region tag to regionList
            $("#regionList").append($(this.regionTag(region.name, region.uid)));
        }

        // set audio file
        region.audio = 'static/audio/'+this.currentDatasetInfo.folder+'/'+this.currentImageInfo.name+'/'+'region'+region.uid+'.mp3';
        $("#menuAudioPlayer").attr("src", region.audio);

        // Select region name in list
        $("#regionList > .region-tag").each(function(i){
            $(this).addClass("deselected");
            $(this).removeClass("selected");
        });

        var tag = $("#regionList > .region-tag#" + region.uid);
        $(tag).removeClass("deselected");
        $(tag).addClass("selected");

        // push the new region to the Regions array
        this.currentImageInfo.regions.push(region);
        return region;
    };
    this.removeRegion = function(region) {
        if( this.config.debug ) console.log("> removeRegion");

        // remove from Regions array
        //	this.imageInfo[imageNumber]["Regions"].splice(this.imageInfo[imageNumber]["Regions"].indexOf(reg),1);
        this.currentImageInfo.regions.splice(this.currentImageInfo.regions.indexOf(region), 1);
        // remove from paths
        region.path.remove();
        var	tag = $("#regionList > .region-tag#" + region.uid);
        $(tag).remove();
        this.resetAudio();
    };
    this.selectRegion = function(region) {
        if( this.config.debug ) console.log("> selectRegion");

        var i;
        // Select path
        for( i = 0; i < this.currentImageInfo.regions.length; i++ ) {
            var region_id = this.currentImageInfo.regions[i].uid;
            if( this.currentImageInfo.regions[i] == region ) {
                region.path.selected = true;
                region.path.fullySelected = true;
                this.currentRegion = region;
                $("#desp-"+region_id).show();
            } else {
                this.currentImageInfo.regions[i].path.selected = false;
                this.currentImageInfo.regions[i].path.fullySelected = false;
                $("#desp-"+region_id).hide();
            }
        }
        paper.view.draw();

        // Select region name in list
        $("#regionList > .region-tag").each(function(i){
            $(this).addClass("deselected");
            $(this).removeClass("selected");
        });

        var tag = $("#regionList > .region-tag#" + region.uid);
        $(tag).removeClass("deselected");
        $(tag).addClass("selected");

        // change audio source
        this.setAudio(region);

        if(view.config.debug) console.log("< selectRegion");
    };
    this.findRegionByUID = function(uid) {
        if( this.config.debug ) console.log("> findRegionByUID");
        if( this.config.debug > 2 ) console.log( "look for uid: " + uid);
        if( this.config.debug > 2 ) console.log( "region array length: " + this.currentImage.regions.length );

        for(var i = 0; i < this.currentImageInfo.regions.length; i++) {

            if( this.currentImageInfo.regions[i].uid == uid ) {
                if(this.config.debug > 2) console.log("region " + this.currentImageInfo.regions[i].uid + ": " );
                if(this.config.debug > 2) console.log(this.currentImageInfo.regions[i]);
                return this.currentImageInfo.regions[i];
            }
        }
        console.log("Region with unique ID "+uid+" not found");
        return null;
    };
    this.findRegionByName = function(name) {
        if(this.config.debug) console.log("> findRegionByName");

        for(var i = 0; i < this.currentImageInfo.regions.length; i++ ) {
            if( this.currentImageInfo.regions[i].name == name ) {
                return this.currentImageInfo.regions[i];
            }
        }
        console.log("Region with name " + name + " not found");
        return null;
    };
    this.regionUniqueID = function() {
        if( this.config.debug ) console.log("> regionUniqueID");

        var found = false;
        var counter = 1;
        while( found == false ) {
            found = true;
            for( var i = 0; i < this.currentImageInfo.regions.length; i++ ) {
                if( this.currentImageInfo.regions[i].uid == counter ) {
                    counter++;
                    found = false;
                    break;
                }
            }
        }
        return counter;
    };
    this.hash = function(inputString) {
        /* splits string into array of characters, then applies the function to every element */
        var result = inputString.split("").reduce(function(a,b) {
            // a<<5 bit-shifts a to the left 5 times
            a = ((a<<5)-a) + b.charCodeAt(0);
            // & means bitwise AND 
            return a&a;
        }, 0);
        return result;
    };
    function regionHashColor(name) {
        if(this.config.debug) console.log("> regionHashColor");

        var color = {};
        var h = this.hash(name);

        // add some randomness
        h = Math.sin(h++)*10000;
        h = 0xffffff*(h-Math.floor(h));

        color.red = h&0xff;
        color.green = (h&0xff00)>>8;
        color.blue = (h&0xff0000)>>16;
        return color;
    };
    this.regionTag = function(name, uid) {
        if( this.config.debug ) console.log("> regionTag");

        var str;
        var color;
        if( uid ) {
            var region = this.findRegionByUID(uid);
            var mult = 1.0;
            if( region ) {
                mult = 255;
                color = region.path.fillColor;
            }
            else {
                color = this.regionHashColor(name);
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
            color = this.regionHashColor(name);
            str = "<div class='region-tag' style='padding:2px'> \
            <div class='region-color' \
            style='background-color:rgba("+color.red+","+color.green+","+color.blue+",0.67 \
            )'></div> \
            <span class='region-name'>"+name+"</span> \
            </div>"
        }
        return str;
    };
    this.changeRegionName = function(region, name) {
        if( this.config.debug ) console.log("> changeRegionName");

        var color = this.regionHashColor(name);
        region.name = name;
        region.path.fillColor = 'rgba('+color.red+','+
                                      color.green+','+
                                      color.blue+',0.5)';
        paper.view.draw();

        // Update region tag
        $(".region-tag#" + region.uid + ">.region-name").text(name);
        $(".region-tag#" + region.uid + ">.region-color").css('background-color','rgba('+color.red+','+color.green+','+color.blue+',0.67)');
        this.setAudio(region);
    };
    this.toggleRegion = function(region) {
        if( this.currentRegion !== null ) {
            if( this.config.debug ) console.log("> toggle region");

            var color = this.regionHashColor(region.name);
            if( region.path.fillColor !== null ) {
                region.path.storeColor = region.path.fillColor;
                region.path.fillColor = null;

                region.path.strokeWidth = 0;
                region.path.fullySelected = false;
                region.storeName = region.name;
                //reg.name=reg.name+'*';
                $('#eye_' + region.uid).attr('src','../static/img/eyeClosed.svg');
            }
            else {
                region.path.fillColor = region.path.storeColor;
                region.path.strokeWidth = 1;
                region.name = region.storeName;
                $('#eye_' + region.uid).attr('src','../static/img/eyeOpened.svg');
            }
            paper.view.draw();
            $(".region-tag#" + region.uid + ">.region-name").text(region.name);
        }
    };
    this.updateRegionList = function() {
        if( this.config.debug ) console.log("> updateRegionList");

        // remove all entries in the regionList
        $("#regionList > .region-tag").each(function() {
            $(this).remove();
        });

        //var def = $.Deferred();
        // adding entries corresponding to the currentImage
        for( var i = 0; i < this.currentImageInfo.regions.length; i++ ) {

            var region = this.currentImageInfo.regions[i];
            if( this.config.debug ) console.log("> restoring region..", region.uid);
            $("#regionList").append($(regionTag(region.name, region.uid)));

            // add the transcript
            if(region.transcript!=undefined || region.transcript!="undefined")
            {
                $("#desp-"+region.uid).val(region.transcript);
            }
        }
        //return def.promise();
    };
    this.encode64alt = function(buffer) {
        var binary = '',
        bytes = new Uint8Array( buffer ),
        len = bytes.byteLength;
        for (var i = 0; i < len; i++) {
            binary += String.fromCharCode( bytes[ i ] );
        }
        return window.btoa( binary );
    };
    this.checkRegionSize = function(region) {
        if( region.path.length > 3 ) {
            this.selectRegion(region);
            return;
        }
        else {
            this.removeRegion(this.currentRegion);
        }
    };
    
    /*****************************************************************************
    EVENT HANDLERS
    *****************************************************************************/
    this.clickHandler = function(event) {
        if( this.config.debug ) console.log("> clickHandler");

        event.stopHandlers = !this.navEnabled;
        if( this.selectedTool == "draw" ) {
            this.checkRegionSize(this.currentRegion);
        }
    };
    this.pressHandler = function(event) {
        if( this.config.debug ) console.log("> pressHandler");

        if( !this.navEnabled ) {
            event.stopHandlers = true;
            this.mouseDown(event.originalEvent.layerX, event.originalEvent.layerY);
        }
    };
    this.dragHandler = function(event) {
        if( this.config.debug > 1 )	console.log("> dragHandler");

        if( !this.navEnabled ) {
            event.stopHandlers = true;
            this.mouseDrag(event.originalEvent.layerX,
                           event.originalEvent.layerY,
                           event.delta.x,
                           event.delta.y);
        }
    };
    this.dragEndHandler = function(event) {
        if( this.config.debug ) console.log("> dragEndHandler");

        if( !this.navEnabled ) {
            event.stopHandlers = true;
            this.mouseUp();
        }
    };
    this.singlePressOnRegion = function(event) {
        if( this.config.debug ) console.log("> singlePressOnRegion");

        event.preventDefault();

        if (event.target !== event.currentTarget) {
            var el = $(this);
            var regionId;
            var region;

            if ($(event.target).hasClass("region-tag")) {
                regionId = event.target.id;
            } else {
                regionId = event.target.parentNode.id;
            }

            if ($(event.target).hasClass("eye")) {
                region = this.findRegionByUID(regionId);
                this.toggleRegion(region);
            } else if( event.clientX > 20 ) {
                if( event.clientX > 50 ) {
                    // Click on regionList (list or annotated regions)
                    region = this.findRegionByUID(regionId);
                    if( region ) {
                        this.selectRegion(region);
                    } else {
                        console.log("region undefined");
                    }
                } else {
                    region = this.findRegionByUID(regionId);
                    if( region.path.fillColor != null ) {
                        if( region ) {
                            this.selectRegion(region);
                        }
                        this.highlightRegion(region);
                    }
                }
            }
    //        else {
    //            var reg = findRegionByUID(this.id);
    //            toggleRegion(reg);
    //        }
        }
        event.stopPropagation();
    };
    this.doublePressOnRegion = function(event) {
        if( this.config.debug ) console.log("> doublePressOnRegion");

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
                    if( this.config.isDrawingEnabled ) {
                        var name = prompt("Region name",
                                          this.findRegionByUID(regionId).name);
                        if( name != null ) {
                            this.changeRegionName(this.findRegionByUID(regionId), 
                                                  name);
                        }
                    }
                } else {
                    var region = this.findRegionByUID(regionId);
                    if( region.path.fillColor != null ) {
                        if( region ) {
                            this.selectRegion(region);
                        }
                        this.highlightRegion(region);
                    }
                }
            } else {
                var reg = this.findRegionByUID(regionId);
                this.toggleRegion(region);
            }
        }
        event.stopPropagation();
    };
    this.handleRegionTap = function(event) {
        /* Handles single and double tap in touch devices */
        if( this.config.debug ) console.log("> handleRegionTap");

        if( !this.isTapDevice ){ //if tap is not set, set up single tap
            this.isTapDevice = setTimeout(function() {
                this.isTapDevice = null;
            }, 300);

            // call singlePressOnRegion(event) using 'this' as context
            this.singlePressOnRegion.call(this, event);
        } else {
            clearTimeout(this.isTapDevice);
            this.isTapDevice = null;

            // call doublePressOnRegion(event) using 'this' as context
            this.doublePressOnRegion.call(this, event);
        }
        if( this.config.debug ) console.log("< handleRegionTap");
    };
    this.mouseDown = function(x,y) {
        if( this.config.debug > 1 ) console.log("> mouseDown");

        this.mouseUndo = this.getUndo();
        var point = paper.view.viewToProject(new paper.Point(x,y));

        this.currentHandle = null;

        switch( this.selectedTool ) {
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

                this.isDrawingRegion = false;
                if( hitResult ) {
                    for( var i = 0; i < this.currentImageInfo.regions.length; i++ ) {
                        if( this.currentImageInfo.regions[i].path == hitResult.item ) {
                            region = this.currentImageInfo.regions[i];
                            break;
                        }
                    }

                    // select path
                    if( this.currentRegion && this.currentRegion != region ) {
                        this.currentRegion.path.selected = false;
                        this.prevRegion = this.currentRegion;
                    }
                    this.selectRegion(region);

                    if( hitResult.type == 'handle-in' ) {
                        this.currentHandle = hitResult.segment.handleIn;
                        this.currentHandle.point = point;
                    } else if( hitResult.type == 'handle-out' ) {
                        this.currentHandle = hitResult.segment.handleOut;
                        this.currentHandle.point = point;
                    } else if( hitResult.type == 'segment' ) {
                        if( this.selectedTool == "select" ) {
                            this.currentHandle = hitResult.segment.point;
                            this.currentHandle.point = point;
                        }
                        if( this.selectedTool == "delpoint" ) {
                            hitResult.segment.remove();
                            this.commitMouseUndo();
                        }
                    } else if( hitResult.type == 'stroke' && this.selectedTool == "addpoint" ) {
                        this.currentRegion.path
                            .curves[hitResult.location.index]
                            .divide(hitResult.location);
                        this.currentRegion.path.fullySelected = true;
                        this.commitMouseUndo();
                        paper.view.draw();
                    } else if( this.selectedTool == "addregion" ) {
                        if( this.prevRegion ) {
                            var newPath = this.currentRegion.path.unite(this.prevRegion.path);
                            this.removeRegion(this.prevRegion);
                            this.currentRegion.path.remove();
                            this.currentRegion.path = newPath;
                            this.updateRegionList();
                            this.selectRegion(this.currentRegion);
                            paper.view.draw();
                            this.commitMouseUndo();
                            this.backToSelect();
                        }
                    } else if( this.selectedTool == "delregion" ) {
                        if( this.prevRegion ) {
                            var newPath = this.prevRegion.path.subtract(
                                                this.currentRegion.path);
                            this.removeRegion(this.prevRegion);
                            this.prevRegion.path.remove();
                            this.newRegion({path:newPath});
                            this.updateRegionList();
                            this.selectRegion(this.currentRegion);
                            paper.view.draw();
                            this.commitMouseUndo();
                            this.backToSelect();
                        }
                    } else if( this.selectedTool == "splitregion" ) {
                        /*selected region is prevRegion!
                        region is the region that should be split based on prevRegion
                        newRegionPath is outlining that part of region which has not been overlaid by prevRegion
                        i.e. newRegion is what was region
                        and prevRegion color should go to the other part*/
                        if( this.prevRegion ) {
                            var prevColor = this.prevRegion.path.fillColor;
                            //color of the overlaid part
                            var color = this.currentRegion.path.fillColor;
                            var newPath = this.currentRegion.path.divide(
                                                this.prevRegion.path);
                            this.removeRegion(this.prevRegion);
                            this.currentRegion.path.remove();
                            this.currentRegion.path = newPath;
                            var region;
                            for( i = 0; i < newPath._children.length; i++ )
                            {
                                if( i == 0 ) {
                                    this.currentRegion.path = newPath._children[i];
                                }
                                else {
                                    region = this.newRegion({path:newPath._children[i]});
                                }
                            }
                            this.currentRegion.path.fillColor = color;
                            if( region ) {
                                region.path.fillColor = prevColor;
                            }
                            this.updateRegionList();
                            this.selectRegion(this.currentRegion);
                            paper.view.draw();

                            this.commitMouseUndo();
                            this.backToSelect();
                        }
                    }
                    break;
                }
                if( hitResult == null && this.currentRegion ) {
                    //deselect paths
                    this.currentRegion.path.selected = false;
                    this.currentRegion = null;
                }
                break;
            }
            case "draw": {
                // Start a new region
                // if there was an older region selected, unselect it
                if( this.currentRegion ) {
                    this.currentRegion.path.selected = false;
                }
                // start a new region
                var path = new paper.Path({segments:[point]})
                path.strokeWidth = this.config.defaultStrokeWidth;
                this.currentRegion = this.newRegion({path:path});
                // signal that a new region has been created for drawing
                this.isDrawingRegion = true;

                this.commitMouseUndo();
                break;
            }
            case "draw-polygon": {
                // is already drawing a polygon or not?
                if( this.isDrawingPolygon == false ) {
                    // deselect previously selected region
                    if( this.currentRegion )
                    this.currentRegion.path.selected = false;

                    // Start a new Region with alpha 0
                    var path = new paper.Path({segments:[point]})
                    path.strokeWidth = this.config.defaultStrokeWidth;
                    this.currentRegion = this.newRegion({path:path});
                    this.currentRegion.path.fillColor.alpha = 0;
                    this.currentRegion.path.selected = true;
                    this.isDrawingPolygon = true;
                    this.commitMouseUndo();
                } else {
                    var hitResult = paper.project.hitTest(point, {tolerance:10, segments:true});
                    if(hitResult && 
                       hitResult.item == this.currentRegion.path && 
                       hitResult.segment.point == this.currentRegion.path.segments[0].point) {
                        // clicked on first point of current path
                        // --> close path and remove drawing flag
                        this.finishDrawingPolygon(true);
                    } else {
                        // add point to region
                        this.currentRegion.path.add(point);
                        this.commitMouseUndo();
                    }
                }
                break;
            }
            case "rotate":
            this.currentRegion.origin = point;
            break;
        }
        paper.view.draw();
    };
    this.mouseDrag = function(x, y, dx, dy) {
        if( this.config.debug ) console.log("> mouseDrag");

        // transform screen coordinate into world coordinate
        var point = paper.view.viewToProject(new paper.Point(x,y));

        // transform screen delta into world delta
        var orig = paper.view.viewToProject(new paper.Point(0,0));
        var dpoint = paper.view.viewToProject(new paper.Point(dx,dy));
        dpoint.x -= orig.x;
        dpoint.y -= orig.y;

        if( this.currentHandle ) {
            this.currentHandle.x += point.x-this.currentHandle.point.x;
            this.currentHandle.y += point.y-this.currentHandle.point.y;
            this.currentHandle.point = point;
            this.commitMouseUndo();
        } else if( this.selectedTool == "draw" ) {
            this.currentRegion.path.add(point);
        } else if( this.selectedTool == "select" ) {
            // event.stopHandlers = true;
            for( var i in this.currentImageInfo.regions ) {
                var region = this.currentImageInfo.regions[i];
                if( region.path.selected ) {
                    region.path.position.x += dpoint.x;
                    region.path.position.y += dpoint.y;
                    this.commitMouseUndo();
                }
            }
        } if(this.selectedTool == "rotate") {
            event.stopHandlers = true;
            var degree = parseInt(dpoint.x);
            for( var i in this.currentImageInfo.regions ) {
                if( this.currentImageInfo.regions[i].path.selected ) {
                    this.currentImageInfo.Regions[i].path.rotate(degree, this.currentRegion.origin);
                    this.commitMouseUndo();
                }
            }
        }
        paper.view.draw();
    };
    this.mouseUp = function() {
        if( this.config.debug ) console.log("> mouseUp");

        if( this.isDrawingRegion == true ) {
            this.currentRegion.path.closed = true;
            this.currentRegion.path.fullySelected = true;
            // to delete all unnecessary segments while preserving the form of the region to make it modifiable; & adding handles to the segments
            var orig_segments = this.currentRegion.path.segments.length;
            this.currentRegion.path.simplify(0.02);
            var final_segments = this.currentRegion.path.segments.length;
            if( this.config.debug > 2 ) console.log( parseInt(final_segments/orig_segments*100) + "% segments conserved" );
        }
        paper.view.draw();
    };
    this.simplifyRegion = function() {
        /* calls simplify method of region path to resample the contour */
        if( this.currentRegion !== null ) {
            if( this.config.debug ) console.log("> simplifying region path");

            var orig_segments = this.currentRegion.path.segments.length;
            this.currentRegion.path.simplify();
            var final_segments = this.currentRegion.path.segments.length;
            console.log( parseInt(final_segments/orig_segments*100) + "% segments conserved" );
            paper.view.draw();
        }
    };
    this.flipRegion = function(region) {
        /* flip region along y-axis around its center point */
        if( this.currentRegion !== null ) {
            if( this.config.debug ) console.log("> flipping region");

            for( var i in this.currentImageInfo.regions ) {
                if( this.currentImageInfo.regions[i].path.selected ) {
                    this.currentImageInfo.regions[i].path.scale(-1, 1);
                }
            }
            paper.view.draw();
        }
    };
    this.toggleHandles = function() {
        if(this.config.debug) console.log("> toggleHandles");
        if (this.currentRegion != null) {
            if (this.currentRegion.path.hasHandles()) {
                if (confirm('Do you really want to remove the handles?')) {
                    var undoInfo = this.getUndo();
                    this.currentRegion.path.clearHandles();
                    this.saveUndo(undoInfo);
                }
            } else {
                var undoInfo = this.getUndo();
                this.currentRegion.path.smooth();
                this.saveUndo(undoInfo);
            }
            paper.view.draw();
        }
    };

    /*****************************************************************************
        ANNOTATION STYLE
     *****************************************************************************/
    this.padZerosToString = function(number, length) {
        /* add leading zeros to (string)number */
        var str = '' + number;
        while( str.length < length ) {str = '0' + str;}
        return str;
    };
    this.getHexColor = function(region) {
        return '#' + 
            this.padZerosToString((parseInt(region.path.fillColor.red * 255))
                                  .toString(16),2) + 
            this.padZerosToString((parseInt(region.path.fillColor.green * 255))
                                  .toString(16),2) + 
            this.padZerosToString((parseInt(region.path.fillColor.blue * 255))
                                  .toString(16),2);
    };
    this.highlightRegion = function(region) {
        /* get current alpha & color values for colorPicker display */
        if( this.config.debug ) console.log(region.path.fillColor);

        if( this.currentRegion !== null ) {
            if( this.config.debug ) console.log("> changing annotation style");

            this.currentColorRegion = region;
            var alpha = region.path.fillColor.alpha;
            $('#alphaSlider').val(alpha*100);
            $('#alphaFill').val(parseInt(alpha*100));

            var hexColor = this.getHexColor(region);
            if( this.config.debug ) console.log(hexColor);

            $('#fillColorPicker').val(hexColor);

            if ($('#colorSelector').css('display') == 'none') {
                $('#colorSelector').css('display', 'block');
            } else {
                $('#colorSelector').css('display', 'none');
            }
        }
    };
    // NOT USED
    this.setRegionColor = function() {
        /* set picked color & alpha */
        var region = this.currentColorRegion;
        var hexColor = $('#fillColorPicker').val();
        var red = parseInt( hexColor.substring(1,3), 16 );
        var green = parseInt( hexColor.substring(3,5), 16 );
        var blue = parseInt( hexColor.substring(5,7), 16 );

        region.path.fillColor.red = red / 255;
        region.path.fillColor.green = green / 255;
        region.path.fillColor.blue = blue / 255;
        region.path.fillColor.alpha = $('#alphaSlider').val() / 100;

        // update region tag
        $(".region-tag#" + region.uid + ">.region-color").css('background-color','rgba('+red+','+green+','+blue+',0.67)');

        // update stroke color
        switch($('#selectStrokeColor')[0].selectedIndex) {
            case 0:
                region.path.strokeColor = "black";
                break;
            case 1:
                region.path.strokeColor = "white";
                break;
            case 2:
                region.path.strokeColor = "red";
                break;
            case 3:
                region.path.strokeColor = "green";
                break;
            case 4:
                region.path.strokeColor = "blue";
                break;
            case 5:
                region.path.strokeColor = "yellow";
                break;
        }
        $('#colorSelector').css('display', 'none');
    };
    // NOT USED
    this.onFillColorPicker = function(value) {
        /* update all values on the fly */
        $('#fillColorPicker').val(value);
        var region = this.currentColorRegion;
        var hexColor = $('#fillColorPicker').val();
        var red = parseInt(hexColor.substring(1,3), 16);
        var green = parseInt(hexColor.substring(3,5), 16);
        var blue = parseInt(hexColor.substring(5,7), 16);
        region.path.fillColor.red = red / 255;
        region.path.fillColor.green = green / 255;
        region.path.fillColor.blue = blue / 255;
        region.path.fillColor.alpha = $('#alphaSlider').val() / 100;
        paper.view.draw();
    };
    this.onSelectStrokeColor = function() {
        var region = this.currentColorRegion;
        switch( $('#selectStrokeColor')[0].selectedIndex ) {
            case 0:
                region.path.strokeColor = "black";
                break;
            case 1:
                region.path.strokeColor = "white";
                break;
            case 2:
                region.path.strokeColor = "red";
                break;
            case 3:
                region.path.strokeColor = "green";
                break;
            case 4:
                region.path.strokeColor = "blue";
                break;
            case 5:
                region.path.strokeColor = "yellow";
                break;
        }
        paper.view.draw();
    };
    this.onAlphaSlider = function(value) {
        $('#alphaFill').val(value);
        var region = this.currentColorRegion;
        region.path.fillColor.alpha = $('#alphaSlider').val() / 100;
        paper.view.draw();
    };
    this.onAlphaInput = function(value) {
        $('#alphaSlider').val(value);
        var region = this.currentColorRegion;
        region.path.fillColor.alpha = $('#alphaSlider').val() / 100;
        paper.view.draw();
    };
    // NOT USED
    this.onStrokeWidthDec = function() {
        var region = this.currentColorRegion;
        region.path.strokeWidth = Math.max(this.currentRegion.path.strokeWidth - 1, 1);
        paper.view.draw();
    };
    // NOT USED
    this.onStrokeWidthInc = function() {
        var region = this.currentColorRegion;
        this.path.strokeWidth = Math.min(this.currentRegion.path.strokeWidth + 1, 10);
        paper.view.draw();
    };

    this.finishDrawingPolygon = function(closed) {
        // finished the drawing of the polygon
        if( closed == true ) {
            this.currentRegion.path.closed = true;
            this.currentRegion.path.fillColor.alpha = this.config.defaultFillAlpha;
        } else {
            this.currentRegion.path.fillColor.alpha = 0;
        }
        this.currentRegion.path.fullySelected = true;
        //view.currentRegion.path.smooth();
        this.isDrawingPolygon = false;
        this.commitMouseUndo();
    }
    this.backToPreviousTool = function() {
        setTimeout(function() {
            this.setSelectedTool(this.prevTool);
        },500);
    };
    this.backToSelect = function() {
        setTimeout(function() {
            this.setSelectedTool("select");
        },500);
    };
    this.cmdDeleteSelected = function() {
        if($(document.activeElement).is('textarea')) return;

        var undoInfo = this.getUndo();
    //	var i;
    //	for( i in this.imageInfo[view.currentImage]["Regions"] ) {
    //		if( this.imageInfo[view.currentImage]["Regions"][i].path.selected ) {
    //			removeRegion(this.imageInfo[view.currentImage]["Regions"][i]);
    //			view.saveUndo(undoInfo);
    //			paper.view.draw();
    //			break;
    //		}
    //	}
        this.removeRegion(this.currentRegion);
        this.saveUndo(undoInfo);
    };

    this.cmdPaste = function() {
        if(this.copyRegion !== null) {
            var undoInfo = this.getUndo();
            this.saveUndo(undoInfo);
            console.log( "paste " + this.copyRegion.name );
            if (this.findRegionByName(this.copyRegion.name)) {
                this.copyRegion.name += " Copy";
            }
            var reg = JSON.parse(JSON.stringify(this.copyRegion));
            region.path = new paper.Path();
            region.path.importJSON(this.copyRegion.path);
            region.path.fullySelected = true;
            var color = this.regionHashColor(region.name);
            reg.path.fillColor = 'rgba(' + color.red + ',' + color.green + ',' + color.blue + ',0.5)';
            this.newRegion({name: this.copyRegion.name, path: region.path});
        }
        paper.view.draw();
    };
    this.cmdCopy = function() {
        if (this.currentRegion !== null) {
            var json = this.currentRegion.path.exportJSON();
            this.copyRegion = JSON.parse(JSON.stringify(this.currentRegion));
            this.copyRegion.path = json;
            console.log( "< copy " + this.copyRegion.name );
        }
    };
    this.toolSelectionHandler = function(event) {
        if( this.config.debug ) console.log("> toolSelection");

        //end drawing of polygons and make open form
        if (this.isDrawingPolygon == true) {finishDrawingPolygon(true);}
        this.setSelectedTool($(this).attr("id"));

        switch(this.selectedTool) {
            case "select":
            case "addpoint":
            case "delpoint":
            case "addregion":
            case "delregion":
            case "draw":
            case "rotate":
            case "draw-polygon":
                this.navEnabled = false;
                break;
            case "zoom":
                this.navEnabled = true;
                this.currentHandle = null;
                break;
            case "delete":
                this.cmdDeleteSelected();
                this.backToPreviousTool();
                break;
            case "save":
                this.microdrawDBSave();
                this.backToPreviousTool();
                break;
            case "zoom-in":
            case "zoom-out":
            case "home":
                this.backToPreviousTool();
                break;
            case "prev":
                this.loadPreviousImage();
                this.backToPreviousTool();
                break;
            case "next":
                this.loadNextImage();
                this.backToPreviousTool();
                break;
            case "copy":
                this.cmdCopy();
                this.backToSelect();
                break;
            case "paste":
                this.cmdPaste();
                this.backToSelect();
                break;
            case "simplify":
                this.simplifyRegion();
                this.backToSelect();
                break;
            case "flip":
                this.flipRegion(this.currentRegion);
                this.backToSelect();
                break;
            case "closeMenu":
                this.collapseMenu();
                this.backToPreviousTool();
                break;
            case "openMenu":
                this.collapseMenu();
                this.backToPreviousTool();
                break;
            case "toggleMenu":
                this.toggleMenu();
                this.backToPreviousTool();
                break;
            case "handle":
                this.toggleHandles();
                this.backToPreviousTool();
                break;
            case "segment":
                this.segmentation();
                this.backToPreviousTool();
                break;
        }
    };
    this.setSelectedTool = function(toolname) {
        if( this.config.debug ) console.log("> selectTool");

        this.prevTool = this.selectedTool;
        this.selectedTool = toolname;
        $("img.button").removeClass("selected");
        $("img.button#" + this.selectedTool).addClass("selected");
        //$("svg").removeClass("selected");
        //$("svg#"+view.selectedTool).addClass("selected");
    };
          
    /***4
    Annotation storage
    */

    //function microdrawDBIP() {
    //	/*
    //	Get my IP
    //	*/
    //	if( view.config.debug ) console.log("> microdrawDBIP promise");
    //	$("#regionList").html("<br />Connecting to database...");
    //	return $.get(dbroot,{
    //		"action":"remote_address"
    //	}).success(function(data) {
    //		if( view.config.debug ) console.log("< microdrawDBIP resolve: success");
    //		$("#regionList").html("");
    //		myIP = data;
    //	}).error(function(jqXHR, textStatus, errorThrown) {
    //		console.log("< microdrawDBIP resolve: ERROR, " + textStatus + ", " + errorThrown);
    //		$("#regionList").html("<br />Error: Unable to connect to database.");
    //	});
    //}
          
    this.buildImageUrl = function() {
        return this.config.urlSlides+'/'+this.currentDatasetInfo.folder+'/'+this.currentImage;
    };
    this.loadImage = function(name) {
        if( this.config.debug ) console.log("> loadImage(" + name + ")");
        if (!this.currentDatasetInfo.images[name]) {
            console.log("ERROR: Image not found.");
            return;
        }

        this.clearRegions();
        this.updateCurrentImage(name);
        if (name !== undefined) {
            $.ajax({
                type: 'GET',
                url: this.buildImageUrl(),
                async: true,
                success: function(obj){
                    this.viewer.open(obj); // localhost/name.dzi
                    var viewport = this.viewer.viewport;
                    window.setTimeout(function () {
                       viewport.goHome(true);
                    }, 200 );

                    this.viewer.scalebar({
                        pixelsPerMeter: this.currentImageInfo.pixelsPerMeter
                    });
                }
            }).done(function() {
                if(this.config.debug) console.log("> "+name+" loaded");
                this.highlightCurrentSlide();
            }).fail(function() {
                if(this.config.debug) console.log("> "+name+" failed to load");
            });
        } else {
            if (this.config.debug) console.log("> "+name+" could not be found");
            var viewport = this.viewer.viewport;
            window.setTimeout(function () {
               viewport.goHome(true);
            }, 200 );
        }
    };
    this.loadNextImage = function() {
        if($(document.activeElement).is('textarea')) return;
        if( this.config.debug ) console.log("> loadNextImage");
        var currentImageOrder = this.currentDatasetInfo.imageOrder;
        var index = currentImageOrder.indexOf(this.currentImage);
        var nextIndex = (index + 1) % currentImageOrder.length;

        this.loadImage(currentImageOrder[nextIndex]);
    };
    this.loadPreviousImage = function() {
        if($(document.activeElement).is('textarea')) return;
        if(this.config.debug) console.log("> loadPrevImage");
        var currentImageOrder = this.currentDatasetInfo.imageOrder;
        var index = currentImageOrder.indexOf(this.currentImage);
        var previousIndex = ((index - 1 >= 0)? index - 1 : currentImageOrder.length - 1 );

        this.loadImage(currentImageOrder[previousIndex]);
    };
    this.resizeAnnotationOverlay = function() {
        // if( view.config.debug ) console.log("> resizeAnnotationOverlay");

        var width = $("body").width();
        var height = $("body").height();
        $("canvas.overlay").width(width);
        $("canvas.overlay").height(height);
        paper.view.viewSize = [width, height];
    };
    this.initAnnotationOverlay = function(data) {
        if (this.config.debug) console.log("> initAnnotationOverlay");

        // do not start loading a new annotation if a previous one is still being loaded
        if (this.isAnnotationLoading == true) {
            return;
        }

        // if this is the first time a slice is accessed, create its canvas, its project,
        // and load its regions from the database
        if (this.currentImageInfo.projectID == undefined) {

            // create canvas
            var canvas = $("<canvas class='overlay' id='" + this.currentImage + "'>");
            $("body").append(canvas);

            // create project
            paper.setup(canvas[0]);
            this.currentImageInfo.projectID = paper.project.index;
            // load regions from database
            if (this.config.isSavingEnabled) {
                this.microdrawDBLoad()
                .then(function(){
                    $("#regionList").height($(window).height() - $("#regionList").offset().top);
                    this.updateRegionList();
                    paper.view.draw();
                });
            }

            if (this.config.debug) console.log('Set up new project, currentImage: ' + this.currentImage + ', ID: ' + this.currentImageInfo.projectID);
        }

        // activate the current slice and make it visible
        paper.projects[this.currentImageInfo.projectID].activate();
        paper.project.activeLayer.visible = true;
        $(paper.project.view.element).show();

        // resize the view to the correct size
        var width = $("body").width();
        var height = $("body").height();
        paper.view.viewSize = [width, height];
        paper.settings.handleSize = 10;
        this.updateRegionList();
        paper.view.draw();

        /* RT: commenting this line out solves the image size issues */
        // set size of the current overlay to match the size of the current image
        this.magicV = this.viewer.world.getItemAt(0).getContentSize().x / 100;

        this.transformViewport();
    };
    this.clearRegions = function() {
        if ( this.currentImageInfo &&
             paper.projects[this.currentImageInfo.projectID] ) {
            paper.projects[this.currentImageInfo.projectID].activeLayer.visible = false;
            $(paper.projects[this.currentImageInfo.projectID].view.element).hide();
        }
    };
    this.transformViewport = function() {
        //if( view.config.debug ) console.log("> transform");
        var z = this.viewer.viewport.viewportToImageZoom(this.viewer.viewport.getZoom(true));
        var sw = this.viewer.source.width;
        var bounds = this.viewer.viewport.getBounds(true);
        var x = this.magicV * bounds.x;
        var y = this.magicV * bounds.y;
        var w = this.magicV * bounds.width;
        var h = this.magicV * bounds.height;
        paper.view.setCenter(x + w / 2, y + h / 2);
        paper.view.zoom=(sw * z) / this.magicV;
    };
    this.makeSVGInline = function() {
        if (this.config.debug) console.log("> makeSVGInline promise");

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
                if (this.config.debug) console.log("< makeSVGInline resolve: success");
                def.resolve();
            }, 'xml');
        });

        return def.promise();
    };
    this.updateSliceName = function() {
        if (this.config.debug) console.log("updateslidename:"+this.currentImage);
        $("#slice-name").html(this.currentImage);
        $("title").text("Muscle Annotation | " + this.currentImage);

        // adding setting for diagnosis results for updateSlice
        var cur_diag = 'n/a';
        if ('diag_res' in this.currentImageInfo)
            cur_diag = this.currentImageInfo.diag_res;

        $('#div_conclu').children().each(function(){
            if (cur_diag===$(this).val()) {
                $(this).prop('checked',true);
            } else {
                $(this).prop('checked',false);
            }
        });
    };

    //function loginChanged() {
    //	if( view.config.debug ) console.log("> loginChanged");
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
    //	view.viewer.open(this.imageInfo[view.currentImage]["source"]);
    //}
    //
    //function updateUser() {
    //	if( view.config.debug ) console.log("> updateUser");
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
    
    this.initShortCutHandler = function() {
        $(document).keydown(function(e) {
            var key = [];
            if( e.ctrlKey ) key.push("^");
            if( e.altKey ) key.push("alt");
            if( e.shiftKey ) key.push("shift");
            if( e.metaKey ) key.push("cmd");
            key.push(String.fromCharCode(e.keyCode));
            key = key.join(" ");
            if( this.shortcuts[key] ) {
                var callback = this.shortcuts[key];
                callback();
                if(!$(document.activeElement).is('textarea'))
                    e.preventDefault();
            }
        });
    };
    this.shortCutHandler = function(key, callback) {
        var key = this.config.isMac ? key.mac : key.pc;
        var arr = key.split(" ");
        for (var i = 0; i < arr.length; i++) {
            if( arr[i].charAt(0) == "#" ) {
                arr[i] = String.fromCharCode(parseInt(arr[i].substring(1)));
            } else if (arr[i].length == 1) {
                arr[i] = arr[i].toUpperCase();
            }
        }
        key = arr.join(" ");
        this.shortcuts[key] = callback;
    };
    this.collapseMenu = function() {
        /* hides or displays menu bar */
        if (this.config.debug) console.log("> collapseMenu");

        if ($('#menuPanel').css('display') == 'none') {
            $('#menuPanel').css('display', 'block');
            $('#menuButton').css('display', 'none');
        } else {
            $('#menuPanel').css('display', 'none');
            $('#menuButton').css('display', 'block');
        }
    };
    this.toggleMenu = function() {
        /* hides or displays menu bar */
        if (this.config.debug) console.log("> toggleMenu");

        if ($('#menuRegion').css('display') == 'none') {
            $('#menuRegion').css('display', 'block');
            $('#menuFilmstrip').css('display', 'none');
        } else {
            $('#menuRegion').css('display', 'none');
            $('#menuFilmstrip').css('display', 'block');
        }
    };

    /*************************************************************
        MICRODRAW CORE
     ************************************************************/
    this.microdrawDBSave = function() {
        if (this.config.debug) console.log("> save promise");
        // key
        var key = "regionPaths";
        var value = {};

        for (var slicename in this.currentDatasetInfo.images) {
            var slice = this.currentDatasetInfo.images[slicename];
            if ((this.config.multiImageSave == false) && 
                (slice != this.currentImageInfo)) {
                continue;
            }
            // view.configure value to be saved
            value.regions = [];
            // cycle through regions
            for (var regname in slice.regions) {
                var region = slice.regions[regname];
                var el = {};
                // converted to JSON and then immediately parsed from JSON?
                el.path = JSON.parse(region.path.exportJSON());
                var contour={};
                contour.Points=[];
                // cycle through points on region, converting to image coordinates
                for( var segment in region.path.segments ) {
                    var point = paper.view.projectToView(segment.point);
                    var x = this.imagingHelper.physicalToDataX(point.x);
                    var y = this.imagingHelper.physicalToDataY(point.y);
                    contour.Points.push({"x": x, "y": y});
                }

                el.contour = contour;
                el.uid = region.uid;
                el.name = region.name;
    //			el.mp3name = ($('#rl-'+el.uid).children().length>0)?('region'+el.uid+'.mp3'):'undefined';
                el.mp3name = 'region'+el.uid+'.mp3';
                el.transcript = $('#desp-'+el.uid).val();
                value.regions.push(el);
            }
            var img_diagnosis = $('#selectConclusions').find(":selected").text();
            slice.diag_res = img_diagnosis; // saving diag_res results for all annotation.

            // check if the slice annotations have changed since loaded by computing a hash
            var h = this.hash(JSON.stringify(value.regions)).toString(16);
            if (this.config.debug) console.log("hash:", h, "original hash:", slice.Hash);

            // if the slice hash is undefined, this slice has not yet been loaded. do not save anything for this slice
            if( slice.Hash == undefined || h==slice.Hash ) {
                //if( view.config.debug > 1 ) console.log("No change, no save");
                //value.Hash = h;
                //continue;
            }
            value.Hash = h;

            var formdata = new FormData();
            formdata.append('name', slice.name);
            formdata.append('dataset', this.currentDatasetInfo.folder);
            formdata.append('diagnosis', img_diagnosis);
            formdata.append('info', JSON.stringify(value));
            formdata.append('action', 'save');
            (function(slice, h) {
                if (this.config.debug) console.log("< start post of contours information");
                $.ajax({
                    type: 'POST',
                    url: '/uploadinfo/',
                    data: formdata,
                    processData: false,
                    contentType: false,
                    success: function(result) {
                        slice.Hash = h;
                        if (this.config.debug) console.log("< Save" + result);
                        //show dialog box with timeout
                        if (result === "success")
                            $('#saveDialog').html("Conclusion Saved").fadeIn();
                            setTimeout(function() { $("#saveDialog").fadeOut(500);},2000);
                        if (result === "error")
                            $('#saveDialog').html("Saving Error").fadeIn();
                            setTimeout(function() { $("#saveDialog").fadeOut(500);},2000);
                    },
                    error: function(jqXHR, textStatus, errorThrown) {
                        if (this.config.debug) console.log("< microdrawDBSave resolve: ERROR: " + textStatus + " " + errorThrown,"slice: "+slice.name.toString());
                        //show dialog box with timeout
                        $('#saveDialog').html("Saving Error").fadeIn();
                        setTimeout(function() { $("#saveDialog").fadeOut(500);},2000);
                    }
                });
            })(slice, h);

            if (this.config.debug) console.log("> end of saving contour inforation");
        }
    };
    this.microdrawDBLoad = function() {
        if (this.config.debug) console.log("> microdrawDBLoad promise");

        var	def = $.Deferred();
        var	key = "regionPaths";
        var slice = this.currentImage;

        //=======MODIFY THIS FOR OUR PURPOSE========
        var formdata = new FormData();
        formdata.append('name', this.currentImageInfo.name);
        formdata.append('dataset', this.currentDatasetInfo.folder);
        formdata.append('action', 'load');

        $.ajax({
            type: 'POST',
            url: '/uploadinfo/',
            data: formdata,
            processData: false,
            contentType: false,
            success: function(data) {
                if (this.config.debug) console.log("> got the regions data from the server");
                this.isAnnotationLoading = false;

                // do not display this one and load the current slice.
                if( slice != this.currentImage ) {
                    this.microdrawDBLoad()
                    .then(function() {
                        $("#regionList").height($(window).height()-$("#regionList").offset().top);
                        this.updateRegionList();
                        paper.view.draw();
                    });
                    def.fail();
                    return;
                }
                if (this.config.debug) console.log('[',data,']');
                // if there is no data on the current slice
                // save hash for the image nonetheless
                if (data.length == 0) {
                    this.currentImageInfo.Hash = this.hash(JSON.stringify(this.currentImageInfo.regions)).toString(16);
                    return;
                }

                // parse the data and add to the current canvas
                var obj = data; //JSON.parse(data);

                if (JSON.stringify(obj) != JSON.stringify({})) {
                    if (this.config.debug) console.log("> got the regions data from the server");
                    for (var i = 0; i < obj.regions.length; i++) {
                        var region = {};
                        var	json;
                        region.name = obj.regions[i].name;
                        region.description = obj.regions[i].description;
                        region.uid = obj.regions[i].uid;
                        region.transcript = obj.regions[i].transcript;
                        region.foldername = obj.img_name;
                        json = obj.regions[i].path;
                        region.path = new paper.Path();
                        region.path.importJSON(json);
                        this.newRegion({name: region.name,
                                        path: region.path,
                                        uid: region.uid,
                                        foldername: region.foldername,
                                        description: region.description,
                                        transcript: region.transcript});
                    }

                     // if (view.config.debug) console.log('From db', obj.diag_res );
                     $('#div_conclu').children().each(function(){
                        if (obj.diag_res===$(this).val())
                            $(this).prop('checked',true);
                        else
                            $(this).prop('checked',false);
                     });

                    // saving diag_res for current image, for slider back and forth usage. in Load:
                    this.currentImageInfo.diag_res = obj.diag_res;
                    paper.view.draw();
                    // if image has no hash, save one
                    this.currentImageInfo.Hash = (obj.Hash ? obj.Hash : this.hash(JSON.stringify(this.currentImageInfo.regions)).toString(16));
                }
                if (this.config.debug) console.log("> success. Number of regions: ", this.currentImageInfo.regions.length);

                def.resolve();
            },
            error: function(jqXHR, textStatus, errorThrown) {
                if (this.config.debug) console.log("< microdrawDBLoad resolve ERROR: " + textStatus + " " + errorThrown);
                this.isAnnotationLoading = false;
            }
        });

        return def.promise();
    };
    this.configTools = function() {
        console.log(this);
        /* initializes toolbar buttons, sets default tool, and sets hotkeys */
        if (this.config.debug) console.log("> configTools");

        // Enable click on toolbar buttons
        $("img.button").click(this.toolSelectionHandler);

        // Change current slice by typing in the slice number and pessing the enter key
    //	$("#slice-name").keyup(slice_name_onenter);

        // Configure currently selected tool
        this.setSelectedTool("zoom");

        // Initialize the control key handler and set shortcuts
        this.initShortCutHandler();
        this.shortCutHandler({pc:'^ z',mac:'cmd z'}, this.cmdUndo);
        this.shortCutHandler({pc:'^ y',mac:'cmd y'}, this.cmdRedo);
        if (this.config.isDrawingEnabled ) {
            this.shortCutHandler({pc:'^ x',mac:'cmd x'}, function() { if (this.config.debug) console.log("cut!")});
            this.shortCutHandler({pc:'^ v',mac:'cmd v'}, this.cmdPaste);
            this.shortCutHandler({pc:'^ a',mac:'cmd a'}, function() { if (this.config.debug) console.log("select all!")});
            this.shortCutHandler({pc:'^ c',mac:'cmd c'}, this.cmdCopy);
            this.shortCutHandler({pc:'#46',mac:'#8'}, this.cmdDeleteSelected);  // delete key
        }
        this.shortCutHandler({pc:'#37',mac:'#37'}, this.loadPreviousImage); // left-arrow key
        this.shortCutHandler({pc:'#39',mac:'#39'}, this.loadNextImage);     // right-arrow key

        // Show and hide menu
        if (this.config.hideToolbar) {
            var mouse_position;
            var animating = false;
            $(document).mousemove(function (e) {
                if (animating) {
                    return;
                }
                mouse_position = e.clientX;

                if (mouse_position <= 100) {
                    //SLIDE IN MENU
                    animating = true;
                    $('#menuBar').animate({
                        left: 0,
                        opacity: 1
                    }, 200, function () {
                        animating = false;
                    });
                } else if (mouse_position > 200) {
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
    };
    this.initMicrodraw = function() {
        var def = $.Deferred();
        this.isAnnotationLoading = false;
        this.configTools();
        
        // load config settings from server
        console.log(this);
        if (this.config.debug) console.log("Reading settings from json");
        console.log(this.config);
        $.ajax({
            type: 'GET',
            url: this.config.urlSlides,
            dataType: "json",
            contentType: "application/json",
            success: function(obj){
                console.log(this);
                this.imageInfo = obj;
                this.initOpenSeadragon(obj);    // load database data from server
                this.initDatasets();
                this.initRegionsMenu();
                this.initFilmstrip();
                def.resolve();
            }.bind(this)
        });

        // resize window to fit display
        $(window).resize(function() {
            $("#regionList").height($(window).height() - $("#regionList").offset().top);
            this.resizeAnnotationOverlay();
        });
        return def.promise();
    };
    // NOT USED
    this.loadSlideData = function() {
        /* load config settings from server */
        var def = $.Deferred();
        if (this.config.debug)	console.log("> loadSlideData");
        $.ajax({
            type: 'GET',
            url: this.config.urlSlides,
            dataType: "json",
            contentType: "application/json",
            success: function(obj){
                if(this.config.debug) console.log(obj);
                this.imageInfo = obj;
                def.resolve();
            }
        });
        return def.promise();
    };
    this.initOpenSeadragon = function(obj) {
        // create OpenSeadragon viewer
        if (this.config.debug) console.log("> initOpenSeadragon");

        // set default values for new regions (general configuration)
        if (this.config.defaultStrokeColor == undefined) this.config.defaultStrokeColor = 'black';
        if (this.config.defaultStrokeWidth == undefined) this.config.defaultStrokeWidth = 1;
        if (this.config.defaultFillAlpha == undefined) this.config.defaultFillAlpha = 0.5;
        // set default values for new regions (per-brain configuration)
        if (obj.configuration) {
            if (obj.configuration.defaultStrokeColor != undefined) this.config.defaultStrokeColor = obj.configuration.defaultStrokeColor;
            if (obj.configuration.defaultStrokeWidth != undefined) this.config.defaultStrokeWidth = obj.configuration.defaultStrokeWidth;
            if (obj.configuration.defaultFillAlpha != undefined) this.config.defaultFillAlpha = obj.configuration.defaultFillAlpha;
        }

        this.viewer = OpenSeadragon({
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
        this.imagingHelper = this.viewer.activateImagingHelper({});

        // add the scalebar
        this.viewer.scalebar({
            type: OpenSeadragon.ScalebarType.MICROSCOPE,
            minWidth:'150px',
            pixelsPerMeter: this.config.pixelsPerMeter,
            color:'black',
            fontColor:'black',
            backgroundColor:"rgba(255,255,255,0.5)",
            barThickness:4,
            location: OpenSeadragon.ScalebarLocation.TOP_RIGHT,
            xOffset:5,
            yOffset:5
        });

        // add handlers: update slice name, animation, page change, mouse actions
        this.viewer.addHandler('open',function(){
            this.initAnnotationOverlay();
            this.updateSliceName();
        });
        this.viewer.addHandler('animation', function(event){
            this.transformViewport();
        });
        this.viewer.addHandler("page", function (data) {
            if (this.config.debug) console.log(data.page, this.config.tileSources[data.page]);
        });
        this.viewer.addViewerInputHook({hooks: [
            {tracker: 'viewer', handler: 'clickHandler', hookHandler: clickHandler},
            {tracker: 'viewer', handler: 'pressHandler', hookHandler: pressHandler},
            {tracker: 'viewer', handler: 'dragHandler', hookHandler: dragHandler},
            {tracker: 'viewer', handler: 'dragEndHandler', hookHandler: dragEndHandler}
        ]});
    };
    this.initRegionsMenu = function() {
        /* initializes regions menu */
        if (this.config.debug) console.log("> initRegionsMenu");

    //    $("#regionList").click(singlePressOnRegion);
    //    $("#regionList").click(doublePressOnRegion);
        $("#regionList").click(this.handleRegionTap);
    };
    this.initFilmstrip = function() {
        /* initializes filmstrip menu */
        if (this.config.debug) console.log("> initFilmstrip");
    //    $("#menuFilmstrip").click(onClickSlide);
        document.querySelector("#menuFilmstrip").addEventListener("click", this.onClickSlide, false);
    };
    this.initDatasets = function() {
        /* updates the contents of "selectDataset" */
        // getJSON automatically parses the response
        if (this.config.debug) console.log("> initDatasets");

    //    $.getJSON(view.config.urlDatasets, {}, function(data) {
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
    //        for (var set in this.imageInfo["datasets"]) {
    //            $("#selectDataset").append("<option value='"+set+"'>"+set+"</option>");
    //        }
    //        switchDataset(Object.keys(this.imageInfo["datasets"])[0]);
    //        
    //        $("#selectDataset").change(switchDataset);
    //    });

        $("#selectDataset").empty();
        for (var dataset in this.imageInfo["datasets"]) {
            $("#selectDataset").append("<option value='"+dataset+"'>"+dataset+"</option>");
        }
        this.switchDataset();

        $("#selectDataset").change(this.switchDataset);
    };
    this.switchDataset = function() {
        /* callback to update conclusions when dataset selector is changed */
        if (this.config.debug) console.log("> switchDataset");

        this.currentDataset = $("#selectDataset").val()
        this.currentDatasetInfo = this.imageInfo.datasets[this.currentDataset];
        var firstImage = Object.keys(this.currentDatasetInfo.images)[0];
        this.loadImage(firstImage);
        this.updateConclusions(this.currentDatasetInfo.conclusions);
        this.updateFilmstrip();
        this.highlightCurrentSlide();
        this.resetAudio();
    };
    this.updateFilmstrip = function() {
        /* updates the filmstrip panel with thumbnails from the current dataset */	
        if (this.config.debug) console.log("> updateFilmstrip");

        $("#menuFilmstrip").empty();
        if (this.imageInfo.length === 0) {
            $("#menuFilmstrip").append(
                "<div class='cell slide'> \
                    <span class='caption' style='color: rgb(255,100,100);'>Directory is empty</span> \
                </div>"
            );
            return;
        }
        var selected = '';
    //    for ( var name in this.imageInfo) {
    //        $("#menuFilmstrip").append(
    //            "<div id='"+name+"' class='cell slide'> \
    //                <img src="+"data:image/png;base64,"+this.imageInfo[name]['thumbnail']+" /> \
    //                <span class='caption'>"+name+"</span> \
    //            </div>"
    //        );
    //    }
        for (var name in this.currentDatasetInfo.images) {
            $("#menuFilmstrip").append(
                "<div id='"+name+"' class='cell slide'> \
                    <img src='"+this.currentDatasetInfo.images[name].thumbnail+"' /> \
                    <span class='caption'>"+name+"</span> \
                </div>"
            );
        }
    };
    this.highlightCurrentSlide = function() {
        $(".slide").removeClass("selected");
        $(".slide").each(function() {
            if ($(this).children(".caption").html() == this.currentImage) {
                $(this).addClass("selected");
            }
        });
    };
    this.updateConclusions = function(conclusions) {
        /* updates the contents of conclusion selector */
        if (this.config.debug) console.log("> updateConclusions");

        $("#selectConclusions").empty();
        for (var i = 0; i < conclusions.length; i++) {
            $("#selectConclusions").append("<option value='"+conclusions[i]+"'>"+conclusions[i]+"</option>");
        }
    };
    this.onClickSlide = function(e) {
        // event handlers run from bottom (clicked element) to top of the DOM.
        // e.currentTarget is the object that the handler was attached to.
        // e.target is the element that was clicked.
        if (this.config.debug) console.log("> onClickSlide");

        if (e.target !== e.currentTarget) {
            if ($(e.target).hasClass('slide')) {
                var imgName = e.target.id;
                this.loadImage(imgName);
            } else {
                var imgName = e.target.parentNode.id;
                this.loadImage(imgName);
            }
        }
        // stops searching once we reach the element that called the event
        e.stopPropagation();
    };
    this.segmentation = function() {
        var formdata = new FormData();
        formdata.append('imageidx', this.currentImage);
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
    };
    
    /************************************************************
        AUDIO
    ************************************************************/
    this.setAudio = function(region) {
        $("#menuAudioPlayer").attr("src", region.audio);
        $("#region-msg").html(region.name);
        $("#audioPanel").removeClass("inactive");
    };
    this.resetAudio = function() {
        $("#menuAudioPlayer").attr("src", "");
        $("#region-msg").html("No region selected");
        $("#audioPanel").addClass("inactive");
    };
    
    /************************************************************
        CONFIGURATION
    ************************************************************/
    this.loadConfiguration = function() {
        var def = $.Deferred();
        $.getJSON("/static/config/configuration.json", function(data) {
            this.config = data;
            
            if (this.config.debug) console.log("> loadConfiguration");

            var drawingTools = ["select", "draw", "draw-polygon", "simplify", "addpoint",
            "delpoint", "addregion", "delregion", "splitregion", "rotate",
            "save", "copy", "paste", "delete"];
            if (this.config.isDrawingEnabled == false) {
                // remove drawing tools from ui
                for (var i = 0; i < drawingTools.length; i++){
                    $("#" + drawingTools[i]).remove();
                }
            }
            for (var i = 0; i < this.config.disabledTools.length; i++) {
                $("#" + this.config.disabledTools[i]).remove();
            }
            if (this.config.isSavingEnabled == false) {
                $("#save").remove();
            }
            
            this.config.isMac = navigator.platform.match(/Mac/i)?true:false;
            this.config.isIOS = navigator.platform.match(/(iPhone|iPod|iPad)/i)?true:false;
            
            def.resolve();
        }.bind(this));
        
        return def.promise();
    };
    
    
	$.when(
		this.loadConfiguration()
	).then(this.initMicrodraw());
};

$(function() {
    scopal = new Scopal();
//	$.when(
//		scopal.loadConfiguration()
//	).then(scopal.initMicrodraw());
});
