var EventEmitter = require('events')
var xtend = require('xtend')
var backoff = require('backoff')
var inherits = require('inherits')
var hyperquest = require('hyperquest')
var { parallel } = require('mississippi')
var defaults = require('./defaults')

function Crawler (options) {
  if (!(this instanceof Crawler)) return new Crawler(options)
  options = xtend(options)
  this.config = {}

  this.config.parallelStream = xtend(
    defaults.parallelStream,
    options.parallelStream
  )
  this.config.backoff = xtend(
    defaults.backoff,
    options.backoff
  )
  this.config.request = xtend(
    defaults.request,
    options.request
  )

  this.headersMap = new Map()
  EventEmitter.call(this)
}

inherits(Crawler, EventEmitter)
module.exports = Crawler

Crawler.prototype.createStream = function (mapper = {}) {
  var me = this
  var { parallelStream } = this.config
  var { parallel: max, options: parallelOptions } = parallelStream

  return parallel(max, parallelOptions, (line, done) => {
    var [ type, uri, options, ...args ] = line
    me.request(uri, options, (error, response) => {
      if (error) {
        me.emit('error', error)
        return done()
      }

      if (mapper[type]) {
        var xargs = [ uri, response, ...args, done ]
        return mapper[type].apply(null, xargs)
      }

      done(null, response)
    })
  })
}

Crawler.prototype.request = function (uri, options, done) {
  var _request = this._request.bind(this)
  var call = backoff.call(_request, uri, options, done)
  call.retryIf(error => (
    Number(error.status || error.statusCode) === 503 ||
    /ENOTFOUND/.test(String(error))
  ))
  call.setStrategy(new backoff.ExponentialStrategy())
  call.failAfter(this.config.backoff.failAfter)
  call.start()
}

Crawler.prototype._request = function (uri, _options, done) {
  var me = this
  var redirect = null
  var redirectCount = 0
  var options = mixOptions(this.config.request.options, _options)
  _request(uri, options)

  function _request (uri, options) {
    var headers = me.getHeadersMap(uri)
    if (headers) options = mixOptions(options, { headers })
    var req = hyperquest(uri, options)
    req.uri = uri
    req.on('error', error => done(error))
    req.on('response', res => {
      me.emit('response', res)

      redirect = isRedirect(req, res) && res.headers.location

      if (redirect) {
        if ((redirectCount += 1) >= me.config.request.redirect) {
          return done(createRedirectError(req, res))
        }

        _request(
          String(new URL(redirect, uri)),
          mixOptions(options, { headers: { referer: uri } })
        )
        redirect = null
        return null
      }

      var statusCode = Number(res.statusCode)
      if (statusCode === 304) return done()
      if (statusCode !== 200) return done(createStatusCodeError(req, res))
      if (res.headers.etag || res.headers['last-modified']) {
        me.setHeadersMap(uri, res)
      }
      done(null, res)
    })

    me.emit('request', req)
  }

  function createRedirectError (req, res) {
    var msg = `response was redirected too many ${redirectCount}`
    var error = new Error(msg)
    error.request = req
    error.response = res
    return _toJSON(error)
  }

  function createStatusCodeError (req, res) {
    var msg = `httpError: ${res.statusCode} ${uri}`
    var error = new Error(msg)
    error.request = req
    error.response = res
    return _toJSON(error)
  }

  function _toJSON (error) {
    error.toJSON || (error.toJSON = function () {
      return {
        message: this.messsage,
        request: this.request,
        response: this.response
      }
    })
    return error
  }
}

Crawler.prototype.getHeadersMap = function (uri) {
  return this.headersMap.get(uri)
}

Crawler.prototype.setHeadersMap = function (uri, res) {
  var headers = {}
  if (res.headers.etag) headers['if-none-match'] = res.headers.etag
  if (res.headers['last-modified']) {
    headers['if-modified-since'] = res.headers['last-modified']
  }
  this.headersMap.set(uri, headers)
}

function isRedirect (req, res) {
  var statusCode = Number(res.statusCode)
  var method = req.method || (req.request && req.request.method)
  return (
    method === 'GET' &&
    res.headers.location && (
      statusCode === 301 ||
      statusCode === 302 ||
      statusCode === 307 ||
      statusCode === 308
    )
  )
}

function mixOptions (a, b) {
  a = xtend(a)
  b = xtend(b)
  var headers = xtend(a.headers, b.headers)
  return xtend(a, b, { headers })
}
