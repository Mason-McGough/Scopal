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
var scopal = (function() {
    var imageInfo = {};
    var config = {};
    var viewer = undefined;
    var magicV = 1000;
    var imagingHelper = undefined;
    var prevImage = undefined;
    var currentImage = undefined;
    var currentImageInfo = undefined;
    var currentDataset = undefined;
    var currentDatasetInfo = undefined;
    var currentRegion = null;
    var currentColorRegion = undefined;
    var prevRegion = null;
    var copyRegion = null;
    var currentHandle = undefined;
    var selectedTool = undefined;
    var navEnabled = true;
    var mouseUndo = undefined;
    var undoStack = [];
    var redoStack = [];
    var shortcuts = [];
    var isDrawingRegion = false;
    var isDrawingPolygon = false;
    var isAnnotationLoading = false;
    var isTapDevice = false;
    
    /****************************************************************
        UNDO/REDO
    ****************************************************************/
    function cmdUndo() {
        if( view.undoStack.length > 0 ) {
            var redoInfo = getUndo();
            var undoInfo = undoStack.pop();
            applyUndo(undoInfo);
            redoStack.push(redoInfo);
            paper.view.draw();
        }
    };
    function cmdRedo() {
        if( view.redoStack.length > 0 ) {
            var undoInfo = getUndo();
            var redoInfo = redoStack.pop();
            applyUndo(redoInfo);
            undoStack.push(undoInfo);
            paper.view.draw();
        }
    };
    function getUndo() {
        var undo = {imageNumber: currentImage, 
                    regions: [], 
                    isDrawingPolygon: isDrawingPolygon};
        var info = currentImageInfo.regions;

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
    function saveUndo(undoInfo) {
        undoStack.push(undoInfo);
        redoStack = [];
    };
    function setImage(imageNumber) {
        if( view.config.debug ) console.log("> setImage");
        var index = view.currentDatasetInfo.imageOrder.indexOf(imageNumber);

        loadImage(view.currentDatasetInfo.imageOrder[index]);
    };
    function applyUndo(undo) {
    	if( undo.imageNumber !== view.currentImage )
        setImage(undo.imageNumber);
        var info = imageInfo[undo.imageNumber].regions;
        while( info.length > 0 )
        removeRegion(info[0]);
        currentRegion = null;
        for( var i = 0; i < undo.regions.length; i++ ) {
            var el = undo.regions[i];
            var project = paper.projects[imageInfo[undo.imageNumber].projectID];
            /* Create the path and add it to a specific project.
            */
            var path = new paper.Path();
            project.addChild(path);
            path.importJSON(el.json);
            var region = newRegion({name:el.name, path:path}, undo.imageNumber);
            // here order matters. if fully selected is set after selected, partially selected paths will be incorrect
            region.path.fullySelected = el.fullySelected;
            region.path.selected = el.selected;
            if( el.selected ) {
                if( currentRegion === null ) {
                    currentRegion = region;
                } else {
                    console.log("Should not happen: two regions selected?");
                }
            }
        }
        isDrawingPolygon = undo.isDrawingPolygon;
    };
    function commitMouseUndo() {
        if( mouseUndo !== undefined ) {
            saveUndo(mouseUndo);
            mouseUndo = undefined;
        }
    };
    
    /****************************************************************
        REGIONS
    ****************************************************************/
    function newRegion(arg, imageNumber) {
        /* called whenever a new region is created */
         if( config.debug ) console.log("> newRegion");

        // define region properties
        var region = {};
        region.uid = regionUniqueID();
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
        var color = regionHashColor(region.name);
        if( arg.path ) {
            region.path = arg.path;
            region.path.strokeWidth = arg.path.strokeWidth ? arg.path.strokeWidth : config.defaultStrokeWidth;
            region.path.strokeColor = arg.path.strokeColor ? arg.path.strokeColor : config.defaultStrokeColor;
            region.path.strokeScaling = false;
            region.path.fillColor = arg.path.fillColor ? arg.path.fillColor :'rgba('+color.red+','+color.green+','+color.blue+','+config.defaultFillAlpha+')';
            region.path.selected = false;
        }

        if( imageNumber === undefined ) {
            imageNumber = currentImage;
        }
        if( imageNumber === currentImage ) {
            // append region tag to regionList
            $("#regionList").append($(regionTag(region.name, region.uid)));
        }

        // set audio file
        region.audio = 'static/audio/'+currentDatasetInfo.folder+'/'+currentImageInfo.name+'/'+'region'+region.uid+'.mp3';
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
        currentImageInfo.regions.push(region);
        return region;
    };
    function removeRegion(region) {
        if( config.debug ) console.log("> removeRegion");

        // remove from Regions array
        //	imageInfo[imageNumber]["Regions"].splice(imageInfo[imageNumber]["Regions"].indexOf(reg),1);
        currentImageInfo.regions.splice(currentImageInfo.regions.indexOf(region), 1);
        // remove from paths
        region.path.remove();
        var	tag = $("#regionList > .region-tag#" + region.uid);
        $(tag).remove();
        resetAudio();
    };
    function selectRegion(region) {
        if( config.debug ) console.log("> selectRegion");
        
        setAudio(region);
        highlightRegion(region);
        if (!region) {
            return;
        }
        
        var i;
        // Select path
        for( i = 0; i < currentImageInfo.regions.length; i++ ) {
            var region_id = currentImageInfo.regions[i].uid;
            if( currentImageInfo.regions[i] == region ) {
                region.path.selected = true;
                region.path.fullySelected = true;
                currentRegion = region;
                $("#desp-"+region_id).show();
            } else {
                currentImageInfo.regions[i].path.selected = false;
                currentImageInfo.regions[i].path.fullySelected = false;
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
    };
    function findRegionByUID(uid) {
        if( config.debug ) console.log("> findRegionByUID");
        if( config.debug > 2 ) console.log( "look for uid: " + uid);
        if( config.debug > 2 ) console.log( "region array length: " + currentImage.regions.length );

        for(var i = 0; i < currentImageInfo.regions.length; i++) {

            if( currentImageInfo.regions[i].uid == uid ) {
                if(config.debug > 2) console.log("region " + currentImageInfo.regions[i].uid + ": " );
                if(config.debug > 2) console.log(currentImageInfo.regions[i]);
                return currentImageInfo.regions[i];
            }
        }
        console.log("Region with unique ID "+uid+" not found");
        return null;
    };
    function findRegionByName(name) {
        if(config.debug) console.log("> findRegionByName");

        for(var i = 0; i < currentImageInfo.regions.length; i++ ) {
            if( currentImageInfo.regions[i].name == name ) {
                return currentImageInfo.regions[i];
            }
        }
        console.log("Region with name " + name + " not found");
        return null;
    };
    function regionUniqueID() {
        if( config.debug ) console.log("> regionUniqueID");

        var found = false;
        var counter = 1;
        while( found == false ) {
            found = true;
            for( var i = 0; i < currentImageInfo.regions.length; i++ ) {
                if( currentImageInfo.regions[i].uid == counter ) {
                    counter++;
                    found = false;
                    break;
                }
            }
        }
        return counter;
    };
    function hash(inputString) {
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
        if(config.debug) console.log("> regionHashColor");

        var color = {};
        var h = hash(name);

        // add some randomness
        h = Math.sin(h++)*10000;
        h = 0xffffff*(h-Math.floor(h));

        color.red = h&0xff;
        color.green = (h&0xff00)>>8;
        color.blue = (h&0xff0000)>>16;
        return color;
    };
    function regionTag(name, uid) {
        if( config.debug ) console.log("> regionTag");

        var str;
        var color;
        if (uid) {
            var region = findRegionByUID(uid);
            var mult = 1.0;
            if (region) {
                mult = 255;
                color = region.path.fillColor;
            } else {
                color = regionHashColor(name);
            }

            str = "<div class='region-tag' id='"+uid+"' style='padding:3px 3px 0px 3px'> \
            <img class='eye' title='Region visible' id='eye_"+uid+"' \
            src='../static/img/eyeOpened.svg' /> \
            <div class='region-color' \
            style='background-color:rgba("+
                parseInt(color.red*mult)+","+parseInt(color.green*mult)+","+parseInt(color.blue*mult)+",0.67)'></div> \
            <span class='region-name'>"+name+"</span> \
            <textarea id='desp-"+uid+"' rows='5' wrap='soft' style='display:none'> \
            </textarea></div>"
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
    };
    function changeRegionName(region, name) {
        if( config.debug ) console.log("> changeRegionName");

        var color = regionHashColor(name);
        region.name = name;
        region.path.fillColor = 'rgba('+color.red+','+
                                      color.green+','+
                                      color.blue+',0.5)';
        paper.view.draw();

        // Update region tag
        $(".region-tag#" + region.uid + ">.region-name").text(name);
        $(".region-tag#" + region.uid + ">.region-color").css('background-color','rgba('+color.red+','+color.green+','+color.blue+',0.67)');
        setAudio(region);
    };
    function toggleRegion(region) {
        if( currentRegion !== null ) {
            if( config.debug ) console.log("> toggle region");

            var color = regionHashColor(region.name);
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
    function updateRegionList() {
        if( config.debug ) console.log("> updateRegionList");

        // remove all entries in the regionList
        $("#regionList > .region-tag").each(function() {
            $(this).remove();
        });

        //var def = $.Deferred();
        // adding entries corresponding to the currentImage
        for( var i = 0; i < currentImageInfo.regions.length; i++ ) {

            var region = currentImageInfo.regions[i];
            if( config.debug ) console.log("> restoring region..", region.uid);
            $("#regionList").append($(regionTag(region.name, region.uid)));

            // add the transcript
            if(region.transcript!=undefined || region.transcript!="undefined")
            {
                $("#desp-"+region.uid).val(region.transcript);
            }
        }
        //return def.promise();
    };
    function encode64alt(buffer) {
        var binary = '',
        bytes = new Uint8Array( buffer ),
        len = bytes.byteLength;
        for (var i = 0; i < len; i++) {
            binary += String.fromCharCode( bytes[ i ] );
        }
        return window.btoa( binary );
    };
    function checkRegionSize(region) {
        if( region.path.length > 3 ) {
            selectRegion(region);
            return;
        }
        else {
            removeRegion(currentRegion);
        }
    };
    function simplifyRegion() {
        /* calls simplify method of region path to resample the contour */
        if( currentRegion !== null ) {
            if( config.debug ) console.log("> simplifying region path");

            var orig_segments = currentRegion.path.segments.length;
            currentRegion.path.simplify();
            var final_segments = currentRegion.path.segments.length;
            console.log( parseInt(final_segments/orig_segments*100) + "% segments conserved" );
            paper.view.draw();
        }
    };
    function flipRegion(region) {
        /* flip region along y-axis around its center point */
        if( currentRegion !== null ) {
            if( config.debug ) console.log("> flipping region");

            for( var i in currentImageInfo.regions ) {
                if( currentImageInfo.regions[i].path.selected ) {
                    currentImageInfo.regions[i].path.scale(-1, 1);
                }
            }
            paper.view.draw();
        }
    };
    
    /*****************************************************************************
    EVENT HANDLERS
    *****************************************************************************/
    function clickHandler(event) {
        if( config.debug ) console.log("> clickHandler");

        event.stopHandlers = !navEnabled;
        if( selectedTool == "draw" ) {
            checkRegionSize(currentRegion);
        }
    };
    function pressHandler(event) {
        if( config.debug ) console.log("> pressHandler");

        if( !navEnabled ) {
            event.stopHandlers = true;
            mouseDown(event.originalEvent.layerX, event.originalEvent.layerY);
        }
    };
    function dragHandler(event) {
        if( config.debug > 1 )	console.log("> dragHandler");

        if( !navEnabled ) {
            event.stopHandlers = true;
            mouseDrag(event.originalEvent.layerX,
                           event.originalEvent.layerY,
                           event.delta.x,
                           event.delta.y);
        }
    };
    function dragEndHandler(event) {
        if( config.debug ) console.log("> dragEndHandler");

        if( !navEnabled ) {
            event.stopHandlers = true;
            mouseUp();
        }
    };
    function singlePressOnRegion(event) {
        if( config.debug ) console.log("> singlePressOnRegion");

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
                region = findRegionByUID(regionId);
                toggleRegion(region);
            } else if( event.clientX > 20 ) {
                if( event.clientX > 50 ) {
                    // Click on regionList (list or annotated regions)
                    region = findRegionByUID(regionId);
                    if( region ) {
                        selectRegion(region);
                    } else {
                        console.log("region undefined");
                    }
                } else {
                    region = findRegionByUID(regionId);
                    if( region.path.fillColor != null ) {
                        if( region ) {
                            selectRegion(region);
                        }
                    }
                }
            }
    //        else {
    //            var reg = findRegionByUID(id);
    //            toggleRegion(reg);
    //        }
        }
        event.stopPropagation();
    };
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
                        var name = prompt("Region name",
                                          findRegionByUID(regionId).name);
                        if( name != null ) {
                            changeRegionName(findRegionByUID(regionId), 
                                                  name);
                        }
                    }
                } else {
                    var region = findRegionByUID(regionId);
                    if( region.path.fillColor != null ) {
                        if( region ) {
                            selectRegion(region);
                        }
                        highlightRegion(region);
                    }
                }
            } else {
                var reg = findRegionByUID(regionId);
                toggleRegion(region);
            }
        }
        event.stopPropagation();
    };
    function handleRegionTap(event) {
        /* Handles single and double tap in touch devices */
        if( config.debug ) console.log("> handleRegionTap");

        if( !isTapDevice ){ //if tap is not set, set up single tap
            isTapDevice = setTimeout(function() {
                isTapDevice = null;
            }, 300);

            // call singlePressOnRegion(event) using 'this' as context
            singlePressOnRegion.call(this, event);
        } else {
            clearTimeout(isTapDevice);
            isTapDevice = null;

            // call doublePressOnRegion(event) using 'this' as context
            doublePressOnRegion.call(this, event);
        }
        if( config.debug ) console.log("< handleRegionTap");
    };
    function mouseDown(x,y) {
        if( config.debug > 1 ) console.log("> mouseDown");

        mouseUndo = getUndo();
        var point = paper.view.viewToProject(new paper.Point(x,y));

        currentHandle = null;

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

                isDrawingRegion = false;
                if( hitResult ) {
                    for( var i = 0; i < currentImageInfo.regions.length; i++ ) {
                        if( currentImageInfo.regions[i].path == hitResult.item ) {
                            region = currentImageInfo.regions[i];
                            break;
                        }
                    }

                    // select path
                    if( currentRegion && currentRegion != region ) {
                        currentRegion.path.selected = false;
                        prevRegion = currentRegion;
                    }
                    selectRegion(region);

                    if( hitResult.type == 'handle-in' ) {
                        currentHandle = hitResult.segment.handleIn;
                        currentHandle.point = point;
                    } else if( hitResult.type == 'handle-out' ) {
                        currentHandle = hitResult.segment.handleOut;
                        currentHandle.point = point;
                    } else if( hitResult.type == 'segment' ) {
                        if( selectedTool == "select" ) {
                            currentHandle = hitResult.segment.point;
                            currentHandle.point = point;
                        }
                        if( selectedTool == "delpoint" ) {
                            hitResult.segment.remove();
                            commitMouseUndo();
                        }
                    } else if( hitResult.type == 'stroke' && selectedTool == "addpoint" ) {
                        currentRegion.path
                            .curves[hitResult.location.index]
                            .divide(hitResult.location);
                        currentRegion.path.fullySelected = true;
                        commitMouseUndo();
                        paper.view.draw();
                    } else if( selectedTool == "addregion" ) {
                        if( prevRegion ) {
                            var newPath = currentRegion.path.unite(prevRegion.path);
                            removeRegion(prevRegion);
                            currentRegion.path.remove();
                            currentRegion.path = newPath;
                            updateRegionList();
                            selectRegion(currentRegion);
                            paper.view.draw();
                            commitMouseUndo();
                            backToSelect();
                        }
                    } else if( selectedTool == "delregion" ) {
                        if( prevRegion ) {
                            var newPath = prevRegion.path.subtract(
                                                currentRegion.path);
                            removeRegion(prevRegion);
                            prevRegion.path.remove();
                            newRegion({path:newPath});
                            updateRegionList();
                            selectRegion(currentRegion);
                            paper.view.draw();
                            commitMouseUndo();
                            backToSelect();
                        }
                    } else if( selectedTool == "splitregion" ) {
                        /*selected region is prevRegion!
                        region is the region that should be split based on prevRegion
                        newRegionPath is outlining that part of region which has not been overlaid by prevRegion
                        i.e. newRegion is what was region
                        and prevRegion color should go to the other part*/
                        if( prevRegion ) {
                            var prevColor = prevRegion.path.fillColor;
                            //color of the overlaid part
                            var color = currentRegion.path.fillColor;
                            var newPath = currentRegion.path.divide(
                                                prevRegion.path);
                            removeRegion(prevRegion);
                            currentRegion.path.remove();
                            currentRegion.path = newPath;
                            var region;
                            for( i = 0; i < newPath._children.length; i++ )
                            {
                                if( i == 0 ) {
                                    currentRegion.path = newPath._children[i];
                                }
                                else {
                                    region = newRegion({path:newPath._children[i]});
                                }
                            }
                            currentRegion.path.fillColor = color;
                            if( region ) {
                                region.path.fillColor = prevColor;
                            }
                            updateRegionList();
                            selectRegion(currentRegion);
                            paper.view.draw();

                            commitMouseUndo();
                            backToSelect();
                        }
                    }
                    break;
                }
                if( hitResult == null && currentRegion ) {
                    //deselect paths
                    currentRegion.path.selected = false;
                    currentRegion = null;
                    resetAudio();
                }
                break;
            }
            case "draw": {
                // Start a new region
                // if there was an older region selected, unselect it
                if( currentRegion ) {
                    currentRegion.path.selected = false;
                }
                // start a new region
                var path = new paper.Path({segments:[point]})
                path.strokeWidth = config.defaultStrokeWidth;
                currentRegion = newRegion({path:path});
                // signal that a new region has been created for drawing
                isDrawingRegion = true;

                commitMouseUndo();
                break;
            }
            case "draw-polygon": {
                // is already drawing a polygon or not?
                if( isDrawingPolygon == false ) {
                    // deselect previously selected region
                    if( currentRegion )
                    currentRegion.path.selected = false;

                    // Start a new Region with alpha 0
                    var path = new paper.Path({segments:[point]})
                    path.strokeWidth = config.defaultStrokeWidth;
                    currentRegion = newRegion({path:path});
                    currentRegion.path.fillColor.alpha = 0;
                    currentRegion.path.selected = true;
                    isDrawingPolygon = true;
                    commitMouseUndo();
                } else {
                    var hitResult = paper.project.hitTest(point, {tolerance:10, segments:true});
                    if(hitResult && 
                       hitResult.item == currentRegion.path && 
                       hitResult.segment.point == currentRegion.path.segments[0].point) {
                        // clicked on first point of current path
                        // --> close path and remove drawing flag
                        finishDrawingPolygon(true);
                    } else {
                        // add point to region
                        currentRegion.path.add(point);
                        commitMouseUndo();
                    }
                }
                break;
            }
            case "rotate":
            currentRegion.origin = point;
            break;
        }
        paper.view.draw();
    };
    function mouseDrag(x, y, dx, dy) {
        if( config.debug ) console.log("> mouseDrag");

        // transform screen coordinate into world coordinate
        var point = paper.view.viewToProject(new paper.Point(x,y));

        // transform screen delta into world delta
        var orig = paper.view.viewToProject(new paper.Point(0,0));
        var dpoint = paper.view.viewToProject(new paper.Point(dx,dy));
        dpoint.x -= orig.x;
        dpoint.y -= orig.y;

        if( currentHandle ) {
            currentHandle.x += point.x-currentHandle.point.x;
            currentHandle.y += point.y-currentHandle.point.y;
            currentHandle.point = point;
            commitMouseUndo();
        } else if( selectedTool == "draw" ) {
            currentRegion.path.add(point);
        } else if( selectedTool == "select" ) {
            // event.stopHandlers = true;
            for( var i in currentImageInfo.regions ) {
                var region = currentImageInfo.regions[i];
                if( region.path.selected ) {
                    region.path.position.x += dpoint.x;
                    region.path.position.y += dpoint.y;
                    commitMouseUndo();
                }
            }
        } if(selectedTool == "rotate") {
            event.stopHandlers = true;
            var degree = parseInt(dpoint.x);
            for( var i in currentImageInfo.regions ) {
                if( currentImageInfo.regions[i].path.selected ) {
                    currentImageInfo.Regions[i].path.rotate(degree, currentRegion.origin);
                    commitMouseUndo();
                }
            }
        }
        paper.view.draw();
    };
    function mouseUp() {
        if( config.debug ) console.log("> mouseUp");

        if( isDrawingRegion == true ) {
            currentRegion.path.closed = true;
            currentRegion.path.fullySelected = true;
            // to delete all unnecessary segments while preserving the form of the region to make it modifiable; & adding handles to the segments
            var orig_segments = currentRegion.path.segments.length;
            currentRegion.path.simplify(0.02);
            var final_segments = currentRegion.path.segments.length;
            if( config.debug > 2 ) console.log( parseInt(final_segments/orig_segments*100) + "% segments conserved" );
        }
        paper.view.draw();
    };
    function toggleHandles() {
        if(config.debug) console.log("> toggleHandles");
        if (currentRegion != null) {
            if (currentRegion.path.hasHandles()) {
                if (confirm('Do you really want to remove the handles?')) {
                    var undoInfo = getUndo();
                    currentRegion.path.clearHandles();
                    saveUndo(undoInfo);
                }
            } else {
                var undoInfo = getUndo();
                currentRegion.path.smooth();
                saveUndo(undoInfo);
            }
            paper.view.draw();
        }
    };
    function onClickSlide(e) {
        // event handlers run from bottom (clicked element) to top of the DOM.
        // e.currentTarget is the object that the handler was attached to.
        // e.target is the element that was clicked.
        if (config.debug) console.log("> onClickSlide");

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
    };
    function toolSelectionHandler(event) {
        if( config.debug ) console.log("> toolSelection");

        //end drawing of polygons and make open form
        if (isDrawingPolygon == true) {finishDrawingPolygon(true);}
        setSelectedTool($(this).attr("id"));

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
                currentHandle = null;
                break;
            case "delete":
                cmdDeleteSelected();
                backToPreviousTool();
                break;
            case "save":
                microdrawDBSave();
                backToPreviousTool();
                break;
            case "zoom-in":
            case "zoom-out":
            case "home":
                backToPreviousTool();
                break;
            case "prev":
                loadPreviousImage();
                backToPreviousTool();
                break;
            case "next":
                loadNextImage();
                backToPreviousTool();
                break;
            case "copy":
                cmdCopy();
                backToSelect();
                break;
            case "paste":
                cmdPaste();
                backToSelect();
                break;
            case "simplify":
                simplifyRegion();
                backToSelect();
                break;
            case "flip":
                flipRegion(currentRegion);
                backToSelect();
                break;
            case "closeMenu":
                collapseMenu();
                backToPreviousTool();
                break;
            case "openMenu":
                collapseMenu();
                backToPreviousTool();
                break;
            case "toggleMenu":
                toggleMenu();
                backToPreviousTool();
                break;
            case "handle":
                toggleHandles();
                backToPreviousTool();
                break;
            case "segment":
                segmentRegion();
                backToPreviousTool();
                break;
        }
    };
    
    /*****************************************************************************
        ANNOTATION STYLE
     *****************************************************************************/
    function padZerosToString(number, length) {
        /* add leading zeros to (string)number */
        var str = '' + number;
        while( str.length < length ) {str = '0' + str;}
        return str;
    };
    function getHexColor(region) {
        return '#' + 
            padZerosToString((parseInt(region.path.fillColor.red * 255))
                                  .toString(16),2) + 
            padZerosToString((parseInt(region.path.fillColor.green * 255))
                                  .toString(16),2) + 
            padZerosToString((parseInt(region.path.fillColor.blue * 255))
                                  .toString(16),2);
    };
    function highlightRegion(region) {
        /* get current alpha & color values for colorPicker display */
        if( config.debug ) console.log(region.path.fillColor);

        if( region !== null ) {
            if( config.debug ) console.log("> changing annotation style");

            currentColorRegion = region;
            var alpha = region.path.fillColor.alpha;
            $('#alphaSlider').val(alpha*100);
            $('#alphaFill').val(parseInt(alpha*100));

            var hexColor = getHexColor(region);
            if( config.debug ) console.log(hexColor);

            $('#fillColorPicker').val(hexColor);

            if ($('#colorSelector').css('display') == 'none') {
                $('#colorSelector').css('display', 'block');
            } else {
                $('#colorSelector').css('display', 'none');
            }
        }
    };
    // NOT USED
    function setRegionColor() {
        /* set picked color & alpha */
        var region = currentColorRegion;
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
    function onFillColorPicker(value) {
        /* update all values on the fly */
        $('#fillColorPicker').val(value);
        var region = currentColorRegion;
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
    function onSelectStrokeColor() {
        var region = currentColorRegion;
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
    function onAlphaSlider(value) {
        $('#alphaFill').val(value);
        var region = currentColorRegion;
        region.path.fillColor.alpha = $('#alphaSlider').val() / 100;
        paper.view.draw();
    };
    function onAlphaInput(value) {
        $('#alphaSlider').val(value);
        var region = currentColorRegion;
        region.path.fillColor.alpha = $('#alphaSlider').val() / 100;
        paper.view.draw();
    };
    // NOT USED
    function onStrokeWidthDec() {
        var region = currentColorRegion;
        region.path.strokeWidth = Math.max(currentRegion.path.strokeWidth - 1, 1);
        paper.view.draw();
    };
    // NOT USED
    function onStrokeWidthInc() {
        var region = currentColorRegion;
        path.strokeWidth = Math.min(currentRegion.path.strokeWidth + 1, 10);
        paper.view.draw();
    };

    function finishDrawingPolygon(closed) {
        // finished the drawing of the polygon
        if( closed == true ) {
            currentRegion.path.closed = true;
            currentRegion.path.fillColor.alpha = config.defaultFillAlpha;
        } else {
            currentRegion.path.fillColor.alpha = 0;
        }
        currentRegion.path.fullySelected = true;
        //currentRegion.path.smooth();
        isDrawingPolygon = false;
        commitMouseUndo();
    }
    function backToPreviousTool() {
        setTimeout(function() {
            setSelectedTool(prevTool);
        },500);
    };
    function backToSelect() {
        setTimeout(function() {
            setSelectedTool("select");
        },500);
    };
    function cmdDeleteSelected() {
        if($(document.activeElement).is('textarea')) return;

        var undoInfo = getUndo();
        removeRegion(currentRegion);
        saveUndo(undoInfo);
    };

    function cmdPaste() {
        if(copyRegion !== null) {
            var undoInfo = getUndo();
            saveUndo(undoInfo);
            console.log( "paste " + copyRegion.name );
            if (findRegionByName(copyRegion.name)) {
                copyRegion.name += " Copy";
            }
            var reg = JSON.parse(JSON.stringify(copyRegion));
            region.path = new paper.Path();
            region.path.importJSON(copyRegion.path);
            region.path.fullySelected = true;
            var color = regionHashColor(region.name);
            reg.path.fillColor = 'rgba(' + color.red + ',' + color.green + ',' + color.blue + ',0.5)';
            newRegion({name: copyRegion.name, path: region.path});
        }
        paper.view.draw();
    };
    function cmdCopy() {
        if (currentRegion !== null) {
            var json = currentRegion.path.exportJSON();
            copyRegion = JSON.parse(JSON.stringify(currentRegion));
            copyRegion.path = json;
            console.log( "< copy " + copyRegion.name );
        }
    };
    function setSelectedTool(toolname) {
        if( config.debug ) console.log("> selectTool");

        prevTool = selectedTool;
        selectedTool = toolname;
        $("img.button").removeClass("selected");
        $("img.button#" + selectedTool).addClass("selected");
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
    
    /***************************************************************************
        DISPLAY
    ****************************************************************************/
    function updateCurrentImage(name) {
        prevImage = currentImage;
        currentImage = name;
        currentImageInfo = currentDatasetInfo.images[currentImage];
    };      
    function buildImageUrl() {
        return config.urlSlides+'/'+currentDatasetInfo.folder+'/'+currentImage;
    };
    function loadImage(name) {
        if( config.debug ) console.log("> loadImage(" + name + ")");
        if (!currentDatasetInfo.images[name]) {
            console.log("ERROR: Image not found.");
            return;
        }

        clearRegions();
        updateCurrentImage(name);
        if (name !== undefined) {
            $.ajax({
                type: 'GET',
                url: buildImageUrl(),
                async: true,
                success: function(obj){
                    viewer.open(obj); // localhost/name.dzi
                    var viewport = viewer.viewport;
                    window.setTimeout(function () {
                       viewport.goHome(true);
                    }, 200 );

                    viewer.scalebar({
                        pixelsPerMeter: currentImageInfo.pixelsPerMeter
                    });
                }
            }).done(function() {
                if(config.debug) console.log("> "+name+" loaded");
                highlightCurrentSlide();
            }).fail(function() {
                if(config.debug) console.log("> "+name+" failed to load");
            });
        } else {
            if (config.debug) console.log("> "+name+" could not be found");
            var viewport = viewer.viewport;
            window.setTimeout(function () {
               viewport.goHome(true);
            }, 200 );
        }
    };
    function loadNextImage() {
        if($(document.activeElement).is('textarea')) return;
        if( config.debug ) console.log("> loadNextImage");
        var currentImageOrder = currentDatasetInfo.imageOrder;
        var index = currentImageOrder.indexOf(currentImage);
        var nextIndex = (index + 1) % currentImageOrder.length;

        loadImage(currentImageOrder[nextIndex]);
    };
    function loadPreviousImage() {
        if($(document.activeElement).is('textarea')) return;
        if(config.debug) console.log("> loadPrevImage");
        var currentImageOrder = currentDatasetInfo.imageOrder;
        var index = currentImageOrder.indexOf(currentImage);
        var previousIndex = ((index - 1 >= 0)? index - 1 : currentImageOrder.length - 1 );

        loadImage(currentImageOrder[previousIndex]);
    };
    function resizeAnnotationOverlay() {
        if (config.debug) console.log("> resizeAnnotationOverlay");

        var width = $("body").width();
        var height = $("body").height();
        $("canvas.overlay").width(width);
        $("canvas.overlay").height(height);
        paper.view.viewSize = [width, height];
    };
    function initAnnotationOverlay(data) {
        if (config.debug) console.log("> initAnnotationOverlay");

        // do not start loading a new annotation if a previous one is still being loaded
        if (isAnnotationLoading == true) {
            return;
        }

        // if this is the first time a slice is accessed, create its canvas, its project,
        // and load its regions from the database
        if (currentImageInfo.projectID == undefined) {

            // create canvas
            var canvas = $("<canvas class='overlay' id='" + currentImage + "'>");
            $("body").append(canvas);

            // create project
            paper.setup(canvas[0]);
            currentImageInfo.projectID = paper.project.index;
            // load regions from database
            if (config.isSavingEnabled) {
                microdrawDBLoad()
                .then(function(){
                    $("#regionList").height($(window).height() - $("#regionList").offset().top);
                    setImageConclusion();
                    updateRegionList();
                    paper.view.draw();
                });
            }

            if (config.debug) console.log('Set up new project, currentImage: ' + currentImage + ', ID: ' + currentImageInfo.projectID);
        }

        // activate the current slice and make it visible
        paper.projects[currentImageInfo.projectID].activate();
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

        transformViewport();
    };
    function clearRegions() {
        if ( currentImageInfo &&
             paper.projects[currentImageInfo.projectID] ) {
            paper.projects[currentImageInfo.projectID].activeLayer.visible = false;
            $(paper.projects[currentImageInfo.projectID].view.element).hide();
        }
    };
    function transformViewport() {
        if (config.debug) console.log("> transformViewport");
        var z = viewer.viewport.viewportToImageZoom(viewer.viewport.getZoom(true));
        var sw = viewer.source.width;
        var bounds = viewer.viewport.getBounds(true);
        var x = magicV * bounds.x;
        var y = magicV * bounds.y;
        var w = magicV * bounds.width;
        var h = magicV * bounds.height;
        paper.view.setCenter(x + w / 2, y + h / 2);
        paper.view.zoom=(sw * z) / magicV;
    };
    function makeSVGInline() {
        if (config.debug) console.log("> makeSVGInline promise");

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
                if (config.debug) console.log("< makeSVGInline resolve: success");
                def.resolve();
            }, 'xml');
        });

        return def.promise();
    };
    function updateSliceName() {
        if (config.debug) console.log("updateslidename:"+currentImage);
        $("#slice-name").html(currentImage);
        $("title").text("Muscle Annotation | " + currentImage);
    };
    function setImageConclusion() {
        if (currentImageInfo.conclusion) {
            document.getElementById("selectConclusions").value = currentImageInfo.conclusion;
        }
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
    //	view.viewer.open(imageInfo[view.currentImage]["source"]);
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
    
    function initShortCutHandler() {
        $(document).keydown(function(e) {
            var key = [];
            if( e.ctrlKey ) key.push("^");
            if( e.altKey ) key.push("alt");
            if( e.shiftKey ) key.push("shift");
            if( e.metaKey ) key.push("cmd");
            key.push(String.fromCharCode(e.keyCode));
            key = key.join(" ");
            if( shortcuts[key] ) {
                var callback = shortcuts[key];
                callback();
                if(!$(document.activeElement).is('textarea'))
                    e.preventDefault();
            }
        });
    };
    function shortCutHandler(key, callback) {
        var key = config.isMac ? key.mac : key.pc;
        var arr = key.split(" ");
        for (var i = 0; i < arr.length; i++) {
            if( arr[i].charAt(0) == "#" ) {
                arr[i] = String.fromCharCode(parseInt(arr[i].substring(1)));
            } else if (arr[i].length == 1) {
                arr[i] = arr[i].toUpperCase();
            }
        }
        key = arr.join(" ");
        shortcuts[key] = callback;
    };
    function collapseMenu() {
        /* hides or displays menu bar */
        if (config.debug) console.log("> collapseMenu");

        if ($('#menuPanel').css('display') == 'none') {
            $('#menuPanel').css('display', 'block');
            $('#menuButton').css('display', 'none');
        } else {
            $('#menuPanel').css('display', 'none');
            $('#menuButton').css('display', 'block');
        }
    };
    function toggleMenu() {
        /* hides or displays menu bar */
        if (config.debug) console.log("> toggleMenu");

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
    function microdrawDBSave() {
        if (config.debug) console.log("> save promise");
        // key
        var key = "regionPaths";
        var value = {};
        
        for (var dataset in imageInfo.datasets) {
            var datasetInfo = imageInfo.datasets[dataset];
            for (var slicename in datasetInfo.images) {
                var slice = datasetInfo.images[slicename];
                if ((config.multiImageSave == false) && 
                    (slice != currentImageInfo)) {
                    continue;
                }
                // configure value to be saved
                value.regions = [];
                // cycle through regions
                for (var regname in slice.regions) {
                    var region = slice.regions[regname];
                    var el = {};
                    // converted to JSON and then immediately parsed from JSON?
                    console.log(region.path);
                    el.path = JSON.parse(region.path.exportJSON());
                    console.log(el.path);
                    var contour={};
                    contour.Points=[];
                    // cycle through points on region, converting to image coordinates
                    for( var segment in region.path.segments ) {
                        var point = paper.view.projectToView(segment.point);
                        var x = imagingHelper.physicalToDataX(point.x);
                        var y = imagingHelper.physicalToDataY(point.y);
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

                // check if the slice annotations have changed since loaded by computing a hash
                var h = hash(JSON.stringify(value.regions)).toString(16);
                if (config.debug) console.log("hash:", h, "original hash:", slice.Hash);

                // if the slice hash is undefined, this slice has not yet been loaded. do not save anything for this slice
                if( slice.Hash == undefined || h==slice.Hash ) {
                    //if( view.config.debug > 1 ) console.log("No change, no save");
                    //value.Hash = h;
                    //continue;
                }
                value.Hash = h;

                var formdata = new FormData();
                formdata.append('name', slice.name);
                formdata.append('dataset', datasetInfo.folder);
                formdata.append('conclusion', slice.conclusion);
                formdata.append('info', JSON.stringify(value));
                formdata.append('action', 'save');
                (function(slice, h) {
                    if (config.debug) console.log("< start post of contours information");
                    $.ajax({
                        type: 'POST',
                        url: '/uploadinfo/',
                        data: formdata,
                        processData: false,
                        contentType: false,
                        success: function(result) {
                            slice.Hash = h;
                            if (config.debug) console.log("< Save" + result);
                            //show dialog box with timeout
                            if (result === "success")
                                $('#saveDialog').html("Conclusion Saved").fadeIn();
                                setTimeout(function() { $("#saveDialog").fadeOut(500);},2000);
                            if (result === "error")
                                $('#saveDialog').html("Saving Error").fadeIn();
                                setTimeout(function() { $("#saveDialog").fadeOut(500);},2000);
                        },
                        error: function(jqXHR, textStatus, errorThrown) {
                            if (config.debug) console.log("< microdrawDBSave resolve: ERROR: " + textStatus + " " + errorThrown,"slice: "+slice.name.toString());
                            //show dialog box with timeout
                            $('#saveDialog').html("Saving Error").fadeIn();
                            setTimeout(function() { $("#saveDialog").fadeOut(500);},2000);
                        }
                    });
                })(slice, h);

                if (config.debug) console.log("> end of saving contour inforation");
            }
        }
    };
    function microdrawDBLoad() {
        if (config.debug) console.log("> microdrawDBLoad promise");

        var	def = $.Deferred();
        var	key = "regionPaths";
        var slice = currentImage;

        //=======MODIFY THIS FOR OUR PURPOSE========
        var formdata = new FormData();
        formdata.append('name', currentImageInfo.name);
        formdata.append('dataset', currentDatasetInfo.folder);
        formdata.append('action', 'load');

        $.ajax({
            type: 'POST',
            url: '/uploadinfo/',
            data: formdata,
            processData: false,
            contentType: false,
            success: function(data) {
                if (config.debug) console.log("> got the regions data from the server");
                isAnnotationLoading = false;

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
                if (config.debug) console.log('[',data,']');
                // if there is no data on the current slice
                // save hash for the image nonetheless
                if (data.length == 0) {
                    currentImageInfo.Hash = hash(JSON.stringify(currentImageInfo.regions)).toString(16);
                    return;
                }

                // parse the data and add to the current canvas
                var obj = data; //JSON.parse(data);

                if (JSON.stringify(obj) != JSON.stringify({})) {
                    if (config.debug) console.log("> got the regions data from the server");
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
                        newRegion({name: region.name,
                                        path: region.path,
                                        uid: region.uid,
                                        foldername: region.foldername,
                                        description: region.description,
                                        transcript: region.transcript});
                    }

                     // if (view.config.debug) console.log('From db', obj.diag_res );
//                     $('#div_conclu').children().each(function(){
//                        if (obj.diag_res===$(this).val())
//                            $(this).prop('checked',true);
//                        else
//                            $(this).prop('checked',false);
//                     });

                    // saving diag_res for current image, for slider back and forth usage. in Load:
                    currentImageInfo.conclusion = obj.conclusion;
                    paper.view.draw();
                    // if image has no hash, save one
                    currentImageInfo.Hash = (obj.Hash ? obj.Hash : hash(JSON.stringify(currentImageInfo.regions)).toString(16));
                }
                if (config.debug) console.log("> success. Number of regions: ", currentImageInfo.regions.length);

                def.resolve();
            },
            error: function(jqXHR, textStatus, errorThrown) {
                if (config.debug) console.log("< microdrawDBLoad resolve ERROR: " + textStatus + " " + errorThrown);
                isAnnotationLoading = false;
            }
        });

        return def.promise();
    };
    function configTools() {
        /* initializes toolbar buttons, sets default tool, and sets hotkeys */
        if (config.debug) console.log("> configTools");

        // Enable click on toolbar buttons
        $("img.button").click(toolSelectionHandler);

        // Change current slice by typing in the slice number and pessing the enter key
    //	$("#slice-name").keyup(slice_name_onenter);

        // Configure currently selected tool
        setSelectedTool("zoom");

        // Initialize the control key handler and set shortcuts
        initShortCutHandler();
        shortCutHandler({pc:'^ z',mac:'cmd z'}, cmdUndo);
        shortCutHandler({pc:'^ y',mac:'cmd y'}, cmdRedo);
        if (config.isDrawingEnabled ) {
            shortCutHandler({pc:'^ x',mac:'cmd x'}, function() { if (config.debug) console.log("cut!")});
            shortCutHandler({pc:'^ v',mac:'cmd v'}, cmdPaste);
            shortCutHandler({pc:'^ a',mac:'cmd a'}, function() { if (config.debug) console.log("select all!")});
            shortCutHandler({pc:'^ c',mac:'cmd c'}, cmdCopy);
            shortCutHandler({pc:'#46',mac:'#8'}, cmdDeleteSelected);  // delete key
        }
        shortCutHandler({pc:'#37',mac:'#37'}, loadPreviousImage); // left-arrow key
        shortCutHandler({pc:'#39',mac:'#39'}, loadNextImage);     // right-arrow key

        // Show and hide menu
        if (config.hideToolbar) {
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
    function initMicrodraw() {
        var def = $.Deferred();
        console.log(config);
        isAnnotationLoading = false;
        configTools();
        
        // load config settings from server
        if (config.debug) console.log("Reading settings from json");
        $.ajax({
            type: 'GET',
            url: config.urlSlides,
            dataType: "json",
            contentType: "application/json",
            success: function(obj){
                imageInfo = obj;
                initOpenSeadragon(obj);    // load database data from server
                initDatasets();
                initConclusions();
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
    };
    // NOT USED
    function loadSlideData() {
        /* load config settings from server */
        var def = $.Deferred();
        if (config.debug)	console.log("> loadSlideData");
        $.ajax({
            type: 'GET',
            url: config.urlSlides,
            dataType: "json",
            contentType: "application/json",
            success: function(obj){
                if(config.debug) console.log(obj);
                imageInfo = obj;
                def.resolve();
            }
        });
        return def.promise();
    };
    function initOpenSeadragon(obj) {
        // create OpenSeadragon viewer
        if (config.debug) console.log("> initOpenSeadragon");

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

        // add the scalebar
        viewer.scalebar({
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
        viewer.addHandler('open',function(){
            initAnnotationOverlay();
            updateSliceName();
            setImageConclusion();
        });
        viewer.addHandler('animation', function(event){
            transformViewport();
        });
        viewer.addHandler("page", function (data) {
            if (config.debug) console.log(data.page, config.tileSources[data.page]);
        });
        viewer.addViewerInputHook({hooks: [
            {tracker: 'viewer', handler: 'clickHandler', hookHandler: clickHandler},
            {tracker: 'viewer', handler: 'pressHandler', hookHandler: pressHandler},
            {tracker: 'viewer', handler: 'dragHandler', hookHandler: dragHandler},
            {tracker: 'viewer', handler: 'dragEndHandler', hookHandler: dragEndHandler}
        ]});
    };
    function initRegionsMenu() {
        /* initializes regions menu */
        if (config.debug) console.log("> initRegionsMenu");

    //    $("#regionList").click(singlePressOnRegion);
    //    $("#regionList").click(doublePressOnRegion);
        $("#regionList").click(handleRegionTap);
    };
    function initFilmstrip() {
        /* initializes filmstrip menu */
        if (config.debug) console.log("> initFilmstrip");
    //    $("#menuFilmstrip").click(onClickSlide);
        document.querySelector("#menuFilmstrip").addEventListener("click", onClickSlide, false);
    };
    function initDatasets() {
        if (config.debug) console.log("> initDatasets");

        $("#selectDataset").empty();
        for (var dataset in imageInfo["datasets"]) {
            $("#selectDataset").append("<option value='"+dataset+"'>"+dataset+"</option>");
        }
        switchDataset();

        $("#selectDataset").change(switchDataset);
    };
    function switchDataset() {
        /* callback to update conclusions when dataset selector is changed */
        if (config.debug) console.log("> switchDataset");

        currentDataset = $("#selectDataset").val()
        currentDatasetInfo = imageInfo.datasets[currentDataset];
        updateConclusions();
        var firstImage = Object.keys(currentDatasetInfo.images)[0];
        loadImage(firstImage);
        updateFilmstrip();
        highlightCurrentSlide();
        resetAudio();
    };
    function initConclusions() {
        $("#selectConclusions").change(storeConclusion);
    };
    function storeConclusion() {
        currentImageInfo.conclusion = document.getElementById("selectConclusions").value;
    }
    function updateFilmstrip() {
        /* updates the filmstrip panel with thumbnails from the current dataset */	
        if (config.debug) console.log("> updateFilmstrip");

        $("#menuFilmstrip").empty();
        if (currentDatasetInfo.nImages === 0) {
            $("#menuFilmstrip").append(
                "<div class='cell slide'> \
                    <span class='caption' style='color: rgb(255,100,100);'>Directory is empty</span> \
                </div>"
            );
            return;
        }
        var name;
        for (var i =0; i < currentDatasetInfo.nImages; i++) {
            name = currentDatasetInfo.imageOrder[i];
            $("#menuFilmstrip").append(
                "<div id='"+name+"' class='cell slide'> \
                    <img src='"+currentDatasetInfo.images[name].thumbnail+"' /> \
                    <span class='caption'>"+name+"</span> \
                </div>"
            );
        }
    };
    function highlightCurrentSlide() {
        $(".slide").removeClass("selected");
        $(".slide").each(function() {
            if ($(this).children(".caption").html() == currentImage) {
                $(this).addClass("selected");
            }
        });
    };
    function updateConclusions() {
        /* updates the contents of conclusion selector */
        if (config.debug) console.log("> updateConclusions");

        var conclusions = currentDatasetInfo.conclusions;
        $("#selectConclusions").empty();
        for (var i = 0; i < conclusions.length; i++) {
            $("#selectConclusions").append("<option value='"+conclusions[i]+"'>"+conclusions[i]+"</option>");
        }
    };
    function segmentRegion() {
        var formdata = new FormData();
        formdata.append('imageidx', currentImage);
        $.ajax({
            type: 'POST',
            url: '/segment/',
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
    function setAudio(region) {
        if (config.debug) console.log("> setAudio");
        if (region) {
            $("#menuAudioPlayer").attr("src", region.audio);
            $("#region-msg").html(region.name);
            $("#audioPanel").removeClass("inactive");
        } else {
            resetAudio();
        }
    };
    function resetAudio() {
        if (config.debug) console.log("> resetAudio");
        $("#menuAudioPlayer").attr("src", "");
        $("#region-msg").html("No region selected");
        $("#audioPanel").addClass("inactive");
    };
    function startRecording(button) {
        if (config.debug) console.log("> startRecording");
        // check that a region is selected before executing
        if (!currentRegion) {
            return;
        }
        scopalAudio.startRecording();
        button.disabled = true;
        button.nextElementSibling.disabled = false;
        $(button).hide();
        $(button).parent().prev().fadeIn();
        $(button.nextElementSibling).show();

        var recordingslist = $(button).parent().next().children();
        recordingslist.empty();
    };
    function stopRecording(button) {
        if (config.debug) console.log("> stopRecording");
        scopalAudio.stopRecording();
        
        button.disabled = true;
        button.previousElementSibling.disabled = false;
        $(button).hide();
        $(button.previousElementSibling).show();
        $(button).parent().prev().fadeOut();
    };
    
    
    /************************************************************
        CONFIGURATION
    ************************************************************/
    function initialize() {
        if (config.debug) console.log("> initialize");
        var def = $.Deferred();
        $.getJSON("/static/config/configuration.json", function(data) {
            config = data;

            //tools
            var drawingTools = ["select", "draw", "draw-polygon", "simplify", "addpoint",
            "delpoint", "addregion", "delregion", "splitregion", "rotate",
            "save", "copy", "paste", "delete"];
            if (config.isDrawingEnabled == false) {
                // remove drawing tools from ui
                for (var i = 0; i < drawingTools.length; i++){
                    $("#" + drawingTools[i]).remove();
                }
            }
            for (var i = 0; i < config.disabledTools.length; i++) {
                $("#" + config.disabledTools[i]).remove();
            }
            
            // saving
            if (config.isSavingEnabled == false) {
                $("#save").remove();
            } else {
                if (config.autosaveInterval > 0) {
                    setInterval(microdrawDBSave, config.autosaveInterval*1000);
                }
            }
            
            config.isMac = navigator.platform.match(/Mac/i)?true:false;
            config.isIOS = navigator.platform.match(/(iPhone|iPod|iPad)/i)?true:false;
            initMicrodraw();
            
            def.resolve();
        });
        
        return def.promise();
    };
    
    function getImageInfo() {
        return imageInfo;
    };
    function getConfig() {
        return config;
    };
    function getCurrentImage() {
        return currentImage;
    };
    function getCurrentImageInfo() {
        return currentImageInfo;
    };
    function getCurrentDataset() {
        return currentDataset;
    };
    function getCurrentDatasetInfo() {
        return currentDatasetInfo;
    };
    function getCurrentRegion() {
        return currentRegion;
    };
    
    return {
//        imageInfo: imageInfo,
//        config: config,
//        viewer: viewer,
//        magicV: magicV,
//        imagingHelper: imagingHelper,
//        prevImage: prevImage,
//        currentImage: currentImage,
//        currentImageInfo: currentImageInfo,
//        currentDataset: currentDataset,
//        currentDatasetInfo: currentDatasetInfo,
//        currentRegion: currentRegion,
//        currentColorRegion: currentColorRegion,
//        prevRegion: prevRegion,
//        copyRegion: copyRegion,
//        currentHandle: currentHandle,
//        selectedTool: selectedTool,
//        navEnabled: navEnabled,
//        mouseUndo: mouseUndo,
//        undoStack: undoStack,
//        redoStack: redoStack,
//        shortcuts: shortcuts,
//        isDrawingRegion: isDrawingRegion,
//        isDrawingPolygon: isDrawingPolygon,
//        isAnnotationLoading: isAnnotationLoading,
//        isTapDevice: isTapDevice,
        // PROPERTIES
        getImageInfo: getImageInfo,
        getConfig: getConfig,
        getCurrentImage: getCurrentImage,
        getCurrentImageInfo: getCurrentImageInfo,
        getCurrentDataset: getCurrentDataset,
        getCurrentDatasetInfo: getCurrentDatasetInfo,
        getCurrentRegion: getCurrentRegion,

        // UNDO/REDO
        cmdUndo: cmdUndo,
        cmdRedo: cmdRedo,
        getUndo: getUndo,
        saveUndo: saveUndo,
        setImage: setImage,
        applyUndo: applyUndo,
        commitMouseUndo: commitMouseUndo,
        // REGIONS
        newRegion: newRegion,
        removeRegion: removeRegion,
        selectRegion: selectRegion,
        findRegionByUID: findRegionByUID,
        findRegionByName: findRegionByName,
        regionUniqueID: regionUniqueID,
        hash: hash,
        regionHashColor: regionHashColor,
        regionTag: regionTag,
        changeRegionName: changeRegionName,
        toggleRegion: toggleRegion,
        updateRegionList: updateRegionList,
        encode64alt: encode64alt,
        checkRegionSize: checkRegionSize,
        simplifyRegion: simplifyRegion,
        flipRegion: flipRegion,
        clearRegions: clearRegions,
        // EVENTS
        clickHandler: clickHandler,
        pressHandler: pressHandler,
        dragHandler: dragHandler,
        dragEndHandler: dragEndHandler,
        singlePressOnRegion: singlePressOnRegion,
        doublePressOnRegion: doublePressOnRegion,
        handleRegionTap: handleRegionTap,
        mouseDown: mouseDown,
        mouseDrag: mouseDrag,
        mouseUp: mouseUp,
        toggleHandles: toggleHandles,
        onClickSlide: onClickSlide,
        toolSelectionHandler: toolSelectionHandler,
        // ANNOTATION STYLE
        padZerosToString: padZerosToString,
        getHexColor: getHexColor,
        highlightRegion: highlightRegion,
        setRegionColor: setRegionColor,
        onFillColorPicker: onFillColorPicker,
        onSelectStrokeColor: onSelectStrokeColor,
        onAlphaSlider: onAlphaSlider,
        onAlphaInput: onAlphaInput,
        onStrokeWidthDec: onStrokeWidthDec,
        onStrokeWidthInc: onStrokeWidthInc,
        finishDrawingPolygon: finishDrawingPolygon,
        backToPreviousTool: backToPreviousTool,
        backToSelect: backToSelect,
        cmdDeleteSelected: cmdDeleteSelected,
        cmdPaste: cmdPaste,
        cmdCopy: cmdCopy,
        setSelectedTool: setSelectedTool,
        // DISPLAY        
        updateCurrentImage: updateCurrentImage,
        buildImageUrl: buildImageUrl,
        loadImage: loadImage,
        loadNextImage: loadNextImage,
        loadPreviousImage: loadPreviousImage,
        resizeAnnotationOverlay: resizeAnnotationOverlay,
        initAnnotationOverlay: initAnnotationOverlay,
        transformViewport: transformViewport,
        makeSVGInline: makeSVGInline,
        updateSliceName: updateSliceName,
        initShortCutHandler: initShortCutHandler,
        shortCutHandler: shortCutHandler,
        collapseMenu: collapseMenu,
        toggleMenu: toggleMenu,
        microdrawDBSave: microdrawDBSave,
        microdrawDBLoad: microdrawDBLoad,
        configTools: configTools,
        initMicrodraw: initMicrodraw,
        loadSlideData: loadSlideData,
        initOpenSeadragon: initOpenSeadragon,
        initRegionsMenu: initRegionsMenu,
        initFilmstrip: initFilmstrip,
        initDatasets: initDatasets,
        switchDataset: switchDataset,
        updateFilmstrip: updateFilmstrip,
        highlightCurrentSlide: highlightCurrentSlide,
        // SEGMENTATION
        segmentRegion: segmentRegion,
        // AUDIO
        setAudio: setAudio,
        resetAudio: resetAudio,
        startRecording: startRecording,
        stopRecording: stopRecording,
        // CONFIGURATION
        initialize: initialize,
    }
})();

scopal.initialize();
              
//$.when(
//    scopal.loadConfiguration()
//).then(scopal.initMicrodraw);

//$(function() {
//    scopal = new Scopal();
//	$.when(
//		scopal.loadConfiguration()
//	).then(scopal.initMicrodraw());
//});
