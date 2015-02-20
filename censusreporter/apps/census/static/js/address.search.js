L.mapbox.accessToken = 'pk.eyJ1IjoiY2Vuc3VzcmVwb3J0ZXIiLCJhIjoiQV9hS01rQSJ9.wtsn0FwmAdRV7cckopFKkA';
var GEOCODE_URL = _("http://api.tiles.mapbox.com/v4/geocode/mapbox.places/<%=query%>.json?access_token=<%=token%>").template()
var REVERSE_GEOCODE_URL = _("http://api.tiles.mapbox.com/v4/geocode/mapbox.places/<%=lng%>,<%=lat%>.json?access_token=<%=token%>").template()

var geoSearchAPI = 'http://api.censusreporter.org/1.0/geo/search';

var place_template = _.template($("#place-result-template").html())

var lat = '',
    lng = '',
    address = '',
    point_marker = null;

// prepare spinner
$('body').append('<div id="body-spinner"></div>');
var spinnerTarget = document.getElementById('body-spinner');
    spinner = new Spinner();

// perhaps leave out the map on small viewports?
if (!(lat && lng)) {
    lat = '42.02';
    lng = '-87.67';
}
var map_center = new L.latLng(lat, lng);
window.map = L.mapbox.map('slippy-map', 'censusreporter.map-j9q076fv', {
    center: map_center,
    zoom: 13,
    scrollWheelZoom: true,
    zoomControl: false,
    doubleClickZoom: false,
    boxZoom: true,
    keyboard: true,
    dragging: true,
    touchZoom: true
});

map.addControl(new L.Control.Zoom({
    position: 'topright'
}));

function processGeocoderResults(response) {
    var results = response.features;
    results = _.filter(results, function(item) { return item.geometry.type == "Point" && item.id.indexOf('address.') == 0; });
    results = _.map(results, function(item) { 
        item.place_name = item.place_name.replace(", United States", ""); 
        return item;
    });
    return results;
}

var addressSearchEngine = new Bloodhound({
    datumTokenizer: Bloodhound.tokenizers.whitespace,
    queryTokenizer: Bloodhound.tokenizers.whitespace,
    limit: 10,
    remote: {
        url: GEOCODE_URL,
        replace: function (url, query) {
            return url({query: query, token: L.mapbox.accessToken});
        },
        filter: processGeocoderResults
    }
});
addressSearchEngine.initialize();

function selectAddress(obj, datum) {
    $("#address-search").val("");
    if (datum.geometry) {
        var label = datum.place_name.replace(", United States", "");
        var lng = datum.geometry.coordinates[0];
        var lat = datum.geometry.coordinates[1];
        setMap(lat, lng);
        findPlaces(lat, lng, label);
        placeMarker(lat, lng, label);
    } else {
        return false;
    }
}

function makeAddressSearchWidget(element) {
    element.typeahead('destroy');
    element.typeahead({
        autoselect: true,
        highlight: false,
        hint: false,
        minLength: 3
    }, {
        name: 'addresses',
        displayKey: 'place_name',
        source: addressSearchEngine.ttAdapter(),
        templates: {
            suggestion: Handlebars.compile(
                '<p class="result-name">{{place_name}}</p>'
            )
        }
    });

    element.on('typeahead:selected', selectAddress);
}

makeAddressSearchWidget($("#address-search"));

function basicLabel(lat,lng) {
    if (!lng) {
        lng = lat.lng;
        lat = lat.lat;
    }
    return lat.toFixed(2) + ", " + lng.toFixed(2);
}
map.on("dblclick",function(evt) { 
    var lat = evt.latlng.lat, lng = evt.latlng.lng;
    placeMarker(lat, lng)
    findPlaces(lat, lng);
})
if (navigator.geolocation) {
    $("#use-location").on("click",function() {
        $("#address-search-message").hide();
        spinner.spin(spinnerTarget);
        function foundLocation(position) {
            spinner.stop();
            lat = position.coords.latitude;
            lng = position.coords.longitude;
            setMap(lat,lng);
            placeMarker(lat,lng);
            findPlaces(lat, lng)
        }

        function noLocation() { 
            spinner.stop();
            $("#address-search-message").html('Sorry, your browser was unable to determine your location.'); 
            $("#address-search-message").show(); 
        }

        navigator.geolocation.getCurrentPosition(foundLocation, noLocation, {timeout:10000});

    })
} else {
    $("#use-location").hide();    
}

function labelWithReverse(point_marker) { 
    var ll = point_marker.getLatLng();
    var url = REVERSE_GEOCODE_URL({lat: ll.lat, lng: ll.lng, token: L.mapbox.accessToken});
    $.getJSON(url,function(data, status) {
        if (status == 'success' && data.features) {
            var results = processGeocoderResults(data);
            if (results.length > 0) {
                var label = data.features[0].place_name.replace(", United States", "");
                point_marker.getLabel().setContent(label);
                // seems like we also always want to update the address-search-message here, 
                // but we may also want to do that when we don't have a map. Tidy this later
                $("#address-search-message").html(label + " is in:");
                $("#address-search-message").show();

            }
        }
    });
}

function geocodeAddress(query, callback) {
    var url = GEOCODE_URL({query: query, token: L.mapbox.accessToken});
    $.getJSON(url, callback);
}

var POLYGON_STYLE = {
    "clickable": true,
    "color": "#00d",
    "fillColor": "#ccc",
    "weight": 1.0,
    "opacity": 0.3,
    "fillOpacity": 0.5,
}

function makeLayer(d) {
    var layer = L.geoJson(d.geom,{style: POLYGON_STYLE})
    layer.bindLabel(d.full_name, {noHide: true, direction: 'auto'});
    layer.on('mouseover', function() {
        layer.setStyle({
            "fillOpacity": 0.7,
        });
    });
    layer.on('mouseout', function() {
        layer.setStyle(POLYGON_STYLE);
    });
    layer.on('click', function() {
        window.location.href = '/profiles/' + d.full_geoid;
    });
    return layer;
}
function findPlaces(lat,lng,address) {
    spinner.spin(spinnerTarget);
    $(".location-list").hide();

    if (address) {
        $("#address-search-message").html(address + " is in:");
        $("#address-search-message").show();
    } else {
        $("#address-search-message").html("Your location: " + basicLabel(lat,lng));
        $("#address-search-message").show();
    }

    params = { 'lat': lat, 'lon': lng, 'sumlevs': '010,020,030,040,050,060,140,160,250,310,400,500,610,620,860,950,960,970', geom: true }
    $.getJSON(geoSearchAPI,params, function(data, status) {
        spinner.stop();
        if (status == 'success') {
            window.PLACE_LAYERS = {}
            $("#data-display").html("");
            var list = $("<ul class='location-list'></ul>");
            list.appendTo($("#data-display"));

            var results = _.sortBy(data.results,function(x){ return sumlevMap[x.sumlevel].size_sort });
            for (var i = 0; i < results.length; i++) {
                var d = results[i];
                d['SUMLEVELS'] = sumlevMap;
                $(place_template(d)).appendTo(list);
                window.PLACE_LAYERS[d['full_geoid']] = 
                    makeLayer(d);
            }
            $('.location-list li').on('mouseover',function(evt) {
                var this_layer = $(evt.currentTarget).data('geoid');
                _(PLACE_LAYERS).each(function(v,k) {
                    if (k == this_layer) {
                        v.addTo(map);
                    } else {
                        map.removeLayer(v);
                    }
                });
            })
            $('.zoom-to-layer').click(function() {
                var geoid = $(this).parent().data('geoid');
                if (PLACE_LAYERS[geoid]) {
                    var layer = PLACE_LAYERS[geoid];
                    layer.addTo(map);
                    map.fitBounds(layer.getBounds());
                }
            });
            $('body').trigger('glossaryUpdate', list);
        } else {
            $("#data-display").html(status);
        }
    })
}

function placeMarker(lat, lng, label) {
    if (point_marker) {
        point_marker.setLatLng(L.latLng(lat,lng));
    } else {
        point_marker = new L.CircleMarker(L.latLng(lat,lng),{ fillColor: "#66c2a5", fillOpacity: 1, stroke: false, radius: 5});
        point_marker.on("drag",function(evt) {
            point_marker.hideLabel();
        })
        point_marker.on("dragend", function(evt) {
            window.stash = evt;
            var new_pos = evt.target.getLatLng();
            point_marker.getLabel().setContent(basicLabel(new_pos));
            point_marker.showLabel();
            labelWithReverse(point_marker);
            findPlaces(new_pos.lat, new_pos.lng);

        })
        map.addLayer(point_marker);
    }

    var reverse = (!label);

    if (reverse) {
        label = basicLabel(lat,lng)
    }
    if (point_marker.getLabel()) {
        point_marker.getLabel().setContent(label);
    } else {
        point_marker.bindLabel(label, {noHide: true});
    }
    point_marker.showLabel();
    if (reverse) {
        labelWithReverse(point_marker);
    }


}
function setMap(lat, lng) {
    if (map) {
        var map_center = new L.latLng(lat, lng);
        map.panTo(map_center);
    }
}

$(".location-list li").on("mouseover",function(){
    var geoid = $(this).data('geoid');
})

function init_from_params(params) {
    var lat = params.lat || '';
    var lng = params.lng || params.lon || '';
    var address = params.address || '';
    if (lat && lng) {
        lat = parseFloat(lat);
        lng = parseFloat(lng);
        if (!(isNaN(lat) || isNaN(lng))) {
            setMap(lat,lng);
            placeMarker(lat,lng, address);
            findPlaces(lat, lng, address);
        }
    } else if (address) {
        geocodeAddress(address, function(data) {
            var results = processGeocoderResults(data);
            if (results) {
                selectAddress(null,results[0]);
            } else {
                console.log("no results for " + address);
            }
        });
    }
}

init_from_params($.parseParams());
