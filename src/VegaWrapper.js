( function ( $, mw, vg ) {

	'use strict';
	/* global require */

	var VegaWrapper = require( 'mw-graph-shared' );

	// eslint-disable-next-line no-new
	var wrappedVega = new VegaWrapper({
		data: {
			extend: vg.extend,
			loader: vg.loader,
			http: vg.loader().http
		},
		isTrusted: mw.config.get( 'wgGraphIsTrusted' ),
		domains: mw.config.get( 'wgGraphAllowedDomains' ),
		domainMap: false,
		logger: function ( warning ) {
			mw.log.warn( warning );
		},
		parseUrl: function ( url, opt ) {
			// Parse URL
			var uri = new mw.Uri( url );

			// reduce confusion, only keep expected values
			if ( uri.port ) {
				uri.host += ':' + uri.port;
				delete uri.port;
			}
			// If url begins with   protocol:///...  mark it as having relative host
			if ( /^[a-z]+:\/\/\//.test( url ) ) {
				uri.isRelativeHost = true;
			}
			if ( uri.protocol ) {
				// All other libs use trailing colon in the protocol field
				uri.protocol += ':';
			}
			// Node's path includes the query, whereas pathname is without the query
			// Standardizing on pathname
			uri.pathname = uri.path;
			delete uri.path;
			return uri;
		},
		formatUrl: function ( uri, opt ) {
			// Format URL back into a string
			// Revert path into pathname
			uri.path = uri.pathname;
			delete uri.pathname;

			if ( location.host.toLowerCase() === uri.host.toLowerCase() ) {
				if ( !mw.config.get( 'wgGraphIsTrusted' ) ) {
					// Only send this header when hostname is the same.
					// This is broader than the same-origin policy,
					// but playing on the safer side.
					opt.headers = { 'Treat-as-Untrusted': 1 };
				}
			} else if ( opt.addCorsOrigin ) {
				// All CORS api calls require origin parameter.
				// It would be better to use location.origin,
				// but apparently it's not universal yet.
				uri.query.origin = location.protocol + '//' + location.host;
			}

			uri.protocol = VegaWrapper.removeColon( uri.protocol );
			return uri.toString();
		},
		languageCode: mw.config.get( 'wgUserLanguage' )
	} );

	/**
	 * Set up drawing canvas inside the given element and draw graph data
	 * @param {HTMLElement} element
	 * @param {Object|string} data graph spec
	 */
	mw.drawVegaGraph = function ( element, data ) {
		let view;
		function render(spec) {
			view = new vg.View ( vg.parse(spec), {loader: wrappedVega.data.loader()} )
				.renderer( 'svg' )
				.initialize( element )
				.hover()	
				.run();
		}
		render(data);
	};

	mw.hook( 'wikipage.content' ).add( function ( $content ) {
		var specs = mw.config.get( 'wgGraphSpecs' );
		if ( !specs ) {
			return;
		}
		$content.find( '.mw-graph.mw-graph-always' ).each( function () {
			var graphId = $( this ).data( 'graph-id' );
			if ( !specs.hasOwnProperty( graphId ) ) {
				mw.log.warn( graphId );
			} else {
				mw.drawVegaGraph( this, specs[ graphId ] );
			}
		} );
	} );

}( jQuery, mediaWiki, vega ) );
