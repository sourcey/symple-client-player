# Symple Client Player

The Symple JavaScript client player implements live media streaming in the browser using the Symple messaging protocol.

Supported streaming methods media types include:

* WebRTC (H.264)
* Flash (Speex, FLV, H.263, H.264)
* HTML5 (MJPEG)

## What is Symple?

Symple is a unrestrictive real-time messaging and presence protocol.

The protocol itself is semantically similar to XMPP, except that it is much more flexible and economical due to the use of JSON instead of XML for encoding messages.

Symple currently has client implementations in [JavaScript](https://github.com/sourcey/symple-client), [Ruby](https://github.com/sourcey/symple-client-ruby) and [C++](https://github.com/sourcey/libsourcey/tree/master/src/symple), which make it ideal for a wide range of messaging requirements, such as building real-time games and applications which run in the web browser, desktop, and mobile phone.

## Dependencies

The Symple JavaScript client player relies on the following third party libraries:

* [JQuery](http://jquery.com/)
* [Socket.IO](http://socket.io)
* [Symple JavaScript Client](https://github.com/sourcey/symple-client)

## Symple Projects

Node.js server: https://github.com/sourcey/symple-server-node  
JavaScript client: https://github.com/sourcey/symple-client  
Ruby client: https://github.com/sourcey/symple-client-ruby  
C++ client: https://github.com/sourcey/libsourcey/tree/master/src/symple  

## Contributing

1. Fork it
2. Create your feature branch (`git checkout -b my-new-feature`)
3. Commit your changes (`git commit -am 'Add some feature'`)
4. Push to the branch (`git push origin my-new-feature`)
5. Create new Pull Request

## Contact

For more information please check out the Symple homepage: http://sourcey.com/symple/  
For bugs and issues please use the Github issue tracker: https://github.com/sourcey/symple-client/issues
