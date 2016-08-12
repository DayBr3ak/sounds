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
                    // console.log('Track: ' + trackObject['title'] + ' // Downloaded')
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
        if (!artworkUrl) {
            artworkUrl = trackObject['user']['avatar_url']
            if (!artworkUrl) {
                console.log('no artwork')
                return cb(null)
            }
        }
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

const eyed3 = require('./eyed3_adapter.js')
const ProgressBar = require('progress')

function downloadTrack(track, dirOut, cb) {
    let outfile = track['title'] + '.mp3'
    outfile = path.join(dirOut, outfile.replace('|', '-'))
    let setMetaData = (track) => {
        SC.artworkFromTrack(track, (artworkFilePath) => {
            let meta = {
                artist: track['user']['username'],
                title: track['title'],
                album: 'Soundcloud',
                genre: track['genre'],
                image: artworkFilePath
            };
            // console.log(meta)
            eyed3.write_meta(outfile, meta, (err) => {
                if (err) {
                    return cb(err)
                }
                cb()
            })
        })
    }

    let trackFile = fs.createWriteStream(outfile);
    SC.getStreamFromTrack(track, trackFile, (err) => {
        if (err) {
            return cb(err)
        }
        setMetaData(track)
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
            let progress_bar = new ProgressBar(
                '  downloading [:bar] :percent :etas',
                {
                    total: favs.length,
                    complete: '=',
                    incomplete: ' ',
                    width: 20,
                }
            )
            let cascade = []
            let cascade_id = 0
            let next = () => {
                progress_bar.tick()
                cascade_id++
                cascade[cascade_id]()
            }

            // let _favs = []
            // favs.forEach((fav) => {
            //     if (fav.permalink == 'outsideremix') {
            //         _favs.push(fav)
            //     }
            // })
            // favs = _favs
            // console.log(favs[0])

            favs.forEach((fav) => {
                cascade.push(() => {
                    // if (fav.permalink != 'dont-stop-the-fatrat-remix') {
                    //     return next()
                    // }
                    downloadTrack(fav, dirOut, (err) => {
                        if (err) {
                            console.log(err);
                            throw err;
                            return
                        }
                        return next()
                    })
                })
            })
            cascade.push(() => {
                // cleanup code ?
                // rm tmpdir
                console.log(`\ndownloaded ${favs.length} tracks! enjoy`)
            })
            cascade[0]()
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