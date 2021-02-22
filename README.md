# crawler

## usage

```js
var fs = require('fs')
var split2 = require('split2')
var { pipe, pipeline, through } = require('mississippi')
var FeedMe = require('feedme')
var Crawler = require('@ishiduca/crawler')
var crawler = new Crawler()
var interval = 1000 * 60 * 60 * 6 // 6h
var feeds = {
  rss: './rss/index.ndjson'
}
// rss/index.ndjson
// ["https://example.com/rss.xml",{"headers":{{"user-agent":"***"}}]

var mapper = {
  rss (feed_url, response, ...args) {
    var done = args[ args.length - 1 ]
    var parser = new FeedMe(true)
    pipe(
      response,
      parser,
      error => {
        if (error) return done(error)
        var feed = parser.done()
        done(null, { ...feed, feed_url })
      }
    )
  }
}

start()

function start () {
  var source = pipeline.obj(
    fs.createReadStream(feeds.rss),
    split2(JSON.parse),
    through.obj((line, _, done) => {
      done(null, [ 'rss', ...line ])
    })
  )

  pipe(
    source,
    crawler.createStream(mapper),
    through.obj((feed, _, done) => {
      api.seveFeedItems(feed, (error, diff) => {
        if (error) return done(error)
        api.sendEmail(diff, (error) => {
          done(error)
        })
      })
    }),
    error => {
      if (error) console.error(error)
      setTimeout(() => start(), interval)
    }
  )
}
```
