( function ( $, mw ) {

    'use strict';

    var VegaWrapper = require('./VegaWrapper');

    module.exports = function (load, logger) {
        return new VegaWrapper(true, false, {}, {}, {}, load, logger, _.extend, urllib.parse, urllib.format);
    };


    var a = document.createElement('a');
    a.href = url;
    // From http://stackoverflow.com/questions/736513/how-do-i-parse-a-url-into-hostname-and-path-in-javascript
    // IE doesn't populate all link properties when setting .href with a relative URL,
    // however .href will return an absolute URL which then can be used on itself
    // to populate these additional fields.
    if (a.host === '') {
        a.href = a.href;
    }
    var domain = a.hostname.toLowerCase();

}( jQuery, mediaWiki ) );
