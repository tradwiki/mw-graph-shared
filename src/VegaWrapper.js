'use strict';
/* global module */

/**
 * Shared library to wrap around vega code
 * @param {boolean} useXhr true if we should use XHR, false for node.js http loading
 * @param {boolean} isTrusted true if the graph spec can be trusted
 * @param {string[]} httpDomains list of allowed http domains
 * @param {string[]} httpsDomains list of allowed https domains
 * @param {Object} domainMap domain remapping
 * @param {Object} load Vega loader object to use and override
 * @param {Function} logger
 * @param {Function} objExtender $.extend in browser, _.extend in NodeJs
 * @param {Function} parseUrl
 * @param {Function} formatUrl
 * @constructor
 */
function VegaWrapper(useXhr, isTrusted, httpDomains, httpsDomains, domainMap, load, logger, objExtender, parseUrl, formatUrl) {
    var self = this;
    self.isTrusted = isTrusted;
    self.logger = logger;
    self.objExtender = objExtender;
    self.parseUrl = parseUrl;
    self.formatUrl = formatUrl;

    // Convert domains to a regex:  (any-subdomain)\.(wikipedia\.org|wikivoyage\.org|...)
    function makeValidator(domains) {
        if (!domains || domains.length === 0) return {
            // Optimization - always return false
            test: function () {
                return false;
            }
        };
        return new RegExp('^([^@/:]*\.)?(' +
            domains
                .map(function (s) {
                    return s.replace('.', '\\.');
                })
                .join('|') + ')$', 'i');
    }

    self.httpHostsRe = makeValidator(httpDomains);
    self.httpsHostsRe = makeValidator(httpsDomains);
    self.domainMap = domainMap;

    load.loader = function (opt, callback) {
        var error = callback || function (e) { throw e; }, url;

        try {
            url = self.sanitizeUrl(opt); // enable override
        } catch (err) {
            error(err);
            return;
        }

        // Process data response
        var cb = function (error, data) {
            return self.dataParser(error, data, opt, callback);
        };

        if (useXhr) {
            return load.xhr(url, opt, cb);
        } else {
            return load.http(url, opt, cb);
        }
    };
}

module.exports = VegaWrapper;

VegaWrapper.prototype.sanitizeHost = function (domain) {
    // TODO: Optimize 'en.m.wikipedia.org' -> 'en.wikipedia.org'

    // First, map the domain
    domain = (this.domainMap && this.domainMap[domain]) || domain;

    var result = {
        domain: domain
    };

    if (this.httpsHostsRe.test(domain)) {
        result.protocol = 'https';
    } else if (this.httpHostsRe.test(domain)) {
        result.protocol = 'http';
    } else {
        result = false;
    }

    return result;
};

/**this
 * Validate and update urlObj to be safe for client-side and server-side usage
 * @param {Object} opt passed by the vega loader. May be altered with optional "isApiCall" and "extractApiContent"
 * @returns {boolean} true on success
 */
VegaWrapper.prototype.sanitizeUrl = function (opt) {
    var urlParts = this.parseUrl(opt);

    var targetProtocol,
        host = urlParts.host;
    if (this.httpsHostsRe.test(host)) {
        targetProtocol = 'https';
    } else if (this.httpHostsRe.test(host)) {
        targetProtocol = 'http';
    } else {
        throw new Error('URL hostname is not whitelisted: ' + JSON.stringify(opt.url));
    }

    switch (urlParts.protocol) {
        case 'http:':
        case 'https:':
            if (!this.isTrusted) {
                throw new Error('HTTP and HTTPS protocols not supported for untrusted graphs');
            }
            // keep the original URL
            break;

        case 'wikiapi:':
            // wikiapi:///?action=query&list=allpages
            // Call to api.php - ignores the path parameter, and only uses the query
            urlParts.query = this.objExtender(urlParts.query, {format: 'json', formatversion: '2'});
            urlParts.pathname = '/w/api.php';
            urlParts.protocol = targetProtocol;
            opt.isApiCall = true;
            break;

        case 'wikirest:':
            // wikirest:///api/rest_v1/page/...
            // Call to RESTbase api - requires the path to start with "/api/"
            // The /api/... path is safe for GET requests
            if (!/^\/api\//.test(urlParts.pathname)) {
                throw new Error('wikirest: protocol must begin with the /api/ prefix');
            }
            // keep urlParts.query
            // keep urlParts.pathname
            urlParts.protocol = targetProtocol;
            break;

        case 'wikiraw:':
            // wikiraw:///MyPage/data
            // Get raw content of a wiki page, where the path is the title
            // of the page with an additional leading '/' which gets removed.
            // Uses mediawiki api, and extract the content after the request
            // Query value must be a valid MediaWiki title string, but we only ensure
            // there is no pipe symbol, the rest is handlered by the api.
            if (!/^\/[^|]+$/.test(urlParts.pathname)) {
                throw new Error('wikiraw: invalid title');
            }
            urlParts.query = {
                format: 'json',
                formatversion: '2',
                action: 'query',
                prop: 'revisions',
                rvprop: 'content',
                titles: urlParts.pathname.substring(1)
            };
            urlParts.pathname = '/w/api.php';
            urlParts.protocol = targetProtocol;
            opt.isApiCall = true;
            opt.extractApiContent = true;
            break;

        case 'wikirawupload:':
            // wikirawupload://upload.wikimedia.org/wikipedia/commons/3/3e/Einstein_1921.jpg
            // Get an image for the graph, e.g. from commons
            // This tag specifies any content from the uploads.* domain, without query params
            if (!/^upload\./.test(host)) {
                throw new Error('wikirawupload: protocol must reference upload.* host: ' + JSON.stringify(opt.url));
            }
            urlParts.query = null;
            // keep urlParts.pathname;
            urlParts.protocol = targetProtocol;
            break;

        default:
            throw new Error('Unknown protocol ' + JSON.stringify(opt.url));
    }
    return this.formatUrl(urlParts);
};

/**
 * Performs post-processing of the data requested by the graph's spec
 */
VegaWrapper.prototype.dataParser = function (error, data, opt, callback) {
    if (error) {
        callback(error);
        return;
    }
    if (opt.isApiCall) {
        // This was an API call - check for errors
        var json = JSON.parse(data);
        if (json.error) {
            error = new Error('API error: ' + JSON.stringify(json.error));
            data = undefined;
        } else {
            if (json.warnings) {
                this.logger('API warnings: ' + JSON.stringify(json.warnings));
            }
            if (opt.extractApiContent) {
                try {
                    data = json.query.pages[0].revisions[0].content;
                } catch (e) {
                    data = undefined;
                    error = new Error('Page content not available ' + opt.url);
                }
            }
        }
    }
    callback(error, data);
};
