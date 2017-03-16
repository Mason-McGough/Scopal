# @Author: Pingjun Chen <pingjun>
# @Date:   2017-Feb-17 09:56:51
# @Email:  codingPingjun@gmail.com
# @Filename: util.py
# @Last modified by:   pingjun
# @Last modified time: 2017-Feb-17 10:06:17
# @License: The MIT License (MIT)
# @Copyright: Lab BICI2. All Rights Reserved

import os
import json
from io import BytesIO


class PILBytesIO(BytesIO):
    def fileno(self):
        '''Classic PIL doesn't understand io.UnsupportedOperation.'''
        raise AttributeError('Not supported')


def save_annotation(parent_folder, image_name, info_name, info_all):
    # saving contours information
    if not os.path.exists(parent_folder):
        os.makedirs(parent_folder)
    img_path = os.path.join(parent_folder, image_name)
    if not os.path.exists(img_path):
        os.makedirs(img_path)

    # saving information
    info_path = os.path.join(img_path, info_name)
    if os.path.exists(info_path):
        os.remove(info_path)
    try:
        fp = open(info_path, 'w')
        json.dump(info_all, fp)
        fp.close()

        if os.path.exists(info_path):
            return True
        else:
            return False
    except:
        return False

def save_audio(parent_folder, image_name, audio_name, audio_data):
    # saving contours information
    if not os.path.exists(parent_folder):
        os.makedirs(parent_folder)
    img_path = os.path.join(parent_folder, image_name)
    if not os.path.exists(img_path):
        os.makedirs(img_path)

    # saving information
    audio_path = os.path.join(img_path, audio_name)
    if os.path.exists(audio_path):
        os.remove(audio_path)
    try:
        fp = open(audio_path, 'wb')
        fp.write(audio_data)
        fp.close()
        if os.path.exists(audio_path):
            return True
        else:
            return False
    except:
        return False
