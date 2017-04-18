# @Author: Pingjun Chen <Pingjun>
# @Date:   2017-01-31T12:38:21-05:00
# @Email:  codingPingjun@gmail.com
# @Filename: muscle_annotate.py
# @Last modified by:   pingjun
# @Last modified time: 2017-Feb-17 12:27:46
# @License: The MIT License (MIT)
# @Copyright: Lab BICI2. All Rights Reserved.

import pdb

from flask import Flask, abort, make_response, render_template, url_for
from flask import jsonify, request
from openslide import open_slide
from openslide.deepzoom import DeepZoomGenerator
from optparse import OptionParser
from unicodedata import normalize
from cStringIO import StringIO
from urllib import unquote
from PIL import Image
import os, re, glob, json, base64
from datetime import datetime

from util import PILBytesIO, save_annotation, save_audio, _img_idx


ALLOWED_EXTENSIONS = set(['svs', 'ndpi', 'tif', 'tiff'])
DEEPZOOM_SLIDE = None
DEEPZOOM_FORMAT = 'jpeg'
DEEPZOOM_TILE_SIZE = 254
DEEPZOOM_OVERLAP = 1
DEEPZOOM_LIMIT_BOUNDS = True
DEEPZOOM_TILE_QUALITY = 75
SLIDE_NAME = 'slide'

app = Flask(__name__)
app.config.from_object(__name__)
app.config.from_envvar('DEEPZOOM_TILER_SETTINGS', silent=True)
app.debug = True
app.config["ImageInfo"] = None
app.config["FILES_FOLDER"] = "slides"
app.config["IMAGES_FOLDER"] = "images"
app.config["ANNOTATION_FOLDER"] = "annotations"
app.config["SEGMENTATION_FOLDER"] = "segmentations"
app.config["AUDIO_FOLDER"] = "static/audio/"
app.config["THUMBNAILS_FOLDER"] = "static/thumbs/"
app.config["HOME_DIR"] = os.path.expanduser("~")
app.config["DROPBOX_MUSCLE"] = os.path.join(app.config["HOME_DIR"], "Dropbox",
                                            "MuscleAnnotation")
app.config["DATASETS"] = "./datasets.json"

@app.route('/')
def index():
    return render_template('muscle_annotation.html')

@app.route('/config/')
def config():
    config = {}
    config['source'] = app.config["FILES_FOLDER"]
    config['images_folder'] = app.config["IMAGES_FOLDER"]
    config['annotation_folder'] = app.config["ANNOTATION_FOLDER"]
    config['segmentation_folder'] = app.config["SEGMENTATION_FOLDER"]
    return jsonify(config)

@app.route('/datasets/')
def datasets():
    datafile = open(app.config["DATASETS"], "r")
    data = datafile.read()
    return data


def load_slide(name):
    slidefile = app.config['DEEPZOOM_SLIDE']
    if slidefile is None:
        raise ValueError('No slide file specified')
    config_map = {
        'DEEPZOOM_TILE_SIZE': 'tile_size',
        'DEEPZOOM_OVERLAP': 'overlap',
        'DEEPZOOM_LIMIT_BOUNDS': 'limit_bounds',
    }
    opts = dict((v, app.config[k]) for k, v in config_map.items())
    slide = open_slide(slidefile)
    app.slides = {
        name: DeepZoomGenerator(slide, **opts)
    }


# Assume Whole slide images are placed in folder slides
#@app.route('/slides/', defaults={'dataset': 'muscle', 'filename': None})
#@app.route('/slides/')
#@app.route('/slides/<dataset>')
@app.route('/slides/<dataset>/<filename>')
def getslides(dataset='muscle', filename=''):
    imageroute = os.path.join(app.config["FILES_FOLDER"], 
                            dataset, 
                            app.config["IMAGES_FOLDER"])
    if not filename:
        # Get all Whole slide microscopy images
        filelists = []
        cur_path = os.getcwd()
        for ext in ALLOWED_EXTENSIONS:
            filelists.extend(glob.glob(os.path.join(
                                        cur_path,
                                        imageroute,
                                        '*.' + ext)))
        # setting obj configs
        obj_config = {}
        # set tile_sources and names
        tile_sources, names, foldernames, thumbnails, filenames, imgnames = [], [], [], [], [], []
        filelists.sort()
        for ind, filepath in enumerate(filelists):
            head, tail = os.path.split(filepath)
            name, ext = os.path.splitext(tail)
            tile_sources.append(os.path.join(imageroute, tail))
            foldernames.append(head)
            names.append(str(ind) + ":" + name)
            imgnames.append(name)
            filenames.append(tail)
            # thumbnails
            thumb = open_slide(filepath).get_thumbnail((256, 256))
            thumb_buffer = StringIO()
            thumb.save(thumb_buffer, format="PNG")
            thumbnails.append(base64.b64encode(thumb_buffer.getvalue()))
            thumb_buffer.close()

        obj_config['tileSources'] = tile_sources
        obj_config['names'] = names
        obj_config['imgnames'] = imgnames
        obj_config['filenames'] = filenames
        obj_config['foldernames'] = foldernames
        obj_config['dataset'] = dataset
        # set configuration and pixelsPermeter
        obj_config['configuration'] = None
        obj_config['pixelsPerMeter'] = 1
        obj_config['thumbnails'] = thumbnails

        app.config["ImageInfo"] = obj_config
        return jsonify(obj_config)
    else:
        app.config['DEEPZOOM_SLIDE'] = os.path.join(imageroute, filename)
        name, ext = os.path.splitext(filename)
        load_slide(name)
        slide_url = url_for('dzi', slug=name)
        return slide_url

    
@app.route('/slides/')
def slides():
#    start_t = datetime.now()
    obj_slides = {}
    obj_slides["datasets"] = json.loads(datasets())
    obj_slides["nDatasets"] = len(obj_slides["datasets"])
    for dataset in obj_slides["datasets"]:
        dataset_folder = obj_slides["datasets"][dataset]["folder"]
        relpath = os.path.join(app.config["FILES_FOLDER"],
                               dataset_folder, 
                               app.config["IMAGES_FOLDER"])
        abspath = os.path.join(os.getcwd(), relpath)
        images = []
        for ext in ALLOWED_EXTENSIONS:
            images.extend(glob.glob(os.path.join(abspath, '*.' + ext)))
            
        images.sort()
        img_count = 0
        images_dict = {}
        images_list = []
        for image in images:
            head, tail = os.path.split(image)
            name, ext = os.path.splitext(tail)
            images_dict[tail] = {"ext": ext,
                                 "dir": head,
                                 "source": os.path.join(relpath, tail),
                                 "name": name,
                                 "projectID": None,
                                 "thumbnail": get_thumbnail_url(dataset_folder, tail),
                                 "regions": [],
                                 "conclusion": "",
                                 "pixelsPerMeter": 1,
                                 "number": img_count,
                                 "imageHash": ""}
            images_list.append(tail)
            img_count += 1
        obj_slides["datasets"][dataset]["images"] = images_dict
        obj_slides["datasets"][dataset]["nImages"] = len(images)
        obj_slides["datasets"][dataset]["imageOrder"] = images_list
        
#    time_eplased = datetime.now() - start_t
#    print("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
#    print("Time used {}".format(time_eplased))
    return jsonify(obj_slides)

@app.route('/<slug>.dzi')
def dzi(slug):
    format = app.config['DEEPZOOM_FORMAT']
    try:
        resp = make_response(app.slides[slug].get_dzi(format))
        resp.mimetype = 'application/xml'
        return resp
    except KeyError:
        # Unknown slug
        abort(404)

@app.route('/<slug>_files/<int:level>/<int:col>_<int:row>.<format>')
def tile(slug, level, col, row, format):
    format = format.lower()
    if format != 'jpeg' and format != 'png':
        # Not supported by Deep Zoom
        abort(404)
    try:
        tile = app.slides[slug].get_tile(level, (col, row))
    except KeyError:
        # Unknown slug
        abort(404)
    except ValueError:
        # Invalid level or coordinates
        abort(404)
    buf = PILBytesIO()
    tile.save(buf, format, quality=app.config['DEEPZOOM_TILE_QUALITY'])
    resp = make_response(buf.getvalue())
    resp.mimetype = 'image/%s' % format
    return resp

@app.route('/uploadinfo/', methods=['POST'])
def uploadinfo(): # check for post data
    info_all = {}
    if request.method == "POST":
        img_name = str(request.form['name'])
        dataset = request.form['dataset']
        action = request.form['action']
        info_all["img_name"] = img_name
        info_all_name = "annotations.json"
        annotation_route = os.path.join(app.config["FILES_FOLDER"],
                                        dataset,
                                        app.config["ANNOTATION_FOLDER"])
        if(action == 'save'):
            # diagnosis result
            conclusion = str(request.form['conclusion'])
            info_all['conclusion'] = conclusion
            # parse contour information, get useful part
            contour_info = json.loads(request.form['info'])
            region_info_all = []
            for ireg in range(len(contour_info['regions'])):
                cur_region_info = {}
                cur_region = contour_info['regions'][ireg]
                cur_region_info['uid'] = cur_region['uid']
                cur_region_info['name'] = "region" + str(cur_region['uid'])
                cur_region_info['points'] = cur_region['contour']['Points']
                cur_region_info['path'] = cur_region['path']
                cur_region_info['description'] =  cur_region['mp3name']
                cur_region_info['transcript'] = cur_region['transcript']
                region_info_all.append(cur_region_info)
            info_all["regions"] = region_info_all

            # saving contours information
            save_status1 = save_annotation(annotation_route, 
                                           img_name, 
                                           info_all_name, 
                                           info_all)
            # backup in dropbox
            save_status2 = save_annotation(app.config["DROPBOX_MUSCLE"],
                                           img_name, 
                                           info_all_name, 
                                           info_all)
            if save_status1 and save_status2:
                return "success"
            else:
                return "error"
        else:
            # read jason and send it back
            json_filepath = os.path.join(annotation_route, 
                                         img_name, 
                                         info_all_name)
            annotation_data = {}
            if os.path.exists(json_filepath):
                with open(json_filepath, 'r') as data_file:
                    annotation_data = json.load(data_file)
            return jsonify(annotation_data)
    else:
        return "error"

@app.route('/uploadFlac/', methods=['POST'])
def uploadFlac(): # check for post data
    if request.method == "POST":
        encode_audio = request.form['data']
        img_name = str(request.form['name'])
        dataset = request.form['dataset']
        uid = str(request.form['uid'])
        audio_filename = "region" + uid + ".flac"
        # decode audio data
        #start_pos = encode_audio.index(',') + 1
        #audio_data = base64.b64decode(encode_audio[start_pos:])
        audio_data = base64.b64decode(encode_audio)

        audioroute = os.path.join(app.config["AUDIO_FOLDER"], dataset)
        save_status1 = save_audio(audioroute, img_name, audio_filename, audio_data)
        # backup in dropbox
        save_status2 = save_audio(app.config["DROPBOX_MUSCLE"],
                                img_name, audio_filename, audio_data)
        if save_status1 and save_status2:
            return "success"
        else:
            return "error"
    else:
        return "error"
    
@app.route('/uploadMp3/', methods=['POST'])
def uploadMp3(): # check for post data
    if request.method == "POST":
        encode_audio = request.form['data']
        img_name = str(request.form['name'])
        dataset = request.form['dataset']
        uid = str(request.form['uid'])
        audio_filename = "region" + uid + ".mp3"
        # decode audio data
        start_pos = encode_audio.index(',') + 1
        audio_data = base64.b64decode(encode_audio[start_pos:])
        print("MP3 start_pos {}".format(start_pos))

        audioroute = os.path.join(app.config["AUDIO_FOLDER"], dataset)
        save_status1 = save_audio(audioroute, img_name, audio_filename, audio_data)
        # backup in dropbox
        save_status2 = save_audio(app.config["DROPBOX_MUSCLE"],
                                img_name, audio_filename, audio_data)
        if save_status1 and save_status2:
            return "success"
        else:
            return "error"
    else:
        return "error"


@app.route('/readmp3', methods=['GET', 'POST'])
def parseMP3(): # check for post data
    if request.method == "POST":
        img_idx = _img_idx(request.form['imageidx'])
        img_path = app.config["ImageInfo"]['tileSources'][img_idx]
        img_name = os.path.splitext(os.path.basename(img_path))[0]

        # region id
        uid = str(request.form['uid'])
        audio_filename = "region" + uid + ".mp3"
        audioroute = os.path.join(app.config["AUDIO_FOLDER"], app.config["ImageInfo"]["dataset"])
        audio_path = os.path.join(audioroute, img_name, audio_filename)
        print(audio_path)
        try:
            fp = open(audio_path, 'r')
            mp3_chars = base64.b64encode(fp.read())
            fp.close()

            return mp3_chars
        except:
            return "error"
    else:
        return "error"

def slugify(text):
    text = normalize('NFKD', text.lower()).encode('ascii', 'ignore').decode()
    return re.sub('[^a-z0-9]+', '-', text)

#def get_b64thumbnail(filepath):
#    thumb = open_slide(filepath).get_thumbnail((256, 256))
##    thumb = open_slide(filepath).associated_images["thumbnail"]
#    thumb_buffer = StringIO()
#    thumb.save(thumb_buffer, format="PNG")
#    b64_encoding = base64.b64encode(thumb_buffer.getvalue())
#    thumb_buffer.close()
#    return b64_encoding
    
def get_thumbnail_url(dataset, filename):
    name, _ = os.path.splitext(filename)
    thumb_url = os.path.join(app.config["THUMBNAILS_FOLDER"],
                                        dataset,
                                        name+".jpg")
    if not os.path.isfile(thumb_url):
        slide_source = os.path.join(app.config["FILES_FOLDER"],
                                    dataset,
                                    app.config["IMAGES_FOLDER"],
                                    filename)
        thumb = open_slide(slide_source).get_thumbnail((256, 256))
        thumb.save(thumb_url)
    return thumb_url
    

@app.route('/segment/', methods=['POST'])
def segment():
    if request.method == "POST":
        img_idx = _img_idx(request.form['imageidx'])
        return "segmentation of "+app.config["ImageInfo"]["tileSources"][img_idx]+"!"
    
if __name__ == '__main__':
    parser = OptionParser(usage='Usage: %prog [options] [slide]')
    parser.add_option('-B', '--ignore-bounds', dest='DEEPZOOM_LIMIT_BOUNDS',
                default=True, action='store_false',
                help='display entire scan area')
    parser.add_option('-c', '--config', metavar='FILE', dest='config',
                help='config file')
    parser.add_option('-d', '--debug', dest='DEBUG', action='store_true',
                help='run in debugging mode (insecure)')
    parser.add_option('-e', '--overlap', metavar='PIXELS',
                dest='DEEPZOOM_OVERLAP', type='int',
                help='overlap of adjacent tiles [1]')
    parser.add_option('-f', '--format', metavar='{jpeg|png}',
                dest='DEEPZOOM_FORMAT',
                help='image format for tiles [jpeg]')
    parser.add_option('-l', '--listen', metavar='ADDRESS', dest='host',
                default='127.0.0.1',
               	# default='127.0.0.1',
                help='address to listen on [127.0.0.1]')
    parser.add_option('-p', '--port', metavar='PORT', dest='port',
                type='int', default=10001,
                help='port to listen on [10001]')
    parser.add_option('-Q', '--quality', metavar='QUALITY',
                dest='DEEPZOOM_TILE_QUALITY', type='int',
                help='JPEG compression quality [75]')
    parser.add_option('-s', '--size', metavar='PIXELS',
                dest='DEEPZOOM_TILE_SIZE', type='int',
                help='tile size [254]')
    (opts, args) = parser.parse_args()

    # Load config file if specified
    if opts.config is not None:
        app.config.from_pyfile(opts.config)
    # Overwrite only those settings specified on the command line
    for k in dir(opts):
        if not k.startswith('_') and getattr(opts, k) is None:
            delattr(opts, k)
    app.config.from_object(opts)
    
    # run the program
    #app.run(host=opts.host, port=opts.port, threaded=True)
    app.run(host=opts.host, port=opts.port, threaded=True, ssl_context='adhoc')
