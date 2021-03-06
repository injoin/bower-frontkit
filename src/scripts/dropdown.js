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