# Multimedia annotation of microscope images

## Installation
Scopal is dependent on the [OpenSlide](https://openslide.org/) C library to open and render whole-slide images. First follow their instructions to [download and install](https://openslide.org/download/) this library for your system. 

Once that is finished, install the following in your Python environment:
```
pip install flask Pillow openslide-python pyopenssl
```
Launch the server:
```
python scopal.py
```