import os, sys
import numpy as np
import tensorflow as tf
# Adding local Keras
HOME_DIR = os.path.expanduser('~')
keras_version = 'keras_pingpong'
KERAS_PATH = os.path.join(os.getcwd(), keras_version)
sys.path.insert(0, KERAS_PATH)
sys.path.insert(0, os.path.join(KERAS_PATH, 'keras'))
sys.path.insert(0, os.path.join(KERAS_PATH, 'keras', 'layers'))
from keras import backend as K
from keras.layers import merge, Convolution2D, MaxPooling2D, UpSampling2D

def sigmoid(z):
    return 1.0 / (1.0 + np.exp(-z))

def add_pad16(img):
    input_rows = img.shape[0]
    input_cols = img.shape[1]
    assert(input_rows >= 16 and input_cols >= 16)

    pad_top, pad_bottom, pad_left, pad_right = 0, 0, 0, 0
    row_need, col_need = 0, 0
    if input_rows % 16 != 0:
        row_need = 16 - input_rows % 16
        assert (row_need > 0)
        if row_need % 2 != 0:
            pad_top, pad_bottom = int(row_need/2), int(row_need/2) + 1
        else:
            pad_top, pad_bottom = int(row_need/2), int(row_need/2)
    row_pad = (pad_top, pad_bottom)

    if input_cols % 16 != 0:
        col_need = 16 - input_cols % 16
        assert (col_need > 0)
        if col_need % 2 != 0:
            pad_left, pad_right = int(col_need/2), int(col_need/2) + 1
        else:
            pad_left, pad_right = int(col_need/2), int(col_need/2)
    col_pad = (pad_left, pad_right)

    padded_img = np.zeros((input_rows+row_need, input_cols+col_need, img.shape[2]), dtype=img.dtype)
    for channel in range(img.shape[2]):
        padded_img[:,:,channel] = np.lib.pad(img[:,:,channel], (row_pad, col_pad), 'reflect')
    return padded_img, row_pad, col_pad

def remove_pad(padded_img, row_pad, col_pad):
    pad_top, pad_bottom = row_pad
    pad_left, pad_right = col_pad

    row_start = pad_top
    row_end = padded_img.shape[0] - pad_bottom

    col_start = pad_left
    col_end = padded_img.shape[1] - pad_right
    return padded_img[row_start:row_end, col_start:col_end]

class SegNet(object):
    gpu_serial_num = '0'
    input_channel = 3
    model_dir = './segmentation_model'
    
    def __init__(self):
        os.environ["CUDA_VISIBLE_DEVICES"] = self.gpu_serial_num
        config = tf.ConfigProto()
        config.gpu_options.allow_growth = True
        self.sess = tf.Session(config=config)
        K.set_session(self.sess)
        
        # define model
        self.img_input = tf.placeholder(tf.float32, shape=(None, None, None, self.input_channel))
        self.model = self.build_model(inputs=self.img_input)    
        self.saver = tf.train.Saver()

        # initialize
        self.sess.run(tf.global_variables_initializer())
        self.load_model()
            
    def build_model(self, inputs=None):
        """
            UNet model, 4 times MaxPooling
            width and height of inputs must be multiple of 16
        """
        conv1 = Convolution2D(32, 3, 3, activation='relu', border_mode='same')(inputs)
        conv1 = Convolution2D(32, 3, 3, activation='relu', border_mode='same')(conv1)
        pool1 = MaxPooling2D(pool_size=(2, 2))(conv1)

        conv2 = Convolution2D(64, 3, 3, activation='relu', border_mode='same')(pool1)
        conv2 = Convolution2D(64, 3, 3, activation='relu', border_mode='same')(conv2)
        pool2 = MaxPooling2D(pool_size=(2, 2))(conv2)

        conv3 = Convolution2D(128, 3, 3, activation='relu', border_mode='same')(pool2)
        conv3 = Convolution2D(128, 3, 3, activation='relu', border_mode='same')(conv3)
        pool3 = MaxPooling2D(pool_size=(2, 2))(conv3)

        conv4 = Convolution2D(256, 3, 3, activation='relu', border_mode='same')(pool3)
        conv4 = Convolution2D(256, 3, 3, activation='relu', border_mode='same')(conv4)
        pool4 = MaxPooling2D(pool_size=(2, 2))(conv4)

        conv5 = Convolution2D(512, 3, 3, activation='relu', border_mode='same')(pool4)
        conv5 = Convolution2D(512, 3, 3, activation='relu', border_mode='same')(conv5)

        up6 = merge([UpSampling2D(size=(2, 2))(conv5), conv4], mode='concat', concat_axis=3)
        conv6 = Convolution2D(256, 3, 3, activation='relu', border_mode='same')(up6)
        conv6 = Convolution2D(256, 3, 3, activation='relu', border_mode='same')(conv6)

        up7 = merge([UpSampling2D(size=(2, 2))(conv6), conv3], mode='concat', concat_axis=3)
        conv7 = Convolution2D(128, 3, 3, activation='relu', border_mode='same')(up7)
        conv7 = Convolution2D(128, 3, 3, activation='relu', border_mode='same')(conv7)

        up8 = merge([UpSampling2D(size=(2, 2))(conv7), conv2], mode='concat', concat_axis=3)
        conv8 = Convolution2D(64, 3, 3, activation='relu', border_mode='same')(up8)
        conv8 = Convolution2D(64, 3, 3, activation='relu', border_mode='same')(conv8)

        up9 = merge([UpSampling2D(size=(2, 2))(conv8), conv1], mode='concat', concat_axis=3)
        conv9 = Convolution2D(32, 3, 3, activation='relu', border_mode='same')(up9)
        conv9 = Convolution2D(32, 3, 3, activation='relu', border_mode='same')(conv9)

        conv10 = Convolution2D(1, 1, 1, activation='linear')(conv9)

        return conv10
    
    def load_model(self):
        ckpt = tf.train.get_checkpoint_state(self.model_dir)
        if ckpt and ckpt.model_checkpoint_path:
            ckpt_name = os.path.basename(ckpt.model_checkpoint_path)
            self.saver.restore(self.sess, os.path.join(self.model_dir, ckpt_name))
            return True
        return False
    
    def predict(self, img):
        K.set_learning_phase(0)
        cur_img = img / 255.0
        padded_img, row_pad, col_pad = add_pad16(cur_img)
        padded_img4d = np.expand_dims(padded_img, axis=0)
        padded_predict = self.sess.run(self.model, feed_dict={self.img_input: padded_img4d})
        padded_predict = np.squeeze(sigmoid(padded_predict))
        pred = remove_pad(padded_predict, row_pad, col_pad)
        return pred
        