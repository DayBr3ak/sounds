'use strict'
const exec = require('child_process').exec;

const write_meta = (filepath, meta, next) => {
    let cmd = `--artist "${meta['artist']}"`
    cmd += ` --album "${meta['album']}"`
    cmd += ` --title "${meta['title']}"`
    if (meta['genre'] && meta['genre'] != '[???]')
        cmd += ` --genre "${meta['genre']}"`
    if (meta['image'])
        cmd += ` --add-image "${meta['image']}":FRONT_COVER`
    cmd += ` "${filepath}"`

    exec(`eyeD3 ${cmd}`, (err, stdout, stderr) => {
        if (err) {
            return next(err)
        }

        next()
    })
}

module.exports.write_meta = write_meta
