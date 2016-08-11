'use strict'
const https = require('https')
const fs = require('fs')
const path = require('path')
const id3 = require('id3-writer')
const writer = new id3.Writer();

const config = require('./config.json')
const meId = config.id
const outDirectory = config.out_directory
const tmpdir = './tmp'
// Initialize client
const appData = {
    id: config.app_data_id,
}

let SC = {
    init: function(options) {
        SC.id = options.id || null
    },
    appendClientId: function(url) {
        if (!SC.id) {
            throw 'client Id must be set'
        }
        return url + '?client_id=' + SC.id
    },
    get: function(endpoint, cb) {
        let url = "https://api.soundcloud.com" + endpoint;
        url = SC.appendClientId(url);
        https.get(url, (res) => {
            let jsonData = ''
            res.on('data', (chunk) => {
                jsonData += chunk;
            })
            res.on('end', () => {
                try {
                    let j = JSON.parse(jsonData)
                    cb(null, j)
                } catch (e) {
                    cb(e, null)
                }
            })
            res.on('error', (err) => {
                cb(err, null)
            })
        })
    },
    getStreamFromTrack: function(trackObject, stream, cb) {
        let errorHappened = false
        stream.on('error', (err) => {
            errorHappened = true
            cb(err)
        })
        let url = SC.appendClientId(trackObject['stream_url'])
        https.get(url, function(res) {
            https.get(res.headers.location, function(res) {
                res.on('data', (chunk) => {
                    stream.write(chunk)
                })
                res.on('end', function() {
                    stream.end()
                    console.log('Track: ' + trackObject['title'] + ' // Downloaded')
                    setTimeout(() => {
                        if (!errorHappened)
                            cb()
                    })
                })
            })
        })
    },
    artworkFromTrack: function(trackObject, cb) {
        let artworkUrl = trackObject['artwork_url']
        let artworkFilePath = path.join(tmpdir, trackObject['permalink'] + '.jpg')
        let stream = fs.createWriteStream(artworkFilePath);
        stream.on('error', (err) => {
            console.log('error with ' + trackObject['permalink'])
        })
        https.get(artworkUrl, (res) => {
            res.on('data', (chunk) => {
                stream.write(chunk)
            })
            res.on('end', () => {
                stream.end()
                setTimeout(() => {
                    cb(artworkFilePath)
                })
            })
        })
    }
}

SC.init(appData)

function getUserinfo(id, cb) {
    SC.get('/users/' + id, function(err, info) {
      if (err) {
        cb(err, null)
      } else {
        // console.log('track retrieved:', track);
        cb(null, info)
      }
    });
}



function getUserFollowingTracks(err, userInfo, cb) {
    // console.log(userInfo)
    if (err) {
        cb(err, null)
    } else {
        let userId = userInfo['id']

        SC.get(`/users/${userId}/favorites`, function(err, favs) {
            if (err) {
                cb(err, null)
            } else {
                cb(null, favs)
            }
        })
    }
}


function getFavoritesTracks(userId, cb) {
    getUserinfo(userId, function(err, info) {
        getUserFollowingTracks(err, info, function(err, favs) {
            cb(err, favs)
        })
    })
}



function downloadTrack(track, dirOut, cb) {
    let outfile = track['title'] + '.mp3'
    outfile = path.join(dirOut, outfile.replace('|', '-'))
    console.log('outfile')
    console.log(outfile)
    let setMetaData = () => {
        SC.artworkFromTrack(track, (artworkFilePath) => {
            var coverImage = new id3.Image(artworkFilePath);
            let id3file = new id3.File(outfile);
            let meta = new id3.Meta({
                artist: track['user']['username'],
                title: track['title'],
                album: 'Soundcloud',
                genre: track['genre']
            }, [coverImage]);

            writer.setFile(id3file).write(meta, (err) => {
                if (err) {
                    // Handle the error
                    return cb(err)
                }
                // console.log('metadata set successfully')
                cb()
            });
        })
    }

    let trackFile = fs.createWriteStream(outfile);
    SC.getStreamFromTrack(track, trackFile, (err) => {
        if (err) {
            return cb(err)
        }
        setMetaData()
    })

}

// Make dir or use existing
function mkdirSync(path) {
  try {
    fs.mkdirSync(path);
  } catch(e) {
    if (e.code != 'EEXIST') throw e;
  }
}


function downloadUserFavTracks(userId, dirOut) {

    mkdirSync(dirOut);
    mkdirSync(tmpdir);

    getFavoritesTracks(userId, function(err, favs) {
        if (err) {
            throw err;
        } else {
            let stop = false;
            let nbToDl = favs.length
            let downloaded = 0
            favs.forEach(function(fav) {
                // console.log(fav)
                if (fav.permalink != 'edge-of-the-world')
                    return
                if (stop) {
                    return
                }
                downloadTrack(fav, dirOut, (err) => {
                    if (err) {
                        console.log(err);
                        throw err;
                        return
                    }
                    downloaded += 1
                    if (downloaded == nbToDl) {
                        console.log(`downloaded ${nbToDl} tracks! enjoy`)
                    }
                })
                // stop = true
            })
        }
    })
}


let _outDirectory = outDirectory;
if (process.argv.length > 2) {
    _outDirectory = process.argv[2]
    _outDirectory = path.join('./', _outDirectory)
}

// console.log(_outDirectory)
downloadUserFavTracks(meId, _outDirectory)

// process.on('uncaughtException', (err) => {
//     console.log('uncaught')
//     console.log(err)
// })