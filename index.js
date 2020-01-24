const express = require('express')
const app = express()
const fs = require('fs')
const path = require('path')
const SpotifyWebApi = require('spotify-web-api-node')

// State should be a random genarated key, a hash is recommended
// Scope could be user dependant
let config = require('./config.json')
let appData = require('./appdata.json')

/**
 * @summary Spotify_Node_API configuration
 */
const spotifyApi = new SpotifyWebApi({
    accessToken: appData.access_token,
    refreshToken: appData.refresh_token,
    clientId: config.credentials.client_ID,
    clientSecret: config.credentials.client_secret,
    redirectUri: `http://${config.application_adress}:${config.application_port}${config.spotify_redirect}`
})

/**
 * @summary Returns true is token is still valid (not outdated nor empty)
 */
const isTokenValid = () => {
    if (Date.now() < appData.token_expiration_epoch - (config.token_expiration_anticipate || 0)) {
        const accessToken = spotifyApi.getAccessToken()
        const refreshToken = spotifyApi.getRefreshToken()
        if (!accessToken || accessToken === '' || !refreshToken || refreshToken === '') {
            console.info('Token needed')
            return false
        } else {
            return true
        }
    } else {
        console.info('Token has expired')
        return false
    }
}

let refreshTokenTimeout = undefined
if (isTokenValid()) {
    refreshTokenTimeout = setTimeout(() => {
        console.info(new Date(Date.now()), ' : Refreshing token')
        console.info(
            new Date(Date.now()),
            ' : Next refresh in ',
            appData.token_expiration_epoch - Date.now() - config.token_expiration_anticipate
        )
        spotifyApi.refreshAccessToken()
    }, appData.token_expiration_epoch - Date.now() - config.token_expiration_anticipate)
}

/**
 * @param {String} code Authenticated user's code
 * @summary Retreives token from spotify.com
 */
const setTokens = (code) => {
    spotifyApi.authorizationCodeGrant(code).then(
        (data) => {
            console.info(new Date(Date.now()), ' : ')
            console.info('===== TOKENIZATION =====')
            console.log('    The new token expires in ' + data.body['expires_in'] + ' seconds')
            console.log('    The new access token is ' + data.body['access_token'])
            console.log('    The new refresh token is ' + data.body['refresh_token'])
            console.info('===== END          =====')

            spotifyApi.setAccessToken(data.body['access_token'])
            spotifyApi.setRefreshToken(data.body['refresh_token'])

            appData.token_acquisition_epoch = Date.now()
            appData.token_expiration_epoch = Date.now() + parseInt(data.body['expires_in']) * 1000 || 0
            appData.access_token = spotifyApi.getAccessToken()
            appData.refresh_token = spotifyApi.getRefreshToken()

            clearTimeout(refreshTokenTimeout)
            refreshTokenTimeout = setTimeout(() => {
                console.info(new Date(Date.now()), ' : Refreshing token')
                spotifyApi.refreshAccessToken()
            }, appData.token_expiration_epoch - Date.now() - config.token_expiration_anticipate)

            fs.writeFile(path.resolve(__dirname, './appdata.json'), JSON.stringify(appData), (error) => {
                if (error) {
                    console.error(new Date(Date.now()), ' : An error occured while saving data : ', error)
                } else {
                    console.info(new Date(Date.now()), ' : Application data saved')
                }
            })
        },
        (error) => {
            console.error(error)
        }
    )
}

/**
 * @param {Response<Any>} res Express response
 * @param {Any} error Spotify_Node_API error
 * @summary Handles Spotify API error
 */
const spotifyErrorHandler = (error, res) => {
    if (error.statusCode === 401 && error.message === 'Unauthorized') {
        res.statusCode = 302
        res.send(spotifyApi.createAuthorizeURL(config.spotify_scopes, config.spotify_state))
    } else {
        res.statusCode = 500
        res.send(error)
    }
}

app.use((req, res, next) => {
    if (req.path === config.spotify_redirect) {
        next()
    } else {
        if (isTokenValid()) {
            next()
        } else {
            res.redirect(spotifyApi.createAuthorizeURL(config.spotify_scopes, config.spotify_state))
        }
    }
})

app.get('/', (req, res) => {
    res.sendFile(path.resolve(__dirname, './index.html'))
})

app.get('/callback', (req, res) => {
    if (req.query.error) {
        console.error('Error : ', req.query.error)
        res.statusCode = 500
        res.send('An error occurred')
    } else if (!req.query.code) {
        console.error('Error while getting code, got ', req.query.code || 'nothing')
        res.statusCode = 500
        res.send('An error occurred')
    } else if (req.query.state !== config.spotify_state) {
        console.error('Error while getting state, got ', req.query.state || 'nothing')
        res.statusCode = 500
        res.send('An error occurred')
    } else {
        setTokens(req.query.code)
        res.sendFile(path.resolve(__dirname, './success.html'))
    }
})

app.get('/api/artist', (req, res) => {
    console.info(new Date(Date.now()), ' : /api/artist')
    spotifyApi.getArtist('2hazSY4Ef3aB9ATXW7F5w3').then(
        (data) => {
            res.send(data.body)
        },
        (error) => {
            spotifyErrorHandler(error, res)
        }
    )
})

app.get('/api/albums', (req, res) => {
    console.info(new Date(Date.now()), ' : /api/albums')
    spotifyApi.getArtistAlbums('43ZHCT0cAZBISjO8DG9PnE').then(
        (data) => {
            res.send(data.body)
        },
        (error) => {
            spotifyErrorHandler(error, res)
        }
    )
})

app.get('/api/user', (req, res) => {
    console.info(new Date(Date.now()), ' : /api/user')
    spotifyApi.getMe().then(
        (data) => {
            res.send(data.body)
        },
        (error) => {
            spotifyErrorHandler(error, res)
        }
    )
})

app.listen(config.application_port, config.application_adress, () => {
    console.info(new Date(Date.now()), ` : Server listening on ${config.application_adress}:${config.application_port}`)
})
