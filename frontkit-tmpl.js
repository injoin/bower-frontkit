/*!
 * frontkit v0.3.4
 * The powerful front-end framework from InJoin.
 *
 * http://frontkit.injoin.io
 */
!function( ng ) {
    "use strict";

    ng.module( "frontkit", [
        "frontkit.checkbox",
        "frontkit.dropdown",
        "frontkit.offcanvas",
        "frontkit.tooltip"
    ]);
}( angular );
!function( ng ) {
    "use strict";

    var baseTemplate = "<span class='DIRECTIVE' tabindex='0'></span>";

    var module = ng.module( "frontkit.checkbox", [
        "frontkit.utils"
    ]);

    [ "checkbox", "radio" ].forEach(function( directive ) {
        var template = baseTemplate.replace( "DIRECTIVE", directive );

        module.directive( directive, [
            "$compile",
            "$timeout",
            "keycodes",
            function( $compile, $timeout, keycodes ) {
                var definition = {};

                definition.restrict = "A";
                definition.link = function( scope, input ) {
                    var styled = $compile( template )( scope );
                    input.after( styled );
                    input.addClass( "hide" );

                    input.on( "$destroy", function() {
                        // Remove the styled element as well
                        styled.remove();
                    });

                    styled.on( "keypress", function( evt ) {
                        // Space is the only key that triggers an click on a checkbox/radio, the far
                        // we know
                        if ( evt.type === "keypress" && evt.which !== keycodes.SPACE ) {
                            return;
                        }

                        styled.triggerHandler( "click" );
                        evt.preventDefault();
                    });

                    styled.on( "click", function( evt ) {
                        evt.preventDefault();

                        input.prop( "checked", !input.prop( "checked" ) );
                        $timeout(function() {
                            // Activate Angular's native checkbox directive
                            input.triggerHandler( "click" );
                        });
                    });
                };

                return definition;
            }
        ]);
    });

}( angular );
!function( ng ) {
    "use strict";

    var $ = ng.element;
    var module = ng.module( "frontkit.dropdown", [
        "frontkit.position",
        "frontkit.utils"
    ]);

    module.value( "dropdownConfig", {
        optionsPageSize: 5
    });

    module.directive( "dropdown", [
        "$document",
        "$$position",
        function( $document, $$position ) {
            var definition = {};

            definition.restrict = "EA";
            definition.replace = true;
            definition.transclude = true;
            definition.templateUrl = "templates/dropdown/dropdown.html";
            definition.controller = "DropdownController";
            definition.controllerAs = "$dropdown";
            definition.scope = true;
            definition.require = [ "dropdown", "?ngModel" ];

            definition.compile = function( tElement, tAttr ) {
                var ngModel = tAttr.ngModel;

                // If ng-model is present, let's reference the parent scope
                if ( ngModel ) {
                    tAttr.$set( "ngModel", "$parent." + ngModel );
                }

                return definition.link;
            };

            definition.link = function( scope, element, attr, controllers, transclude ) {
                // Create shortcuts for the controllers
                var $dropdown = controllers[ 0 ];
                var ngModel = controllers[ 1 ];

                // Configure ngModel, if present
                if ( ngModel ) {
                    scope.$watch( "$dropdown.items", function( items ) {
                        // Almost all the time users expect to receive a single value if their
                        // dropdown accepts only 1 item, and an array of values if the dropdown
                        // accepts more than 1 value.
                        items = $dropdown.maxItems === 1 ? items[ 0 ] : items;
                        ngModel.$setViewValue( items );
                    }, true );

                    ngModel.$render = function() {
                        var value = ngModel.$viewValue;
                        if ( value == null ) {
                            $dropdown.items = [];
                            return;
                        }

                        // Properly transform the value into an array, as used internally by us
                        $dropdown.items = ng.isArray( value ) ? value : [ value ];
                    };
                }

                // Transclude contents into the right place in the directive
                transclude( scope, function( children ) {
                    var clone = $( "<div>" ).append( children );
                    var items = clone.querySelector( ".dropdown-item" );
                    var optgroups = clone.querySelector( ".dropdown-optgroups" );
                    var container = element.querySelector( ".dropdown-container" );

                    if ( items.length ) {
                        container.prepend( items );
                    }

                    if ( optgroups.length ) {
                        element.querySelector( "dropdown-options" ).replaceWith( optgroups );
                    }

                    $$position( optgroups, {
                        x: "center",
                        y: "bottom",
                        copyWidth: true,
                        target: container
                    });
                });

                // DOM Events
                // ---------------------------------------------------------------------------------
                // Make sure clicks inside the dropdown element don't close itself
                element.on( "click", function( evt ) {
                    evt.stopPropagation();
                });

                // Close the dropdown when a click outside is detected
                $document.on( "click", function() {
                    scope.$safeApply( $dropdown.close );
                });
            };

            return definition;
        }
    ]);

    module.controller( "DropdownController", [
        "$scope",
        "$parse",
        "$attrs",
        "$q",
        function( $scope, $parse, $attrs, $q ) {
            var ctrl = this;
            var EMPTY_SEARCH = "";

            ctrl.rawOptions = [];
            ctrl.options = {};
            ctrl.items = [];
            ctrl.placeholder = null;
            ctrl.valueKey = null;
            ctrl.open = false;
            ctrl.search = EMPTY_SEARCH;
            ctrl.activeOption = null;

            $scope.$parent.$watch( $attrs.maxItems, function( maxItems ) {
                ctrl.maxItems = +maxItems || 1;
            });

            ctrl.isFull = function() {
                return ctrl.items.length >= ctrl.maxItems;
            };

            ctrl.addItem = function( item ) {
                var added = true;

                if ( ctrl.maxItems === 1 ) {
                    ctrl.items = [ item ];
                } else if ( !ctrl.isFull() && !ctrl.isSelected( item ) ) {
                    ctrl.items.push( item );
                } else {
                    added = false;
                }

                // Do we successfully added an item?
                if ( added ) {
                    // Find an available option to activate
                    ctrl.activeOption = ctrl.findAvailableOption( item );
                }

                if ( ctrl.isFull() ) {
                    ctrl.close();
                }

                $scope.$safeApply();
            };

            ctrl.close = function() {
                ctrl.open = false;
                clearSearch();
            };

            ctrl.isSelected = function( value ) {
                return !!~ctrl.items.indexOf( value );
            };

            ctrl.findAvailableOption = function( item ) {
                var options = ctrl.rawOptions;
                var index = options.indexOf( item );
                var movement = index === options.length - 1 ? -1 : 1;

                if ( ctrl.maxItems === 1 ) {
                    return item;
                }

                do {
                    index += movement;
                    item = options[ index ];
                } while ( ctrl.isSelected( item ) );

                return item;
            };

            ctrl.parseOptions = function( ngRepeat, groupingExpr ) {
                var currPromise;
                var groupBy = $parse( groupingExpr );

                $scope.$watch( ngRepeat.expr, function watchFn( value ) {
                    var promise;
                    currPromise = null;

                    if ( value == null ) {
                        ctrl.options = {};
                        ctrl.rawOptions = [];
                        return;
                    }

                    promise = $q.when( value ).then(function( options ) {
                        var activeKey;
                        var isArray = ng.isArray( options );

                        if ( promise !== currPromise ) {
                            return;
                        } else if ( !isArray && !ng.isObject( options ) ) {
                            throw new Error( "Dropdown options should be array or object!" );
                        }

                        ctrl.options = {};

                        ng.forEach( options, function( option, key ) {
                            var group;
                            var locals = {};
                            locals.$dropdown = ctrl;
                            locals[ ngRepeat.key ] = !isArray ? key : null;
                            locals[ ngRepeat.item ] = option;

                            group = groupBy( $scope, locals );
                            group = group == null ? "" : group.toString().trim();
                            ctrl.options[ group ] = ctrl.options[ group ] || ( isArray ? [] : {} );

                            if ( isArray ) {
                                ctrl.options[ group ].push( option );
                            } else {
                                ctrl.options[ group ][ key ] = option;
                            }
                        });

                        // Sort the options object by keys
                        ctrl.options = sortByKeys( ctrl.options );
                        ctrl.rawOptions = extractOptions( ctrl.options );

                        activeKey = isArray ? 0 : Object.keys( options )[ 0 ];
                        ctrl.activeOption = ctrl.rawOptions[ activeKey ];
                    });

                    currPromise = promise;
                }, true );
            };

            function clearSearch() {
                ctrl.search = EMPTY_SEARCH;
            }

            function sortByKeys( obj ) {
                var ret = {};
                ng.forEach( Object.keys( obj ).sort(), function( key ) {
                    ret[ key ] = obj[ key ];
                });

                return ret;
            }

            function extractOptions( groups ) {
                var ret = [];
                ng.forEach( groups, function( options ) {
                    ret = ret.concat( options );
                });

                return ret;
            }
        }
    ]);

    module.directive( "dropdownItems", [
        "$compile",
        function( $compile ) {
            var definition = {};

            definition.restrict = "EA";
            definition.replace = true;
            definition.transclude = true;
            definition.templateUrl = "templates/dropdown/items.html";
            definition.require = "^dropdown";

            definition.link = function( scope, element, attr, $dropdown, transclude ) {
                transclude(function( childs ) {
                    element.append( childs );
                });

                element.attr( "ng-repeat", "item in $dropdown.items" );
                $compile( element )( scope );

                attr.$observe( "placeholder", function( placeholder ) {
                    $dropdown.placeholder = placeholder;
                });
            };

            return definition;
        }
    ]);

    module.directive( "dropdownOptions", [
        "$compile",
        "repeatParser",
        "dropdownConfig",
        function( $compile, repeatParser, dropdownConfig ) {
            var definition = {};

            definition.restrict = "EA";
            definition.replace = true;
            definition.transclude = true;
            definition.templateUrl = "templates/dropdown/options.html";
            definition.require = "^dropdown";

            definition.compile = function( tElement ) {
                // When in a detached case, we won't let compile go ahead
                if ( !tElement.parent().length ) {
                    return;
                }

                return definition.link;
            };

            definition.link = function( scope, element, attr, $dropdown, transclude ) {
                var list = element[ 0 ];
                var optgroup = element.querySelector( ".dropdown-optgroup" );
                var option = element.querySelector( ".dropdown-option" );
                var repeat = repeatParser.parse( attr.options );

                // If we have a repeat expr, let's use it to build the option list
                if ( repeat ) {
                    $dropdown.parseOptions( repeat, attr.groupBy );

                    // Option list building
                    transclude(function( childs ) {
                        option.append( childs );
                    });

                    // Create optgroup's ng-repeat expression
                    optgroup.attr( "ng-repeat", "(group, options) in $dropdown.options" );
                    optgroup.attr( "ng-class", "{" +
                        "'dropdown-optgroup-ungrouped': group === ''" +
                    "}" );

                    // Update repeat expression for options, making them use groups
                    repeat.expr = "options";
                    option.attr( "ng-repeat", repeatParser.toNgRepeat( repeat ) );

                    // Add a few other directives to the option...
                    option.attr( "ng-click", "$dropdown.addItem( " + repeat.item + " )" );
                    option.attr( "ng-class", "{" +
                        "active: $dropdown.activeOption === " + repeat.item + "," +
                        "disabled: $dropdown.maxItems > 1 &&" +
                        "          $dropdown.isSelected( " + repeat.item + " )" +
                    "}" );

                    // ...and compile it
                    $compile( optgroup )( scope );
                }

                // Configure the overflow for this list
                configureOverflow();

                // Set the value key
                $dropdown.valueKey = attr.value || null;

                // Scope Watches
                // ---------------------------------------------------------------------------------
                scope.$watch( "$dropdown.open", adjustScroll );
                scope.$watch( "$dropdown.activeOption", adjustScroll );

                // Functions
                // ---------------------------------------------------------------------------------
                function adjustScroll() {
                    var fromScrollTop;
                    var options = $dropdown.rawOptions;
                    var scrollTop = list.scrollTop;
                    var index = options.indexOf( $dropdown.activeOption );
                    var activeElem = list.querySelectorAll( ".dropdown-option" )[ index ];

                    if ( !$dropdown.open || !activeElem ) {
                        // To be handled!
                        return;
                    }

                    fromScrollTop = activeElem.offsetTop - list.scrollTop;

                    // If the option is above the current scroll, we'll make it appear on the
                    // top of the scroll.
                    // Otherwise, it'll appear in the end of the scroll view.
                    if ( fromScrollTop < 0 ) {
                        scrollTop = activeElem.offsetTop;
                    } else if ( list.clientHeight <= fromScrollTop + activeElem.clientHeight ) {
                        scrollTop = activeElem.offsetTop +
                                    activeElem.clientHeight -
                                    list.clientHeight;
                    }

                    list.scrollTop = scrollTop;
                }

                function configureOverflow() {
                    var height;
                    var view = list.ownerDocument.defaultView;
                    var styles = view.getComputedStyle( list, null );
                    var display = element.css( "display" );
                    var size = dropdownConfig.optionsPageSize;
                    var li = $( "<li class='dropdown-option'>&nbsp;</li>" )[ 0 ];
                    element.prepend( li );

                    // Temporarily show the element, just to calculate the li height
                    element.css( "display", "block" );

                    // Calculate the height, considering border/padding
                    height = li.clientHeight * size;
                    height = [ "padding", "border" ].reduce(function( value, prop ) {
                        var top = styles.getPropertyValue( prop + "-top" ) || "";
                        var bottom = styles.getPropertyValue( prop + "-bottom" ) || "";

                        value += +top.replace( "px", "" ) || 0;
                        value += +bottom.replace( "px", "" ) || 0;

                        return value;
                    }, height );

                    // Set overflow CSS rules
                    element.css({
                        "overflow-y": "auto",
                        "max-height": height + "px"
                    });

                    // And finally, set the element display to the previous value
                    element.css( "display", display );

                    // Also remove the dummy <li> created previously
                    $( li ).remove();
                }
            };

            return definition;
        }
    ]);

    module.directive( "dropdownContainer", [
        "keycodes",
        function( keycodes ) {
            var definition, keyCallbacks;

            // -------------------------------------------------------------------------------------

            keyCallbacks = {};
            keyCallbacks[ keycodes.BACKSPACE ] = handleBackspace;
            keyCallbacks[ keycodes.TAB ] = handleTabEsc;
            keyCallbacks[ keycodes.ESCAPE ] = handleTabEsc;
            keyCallbacks[ keycodes.ARROWUP ] = handleKeyNav;
            keyCallbacks[ keycodes.ARROWDOWN ] = handleKeyNav;
            keyCallbacks[ keycodes.PGUP ] = handleKeyNav;
            keyCallbacks[ keycodes.PGDOWN ] = handleKeyNav;
            keyCallbacks[ keycodes.ENTER ] = handleEnter;

            // -------------------------------------------------------------------------------------

            definition = {};
            definition.restrict = "C";
            definition.require = "^dropdown";
            definition.link = function( scope, element, attr, $dropdown ) {
                var input = element.querySelector( ".dropdown-input input" );

                // Scope Watchers
                // ---------------------------------------------------------------------------------
                scope.$watch( "$dropdown.search", function( search ) {
                    if ( search && !$dropdown.isFull() ) {
                        $dropdown.open = true;
                    }
                });

                scope.$watchCollection( "$dropdown.items", function() {
                    fixInputWidth( $dropdown, element, input );
                });

                // DOM Events
                // ---------------------------------------------------------------------------------
                element.on( "click", function() {
                    input[ 0 ].focus();
                });

                input.on( "focus", function() {
                    var full = $dropdown.isFull();

                    // Only open the options list if:
                    // 1. It's not full
                    // 2. It's full but is a single selection dropdown
                    if ( !full || ( full && $dropdown.maxItems === 1 ) ) {
                        $dropdown.open = true;
                    }

                    scope.$safeApply();
                });

                input.on( "keydown", function( evt ) {
                    var typed;
                    var key = evt.keyCode;
                    var cb = keyCallbacks[ key ];

                    if ( ng.isFunction( cb ) ) {
                        return cb( evt, scope, $dropdown );
                    }

                    // Disable searching when dropdown is full
                    typed = hasCharLength( key );
                    if ( typed && !evt.ctrlKey && $dropdown.isFull() ) {
                        return evt.preventDefault();
                    }
                });

                input.on( "keydown", function() {
                    fixInputWidth( $dropdown, element, input );
                });
            };

            return definition;

            // -------------------------------------------------------------------------------------

            function fixInputWidth( $dropdown, element, input ) {
                var textWidth;
                var inputWrapper = element.querySelector( ".dropdown-input" );
                var inputHelper = element.querySelector( ".dropdown-input-helper" );

                if ( !$dropdown.items.length ) {
                    inputWrapper.css( "width", "100%" );
                    return;
                }

                // Find the width of the input string
                inputHelper.text( input.val() ).css( "display", "inline" );
                textWidth = inputHelper[ 0 ].getBoundingClientRect().width;

                // Use the width found before and add some room to avoid a flash of
                // overflow in the input
                inputWrapper.css( "width", "calc( " + textWidth + "px + 1em )" );

                inputHelper.css( "display", "none" );
            }

            function hasCharLength( key ) {
                var str = String.fromCharCode( key );
                return str.trim().length || /\s/.test( str );
            }

            function handleBackspace( evt, scope, $dropdown ) {
                // If some search is available, backspace action should be delete the last char
                if ( $dropdown.search ) {
                    return;
                }

                // Is ctrl key is pressed?
                // If yes, we'll remove all selected items;
                // Otherwise, we'll just pop the last item.
                if ( evt.ctrlKey ) {
                    $dropdown.items.splice( 0 );
                } else {
                    $dropdown.items.pop();
                }

                scope.$safeApply();
            }

            function handleKeyNav( evt, scope, $dropdown ) {
                var limit, movement, originalMovement, method, index, noActiveOption;
                var options = $dropdown.rawOptions;
                var active = $dropdown.activeOption;
                var singleSelection = $dropdown.maxItems === 1;

                if ( !$dropdown.open ) {
                    $dropdown.open = true;
                    scope.$safeApply();

                    return;
                }

                index = options.indexOf( active );
                if ( index < 0 ) {
                    index = 0;
                    active = options[ 0 ];
                }

                evt.preventDefault();

                // Determine which movement to do.
                switch ( evt.keyCode ) {
                    case keycodes.ARROWUP:
                        movement = -1;
                        break;

                    case keycodes.ARROWDOWN:
                        movement = 1;
                        break;

                    case keycodes.PGUP:
                        movement = -4;
                        break;

                    case keycodes.PGDOWN:
                        movement = 4;
                        break;
                }

                originalMovement = movement;
                limit = movement < 0 ? 0 : options.length - 1;
                method = movement < 0 ? "max" : "min";

                do {
                    index = Math[ method ]( limit, index + movement );

                    // If we were originally:
                    // - moving up by a page, then increase the option index;
                    // - moving up by one, then decrease the option index;
                    // - moving down by a page, then decrease the option index;
                    // - moving down by one, then increase the option index.
                    if ( originalMovement > 1 ) {
                        movement = -1;
                    } else if ( originalMovement < -1 ) {
                        movement = 1;
                    } else {
                        movement = originalMovement > 0 ? 1 : -1;
                    }

                    active = options[ index ];

                    // One single item is allowed to be selected? Then this is a good option to be
                    // used as the active one.
                    if ( singleSelection ) {
                        break;
                    }

                    // If:
                    // - this isn't the first iteration;
                    // - and we're moving by one;
                    // - and the found index is equal to the limit for this movement;
                    // them we've reached the last navigable option for this movement.
                    // So, we'll break here to stop an endless loop.
                    if ( limit === index && noActiveOption != null && Math.abs( movement ) === 1 ) {
                        break;
                    }

                    // In order to continue looping, the found option must not be the already
                    // selected option and must be selected.
                    noActiveOption = active !== $dropdown.activeOption;
                    noActiveOption &= $dropdown.isSelected( active );
                } while ( noActiveOption );

                if ( $dropdown.isSelected( active ) && !singleSelection ) {
                    return;
                }

                if ( active !== $dropdown.activeOption ) {
                    $dropdown.activeOption = active;
                    scope.$safeApply();
                }
            }

            function handleEnter( evt, scope, $dropdown ) {
                evt.preventDefault();

                if ( $dropdown.open ) {
                    $dropdown.addItem( $dropdown.activeOption );
                } else {
                    $dropdown.open = true;
                }

                scope.$safeApply();
            }

            function handleTabEsc( evt, scope, $dropdown ) {
                // If it's not already blurring via tab, will do this now
                if ( evt.keyCode !== keycodes.TAB ) {
                    evt.target.blur();
                }

                scope.$safeApply( $dropdown.close );
            }
        }
    ]);

}( angular );
!function( ng ) {
    "use strict";

    var $ = ng.element;
    var module = ng.module( "frontkit.offcanvas", [] );

    module.value( "offcanvasConfig", {
        swipeThreshold: 30
    });

    module.directive( "offcanvas", [
        "$parse",
        "$window",
        "$document",
        "swipeManager",
        function( $parse, $window, $document, swipeManager ) {
            var body = $document.find( "body" );

            return function( scope, element, attrs ) {
                var expr = $parse( attrs.offcanvas );
                var targetScreen = attrs.targetScreen;

                // Scope Watches
                // ---------------------------------------------------------------------------------
                scope.$watch( runTests, activateOffcanvas, true );

                // DOM Events
                // ---------------------------------------------------------------------------------
                $( $window ).on( "resize", function() {
                    // Try to activate the offcanvas by emulating Angular's scope.$watch, which
                    // provides its callback the current and the previous value.
                    activateOffcanvas( runTests(), runTests.prevResult );
                });

                // Wait for clicks in the body, and set the activation expression to false if
                // possible
                body.on( "click", function() {
                    if ( expr( scope ) ) {
                        try {
                            expr.assign( scope, false );
                            scope.$apply();
                        } catch ( e ) {}
                    }
                });

                swipeManager(function( opening ) {
                    var tests;

                    try {
                        expr.assign( scope, opening );
                    } catch ( e ) {}

                    tests = runTests();
                    tests.active = opening;

                    activateOffcanvas( tests, runTests.prevResult );
                });

                // Functions
                // ---------------------------------------------------------------------------------
                function runTests() {
                    var testElem = runTests.screenTestElement;

                    // Test right away the offcanvas activation expression
                    var result = {
                        active: !!expr( scope )
                    };

                    // Do we have a test element?
                    if ( !testElem ) {
                        // If we don't have a test element, let's create it
                        testElem = runTests.screenTestElement = $( "<div></div>" );
                        testElem.addClass( "show-" + targetScreen );
                    }

                    // Attach the element, test its display, and detach it again
                    body.append( testElem );
                    result.screen = testElem.style( "display" ) !== "none";
                    testElem.remove();

                    return result;
                }

                function activateOffcanvas( currTests, prevTests ) {
                    var active = currTests.screen && currTests.active;

                    if ( currTests.screen ) {
                        // If the offcanvas was/is active, we must show it in order to transitions
                        // show correctly.
                        // In all other cases, we can hard set it to none, so eg. if we're resizing
                        // the window and the element isn't active yet, it will not be shown right
                        // away.
                        element.css( "display",
                            prevTests.active || currTests.active ?
                                "block" :
                                "none"
                        );
                    } else {
                        // Reset to the original display value
                        element[ 0 ].style.display = "";
                    }

                    body.toggleClass( "offcanvas", currTests.screen );
                    element.toggleClass( "offcanvas-menu", currTests.screen );

                    // By using a timeout, we allow .offcanvas to be added, so transitions can
                    // happen normally
                    setTimeout(function() {
                        body.toggleClass( "offcanvas-active", active );
                        element.toggleClass( "offcanvas-menu-active", active );
                    }, 0 );

                    // Save the current result as the previous one!
                    runTests.prevResult = currTests;
                }
            };
        }
    ]);

    module.factory( "swipeManager", [
        "$injector",
        "$document",
        "offcanvasConfig",
        function( $injector, $document, offcanvasConfig ) {
            var $swipe;
            try {
                $swipe = $injector.get( "$swipe" );
            } catch ( e ) {}

            return function( callback ) {
                var lastSwipe;

                if ( !$swipe ) {
                    return;
                }

                $swipe.bind( $document, {
                    start: function( coords ) {
                        lastSwipe = coords;
                    },
                    end: function( coords ) {
                        var dist = coords.x - lastSwipe.x;
                        var direction = dist > 0 ? "right" : "left";

                        // Do we have swiped enough to do the callback?
                        if ( Math.abs( dist ) > offcanvasConfig.swipeThreshold ) {
                            callback( direction === "right" ? true : false );
                        }
                    }
                });
            };
        }
    ]);

}( angular );
!function( ng ) {
    "use strict";

    var $ = ng.element;
    var module = ng.module( "frontkit.position", [] );

    var debounce = function( fn, wait ) {
        var timeout;

        return function() {
            var ctx = this;
            var args = arguments;
            clearTimeout( timeout );

            timeout = setTimeout(function() {
                fn.apply( ctx, args );
            }, wait );
        };
    };

    module.provider( "$$position", function() {
        var provider = {};
        var getPosition = function( axis, pos ) {
            var regexp = getPosition[ axis ];
            return regexp.test( pos ) ? pos : provider.defaults[ axis ];
        };
        getPosition.x = /^left|center|right$/;
        getPosition.y = /^top|center|bottom$/;

        provider.defaults = {
            x: "center",
            y: "center"
        };

        provider.repositionDelay = 10;

        provider.$get = function( $window ) {
            var elements = [];
            var getRect = function( element ) {
                var options = element.data( module.name );
                var targetRect = options.target[ 0 ].getBoundingClientRect();
                var selfRect = element[ 0 ].getBoundingClientRect();

                return {
                    target: targetRect,
                    self: selfRect
                };
            };

            var reposition = function( rect, element ) {
                var top, left;
                var options = element.data( module.name );
                var width = options.copyWidth ? rect.target.width : rect.self.width;
                var height = options.copyHeight ? rect.target.height : rect.self.height;

                if ( options.copyWidth ) {
                    element.css( "width", width + "px" );
                }

                if ( options.copyHeight ) {
                    element.css( "height", height + "px" );
                }

                switch ( options.x ) {
                    case "left":
                        left = rect.target.left - rect.self.width;
                        break;

                    case "center":
                        left = rect.target.left + ( rect.target.width / 2 ) - ( width / 2 );
                        break;

                    case "right":
                        left = rect.target.right;
                        break;
                }

                switch ( options.y ) {
                    case "top":
                        top = rect.target.top - rect.self.height;
                        break;

                    case "center":
                        top = rect.target.top + ( rect.target.height / 2 ) - ( height / 2 );
                        break;

                    case "bottom":
                        top = rect.target.bottom;
                        break;
                }

                element.css({
                    position: "fixed",
                    top: top + "px",
                    left: left + "px",
                    right: "auto",
                    bottom: "auto",
                    "z-index": ( +options.target.style( "z-index" ) || 0 ) + 1
                });
            };

            $( $window ).on( "resize scroll", debounce(function() {
                elements.forEach(function( element ) {
                    reposition( getRect( element ), element );
                });
            }, provider.repositionDelay ) );

            return function( element, options ) {
                element = $( element );

                options = options || {};
                options.target = $( options.target );

                if ( !element.length || !options.target.length ) {
                    return;
                }

                options.x = getPosition( "x", options.x );
                options.y = getPosition( "y", options.y );
                element.data( module.name, options );

                elements.push( element );
                element.on( "$destroy", function() {
                    elements.splice( elements.indexOf( element ), 1 );
                });

                element.scope().$watch(function() {
                    return getRect( element );
                }, function( rect ) {
                    reposition( rect, element );
                }, true );
            };
        };

        return provider;
    });
}( angular );
!function( ng ) {
    "use strict";

    var $ = ng.element;
    var module = ng.module( "frontkit.tooltip", [] );

    module.directive( "tooltip", [
        "$document",
        "$interpolate",
        function( $document, $interpolate ) {
            var definition = {};
            var tooltip = $( "<span>" ).addClass( "tooltip" );
            $document.find( "body" ).append( tooltip );

            definition.priority = 1000;
            definition.compile = function( tElem, tAttrs ) {
                var title = $interpolate( tAttrs.title );

                // We shouldn't remove the attribute because if tooltip is applied in a <abbr>,
                // for example, the styles (which are required to demonstrate something) would
                // be lost.
                tAttrs.$set( "title", "" );

                return function( scope, element ) {
                    var timeout;

                    element.on( "mouseenter", function() {
                        // Schedule showing the tooltip after 300 ms
                        timeout = setTimeout( function() {
                            var text = title( scope ).trim();
                            var rect = element[ 0 ].getBoundingClientRect();
                            timeout = null;

                            // If one of these is the case, no tooltip will be shown:
                            // 1. no text
                            // 2. no parent element (meaning the element is no longer in the DOM)
                            if ( !text || !element.parent().length ) {
                                return;
                            }

                            // Update the tooltip content, show it and position it
                            tooltip.text( text ).addClass( "visible" );
                            tooltip.css({
                                top: rect.bottom + "px",
                                left: rect.left + ( rect.width / 2 ) + "px"
                            });

                            // When the element is destroyed, also trigger mouseleave event,
                            // so the tooltip is surely hidden
                            element.on( "$destroy", function destroyCb() {
                                element.triggerHandler( "mouseleave" );
                                element.off( "$destroy", destroyCb );
                            });
                        }, 300 );
                    });

                    element.on( "mouseleave", function() {
                        // If the timeout for showing the tooltip has not been triggered yet,
                        // let's ensure that this doesn't happen by clearing it
                        if ( timeout ) {
                            clearTimeout( timeout );
                            timeout = null;
                            return;
                        }

                        // ...otherwise, just remove .visible from the element
                        tooltip.removeClass( "visible" );
                    });
                };
            };

            return definition;
        }
    ]);
}( angular );
!function( ng ) {
    "use strict";

    var $ = ng.element;
    var module = ng.module( "frontkit.utils", [] );

    module.constant( "keycodes", {
        BACKSPACE: 8,
        TAB: 9,
        ENTER: 13,
        ESCAPE: 27,
        SPACE: 32,
        PGUP: 33,
        PGDOWN: 34,
        ARROWLEFT: 37,
        ARROWUP: 38,
        ARROWRIGHT: 39,
        ARROWDOWN: 40
    });

    module.config([
        "$provide",
        function( $provide ) {
            // Function to help determine if a variable is a valid type for an Angular expression
            // This means only strings (because they'll be evaluated) and functions (because they're
            // executable)
            var isExpr = function( expr ) {
                return typeof expr === "string" || ng.isFunction( expr );
            };

            $provide.decorator( "$rootScope", function( $delegate ) {
                $delegate.$safeApply = function( scope, expr ) {
                    var parent;

                    // Is the first arg an expression? If so, we'll use $rootScope as our scope of
                    // choice for triggering the digest
                    if ( isExpr( scope ) ) {
                        expr = scope;
                        scope = $delegate;
                    }

                    // If no scope was passed, fallback to $rootScope
                    scope = scope || $delegate;

                    // Eval the expression, if there's any
                    if ( isExpr( expr ) ) {
                        scope.$eval( expr );
                    }

                    // Find out if one of the parent scopes is in a phase
                    parent = scope;
                    while ( parent ) {
                        // Is this scope is in a phase, we need to return now
                        if ( parent.$$phase ) {
                            return;
                        }

                        parent = parent.$parent;
                    }

                    // Finally apply if no parent scope is in a phase
                    scope.$apply();
                };

                return $delegate;
            });
        }
    ]);

    module.service( "repeatParser", function() {
        var self = this;

        // RegExp directly taken from Angular.js ngRepeat source
        // https://github.com/angular/angular.js/blob/v1.2.16/src/ng/directive/ngRepeat.js#L211
        var exprRegex = /^\s*([\s\S]+?)\s+in\s+([\s\S]+?)(?:\s+track\s+by\s+([\s\S]+?))?\s*$/;
        var itemRegex = /^(?:([\$\w]+)|\(([\$\w]+)\s*,\s*([\$\w]+)\))$/;

        self.parse = function( expr ) {
            var lhs, rhs, trackBy, key, item;
            var match = ( expr || "" ).match( exprRegex );

            if ( !match ) {
                return;
            }

            lhs = match[ 1 ];
            rhs = match[ 2 ];
            trackBy = match[ 3 ];

            match = lhs.match( itemRegex );
            if ( !match ) {
                return;
            }

            item = match[ 3 ] || match[ 1 ];
            key = match[ 2 ];

            return {
                key: key,
                item: item,
                expr: rhs,
                trackBy: trackBy
            };
        };

        self.toNgRepeat = function( obj ) {
            var lhs = obj.key ? "(" + obj.key + ", " + obj.item + ")" : obj.item;
            var trackBy = obj.trackBy ? " track by " + obj.trackBy : "";

            return lhs + " in " + obj.expr + trackBy;
        };
    });

    // Extensions to jQLite
    $.prototype.querySelector = function( str ) {
        return $( this[ 0 ].querySelector( str ) );
    };

    $.prototype.querySelectorAll = function( str ) {
        return $( this[ 0 ].querySelectorAll( str ) );
    };

    $.prototype.style = function( prop ) {
        var view = this[ 0 ].ownerDocument.defaultView;
        var styles = view.getComputedStyle( this[ 0 ], null );

        return styles.getPropertyValue( prop );
    };

}( angular );
angular.module('frontkit').run(['$templateCache', function($templateCache) {
  'use strict';

  $templateCache.put('templates/dropdown/dropdown.html',
    "<div class=\"dropdown\" ng-class=\"{\n" +
    "    open: $dropdown.open,\n" +
    "    'dropdown-single': $dropdown.maxItems === 1,\n" +
    "    'dropdown-multi': $dropdown.maxItems > 1,\n" +
    "    'dropdown-fulfilled': $dropdown.items.length\n" +
    "}\">\n" +
    "    <div class=\"dropdown-container\">\n" +
    "        <div class=\"dropdown-input\">\n" +
    "            <span class=\"dropdown-input-helper\"></span>\n" +
    "            <input type=\"text\" ng-model=\"$dropdown.search\"\n" +
    "                   placeholder=\"{{ $dropdown.items.length ? null : $dropdown.placeholder }}\">\n" +
    "        </div>\n" +
    "\n" +
    "        <span class=\"dropdown-caret\"></span>\n" +
    "    </div>\n" +
    "\n" +
    "    <dropdown-options></dropdown-options>\n" +
    "</div>"
  );

}]);

angular.module('frontkit').run(['$templateCache', function($templateCache) {
  'use strict';

  $templateCache.put('templates/dropdown/items.html',
    "<div class=\"dropdown-item\"></div>"
  );

}]);

angular.module('frontkit').run(['$templateCache', function($templateCache) {
  'use strict';

  $templateCache.put('templates/dropdown/options.html',
    "<ul class=\"dropdown-optgroups\">\n" +
    "    <li class=\"dropdown-optgroup\">\n" +
    "        <span class=\"dropdown-optgroup-label\" ng-show=\"group\">{{ group }}</span>\n" +
    "        <ul class=\"dropdown-options\">\n" +
    "            <li class=\"dropdown-option\"></li>\n" +
    "        </ul>\n" +
    "    </li>\n" +
    "</ul>"
  );

}]);
