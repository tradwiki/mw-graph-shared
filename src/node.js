'use strict';
/* global module */

var urllib = require('url');
var _ = require('underscore');

var VegaWrapper = require('./VegaWrapper');

module.exports = function(httpDomains, httpsDomains, domainMap, load, logger) {
    return new VegaWrapper(
        false, true, httpDomains, httpsDomains, domainMap, load, logger, _.extend,
        function (opt) {
            var urlParts = urllib.parse(opt.url);
            // reduce confusion, only keep expected values
            delete urlParts.hostname;
            delete urlParts.path;
            delete urlParts.href;
            delete urlParts.port;
            if (urlParts.host === '') {
                urlParts.host = opt.domain;
            }

            return urlParts;
        }, urllib.format);
};
