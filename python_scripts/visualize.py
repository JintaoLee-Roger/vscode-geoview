import os
import argparse
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap
import re

bwp = {  # blue-white-purple
    'red': [(0.0, 0.25882352941176473, 0.25882352941176473),
            (0.25, 0.09803921568627451, 0.09803921568627451),
            (0.5, 0.8745098039215686, 0.8745098039215686),
            (1.0, 0.4627450980392157, 0.4627450980392157)],
    'green': [(0.0, 0.027450980392156862, 0.027450980392156862),
              (0.25, 0.2549019607843137, 0.2549019607843137),
              (0.5, 0.8705882352941177, 0.8705882352941177),
              (1.0, 0.3176470588235294, 0.3176470588235294)],
    'blue': [(0.0, 0.5137254901960784, 0.5137254901960784),
             (0.25, 0.9607843137254902, 0.9607843137254902),
             (0.5, 0.9882352941176471, 0.9882352941176471),
             (1.0, 0.3058823529411765, 0.3058823529411765)]
}

stratum = {
    'red': [(0.0, 0.9019607843137255, 0.9019607843137255),
            (0.03125, 0.9019607843137255, 0.9294117647058824),
            (0.0625, 0.9294117647058824, 1.0),
            (0.09375, 1.0, 0.4549019607843137),
            (0.125, 0.4549019607843137, 0.2196078431372549),
            (0.15625, 0.2196078431372549, 0.09803921568627451),
            (0.1875, 0.09803921568627451, 0.4549019607843137),
            (0.21875, 0.4549019607843137, 0.21568627450980393),
            (0.25, 0.21568627450980393, 0.011764705882352941),
            (0.28125, 0.011764705882352941, 0.0),
            (0.3125, 0.0, 0.21568627450980393),
            (0.34375, 0.21568627450980393, 0.9294117647058824),
            (0.375, 0.9294117647058824, 0.5019607843137255),
            (0.40625, 0.5019607843137255, 0.45098039215686275),
            (0.4375, 0.45098039215686275, 0.4666666666666667),
            (0.46875, 0.4666666666666667, 0.9215686274509803),
            (0.5, 0.9215686274509803, 0.9019607843137255),
            (0.53125, 0.9019607843137255, 0.47843137254901963),
            (0.5625, 0.47843137254901963, 0.5019607843137255),
            (0.59375, 0.5019607843137255, 0.7529411764705882),
            (0.625, 0.7529411764705882, 0.23529411764705882),
            (0.65625, 0.23529411764705882, 0.8705882352941177),
            (0.6875, 0.8705882352941177, 0.47843137254901963),
            (0.71875, 0.47843137254901963, 0.5098039215686274),
            (0.75, 0.5098039215686274, 0.6823529411764706),
            (0.78125, 0.6823529411764706, 0.49411764705882355),
            (0.8125, 0.49411764705882355, 0.7490196078431373),
            (0.84375, 0.7490196078431373, 0.6705882352941176),
            (0.875, 0.6705882352941176, 0.6901960784313725),
            (0.90625, 0.6901960784313725, 0.8784313725490196),
            (0.9375, 0.8784313725490196, 0.6823529411764706),
            (0.96875, 0.6823529411764706, 0.6588235294117647),
            (1.0, 0.6588235294117647, 0.6588235294117647)],
    'green': [(0.0, 0.19607843137254902, 0.19607843137254902),
              (0.03125, 0.19607843137254902, 0.5294117647058824),
              (0.0625, 0.5294117647058824, 1.0),
              (0.09375, 1.0, 0.9803921568627451),
              (0.125, 0.9803921568627451, 0.49411764705882355),
              (0.15625, 0.49411764705882355, 0.24705882352941178),
              (0.1875, 0.24705882352941178, 0.9803921568627451),
              (0.21875, 0.9803921568627451, 0.49411764705882355),
              (0.25, 0.49411764705882355, 0.0), (0.28125, 0.0, 0.0),
              (0.3125, 0.0, 0.49019607843137253),
              (0.34375, 0.49019607843137253, 0.5333333333333333),
              (0.375, 0.5333333333333333, 0.5019607843137255),
              (0.40625, 0.5019607843137255, 0.08235294117647059),
              (0.4375, 0.08235294117647059, 0.08235294117647059),
              (0.46875, 0.08235294117647059, 0.5333333333333333),
              (0.5, 0.5333333333333333, 0.19607843137254902),
              (0.53125, 0.19607843137254902, 0.2627450980392157),
              (0.5625, 0.2627450980392157, 0.5019607843137255),
              (0.59375, 0.5019607843137255, 0.7529411764705882),
              (0.625, 0.7529411764705882, 0.023529411764705882),
              (0.65625, 0.023529411764705882, 0.7411764705882353),
              (0.6875, 0.7411764705882353, 0.5803921568627451),
              (0.71875, 0.5803921568627451, 0.42745098039215684),
              (0.75, 0.42745098039215684, 0.5529411764705883),
              (0.78125, 0.5529411764705883, 0.5019607843137255),
              (0.8125, 0.5019607843137255, 0.7333333333333333),
              (0.84375, 0.7333333333333333, 0.8549019607843137),
              (0.875, 0.8549019607843137, 0.2980392156862745),
              (0.90625, 0.2980392156862745, 0.8509803921568627),
              (0.9375, 0.8509803921568627, 0.9294117647058824),
              (0.96875, 0.9294117647058824, 0.792156862745098),
              (1.0, 0.792156862745098, 0.792156862745098)],
    'blue': [(0.0, 0.13725490196078433, 0.13725490196078433),
             (0.03125, 0.13725490196078433, 0.2),
             (0.0625, 0.2, 0.3333333333333333),
             (0.09375, 0.3333333333333333, 0.30196078431372547),
             (0.125, 0.30196078431372547, 0.13333333333333333),
             (0.15625, 0.13333333333333333, 0.06274509803921569),
             (0.1875, 0.06274509803921569, 0.9921568627450981),
             (0.21875, 0.9921568627450981, 0.9647058823529412),
             (0.25, 0.9647058823529412, 0.9490196078431372),
             (0.28125, 0.9490196078431372, 0.6039215686274509),
             (0.3125, 0.6039215686274509, 0.7294117647058823),
             (0.34375, 0.7294117647058823, 0.5215686274509804),
             (0.375, 0.5215686274509804, 0.9686274509803922),
             (0.40625, 0.9686274509803922, 0.9529411764705882),
             (0.4375, 0.9529411764705882, 0.47843137254901963),
             (0.46875, 0.47843137254901963, 0.9686274509803922),
             (0.5, 0.9686274509803922, 0.9568627450980393),
             (0.53125, 0.9568627450980393, 0.08235294117647059),
             (0.5625, 0.08235294117647059, 0.5019607843137255),
             (0.59375, 0.5019607843137255, 0.7529411764705882),
             (0.625, 0.7529411764705882, 0.24313725490196078),
             (0.65625, 0.24313725490196078, 0.3137254901960784),
             (0.6875, 0.3137254901960784, 0.5843137254901961),
             (0.71875, 0.5843137254901961, 0.48627450980392156),
             (0.75, 0.48627450980392156, 0.4588235294117647),
             (0.78125, 0.4588235294117647, 0.15294117647058825),
             (0.8125, 0.15294117647058825, 0.8549019607843137),
             (0.84375, 0.8549019607843137, 0.9725490196078431),
             (0.875, 0.9725490196078431, 0.2627450980392157),
             (0.90625, 0.2627450980392157, 0.6627450980392157),
             (0.9375, 0.6627450980392157, 0.7607843137254902),
             (0.96875, 0.7607843137254902, 0.27450980392156865),
             (1.0, 0.27450980392156865, 0.27450980392156865)]
}

Petrel = {
    'red': [(0.0, 0.6313725490196078, 0.6313725490196078), (0.33, 0.0, 0.0),
            (0.4, 0.30196078431372547, 0.30196078431372547), (0.5, 0.8, 0.8),
            (0.6, 0.3803921568627451, 0.3803921568627451),
            (0.67, 0.7490196078431373, 0.7490196078431373), (1.0, 1.0, 1.0)],
    'green': [(0.0, 1.0, 1.0), (0.33, 0.0, 0.0),
              (0.4, 0.30196078431372547, 0.30196078431372547), (0.5, 0.8, 0.8),
              (0.6, 0.27058823529411763, 0.27058823529411763),
              (0.67, 0.0, 0.0), (1.0, 1.0, 1.0)],
    'blue': [(0.0, 1.0, 1.0), (0.33, 0.7490196078431373, 0.7490196078431373),
             (0.4, 0.30196078431372547, 0.30196078431372547), (0.5, 0.8, 0.8),
             (0.6, 0.0, 0.0), (0.67, 0.0, 0.0), (1.0, 0.0, 0.0)]
}


def get_cmap_from(name):
    if name == 'bwp':
        return LinearSegmentedColormap('bwp', bwp)
    elif name == 'stratum':
        return LinearSegmentedColormap('stratum', stratum)
    elif name == 'Petrel':
        return LinearSegmentedColormap('Petrel', Petrel)
    else:
        return plt.get_cmap(name)


def parser_npy_header(file_path):
    # Open the file and read the header information
    with open(file_path, 'rb') as f:
        # Check the magic string
        magic = f.read(6)
        assert magic == b'\x93NUMPY', "Not a valid .npy file"

        # Read the version number
        version = f.read(2)
        major, minor = version[0], version[1]

        # Read the header length based on the version number
        if major == 1:
            header_len = np.frombuffer(f.read(2), dtype=np.uint16)[0]
        elif major == 2:
            header_len = np.frombuffer(f.read(4), dtype=np.uint32)[0]
        else:
            raise ValueError("Unsupported .npy version")

        # Read the header content
        header = f.read(header_len)
        header = eval(header.decode('latin1'))

        # Extract shape and dtype
        shape = header['shape']
        dtype = np.dtype(header['descr'])
        offset = f.tell()  # Data offset, immediately after the header

    return shape, dtype, offset


def auto_clim(d, scale=1):
    v1 = np.nanmin(d)
    v2 = np.nanmax(d)
    if v1 == v2:
        return [v1 - 0.1, v1 + 0.2]
    if v1 * v2 < 0:
        if abs(v1) / abs(v2) < 0.05 or abs(v1) / abs(v2) > 20:
            return [v1 * scale, v2 * scale]
        else:
            v = min(abs(v1), abs(v2)) * scale
            return [-v, v]
    return [v1 * scale, v2 * scale]


def visualize(
    file_path,
    output_path,
    cmap='gray',
    width=800,
    height=600,
    dims="512, 512",
    transpose=True,
    vscale=1,
):
    ndim = 2
    if file_path.endswith('.npy'):
        shape, dtype, offset = parser_npy_header(file_path)

        if len(shape) not in [2, 3]:
            raise ValueError(f"Expected 2D or 3D data, got {len(shape)}D")

        ndim = len(shape)
        dims = shape
        if ndim == 2:
            data = np.load(file_path)
            if transpose:
                data = data.T
        else:
            if transpose:
                idx = int(shape[0] // 2)
                data = np.memmap(file_path, dtype, 'c', offset, shape)[idx].T
            else:
                idx = int(shape[2] // 2)
                data = np.memmap(file_path, dtype, 'c', offset, shape)[:, :,
                                                                       idx]
    else:
        dims = tuple(map(int, dims.split(',')))
        num_elements = np.prod(dims)

        # Check if the number of elements matches
        file_size = np.float32().itemsize * num_elements
        actual_size = os.path.getsize(file_path)

        if file_size == actual_size:
            ndim = len(dims)
            if len(dims) == 2:
                data = np.fromfile(file_path, dtype=np.float32).reshape(dims)
                if transpose:
                    data = data.T
            elif len(dims) == 3:
                if transpose:
                    idx = int(dims[0] // 2)
                    data = np.memmap(file_path,
                                     np.float32,
                                     mode='c',
                                     shape=dims)[idx].T
                else:
                    idx = int(dims[2] // 2)
                    data = np.memmap(file_path,
                                     np.float32,
                                     mode='c',
                                     shape=dims)[:, :, idx]
        else:
            # Extract dimensions from the filename
            match = re.search(
                r'(\d+)x(\d+)x(\d+)|(\d+)x(\d+)|_(\d+)_(\d+)_(\d+)|_(\d+)_(\d+)',
                file_path)
            if match:
                if match.group(1) and match.group(2) and match.group(3):
                    dims = (int(match.group(3)), int(match.group(2)),
                            int(match.group(1)))
                elif match.group(4) and match.group(5):
                    dims = (int(match.group(5)), int(match.group(4)))
                elif match.group(6) and match.group(7) and match.group(8):
                    dims = (int(match.group(6)), int(match.group(7)),
                            int(match.group(8)))
                elif match.group(9) and match.group(10):
                    dims = (int(match.group(10)), int(match.group(9)))

                num_elements = np.prod(dims)
                file_size = np.float32().itemsize * num_elements

                if file_size != actual_size:
                    raise ValueError(
                        "File size does not match the provided dimensions.")
                ndim = len(dims)
                if len(dims) == 2:
                    data = np.fromfile(file_path, np.float32).reshape(dims)
                    if transpose:
                        data = data.T
                elif len(dims) == 3:
                    if transpose:
                        idx = int(dims[0] // 2)
                        data = np.memmap(file_path,
                                         np.float32,
                                         'c',
                                         shape=dims)[idx].T
                    else:
                        idx = int(dims[2] // 2)
                        data = np.memmap(file_path,
                                         np.float32,
                                         'c',
                                         shape=dims)[:, :, idx]

            else:
                raise ValueError(
                    "File size does not match the provided dimensions and no valid dimensions found in filename."
                )

    cmap = get_cmap_from(cmap)
    plt.figure(figsize=(width / 100, height / 100))
    v1, v2 = auto_clim(data, vscale)
    plt.imshow(data,
               cmap=cmap,
               aspect='auto',
               vmin=v1,
               vmax=v2,
               interpolation='bicubic')
    plt.colorbar()
    plt.tight_layout()
    if ndim == 2:
        plt.title(f"2D image with shape={data.shape}")
    else:
        ids = 0 if transpose else 2
        plt.title(
            f"3D image with shape={dims}, current idx(dim {ids}) is {idx}")
    # plt.tight_layout()
    plt.savefig(output_path, bbox_inches='tight', pad_inches=0.03)
    plt.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Visualize numpy array.')
    parser.add_argument('input', help='Input .npy file path')
    parser.add_argument('output', help='Output image file path')
    parser.add_argument('--cmap', default='gray', help='Colormap to use')
    parser.add_argument('--width',
                        type=int,
                        default=800,
                        help='Image width in pixels')
    parser.add_argument('--height',
                        type=int,
                        default=600,
                        help='Image height in pixels')
    parser.add_argument('--dims',
                        type=str,
                        default="512, 512",
                        help='Image height in pixels')
    parser.add_argument('--transpose',
                        action='store_true',
                        help='Transpose the image')
    parser.add_argument('--vscale', type=float, default=1, help='Value scale')
    args = parser.parse_args()

    visualize(args.input,
              args.output,
              cmap=args.cmap,
              width=args.width,
              height=args.height,
              dims=args.dims,
              transpose=args.transpose,
              vscale=args.vscale)
