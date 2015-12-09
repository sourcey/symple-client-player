// -----------------------------------------------------------------------------
// Flash => Javascript Object Bridge
//
var JFlashBridge = {
    items: {},

    bind: function(id, klass) {
        Symple.log('JFlashBridge: Bind: ', id, klass);
        this.items[id] = klass;
    },

    unbind: function(id) {
       delete this.items[id]
    },

    call: function() {
        //Symple.log('JFlashBridge: Call: ', arguments);
        var klass = this.items[arguments[0]];
        if (klass) {
            var method = klass[arguments[1]];
            if (method)
                method.apply(klass, Array.prototype.slice.call(arguments, 2));
            else
                Symple.log('JFlashBridge: No method: ', arguments[1]);
        }
        else
            Symple.log('JFlashBridge: No binding: ', arguments);
    },

    getSWF: function(movieName) {
        if (navigator.appName.indexOf("Microsoft") != -1)
            return window[movieName];
        return document[movieName];
    }
};


// -----------------------------------------------------------------------------
// Flash Engine
//
Symple.Media.registerEngine({
    id: 'Flash',
    name: 'Flash Player',
    // FLV-Speex is also an option, but currently omitted because of 
    // different flash player versions with inconsistent playback.
    formats: 'MJPEG, FLV, Speex', 
    preference: 40,
    support: (function() {
        return true;
    })()
});

Symple.Player.Engine.Flash = Symple.Player.Engine.extend({
    init: function(player) {
        Symple.log("SympleFlashEngine: Init");
        this._super(player);
        this.initialized = false;
        this.streamOnInit = false;
        this.id = "symple-player-" + Symple.randomString(6);
    },

    setup: function() {
        Symple.log("SympleFlashEngine: Create");
        this.initialized = false;
        this.player.screen.prepend('<div id="' + this.id + '">Flash version 10.0.0 or newer is required.</div>');
        
        JFlashBridge.bind(this.id, this);
        
        //Symple.log("SympleFlashEngine: SWF:", this.id, this.player.options.htmlRoot + '/symple.player.swf');
        swfobject.embedSWF(
            this.player.options.swf ? 
                this.player.options.swf : 
                this.player.options.htmlRoot + '/symple.player.swf', 
            this.id, '100%', '100%', '10.0.0',
            this.player.options.htmlRoot + '/playerProductInstall.swf', {
                //debug: true, // enable for debug output
            }, {
                quality: 'high',
                wmode: 'transparent',
                allowScriptAccess: 'sameDomain',
                allowFullScreen: 'true'
            }, {
                name: this.id
            });              
            
        
        // Flash swallows click events, so catch mousedown 
        // events and trigger click on screen element.        
        var self = this;
        this.player.screen.mousedown(function() {
            self.player.screen.trigger('click')
        });      
    },

    play: function(params) {        
        Symple.log("SympleFlashEngine: Play", params);        
        this.params = params;
        if (this.initialized) {
            Symple.log("SympleFlashEngine: Opening", params);
            this.swf().open(params);
            
            // Push through any pending candiates
            if (this.candidates) {
                for (var i = 0; i < this.candidates.length; i++) {
                    Symple.log("SympleFlashEngine: Add stored candidate", this.candidates[i]);
                    this.swf().addCandidate(this.candidates[i]);
                }
            }
        }
        else {            
            Symple.log("SympleFlashEngine: Waiting for SWF");
            this.streamOnInit = true;
        }
    },

    stop: function() {
        Symple.log("SympleFlashEngine: Stop");
        if (this.initialized) {
            this.swf().close();
            this.setState('stopped'); // No need to wait for callback
        }
    },

    swf: function() {
        return JFlashBridge.getSWF(this.id);
    },

    isJSReady: function() {
        Symple.log("SympleFlashEngine: JavaScript Ready: " + $.isReady);
        return $.isReady;
    },

    refresh: function() {
        Symple.log("SympleFlashEngine: Refresh");
        try {
          if (this.initialized)
            this.swf().refresh();
        } catch (e) {}
    },
    
    onRemoteCandidate: function(candidate) {
        if (this.params && this.params.url)
            throw "Cannot add candiate after explicit URL was provided."
           
        if (this.initialized) {
            Symple.log("SympleFlashEngine: Adding remote candiate ", candidate);
            this.swf().addCandiate(candidate);
        }        
        else {      
            Symple.log("SympleFlashEngine: Storing remote candiate ", candidate);
              
            // Store candidates while waiting for flash to load
            if (!this.candidates)
                this.candidates = [];      
            this.candidates.push(candidate);
        }            
    },
        
    onSWFLoaded: function() {
        Symple.log("SympleFlashEngine: Loaded");
        this.initialized = true;
        if (this.streamOnInit)     
            this.play(this.params);
    },

    onPlayerState: function(state, error) {
        // None, Loading, Playing, Paused, Stopped, Error
        state = state.toLowerCase();
        if (state == 'error' && (!error || error.length == 0))
            error = "Streaming connection to the host was lost."
        Symple.log("SympleFlashEngine: On state: ", state, error, this.player.state);
        if (state != 'none')
            this.setState(state, error);
    },

    onMetadata: function(data) {
        //Symple.log("SympleFlashEngine: Metadata: ", data);
        if (data && data.length) {
            var status = '';
            for (var i = 0; i < data.length; ++i) {
                status += data[i][0];
                status += ': ';
                status += data[i][1];
                status += '<br>';
            }
            this.player.displayStatus(status);
        }
    },

    onLogMessage: function(type, text) {
        Symple.log('SympleFlashEngine: ' + type + ': ' + text);
    }
});
Symple.Media = {
    engines: {}, // Object containing references for candidate selection
    
    registerEngine: function(engine) {
        Symple.log('Register media engine: ', engine)
        if (!engine.name || typeof engine.preference == 'undefined' || typeof engine.support == 'undefined') {
            Symple.log('Cannot register invalid engine: ', engine)
            return false;
        }   
        this.engines[engine.id] = engine;
        return true;
    },
    
    hasEngine: function(id) {
        return typeof this.engines[id] == 'object';
    },
    
    // Checks support for a given engine
    supportsEngine: function(id) {
        // Check support for engine
        return !!(this.hasEngine(id) && this.engines[id].support);
    },
    
    // Checks support for a given format
    supportsFormat: function(format) {
        // Check support for engine
        return !!preferredEngine(format);
    },
    
    // Returns a list of compatible engines sorted by preference
    // The optional format argument further filters by engines 
    // which don't support the given media format.
    compatibleEngines: function(format) {          
        var arr = [], engine;
        // Reject non supported or disabled
        for (var item in this.engines) {   
            engine = this.engines[item];
            if (engine.preference == 0) 
                continue;
            Symple.log('Symple Media: Supported: ', engine.name, engine.support)            
            if (engine.support == true)        
                arr.push(engine)
        }
        // Sort by preference
        arr.sort(function (a, b) {
            if (a.preference < b.preference) return 1;
            if (a.preference > b.preference) return -1;
        });
        return arr
    },
    
    // Returns the highest preference compatible engine
    // The optional format argument further filters by engines 
    // which don't support the given media format.
    preferredCompatibleEngine: function(format) {    
        var arr = this.compatibleEngines(format), engine;  
        engine = arr.length ? arr[0] : null;
        Symple.log('Symple Media: Preferred Engine: ', engine);
        return engine; 
    },

    // Returns the optimal video resolution for the current device
    // TODO: Different aspect ratios
    getOptimalVideoResolution: function() {
        var w = $(window).width();
        var width = w > 800 ?
          800 : w > 640 ?
          640 : w > 480 ?
          400 : w > 320 ?
          320 : w > 240 ?
          240 : w > 160 ?
          160 : w > 128 ?
          128 : 96;
        var height = width * 0.75;
        return [width, height];
    },
    
    buildURL: function(params) { 
        var query = [], url, addr = params.address;       
        url = addr.scheme + '://' + addr.host + ':' + addr.port + (addr.uri ? addr.uri : '/');                     
        for (var p in params) {
            if (p == 'address') 
                continue;
            query.push(encodeURIComponent(p) + "=" + encodeURIComponent(params[p]));
        }
        query.push('rand=' + Math.random());
        url += '?';
        url += query.join("&");  
        return url;
        
    },
    
    // Rescales video dimensions maintaining perspective
    // TODO: Different aspect ratios
    rescaleVideo: function(srcW, srcH, maxW, maxH) {
        //Symple.log('Symple Player: Rescale Video: ', srcW, srcH, maxW, maxH);
        var maxRatio = maxW / maxH;
        var srcRatio = 1.33; //srcW / srcH;
        if (srcRatio < maxRatio) {
            srcH = maxH;
            srcW = srcH * srcRatio;
        } else {
            srcW = maxW;
            srcH = srcW / srcRatio;
        }
        return [srcW, srcH];
    },
        
    // Basic checking for ICE style streaming candidates
    // TODO: Latency checks and best candidate switching
    checkCandidate: function(url, fn) {
        Symple.log('Symple Media: Checking candidate: ', url);

        var xhr;
        if (window.XMLHttpRequest) {
            xhr = new XMLHttpRequest();
        } else if (window.ActiveXObject) {
            xhr = new ActiveXObject("Microsoft.XMLHTTP");
        } else {
            fn(url, false);
            return;
        }

        xhr.onreadystatechange = function() {
            //Symple.log('Symple Media: Candidate state', xhr.readyState, xhr.status);

            if (xhr.readyState == 2) {
                if (fn) {
                    Symple.log('Symple Media: Candidate result: ', xhr.readyState, xhr.status);
                    fn(url, xhr.status == 200);
                    fn = null;

                    // Safari on windows crashes when abort is called from inside
                    // the onreadystatechange callback.
                    setTimeout(function() {
                        xhr.abort();
                    }, 0);
                }
            }
            else if (xhr.readyState == 4/* && xhr.status != 0*/) {
                if (fn) {
                    Symple.log('Symple Media: Candidate result: ', xhr.readyState, xhr.status);
                    fn(url, /*xhr.status == 200*/true);
                    fn = null;
                }
            }
        };
        xhr.open('GET', url, true);
        xhr.send(null);
    },
};

// ----------------------------------------------------------------------------
//  Symple Player
//
//  Online video streaming for everyone
//  Requires JQuery
//
Symple.Player = Symple.Class.extend({
    init: function(options) {
        // TODO: Use our own options extend
        this.options = $.extend({ //Symple.extend({
            htmlRoot:       '/javascripts/symple',
            element:        '.symple-player:first',
            
            format:         'MJPEG',      // The media format to use (MJPEG, FLV, Speex, ...)
            engine:         undefined,    // Engine class name, can be specified or auto detected 
            
            //screenWidth:    '100%',       // player screen css width (percentage or pixel value)
            //screenHeight:   '100%',       // player screen css height (percentage or pixel value)
            //showStatus:     false,
            //assertSupport:  false,        // throws an exception if no browser support for given engine

            // Callbacks
            onCommand:       function(player, cmd) { },
            onStateChange:   function(player, state) { },
            
            // Markup
            template: '\
            <div class="symple-player">\
                <div class="symple-player-message"></div>\
                <div class="symple-player-status"></div>\
                <div class="symple-player-loading"></div>\
                <div class="symple-player-screen"></div>\
                <div class="symple-player-controls">\
                    <a class="play-btn" rel="play" href="#">Play</a>\
                    <a class="stop-btn" rel="stop" href="#">Stop</a>\
                    <a class="fullscreen-btn" rel="fullscreen" href="#">Fullscreen</a>\
                </div>\
            </div>'

        }, options);

        this.element = $(this.options.element);
        if (!this.element.hasClass('symple-player')) {
            this.element.html(this.options.template);
            this.element = this.element.children('.symple-player:first');
        }
        if (!this.element.length)
            throw 'Player element not found';
        
        this.screen = this.element.find('.symple-player-screen');
        if (!this.screen.length)
            throw 'Player screen element not found';
        
        // Depreciated: Screen is always 100% unless speified otherwise via CSS
        //if (this.options.screenWidth)
        //    this.screen.width(this.options.screenWidth);
        //if (this.options.screenHeight)
        //    this.screen.height(this.options.screenHeight);
            
        this.message = this.element.find('.symple-player-message')
        if (!this.message.length)
            throw 'Player message element not found';

        // Try to choose the best engine if none was given
        if (typeof this.options.engine  == 'undefined') {
            var engine = Symple.Media.preferredCompatibleEngine(this.options.format);
            if (engine)
                this.options.engine = engine.id;
        }

        this.bindEvents();
        this.playing = false;

        Symple.log(this.options.template)

        //this.setState('stopped');
        //var self = this;
        //$(window).resize(function() {
        //    self.refresh();
        //});
    },

    setup: function() {
        var id = this.options.engine;
        
        // Ensure the engine is configured
        if (!id)
            throw "Streaming engine not configured. Please set 'options.engine'";  
        
        // Ensure the engine exists
        if (!Symple.Media.hasEngine(id))
            throw "Streaming engine not available: " + id;                          
        if (typeof Symple.Player.Engine[id] == 'undefined')
            throw "Streaming engine not found: " + id;       
            
        // Ensure the engine is supported  
        if (!Symple.Media.supportsEngine(id))     
            throw "Streaming engine not supported: " + id;   
                 
        // Instantiate the engine          
        this.engine = new Symple.Player.Engine[id](this);
        this.engine.setup();  
        
        this.element.addClass('engine-' + id.toLowerCase())    
    },
    
    //
    // Player Controls
    //
    play: function(params) {
        Symple.log('Symple Player: Play: ', params)
        try {    
            if (!this.engine)
                this.setup();
        
            if (this.state != 'playing' //&&
                // The player may be set to loading state by the
                // outside application before play is called.
                //this.state != 'loading'
                ) {
                this.setState('loading');
                this.engine.play(params); // engine updates state to playing
            }
        } catch (e) {
            this.setState('error');      
            this.displayMessage('error', e)
            throw e;
        } 
    },

    stop: function() {
        Symple.log('Symple Player: Stop')
        if (this.state != 'stopped') {
            if (this.engine)
                this.engine.stop(); // engine updates state to stopped
        }
    },

    destroy: function() {
        if (this.engine)
            this.engine.destroy();
        this.element.remove();
    },

    setState: function(state, message) {
        Symple.log('Symple Player: Set state:', this.state, '=>', state, message)
        if (this.state == state)
            return;
        
        this.state = state;
        this.displayStatus(null);
        this.playing = state == 'playing';
        if (message)
            this.displayMessage(state == 'error' ? 'error' : 'info', message);
        else
            this.displayMessage(null);
        this.element.removeClass('state-stopped state-loading state-playing state-paused state-error');
        this.element.addClass('state-' + state);
        //this.refresh();
        this.options.onStateChange(this, state, message);
    },

    //
    // Helpers
    //
    displayStatus: function(data) {
        this.element.find('.symple-player-status').html(data ? data : '');
    },

    // Display an overlayed player message
    // error, warning, info
    displayMessage: function(type, message) {
        Symple.log('Symple Player: Display message:', type, message)
        if (message) {
            this.message.html('<p class="' + type + '-message">' + message + '</p>').show();
        }
        else {
            this.message.html('').hide();
        }
    },

    bindEvents: function() {
        var self = this;
        this.element.find('.symple-player-controls a').unbind().bind('click tap', function() {
            self.sendCommand(this.rel, $(this));
            return false;
        })
    },

    sendCommand: function(cmd, e) {
        if (!this.options.onCommand ||
            !this.options.onCommand(this, cmd, e)) {

            // If there is no command callback function or the callback returns
            // false then we process these default behaviours.
            switch(cmd) {
              case 'play':
                  this.play();
                  break;
              case 'stop':
                  this.stop();
                  break;
              case 'fullscreen':
                  this.toggleFullScreen();
                  break;
            }
        }
    },

    getButton: function(cmd) {
        return this.element.find('.symple-player-controls [rel="' + cmd + '"]');
    },
    
    // TODO: Toggle actual player element
    toggleFullScreen: function() {  
        if (Symple.runVendorMethod(document, "FullScreen") || Symple.runVendorMethod(document, "IsFullScreen")) {
            Symple.runVendorMethod(document, "CancelFullScreen");
        }
        else {
            Symple.runVendorMethod(this.element[0], "RequestFullScreen");
        }
    }
})


// -----------------------------------------------------------------------------
// Player Engine Interface
//
Symple.Player.Engine = Symple.Class.extend({
    init: function(player) {
        this.player = player;        
        this.fps = 0;
        this.seq = 0;
    },

    support: function() { return true; },
    setup: function() {},
    destroy: function() {},
    play: function(params) { 
        this.params = params || {};
        if (!this.params.url && typeof(params.address) == 'object')
            this.params.url = this.buildURL();
    },
    stop: function() {},
    pause: function(flag) {},
    mute: function(flag) {},
    //refresh: function() {},

    setState: function(state, message) {
        this.player.setState(state, message);
    },
    
    setError: function(error) {
        Symple.log('Symple Player Engine: Error:', error);
        this.setState('error', error);
    },
    
    onRemoteCandidate: function(candidate) {
        Symple.log('Symple Player Engine: Remote candidates not supported.');
    },

    updateFPS: function() {
        if (typeof this.prevTime == 'undefined')
            this.prevTime = new Date().getTime();
        if (this.seq > 0) {
            var now = new Date().getTime();
            this.delta = this.prevTime ? now - this.prevTime : 0;
            this.fps = (1000.0 / this.delta).toFixed(3);
            this.prevTime  = now;
        }
        this.seq++;
    },
    
    displayFPS: function() {
        this.updateFPS()
        this.player.displayStatus(this.delta + " ms (" + this.fps + " fps)");
    },
    
    buildURL: function() {    
        if (!this.params)
            throw 'Streaming parameters not set'
        if (!this.params.address)
            this.params.address = this.player.options.address;
        return Symple.Media.buildURL(this.params);
    }
});




    /*
    refresh: function() {
        if (this.engine)
            this.engine.refresh();
    },

    refresh: function() {
        var css = { position: 'relative' };
        if (this.options.screenWidth == '100%' ||
            this.options.screenHeight == '100%') {
            var size = this.rescaleVideo(this.screen.outerWidth(), this.screen.outerHeight(),
                this.element.outerWidth(), this.element.outerHeight());
            css.width = size[0];
            css.height = size[1];
            css.left = this.element.outerWidth() / 2 - css.width / 2;
            css.top = this.element.outerHeight() / 2 - css.height / 2;
            css.left = css.left ? css.left : 0;
            css.top = css.top ? css.top : 0;
            if (this.engine)
                this.engine.resize(css.width, css.height);
        }
        else {
            css.width = this.options.screenWidth;
            css.height = this.options.screenHeight;
            css.left = this.element.outerWidth() / 2 - this.options.screenWidth / 2;
            css.top = this.element.outerHeight() / 2 - this.options.screenHeight / 2;
            css.left = css.left ? css.left : 0;
            css.top = css.top ? css.top : 0;
        }
        Symple.log('Symple Player: Setting Size: ', css);

        this.screen.css(css);

        //var e = this.element.find('#player-screen');
          //Symple.log('refresh: scaled:', size)
          Symple.log('refresh: screenWidth:', this.options.screenWidth)
          Symple.log('refresh: width:', this.screen.width())
          Symple.log('refresh: screenHeight:', this.options.screenHeight)
          Symple.log('refresh: height:', this.screen.height())
          Symple.log('refresh: css:', css)
    },
     
    getBestEngineForFormat: function(format) {
        var ua = navigator.userAgent;
        var isMobile = Symple.isMobileDevice();
        var engine = null;
        
        // TODO: Use this function with care as it is not complete.      
        // TODO: Register engines which we can iterate to check support.
        // Please feel free to update this function with your test results!  
        
        //
        // MJPEG
        //
        if (format == "MJPEG") {

            
            // Most versions of Safari has great MJPEG support.
            // BUG: The MJPEG socket is not closed until the page is refreshed.
            if (ua.match(/(Safari|iPhone|iPod|iPad)/)) {
                
                // iOS 6 breaks native MJPEG support.
                if (Symple.iOSVersion() > 6)
                    engine = 'MJPEGBase64MXHR';
                else
                    engine = 'MJPEG';
            }

            // Firefox to the rescue! Nag user's to install firefox if MJPEG
            // streaming is unavailable.
            else if(ua.match(/(Mozilla)/))
                engine = 'MJPEG';

            // Android's WebKit has disabled multipart HTTP requests for some
            // reason: http://code.google.com/p/android/issues/detail?id=301
            else if(ua.match(/(Android)/))
                engine = 'MJPEGBase64MXHR';

            // BlackBerry doesn't understand multipart/x-mixed-replace ... duh
            else if(ua.match(/(BlackBerry)/))
                engine = 'PseudoMJPEG';

            // Opera does not support mjpeg MJPEG, but their home grown image
            // processing library is super fast so pseudo streaming is nearly
            // as fast as other native MJPEG implementations!
            else if(ua.match(/(Opera)/))
                engine = isMobile ? 'MJPEGBase64MXHR' : 'Flash'; //PseudoMJPEG

            // Internet Explorer... nuff said
            else if(ua.match(/(MSIE)/))
                engine = isMobile ? 'PseudoMJPEG' : 'Flash';

            // Display a nag screen to install a real browser if we are in
            // pseudo streaming mode.
            if (engine == 'PseudoMJPEG') { //!forcePseudo &&
                this.displayMessage('warning',
                    'Your browser does not support native streaming so playback preformance will be severely limited. ' +
                    'For the best streaming experience please <a href="http://www.mozilla.org/en-US/firefox/">download Firefox</a> .');
             }
        }
         
         
        //
        // FLV
        //
        else if (format == "FLV") {
            if (Symple.isMobileDevice())
                throw 'FLV not supported on mobile devices.'
            engine = 'Flash';                
        }
        
        else 
            throw 'Unknown media format: ' + format
        
        return engine;
        if (!document.fullscreenElement &&    // alternative standard method
            !document.mozFullScreenElement && !document.webkitFullscreenElement) {  // current working methods
            if (document.documentElement.requestFullscreen) {
                document.documentElement.requestFullscreen();
            } else if (document.documentElement.mozRequestFullScreen) {
                document.documentElement.mozRequestFullScreen();
            } else if (document.documentElement.webkitRequestFullscreen) {
                document.documentElement.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
            }
        } 
        else {
            if (document.cancelFullScreen) {
                document.cancelFullScreen();
            } else if (document.mozCancelFullScreen) {
                document.mozCancelFullScreen();
            } else if (document.webkitCancelFullScreen) {
                document.webkitCancelFullScreen();
            }
        }
        */
Symple.Media.BrowserCompatabilityMsg = '\
    <br>Download the latest version <a href="www.google.com/chrome/">Chrome</a> or \
    <a href="http://www.apple.com/safari/">Safari</a> to view this video stream.'

// -----------------------------------------------------------------------------
// Native MJPEG Engine
//
// - Works in Firefox, Chrome and Safari except iOS >= 6.
//
Symple.Media.registerEngine({
    id: 'MJPEG',
    name: 'MJPEG Native',
    formats: 'MJPEG',
    preference: 60,
    defaults: {
        framing: 'multipart'
    },
    support: (function() {
        var ua = navigator.userAgent;
        var iOS = Symple.iOSVersion();
        return !!(ua.match(/(Firefox|Chrome)/) || 
            // iOS < 6 or desktop safari
            (iOS ? iOS < 6 : ua.match(/(Safari)/)));
    })()
});

Symple.Player.Engine.MJPEG = Symple.Player.Engine.extend({
    init: function(player) {
        this._super(player);
        this.img = null;
    },

    play: function(params) {    
        //params = params || {};
        //params.framing = 'multipart'; // using multipart/x-mixed-replace
        Symple.log("MJPEG Native: Play", params);
        
        if (this.img)
          throw 'Streaming already initialized'
          
        this._super(params);
        
        // TODO: Some kind of connection timeout
        
        //this.params = params;
        //this.params.url = this.buildURL();        
        //if (!this.params.url)
        //  throw 'Invalid streaming URL'
        
        var self = this;
        var init = true;
        this.img = new Image();
        //this.img.style.width = '100%';  // constraints set on screen element
        //this.img.style.height = '100%';
        this.img.style.display = 'none';
        this.img.onload = function() {
            Symple.log("MJPEG Native: Success");
        
            // Most browsers inclusing WebKit just call onload once.
            if (init) {
                if (self.img)
                    self.img.style.display = 'inline';
                self.setState('playing');
                init = false;
            }
            
            // Some browsers, like Firefox calls onload on each 
            // multipart segment, so we can display status.
            else
                self.displayFPS();
        }
        
        // NOTE: This never fires in latest chrome  
        // when the remote side disconnects stream.
        this.img.onerror = function() {
            self.setError('Streaming connection failed.' + 
                Symple.Media.BrowserCompatabilityMsg);
        }
        this.img.src = this.params.url; // + "&rand=" + Math.random();
        this.player.screen.prepend(this.img);        
    },

    stop: function() {
        Symple.log("MJPEG Native: Stop");
        this.cleanup();
        this.setState('stopped');
    },
    
    cleanup: function() {
        if (this.img) {
            this.img.style.display = 'none';
            this.img.src = "#"; // closes the socket in ff, but not webkit
            this.img.onload = new Function;
            this.img.onerror = new Function;
            this.player.screen[0].removeChild(this.img);
            this.img = null;
        }
    },
    
    setError: function(error) {
        Symple.log('Symple MJPEG Engine: Error:', error);
        this.cleanup();
        this.setState('error', error);
    }
});


// -----------------------------------------------------------------------------
// MJPEG WebSocket Engine
//
// Requires HyBi binary WebSocket support.
// Available in all the latest browsers:
// http://en.wikipedia.org/wiki/WebSocket
//
Symple.Media.registerEngine({
    id: 'MJPEGWebSocket',
    name: 'MJPEG WebSocket',
    formats: 'MJPEG',
    preference: 50,
    support: (function() {
        window.WebSocket = window.WebSocket || window.MozWebSocket;
        window.URL = window.URL || window.webkitURL || window.mozURL || window.msURL;
        return !!(window.WebSocket && window.WebSocket.CLOSING === 2 && window.URL)
    })()
});

Symple.Player.Engine.MJPEGWebSocket = Symple.Player.Engine.extend({
    init: function(player) {
        this._super(player);
        this.socket = null;
        this.img = null;
    },

    play: function(params) {
        if (this.active())
          throw 'Streaming already active'      
                
        this._super(params);
        this.createImage();
        
        var self = this, init = true;     
        
        Symple.log("MJPEG WebSocket: Play:", this.params);
        this.socket = new WebSocket(this.normalizeURL(this.params.url));
        
        this.socket.onopen = function () {
            Symple.log("MJPEG WebSocket: Open");    
            //self.socket.send('Ping');  
        };                
        this.socket.onmessage = function (e) {
            Symple.log("MJPEG WebSocket: Message: ", e);    
            
            // http://www.adobe.com/devnet/html5/articles/real-time-data-exchange-in-html5-with-websockets.html
            // http://stackoverflow.com/questions/15040126/receiving-websocket-arraybuffer-data-in-the-browser-receiving-string-instead
            // http://stackoverflow.com/questions/9546437/how-send-arraybuffer-as-binary-via-websocket/11426037#11426037        
            if (!self.active()) {
                self.setError('Streaming failed');
                //self.socket.close();
            }
            
            if (init) {
                self.setState('playing');
                init = false;
            }

            // TODO: Image content type
            Symple.log("MJPEG WebSocket: Frame", self, e.data);
            var blob = window.URL.createObjectURL(e.data);     
            self.img.onload = function() {
                window.URL.revokeObjectURL(blob);
            };
            self.img.src = blob;
            self.displayFPS();
        };   
        this.socket.onerror = function (error) {
            // Invalid MJPEG streams will end up here
            self.setError('Invalid MJPEG stream: ' + error + '.');
        };
    },

    stop: function() {
        Symple.log("MJPEG WebSocket: Stop");
        this.cleanup();
        this.setState('stopped');
    },

    active: function(params) {
        return this.img !== null && this.socket !== null;
    },
    
    cleanup: function() {
        Symple.log("MJPEG WebSocket: Cleanup");
        if (this.img) {
            this.img.style.display = 'none';
            this.img.src = "#"; // XXX: Closes socket in ff, but not safari
            this.img.onload = null;
            this.img.onerror = null;
            this.player.screen[0].removeChild(this.img);
            this.img = null;
        }
        if (this.socket) {
            Symple.log("MJPEG WebSocket: Cleanup: Socket: ", this.socket);
            
            // BUG: Not closing in latest chrome,
            this.socket.close()
            this.socket = null;
        }
    },

    createImage: function() { 
        if (!this.img) {
            this.img = new Image();
            this.img.style.width = '100%';
            this.img.style.height = '100%';
            
            // We will end up here if the MJPEG stream is invalid.
            // NOTE: This never fires in latest chrome when the
            // remote side disconnects stream.
            var self = this;
            this.img.onerror = function(e) {
                Symple.log("MJPEG WebSocket: Image load error: ", e);
                //self.setError(
                //  'Invalid MJPEG stream');
            }
            //this.player.screen[0].innerHTML = this.img; 
            this.player.screen.append(this.img); 
        } 
    },
    
    normalizeURL: function(url) {  
      return url.replace(/^http/, 'ws');
    },
    //buildURL: function() {    
    //    return this._super().replace(/^http/, 'ws');
    //},
    
    setError: function(error) {
        Symple.log('MJPEG WebSocket: Error:', error);
        this.cleanup();
        this.setState('error', error);
    }
});

        
// -----------------------------------------------------------------------------
// Multipart HTTP Parser
// 
Symple.MultipartParser = Symple.Class.extend({
    init: function(engine) {
        this.engine = engine;
        this.contentType = null;
        this.boundary = 0;
        this.xhr.numParsed = 0;
    },
    
    process: function(buffer) {
        var res = this.incrParse(buffer);
        if (res[0] > 0) {
            this.processPart(res[1]);
            this.xhr.numParsed += res[0];
            if (buffer.length > this.xhr.numParsed)
                this.processChunk();
        }
    },

    processPart: function(part) { 
        //Symple.log('MultipartParser: processPart: ', this.boundary)
        part = part.replace(this.boundary + "\r\n", '');
        var lines = part.split("\r\n");
        var headers = {};
        while(/^[-a-z0-9]+:/i.test(lines[0])) {
            var header = lines.shift().split(':');
            headers[header[0]] = header[1].trim();
            if (!this.contentType) {
                if (header[0] == 'Content-Type')
                    this.contentType = header[1].trim();
            }
        }
        var payload = lines.join("\r\n");
        this.draw(payload);
    },

    incrParse: function(buffer) {
        //Symple.log('MultipartParser: incrParse: ', this.boundary)
        if (buffer.length < 1) return [-1];
        var start = buffer.indexOf(this.boundary);
        if (start == -1) return [-1];
        var end = buffer.indexOf(this.boundary, start + this.boundary.length);
        // SUCCESS
        if (start > -1 && end > -1) {
            var part = buffer.substring(start, end);
            // end != part.length in wrong response, ignore it
            return [end, part];
        }
        // INCOMPLETE
        return [-1];
    }
});


// -----------------------------------------------------------------------------
// HTTP Chunked Parser
//
Symple.ChunkedParser = Symple.Class.extend({
    init: function(engine) {
        this.engine = engine;
    },
    
    process: function(frame) {       
        var start, 
            nread = 0, 
            pos = frame.indexOf("/9j/");
        while (pos > -1) {
            start = pos;
            pos = frame.indexOf("/9j/", pos + 4);
            if (pos > -1) {
                var image = frame.substr(start, pos);
                this.engine.draw(image);
                nread += image.length;
            }
        }
        return nread;
        
        /*            
        // Image start
        if (frame.indexOf("/9j/") == 0) {        
            Symple.log('Symple ChunkedParser: Got Image Start')
        
            // Draw the current frame
            if (this.currentFrame.length) {
                this.engine.draw(this.currentFrame); 
                this.currentFrame = '';
            }         
        }
        else 
            Symple.log('Symple ChunkedParser: Partial Packet')  
                      
        // Append data to current frame
        this.currentFrame += frame;  
        return frame.length;
        */
    }
});


// -----------------------------------------------------------------------------
// MXHR Base64 MJPEG Engine
//
// - Multipart data must be base64 encoded to use this engine.
// - Base64 encoded data is 37% larger than raw data.
// - Provides last resort playback in browsers that don't support MJPEG natively.
// - Chrome doesn't support multipart/x-mixed-replace over XMLHttpRequest,
//   which is required for some older browsers to trigger readyState == 3.
//   Server side for Chrome should just push data to the client (HTTP Streaming). 
// - Safari WebKit, and Firefox (tested on 15.0.1) parses and removes chunk
//   headers and boundaries for us.
// - The server must use Transfer-Encoding: chunked. Plain old HTTP streaming is
//   not sufficient as packets may be modified by the client.
//
Symple.Media.registerEngine({
    id: 'MJPEGBase64MXHR',
    name: 'MJPEG Base64 MXHR',
    formats: 'MJPEG',
    defaults: {
        framing: 'chunked',
        encoding: 'Base64'
    },
    preference: 30,
    support: (function() {
        return 'XMLHttpRequest' in window;
    })()
});


Symple.Player.Engine.MJPEGBase64MXHR = Symple.Player.Engine.extend({
    init: function(player) {
        this._super(player);
        this.xhrID = 0;
        this.xhrConn = null;
        this.contentType = null;
        this.img = null;
        this.errors = 0;
    },

    play: function(params) {      
        if (this.xhr)
            throw 'Streaming already initialized'
          
        //params.framing = 'chunked';
        //params.encoding = 'Base64';
        this._super(params);
        
        // TODO: Playback timer to set error if not playing after X
        
        //Symple.log('MJPEGBase64MXHR: Play: ', this.params)                
        this.rotateConnection();
    },

    stop: function() {  
        if (this.xhrConn) {
            this.freeXHR(this.xhrConn);
            this.xhrConn = null;
        }             
        //if (this.parser)            
        //    this.parser.flush();
        this.freeImage(this.img);
        this.img = null;
        this.player.screen.html('');
        this.setState('stopped');
    },
    
    rotateConnection: function() {               
        if (!this.params.url)
            throw 'Invalid streaming URL'  
                 
        this.xhrID++;
        var self = this, xhr = this.createXHR();
        
        //Symple.log('MJPEGBase64MXHR: Connecting:', this.xhrID)
        
        xhr.xhrID = this.xhrID;
        xhr.connecting = true;
        xhr.cancelled = false;        
        xhr.onreadystatechange = function() {     
          // Send to onReadyState for parsing media
          self.onReadyState.call(self, this);  
          
          // Connection management logic         
          if (this.readyState == 3) {  
          
              // When the connection is ready we close the old one,
              // and set it as the new media connection.
              if (this.connecting) {
                  this.connecting = false;
                  //Symple.log('MJPEGBase64MXHR: Loaded:', this.xhrID)
                  
                  // Close the old connection (if any)
                  if (self.xhrConn) {
                      //Symple.log('MJPEGBase64MXHR: Freeing Old XHR:', self.xhrConn.xhrID)
                      if (self.xhrConn.xhrID == this.xhrID)
                          throw 'XHR ID mismatch'                          
                      if (self.xhrConn === this)
                          throw 'XHR instance mismatch'
                      
                      // Assign a null callback so we don't receive
                      // readyState 4 for the cancelled connection.
                      self.xhrConn.onreadystatechange = new Function;
                      self.xhrConn.abort();
                      delete self.xhrConn.responseText;
                      self.xhrConn = null;
                  }
                  
                  // Set the new media connection
                  self.xhrConn = this;    
              } 
              
              // Keep memory usage down by recreateing the connection
              // when the XHR responseText buffer gets too large. 
              // Works a treat in Chrome (27.0.1453.110).
              else if (this.cancelled === false && 
                  this.responseText && 
                  this.responseText.length > (1048576 * 2)) {
                  this.cancelled = true;
                  //Symple.log('MJPEGBase64MXHR: Switching Connection:', this.xhrID, this.responseText.length)
                  self.rotateConnection();
              }
          }
        }
        xhr.open('GET', this.params.url, true);
        xhr.send(null);
        xhr = null; // Dereference to ensure destruction
    },

    draw: function(frame) {
        //Symple.log('MJPEGBase64MXHR: Draw:', this.contentType, frame.length) //, frame
                
        if (!this.img) {
            this.img = this.createImage()
            this.player.screen.prepend(this.img);
        }
                    
        this.img.src = 'data:' + this.contentType + ';base64,' + frame;
        this.displayFPS();
    }, 
        
    createXHR: function() {        
        // These versions of XHR are known to work with MXHR
        try { return new ActiveXObject('MSXML2.XMLHTTP.6.0'); } catch(nope) {
            try { return new ActiveXObject('MSXML3.XMLHTTP'); } catch(nuhuh) {
                try { return new XMLHttpRequest(); } catch(noway) {
                    throw new Error('Could not find supported version of XMLHttpRequest.');
                }
            }
        }
    },
    
    freeXHR: function(xhr) {           
        //Symple.log('MJPEGBase64MXHR: Freeing XHR:', xhr.xhrID)
        xhr.canceled = true;
        xhr.abort();    
        xhr.onreadystatechange = new Function;
        delete xhr.responseText;
        xhr = null;
    },
    
    createImage: function(img) {      
        var img = new Image();
        img.self = this;           
        img.style.zIndex = -1; // hide until loaded    
        img.onload = function() {
            Symple.log('MJPEGBase64MXHR: Onload');
            if (this.self.player.state == 'loading')
                this.self.setState('playing');
            this.self.errors = 0; // reset error count
        }        
        img.onerror = function() {              
            Symple.log('MJPEGBase64MXHR: Bad frame: ', frame.length, 
                frame.substr(0, 50), 
                frame.substr(frame.length - 50, frame.length)); // for debuggering
        
            // Set error state after 5 consecutive failures
            this.self.errors++;
            if (this.self.errors == 5 &&
                this.self.player.state == 'loading')
                this.self.setError("Streaming ended. Invalid media format.");
         }
         return img;
    },
    
    freeImage: function(img) {  
        ////Symple.log('MJPEGBase64MXHR: Remove:', img.seq);        
        img.onload = new Function;
        img.onerror = new Function;
        if (img.parentNode)
            img.parentNode.removeChild(img);  
        img = null;   
    },
    
    onReadyState: function(xhr) {
        ////Symple.log('MJPEGBase64MXHR: Ready State Change: ',  xhr.readyState, xhr.xhrID, xhr.numParsed)         
        if (xhr.readyState == 2) {
        
            // If a multipart/x-mixed-replace header is received then we will
            // be parsing the multipart response ourselves.
            var contentTypeHeader = xhr.getResponseHeader("Content-Type");
            //Symple.log('MJPEGBase64MXHR: Content Type Header: ', contentTypeHeader)
            if (contentTypeHeader &&
                contentTypeHeader.indexOf("multipart/") != -1) {
                // TODO: Handle boundaries enclosed in commas
                this.parser = new Symple.MultipartParser(this);
                this.parser.boundary = '--' + contentTypeHeader.split('=')[1];
            }
            
            // If no multipart header was given we are using HTTP streaming 
            // or chunked encoding, our job just got a lot easier!
            else {
                this.parser = new Symple.ChunkedParser(this);
            }
        }
        else if (xhr.readyState == 3) {
            //Symple.log('MJPEGBase64MXHR: Data: ', xhr.readyState)     
        
            if (isNaN(xhr.numParsed)) {
                xhr.numParsed = 0;
            
                // Set playing state when we get the initial packet
                //if (!this.player.playing) {
                //    this.setState('playing');
                //}
            }
            
            if (!this.contentType)
                this.contentType = xhr.getResponseHeader("Content-Type") ? 
                    xhr.getResponseHeader("Content-Type") : 'image/jpeg';                    
        
            // TODO: Reset XHR every now and again to free responseText buffer
            var length = xhr.responseText.length,
                frame = xhr.responseText.substring(xhr.numParsed, length);
            if (frame.length)          
                xhr.numParsed += this.parser.process(frame);   
        }
        else if (xhr.readyState == 4) {
            this.onComplete(xhr.status);
            
            // Free the XHR: http://phptouch.com/2011/08/02/xmlhttprequest-leak-in-ie-78/
            xhr.onreadystatechange = new Function; //empty function
            xhr = null;
        }
    },
    
    onComplete: function(status) {
        //Symple.log('MJPEGBase64MXHR: Complete: ', status)        
        if (this.player.playing) {
            stop();
            this.player.displayMessage('info', 'Streaming ended: Connection closed by peer.');
            return;
        }
        
        if (status == 200)
            this.setError('Streaming connection failed: Not a multipart stream.' + 
                Symple.Media.BrowserCompatabilityMsg);
        else
            this.setError('Streaming connection failed.' + 
                Symple.Media.BrowserCompatabilityMsg);
    }
});


// -----------------------------------------------------------------------------
// Pseudo MJPEG Engine
// 
// - No memory leaks in Chrome (others untested)
// - One image per request
// - Can acheive seamless playback with reasonable framerates
//
Symple.Media.registerEngine({
    id: 'PseudoMJPEG',
    name: 'Pseudo MJPEG',
    formats: 'MJPEG, JPEG',
    preference: 0, // too crap to be auto chosen
    support: (function() {
        return true;
    })()
});

Symple.Player.Engine.PseudoMJPEG = Symple.Player.Engine.extend({
    init: function(player) {
        this._super(player);
        this.lastImage = null;
        if (!this.player.options.threads)
            this.player.options.threads = 2;

        $.ajaxSetup({cache: false});
    },

    play: function(params) {
        this._super(params);        
        Symple.log('PseudoMJPEG: Play: ', this.params)     
        
        // Load an image for each thread
        for (var i = 0; i < this.player.options.threads; ++i)
            this.loadNext();
    },

    stop: function() {
        Symple.log('Symple PseudoMJPEG: stop');
        this.player.playing = false;
        if (this.lastImage) {
            this.free(this.lastImage);
            this.lastImage = null;
        }
        this.player.screen.html('');
        this.setState('stopped');
    },

    loadNext: function() {
        var self = this;
        var img = new Image();
        img.seq = this.seq;
        img.self = this;
        img.style.position = "absolute";
        img.style.left = 0;
        img.style.zIndex = -1; // hide until loaded    
        img.style.width = '100%';
        img.style.height = '100%';
        //img.width = this.player.options.screenWidth;
        //img.height = this.player.options.screenHeight;
        img.onload = function() {
            Symple.log('Symple PseudoMJPEG: Onload');
            
            // Set playing state when the first image loads
            if (self.player.state == 'loading')        
                self.setState('playing');       
            
            self.show.call(self, this);
        }
        Symple.log('Symple PseudoMJPEG: loadNext', this.seq );
        if (this.seq < 5) {
            img.onerror = function() {
                Symple.log('Symple PseudoMJPEG: OnError');
                self.free(img);
                self.setError('Streaming connection failed.');
            }
        }
        //img.onload = this.onError;
        img.src = this.params.url + "&seq=" + this.seq;
        this.player.screen.prepend(img);
    },

    show: function(img) {
         Symple.log('Symple PseudoMJPEG: Show');
        if (!this.player.playing)        
            return;

        // drop stale fames to avoid jerky playback
        if (this.lastImage &&
            this.lastImage.seq > img.seq) {
            this.free(img);
            Symple.log('Symple PseudoMJPEG: Dropping: ' + img.seq + ' < ' + this.lastImage.seq);
            return;
        }

        // bring new image to front
        img.style.zIndex = img.seq;

        // free last image
        if (this.lastImage)
            this.free(this.lastImage);

        this.lastImage = img;   
        this.displayFPS(); // required to increment seq
        this.loadNext();
    },

    free: function(img) {
        img.parentNode.removeChild(img);
    },
        
    setError: function(error) {
        Symple.log('Symple PseudoMJPEG: Error:', error);
        this.setState('error', error);
    }
});



    
    /*

    onLoad: function() {
        var self = this.self;
        Symple.log('Symple PseudoMJPEG: Onload: ', self.seq);
        
        // Set playing state when the firtst image loads
        if (self.player.state == 'loading')        
            self.setState('playing');            
            return;
        
        self.show.call(self, this);
    },
    
    // NOTE: This never fires in latest chrome  
    // when the remote side disconnects stream.
    onError: function() {
        var self = this.self;
        self.setError('Streaming connection failed.');
    },
    */
    /*
    resize: function(width, height) {
        if (this.img) {
            this.img.width = width;
            this.img.height = height;
        }
    }
    */

        
            
        //if (this.lastImage) {
            //this.img.style.display = 'none';
            //this.img.src = "#"; // closes socket in ff, but not safari
            //this.img = null;
            //this.player.screen[0].removeChild(this.img);
        //}
                
                /*
                    //if (self.img.style)
                    //    self.img.style.display = 'inline';
                self.processChunk();
    processChunk: function() {        
        
        // Take the substring that we haven't seen yet.
        //var data = this.xhr.responseText.substring(request.numParsed);
        //this.xhr.numParsed = this.xhr.responseText.length;
        this.parser.process(frame);
        // HTTP Streaming
        if (!this.parsing) {
        }
        
        // Multipart
        else {
        }
    },
        */
    /*
    url: function() {            
        return this.params.url + "&seq=" + this.seq + "&rand=" + Math.random();
    },
    
    resize: function(width, height) {
        // nothing to do
    },
    */

        
//return "http://" + this.player.options.host + ":" + this.player.options.port + this.player.options.uri +
//    "&width=" + this.player.options.encodeWidth + "&height=" +
//    this.player.options.encodeHeight + "&seq=" + (++this.seq) + "&rand=" + Math.random()

//img.self = this;
//img.width = this.player.options.screenWidth;
//img.height = this.player.options.screenHeight;
// -----------------------------------------------------------------------------
// WebRTC Engine
//
window.RTCPeerConnection = window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
window.RTCSessionDescription = window.mozRTCSessionDescription || window.RTCSessionDescription;
window.RTCIceCandidate = window.mozRTCIceCandidate || window.RTCIceCandidate;
navigator.getUserMedia = navigator.mozGetUserMedia || navigator.webkitGetUserMedia;
window.URL = window.webkitURL || window.URL;

   
Symple.Media.registerEngine({
    id: 'WebRTC',
    name: 'WebRTC Player',
    formats: 'VP8, Opus', 
    preference: 100,
    support: (function() {
        return typeof RTCPeerConnection != "undefined";
    })()
});


Symple.Player.Engine.WebRTC = Symple.Player.Engine.extend({
    init: function(player) {
        Symple.log("SympleWebRTC: Init");
        this._super(player);
        
        this.rtcConfig = player.options.rtcConfig || {
          iceServers: [
            { url: "stun:stun.l.google.com:19302" }
          ]
        }
        this.rtcOptions = player.options.rtcOptions || {
            optional: [
                {DtlsSrtpKeyAgreement: true} // FF <=> Chrome interop
            ]
        }
        this.mediaConstraints = player.options.mediaConstraints || {}
        //this.mediaConstraints = player.options.mediaConstraints || {
        //  'mandatory': {
        //    'OfferToReceiveAudio':true, 
        //    'OfferToReceiveVideo':true
        //  }
        //};
    },
    
    setup: function() {
        Symple.log("SympleWebRTC: Setup");
        
        this._createPeerConnection(); 
        
        // Note: Absolutely position video element so it scales to  
        // the parent element size. Need to test in other browsers.        
        
        if (typeof(this.video) == 'undefined') {
            Symple.log("SympleWebRTC: Setup: Peer video");
            this.video = $('<video autoplay></video>')
            this.player.screen.prepend(this.video);    
        }
        
        //this.video = $('<video width="100%" height="100%" style="position:absolute;left:0;top:0;"></video>'); // Chrome
        //this.selfVideo = typeof(this.selfVideo) == 'undefined' ? $('<video></video>') : this.selfVideo;
        //this.video = typeof(this.video) == 'undefined' ? $('<video></video>') : this.video; // style="position:absolute;left:0;top:0;"  width="100%" height="100%"  style="max-width:100%;height:auto;"
    },
      
    destroy: function() {   
        Symple.log("SympleWebRTC: Destroy");
        this.sendLocalSDP = null;
        this.sendLocalCandidate = null;
        
        if (this.video) {
            this.video[0].src = '';
            this.video[0] = null;
            this.video = null;
            // Anything else required for video cleanup?
        }
                
        if (this.pc) {
            this.pc.close();
            this.pc = null;
            // Anything else required for peer connection cleanup?
        }        
    },

    play: function(params) {        
        Symple.log("SympleWebRTC: Play", params);
        
        // The 'playing' state will be set when candidates
        // gathering is complete.
        // TODO: Get state events from the video element 
        // to shift from local loading to playing state.       
        
        if (params && params.localMedia) {
          
            // Get the local stream, show it in the local video element and send it
            var self = this;  
            navigator.getUserMedia({ audio: !params.disableAudio, video: !params.disableVideo }, 
            
                // successCallback
                function (localStream) {              
                    
                    //self._createPeerConnection(); 
                        
                    // Play the local stream
                    self.video[0].src = URL.createObjectURL(localStream);
                    self.pc.addStream(localStream);

                    //if (params.caller)
                        self.pc.createOffer(
                            function(desc) { self._onLocalSDP(desc); });
                    //else
                    //    self.pc.createAnswer(
                    //        function(desc) { self._onLocalSDP(desc); },
                    //        function() { // error
                    //            self.setError("Cannot create local SDP answer");
                    //        },
                    //        null //this.mediaConstraints;
                    //    )

                    //function gotDescription(desc) {
                    //    pc.setLocalDescription(desc);
                    //    signalingChannel.send(JSON.stringify({ "sdp": desc }));
                    //}
                },

                // errorCallback
                function(err) {
                    self.setError("getUserMedia() Failed: " + err);
                });
        }
    },

    stop: function() {
        
        if (this.video) {
            this.video[0].src = '';
            // Do not nullify
        }
                
        // TODO: Close peer connection?
        if (this.pc) {
            this.pc.close();
            this.pc = null;
        }
            
        this.setState('stopped');
    },
    
    mute: function(flag) {
        // Mute unless explicit false given
        flag = flag === false ? false : true;
        Symple.log("SympleWebRTC: Mute:", flag);
        
        if (this.video) {
            this.video.prop('muted', flag); //mute
        } 
    },

    // Initiates the player with local media capture
    //startLocalMedia: function(params) {        
        //Symple.log("SympleWebRTC: Play", params);
        
        // The 'playing' state will be set when candidates
        // gathering is complete.
        // TODO: Get state events from the video element 
        // to shift from local loading to playing state.        
    //},
    
    //
    // Called when local SDP is ready to be sent to the peer.
    sendLocalSDP: new Function,
    
    //
    // Called when a local candidate is ready to be sent to the peer.    
    sendLocalCandidate: new Function,    
    
    //
    // Called when remote SDP is received from the peer.
    onRemoteSDP: function(desc) {   
        Symple.log('SympleWebRTC: Recieve remote SDP:', desc)        
        if (!desc || !desc.type || !desc.sdp)
            throw "Invalid SDP data"
                    
        //if (desc.type != "offer")
        //    throw "Only SDP offers are supported"
        
        var self = this;             
        this.pc.setRemoteDescription(new RTCSessionDescription(desc), 
            function() {
                Symple.log('SympleWebRTC: SDP success');
                //alert('success')
            }, 
            function(message) {
                console.error('SympleWebRTC: SDP error:', message);
                self.setError("Cannot parse remote SDP offer");
            }
        );   
            
        if (desc.type == "offer") {
            this.pc.createAnswer(
                function(answer) { // success
                    self._onLocalSDP(answer);                    
                    //alert('answer')
                },
                function() { // error
                    self.setError("Cannot create local SDP answer");
                },
                null //this.mediaConstraints
            );
        }
    },    
    
    //
    // Called when remote candidate is received from the peer.
    onRemoteCandidate: function(candidate) { 
        //Symple.log("SympleWebRTC: Recieve remote candiate ", candidate);
        if (!this.pc)
            throw 'The peer connection is not initialized' // call onRemoteSDP first
            
        this.pc.addIceCandidate(new RTCIceCandidate({
            //sdpMid: candidate.sdpMid, 
            sdpMLineIndex: candidate.sdpMLineIndex, 
            candidate: candidate.candidate
        }));      
    },   
    
    
    //
    // Private methods
    //

    //
    // Called when local SDP is received from the peer.
    _onLocalSDP: function(desc) {       
        try {
            this.pc.setLocalDescription(desc);
            this.sendLocalSDP(desc);
        } 
        catch (e) {
            Symple.log("Failed to send local SDP:", e);            
        }
    }, 
    
    _createPeerConnection: function() {          
        if (this.pc)
            throw 'The peer connection is already initialized'
              
        Symple.log("SympleWebRTC: Creating peer connection: ", this.rtcConfig);
                
        var self = this;
        this.pc = new RTCPeerConnection(this.rtcConfig, this.rtcOptions);
        this.pc.onicecandidate = function(event) {
            if (event.candidate) {
                //Symple.log("SympleWebRTC: Local candidate gathered:", event.candidate);                
                self.sendLocalCandidate(event.candidate); 
            } 
            else {
                Symple.log("SympleWebRTC: Local candidate gathering complete");
            }
        };
        this.pc.onaddstream = function(event) {         
            Symple.log("SympleWebRTC: Remote stream added:", URL.createObjectURL(event.stream));
                
            // Set the state to playing once candidates have completed gathering.
            // This is the best we can do until ICE onstatechange is implemented.
            self.setState('playing');
                
            self.video[0].src = URL.createObjectURL(event.stream);
            self.video[0].play(); 
        };
        this.pc.onremovestream = function(event) { 
            Symple.log("SympleWebRTC: Remote stream removed:", event);
            self.video[0].stop(); 
        };
        
        // Note: The following state events are completely unreliable.
        // Hopefully when the spec is complete this will change, but
        // until then we need to "guess" the state.
        //this.pc.onconnecting = function(event) { Symple.log("SympleWebRTC: onconnecting:", event); };
        //this.pc.onopen = function(event) { Symple.log("SympleWebRTC: onopen:", event); };
        //this.pc.onicechange = function(event) { Symple.log("SympleWebRTC: onicechange :", event); };
        //this.pc.onstatechange = function(event) { Symple.log("SympleWebRTC: onstatechange :", event); };
        
        Symple.log("SympleWebRTC: Setupd RTCPeerConnnection with config: " + JSON.stringify(this.rtcConfig));
    }
});


//
// Helpers

Symple.Media.iceCandidateType = function(candidateSDP) {
  if (candidateSDP.indexOf("typ relay") != -1)
    return "turn";
  if (candidateSDP.indexOf("typ srflx") != -1)
    return "stun";
  if (candidateSDP.indexOf("typ host") != -1)
    return "host";
  return "unknown";
}
