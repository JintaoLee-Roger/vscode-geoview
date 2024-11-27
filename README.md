# geoview

`geoview` is a Visual Studio Code extension for displaying geophysical/seismic `.npy` and `.dat`/`.bin` files within VSCode.

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
