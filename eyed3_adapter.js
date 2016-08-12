'use strict'
const exec = require('child_process').exec;

const write_meta = (filepath, meta, next) => {
    let cmd = `--artist "${meta['artist']}"`
    cmd += ` --album "${meta['album']}"`
    cmd += ` --title "${meta['title']}"`
    if (meta['genre'] && meta['genre'] != '[???]')
        cmd += ` --genre "${meta['genre']}"`
    cmd += ` "${filepath}"`

    exec(`eyeD3 ${cmd}`, (err, stdout, stderr) => {
        if (err) {
            return next(err)
        }

        if (meta['image']) {
            let cmd = `--add-image "${meta['image']}:FRONT_COVER"`
            exec(`eyeD3 ${cmd} "${filepath}"`, (err, stdout, stderr) => {
                next(err)
            })
        } else {
            next()
        }
    })
}

module.exports.write_meta = write_meta
