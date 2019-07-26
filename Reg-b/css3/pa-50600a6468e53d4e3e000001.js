// Pingdom Agent version 1.4.0 Copyright (©) Pingdom 2019.
// Author: Nalle Rooth.

(function () {
'use strict';

function objectToString(obj, noEncode) {
    return Object.keys(obj).map(function(key) {
        return key + '=' + (noEncode ? obj[key] : encodeURIComponent(obj[key]));
    }).join('&');
}


function stringToObject(str, noDecode) {
    var split;
    var val;
    var obj = {};

    if (!(str && typeof str === 'string')) {
        return obj;
    }

    str.trim().split('&').forEach(function (part) {
        split = part.indexOf('=');
        val = part.substring(split + 1);
        obj[part.substr(0, split)] = (noDecode ? val : decodeURIComponent(val));
    });

    return obj;
}


function jsTimeToUnix(jsTime) {
    if (jsTime instanceof Date) {
        jsTime = jsTime.valueOf();
    }

    if (typeof jsTime === 'number') {
        return parseInt(jsTime.toString().substring(0, 10), 10);
    }

    return false;
}


function objectMerge() {
    var target = {};
    var src = arguments;

    // If an array is passed, iterate over the array and not arguments
    if (src[0] instanceof Array) {
        src = src[0];
    }

    for (var i = 0, len = src.length; i < len; i++) {
        var o = src[i];
        // Flatten Array
        if (isArray(o)) {
            o = objectMerge(o);
        } else if (!isObject(o)) {
            continue;
        }

        Object.keys(o).forEach(function (key) {
            if (o.hasOwnProperty(key)) {
                target[key] = o[key];
            }
        });
    }

    return target;
}


function isArray(arr) {
    return Object.prototype.toString.call(arr) === '[object Array]';
}


function isObject(obj) {
    return Object.prototype.toString.call(obj) === '[object Object]';
}

function dataSender(window, PA, url, enforceFallback) {
    function _appendQueryString(payload) {
        return url + '?' + objectToString(payload);
    }

    function _send(method, payload) {
        var useFallback = enforceFallback || false;

        if (isObject(payload)) {
            payload = objectMerge(
                { 'id': PA.getSiteID() },
                payload);
        }

        if (method === 'GET') {
            url = _appendQueryString(payload);
        }

        // MSIE 9 cannot send XHR via https properly
        if (window.navigator.appName.indexOf('Internet Explorer') !== -1) {
            var ver = window.navigator.appVersion.match(/MSIE (\d+)/);
            if (ver && parseInt(ver[1]) <= 9) {
                useFallback = true;
            }
        }

        if (window.XMLHttpRequest && !useFallback) {
            var xhr = new window.XMLHttpRequest();
            xhr.open(method, url);
            if (method === 'GET') {
                xhr.send(objectToString(payload));
            } else {
                xhr.send(JSON.stringify(payload));
            }
        } else {
            // For prehistoric browsers
            window.document.createElement('img').src = url;
        }
    }

    // Must return reference due to IE7 ECMA version
    var api = {
        get: function (payload) {
            _send('GET', payload);
        },
        post: function (payload) {
            _send('POST', payload);
        },
    };

    return api;
}

function cookieStorage(window, PA) {
    var expires = new Date(Date.now() + PA.retVisitor);

    function cookieStr(payload) {
        return PA.storageKey + '=' + payload + '; expires=' + expires;
    }

    var storage = {
        usesCookies: true,
        getItem: function (key) {
            var store = storage._cookieToObject();
            return store[key];
        },

        setItem: function (key, value) {
            var raw = storage._cookieToObject();
            var store = raw || {};
            store[key] = value;
            storage._objectToCookie(store);
        },

        removeItem: function(key) {
            var store = storage._cookieToObject();
            if (store) {
                delete store[key];
                storage._objectToCookie(store);
            }
        },

        _cookieToObject: function () {
            // Grab the correct cookie and remove key name
            var cookie = window.document.cookie.split(';')
                .filter(function (tok) {
                    return tok.length && tok.indexOf(PA.storageKey) > -1;
                });

            // Cookie should now be an array of length 0 or 1
            return stringToObject(cookie.join('').replace(PA.storageKey + '=', ''));
        },

        _objectToCookie: function (obj) {
            window.document.cookie = cookieStr(objectToString(obj));
        },
    };

    return storage;
}

function storage(window, PA) {
    var instance; // Reference to local- or cookieStorage

    /**
    * Checks if localStorage is usable. If not, cookieStorage is used as a
    * fallback.
    *
    * If localStorage is available, the result will be cached in order to avoid
    * performing set/get tests on each page load.
    *
    * This is required since Safari in private browsing mode still allows the
    * user to call localStorage methods, but throws a `QuoutaExceededException`
    * when trying to store data.
    */
    function init() {
        var enabledKey = PA.storageKey + '_enabled';

        if (window.localStorage &&
            window.localStorage.getItem(enabledKey) === '1') {
            instance = window.localStorage;
            return;
        }

        if (window.localStorage) {
            try {
                window.localStorage.setItem(enabledKey, 1);

                if (window.localStorage.getItem(enabledKey) === '1') {
                    instance = window.localStorage;
                    return;
                }
            } catch (e) {
                console && console.info('localStorage.setItem() failed. Using cookies.');
            }
        }

        // Use cookieStorage as fallback for localStorage
        instance = cookieStorage(window, PA);
    }


    /**
     * Fetches value for key from given storage instance
     */
    function get(key) {
        if (instance && key) {
            var d = stringToObject(instance.getItem(PA.storageKey));
            return (!!d ? d[key] : ''); // eslint-disable-line no-extra-boolean-cast
        }

        return '';
    }


    /**
    * sets a value in the given storage instance
    * */
    function set(key, value) {
        if (instance && key) {
            try {
                var store = instance.getItem(PA.storageKey);
                var d = store ? stringToObject(store) : {};
                d[key] = value;
                instance.setItem(PA.storageKey, objectToString(d));
            } catch (e) {
                console.error('unable to store ' + key +' in storage.', e);
            }
        }
    }


    function remove(key) {
        instance && key && instance.removeItem(key);
    }


    init();


    // Must return reference due to IE7 ECMA version
    var api = {
        get: get,
        set: set,
        remove: remove,
    };

    return api;
}

function base(options, window, modules) {
    var PA = {
        modules: [],
        // send and storage will be setup in PA.initialize()
        send: undefined,
        storage: undefined,
        storageKey: options.storageKey,
        id: options.id,
        url: options.url,
        ver: options.ver,
        sessionIDLength: options.sessionIDLength,
        sessionLifetime: options.sessionLifetime,
        retVisitor: options.retVisitor,


        /**
         * Fetches session info if available, or initiates a new session and
         * returns that data.
         *
         * @return Object
         */
        getSessionInfo: function () {
            var sid = PA.storage.get('sid'); // Session ID
            var sst = parseInt(PA.storage.get('sst'), 10); // Session Start time
            var n = jsTimeToUnix(Date.now());
            var s; // Temp sessions data

            if (!sid || !sst) {
                s = PA.sessionStart(false);
            } else if (n - sst > PA.sessionLifetime) { // Expired session
                // Check returning visitor before touching sst
                s = PA.sessionStart(n - sst < PA.retVisitor);
            } else {
                s = {
                    sId: sid,
                    sST: sst,
                    sIS: PA.getSessionInteractionStep(),
                    rV: PA.storage.get('rv') || '0',
                    v: PA.ver,
                };
            }

            return s;
        },


        /**
         * Generates a random session ID of given length.
         * The generated ID will be [a-z0-9]{len}
         *
         * @return string
         */
        generateSessionID: function () {
            // Magic numbers chosen to generate number between
            // 10000000_36 and zzzzzzzz_36
            var a = 78364164096;
            var b = 2742745743359;

            return (a + Math.floor(Math.random() * b)).toString(36);
        },


        /**
         * Creates session ID and marks session start time
         *
         * @return object session info
         */
        sessionStart: function (returningVisitor) {
            returningVisitor = returningVisitor ? '1' : '0';

            // session ID is 8 alphanum lowercase chars.
            var  sid = PA.generateSessionID();
            PA.storage.set('sid', sid);

            var sst = PA.sessionMarkActive();

            // Reset Session Interaction Step and store returning visitor
            PA.storage.set('sis', '1');
            PA.storage.set('rv', returningVisitor);

            // Must return reference due to IE7 ECMA version
            var ret = {
                sId: sid,
                sST: sst,
                sIS: '1',
                rV: returningVisitor,
                v: PA.ver,
            };

            return ret;
        },

        /**
         * Updates session start time
         *
         * @return number Unix timestamp
         */
        sessionMarkActive: function () {
            var sst = jsTimeToUnix(Date.now());
            PA.storage.set('sst', sst);

            return sst;
        },


        /**
         * Fetches session interaction step from storage
         *
         * @return number
         */
        getSessionInteractionStep: function () {
            return parseInt(PA.storage.get('sis'), 10) || 1;
        },


        /**
         * Increments the session interaction step in storage
         */
        bumpSessionInteractionStep: function () {
            PA.storage.set( 'sis', PA.getSessionInteractionStep() + 1);
        },


        /**
         * Verifies that the browser has support for the agent script
         *
         * @return boolean Whether the agent is supported or not
         */
        checkBrowser: function () {
            return (
                window.document && // Because IE7 broken scope + minified code
                window.document.readyState &&
                Array.prototype.forEach &&
                Array.prototype.map
            );
        },

        /**
         * Parses the site ID from the RUM snippet
         *
         * @return number
         */
        getSiteID: function () {
            // New snippet will insert SiteID into agent
            if (!PA.id.length) {
                // Attempt to parse Old RUM snippet, fetch id from window._prum
                // NOTE: id must be empty string when serving agent to users
                //       with old snippets!
                if (isArray(window._prum)
                    && isArray(window._prum[0])
                    && window._prum[0][0] === 'id')
                {
                    PA.id = window._prum[0][1];
                    PA.storage.set('r1', '1');
                } else if (isObject(window._prum) && window._prum.id) {
                    PA.id = window._prum.id;
                    PA.storage.set('r1', '1');
                }
            }

            return PA.id;
        },


        /**
        * Initialize the agent
        */
        initialize: function () {
            //  Init storage now that the PA object exists
            PA.storage = storage(window, PA);

            // Start session
            PA.getSessionInfo();

            // Setup dataSenders
            PA.send = dataSender(window, PA, PA.url);

            // Load modules, each module will do its own stuff once loaded
            if (isArray(modules)) {
                PA.modules = modules;
                PA.modules.forEach(function (module) {
                    module(window, PA);
                });
            }
        },
    };

    // Don't even try to load anything if the browser is too old
    if (!PA.checkBrowser()) {
        return;
    }

    // Make sure agent is loaded once the DOM is complete
    if (window.document.readyState !== 'complete') {
        window.addEventListener('load', function loader(evt) {
            evt.target.removeEventListener('load', loader);
            PA.initialize();
        });

    } else  {
        PA.initialize();
    }
}

function clientScreenInfo(window) {
    // Must return reference due to IE7 ECMA version
    var info = {
        'sAW': window.screen.availWidth,
        'sAH': window.screen.availHeight,
        'bIW': window.innerWidth,
        'bIH': window.innerHeight,
        'pD': window.screen.pixelDepth,
        'dPR': window.devicePixelRatio | 1,
        'or': window.screen.orientation && window.screen.orientation.type || '',
    };

    return info;
}

function clonePerformanceTimings(t, timings) {
    [
        'connectEnd',
        'connectStart',
        'domComplete',
        'domContentLoadedEventEnd',
        'domContentLoadedEventStart',
        'domInteractive',
        'domLoading',
        'domainLookupEnd',
        'domainLookupStart',
        'fetchStart',
        'loadEventEnd',
        'loadEventStart',
        'navigationStart',
        'redirectEnd',
        'redirectStart',
        'requestStart',
        'responseEnd',
        'responseStart',
        'secureConnectionStart',
        'unloadEventEnd',
        'unloadEventStart',
    ].forEach(function(key) {
        timings[key] = timings[key] ? timings[key] : t[key];
    });

    return timings;
}


function RumModule(window, PA) {
    var interval;
    var t;
    var p = window.performance || {};


    function sendPageView(dataArr) {
        var l = window.location;

        dataArr.push({
            s: 'nt',          // Data source, or something..
            title: window.document.title,
            path: l.protocol + '//' + l.host + l.pathname,
            ref: window.document.referrer,
        });

        // Insert session into payload and bump interaction step
        dataArr.push(PA.getSessionInfo());
        PA.bumpSessionInteractionStep();

        var data = objectMerge(dataArr);

        // Merge objects and send data
        PA.send.get(data);
    }


    //function preparePageLeave() {
    //    window.addEventListener('beforeunload', function () {
    //        PA.send.get({
    //            s: 'pageleave',
    //        });
    //    });
    //}


    function getNavigationData() {
        return {
            'nT': p.navigation.type,
            'rC': p.navigation.redirectCount,
        };
    }


    function calcTLSHandshake() {
        if (window.location.protocol === 'https:'
            && t.secureConnectionStart > 0) {
            return calc(t.secureConnectionStart);
        }

        return -1;
    }


    function calc(ts) {
        return ts > 0 ? ts - t.navigationStart : -1;
    }


    function minifyPerformanceTiming(t) {
        return {
            nS: 0, // t.navigationStart - t.navigationStart
            cS: calc(t.connectStart),
            cE: calc(t.connectEnd),
            dLE: calc(t.domainLookupEnd),
            dLS: calc(t.domainLookupStart),
            fS: calc(t.fetchStart),
            hS: calcTLSHandshake(),
            rE: calc(t.redirectEnd),
            rS: calc(t.redirectStart),
            reS: calc(t.requestStart),
            resS: calc(t.responseStart),
            resE: calc(t.responseEnd),
            uEE: calc(t.unloadEventEnd),
            uES: calc(t.unloadEventStart),
            dL: calc(t.domLoading),
            dI: calc(t.domInteractive),
            dCLES: calc(t.domContentLoadedEventStart),
            dCLEE: calc(t.domContentLoadedEventEnd),
            dC: calc(t.domComplete),
            lES: calc(t.loadEventStart),
            lEE: calc(t.loadEventEnd),
        };
    }


    function initialize() {
        t = p.timing;

        // IE9-11 will not allow access to performance timings when the hash has
        // been changed by frameworks, etc. There's no real way around this, so
        // let's just be sad and move on.
        if (!t) {
            return;
        }

        // Cache of performance.timing (which is volatile by nature. If a
        // redirect is triggered before loadEventEnd, a new navigationStart
        // will be set and the loadEventEnd will be a negative value when
        // calulated)
        var timings = {};
        // Await performance.timing.loadEventEnd
        interval = setTimeout(function () {
            timings = clonePerformanceTimings(t, timings);
            if (!timings.loadEventEnd) {
                return;
            }

            clearInterval(interval);

            var data = [];
            data.push(clientScreenInfo(window));
            data.push(getNavigationData());
            data.push(minifyPerformanceTiming(timings));

            sendPageView(data);

            // preparePageLeave();
        }, 25);
    }

    initialize();
}

(function(window) {
    var modules = [RumModule];

    var options = {
        storageKey: 'pa-dev',
        id: '50600a6468e53d4e3e000001',
        url: '//dev-d1-rum-collector-2.pingdom.net/img/beacon.gif',
        ver: '1.4.0',
        // This may look ugly, but it keeps the linter happy
        sessionIDLength: parseInt('8', 10),
        sessionLifetime: parseInt('1800', 10),
        retVisitor: parseInt('30', 10) * 24 * 3600,
    };

    base(options, window, modules);
}(window));

}());
