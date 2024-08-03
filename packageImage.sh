#!/bin/bash

for arg in "$@"; do
    if [ "$arg" = "-h" ] || [ "$arg" = "--help" ]; then
        echo "Usage: [name]"
        echo "  -h, --help    Show this help message"
        echo "  -f, --force   Do a full rebuild, repacking all files"
        echo ""
        echo "The -f option will delete the original image and start over. Use this option if you have removed files or need a fresh image."
        echo "With the -f option disabled, only a patch will be made, which is significantly faster but only works if you have added or changed files."
        exit
        break
    fi
done

if [ -z "$1" ]; then
    filename="base_os"  # Set default value to "os" if the first argument is empty or not set
else
    filename="$1"  # Use the first argument if it is not empty
fi

cd /www/proj/LinuxJS/images/

if [ -d "./source/$filename" ]; then
    echo "Packaging source/$filename into $filename.img"
else
    echo "Package 'source/$filename' does not exist."
    exit
fi

cd ./source/$filename

doPatch=false

for arg in "$@"; do
    if [ "$arg" = "-f" ] || [ "$arg" = "--force" ]; then
        doPatch=true
        break
    fi
done

if [ "$doPatch" = true ]; then
    rm -f ../../$filename.img
fi

zip -y -r ../../$filename.img .
chmod 777 ../../$filename.img

echo "Done"
