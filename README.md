# geoview

`geoview` is a Visual Studio Code extension for displaying geophysical/seismic `.npy` and `.dat`/`.bin` files within VSCode.


## npy file

![img_01](https://github.com/JintaoLee-Roger/images/blob/main/vscode-geoview/01.gif)

## binary file

![img_02](https://github.com/JintaoLee-Roger/images/blob/main/vscode-geoview/02.gif)


## binary file with auto dims

GeoView can parser the `dims` from the file name, the valid strings as follows:

- `xxx_h1201x789x937.dat`: dims is `(937, 789, 1201)`
- `xxx_h1201x937.dat`: dims is `(937, 1201)`
- `xxx_1201_789_937.dat`: dims is `(1201, 789, 1201)`
- `xxx_789_937.dat`: dims is `(789, 1201)`

![img_03](https://github.com/JintaoLee-Roger/images/blob/main/vscode-geoview/03.gif)

## transpose

![img_04](https://github.com/JintaoLee-Roger/images/blob/main/vscode-geoview/04.gif)



## Features

- **File Visualization**: Directly view the contents of `.npy` and `.dat`/`.bin` files in VSCode.
- **Colormap Change**: Change the visualization colormap via commands.
- **Data Transposition**: Support for toggling the transposition of data.
- **Configuration Options**: Various configuration options available for customization.

## Usage

1. Open a workspace containing `.npy` or `.dat`/`.bin` files.
2. Click on the file to view its content in the custom editor.
3. Use the `geoview.changeCmap` and `geoview.transpose` commands from the command palette to change the colormap and transpose the data.


## Install

Running:

```bash
vsce package
```
