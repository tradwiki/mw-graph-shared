'use strict';

var assert = require('assert'),
    _ = require('underscore'),
    util = require('util'),
    urllib = require('url'),
    VegaWrapper = require('../src/VegaWrapper');

describe('vegaWrapper', function() {

    /**
     * This is a copy of the vega2.js parseUrl code. If updated here, make sure to copy it there as well.
     * It is not easy to reuse it because current lib should be browser vs nodejs agnostic,
     * @param opt
     * @return {*}
     */
    function parseUrl(opt) {
        var url = opt.url;
        var isRelativeUrl = url[0] === '/' && url[1] === '/';
        if (isRelativeUrl) {
            // Workaround: urllib does not support relative URLs, add a temp protocol
            url = 'temp:' + url;
        }
        var urlParts = urllib.parse(url, true);
        if (isRelativeUrl) {
            delete urlParts.protocol;
        } else if (urlParts.protocol && urlParts.protocol[urlParts.protocol.length - 1] === ':') {
            urlParts.protocol = urlParts.protocol.substring(0, urlParts.protocol.length - 1);
        }
        // reduce confusion, only keep expected values
        delete urlParts.hostname;
        delete urlParts.path;
        delete urlParts.href;
        delete urlParts.port;
        delete urlParts.search;
        if (!urlParts.host || urlParts.host === '') {
            urlParts.host = opt.domain;
            // for some protocols, default host name is resolved differently
            // this value is ignored by the urllib.format()
            urlParts.isRelativeHost = true;
        }

        return urlParts;
    }

    function expectError(testFunc, msg, errFuncNames) {
        var error, result;
        try {
            result = testFunc();
        } catch (err) {
            error = err;
        }

        if (!error) {
            assert(false, util.format('%j was expected to cause an error in functions %j, but returned %j',
                msg, errFuncNames, result));
        }

        if (error.stack.split('\n').map(function (v) {
                return v.trim().split(' ');
            }).filter(function (v) {
                return v[0] === 'at';
            })[0][1] in errFuncNames
        ) {
            // If first stack line (except the possibly multiline message) is not expected function, throw
            error.message = '"' + msg + '" caused an error:\n' + error.message;
            throw error;
        }
    }

    var domains = {
        http: ['nonsec.org'],
        https: ['sec.org'],
        wikiapi: ['wikiapi.nonsec.org', 'wikiapi.sec.org'],
        wikirest: ['wikirest.nonsec.org', 'wikirest.sec.org'],
        wikiraw: ['wikiraw.nonsec.org', 'wikiraw.sec.org'],
        wikirawupload: ['wikirawupload.nonsec.org', 'wikirawupload.sec.org'],
        wikidatasparql: ['wikidatasparql.nonsec.org', 'wikidatasparql.sec.org'],
        geoshape: ['geoshape.nonsec.org', 'geoshape.sec.org']
    };
    var domainMap = {
        'nonsec': 'nonsec.org',
        'sec': 'sec.org'
    };

    function createWrapper(useXhr, isTrusted) {
        var load = {};
        return new VegaWrapper(
            load, useXhr, isTrusted, domains, domainMap, function (msg) {
                throw new Error(msg);
            }, _.extend, parseUrl, urllib.format);
    }

    it('sanitizeUrl - unsafe', function () {
        var wraper = createWrapper(true, true),
            pass = function (url, expected) {
                assert.equal(wraper.sanitizeUrl({url: url, domain: 'domain.sec.org'}), expected, url)
            },
            fail = function (url) {
                expectError(function () {
                    return wraper.sanitizeUrl({url: url, domain: 'domain.sec.org'});
                }, url, ['VegaWrapper.sanitizeUrl']);
            };

        fail('nope://sec.org');
        fail('nope://sec');

        pass('', 'https://domain.sec.org');
        pass('blah', 'https://domain.sec.org/blah');
        pass('http://sec.org', 'http://sec.org/');
        pass('http://sec.org/blah?test=1', 'http://sec.org/blah?test=1');
        pass('http://any.sec.org', 'http://any.sec.org/');
        pass('http://any.sec.org/blah?test=1', 'http://any.sec.org/blah?test=1');
        pass('http://sec', 'http://sec.org/');
        pass('http://sec/blah?test=1', 'http://sec.org/blah?test=1');

    });

    it('sanitizeUrl - safe', function () {
        var wraper = createWrapper(true, false),
            pass = function (url, expected) {
                assert.equal(wraper.sanitizeUrl({url: url, domain: 'domain.sec.org'}), expected, url)
            },
            fail = function (url) {
                expectError(function () {
                    return wraper.sanitizeUrl({url: url, domain: 'domain.sec.org'});
                }, url, ['VegaWrapper.sanitizeUrl', 'VegaWrapper._validateExternalService']);
            };

        fail('');
        fail('blah');
        fail('nope://sec.org');
        fail('nope://sec');
        fail('https://sec.org');
        fail('https://sec');

        // wikiapi allows sub-domains
        pass('wikiapi://sec.org?a=1', 'https://sec.org/w/api.php?a=1&format=json&formatversion=2');
        pass('wikiapi://wikiapi.sec.org?a=1', 'https://wikiapi.sec.org/w/api.php?a=1&format=json&formatversion=2');
        pass('wikiapi://sec?a=1', 'https://sec.org/w/api.php?a=1&format=json&formatversion=2');
        pass('wikiapi://nonsec.org?a=1', 'http://nonsec.org/w/api.php?a=1&format=json&formatversion=2');
        pass('wikiapi://wikiapi.nonsec.org?a=1', 'http://wikiapi.nonsec.org/w/api.php?a=1&format=json&formatversion=2');
        pass('wikiapi://nonsec?a=1', 'http://nonsec.org/w/api.php?a=1&format=json&formatversion=2');

        // wikirest allows sub-domains, requires path to begin with "/api/"
        fail('wikirest://sec.org');
        pass('wikirest:///api/abc', 'https://domain.sec.org/api/abc');
        pass('wikirest://sec.org/api/abc', 'https://sec.org/api/abc');
        pass('wikirest://sec/api/abc', 'https://sec.org/api/abc');
        pass('wikirest://wikirest.sec.org/api/abc', 'https://wikirest.sec.org/api/abc');
        pass('wikirest://wikirest.nonsec.org/api/abc', 'http://wikirest.nonsec.org/api/abc');

        // wikiraw allows sub-domains
        fail('wikiraw://sec.org');
        fail('wikiraw://sec.org/');
        fail('wikiraw://sec.org/?a=10');
        fail('wikiraw://asec.org/aaa');
        fail('wikiraw:///abc|xyz');
        fail('wikiraw://sec.org/abc|xyz');
        pass('wikiraw:///abc', 'https://domain.sec.org/w/api.php?format=json&formatversion=2&action=query&prop=revisions&rvprop=content&titles=abc');
        pass('wikiraw:///abc/xyz', 'https://domain.sec.org/w/api.php?format=json&formatversion=2&action=query&prop=revisions&rvprop=content&titles=abc%2Fxyz');
        pass('wikiraw://sec.org/aaa', 'https://sec.org/w/api.php?format=json&formatversion=2&action=query&prop=revisions&rvprop=content&titles=aaa');
        pass('wikiraw://sec.org/aaa?a=10', 'https://sec.org/w/api.php?format=json&formatversion=2&action=query&prop=revisions&rvprop=content&titles=aaa');
        pass('wikiraw://sec.org/abc/def', 'https://sec.org/w/api.php?format=json&formatversion=2&action=query&prop=revisions&rvprop=content&titles=abc%2Fdef');
        pass('wikiraw://sec/aaa', 'https://sec.org/w/api.php?format=json&formatversion=2&action=query&prop=revisions&rvprop=content&titles=aaa');
        pass('wikiraw://sec/abc/def', 'https://sec.org/w/api.php?format=json&formatversion=2&action=query&prop=revisions&rvprop=content&titles=abc%2Fdef');
        pass('wikiraw://wikiraw.sec.org/abc', 'https://wikiraw.sec.org/w/api.php?format=json&formatversion=2&action=query&prop=revisions&rvprop=content&titles=abc');

        fail('wikirawupload://sec.org');
        fail('wikirawupload://sec.org/');
        fail('wikirawupload://sec.org/a');
        fail('wikirawupload://sec.org/?a=10');
        fail('wikirawupload://asec.org/aaa');
        fail('wikirawupload://asec.org/aaa');
        fail('wikirawupload://asec.org/aaa');
        pass('wikirawupload:///aaa', 'http://wikirawupload.nonsec.org/aaa');
        pass('wikirawupload:///aaa/bbb', 'http://wikirawupload.nonsec.org/aaa/bbb');
        pass('wikirawupload:///aaa?a=1', 'http://wikirawupload.nonsec.org/aaa');
        pass('wikirawupload://wikirawupload.nonsec.org/aaa', 'http://wikirawupload.nonsec.org/aaa');
        fail('wikirawupload://blah.nonsec.org/aaa');
        fail('wikirawupload://a.wikirawupload.nonsec.org/aaa');

        fail('wikidatasparql://sec.org');
        fail('wikidatasparql://sec.org/');
        fail('wikidatasparql://sec.org/a');
        fail('wikidatasparql://sec.org/?a=10');
        fail('wikidatasparql://asec.org/aaa');
        fail('wikidatasparql://asec.org/aaa');
        fail('wikidatasparql://asec.org/aaa');
        fail('wikidatasparql:///aaa');
        fail('wikidatasparql:///?aquery=1');
        pass('wikidatasparql:///?query=1', 'http://wikidatasparql.nonsec.org/bigdata/namespace/wdq/sparql?format=json&query=1');
        pass('wikidatasparql://wikidatasparql.sec.org/?query=1', 'https://wikidatasparql.sec.org/bigdata/namespace/wdq/sparql?format=json&query=1');

        fail('geoshape://sec.org');
        fail('geoshape://sec.org/');
        fail('geoshape://sec.org/a');
        fail('geoshape://sec.org/?a=10');
        fail('geoshape://asec.org/aaa');
        fail('geoshape://asec.org/aaa');
        fail('geoshape://asec.org/aaa');
        fail('geoshape:///aaa');
        fail('geoshape:///?aquery=1');
        pass('geoshape:///?ids=1', 'http://geoshape.nonsec.org/shape?ids=1');
        pass('geoshape://geoshape.sec.org/?ids=a1,b4', 'https://geoshape.sec.org/shape?ids=a1%2Cb4');

        pass('wikifile:///Einstein_1921.jpg', 'https://domain.sec.org/wiki/Special:Redirect/file/Einstein_1921.jpg');
        pass('wikifile:///Einstein_1921.jpg?width=10', 'https://domain.sec.org/wiki/Special:Redirect/file/Einstein_1921.jpg?width=10');
        pass('wikifile://sec.org/Einstein_1921.jpg', 'https://sec.org/wiki/Special:Redirect/file/Einstein_1921.jpg');
    });

});
