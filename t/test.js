var path = require('path')
var test = require('tape')
var nock = require('nock')
var hyperquest = require('hyperquest')
var { pipe, concat, through } = require('mississippi')
var FeedMe = require('feedme')

var Crawler = require('../crawler')

test('https://text.baldanders.info/index.xml', t => {
  var home = 'https://text.baldanders.info/'
  var xml = 'index.xml'
  var headers = { 'user-agent': 'hoge/123' }

  function setup () {
    return nock(home)
      .get(`/${xml}`)
      .replyWithFile(
        200,
        path.join(__dirname, `documents/${xml}`),
        {
          'content-type': 'application/xml'
        }
      )
  }

  t.test('new Crawler().request(uri, options, done)', t => {
    setup()

    var crawler = new Crawler()
    var parser = new FeedMe(true)
    var uri = String(new URL(xml, home))
    crawler.request(uri, { headers }, (error, res) => {
      t.error(error)
      t.is(Number(res.statusCode), 200)
      pipe(
        res,
        parser,
        error => {
          t.error(error)
          t.is((parser.done()).title, 'text.Baldanders.info')
          t.end()
        }
      )
    })
  })

  t.test('new Crawler().request(uri, options, done)', t => {
    setup()

    var crawler = new Crawler()
    var parser = new FeedMe(true)
    var uri = String(new URL(xml, home))
    var stream = crawler.createStream({
      rss (uri, res, ...args) {
        var done = args[args.length - 1]
        pipe(
          res,
          parser,
          error => {
            var result = parser.done()
            error ? done(error) : done(null, { ...result, feed_url: uri })
          }
        )
      }
    })

    pipe(
      stream,
      concat(([ result ]) => {
        t.is(result.title, 'text.Baldanders.info')
        t.is(result.feed_url, uri)
      }),
      error => {
        t.error(error)
        t.end()
      }
    )

    stream.end([ 'rss', uri, { headers }, null ])
  })

  t.end()
})
